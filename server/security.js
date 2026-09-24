/* ShutterBlip — security.
 *
 * Three things every public server needs and the reference server did not
 * have: rate limiting, security headers, and one place where request input
 * is validated rather than trusted.
 *
 * None of this is exotic. It is the boring baseline that separates a server
 * you can put on the open internet from one you cannot.
 */
'use strict';

/* ---------------------------------------------------------------------
   RATE LIMITING
   A fixed-window counter per IP per bucket. Not as smooth as a sliding
   window, but it is O(1), needs no dependencies, and is more than enough
   to stop the things that actually happen: password guessing, signup
   floods, and someone hammering an endpoint to inflate ad numbers or
   scrape the leaderboard.

   The limits below are deliberately generous for real play and tight for
   abuse. A player cannot hit them by playing normally -- if they can, the
   limit is wrong and should be raised, because a rate limit that punishes
   real users is worse than none.
   --------------------------------------------------------------------- */
const BUCKETS = {
  auth:    { limit: 10,   windowMs: 60_000 },   // login/register/guest per minute
  write:   { limit: 120,  windowMs: 60_000 },   // shots, answers, duel results
  read:    { limit: 600,  windowMs: 60_000 },   // boards, config, polling
  ads:     { limit: 60,   windowMs: 60_000 },   // ad event batches
  admin:   { limit: 60,   windowMs: 60_000 }
};

const hits = new Map();   // `${bucket}:${ip}` -> {count, resetAt}

function rateLimit(bucket, ip){
  const cfg = BUCKETS[bucket] || BUCKETS.read;
  const key = bucket + ':' + ip;
  const now = Date.now();
  let e = hits.get(key);
  if (!e || e.resetAt <= now){
    e = { count: 0, resetAt: now + cfg.windowMs };
    hits.set(key, e);
  }
  e.count++;
  return {
    ok: e.count <= cfg.limit,
    remaining: Math.max(0, cfg.limit - e.count),
    retryAfter: Math.ceil((e.resetAt - now) / 1000)
  };
}

// Without this the Map grows one entry per IP forever.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
}, 120_000).unref();

/* WHOSE ADDRESS IS THIS, REALLY.

   The old version read the FIRST entry of X-Forwarded-For and said in a
   comment that the first entry is the one your own proxy wrote. That is
   backwards for the usual nginx idiom: `$proxy_add_x_forwarded_for`
   APPENDS the peer to whatever the client already sent, so the first entry
   is the client's invention and the last is the one your proxy added.

   The consequence, wherever that idiom is used: a client sends a fresh
   `X-Forwarded-For: 1.2.3.4` with every request and the rate limiter never
   sees the same "address" twice -- unlimited password guessing against
   both player login and the admin portal. The reverse is worse: send the
   admin's own address with six wrong passwords and lock them out of their
   own portal for half an hour, on repeat.

   So: this header is only read when TRUST_PROXY says a proxy is in front,
   and then it takes the LAST hop, which is the only entry the client could
   not have written. With TRUST_PROXY unset the header is ignored entirely
   and the socket address is used -- correct for a directly-exposed server,
   and the safe default for a misconfigured one.

   PRODUCTION behind nginx on the same box: set TRUST_PROXY=1. */
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
function clientIp(req){
  const peer = (req.socket && req.socket.remoteAddress) || '0.0.0.0';
  if (!TRUST_PROXY) return peer;
  const fwd = req.headers['x-forwarded-for'];
  if (!fwd) return peer;
  const hops = String(fwd).split(',').map(s => s.trim()).filter(Boolean);
  return hops.length ? hops[hops.length - 1] : peer;
}

/* ---------------------------------------------------------------------
   SECURITY HEADERS
   The Content-Security-Policy is the important one: even if an attacker
   found a way to inject markup, it blocks the script from running. It is
   deliberately tight, and lists exactly what this game legitimately needs.
   --------------------------------------------------------------------- */
function securityHeaders(res, { isHtml = false, allowGoogle = false } = {}){
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), interest-cohort=()');
  // Only meaningful over HTTPS; harmless otherwise. Two years, subdomains
  // included -- the value browsers want before they will preload you.
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');

  if (isHtml){
    const script = ["'self'", "'unsafe-inline'"];   // the game is one inline <script>
    const connect = ["'self'"];
    if (allowGoogle){
      script.push('https://accounts.google.com');
      connect.push('https://accounts.google.com');
    }
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      `script-src ${script.join(' ')}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      `connect-src ${connect.join(' ')}`,
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      allowGoogle ? "frame-src https://accounts.google.com" : "frame-src 'none'"
    ].join('; '));
  }
}

/* ---------------------------------------------------------------------
   INPUT VALIDATION
   Anything that arrives from a client is a string of unknown length until
   proven otherwise. These helpers make "reject it" the default and the
   easy path.
   --------------------------------------------------------------------- */
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const int = (v, min, max, dflt = null) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : dflt;
};
const num = (v, min, max, dflt = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : dflt;
};

const HANDLE_RX = /^[A-Za-z0-9_]{3,16}$/;
// Deliberately conservative. A rejected valid address is an annoyance; a
// stored malformed one breaks account recovery later.
const EMAIL_RX = /^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,24}$/;

const BAD_WORDS = /(fuck|shit|cunt|nigg|fag|bitch|whore|rape|admin|moderator|support|staff|official|shutterblip)/i;

function validHandle(h){
  if (!HANDLE_RX.test(h)) return 'Username: 3–16 letters, numbers or underscores.';
  if (BAD_WORDS.test(h)) return 'Pick a different username.';
  return null;
}
function validPassword(p){
  if (typeof p !== 'string' || p.length < 8) return 'Password needs 8 characters or more.';
  if (p.length > 200) return 'That password is too long.';
  return null;
}
function validEmail(e){
  if (!e) return null;                       // optional everywhere
  return EMAIL_RX.test(e) ? null : 'That email address does not look right.';
}

/* Body reader with a hard size cap. Without one, a single request claiming
   to be a gigabyte of JSON takes the whole server down. */
function readBody(req, maxBytes = 256 * 1024){
  return new Promise(resolve => {
    let data = '', size = 0, done = false;
    const finish = v => { if (!done){ done = true; resolve(v); } };
    req.on('data', c => {
      size += c.length;
      if (size > maxBytes){ finish({}); req.destroy(); return; }
      data += c;
    });
    req.on('end', () => {
      if (!data) return finish({});
      try { finish(JSON.parse(data)); }
      catch (e) {
        // the admin portal posts plain HTML forms, not JSON
        try {
          const p = new URLSearchParams(data), o = {};
          for (const [k, v] of p) o[k] = v;
          finish(o);
        } catch (e2) { finish({}); }
      }
    });
    req.on('error', () => finish({}));
  });
}

module.exports = {
  rateLimit, clientIp, securityHeaders,
  str, int, num, validHandle, validPassword, validEmail,
  HANDLE_RX, BAD_WORDS, readBody
};
