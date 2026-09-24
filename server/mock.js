#!/usr/bin/env node
/* ShutterBlip — reference server (in-memory, zero dependencies)
 *
 * This is SERVER.md made runnable. It is NOT production: everything lives in
 * memory and vanishes on restart, passwords are hashed but there is no rate
 * limiting or persistence, and camera scores are marked but not re-simulated.
 * What it IS: a working implementation of every endpoint the client calls,
 * so that
 *   1. you can see live 1v1 matchmaking work between two browser tabs today;
 *   2. whoever builds the real server has a reference for every request and
 *      response shape, with the tricky bits (the queue, the duel session, the
 *      practice gate, config flags) already written out.
 *
 * Run:   node server/mock.js            (serves the game at http://localhost:8787)
 *        PORT=3000 node server/mock.js
 * Then open the URL in two tabs, sign up as two different people, and go to
 * the DUEL tab in both.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');
const sec = require('./security.js');
const geo = require('./geo.js');

/* PERSISTENCE (opt-in, and the difference between a demo and a product).
   Run with PERSIST=1 and accounts survive restarts, stored in SQLite under
   ./data. Without it the server behaves exactly as before -- everything in
   memory, wiped on restart -- so the zero-dependency demo path still works
   for anyone who just wants to see live 1v1 in two tabs.
   PRODUCTION: always run with PERSIST=1. */
const PERSIST = process.env.PERSIST === '1';
let store = null;
if (PERSIST){
  try { store = require('./db.js'); }
  catch(e){ console.error('  persistence FAILED to load: ' + e.message); process.exit(1); }
  console.log('  persistence: SQLite at ' + store.DB_PATH + ' (accounts survive restarts)');
}

/* Pick up where the last process left off. Without this the guest counter
   restarts at 1000 after every deploy and the next visitor is handed a
   name that already belongs to somebody. */
function seedGuestCounter(){
  if (!store) return;
  try {
    const n = store.S.maxGuestNumber.get().n;
    if (n && n > guestCounter){
      guestCounter = n;
      console.log('  guest numbering resumes at Guest' + (n + 1));
    }
  } catch(e){ console.error('could not seed guest counter: ' + e.message); }
}

const PORT = process.env.PORT || 8787;
const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');

/* ---- the shared puzzle generator, lifted straight out of the client so the
   server marks with the exact same code. The IIFE is self-contained apart
   from clamp(). */
function loadPuzzleGen(){
  // This reads PuzzleGen straight out of the SOURCE index.html, by its
  // exact unminified text — a real reason this dev server must run against
  // the commented source file, never against index.min.html (build.js
  // renames/reflows everything, including this marker). That is fine:
  // mock.js is local tooling, and production traffic should be served by
  // index.min.html directly with no Node process rebuilding it per request.
  const html = fs.readFileSync(INDEX, 'utf8');
  const a = html.indexOf('const PuzzleGen = (function(){');
  const b = html.indexOf('\n})();', a) + '\n})();'.length;
  if (a < 0 || b < a) throw new Error('PuzzleGen not found in index.html');
  const src = 'const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));\n' + html.slice(a, b) + '\nPuzzleGen;';
  return vm.runInNewContext(src, {});
}
const PuzzleGen = loadPuzzleGen();

/* The level ids that exist, read from the same source file as the puzzle
   generator. A shot used to be filed under whatever string arrived, so
   anyone could invent a level nobody else had played and sit at the top of
   its board, or write junk keys into their own bests forever.

   Ids are `<location>-<n>`; the locations come out of the LOCATIONS array
   by their `id:'x', scene:` signature. The numbers are allowed up to 20
   rather than counted exactly -- being slightly permissive costs nothing
   (an id for a challenge that does not exist is unreachable anyway) and it
   means adding a challenge to a location never silently starts rejecting
   real shots. What it stops is the arbitrary string, which is the part
   that mattered. */
// Locations in play order, with their display names, for the admin
// progression funnel. Read from the same source as the level ids.
const LOCATION_ORDER = [];
const LEVEL_IDS = (() => {
  const out = new Set();
  try {
    const html = fs.readFileSync(INDEX, 'utf8');
    const block = html.slice(html.indexOf('const LOCATIONS = ['));
    for (const m of block.matchAll(/\{\s*id:'([a-z0-9_]{2,16})',\s*scene:'[a-z0-9_]+',\s*name:'([^']{1,40})'/g)){
      LOCATION_ORDER.push({ id: m[1], name: m[2] });
      for (let i = 1; i <= 20; i++) out.add(m[1] + '-' + i);
    }
  } catch(e){}
  if (!out.size) console.error('WARNING: no level ids found in index.html — shot validation is off');
  return out;
})();
if (LEVEL_IDS.size) console.log('  levels: ' + LEVEL_IDS.size + ' valid ids');

/* A ceiling on XP. Not a game rule -- a guard against a stored value
   becoming Infinity or a non-integer, which used to be one request away
   and left the affected player unable to be written to the database at
   all. Well above anything reachable by playing. */
const MAX_XP = 100000000;
// A "C", the grade that clears a round for progression. Must match
// GRADES.C in index.html.
const GRADE_C = 66;

/* ---- state ---- */
const events = [];            // {type, handle, at, meta} -- feeds the admin dashboard's charts only
/* With PERSIST=1 these are SQLite-backed adapters exposing the same
   Map interface, so every call site below works unchanged and accounts
   survive a restart. Without it, plain Maps and the original demo
   behaviour. One switch, one behaviour difference, nothing else to keep
   in sync. */
const users  = store ? store.usersAdapter  : new Map();   // handleLower -> user
const tokens = store ? store.tokensAdapter : new Map();   // token -> handleLower
const shots = [];             // {handle, levelId, score, at}
const queue = [];             // waiting entries {id, handle, rating, at, lastPoll}
/* Guests start at Guest1001, like most sites -- but the starting point is
   read back from the database at boot (below, once `store` exists), never
   assumed. A counter that resets to 1000 on every restart hands the next
   visitor a name somebody is already using. */
let guestCounter = 1000;
const duels = new Map();      // duelId -> {seed, startsAt, players:[handle,handle|'BOT'], results:{}, status}
const config = {
  v:2, xpMult:1, streakBonus:0.15, coachMode:2, timerRevealAt:999, paywall:false, freeRounds:3,
  grades:{S:95, A:88, B:78, C:66, D:52},
  features:{ liveDuels:true, boards:true }
};
/* At 10 seconds of nobody live, the search resolves itself automatically --
   a real recorded run if one exists, a practice bot otherwise. No "we found
   something, tap to accept" step: that pause is what read as unfinished,
   not the fallback itself. The player just gets a match. */
const AUTO_FALLBACK_MS = 10000;
const BOT_OFFER_AFTER_MS = AUTO_FALLBACK_MS, QUEUE_STALE_MS = 60000;
// A ghost is offered sooner than a bot: it is a real person's real
// performance, so there is no honesty cost to reaching for it quickly --
// unlike a bot, which the client is careful to label as practice and never
// let affect rating.
const GHOST_OFFER_AFTER_MS = AUTO_FALLBACK_MS;

/* ---------------------------------------------------------------------
   THE SOLD AD SLOT
   One advertiser at a time, editable from the admin portal and served to
   the client at boot, so a sponsor can be swapped, paused or replaced
   without touching the game file. `sold:false` means no ads at all --
   which is also the correct state until a slot is actually sold, because
   showing a house ad to every player teaches them to ignore the slot
   before you ever have a paying advertiser in it.
   --------------------------------------------------------------------- */
const adSlot = {
  sold: false,
  sku: 'house',
  name: 'MoonBlips',
  url: 'https://www.moonblips.com',
  label: 'PRESENTED BY',
  line: 'Live event photography — every frame from the night, minutes after it happens.',
  cta: 'MOONBLIPS.COM →',
  display: 'www.moonblips.com',
  everyNRuns: 2,        // an interstitial after every N rounds
  seconds: 5
};
// {sku, slot, kind, at} -- what an advertiser is actually paying for, and
// what lets you quote a real CPM instead of guessing.
const adEvents = [];
const AD_EVENTS_CAP = 50000;
setInterval(() => { if (adEvents.length > AD_EVENTS_CAP) adEvents.splice(0, adEvents.length - AD_EVENTS_CAP); }, 5*60*1000);
const EVENTS_CAP = 20000;
// A long-running process would otherwise grow this array forever. Trimmed
// periodically rather than on every push, since checking length on every
// single event is needless work for something that only matters once in a
// long while.
setInterval(() => { if (events.length > EVENTS_CAP) events.splice(0, events.length - EVENTS_CAP); }, 5 * 60 * 1000);

/* THE REST OF THE IN-MEMORY STATE, WHICH HAD NO SWEEPER AT ALL.

   `events` and `adEvents` above were capped; these three were not, and a
   long-lived process leaked all of them.

   - `shots` grew with every shot ever taken, and the runs board filters it
     inside a loop, so the most-viewed leaderboard got slower for as long
     as the process lived.
   - `duels` kept every duel ever created, both players' rows included,
     forever.
   - `loginAttempts` kept one entry per address that has ever failed an
     admin login, cleared only by a SUCCESSFUL login from that same
     address. Someone hammering the portal from many addresses could push
     the process into an out-of-memory kill and never be noticed.

   Swept together on one timer. A finished duel is kept for an hour so the
   comparison screen still resolves if a player leaves it open. */
const SHOTS_CAP = 20000;
const DUEL_KEEP_MS = 60 * 60 * 1000;
// each player's current run of shots, for the XP streak bonus (short-lived, memory only)
const RUNS = new Map();
setInterval(() => { const cut = Date.now() - 30*60*1000; for (const [k, r] of RUNS) if (r.at < cut) RUNS.delete(k); }, 10*60*1000).unref();
setInterval(() => {
  if (shots.length > SHOTS_CAP) shots.splice(0, shots.length - SHOTS_CAP);
  const now = Date.now();
  for (const [id, d] of duels)
    if (now - (d.createdAt || 0) > DUEL_KEEP_MS) duels.delete(id);
  for (const [ip, a] of loginAttempts)
    if (!a.lockedUntil || a.lockedUntil < now - 3600000) loginAttempts.delete(ip);
  for (const [t, exp] of adminSessions) if (exp < now) adminSessions.delete(t);
  for (const [id, m2] of matchedEntries)
    if (now - (m2.at || 0) > 10 * 60 * 1000) matchedEntries.delete(id);
}, 5 * 60 * 1000).unref();

const dayKey = () => new Date().toISOString().slice(0,10);
const PUZZLE_STATS = new Map();   // n -> {attempts, correct, template}

/* scrypt with a per-user random salt -- the right primitive. Two guards
   around it:

   A LENGTH CAP. There was no maximum, and the body limit is 256 KB, so a
   login could hand the server a quarter-megabyte "password" and make it
   re-derive a key from the whole thing. scryptSync blocks the event loop
   for the entire process while it works, so a handful of those is a denial
   of service against every other player at once. 200 characters is longer
   than any real passphrase and the validator in security.js already used
   that number. */
const PW_MAX = 200;
const hash = (pw, salt) => crypto.scryptSync(String(pw).slice(0, PW_MAX), salt, 32).toString('hex');

/* CONSTANT-TIME COMPARISON. `a === b` on strings returns as soon as two
   characters differ, so how long it takes leaks how much of the secret was
   right. Against a salted hash that is close to unexploitable -- an
   attacker cannot steer a KDF's output toward a prefix match. Against the
   ADMIN PASSWORD, which is compared directly and is the thing somebody is
   actually guessing, it is worth closing. One function, used for both,
   because the next person to add a comparison should find the safe one
   first. */
function timingSafeEq(a, b){
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  // timingSafeEqual throws on a length mismatch, which would itself leak
  // the length. Hash both to a fixed width first, then compare.
  const ha = crypto.createHash('sha256').update(A).digest();
  const hb = crypto.createHash('sha256').update(B).digest();
  return crypto.timingSafeEqual(ha, hb);
}
const newToken = () => crypto.randomBytes(24).toString('hex');
const rid = () => crypto.randomBytes(8).toString('hex');

// name and birthYear are both optional, both self-reported, and both
// bounded: the client's <select> only ever offers years that keep the
// player at or above the game's age floor, so a birth year here can never
// contradict ageConfirmed. Neither field is ever put in a wire shape that
// another player, or a leaderboard row, can see — see me() and the board
// queries below, which both name their fields explicitly rather than
// spreading the user object.
function newUser(handle, email, password, consent){
  const salt = crypto.randomBytes(12).toString('hex');
  const minYear = new Date().getFullYear() - 13;
  const by = Number.isInteger(consent.birthYear) && consent.birthYear <= minYear ? consent.birthYear : null;
  const code = Array.from({length:4}, () => crypto.randomBytes(2).toString('hex').toUpperCase()).join('-');
  return { handle, email: email || null, name: (consent.name || '').slice(0,60) || null,
    birthYear: by, salt, pw: hash(password, salt), createdAt: Date.now(),
    consent: { acceptedTerms: !!consent.acceptedTerms, termsVersion: consent.termsVersion || null,
               ageConfirmed: !!consent.ageConfirmed, marketingOk: !!consent.marketingOk },
    xp: 0, bests: {}, owns: [], blips: 40, equipped: null,
    lastSeenAt: Date.now(),
    livePracticed: false, duelRating: 1000, duels: { w:0, l:0, t:0 },
    puzzles: { next:1, rating: 800, solved:0, attempted:0, streak:0, bestStreak:0, solvedSet: new Set() },
    /* The recovery code was generated here, shown to the player once at
       sign-up with an instruction to keep it safe -- and never stored
       anywhere, so it could never have worked. The game was handing people
       a credential-shaped string that did nothing. It is hashed into
       `recoveryHash` now (never kept in the clear, same as a password) and
       `/v1/auth/recover` accepts it.

       For a GUEST the same field does a second job: a guest has no
       password, so this is the only thing that can prove the device coming
       back is the same one. The client stores it and exchanges it for a
       fresh token. Without it, a guest whose token lapsed had no way back
       into their own account and the only working button on the screen was
       "create an account" -- which is exactly the behaviour the owner was
       seeing. */
    recoveryCode: code, recoveryHash: hash(code, salt) };
}
// This is what the ACCOUNT OWNER sees about themselves. name and birthYear
// are deliberately included here (so the You tab could show "signed up as
// ...") and just as deliberately absent from every OTHER endpoint that
// mentions a handle — the board queries and duel opponent payloads below
// build their own narrow objects rather than reusing this one.
const me = u => ({ handle: u.handle, guest: !!u.guest, email: u.email, name: u.name, birthYear: u.birthYear,
  created: u.createdAt, entitlements: [],
  bests: u.bests, livePracticed: u.livePracticed, duelRating: u.duelRating,
  owns: u.owns || [], profile: { xp: u.xp, blips: u.blips || 0, equipped: u.equipped || null },
  duels: { w: u.duels.w, l: u.duels.l, t: u.duels.t },
  puzzles: { rating: u.puzzles.rating, solved: u.puzzles.solved,
             attempted: u.puzzles.attempted, streak: u.puzzles.streak,
             bestStreak: u.puzzles.bestStreak },
  /* The player's own figures, the same ones the admin dashboard is built
     from -- their visits and their time played, nobody else's. A game that
     measures how long people play and then shows them nothing of it is
     keeping a record ABOUT someone rather than FOR them; the numbers are
     more interesting to the person who earned them than to anyone else. */
  stats: playerStats(u),
  consent: u.consent });

function playerStats(u){
  const base = { visits: 0, playedMs: 0, shots: 0, since: u.createdAt };
  if (!store) return base;
  try {
    const t = store.S.timeOfUser.get(u.handleLower);
    return { ...base,
      visits: (t && t.sessions) || 0,
      playedMs: Math.max(0, Math.round((t && t.ms) || 0)),
      shots: store.S.shotsOfUser.get(u.handleLower).c };
  } catch(e){ return base; }
}

/* ---------------------------------------------------------------------
   The store. Every item is cosmetic or a location pack — nothing here
   touches scoring, matchmaking, or a leaderboard's legitimacy, and duels
   are never sold. That line is the whole reason a leaderboard means
   anything; do not let a future feature quietly cross it.
   --------------------------------------------------------------------- */
const CATALOGUE = [
  { sku:'pack.wild',  title:'The Marsh',    blurb:'Unlock this location outright.', price_cents:199 },
  { sku:'pack.stage', title:'The Room',     blurb:'Unlock this location outright.', price_cents:199 },
  { sku:'pack.field', title:'The Match',    blurb:'Unlock this location outright.', price_cents:199 },
  { sku:'pack.rail',  title:'The Platform', blurb:'Unlock this location outright.', price_cents:199 },
  { sku:'pack.all',   title:'All locations', blurb:'Every location, once.',        price_cents:599 },
  { sku:'skin.brass',    title:'Brass finish',   blurb:'A camera finish. Cosmetic only.', price_cents:99,  blip_price:400 },
  { sku:'skin.noir',     title:'Noir finish',    blurb:'A camera finish. Cosmetic only.', price_cents:99,  blip_price:400 },
  { sku:'skin.oxblood',  title:'Oxblood finish', blurb:'A camera finish. Cosmetic only.', price_cents:99,  blip_price:400 },
  { sku:'skin.arctic',   title:'Arctic finish',  blurb:'A camera finish. Cosmetic only.', price_cents:99,  blip_price:400 },
  // The one subscription-shaped idea we are NOT doing: this is a single,
  // one-time purchase, like chess.com's model but without a recurring
  // charge, because a recurring fee needs a cancellation flow, dunning
  // emails and support load a two-person team should not take on yet.
  { sku:'supporter', title:'Supporter', price_cents:499,
    blurb:'No ads, ever. A Supporter badge on every board. An exclusive camera finish nobody can earn. One time, forever.' }
];
function grantsFor(sku){
  if (sku === 'supporter') return ['supporter', 'badge.supporter', 'skin.supporter'];
  if (sku === 'pack.all')  return ['pack.all', 'pack.wild', 'pack.stage', 'pack.field', 'pack.rail'];
  return [sku];
}

/* ---- helpers ---- */
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type':'application/json', 'Cache-Control':'no-store' }); res.end(JSON.stringify(obj)); };
const err = (res, code, m) => send(res, code, { error: m });
function auth(req){ const h = req.headers.authorization || ''; const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  const k = t && tokens.get(t); const u = k ? users.get(k) : null;
  // Every authenticated call is a heartbeat. This is the single point that
  // makes DAU/WAU/MAU possible at all — without it "active" has no
  // definition, since a player who never explicitly logs anything (just
  // plays) would otherwise look identical to one who left months ago.
  /* A banned account is not an account. The `banned` column existed, had a
     statement prepared for it, and was read into the user object -- and
     nothing anywhere ever checked it, so the only moderation action
     available was deleting somebody outright. Checking it here covers
     every authenticated route at once, which is the only place it can be
     done without missing one. */
  if (u && u.banned){ tokens.delete(t); return null; }
  if (u){
    u.lastSeenAt = Date.now();
    touchSession(u, req);
  }
  return u; }

/* One session per visit. Reuses the open session if the player was active
   within SESSION_GAP, otherwise opens a new one -- so a tab-switch does not
   count as a second visit but coming back tomorrow does. This is what makes
   "sessions per week" and honest cohort retention possible. */
/* Every event goes to BOTH places: the in-memory array powers the live
   activity feed, and the database keeps the history across restarts. They
   were only ever going to memory, which meant every metric on the dashboard
   silently reset whenever the server was redeployed -- exactly the numbers
   you cannot afford to lose. */
function logEvent(type, handle, meta){
  const at = Date.now();
  events.push({ type, handle: handle || null, at, meta: meta || null });
  if (store){
    try { store.S.addEvent.run(type, handle ? String(handle).toLowerCase() : null, at,
      meta ? JSON.stringify(meta) : null); } catch(e){}
  }
}

/* =========================================================================
   GOOGLE ID TOKEN VERIFICATION.

   A Google "credential" is a JWT: header.payload.signature, base64url. The
   payload is not a claim about the world, it is a claim about what the
   SENDER wants you to believe. Only the signature, checked against Google's
   own published keys, turns it into a statement by Google.

   Fails closed, every time. If the keys cannot be fetched, if the algorithm
   is not the one we expect, if the audience is not this application -- the
   sign-in is refused. The one thing that must never happen here is falling
   back to "well, the payload looks reasonable".
   ========================================================================= */
/* The store is off until a real Stripe key is present. Absent, checkout
   refuses -- it does not fall back to granting the item, which is what it
   used to do. */
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || null;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || null;
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
let googleKeys = { keys: null, fetchedAt: 0, inflight: null };

async function googleJwks(force){
  const now = Date.now();
  // Cached for an hour. Google rotates keys on roughly that cadence and
  // publishes the new one well before retiring the old, so an hour-old copy
  // still verifies a token minted a second ago.
  if (!force && googleKeys.keys && now - googleKeys.fetchedAt < 3600000) return googleKeys.keys;
  if (googleKeys.inflight) return googleKeys.inflight;      // never stampede
  googleKeys.inflight = (async () => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    try {
      const r = await fetch(GOOGLE_CERTS_URL, { signal: ctl.signal });
      if (!r.ok) throw new Error('certs HTTP ' + r.status);
      const j = await r.json();
      if (!j || !Array.isArray(j.keys) || !j.keys.length) throw new Error('certs payload empty');
      googleKeys = { keys: j.keys, fetchedAt: Date.now(), inflight: null };
      return j.keys;
    } finally { clearTimeout(timer); googleKeys.inflight = null; }
  })();
  return googleKeys.inflight;
}

function b64urlJson(part){
  return JSON.parse(Buffer.from(String(part), 'base64url').toString('utf8'));
}

async function verifyGoogleIdToken(credential){
  const parts = String(credential).split('.');
  if (parts.length !== 3) throw new Error('not a JWT');
  const header = b64urlJson(parts[0]);
  // Only RS256. "alg":"none" and the HMAC-confusion trick both die here.
  if (header.alg !== 'RS256') throw new Error('unexpected alg ' + header.alg);
  if (!header.kid) throw new Error('no kid');

  const signed = Buffer.from(parts[0] + '.' + parts[1], 'utf8');
  const sig = Buffer.from(parts[2], 'base64url');

  // A kid we do not hold usually means Google rotated; re-fetch once before
  // giving up, but never skip verification because of it.
  let keys = await googleJwks(false);
  let jwk = keys.find(k => k.kid === header.kid);
  if (!jwk){ keys = await googleJwks(true); jwk = keys.find(k => k.kid === header.kid); }
  if (!jwk) throw new Error('unknown signing key');

  const pub = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  if (!crypto.verify('RSA-SHA256', signed, pub, sig)) throw new Error('bad signature');

  const claims = b64urlJson(parts[1]);
  const now = Math.floor(Date.now() / 1000), skew = 300;   // 5 min of clock drift
  if (!GOOGLE_ISSUERS.has(claims.iss)) throw new Error('bad iss ' + claims.iss);
  // `aud` is the whole point of this check: a validly-signed Google token
  // issued to a DIFFERENT application is still a real Google token, and
  // without this line anyone could take one from their own app and sign in
  // here with it.
  if (claims.aud !== GOOGLE_CLIENT_ID) throw new Error('bad aud');
  if (!(claims.exp > now - skew)) throw new Error('expired');
  if (claims.iat && claims.iat > now + skew) throw new Error('issued in the future');
  if (!claims.sub) throw new Error('no sub');
  return claims;
}

const SESSION_GAP = 30 * 60 * 1000;

/* Where the player is and what o'clock it is for them, stamped onto the
   session when it opens. Derived from the timezone their browser reports,
   never from their IP address -- see server/geo.js for the reasoning, and
   the privacy policy, which describes exactly this and must stay in step.

   Writing it at session START rather than on every beat is the point: a
   session is a visit, and a visit happens at one local time. Re-stamping
   on each request would leave every session labelled with whatever hour it
   happened to end in. */
function touchSession(u, req){
  if (!store) return;
  const now = Date.now();
  try {
    const ctx = geo.contextOf(req);
    const last = store.S.openSession.get(u.handleLower);
    if (last && now - last.last_beat_at < SESSION_GAP){
      store.S.beatSession.run(now, last.id);
      // A session that opened before we knew the zone -- an old cached
      // client, or the very first call of a visit -- gets filled in now.
      // COALESCE in the statement means this only ever fills blanks.
      if (ctx.tz && last.tz == null){
        const lp = geo.localParts(last.started_at, ctx.tz);
        store.S.fillSession.run(ctx.tz, ctx.country, ctx.lang, ctx.device, lp.hour, lp.dow, last.id);
      }
    } else {
      const lp = geo.localParts(now, ctx.tz);
      store.S.newSession.run(u.handleLower, now, now, dayKey(),
        ctx.tz, ctx.country, ctx.lang, ctx.device, lp.hour, lp.dow);
    }
    // Last known, on the player record, so the players table can show where
    // someone plays from without scanning their whole session history.
    if (ctx.tz && (u.country !== ctx.country || u.tz !== ctx.tz || u.device !== ctx.device)){
      u.country = ctx.country; u.tz = ctx.tz; u.lang = ctx.lang; u.device = ctx.device;
      store.S.setUserGeo.run(ctx.tz, ctx.country, ctx.lang, ctx.device, u.handleLower);
    }
  } catch(e){ /* analytics must never break a request */ }
}
// Parses BOTH shapes the server ever receives: JSON from the game client,
// and application/x-www-form-urlencoded from the admin portal's plain HTML
// forms (no JS framework there on purpose — one less thing to keep
// working). An unchecked checkbox sends no field at all, which is exactly
// why the feature-flags form must be read from this, not assumed boolean.
// Size-capped, and it parses both JSON (the game) and form-encoded (the
// admin portal). Without the cap, one request claiming to be a gigabyte of
// JSON takes the server down.
function body(req){ return sec.readBody(req); }
const HANDLE_RX = /^[A-Z0-9_]{3,16}$/i;
const BAD_WORDS = /(fuck|shit|cunt|nigg|fag|bitch|admin|shutterblip|moderator)/i;

/* ---- the matchmaking buffer: first come, first served ---- */
function sweepQueue(){ const now = Date.now(); for (let i = queue.length-1; i >= 0; i--) if (now - queue[i].lastPoll > QUEUE_STALE_MS) queue.splice(i,1); }
function tryMatch(){
  sweepQueue();
  while (queue.length >= 2){
    const a = queue.shift(), b = queue.shift();
    const id = rid(), seed = 1 + (crypto.randomBytes(3).readUIntBE(0,3) % 1000000);
    duels.set(id, { id, seed, startsAt: Date.now() + 3000, players:[a.handle, b.handle], results:{}, status:'live', createdAt: Date.now(), kind:'live' });
    a.matched = b.matched = id;
    matchedEntries.set(a.id, { at: Date.now(), duelId:id, seed, startsAt: duels.get(id).startsAt, opponent:{ handle:b.handle, rating: users.get(b.handle.toLowerCase()).duelRating } });
    matchedEntries.set(b.id, { at: Date.now(), duelId:id, seed, startsAt: duels.get(id).startsAt, opponent:{ handle:a.handle, rating: users.get(a.handle.toLowerCase()).duelRating } });
  }
}
const matchedEntries = new Map();   // queueId -> matched payload, read once by the poller

function botRows(seed){ // a plausible practice opponent when the client asks for one server-side
  const r = Array.from({length:5}, () => { const e = 55 + Math.random()*40, c = 45 + Math.random()*40; return { e, c, t: (e+c)/2 }; });
  return r;
}
// The one function every deletion path — self-service and admin — must go
// through. "Delete my account" that leaves your shots on the leaderboard
// and your answers in the event log is not deletion, it is a login screen
// removed in front of data that is still there. Scores and duel history
// are removed rather than merely unlinked, because an anonymised row that
// still says "beat a 1200-rated opponent on this date" is still
// re-identifiable against the public board it came from.
function scrubAccount(handle){
  const key = handle.toLowerCase();
  const u = users.get(key); if (!u) return false;
  users.delete(key);
  for (const [t,k] of tokens) if (k === key) tokens.delete(t);
  for (let i = shots.length - 1; i >= 0; i--) if (shots[i].handle === u.handle) shots.splice(i,1);
  for (let i = events.length - 1; i >= 0; i--) if (events[i].handle === u.handle) events.splice(i,1);
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i].handle === u.handle) queue.splice(i,1);
  /* Everything with a foreign key to users cascades when the row goes.
     Sessions do not have one, so their visit history -- including the time
     zone, country and device type the analytics are built from -- has to
     be removed by hand. Miss this and "deleting your account removes
     everything" is simply not true. */
  if (store){
    try { store.S.deleteSessions.run(key); } catch(e){ console.error('scrub: sessions — ' + e.message); }
  }
  return true;
}
function settleDuel(d){
  const [a, b] = d.players; if (!(d.results[a] && d.results[b])) return;
  // Settle once. Without this a replayed result re-awards the rating change
  // every time it is posted.
  if (d.status === 'done') return;
  d.status = 'done';
  const avg = rows => rows.reduce((s,r)=>s+(+r.t||0),0)/5;
  const ua = users.get(a.toLowerCase()), ub = b === 'BOT' ? null : users.get(b.toLowerCase());
  if (!ua || !ub) return;                            // bot duels never touch rating
  // A guest's rating is real and moves normally -- it is what matchmaking
  // sorts on, and it carries over intact if they later upgrade. It is simply
  // never published, because the boards filter guests out.
  const sa = avg(d.results[a]), sb = avg(d.results[b]);
  const ea = 1/(1+Math.pow(10,(ub.duelRating-ua.duelRating)/400));
  const ra = sa > sb + 0.05 ? 1 : sa < sb - 0.05 ? 0 : 0.5, K = 32;
  ua.duelRating = Math.round(ua.duelRating + K*(ra-ea)); ub.duelRating = Math.round(ub.duelRating + K*((1-ra)-(1-ea)));
  if (ra === 1){ ua.duels.w++; ub.duels.l++; } else if (ra === 0){ ua.duels.l++; ub.duels.w++; } else { ua.duels.t++; ub.duels.t++; }
  logEvent('duel_result', ua.handle, { kind:d.kind||'live', outcome: ra===1?'win':ra===0?'loss':'tie', opponent:ub.handle });
  // Both sides of a genuinely live duel become ghosts -- real rows from a
  // real match, available to stand in for their player next time someone
  // is searching alone. Never built from a bot duel: a bot has no honest
  // ghost, because nobody actually played it.
  if (store && d.kind !== 'bot' && d.kind !== 'ghost'){
    const avg2 = rows => rows.reduce((s,r)=>s+(+r.t||0),0)/5;
    store.S.saveGhost.run(a.toLowerCase(), a, d.seed, JSON.stringify(d.results[a]), avg2(d.results[a]), ua.duelRating, Date.now());
    store.S.saveGhost.run(b.toLowerCase(), b, d.seed, JSON.stringify(d.results[b]), avg2(d.results[b]), ub.duelRating, Date.now());
  }
}
/* Ghost matches are a real competitive result for the LIVE player, and a
   non-event for the absent one. Their rating moves, using the ghost's
   rating AT THE TIME the run was recorded (not their current one, which
   may have drifted since) as the opponent strength; the ghost owner's own
   rating and record are never touched -- they are not present, do not
   know this happened, and it would be strange and unearned to change their
   standing based on a match that occurs after the fact. */
function settleGhostDuel(handle, d){
  // Same rule as settleDuel: one settlement per duel, ever. This path had
  // no guard at all, which made a ghost match the cheapest rating to farm
  // in the game -- win one, then replay the identical POST in a loop.
  if (d.status === 'done') return;
  d.status = 'done';
  const u = users.get(handle.toLowerCase()); if (!u) return;
  const avg = rows => rows.reduce((s,r)=>s+(+r.t||0),0)/5;
  const sa = avg(d.results[handle]);
  const ghostHandle = d.players.find(x => x !== handle);
  const sb = avg(d.results[ghostHandle]);
  const ghostRating = d.ghostRating != null ? d.ghostRating : u.duelRating;
  const ea = 1/(1+Math.pow(10,(ghostRating-u.duelRating)/400));
  const ra = sa > sb + 0.05 ? 1 : sa < sb - 0.05 ? 0 : 0.5, K = 24;   // lighter K: an asynchronous result is real, but slightly softer than a live one
  u.duelRating = Math.round(u.duelRating + K*(ra-ea));
  if (ra === 1) u.duels.w++; else if (ra === 0) u.duels.l++; else u.duels.t++;
  logEvent('duel_result', handle, { kind:'ghost', outcome: ra===1?'win':ra===0?'loss':'tie', opponent:d.players.find(x => x !== handle) });
}
// Bot matches never call settleDuel (no rating to update — see the guard
// above), so they need their own log line or "duels played" quietly
// undercounts every practice match against the fallback.
/* Duel rows arrive from the client and are used for rating, for the
   comparison screen, and -- for a live duel -- saved as a ghost that other
   players are later matched against. A fabricated row therefore does not
   just win one match; it becomes an opponent that farms rating from honest
   players afterwards.

   Re-simulating the frames server-side is the real answer and is still the
   open item. Until then this at least bounds what a forged row can claim:
   scores are numbers in range, and nothing else in the object is carried
   through to be stored or echoed back. */
function clampDuelRows(rows){
  const num = (v, lo, hi) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0;
  };
  return rows.slice(0, 5).map(r => {
    r = (r && typeof r === 'object') ? r : {};
    /* The camera settings the frame was taken with. The opponent's photo on
       the comparison screen is REDRAWN from these, so dropping them (as the
       first version of this function did) left every live and recorded
       match showing "NO FRAME" for the other player. Numbers only, fixed
       keys, sane ranges. */
    let cam = null;
    if (r.cam && typeof r.cam === 'object'){
      const c = r.cam;
      cam = { ap: num(c.ap, 0.5, 64), sh: Math.round(num(c.sh, 0, 40)), iso: num(c.iso, 25, 409600),
              f: num(c.f, 8, 1200), fd: num(c.fd, 0.1, 10000), cx: num(c.cx, -10000, 10000),
              cy: num(c.cy, -10000, 10000), sx: num(c.sx, -10000, 10000), cv: num(c.cv, -10000, 10000),
              ck: num(c.ck, 0, 100000) };
    }
    return {
      t: num(r.t, 0, 100),                       // total, the one rating reads
      e: num(r.e, 0, 100), c: num(r.c, 0, 100),  // exposure, composition
      f: num(r.f, 0, 100), m: num(r.m, 0, 100),  // focus, motion
      ms: Math.round(num(r.ms, 0, 120000)),      // time taken
      ...(cam ? { cam } : {})
    };
  });
}

function logBotDuel(handle, seed){
  logEvent('duel_result', handle, { kind:'bot', outcome:null, opponent:'BOT' });
}

/* =========================================================================
   ADMIN PORTAL — completely separate from the game's API and never shipped
   in the client bundle. index.html has no idea this exists; it is server
   routes only, so nothing about it appears in view-source no matter how
   the client is built or minified.

   Auth: a password, set via the ADMIN_PASSWORD environment variable —
   never hardcoded, never with a default that works. If it is not set, the
   server refuses to start rather than silently leaving the portal wide
   open. A correct password gets a random session token in an HttpOnly
   cookie; wrong passwords are rate-limited per IP with a growing lockout,
   because an admin login is the single highest-value target on this whole
   server. Sessions expire after 12 hours.

   PRODUCTION: put this behind more than a password before real money and
   real user data are on the line — an IP allowlist, a VPN, or a second
   factor. A password alone, however well-guarded, is one leak away from
   everything. See SERVER.md for specifics.
   ========================================================================= */
if (!process.env.ADMIN_PASSWORD){
  console.error('\nADMIN_PASSWORD is not set. Refusing to start.');
  console.error('Run instead:  ADMIN_PASSWORD=your-password node server/mock.js\n');
  process.exit(1);
}
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const adminSessions = new Map();     // token -> expiresAt
const loginAttempts = new Map();     // ip -> {count, lockedUntil}

function newAdminSession(){
  const t = crypto.randomBytes(24).toString('hex');
  adminSessions.set(t, Date.now() + 12*60*60*1000);
  return t;
}
function validAdminSession(req){
  const cookie = req.headers.cookie || '';
  const m2 = cookie.match(/sb_admin=([a-f0-9]+)/);
  if (!m2) return false;
  const exp = adminSessions.get(m2[1]);
  if (!exp || exp < Date.now()){ adminSessions.delete(m2[1]); return false; }
  return true;
}
function clientIp(req){ return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?').split(',')[0].trim(); }
function loginLocked(ip){
  const a = loginAttempts.get(ip);
  return !!(a && a.lockedUntil && a.lockedUntil > Date.now());
}
function recordFailedLogin(ip){
  const a = loginAttempts.get(ip) || { count:0, lockedUntil:0 };
  a.count++;
  // 5 tries free, then a lockout that doubles: 30s, 60s, 120s...
  if (a.count > 5) a.lockedUntil = Date.now() + Math.min(30*60*1000, 30000 * Math.pow(2, a.count - 6));
  loginAttempts.set(ip, a);
}
function clearFailedLogins(ip){ loginAttempts.delete(ip); }

// HTML-escape for anything a player controls (handles, skus) before it goes
// into an admin-rendered page — this is the one place in the whole file
// that ever prints untrusted text as HTML rather than JSON.
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function fmtCents(c){ return '$' + (c/100).toFixed(2); }
function dayKeyOf(ts){ return new Date(ts).toISOString().slice(0,10); }

/* The page shell. One stylesheet, no framework, no build step, no fonts
   fetched from anywhere -- this portal has to load instantly on a phone
   over a bad connection when something is wrong at 2am, and every external
   request is one more thing that can be the reason it does not.

   Everything is server-rendered. The tabs are links, the filters are plain
   forms, the sorts are query parameters. That means the whole dashboard
   still works with JavaScript off, and it means there is no client state to
   get out of step with the numbers. */
function adminPage(body, opts){
  opts = opts || {};
  return `<!doctype html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>ShutterBlip — Admin</title>
  <style>
    :root{
      --gold:#F2A03D;--teal:#35D6C1;--red:#E5484D;--violet:#8B7CF6;--green:#3DD68C;
      --bg:#0B0E14;--panel:#111621;--panel2:#161C29;--line:#222A3A;--line2:#2D3648;
      --dim:#78829B;--dim2:#9BA5BD;--bone:#F2F4F8;
      --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    }
    *{box-sizing:border-box}
    html{-webkit-text-size-adjust:100%}
    body{margin:0;background:var(--bg);color:var(--bone);font-size:15px;line-height:1.45;
      font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
      background-image:radial-gradient(900px 500px at 18% -8%,rgba(242,160,61,.07),transparent 62%),
                       radial-gradient(760px 460px at 96% 0%,rgba(53,214,193,.055),transparent 60%);
      background-attachment:fixed}

    /* --- chrome ------------------------------------------------------ */
    header.bar{position:sticky;top:0;z-index:20;background:rgba(11,14,20,.86);
      backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
    .bar-in{max-width:1220px;margin:0 auto;padding:11px 18px;display:flex;align-items:center;gap:14px}
    .brand{display:flex;align-items:center;gap:9px;font-weight:750;letter-spacing:-.01em;font-size:15px}
    .dot{width:9px;height:9px;border-radius:50%;background:var(--green);
      box-shadow:0 0 0 3px rgba(61,214,140,.16);flex:none}
    .brand small{font:600 10px/1 var(--mono);letter-spacing:.14em;color:var(--dim);
      border:1px solid var(--line2);padding:3px 6px;border-radius:5px}
    .bar-sp{flex:1}
    .clock{font:500 12px/1 var(--mono);color:var(--dim);white-space:nowrap}

    nav.tabs{max-width:1220px;margin:0 auto;padding:0 12px;display:flex;gap:2px;
      overflow-x:auto;scrollbar-width:none}
    nav.tabs::-webkit-scrollbar{display:none}
    nav.tabs a{display:block;padding:11px 13px 10px;font-size:13px;font-weight:600;color:var(--dim2);
      text-decoration:none;border-bottom:2px solid transparent;white-space:nowrap}
    nav.tabs a:hover{color:var(--bone)}
    nav.tabs a.on{color:var(--gold);border-bottom-color:var(--gold)}

    .wrap{max-width:1220px;margin:0 auto;padding:22px 18px 80px}
    h1{font-size:21px;margin:0 0 3px;letter-spacing:-.015em}
    .sub{color:var(--dim);font-size:13px;margin:0 0 20px;max-width:74ch}

    /* --- range picker ------------------------------------------------ */
    .range{display:flex;gap:5px;align-items:center;margin:0 0 20px;flex-wrap:wrap}
    .range span{font:600 10px/1 var(--mono);letter-spacing:.12em;color:var(--dim);margin-right:4px}
    .range a{font-size:12px;font-weight:600;color:var(--dim2);text-decoration:none;
      padding:5px 11px;border-radius:999px;border:1px solid var(--line);background:var(--panel)}
    .range a.on{color:#14100A;background:var(--gold);border-color:var(--gold)}

    /* --- metric cards ------------------------------------------------ */
    /* auto-fit alone packs as many columns as will fit, which leaves a
       single orphan card stranded on its own row whenever the count does
       not divide evenly. Past tablet width the column count is chosen from
       the number of cards instead, so every row fills. */
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:11px;margin-bottom:22px}
    @media (min-width:980px){
      .cards{grid-template-columns:repeat(4,1fr)}
      .cards[data-n="1"]{grid-template-columns:repeat(2,1fr)}
      .cards[data-n="2"]{grid-template-columns:repeat(2,1fr)}
      .cards[data-n="3"],.cards[data-n="5"],.cards[data-n="6"],.cards[data-n="9"]{grid-template-columns:repeat(3,1fr)}
      .cards[data-n="7"]{grid-template-columns:repeat(4,1fr)}
    }
    .card{background:linear-gradient(170deg,var(--panel2),var(--panel));border:1px solid var(--line);
      border-radius:13px;padding:14px 15px;position:relative;overflow:hidden;min-width:0}
    .card::before{content:'';position:absolute;inset:0 0 auto 0;height:2px;
      background:linear-gradient(90deg,var(--gold),transparent 72%);opacity:.5}
    .card b{display:block;font-size:27px;font-weight:700;color:var(--bone);line-height:1.12;
      letter-spacing:-.025em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
    .card b small{font-size:14px;font-weight:600;color:var(--dim);letter-spacing:0}
    .card span{display:block;margin-top:5px;font:600 9.5px/1.35 var(--mono);
      letter-spacing:.11em;color:var(--dim);text-transform:uppercase}
    .card em{display:block;margin-top:7px;font-style:normal;font-size:11.5px;color:var(--dim2);line-height:1.4}
    .card.hero b{font-size:34px;color:var(--gold)}
    .card.hero::before{background:linear-gradient(90deg,var(--gold),var(--teal) 70%);opacity:.85;height:2px}
    .card.teal::before{background:linear-gradient(90deg,var(--teal),transparent 72%)}
    .card.teal b{color:var(--teal)}
    .card.violet::before{background:linear-gradient(90deg,var(--violet),transparent 72%)}
    .card.violet b{color:var(--violet)}
    .card.muted b{color:var(--dim2);font-size:22px}

    /* --- panels ------------------------------------------------------ */
    .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px;align-items:start}
    .panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;
      padding:16px 17px 15px;margin-bottom:14px;min-width:0}
    .panel > h2{font-size:13.5px;font-weight:700;color:var(--bone);margin:0 0 3px;letter-spacing:-.005em;
      display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
    .panel > h2 i{font-style:normal;font:600 9.5px/1 var(--mono);letter-spacing:.11em;color:var(--dim)}
    .panel > p.note{color:var(--dim);font-size:12px;margin:0 0 13px;max-width:70ch;line-height:1.5}
    .panel > p.note:last-child{margin:12px 0 0}

    table{width:100%;border-collapse:collapse;font-size:13px}
    th,td{text-align:left;padding:8px 9px;border-bottom:1px solid var(--line)}
    tr:last-child td{border-bottom:0}
    th{color:var(--dim);font:600 9.5px/1.3 var(--mono);letter-spacing:.1em;text-transform:uppercase;
      white-space:nowrap}
    th a{color:var(--dim);text-decoration:none} th a:hover{color:var(--bone)}
    th a.on{color:var(--gold)}
    tbody tr:hover td{background:rgba(255,255,255,.022)}
    td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
    td.mono{font-family:var(--mono);font-size:12px;color:var(--dim2)}
    .empty{color:var(--dim);font-size:13px;padding:16px 2px;text-align:center}

    /* --- charts ------------------------------------------------------ */
    .bars{display:flex;align-items:flex-end;gap:3px;height:96px;margin:4px 0 5px}
    .bars i{flex:1;min-width:2px;border-radius:3px 3px 0 0;display:block;position:relative;
      background:linear-gradient(180deg,var(--gold),rgba(242,160,61,.32));min-height:3px}
    .bars i.z{background:var(--line);min-height:2px}
    .bars.teal i{background:linear-gradient(180deg,var(--teal),rgba(53,214,193,.28))}
    .axis{display:flex;justify-content:space-between;font:500 10px/1 var(--mono);color:var(--dim);margin-top:2px}
    .hours{display:grid;grid-template-columns:repeat(24,1fr);gap:2px;align-items:end;height:84px;margin:4px 0 5px}
    .hours i{border-radius:2px 2px 0 0;display:block;min-height:3px;
      background:linear-gradient(180deg,var(--teal),rgba(53,214,193,.3))}
    .hours i.z{background:var(--line);min-height:2px}
    .hourax{display:grid;grid-template-columns:repeat(24,1fr);gap:2px;
      font:500 8.5px/1 var(--mono);color:var(--dim);text-align:center;margin-top:3px}

    /* heatmap: 7 rows x 24 columns */
    .heat{display:grid;grid-template-columns:34px repeat(24,1fr);gap:2px;margin:6px 0 4px;min-width:0}
    .heat b{font:600 9.5px/1 var(--mono);color:var(--dim);align-self:center;font-weight:600}
    .heat i{aspect-ratio:1;border-radius:2px;display:block;background:var(--line);min-height:9px}
    .heat-ax{display:grid;grid-template-columns:34px repeat(24,1fr);gap:2px;
      font:500 8.5px/1 var(--mono);color:var(--dim);text-align:center}
    .legend{display:flex;align-items:center;gap:6px;font:500 10px/1 var(--mono);color:var(--dim);margin-top:10px}
    .legend i{width:15px;height:9px;border-radius:2px;display:block}

    /* horizontal ranked bars, for countries and languages */
    .rank{display:flex;flex-direction:column;gap:7px;margin-top:4px}
    .rank > div{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;
      position:relative;padding:7px 10px;border-radius:8px;background:var(--panel2);overflow:hidden}
    .rank u{position:absolute;inset:0 auto 0 0;background:rgba(242,160,61,.17);border-right:1px solid rgba(242,160,61,.34)}
    .rank span{position:relative;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rank em{position:relative;font-style:normal;font:600 12px/1 var(--mono);color:var(--dim2);
      font-variant-numeric:tabular-nums;white-space:nowrap}

    /* split bar, for session-length shape */
    .split{display:flex;height:30px;border-radius:8px;overflow:hidden;margin:6px 0 9px;background:var(--line)}
    .split i{display:flex;align-items:center;justify-content:center;font:600 10px/1 var(--mono);
      color:#0B0E14;min-width:0;overflow:hidden}
    .splitkey{display:flex;flex-wrap:wrap;gap:12px;font-size:11.5px;color:var(--dim2)}
    .splitkey span{display:flex;align-items:center;gap:6px}
    .splitkey i{width:9px;height:9px;border-radius:2px;display:block;flex:none}

    /* --- controls ---------------------------------------------------- */
    form.inline{display:inline}
    button,input[type=submit]{font:inherit;cursor:pointer}
    .btn{background:var(--gold);color:#171106;border:0;border-radius:9px;padding:8px 14px;
      font-weight:700;font-size:12.5px;letter-spacing:.01em}
    .btn:hover{filter:brightness(1.08)}
    .btn.danger{background:transparent;color:var(--red);border:1px solid rgba(229,72,77,.4)}
    .btn.warn{background:transparent;color:var(--gold);border:1px solid rgba(242,160,61,.4)}
    .btn.warn:hover{background:rgba(242,160,61,.12);filter:none}
    .btn.danger:hover{background:rgba(229,72,77,.12);filter:none}
    .btn.ghost{background:var(--panel2);color:var(--bone);border:1px solid var(--line2)}
    .btn.sm{padding:5px 10px;font-size:11px;border-radius:7px}
    input[type=text],input[type=password]{background:#080B11;border:1px solid var(--line2);color:var(--bone);
      border-radius:9px;padding:9px 11px;font-size:14px;font-family:inherit}
    input[type=text]:focus,input[type=password]:focus{outline:0;border-color:var(--gold)}
    a{color:var(--teal)}
    .flag{display:flex;align-items:flex-start;gap:9px;font-size:13px;margin-bottom:9px;line-height:1.4}
    .flag input{margin-top:3px;flex:none;accent-color:var(--gold);width:15px;height:15px}
    .pill{display:inline-block;font:600 9.5px/1 var(--mono);letter-spacing:.07em;padding:3px 7px;
      border-radius:999px;border:1px solid var(--line2);color:var(--dim2);text-transform:uppercase}
    .pill.acct{color:var(--teal);border-color:rgba(53,214,193,.3);background:rgba(53,214,193,.07)}
    .pill.banned{color:var(--red);border-color:rgba(229,72,77,.35);background:rgba(229,72,77,.09)}
    @media (max-width:640px){
      .wrap{padding:18px 13px 70px}
      .cards{grid-template-columns:repeat(auto-fit,minmax(136px,1fr));gap:9px}
      .card b{font-size:23px} .card.hero b{font-size:28px}
      .heat{grid-template-columns:26px repeat(24,1fr);gap:1.5px}
      .heat-ax{grid-template-columns:26px repeat(24,1fr);gap:1.5px}
      .heat i{min-height:7px}
      table{font-size:12.5px} th,td{padding:7px 6px}
      .scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
      .scroll table{min-width:520px}
    }
    @media (prefers-reduced-motion:no-preference){
      .card,.panel{animation:rise .22s ease both}
      @keyframes rise{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
    }
  </style></head><body>
  ${opts.chrome === false ? '' : `<header class="bar"><div class="bar-in">
    <div class="brand"><span class="dot"></span>ShutterBlip <small>ADMIN</small></div>
    <div class="bar-sp"></div>
    <div class="clock">${new Date().toLocaleString('en-GB',{ day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</div>
    <form method="POST" action="/admin/logout"><button class="btn ghost sm">Sign out</button></form>
  </div>${opts.nav || ''}</header>`}
  <div class="wrap">${body}</div></body></html>`;
}

/* ---- small presentation helpers, shared by every panel ---- */

// Durations, at the precision a human actually reads. "4h 12m", not
// "4.2 hours" and never "15120000".
function dur(ms){
  ms = Math.max(0, Math.round(Number(ms) || 0));
  const s = Math.round(ms/1000);
  if (s < 60) return s + 's';
  const m = Math.round(s/60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m/60), rm = m % 60;
  if (h < 48) return rm ? h + 'h ' + rm + 'm' : h + 'h';
  return Math.round(h/24) + 'd ' + (h % 24) + 'h';
}
function num(n){ return (Number(n)||0).toLocaleString('en-US'); }
function metric(value, label, note, cls){
  // A long value (a country name, say) at hero size overflows its card on a
  // narrow column, so the type shrinks to fit rather than the card growing.
  const long = String(value).replace(/<[^>]*>/g,'').length > 13;
  return `<div class="card${cls ? ' '+cls : ''}"><b${long ? ' style="font-size:21px"' : ''}>${value}</b>
    <span>${label}</span>${note ? `<em>${note}</em>` : ''}</div>`;
}
// Wraps a row of metric cards and tells the stylesheet how many there are,
// so it can pick a column count that divides evenly.
function cardRow(list){
  const items = list.filter(Boolean);
  return `<div class="cards" data-n="${items.length}">${items.join('')}</div>`;
}
function emptyRow(cols, msg){ return `<tr><td colspan="${cols}" class="empty">${msg}</td></tr>`; }
// A ranked list of labelled bars -- countries, languages, anything where
// the shape of the distribution reads faster than a column of numbers.
function rankList(items, max){
  if (!items.length) return '';
  const top = max || Math.max(1, ...items.map(i => i.n));
  return `<div class="rank">${items.map(i => `<div>
    <u style="width:${Math.max(2, i.n/top*100)}%"></u>
    <span>${i.label}</span><em>${i.right}</em></div>`).join('')}</div>`;
}

/* No header chrome here on purpose: a "Sign out" button on a page you are
   not signed in to is the kind of small wrongness that makes an admin
   portal feel like a prototype. */
function loginPage(err){
  return adminPage(`
    <div style="max-width:340px;margin:16vh auto 0;text-align:center">
      <div style="display:flex;align-items:center;justify-content:center;gap:9px;margin-bottom:6px">
        <span style="width:9px;height:9px;border-radius:50%;background:var(--gold);
          box-shadow:0 0 0 3px rgba(242,160,61,.16)"></span>
        <h1 style="margin:0">ShutterBlip Admin</h1></div>
      <p class="sub" style="margin:0 0 20px">${err
        ? '<span style="color:var(--red)">'+esc(err)+'</span>'
        : 'Sign in to continue.'}</p>
      <form method="POST" action="/admin/login" style="display:flex;gap:8px">
        <input type="password" name="password" placeholder="Admin password" autofocus style="flex:1">
        <input type="submit" class="btn" value="Sign in">
      </form>
    </div>`, { chrome:false });
}

/* =========================================================================
   THE DASHBOARD.

   Organised by the question you came to answer, not by which table the data
   happens to live in. Seven tabs, each one a single question:

     Overview     is this working?
     Time played  how long do people actually stay?
     When         what hour of their day do they play?
     Where        which countries and which devices?
     Players      who, individually?
     Content      which rounds and puzzles are wrong?
     Money        is any of it paying for itself?

   The old version was one scrolling column of fourteen stacked sections
   with the headline numbers printed twice. Everything is still here; it is
   just findable now.

   Every panel reads from the DATABASE, not from the in-memory event array.
   That array is still filled, and still powers the live feed, but building
   charts on it meant every number on this page reset to zero on each
   redeploy -- which is exactly the history you cannot afford to lose.
   ========================================================================= */

const RANGES = { '7':7, '30':30, '90':90, 'all':3650 };

function renderDashboard(qs){
  qs = qs || new URLSearchParams();
  const tab = qs.get('tab') || 'overview';
  const rk = RANGES[qs.get('range')] ? qs.get('range') : '30';
  const days = RANGES[rk];
  const now = Date.now(), D = 86400000;
  const since = now - days * D;
  const keep = extra => {                       // links that hold the range
    const p = new URLSearchParams(extra || {});
    if (rk !== '30') p.set('range', rk);
    const s = p.toString();
    return '/admin' + (s ? '?' + s : '');
  };

  const TABS = [
    ['overview','Overview'], ['time','Time played'], ['when','When'], ['where','Where'],
    ['players','Players'], ['content','Content'], ['money','Money'], ['settings','Settings']
  ];
  const nav = `<nav class="tabs">${TABS.map(([k,label]) =>
    `<a href="${keep({ tab:k })}"${tab===k?' class="on"':''}>${label}</a>`).join('')}</nav>`;

  const rangeBar = `<div class="range"><span>RANGE</span>${
    [['7','7 days'],['30','30 days'],['90','90 days'],['all','All time']].map(([k,label]) =>
      `<a href="${(() => { const p = new URLSearchParams(); if (tab!=='overview') p.set('tab',tab);
        if (k!=='30') p.set('range',k); const s=p.toString(); return '/admin'+(s?'?'+s:''); })()}"${
      rk===k?' class="on"':''}>${label}</a>`).join('')}</div>`;

  const body = ({
    overview: tabOverview, time: tabTime, when: tabWhen, where: tabWhere,
    players: tabPlayers, content: tabContent, money: tabMoney, settings: tabSettings
  }[tab] || tabOverview)({ qs, now, D, since, days, rk, keep, rangeBar });

  return adminPage(body, { nav });
}

/* ---- shared reads, so no two tabs can disagree about a number ---- */
function coreStats(since, now){
  const D = 86400000;
  const all = [...users.values()];
  const accounts = all.filter(u => !u.guest), guests = all.filter(u => u.guest);
  const activeSince = ts => all.filter(u => u.lastSeenAt >= ts).length;
  const retention = n => {
    if (!store) return null;
    const cStart = now - (n+1)*D, cEnd = now - n*D;
    const size = store.S.cohortSize.get(cStart, cEnd).c;
    if (!size) return null;
    return { pct: Math.round(store.S.cohortRetained.get(cStart, cEnd, now - n*D, now).c / size * 100), size };
  };
  const time = store ? store.S.timeTotals.get(since) : null;
  return {
    all, accounts, guests,
    dau: activeSince(now - D), wau: activeSince(now - 7*D), mau: activeSince(now - 30*D),
    d1: retention(1), d7: retention(7), d30: retention(30),
    time,
    sessions7: store ? store.S.sessionsPerUser.get(now - 7*D) : null,
    runs: store ? store.S.countEventType.get('run_complete', since).c : 0,
    shotsN: store ? store.S.countEventType.get('shot', since).c : shots.length,
    signups: store ? store.S.countEventType.get('signup', since).c + store.S.countEventType.get('guest', since).c : 0,
    refs: store ? store.S.referralCount.get(since).c : 0
  };
}
const pctOf = v => v == null ? '—' : v + '%';
function noStore(){
  return `<div class="panel"><h2>No database attached</h2>
    <p class="note">This server is running without <b>PERSIST=1</b>, so nothing is being
    recorded and there is nothing to show. Analytics needs the database; restart with
    persistence on and the numbers start accumulating from that moment.</p></div>`;
}

/* ========================= OVERVIEW ========================= */
function tabOverview(c){
  const { now, D, since, days, keep, rangeBar } = c;
  const s = coreStats(since, now);
  const spw = (s.sessions7 && s.sessions7.people) ? (s.sessions7.total / s.sessions7.people).toFixed(1) : null;
  const gamesPer = s.accounts.length ? (s.runs / s.accounts.length).toFixed(1) : '0';
  const viral = s.signups ? Math.round(s.refs / s.signups * 100) : null;
  const avgSession = s.time && s.time.avg_ms ? dur(s.time.avg_ms) : '—';
  const totalTime = s.time && s.time.ms ? dur(s.time.ms) : '—';

  // Signups per day, straight from the events table so the chart survives
  // a redeploy. Days with nothing in them must still appear, or fourteen
  // sparse days render as three fat bars and read as a boom.
  let chart = '';
  if (store){
    const rows = new Map(store.S.signupsPerDay.all(now - 14*D).map(r => [r.d, r.c]));
    const keys = Array.from({length:14}, (_,i) => new Date(now - (13-i)*D).toISOString().slice(0,10));
    const vals = keys.map(k => rows.get(k) || 0);
    const max = Math.max(1, ...vals);
    chart = `<div class="panel"><h2>New players <i>LAST 14 DAYS</i></h2>
      <div class="bars">${vals.map((n,i) => `<i class="${n?'':'z'}" style="height:${n?Math.max(4,n/max*96):2}px"
        title="${keys[i]}: ${n}"></i>`).join('')}</div>
      <div class="axis"><span>${keys[0].slice(5)}</span><span>peak ${max}/day</span><span>${keys[13].slice(5)}</span></div></div>`;
  }

  // Where, condensed: the full picture lives on its own tab, but "which
  // countries" is a thing you want to see without going looking.
  let geoMini = '';
  if (store){
    const rows = store.S.whereCountries.all(since).filter(r => r.country).slice(0,5);
    if (rows.length){
      const top = Math.max(1, ...rows.map(r => r.people));
      geoMini = `<div class="panel"><h2>Top countries <i>BY PLAYERS</i></h2>
        ${rankList(rows.map(r => ({ n:r.people, label: geo.flag(r.country) + ' ' + esc(geo.countryName(r.country)),
          right: r.people + (r.people===1?' player':' players') })), top)}
        <p class="note"><a href="${keep({ tab:'where' })}">Full breakdown →</a></p></div>`;
    }
  }

  const feed = store ? store.S.recentNotable.all(14)
    : events.filter(e => e.type !== 'shot' && e.type !== 'puzzle_answer').slice(-14).reverse()
        .map(e => ({ type:e.type, handle_lower:e.handle, at:e.at,
                     meta_json: e.meta ? JSON.stringify(e.meta) : null }));

  return `
    <h1>Overview</h1>
    <p class="sub">Everything on this page comes from the live database and survives a redeploy.
      The range control changes every number below it.</p>
    ${rangeBar}
    ${cardRow([
      metric(num(s.accounts.length), 'Registered players',
        s.guests.length + ' playing as guests', 'hero'),
      metric(num(s.dau), 'Active today', s.wau + ' this week · ' + s.mau + ' this month'),
      metric(totalTime, 'Time played', 'across ' + num(s.time ? s.time.sessions : 0) + ' visits in ' +
        (days > 365 ? 'all time' : days + ' days'), 'teal'),
      metric(avgSession, 'Average visit', `<a href="${keep({ tab:'time' })}">length breakdown →</a>`, 'teal'),
      metric(pctOf(s.d1 && s.d1.pct), 'Day-1 return',
        s.d1 ? 'of ' + s.d1.size + ' who joined 2 days ago' : 'nobody joined 2 days ago yet'),
      metric(pctOf(s.d7 && s.d7.pct), 'Day-7 return',
        s.d7 ? 'of ' + s.d7.size + ' in that cohort' : 'no cohort yet'),
      metric(spw || '—', 'Visits per player / week', 'over the last 7 days', 'violet'),
      metric(gamesPer, 'Rounds finished per player', num(s.runs) + ' finished · ' + num(s.shotsN) + ' shots taken', 'violet')
    ])}
    <div class="grid2">
      ${chart}
      ${geoMini}
    </div>
    <div class="panel"><h2>Live activity <i>AUTO-REFRESHES · SHOTS OMITTED</i></h2>
      <div class="scroll"><table><tr><th>When</th><th>Event</th><th>Player</th><th>Detail</th></tr>
      ${feed.map(e => `<tr><td class="mono">${new Date(e.at).toLocaleTimeString('en-GB')}</td>
        <td><span class="pill">${esc(e.type)}</span></td>
        <td>${esc(e.handle_lower || '—')}</td>
        <td class="mono">${esc((e.meta_json || '').slice(0,90))}</td></tr>`).join('') ||
        emptyRow(4, 'Nothing has happened yet.')}
      </table></div></div>
    <p class="sub" style="margin-top:14px">Retention counts people who <b>signed up</b> that many days
      ago and came back since — not whoever happens to be online. The number beside it is the cohort size;
      a percentage built on two people is noise.</p>
    <script>setTimeout(()=>location.reload(), 30000)<\/script>`;
}

/* ========================= TIME PLAYED ========================= */
function tabTime(c){
  const { now, D, since, days, rangeBar } = c;
  if (!store) return `<h1>Time played</h1>${noStore()}`;
  const t = store.S.timeTotals.get(since);
  const eng = store.S.timeEngaged.get(since);
  const buckets = store.S.timeBuckets.all(since);
  const perDay = store.S.timePerDay.all(since);
  const top = store.S.timeTopPlayers.all();

  const B = [
    { k:0, label:'Under a minute', color:'#E5484D', hint:'opened and left' },
    { k:1, label:'1–5 min',        color:'#F2A03D', hint:'one round or so' },
    { k:2, label:'5–15 min',       color:'#35D6C1', hint:'a proper sitting' },
    { k:3, label:'15–30 min',      color:'#3DD68C', hint:'absorbed' },
    { k:4, label:'30 min +',       color:'#8B7CF6', hint:'lost track of time' }
  ];
  const bm = new Map(buckets.map(b => [b.b, b.c]));
  const totalS = buckets.reduce((a,b) => a + b.c, 0);
  const split = totalS ? `<div class="split">${B.map(b => {
      const n = bm.get(b.k) || 0; if (!n) return '';
      const p = n/totalS*100;
      return `<i style="width:${p}%;background:${b.color}" title="${b.label}: ${n}">${p >= 9 ? Math.round(p)+'%' : ''}</i>`;
    }).join('')}</div>
    <div class="splitkey">${B.map(b => { const n = bm.get(b.k) || 0;
      return `<span><i style="background:${b.color}"></i>${b.label} — ${n} <span style="color:var(--dim)">(${b.hint})</span></span>`;
    }).join('')}</div>` : '<p class="empty">No visits recorded in this range.</p>';

  const maxDay = Math.max(1, ...perDay.map(d => d.ms));
  const dayChart = perDay.length ? `<div class="bars">${perDay.map(d =>
      `<i style="height:${Math.max(4, d.ms/maxDay*96)}px" title="${d.day}: ${dur(d.ms)} over ${d.n} visits"></i>`).join('')}</div>
    <div class="axis"><span>${perDay[0].day.slice(5)}</span><span>busiest day ${dur(maxDay)}</span>
      <span>${perDay[perDay.length-1].day.slice(5)}</span></div>` : '<p class="empty">Nothing yet.</p>';

  const bounce = totalS ? Math.round((bm.get(0)||0) / totalS * 100) : null;

  return `
    <h1>Time played</h1>
    <p class="sub">How long people stay, not just whether they showed up. A visit is one sitting —
      requests less than 30 minutes apart belong to the same one.</p>
    ${rangeBar}
    ${cardRow([
      metric(dur(t.ms), 'Total time played', num(t.sessions) + ' visits by ' + num(t.people) + ' people', 'hero'),
      metric(dur(t.avg_ms), 'Average visit', 'everyone, including instant bounces'),
      metric(dur(eng.avg_ms), 'Average real visit', num(eng.sessions) + ' visits over a minute long', 'teal'),
      metric(dur(t.max_ms), 'Longest single visit', 'one player, one sitting', 'violet'),
      metric(bounce == null ? '—' : bounce + '%', 'Bounced',
        'opened the game and left inside a minute', bounce != null && bounce > 40 ? '' : 'muted'),
      metric(t.people ? dur(t.ms / t.people) : '—', 'Per player', 'total, across the whole range', 'teal')
    ])}

    <div class="panel"><h2>How long a visit lasts <i>SHAPE, NOT AVERAGE</i></h2>
      <p class="note">An average of twelve minutes means something very different when it is
        everybody at twelve than when it is half bouncing and half playing for half an hour.
        This is the half the average hides.</p>
      ${split}</div>

    <div class="panel"><h2>Time played per day</h2>${dayChart}</div>

    <div class="panel"><h2>Who plays the most <i>ALL TIME</i></h2>
      <div class="scroll"><table>
        <tr><th>Player</th><th></th><th class="num">Visits</th><th class="num">Total time</th>
          <th class="num">Average</th><th class="num">Last seen</th></tr>
        ${top.map(u => `<tr>
          <td><a href="/admin/user?handle=${encodeURIComponent(u.handle)}">${esc(u.handle)}</a></td>
          <td>${u.country ? geo.flag(u.country) + ' <span style="color:var(--dim);font-size:11px">' +
            esc(geo.countryName(u.country)) + '</span>' : ''}</td>
          <td class="num">${u.sessions}</td><td class="num">${dur(u.ms)}</td>
          <td class="num">${dur(u.ms / Math.max(1,u.sessions))}</td>
          <td class="num mono">${new Date(u.last_at).toLocaleDateString('en-GB')}</td></tr>`).join('') ||
          emptyRow(6, 'Nobody has played yet.')}
      </table></div></div>

    <div class="panel"><h2>What this number actually measures</h2>
      <p class="note">A visit is timed from its first request to its last. The game sends a
        heartbeat once a minute while the tab is in front of the player, so thinking time —
        studying a scene, working out an aperture — is counted, which it was not before.
        Whatever happens after the final heartbeat is still invisible, so these figures are
        a slight <b>under</b>-count, never an over-count. Background tabs do not beat, so a
        window left open overnight cannot invent eight hours of play.</p></div>`;
}

/* ========================= WHEN ========================= */
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function tabWhen(c){
  const { since, rangeBar } = c;
  if (!store) return `<h1>When people play</h1>${noStore()}`;
  const heat = store.S.whenHeat.all(since);
  const hours = store.S.whenHours.all(since);
  const dows = store.S.whenDows.all(since);
  const cov = store.S.whenKnown.get(since);

  if (!heat.length){
    return `<h1>When people play</h1>${rangeBar}
      <div class="panel"><h2>Nothing to show yet</h2>
        <p class="note">No visit in this range has a timezone recorded. Local-time tracking
          starts the first time a player loads the updated game — visits from before that, and
          from anyone still on a cached build, are counted everywhere else on this dashboard
          but cannot be placed on a clock.</p></div>`;
  }

  const cell = new Map(heat.map(r => [r.d + ':' + r.h, r.c]));
  const maxCell = Math.max(1, ...heat.map(r => r.c));
  /* The colour ramp is curved rather than linear. Spread thinly over 168
     cells, early data puts almost every cell between one and three visits,
     and a straight scale paints the whole grid the same mid-teal -- it
     looks like a pattern when it is noise. Raising the ratio to a power
     holds the low end down so the genuine peaks are the only bright cells.
     `floor` keeps a single visit visible rather than invisible. */
  const shade = n => {
    if (!n) return 0;
    return 0.10 + 0.90 * Math.pow(n / maxCell, 1.35);
  };
  const grid = DOW.map((name, d) => `<b>${name}</b>${
    Array.from({length:24}, (_,h) => {
      const n = cell.get(d + ':' + h) || 0;
      return `<i title="${name} ${String(h).padStart(2,'0')}:00 — ${n} visit${n===1?'':'s'}"${
        n ? ` style="background:rgba(53,214,193,${shade(n).toFixed(2)})"` : ''}></i>`;
    }).join('')}`).join('');
  // Honest about its own resolution: below a handful of visits in the
  // busiest cell there is no pattern here to read, and saying so beats
  // letting someone plan a release around four people.
  const thin = maxCell < 6 ? `<p class="note" style="margin-top:10px">Still thin — the busiest
    single slot has only ${maxCell} visit${maxCell===1?'':'s'} in it, so treat the grid as
    decoration for now and read the hour chart below instead. It becomes worth acting on at
    roughly ten visits in the busiest cell.</p>` : '';

  const hm = new Map(hours.map(r => [r.h, r.c]));
  const maxH = Math.max(1, ...hours.map(r => r.c));
  const hourBars = Array.from({length:24}, (_,h) => {
    const n = hm.get(h) || 0;
    return `<i class="${n?'':'z'}" style="height:${n?Math.max(4,n/maxH*84):2}px"
      title="${String(h).padStart(2,'0')}:00 — ${n}"></i>`;
  }).join('');

  const dm = new Map(dows.map(r => [r.d, r.c]));
  const maxD = Math.max(1, ...dows.map(r => r.c));
  const totalDow = dows.reduce((a,b) => a + b.c, 0);

  // The headline: the single busiest hour, and how the week splits.
  const peak = heat.slice().sort((a,b) => b.c - a.c)[0];
  const peakHour = hours.slice().sort((a,b) => b.c - a.c)[0];
  const weekend = dows.filter(r => r.d === 0 || r.d === 6).reduce((a,b) => a + b.c, 0);
  const wkndPct = totalDow ? Math.round(weekend / totalDow * 100) : 0;
  const evening = hours.filter(r => r.h >= 17 && r.h <= 23).reduce((a,b) => a + b.c, 0);
  const evePct = totalDow ? Math.round(evening / hours.reduce((a,b)=>a+b.c,0) * 100) : 0;
  const hh = h => String(h).padStart(2,'0') + ':00';

  return `
    <h1>When people play</h1>
    <p class="sub">Every time on this page is the player's <b>own</b> clock, not the server's.
      Somebody in Tokyo playing after dinner shows up at 8pm here, the same as somebody in Denver.</p>
    ${rangeBar}
    ${cardRow([
      metric(peakHour ? hh(peakHour.h) : '—', 'Busiest hour',
        peakHour ? num(peakHour.c) + ' visits started in this hour' : '', 'hero'),
      metric(peak ? DOW[peak.d] + ' ' + hh(peak.h) : '—', 'Busiest single slot',
        peak ? num(peak.c) + ' visits' : '', 'teal'),
      metric(evePct + '%', 'Play in the evening', '5pm to midnight, local', 'violet'),
      metric(wkndPct + '%', 'Play at the weekend',
        wkndPct > 34 ? 'weekend-weighted' : 'spread through the week')
    ])}

    <div class="panel"><h2>The week, hour by hour <i>PLAYER LOCAL TIME</i></h2>
      <p class="note">Darker is busier. This is the panel that tells you when to release an
        update, when to send a notification, and when a server restart costs nobody anything.</p>
      <div class="heat"><b></b>${Array.from({length:24}, (_,h) =>
        `<span style="font:500 8.5px/1 var(--mono);color:var(--dim);text-align:center;align-self:end">${
          h % 3 === 0 ? h : ''}</span>`).join('')}${grid}</div>
      <div class="legend">Quiet <i style="background:var(--line)"></i>
        <i style="background:rgba(53,214,193,.3)"></i><i style="background:rgba(53,214,193,.6)"></i>
        <i style="background:rgba(53,214,193,1)"></i> Busiest (${maxCell})</div>
      ${thin}</div>

    <div class="panel"><h2>By hour of day <i>ALL SEVEN DAYS COMBINED</i></h2>
      <p class="note">The same visits as the grid above, stacked. With less data this is the
        one to trust: seven times as many visits land in each bar.</p>
      <div class="hours" style="height:120px">${hourBars}</div>
      <div class="hourax">${Array.from({length:24}, (_,h) => `<span>${h%2===0?h:''}</span>`).join('')}</div>
    </div>

    <div class="grid2">
      <div class="panel"><h2>By day of week</h2>
        <table>${DOW.map((name,d) => { const n = dm.get(d) || 0;
          return `<tr><td style="width:48px">${name}</td>
            <td><div style="height:9px;border-radius:5px;background:var(--line)">
              <div style="height:9px;border-radius:5px;width:${Math.max(2,n/maxD*100)}%;
                background:${d===0||d===6?'var(--violet)':'var(--gold)'}"></div></div></td>
            <td class="num" style="width:64px">${n}</td></tr>`; }).join('')}</table>
        <p class="note">Weekend days in violet.</p>
      </div>
      <div class="panel"><h2>Coverage</h2>
        <p class="note">${num(cov.known)} of ${num(cov.total)} visits in this range
          (${cov.total ? Math.round(cov.known/cov.total*100) : 0}%) carry a local clock.</p>
        <p class="note">The rest are visits from before local-time tracking existed, or players
          still on a cached build that has not picked the change up yet. They count towards every
          other number on this dashboard — they simply cannot be placed on a clock. The share
          climbs on its own as old caches expire.</p>
      </div>
    </div>`;
}

/* ========================= WHERE ========================= */
function tabWhere(c){
  const { since, rangeBar } = c;
  if (!store) return `<h1>Where people play</h1>${noStore()}`;
  const countries = store.S.whereCountries.all(since);
  const langs = store.S.whereLangs.all(since);
  const devices = store.S.whereDevices.all(since);
  const known = countries.filter(r => r.country);
  const unknown = countries.find(r => !r.country);

  const totalPeople = known.reduce((a,b) => a + b.people, 0);
  const maxPeople = Math.max(1, ...known.map(r => r.people));

  // Regions, rolled up. When every country is still showing ones and twos,
  // the continent is the number with any signal in it.
  const regions = new Map();
  for (const r of known){
    const key = geo.regionOf(r.country);
    const agg = regions.get(key) || { people:0, sessions:0, ms:0 };
    agg.people += r.people; agg.sessions += r.sessions; agg.ms += (r.ms || 0);
    regions.set(key, agg);
  }
  const regionRows = [...regions.entries()].sort((a,b) => b[1].people - a[1].people);
  const maxRegion = Math.max(1, ...regionRows.map(r => r[1].people));

  const devTotal = devices.reduce((a,b) => a + b.sessions, 0);
  const DEV = { phone:['Phone','#35D6C1'], tablet:['Tablet','#8B7CF6'], desktop:['Desktop','#F2A03D'] };

  return `
    <h1>Where people play</h1>
    <p class="sub">Country comes from the timezone the player's device reports — a setting, not a
      position. It is accurate to the country and deliberately no finer: everyone from Maine to
      Miami reports <span class="pill">America/New_York</span>. No IP address is ever looked up
      or stored for this.</p>
    ${rangeBar}
    ${cardRow([
      metric(num(known.length), 'Countries', 'with at least one visit', 'hero'),
      metric(known[0] ? geo.flag(known[0].country) + ' ' + esc(geo.countryName(known[0].country)) : '—',
        'Biggest country', known[0] ? known[0].people + ' of ' + totalPeople + ' players' : '', 'teal'),
      metric(num(regionRows.length), 'Regions', regionRows.map(r => r[0]).slice(0,3).join(' · '), 'violet'),
      metric(devTotal ? Math.round((devices.find(d=>d.device==='phone')||{sessions:0}).sessions/devTotal*100)+'%' : '—',
        'Playing on a phone', 'of all visits in range')
    ])}

    <div class="grid2">
      <div class="panel"><h2>By country <i>PLAYERS · VISITS · TIME</i></h2>
        ${rankList(known.slice(0,18).map(r => ({
          n: r.people,
          label: geo.flag(r.country) + ' ' + esc(geo.countryName(r.country)),
          right: r.people + ' · ' + r.sessions + ' · ' + dur(r.ms)
        })), maxPeople) || '<p class="empty">No location recorded yet.</p>'}
        ${unknown ? `<p class="note">${num(unknown.people)} player${unknown.people===1?'':'s'}
          (${num(unknown.sessions)} visits) reported no timezone — an older cached build, or a
          browser locked down enough to refuse the question. They are counted everywhere else.</p>` : ''}
      </div>

      <div class="panel"><h2>By region</h2>
        ${rankList(regionRows.map(([name,a]) => ({
          n: a.people, label: esc(name), right: a.people + ' · ' + dur(a.ms)
        })), maxRegion) || '<p class="empty">Nothing yet.</p>'}
        <p class="note">Worth watching more than the country list while the numbers are small —
          a continent moving is signal, one player in Belgium is not.</p>
      </div>
    </div>

    <div class="grid2">
      <div class="panel"><h2>Devices <i>AND HOW LONG THEY STAY</i></h2>
        ${devTotal ? `<div class="split">${devices.sort((a,b)=>b.sessions-a.sessions).map(d => {
            const p = d.sessions/devTotal*100, meta = DEV[d.device] || [d.device,'#78829B'];
            return `<i style="width:${p}%;background:${meta[1]}" title="${meta[0]}: ${d.sessions}">${
              p>=12?Math.round(p)+'%':''}</i>`; }).join('')}</div>
          <table><tr><th>Device</th><th class="num">Visits</th><th class="num">Players</th>
            <th class="num">Average visit</th></tr>
          ${devices.map(d => { const meta = DEV[d.device] || [d.device,'#78829B'];
            return `<tr><td><span style="display:inline-block;width:8px;height:8px;border-radius:2px;
              background:${meta[1]};margin-right:7px"></span>${esc(meta[0])}</td>
              <td class="num">${d.sessions}</td><td class="num">${d.people}</td>
              <td class="num">${dur(d.avg_ms)}</td></tr>`; }).join('')}</table>
          <p class="note">If phone visits are markedly shorter than desktop ones, that is a
            phone problem to go and find, not a preference.</p>`
          : '<p class="empty">No device data yet.</p>'}
      </div>

      <div class="panel"><h2>Languages <i>DEVICE SETTING</i></h2>
        ${rankList(langs.map(l => ({ n:l.c, label: esc(l.lang), right: l.c + (l.c===1?' player':' players') })))
          || '<p class="empty">Nothing yet.</p>'}
        <p class="note">What their device is set to, not what they read. A language that keeps
          appearing is the first real argument for translating the game.</p>
      </div>
    </div>`;
}

/* ========================= PLAYERS ========================= */
function tabPlayers(c){
  const { qs, keep } = c;
  const all = [...users.values()];
  const q = (qs.get('q') || '').trim().toLowerCase();
  const sort = qs.get('sort') || 'created';
  let rows = all.filter(u => !q || u.handle.toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q));
  const sorters = {
    created:  (a,b) => b.createdAt - a.createdAt,
    lastSeen: (a,b) => b.lastSeenAt - a.lastSeenAt,
    xp:       (a,b) => b.xp - a.xp,
    duel:     (a,b) => b.duelRating - a.duelRating
  };
  rows.sort(sorters[sort] || sorters.created);
  const total = rows.length;
  rows = rows.slice(0, 60);

  // Time played per player, fetched once for the page rather than per row.
  const timeBy = new Map();
  if (store) for (const r of store.S.timeTopPlayers.all()) timeBy.set(r.handle.toLowerCase(), r);

  const sortLink = (key, label) =>
    `<a href="${keep({ tab:'players', q, sort:key })}"${sort===key?' class="on"':''}>${label}</a>`;

  return `
    <h1>Players</h1>
    <p class="sub">${num(total)} match${total===1?'':'es'}. Newest first unless you sort otherwise.</p>
    <div class="panel">
      <form method="GET" action="/admin" style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap">
        <input type="hidden" name="tab" value="players">
        <input type="hidden" name="sort" value="${esc(sort)}">
        <input type="text" name="q" value="${esc(q)}" placeholder="Search handle or email" style="flex:1;min-width:190px">
        <button class="btn ghost">Search</button>
        ${q ? `<a class="btn ghost" style="text-decoration:none;display:inline-block" href="${keep({ tab:'players' })}">Clear</a>` : ''}
      </form>
      <div class="scroll"><table>
        <tr><th>Handle</th><th>Type</th><th>From</th><th>${sortLink('created','Joined')}</th>
          <th>${sortLink('lastSeen','Last seen')}</th><th class="num">Time played</th>
          <th class="num">${sortLink('xp','XP')}</th><th class="num">${sortLink('duel','Duel')}</th><th></th></tr>
        ${rows.map(u => { const t = timeBy.get(u.handleLower); return `<tr>
          <td><a href="/admin/user?handle=${encodeURIComponent(u.handle)}">${esc(u.handle)}</a></td>
          <td><span class="pill${u.banned ? ' banned' : (u.guest?'':' acct')}">${
            u.banned ? 'suspended' : (u.guest?'guest':'account')}</span></td>
          <td>${u.country ? geo.flag(u.country) + ' <span style="color:var(--dim);font-size:11.5px">' +
            esc(geo.countryName(u.country)) + '</span>' : '<span style="color:var(--dim)">—</span>'}</td>
          <td class="mono">${new Date(u.createdAt).toLocaleDateString('en-GB')}</td>
          <td class="mono">${new Date(u.lastSeenAt||u.createdAt).toLocaleDateString('en-GB')}</td>
          <td class="num">${t ? dur(t.ms) : '—'}</td>
          <td class="num">${num(u.xp)}</td><td class="num">${u.duelRating}</td>
          <td style="white-space:nowrap">
            <form class="inline" method="POST" action="/admin/user/ban">
              <input type="hidden" name="handle" value="${esc(u.handle)}">
              ${u.banned ? '<input type="hidden" name="unban" value="1">' : ''}
              <button class="btn ${u.banned ? 'ghost' : 'warn'} sm">${u.banned ? 'Unsuspend' : 'Suspend'}</button></form>
            <form class="inline" method="POST" action="/admin/user/delete"
              onsubmit="return confirm('Delete ${esc(u.handle)}? This removes their shots, sessions and event history too. It cannot be undone. Suspending is reversible — consider that first.')">
              <input type="hidden" name="handle" value="${esc(u.handle)}">
              <button class="btn danger sm">Delete</button></form></td></tr>`; }).join('') ||
          emptyRow(9, q ? 'Nobody matches that search.' : 'No players yet.')}
      </table></div>
      ${total > 60 ? `<p class="note">Showing the first 60 of ${num(total)} — narrow the search to see more.</p>` : ''}
    </div>`;
}

/* ========================= CONTENT ========================= */
function tabContent(c){
  const { rangeBar } = c;
  const accounts = [...users.values()].filter(u => !u.guest);
  const templateStats = new Map();
  for (const [n, s] of PUZZLE_STATS){
    const t = s.template || '(unknown)';
    const agg = templateStats.get(t) || { attempts:0, correct:0 };
    agg.attempts += s.attempts; agg.correct += s.correct;
    templateStats.set(t, agg);
  }
  const hardest = [...templateStats.entries()].filter(([,a]) => a.attempts >= 3)
    .map(([t,a]) => ({ t, rate:a.correct/a.attempts, attempts:a.attempts }))
    .sort((a,b) => a.rate - b.rate).slice(0,14);

  let live = 0, bot = 0;
  if (store) for (const r of store.S.duelKindSplit.all()){
    if (r.k === 'live') live = r.c; else if (r.k === 'bot') bot = r.c;
  }
  const duelTotal = live + bot;
  const topXp = accounts.slice().sort((a,b) => b.xp - a.xp).slice(0,10);
  const topDuel = accounts.filter(u => u.duels.w+u.duels.l+u.duels.t > 0)
    .sort((a,b) => b.duelRating - a.duelRating).slice(0,10);
  const perUser = store ? store.S.gamesPerUser.all() : [];
  const topRef = store ? store.S.topReferrers.all() : [];

  return `
    <h1>Content</h1>
    <p class="sub">Which rounds and puzzles are landing, and which are quietly too hard.</p>
    ${cardRow([
      metric(num(duelTotal), 'Duels played',
        duelTotal ? live + ' live · ' + bot + ' against the fallback' : 'none yet', 'hero'),
      metric(duelTotal ? Math.round(live/duelTotal*100) + '%' : '—', 'Matched with a real person',
        'the rest got a recorded run or a bot', 'teal'),
      metric(num(templateStats.size), 'Puzzle templates seen', hardest.length + ' with enough answers to judge', 'violet')
    ])}

    ${progressionFunnel()}

    <div class="panel"><h2>Hardest puzzle templates <i>3+ ATTEMPTS</i></h2>
      <p class="note">A pass rate under about 35% usually means the question is unclear rather than
        hard. Read the bottom of this list as a bug report, not a difficulty curve.</p>
      <div class="scroll"><table><tr><th>Template</th><th class="num">Pass rate</th><th class="num">Attempts</th><th>Shape</th></tr>
      ${hardest.map(h => { const p = Math.round(h.rate*100);
        return `<tr><td>${esc(h.t)}</td><td class="num" style="color:${p<35?'var(--red)':p<60?'var(--gold)':'var(--green)'}">${p}%</td>
        <td class="num">${h.attempts}</td>
        <td style="width:34%"><div style="height:8px;border-radius:4px;background:var(--line)">
          <div style="height:8px;border-radius:4px;width:${p}%;background:${p<35?'var(--red)':p<60?'var(--gold)':'var(--green)'}"></div>
        </div></td></tr>`; }).join('') || emptyRow(4, 'Not enough answers yet.')}
      </table></div></div>

    <div class="grid2">
      <div class="panel"><h2>Most engaged players</h2>
        <table><tr><th>Handle</th><th class="num">Shots</th><th class="num">Visits</th><th class="num">Joined</th></tr>
        ${perUser.map(u => `<tr><td>${esc(u.handle)}</td><td class="num">${u.shots}</td>
          <td class="num">${u.sessions}</td>
          <td class="num mono">${new Date(u.created_at).toLocaleDateString('en-GB')}</td></tr>`).join('') ||
          emptyRow(4, 'Nobody yet.')}
        </table></div>

      <div class="panel"><h2>Who is bringing people in</h2>
        <table><tr><th>Referrer</th><th class="num">Signups from their link</th></tr>
        ${topRef.map(r => `<tr><td>${esc(r.referrer)}</td><td class="num">${r.c}</td></tr>`).join('') ||
          emptyRow(2, 'No referrals yet. Players share a link ending in /?ref=THEIRNAME')}
        </table></div>
    </div>

    <div class="grid2">
      <div class="panel"><h2>Top by XP</h2>
        <table><tr><th>Handle</th><th class="num">XP</th><th class="num">Puzzle rating</th></tr>
        ${topXp.map(u => `<tr><td>${esc(u.handle)}</td><td class="num">${num(u.xp)}</td>
          <td class="num">${u.puzzles.rating}</td></tr>`).join('') || emptyRow(3, 'Nobody yet.')}
        </table></div>
      <div class="panel"><h2>Top by duel rating</h2>
        <table><tr><th>Handle</th><th class="num">Rating</th><th class="num">W–L–T</th></tr>
        ${topDuel.map(u => `<tr><td>${esc(u.handle)}</td><td class="num">${u.duelRating}</td>
          <td class="num">${u.duels.w}–${u.duels.l}–${u.duels.t}</td></tr>`).join('') || emptyRow(3, 'No duels yet.')}
        </table></div>
    </div>`;
}

/* How far players get. Built from the `bests` table -- every personal best
   ever recorded, from every version of the game -- so it covers the whole
   player base back to day one, not just people who have played since the
   unlock system changed. "Reached" means a best in any round there;
   "cleared" means every round at a C or better, which is what opens the
   next location. */
function progressionFunnel(){
  if (!store || !LOCATION_ORDER.length) return '';
  let reached = new Map(), cleared = new Map();
  try {
    for (const r of store.S.funnelReached.all()) reached.set(r.loc, r.n);
    for (const r of store.S.funnelCleared.all(GRADE_C)) cleared.set(r.loc, r.n);
  } catch(e){ return ''; }
  const top = Math.max(1, ...LOCATION_ORDER.map(l => reached.get(l.id) || 0));
  const rows = LOCATION_ORDER.map((l, i) => {
    const n = reached.get(l.id) || 0, c = cleared.get(l.id) || 0;
    return `<tr><td>${i < 2 ? '<span class="pill acct">open</span>' : '<span class="pill">earned</span>'}</td>
      <td>${esc(l.name)}</td>
      <td style="width:38%"><div style="height:9px;border-radius:5px;background:var(--line)">
        <div style="height:9px;border-radius:5px;width:${Math.max(2, n/top*100)}%;background:var(--gold)"></div></div></td>
      <td class="num">${num(n)}</td><td class="num">${num(c)}</td>
      <td class="num">${n ? Math.round(c/n*100) + '%' : '—'}</td></tr>`;
  }).join('');
  return `<div class="panel"><h2>How far players get <i>ALL TIME</i></h2>
    <p class="note">The first two locations are open to everyone; each one after opens when every
      round in the location before it has a C or better. A big drop between two rows is the
      difficulty wall to look at.</p>
    <div class="scroll"><table><tr><th></th><th>Location</th><th></th><th class="num">Reached</th>
      <th class="num">Cleared</th><th class="num">Clear rate</th></tr>${rows}</table></div></div>`;
}

/* ========================= MONEY ========================= */
function tabMoney(c){
  const { since, rangeBar } = c;
  const rev = store ? store.S.revenueTotal.get(since) : { cents:0, n:0 };
  const revAll = store ? store.S.revenueTotal.get(0) : { cents:0, n:0 };
  const log = store ? store.S.recentPurchases.all(25)
    : events.filter(e => e.type === 'purchase').slice(-25).reverse()
        .map(e => ({ handle_lower:e.handle, at:e.at, meta_json: JSON.stringify(e.meta) }));
  const payers = new Set(log.map(r => r.handle_lower)).size;

  return `
    <h1>Money</h1>
    <p class="sub">The store is currently off in the client build, so these are the mechanics
      waiting behind it rather than live takings.</p>
    ${rangeBar}
    ${cardRow([
      metric(fmtCents(revAll.cents), 'Revenue, all time', num(revAll.n) + ' sales', 'hero'),
      metric(fmtCents(rev.cents), 'Revenue, this range', num(rev.n) + ' sales', 'teal'),
      metric(num(payers), 'Distinct buyers', 'in the last 25 sales', 'violet')
    ])}

    <div class="panel"><h2>Ad performance${adSlot.sold ? ' — ' + esc(adSlot.name) : ''}</h2>
      ${adStatsHTML()}</div>

    <div class="panel"><h2>The sold slot</h2>
      <form method="POST" action="/admin/ads">
        <div class="flag"><input type="checkbox" name="sold" id="adsold" ${adSlot.sold?'checked':''}>
          <label for="adsold"><b>Slot is sold and live.</b> Unticked means no ads shown to anyone.</label></div>
        <div class="scroll"><table style="margin-top:10px">
          <tr><th style="width:150px">Advertiser</th><td><input type="text" name="name" value="${esc(adSlot.name)}" style="width:100%"></td></tr>
          <tr><th>Billing ref (sku)</th><td><input type="text" name="sku" value="${esc(adSlot.sku)}" style="width:100%"></td></tr>
          <tr><th>Link URL</th><td><input type="text" name="url" value="${esc(adSlot.url)}" style="width:100%"></td></tr>
          <tr><th>Label</th><td><input type="text" name="label" value="${esc(adSlot.label)}" style="width:100%"></td></tr>
          <tr><th>Line</th><td><input type="text" name="line" value="${esc(adSlot.line)}" style="width:100%"></td></tr>
          <tr><th>Call to action</th><td><input type="text" name="cta" value="${esc(adSlot.cta)}" style="width:100%"></td></tr>
          <tr><th>Shown as</th><td><input type="text" name="display" value="${esc(adSlot.display)}" style="width:100%"></td></tr>
          <tr><th>Interstitial every</th><td><input type="text" name="everyNRuns" value="${adSlot.everyNRuns}" style="width:60px"> rounds
            &nbsp;for <input type="text" name="seconds" value="${adSlot.seconds}" style="width:50px"> seconds</td></tr>
        </table></div>
        <button class="btn" style="margin-top:12px">Save advertiser</button>
      </form>
      <p class="note">Changes reach players on their next app open — no redeploy. Supporters never see any of it.</p>
    </div>

    <div class="panel"><h2>Recent purchases</h2>
      <div class="scroll"><table><tr><th>Player</th><th>Item</th><th class="num">Amount</th><th class="num">When</th></tr>
      ${log.map(r => { let m = {}; try { m = JSON.parse(r.meta_json || '{}'); } catch(e){}
        return `<tr><td>${esc(r.handle_lower)}</td><td>${esc(m.sku || '—')}</td>
        <td class="num">${fmtCents(m.cents || 0)}</td>
        <td class="num mono">${new Date(r.at).toLocaleString('en-GB')}</td></tr>`; }).join('') ||
        emptyRow(4, 'No sales yet.')}
      </table></div></div>`;
}

/* ========================= SETTINGS ========================= */
function tabSettings(){
  const f = config.features || {};
  return `
    <h1>Settings</h1>
    <p class="sub">These take effect on each player's next app open. No redeploy, no downtime.</p>
    <div class="panel"><h2>Feature flags</h2>
      <form method="POST" action="/admin/flags">
        <div class="flag"><input type="checkbox" name="liveDuels" id="fd1" ${f.liveDuels!==false?'checked':''}>
          <label for="fd1"><b>Live 1v1 matchmaking.</b> Off means the Duel tab offers practice only.</label></div>
        <div class="flag"><input type="checkbox" name="boards" id="fd2" ${f.boards!==false?'checked':''}>
          <label for="fd2"><b>Public leaderboards.</b> Off hides every board from every player.</label></div>
        <button class="btn" style="margin-top:8px">Save flags</button>
      </form></div>

    <div class="panel"><h2>What this dashboard collects, and what it does not</h2>
      <p class="note">Country and local time come from the timezone a player's browser reports —
        a device setting, accurate to the country and no finer. <b>No IP address is geolocated or
        stored for analytics</b>, and no third-party service sees any of it. The privacy policy in the
        game says exactly this; if the method here ever changes, that text has to change first.</p>
      <p class="note">Deleting a player from the Players tab removes their sessions, shots, puzzle
        answers and event history as well as their login — not just their ability to sign in.</p></div>

    <div class="panel"><h2>Before real money is involved</h2>
      <p class="note">This portal is protected by a password and nothing else. A password is one
        leak away from everything on it. Put an IP allowlist, a VPN or a second factor in front of
        <span class="pill">/admin</span> before there is anything here worth stealing. SERVER.md has
        the specifics.</p></div>`;
}

/* What you can actually put in front of an advertiser: impressions, clicks
   and a click-through rate, split by placement so you can tell them which
   slot performs -- and, just as importantly, how many people are NOT
   seeing ads because they paid not to. */
function adStatsHTML(){
  const now = Date.now(), day = 86400000;
  const imps = adEvents.filter(e => e.kind === 'impression');
  const clicks = adEvents.filter(e => e.kind === 'click');
  const imps7 = imps.filter(e => e.at >= now - 7*day).length;
  const clicks7 = clicks.filter(e => e.at >= now - 7*day).length;
  // How many people the ad pushed toward paying to remove it -- the number
  // that tells you whether ads are earning more than they cost you in
  // Supporter conversions, which is the only version of this question worth
  // asking.
  const upsell = adEvents.filter(e => e.kind === 'noads_tap').length;
  const ctr = imps.length ? (clicks.length / imps.length * 100).toFixed(2) : '0.00';
  const supporters = [...users.values()].filter(u => (u.owns||[]).includes('supporter')).length;
  const slots = {};
  for (const e of adEvents){
    const k = e.slot || '(unknown)';
    slots[k] = slots[k] || { imp:0, click:0 };
    if (e.kind === 'noads_tap') continue;      // counted separately above
    slots[k][e.kind === 'click' ? 'click' : 'imp']++;
  }
  const rows = Object.entries(slots).sort((a,b)=>b[1].imp-a[1].imp).map(([k,v]) =>
    `<tr><td>${esc(k)}</td><td>${v.imp}</td><td>${v.click}</td>
     <td>${v.imp ? (v.click/v.imp*100).toFixed(2) : '0.00'}%</td></tr>`).join('');
  return `<div class="cards" data-n="6">
      <div class="card"><b>${imps.length}</b><span>IMPRESSIONS, ALL TIME</span></div>
      <div class="card"><b>${imps7}</b><span>IMPRESSIONS, 7D</span></div>
      <div class="card"><b>${clicks.length}</b><span>CLICKS (${clicks7} / 7D)</span></div>
      <div class="card"><b>${ctr}%</b><span>CLICK-THROUGH RATE</span></div>
      <div class="card"><b>${upsell}</b><span>"REMOVE ADS" TAPS</span></div>
      <div class="card"><b>${supporters}</b><span>AD-FREE SUPPORTERS</span></div>
    </div>
    <table><tr><th>Placement</th><th>Impressions</th><th>Clicks</th><th>CTR</th></tr>
    ${rows || '<tr><td colspan=4>No ad activity yet.</td></tr>'}</table>`;
}

function renderUserLookup(handle){
  const u = users.get(String(handle||'').toLowerCase());
  if (!u) return adminPage(`<p><a href="/admin">&larr; Back</a></p><p>No account named "${esc(handle)}".</p>`);
  return adminPage(`<p><a href="/admin">&larr; Back</a></p>
    <h1>${esc(u.handle)}</h1>
    <p class="sub">${u.guest ? 'Guest account' : 'Registered account'} · created ${new Date(u.createdAt).toLocaleString()}</p>
    <table>
      <tr><th>Email</th><td>${esc(u.email || '—')}</td></tr>
      <tr><th>XP</th><td>${u.xp}</td></tr>
      <tr><th>Puzzle rating</th><td>${u.puzzles.rating} (${u.puzzles.solved} solved)</td></tr>
      <tr><th>Duel record</th><td>${u.duels.w}-${u.duels.l}-${u.duels.t}, rating ${u.duelRating}</td></tr>
      <tr><th>Owns</th><td>${(u.owns||[]).join(', ') || '—'}</td></tr>
      <tr><th>Best scores</th><td>${Object.keys(u.bests||{}).length} rounds</td></tr>
    </table>
    <form method="POST" action="/admin/user/delete" onsubmit="return confirm('Delete this account? This cannot be undone.')">
      <input type="hidden" name="handle" value="${esc(u.handle)}">
      <button class="btn danger">Delete this account</button>
    </form>`);
}

/* ---- routes ---- */
async function api(req, res, url){
  const p = url.pathname, m = req.method;
  const u = auth(req);

  if (p === '/v1/health') return send(res, 200, { ok:true, at: Date.now() });
  if (p === '/v1/config') return send(res, 200, config);
  // The client asks this before showing the Google button, so a deployment
  // can turn social sign-in off without a client release.
  if (p === '/v1/legal') return send(res, 200, {
    googleEnabled: !!process.env.GOOGLE_CLIENT_ID, termsVersion: config.termsVersion || '2026-08-01' });

  /* Google sign-in.

     THIS ROUTE USED TO BASE64-DECODE THE TOKEN AND BELIEVE IT. A JWT is
     three dot-separated parts and only the third is a signature; decoding
     the middle one tells you what the sender WROTE, not what Google said.
     So anybody could post a token they typed themselves --

         {"sub":"whatever","email":"someone@example.com"}

     -- and the lookup below, which matches an existing account by email,
     handed back a full session for that person. Every account that had
     ever given an email address could be opened by anyone who knew the
     address. No password, no interaction with Google at all.

     It is verified properly now: signature against Google's published
     keys, issuer, audience and expiry. See verifyGoogleIdToken(). */
  if (p === '/v1/auth/google' && m === 'POST'){
    const b = await body(req);
    if (!b.credential) return err(res, 400, 'No credential.');
    if (!GOOGLE_CLIENT_ID)
      return err(res, 503, 'Google sign-in is not configured on this server.');
    let claims;
    try { claims = await verifyGoogleIdToken(String(b.credential)); }
    catch(e){
      // Never echo the reason to the caller -- "wrong audience" versus "bad
      // signature" is a free debugging service for whoever is probing.
      console.error('google auth rejected: ' + e.message);
      return err(res, 401, 'That Google sign-in could not be verified. Try again.');
    }
    const sub = claims.sub, email = claims.email || null;
    if (!sub) return err(res, 400, 'Google token had no subject.');
    /* Matching an existing account by EMAIL is only safe because the token
       is now verified AND Google says it checked the address. Without
       email_verified, anyone able to set an unverified address on a Google
       account could aim it at somebody else's ShutterBlip account. The
       `sub` match above is the primary key; email is the fallback for an
       account that registered with the form first. */
    const emailTrusted = !!(email && claims.email_verified === true);
    let user = [...users.values()].find(x => x.googleSub === sub)
            || (emailTrusted ? [...users.values()].find(x => x.email && x.email.toLowerCase() === email.toLowerCase()) : null);
    if (!user){
      // A new account. Social sign-in must clear the SAME consents as the
      // form — 428 tells the client to collect them and try again.
      if (!b.acceptedTerms || !b.ageConfirmed)
        return err(res, 428, 'Accept the terms and confirm your age.');
      let handle = (claims.given_name || (email||'player').split('@')[0] || 'player')
        .replace(/[^A-Za-z0-9_]/g,'').slice(0,12) || 'player';
      if (!HANDLE_RX.test(handle) || BAD_WORDS.test(handle)) handle = 'player';
      let base = handle, i = 1;
      while (users.has(handle.toLowerCase())) handle = (base + (++i)).slice(0,16);
      user = newUser(handle, email, crypto.randomBytes(16).toString('hex'), b);
      user.googleSub = sub;
      users.set(handle.toLowerCase(), user);
      logEvent('signup', handle, { via:'google' });
    } else if (!user.googleSub) user.googleSub = sub;      // link to an existing account
    if (user.banned) return err(res, 403, 'This account is suspended.');
    const t = newToken(); tokens.set(t, user.handle.toLowerCase());
    return send(res, 200, { token:t, me: me(user) });
  }

  // Live availability check. The client calls this as the player types, so
  // "that name is taken" arrives before they commit to it rather than after.
  // Reserving is still done by register/claim -- this only reports.
  if (p === '/v1/auth/check'){
    const h = String(url.searchParams.get('handle') || '').trim();
    if (!HANDLE_RX.test(h)) return send(res, 200, { available:false, reason:'format' });
    if (BAD_WORDS.test(h))  return send(res, 200, { available:false, reason:'blocked' });
    return send(res, 200, { available: !users.has(h.toLowerCase()), reason: users.has(h.toLowerCase()) ? 'taken' : null });
  }

  /* Guest numbers. Handed out by the server so two guests can never collide,
     which is the whole point of the number. A guest is a real row -- it can
     hold XP and progress and can later be upgraded to a full account without
     losing any of it -- but it has no password and cannot reach the
     leaderboards or live 1v1, because there is nothing to stop one person
     minting a thousand of them. */
  /* The counter used to start at 1000 in process memory with no collision
     check, so the FIRST guest after any restart was handed "Guest1001" --
     a name an earlier guest was already using. usersAdapter.set() sees an
     existing row and UPDATEs it, so that player's XP, purchases and
     credentials were overwritten by a stranger, and both people's tokens
     then pointed at the same account.

     Reproduced exactly: guest with 4,321 XP, restart, next visitor taps
     Play now, row is back to 0 XP and the original token now opens the
     newcomer's account.

     Two guards now, because either alone would have prevented it and both
     are cheap: the counter is seeded from what is actually in the database
     at boot, and this loop refuses to reuse a name regardless. */
  if (p === '/v1/auth/guest' && m === 'POST'){
    let handle = 'Guest' + (++guestCounter), tries = 0;
    while (users.has(handle.toLowerCase())){
      if (++tries > 10000) return err(res, 503, 'Could not create a guest just now. Try again.');
      handle = 'Guest' + (++guestCounter);
    }
    const user = newUser(handle, null, crypto.randomBytes(16).toString('hex'), { acceptedTerms:true, ageConfirmed:true });
    user.guest = true;
    users.set(handle.toLowerCase(), user);
    logEvent('guest', handle, null);
    const t = newToken(); tokens.set(t, handle.toLowerCase());
    // `resume` is the guest's only credential. The client keeps it beside
    // the profile and hands it back to /v1/auth/resume if the token ever
    // lapses, so a returning guest lands in their own account instead of
    // being shown the sign-up door.
    return send(res, 200, { token:t, me: me(user), guest:true, resume: user.recoveryCode });
  }

  /* Getting back in without a password.

     For a guest this is the whole point -- they have no other credential,
     and before this route existed a lapsed token meant their XP,
     purchases and badges were simply unreachable forever while the game
     cheerfully greeted them by name.

     For a registered account it is the recovery code shown at sign-up,
     finally doing what the screen always claimed it would. That one is
     single use: it is consumed on success and a new one issued, so a code
     read over somebody's shoulder a year ago is not a permanent key. */
  /* FORGOTTEN PASSWORD. The "I have forgotten my password" form has always
     posted here, and the route did not exist -- a player who tried it was
     told "Sign in first", which is the one thing they could not do.

     The recovery code shown at sign-up proves ownership. On success: new
     password, every other session on every device signed out (a person
     recovering an account may be recovering it FROM someone), and a fresh
     single-use code issued, since this one is now spent. */
  if (p === '/v1/auth/recover' && m === 'POST'){
    const b = await body(req);
    const handle = String(b.handle || '').trim();
    const code = String(b.code || '').trim().toUpperCase();
    const pw = String(b.newPassword || '');
    if (!HANDLE_RX.test(handle) || !code) return err(res, 400, 'Enter your username and your recovery code.');
    if (pw.length < 8) return err(res, 400, 'The new password needs 8 characters or more.');
    const user = users.get(handle.toLowerCase());
    if (!user || user.guest || !user.recoveryHash || !timingSafeEq(hash(code, user.salt), user.recoveryHash))
      return err(res, 401, 'That username and code do not match.');
    if (user.banned) return err(res, 403, 'This account is suspended.');
    const salt = crypto.randomBytes(12).toString('hex');
    const fresh = Array.from({length:4}, () => crypto.randomBytes(2).toString('hex').toUpperCase()).join('-');
    user.salt = salt; user.pw = hash(pw, salt);
    user.recoveryCode = fresh; user.recoveryHash = hash(fresh, salt);
    if (store){ try { store.S.dropUserTokens.run(user.handle.toLowerCase()); } catch(e){} }
    else for (const [tk, k] of tokens) if (k === user.handle.toLowerCase()) tokens.delete(tk);
    const t2 = newToken(); tokens.set(t2, user.handle.toLowerCase());
    logEvent('login', user.handle, { via:'recover' });
    return send(res, 200, { token:t2, me: me(user), recoveryCode: fresh });
  }

  if (p === '/v1/auth/resume' && m === 'POST'){
    const b = await body(req);
    const handle = String(b.handle || '').trim();
    const code = String(b.resume || b.code || '').trim().toUpperCase();
    if (!HANDLE_RX.test(handle) || !code) return err(res, 400, 'Need a username and a code.');
    const user = users.get(handle.toLowerCase());
    // One generic message: whether the name exists is not something an
    // unauthenticated caller gets to learn by watching the error change.
    const no = () => err(res, 401, 'That code does not match.');
    if (!user || !user.recoveryHash) return no();
    if (!timingSafeEq(hash(code, user.salt), user.recoveryHash)) return no();
    if (user.banned) return err(res, 403, 'This account is suspended.');
    const t2 = newToken(); tokens.set(t2, user.handle.toLowerCase());
    let fresh = null;
    if (!user.guest){
      fresh = Array.from({length:4}, () => crypto.randomBytes(2).toString('hex').toUpperCase()).join('-');
      user.recoveryCode = fresh; user.recoveryHash = hash(fresh, user.salt);
    }
    logEvent('login', user.handle, { via:'resume' });
    return send(res, 200, { token:t2, me: me(user), guest: !!user.guest, recoveryCode: fresh });
  }

  if (p === '/v1/auth/register' && m === 'POST'){
    const b = await body(req);
    const handle = String(b.handle||'').trim();
    if (!HANDLE_RX.test(handle)) return err(res, 400, 'Username: 3–16 letters, numbers or underscores.');
    if (BAD_WORDS.test(handle)) return err(res, 400, 'Pick a different username.');
    if (users.has(handle.toLowerCase())) return err(res, 409, 'That username is taken.');
    if (String(b.password||'').length < 8) return err(res, 400, 'Password needs 8 characters or more.');
    if (!b.acceptedTerms) return err(res, 400, 'You need to accept the terms.');
    if (!b.ageConfirmed) return err(res, 400, 'You need to confirm your age.');
    const user = newUser(handle, b.email, b.password, b);
    users.set(handle.toLowerCase(), user);
    logEvent('signup', handle, null);
    // Viral rate: a referral row exists only when someone actually signed up
    // through another player's link, so the number is real rather than
    // inferred from a traffic source.
    const ref = sec.str(b.ref, 16);
    if (store && ref && ref.toLowerCase() !== handle.toLowerCase() && users.has(ref)){
      try { store.S.addReferral.run(handle.toLowerCase(), ref, Date.now());
        logEvent('referral', handle, { referrer: ref }); } catch(e){}
    }
    const t = newToken(); tokens.set(t, handle.toLowerCase());
    return send(res, 200, { token:t, me: me(user), recoveryCode: user.recoveryCode });
  }
  if (p === '/v1/auth/login' && m === 'POST'){
    const b = await body(req); const login = String(b.login||'').trim().toLowerCase();
    const user = users.get(login) || [...users.values()].find(x => x.email && x.email.toLowerCase() === login);
    if (!user || !timingSafeEq(hash(String(b.password||''), user.salt), user.pw)) return err(res, 401, 'Wrong username or password.');
    // Checked AFTER the password, so the message cannot be used to find out
    // which usernames are suspended. auth() refuses a suspended account on
    // every route anyway, but handing out a token it will then refuse makes
    // the client think it signed in and then immediately "lose" the session.
    if (user.banned) return err(res, 403, 'This account is suspended.');
    const t = newToken(); tokens.set(t, user.handle.toLowerCase());
    logEvent('login', user.handle, null);
    return send(res, 200, { token:t, me: me(user) });
  }

  if (p === '/v1/board') return board(res, url);          // public read
  /* The leaderboard screen has always asked for these two addresses and
     neither existed, so the runs board showed "COULD NOT REACH THE BOARD"
     for every level and every time range. Public reads; a signed-in caller
     also gets their own position. Guests and suspended accounts never
     appear. */
  if (p === '/v1/leaderboard/general' && m === 'GET') return generalBoard(req, res);
  const lbm = p.match(/^\/v1\/leaderboard\/([a-z0-9_]{2,16}-\d{1,2})$/);
  if (lbm && m === 'GET') return levelBoard(req, res, url, lbm[1]);
  if (p === '/v1/catalogue') return send(res, 200, { items: CATALOGUE });

  // The client reads this at boot. Never send the logo from here in
  // production -- serve it as a normal cached image URL instead, or every
  // player downloads it inline on every cold start.
  if (p === '/v1/ads'){
    if (!adSlot.sold) return send(res, 200, { sold:false });
    const { sold, sku, name, url, label, line, cta, display, everyNRuns, seconds } = adSlot;
    return send(res, 200, { sold, sku, name, url, label, line, cta, display, everyNRuns, seconds });
  }
  // Impressions and clicks. Deliberately accepts unauthenticated posts --
  // guests see ads too and their views are worth the same to an advertiser.
  // PRODUCTION: rate-limit this per IP. It is the one write endpoint an
  // unauthenticated caller can reach, so it is the one worth abusing to
  // inflate a sponsor's numbers; a capped, deduplicated count protects both
  // you and the advertiser.
  if (p === '/v1/ads/event' && m === 'POST'){
    const b = await body(req);
    const list = Array.isArray(b.events) ? b.events.slice(0, 50) : [];
    for (const e of list){
      if (e && (e.kind === 'impression' || e.kind === 'click' || e.kind === 'noads_tap')){
        adEvents.push({ kind:e.kind, slot:String(e.slot||'').slice(0,24),
                        sku:String(e.sku||adSlot.sku).slice(0,32),
                        handle: u ? u.handle : null, at: Date.now() });
      }
    }
    return send(res, 200, { ok:true, accepted:list.length });
  }

  if (!u) return err(res, 401, 'Sign in first.');

  if (p === '/v1/me' && m === 'GET') return send(res, 200, me(u));

  /* The heartbeat. It does nothing except exist: reaching this line means
     auth() has already run, which is what extends the session.

     Without it, "time played" measured the gap between a player's first and
     last API REQUEST, and a player who is doing the actual thing the game
     is for -- looking at a scene, thinking about the aperture, framing the
     shot -- makes no requests at all while doing it. A twenty-minute round
     of careful play could score as two minutes. The client beats once a
     minute while the tab is visible, so the measurement is now out by at
     most a minute rather than by however long someone spent thinking. */
  if (p === '/v1/beat') return send(res, 200, { ok:true });

  /* A location opened for this player. Only location ids the game actually
     has are accepted -- this lands in the events table and on the admin
     dashboard, so it must not be a place to write arbitrary strings. */
  if (p === '/v1/progress/unlock' && m === 'POST'){
    const b = await body(req);
    const known = new Set([...LEVEL_IDS].map(id => id.replace(/-\d+$/, '')));
    const locs = (Array.isArray(b.locs) ? b.locs : []).map(String).filter(x => known.has(x)).slice(0, 5);
    for (const loc of locs) logEvent('unlock', u.handle, { loc });
    return send(res, 200, { ok:true, logged: locs.length });
  }

  /* SIGNING OUT USED TO BE A CLIENT-SIDE FICTION. The client forgot the
     token; the server went on accepting it for the rest of its life. On a
     shared or borrowed device, "sign out" left a working session behind,
     and there was no way at all to kill a token that had leaked.

     Two routes, because they answer different questions. `logout` ends
     this session. `logout-all` ends every session on every device, which
     is what somebody wants the moment they think their account is not
     theirs alone any more. */
  if (p === '/v1/auth/logout' && m === 'POST'){
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ')) tokens.delete(h.slice(7));
    return send(res, 200, { ok:true });
  }
  // Older copies of the game call it by this name; same thing.
  if ((p === '/v1/auth/logout-all' || p === '/v1/auth/signout-everywhere') && m === 'POST'){
    if (store){ try { store.S.dropUserTokens.run(u.handleLower); } catch(e){} }
    else for (const [t, k] of tokens) if (k === u.handleLower) tokens.delete(t);
    return send(res, 200, { ok:true, message:'Signed out everywhere.' });
  }

  if (p === '/v1/profile/equip' && m === 'PUT'){
    const b = await body(req);
    u.equipped = { skin: b.skin || null, badge: b.badge || null };
    return send(res, 200, { ok:true, equipped: u.equipped });
  }

  /* Upgrade a guest to a real account IN PLACE. The row keeps its id, its
     XP, its bests and its puzzle rating -- only the handle, password and
     email change. Anything else would mean telling a player who has put in
     three hours that signing up costs them their progress, which is exactly
     how you train people never to sign up. */
  if (p === '/v1/auth/upgrade' && m === 'POST'){
    if (!u.guest) return err(res, 409, 'This account is already registered.');
    const b = await body(req);
    const handle = String(b.handle||'').trim();
    if (!HANDLE_RX.test(handle)) return err(res, 400, 'Username: 3-16 letters, numbers or underscores.');
    if (BAD_WORDS.test(handle)) return err(res, 400, 'Pick a different username.');
    if (users.has(handle.toLowerCase()) && users.get(handle.toLowerCase()) !== u)
      return err(res, 409, 'That username is taken.');
    if (String(b.password||'').length < 8) return err(res, 400, 'Password needs 8 characters or more.');
    if (!b.acceptedTerms || !b.ageConfirmed) return err(res, 400, 'Accept the terms and confirm your age.');
    const old = u.handle;
    // Rename in place. The in-memory path can delete-then-reinsert safely
    // because nothing else references the key; the database path CANNOT --
    // deleting cascades their tokens, purchases, shots and best scores, so
    // the upgrade would hand a player a brand new empty account and log
    // them out. Found by testing an actual guest upgrade end to end.
    if (store) store.renameUser(old.toLowerCase(), handle);
    else users.delete(old.toLowerCase());
    u.handle = handle; u.handleLower = handle.toLowerCase(); u.guest = false;
    u.email = b.email || null;
    u.name = (b.name || '').slice(0,60) || null;
    const minYear = new Date().getFullYear() - 13;
    u.birthYear = Number.isInteger(b.birthYear) && b.birthYear <= minYear ? b.birthYear : null;
    u.salt = crypto.randomBytes(12).toString('hex');
    u.pw = hash(b.password, u.salt);
    /* A new salt makes the old recovery hash unverifiable, and the guest's
       code was their device resume key, never shown to them. So a player
       who upgraded had no working recovery code at all. They get a real
       one now, shown once, exactly like a direct sign-up. */
    const rc = Array.from({length:4}, () => crypto.randomBytes(2).toString('hex').toUpperCase()).join('-');
    u.recoveryCode = rc; u.recoveryHash = hash(rc, u.salt);
    u.consent = { acceptedTerms:true, termsVersion: b.termsVersion || null,
                  ageConfirmed:true, marketingOk: !!b.marketingOk };
    // the rename above already moved every child row in the database case
    if (store) store.persist(u); else users.set(handle.toLowerCase(), u);
    if (!store) for (const [t,k] of tokens) if (k === old.toLowerCase()) tokens.set(t, handle.toLowerCase());
    for (const sh of shots) if (sh.handle === old) sh.handle = handle;
    for (const e of events) if (e.handle === old) e.handle = handle;
    logEvent('upgrade', handle, null);
    return send(res, 200, { me: me(u), upgraded:true, recoveryCode: rc });
  }
  // NOTE: there is intentionally no rename endpoint. A handle on a public
  // leaderboard has to be stable or the board means nothing -- you could
  // farm a high score, rename, and farm again, and nobody could tell who
  // anyone was. If you ever add one, it must be rate-limited to about once
  // a year AND carry the score history with it.
  if (p === '/v1/me/handle' && m === 'POST') return err(res, 403, 'Usernames are permanent.');
  if (p === '/v1/me/practiced-duel' && m === 'POST'){ u.livePracticed = true; return send(res, 200, { ok:true, livePracticed:true }); }
  /* The privacy policy says a player can download everything held about
     them. That promise binds every column we add, not just the ones that
     existed when it was written -- so the visit history and the device
     details that the analytics were built on go in here too. Anything
     recorded and left out of this response makes the policy untrue. */
  if (p === '/v1/me/export'){
    const sessions = store
      ? store.S.allSessionsOf.all(u.handleLower).map(s => ({
          startedAt: s.started_at, endedAt: s.last_beat_at,
          durationMs: s.last_beat_at - s.started_at,
          timeZone: s.tz, country: s.country, language: s.lang, deviceType: s.device,
          localHour: s.local_hour, localDayOfWeek: s.local_dow }))
      : [];
    return send(res, 200, {
      ...me(u),
      // From the database: the in-memory list only holds shots since the
      // last restart, so an export built from it silently left out history.
      shots: store ? store.S.shotsListOf.all(u.handleLower) : shots.filter(s => s.handle === u.handle),
      device: { timeZone: u.tz || null, country: u.country || null,
                language: u.lang || null, type: u.device || null },
      visits: sessions
    });
  }
  if (p === '/v1/me/delete' && m === 'POST'){ scrubAccount(u.handle); return send(res, 200, { ok:true }); }

  /* PRODUCTION: this is a Stripe Checkout Session, not a purchase. Create
     one with `stripe.checkout.sessions.create`, put the sku in `metadata`,
     and return its real `url` — the client already just redirects there.
     Ownership must be granted from the `checkout.session.completed`
     WEBHOOK, verified with the Stripe signature header, never from this
     endpoint or from anything the client tells you afterward. This mock
     grants instantly because it has no payment processor behind it; that
     shortcut is the one thing in this file that must never reach a build
     real money touches. */
  /* CHECKOUT.

     THIS USED TO GRANT THE ITEM IMMEDIATELY, with no payment anywhere in
     the path. One request -- `{"sku":"pack.all"}` with any valid token --
     and the caller owned every location pack, the Supporter badge and
     permanent ad removal, for nothing. It also wrote a `purchase` event
     with the item's price into the events table, so the admin dashboard's
     revenue figure could be inflated to any number by anyone. That is
     worse than the free unlock: a revenue figure you might one day show an
     advertiser or a buyer, that a stranger can type.

     It now refuses rather than pretending. Entitlements may only ever be
     granted by `grantPurchase()`, which is called from the Stripe webhook
     after the signature is verified -- never from a request the player
     made. A client cannot be the source of truth for what it has paid for,
     however convenient that is to build.

     TO TURN THE STORE ON: create a Stripe Checkout Session here and return
     its real `url` (the client already just redirects to it), then verify
     `checkout.session.completed` in the webhook below. SERVER.md has the
     specifics. Until then the store stays off, which it already is in the
     client build. */
  if (p === '/v1/purchase/checkout' && m === 'POST'){
    const b = await body(req);
    const item = CATALOGUE.find(i => i.sku === b.sku);
    if (!item || !item.price_cents) return err(res, 400, 'No such item.');
    if ((u.owns||[]).includes(item.sku)) return err(res, 409, 'Already owned.');
    if (!STRIPE_SECRET_KEY)
      return err(res, 503, 'The store is not open yet.');
    // PRODUCTION: stripe.checkout.sessions.create({ ... metadata:{ sku, handle } })
    // and return its url. Deliberately unimplemented rather than faked, so
    // that nothing here can grant an entitlement by accident.
    return err(res, 501, 'Checkout is not wired up on this server yet.');
  }
  if (p === '/v1/store/redeem' && m === 'POST'){
    const b = await body(req);
    const item = CATALOGUE.find(i => i.sku === b.sku);
    if (!item || !item.blip_price) return err(res, 400, 'Not redeemable with Blips.');
    if ((u.owns||[]).includes(item.sku)) return err(res, 409, 'Already owned.');
    if ((u.blips||0) < item.blip_price) return err(res, 402, 'Not enough Blips.');
    u.blips -= item.blip_price;
    u.owns = [...new Set([...(u.owns||[]), ...grantsFor(item.sku)])];
    return send(res, 200, { balance: u.blips, granted: grantsFor(item.sku) });
  }

  if (p === '/v1/shots' && m === 'POST'){
    const b = await body(req);
    // PRODUCTION MUST RE-SIMULATE b.frame HERE. This mock trusts the posted
    // score -- and note the field name: the client sends `clientScore`,
    // deliberately, so that a server author reading this cannot mistake it
    // for an authoritative number. Re-derive it from b.frame before you
    // trust it for anything public.
    const n = Number(b.clientScore != null ? b.clientScore : b.score);
    const score = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    /* The level id goes into the database, onto the leaderboard and into
       the player's bests, so it has to be a level that exists. It used to
       be whatever string arrived, which let anyone invent a level and sit
       at the top of a board for it. */
    const levelId = String(b.levelId || '');
    if (LEVEL_IDS.size && !LEVEL_IDS.has(levelId)) return err(res, 400, 'No such level.');

    shots.push({ handle:u.handle, levelId, score, at: Date.now(), day: dayKey() });
    if (store){
      store.S.addShot.run(u.handleLower, levelId, score, Date.now(), dayKey());
      store.S.setBest.run(u.handleLower, levelId, score);
    }
    if (!(u.bests[levelId] >= score)) u.bests[levelId] = score;
    /* XP USED TO BE WHATEVER THE CLIENT ASKED FOR: `+b.xp` with no ceiling
       and no integer check. `{"xp":999999999}` bought any rank title
       instantly, and `{"xp":1e308}` made the stored value non-finite, after
       which every attempt to persist that player threw.

       It is derived from the score now and the client's figure is ignored.
       The score itself is still the client's word -- re-simulating the
       frame server-side is the open item and the only real fix -- but at
       least the reward is bounded by something the server computed. */
    /* The same streak bonus the game shows. The server used to credit a
       flat score x 2, while the game added up to +75% for clean frames in
       a row -- so a player's XP visibly SHRANK the next time they signed
       in and the server's figure replaced the game's. The streak is counted
       here, from this player's own shots in this run, not taken on trust. */
    const rk = String(u.handle).toLowerCase(), prevRun = RUNS.get(rk);
    const run = (prevRun && Date.now() - prevRun.at < 30*60*1000 && Number(b.runShot) !== 0)
      ? prevRun : { hot:0, warm:0 };
    const gC = (config.grades && config.grades.C) || 66;
    run.hot = score >= ((config.grades && config.grades.A) || 88) ? run.hot + 1 : 0;
    run.warm = (score >= gC && !b.missed) ? run.warm + 1 : 0;
    run.at = Date.now(); RUNS.set(rk, run);
    const sb = Number(config.streakBonus) || 0, xm = Number(config.xpMult) || 1;
    const mult = 1 + Math.min(run.hot, 5) * sb + Math.min(run.warm, 5) * sb * 0.4;
    u.xp = Math.min(MAX_XP, (Number.isFinite(u.xp) ? u.xp : 0) + Math.round(score * 2 * mult * xm));
    logEvent('shot', u.handle, { levelId, score });
    // A finished RUN (all five shots of a location) is the completion metric
    // that matters -- a single shot is a tap, a completed run is engagement.
    if (b.runComplete){
      logEvent('run_complete', u.handle, { loc:String(b.loc||'').slice(0,16), avg:+(+b.runAvg||0).toFixed(1) });
    }
    return send(res, 200, { accepted:true, score, trusted:false });
  }

  return apiRest(req, res, url, u);   // puzzles and duels live below, past the board
}
function board(res, url){
  {
    const scope = url.searchParams.get('scope') || 'all', win = url.searchParams.get('window') || 'all';
    if (scope === 'puzzles') return send(res, 200, [...users.values()].filter(x=>!x.guest && x.puzzles.attempted)
      .sort((a,b)=>b.puzzles.rating-a.puzzles.rating).slice(0,50)
      .map((x,i)=>({ rank:i+1, handle:x.handle, rating:x.puzzles.rating, solved:x.puzzles.solved, streak:x.puzzles.streak })));
    if (scope === 'duels') return send(res, 200, [...users.values()].filter(x=>!x.guest && (x.duels.w+x.duels.l+x.duels.t>0))
      .sort((a,b)=>b.duelRating-a.duelRating).slice(0,50)
      .map((x,i)=>({ rank:i+1, handle:x.handle, rating:x.duelRating, w:x.duels.w, l:x.duels.l })));
    const level = url.searchParams.get('level');
    if (store){
      // From the database, so it survives a restart.
      const rows = store.S.boardRuns.all({ day: win === 'day' ? dayKey() : null, level: level || null });
      return send(res, 200, rows.map((r, i) => ({ rank: i + 1, handle: r.handle, score: r.score, runs: r.runs })));
    }
    // The runs board reads the shots log rather than the user list, so it
    // needs its own guest filter -- the other two boards filter on the user
    // object and this one would otherwise have leaked guests onto the most
    // visible leaderboard in the game.
    const isGuest = h => { const u = users.get(String(h).toLowerCase()); return !u || u.guest; };
    const pool = shots.filter(s => !isGuest(s.handle)
      && (win !== 'day' || s.day === dayKey()) && (!level || s.levelId === level));
    const best = new Map(); for (const s of pool){ const k = s.handle; if (!best.has(k) || best.get(k).score < s.score) best.set(k, s); }
    return send(res, 200, [...best.values()].sort((a,b)=>b.score-a.score).slice(0,50).map((s,i)=>({ rank:i+1, handle:s.handle, score:s.score, runs: pool.filter(x=>x.handle===s.handle).length })));
  }
}
const parseEquipped = j => { try { return j ? JSON.parse(j) : null; } catch(e){ return null; } };
function levelBoard(req, res, url, level){
  if (!store) return send(res, 200, { entries: [], you: null });
  const win = url.searchParams.get('window');
  const since = win === 'daily' ? Date.parse(dayKey() + 'T00:00:00Z')
              : win === 'weekly' ? Date.now() - 7 * 86400000 : 0;
  const rows = store.S.boardLevel.all({ level, since });
  const entries = rows.map((r, i) => ({ pos: i + 1, handle: r.handle, score: r.score,
                                        equipped: parseEquipped(r.equipped_json) }));
  let you = null;
  const me = auth(req);
  if (me && !me.guest){
    const b = store.S.levelBestOf.get({ me: me.handleLower, level, since });
    if (b && b.score != null) you = { score: b.score,
      rank: store.S.levelRankOf.get({ level, since, score: b.score }).rank };
  }
  return send(res, 200, { entries, you });
}
/* Ranked on the AVERAGE of a player's best three levels -- never the total,
   so buying more levels can never lift anyone up the board. */
function generalBoard(req, res){
  const MIN = 3;
  if (!store) return send(res, 200, { entries: [], minLevels: MIN, you: null });
  const by = new Map();
  for (const r of store.S.allBests.all()){
    const e = by.get(r.handle_lower) || { handle: r.handle, equipped: parseEquipped(r.equipped_json), scores: [] };
    e.scores.push(r.score); by.set(r.handle_lower, e);
  }
  const ranked = [...by.entries()].map(([k, e]) => {
    const top = e.scores.sort((a, b) => b - a).slice(0, MIN);
    return { key: k, handle: e.handle, equipped: e.equipped, levels: e.scores.length, best: top[0],
             score: top.reduce((a, b) => a + b, 0) / MIN, qualified: e.scores.length >= MIN };
  }).filter(e => e.qualified).sort((a, b) => b.score - a.score);
  const entries = ranked.slice(0, 50).map((e, i) => ({ pos: i + 1, handle: e.handle, score: e.score,
    levels: e.levels, best: e.best, equipped: e.equipped }));
  let you = null;
  const me = auth(req);
  if (me && !me.guest){
    const i = ranked.findIndex(e => e.key === me.handleLower);
    const mine = by.get(me.handleLower);
    you = i >= 0 ? { qualified: true, rank: i + 1, total: ranked.length, average: ranked[i].score }
                 : { qualified: false, needed: MIN - ((mine && mine.scores.length) || 0) };
  }
  return send(res, 200, { entries, minLevels: MIN, you });
}

async function apiRest(req, res, url, u){
  const p = url.pathname, m = req.method;

  if (p === '/v1/puzzles' && m === 'GET'){ const q = u.puzzles;
    return send(res, 200, { next:q.next, progress:{ rating:q.rating, solved:q.solved, attempted:q.attempted, streak:q.streak, best_streak:q.bestStreak }, rewards:[], nextReward:null }); }
  /* The same two puzzles for everyone today. The game expects each one
     described -- number, tier, kind, and whether this player has solved it
     -- and this used to send bare numbers, so the card read "TIER undefined",
     opening one requested /v1/puzzles/NaN, and a solved puzzle never showed
     as done. */
  if (p === '/v1/puzzles/daily'){
    const d = Math.floor(Date.now()/86400000);
    const describe = n => {
      const pub = PuzzleGen.publicPuzzle(n);
      const done = store ? !!store.S.isSolved.get(u.handleLower, n) : u.puzzles.solvedSet.has(n);
      return { n, tier: PuzzleGen.tierOf(n), kind: pub.kind === 'camera' ? 'camera' : 'question', done };
    };
    const easy = describe(1 + (d*37)%600), hard = describe(1201 + (d*53)%700);
    return send(res, 200, { day: dayKey(), easy, hard, bothDone: easy.done && hard.done,
                            streak: u.puzzles.streak || 0 });
  }
  const pm = p.match(/^\/v1\/puzzles\/(\d+)(\/answer)?$/);
  if (pm){
    const n = +pm[1], q = u.puzzles;
    if (!pm[2]) return send(res, 200, { ...PuzzleGen.publicPuzzle(n), rating:q.rating });
    const b = await body(req);
    let verdict;
    if (b.choice != null) verdict = PuzzleGen.checkAnswer(n, b.choice);
    else if (b.frame){
      // PRODUCTION: rebuild the measurement from b.frame + b.variant with the
      // shared engine, then checkCamera(n, measurement). The mock has no
      // renderer, so it marks the camera puzzle from a client-supplied
      // measurement if present, else refuses.
      if (!b.measure || typeof b.measure !== 'object') return err(res, 400, 'Nothing to mark.');
      // Numbers only, in sane ranges -- the same trust the shot score gets,
      // and no more. Re-deriving this from b.frame is the real fix.
      const fin = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : 0; };
      const ms = b.measure;
      verdict = PuzzleGen.checkCamera(n, {
        evErr: fin(ms.evErr, -20, 20), motionBlurPX: fin(ms.motionBlurPX, 0, 200),
        bgBlur: fin(ms.bgBlur, 0, 200), panShot: fin(ms.panShot, 0, 1),
        comp: { thirds: fin(ms.comp && ms.comp.thirds, 0, 100) } });
    } else return err(res, 400, 'Nothing to mark.');
    // checkAnswer/checkCamera return null on a kind mismatch (a choice sent
    // for a camera puzzle, or vice versa) rather than throwing — this is
    // the one place that result was never checked, so a malformed request
    // crashed the endpoint with a 500 instead of a clean 400.
    if (!verdict) return err(res, 400, 'That answer does not match this puzzle.');
    // "Have they solved this one before?" -- in memory that was a Set on the
    // user; with a database it is the `solved` table, which is the right
    // place for it (a Set of 2,000 numbers per user does not belong in a
    // column). Handles both so the demo path keeps working.
    const first = store
      ? !store.S.isSolved.get(u.handleLower, n)
      : !q.solvedSet.has(n);
    q.attempted++;
    let change = 0;
    if (verdict.correct){ q.solved++; q.streak++; q.bestStreak = Math.max(q.bestStreak, q.streak);
      if (first){ change = 8 + PuzzleGen.tierOf(n)*2; q.rating += change;
        if (store) store.S.markSolved.run(u.handleLower, n); else q.solvedSet.add(n); } }
    else { q.streak = 0; change = -6; q.rating = Math.max(100, q.rating + change); }
    q.next = Math.min(2000, Math.max(q.next, n+1));
    let template = null; try { template = PuzzleGen.getPuzzle(n).template; } catch(e){}
    const ps = PUZZLE_STATS.get(n) || { attempts:0, correct:0, template };
    ps.attempts++; if (verdict.correct) ps.correct++;
    PUZZLE_STATS.set(n, ps);
    if (store) store.S.bumpPuzzle.run(n, template, verdict.correct ? 1 : 0);
    logEvent('puzzle_answer', u.handle, { n, template, correct: !!verdict.correct });
    return send(res, 200, { correct: verdict.correct, answer: verdict.answer, why: verdict.why, parts: verdict.parts, score: verdict.score,
      rating:q.rating, ratingChange: change, progress:{ rating:q.rating, solved:q.solved, attempted:q.attempted, streak:q.streak, best_streak:q.bestStreak }, next:q.next, unlocked:[] });
  }

  /* ---- live duels ---- */
  if (p === '/v1/duels/queue' && m === 'POST'){
    if (!config.features.liveDuels) return err(res, 503, 'Live matchmaking is off.');
    // Guests CAN duel: a 1v1 is between two people who both showed up, and
    // keeping guests out of it would leave the queue empty at launch for no
    // real gain. What they cannot do is appear on a leaderboard -- see the
    // board queries, which filter guests out. Their duels still resolve
    // normally and still move the OTHER player's rating fairly.
    if (!u.livePracticed) return err(res, 403, 'Play one practice duel first.');
    for (let i = queue.length-1; i >= 0; i--) if (queue[i].handle === u.handle) queue.splice(i,1);   // one entry per account
    const e = { id: rid(), handle:u.handle, rating:u.duelRating, at: Date.now(), lastPoll: Date.now(), matched:null };
    queue.push(e); tryMatch();
    return send(res, 200, { queueId:e.id, rangeText:'FIRST COME, FIRST MATCHED' });
  }
  const qm = p.match(/^\/v1\/duels\/queue\/([a-f0-9]+)(\/bot|\/ghost)?$/);
  if (qm){
    const id = qm[1];
    if (qm[2] === '/ghost' && m === 'POST'){
      if (!store) return err(res, 503, 'Ghost matches need the database build.');
      const g = store.S.randomGhost.get(u.handleLower, Date.now() - 14*86400000);
      if (!g) return err(res, 404, 'No real run available to match against right now.');
      const i = queue.findIndex(e => e.id === id); if (i >= 0) queue.splice(i,1);
      const did = rid();
      const rows = JSON.parse(g.rows_json);
      // Stored as a normal 'live' session with the ghost's real rows already
      // filled in -- the result flow, the ten photographs, the scene-by-
      // scene comparison are all identical to a genuinely live match. The
      // ONLY difference is honesty about when it happened, carried in
      // `ghostPlayedAt` for the client to show plainly rather than bury.
      duels.set(did, { id:did, seed:g.seed, startsAt: Date.now()+1000,
        players:[u.handle, g.handle], results:{ [g.handle]: rows },
        status:'live', createdAt: Date.now(), kind:'ghost', ghostPlayedAt: g.played_at,
        ghostRating: g.rating_at_play });
      return send(res, 200, { duelId:did, seed:g.seed, startsAt: Date.now()+1000,
        opponent:{ handle:g.handle, ghost:true, playedAt:g.played_at } });
    }
    if (qm[2] === '/bot' && m === 'POST'){           // opt into a bot
      const i = queue.findIndex(e => e.id === id); if (i >= 0) queue.splice(i,1);
      const did = rid(), seed = 1 + (crypto.randomBytes(3).readUIntBE(0,3) % 1000000);
      duels.set(did, { id:did, seed, startsAt: Date.now()+1000, players:[u.handle,'BOT'], results:{ BOT: botRows(seed) }, status:'live', createdAt: Date.now(), kind:'bot' });
      return send(res, 200, { duelId:did, seed, startsAt: Date.now()+1000, opponent:{ handle:'Practice Bot', bot:true } });
    }
    if (m === 'DELETE'){ const i = queue.findIndex(e => e.id === id); if (i >= 0) queue.splice(i,1); matchedEntries.delete(id); return send(res, 200, { ok:true }); }
    const hit = matchedEntries.get(id);
    if (hit){ matchedEntries.delete(id); return send(res, 200, { status:'matched', ...hit }); }
    const e = queue.find(x => x.id === id);
    if (!e) return send(res, 200, { status:'expired' });
    e.lastPoll = Date.now(); tryMatch();
    const again = matchedEntries.get(id); if (again){ matchedEntries.delete(id); return send(res, 200, { status:'matched', ...again }); }
    const waited = Date.now() - e.at;
    // Auto-resolve at 10 seconds: a real recorded run if one exists, a
    // practice bot otherwise. No "we found one, tap to accept" round trip --
    // that pause was the part reading as unpolished, not the fallback
    // itself. The player is only ever told, plainly, once it is over.
    if (waited >= AUTO_FALLBACK_MS){
      const gi = queue.findIndex(x => x.id === id); if (gi >= 0) queue.splice(gi,1);
      if (store){
        const g = store.S.randomGhost.get(u.handleLower, Date.now() - 14*86400000);
        if (g){
          const did = rid();
          const rows = JSON.parse(g.rows_json);
          duels.set(did, { id:did, seed:g.seed, startsAt: Date.now()+900,
            players:[u.handle, g.handle], results:{ [g.handle]: rows },
            status:'live', createdAt: Date.now(), kind:'ghost', ghostPlayedAt: g.played_at,
            ghostRating: g.rating_at_play });
          return send(res, 200, { status:'matched', duelId:did, seed:g.seed, startsAt: Date.now()+900,
            opponent:{ handle:g.handle, ghost:true, playedAt:g.played_at } });
        }
      }
      const did = rid(), seed = 1 + (crypto.randomBytes(3).readUIntBE(0,3) % 1000000);
      duels.set(did, { id:did, seed, startsAt: Date.now()+900, players:[u.handle,'BOT'],
        results:{ BOT: botRows(seed) }, status:'live', createdAt: Date.now(), kind:'bot' });
      return send(res, 200, { status:'matched', duelId:did, seed, startsAt: Date.now()+900,
        opponent:{ handle:'Practice Bot', bot:true } });
    }
    return send(res, 200, { status:'waiting', elapsed: waited, rangeText:'FIRST COME, FIRST MATCHED' });
  }
  const dm = p.match(/^\/v1\/duels\/([a-f0-9]+)(\/result)?$/);
  if (dm){
    const d = duels.get(dm[1]); if (!d) return err(res, 404, 'No such duel.');
    if (!d.players.includes(u.handle)) return err(res, 403, 'Not your duel.');
    const other = d.players.find(x => x !== u.handle);
    if (dm[2] && m === 'POST'){
      const b = await body(req);
      if (!Array.isArray(b.rows) || b.rows.length !== 5) return err(res, 400, 'Five rows, please.');
      /* ONE SUBMISSION PER PLAYER PER DUEL. Nothing used to stop a second
         POST of the same body: every replay re-ran settlement, re-applied
         the Elo award and incremented the win count again. A few hundred
         requests -- comfortably inside the rate limit -- put one account on
         top of the duel board for good, and each replay of a live match
         pushed the real opponent's rating down again with it.

         The duel object also lives in memory for the life of the process,
         so the window for that replay was "until the next deploy". */
      if (d.results[u.handle]) return err(res, 409, 'You have already submitted this duel.');
      // PRODUCTION: re-score every row's cam server-side before trusting it.
      d.results[u.handle] = clampDuelRows(b.rows);
      // Three settlement paths, on purpose: a bot never touches rating, a
      // ghost moves ONLY the live player's rating (the recorded player is
      // not present and must never be silently changed), and a real live
      // opponent moves both sides normally. Routing this by d.kind rather
      // than by inspecting `other` is what makes it impossible to send a
      // ghost match down the two-sided path by accident.
      if (d.kind === 'bot') logBotDuel(u.handle, d.seed);
      else if (d.kind === 'ghost') settleGhostDuel(u.handle, d);
      else settleDuel(d);
      if (d.results[other]) return send(res, 200, { status:'done', opponent:{
        handle: other === 'BOT' ? 'Practice Bot' : other, rows: d.results[other],
        bot: other==='BOT', ghost: d.kind==='ghost', playedAt: d.ghostPlayedAt } });
      return send(res, 200, { status:'waiting' });
    }
    if (d.results[other] && d.results[u.handle]) return send(res, 200, { seed:d.seed, startsAt:d.startsAt, status:'done', opponent:{
      handle: other === 'BOT' ? 'Practice Bot' : other, rows:d.results[other],
      bot: other==='BOT', ghost: d.kind==='ghost', playedAt: d.ghostPlayedAt },
      players:d.players.map(h=>({handle:h, bot:h==='BOT'})) });
    return send(res, 200, { seed:d.seed, startsAt:d.startsAt, status:d.status, players:d.players.map(h=>({handle:h, bot:h==='BOT'})) });
  }
  return err(res, 404, 'No such endpoint: ' + p);
}

/* ---- admin dispatch (checked before the game API; entirely separate) ---- */
async function admin(req, res, url){
  const p = url.pathname, m = req.method;
  const ip = clientIp(req);
  const html = (code, body) => { res.writeHead(code, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store' }); res.end(body); };
  const redirect = to => { res.writeHead(302, { Location: to }); res.end(); };

  if (p === '/admin/login' && m === 'POST'){
    if (loginLocked(ip)) return html(429, loginPage('Too many attempts. Wait a moment and try again.'));
    const b = await body(req);
    if (timingSafeEq(String(b.password || ''), ADMIN_PASSWORD)){
      clearFailedLogins(ip);
      const t = newAdminSession();
      res.writeHead(302, { Location:'/admin',
        /* `Secure` was missing, and the server listens on plain HTTP behind
           nginx. One request to http://.../admin before HSTS is pinned --
           a first visit, a new browser profile, a tapped bare-http link --
           sent this cookie in clear text, and whoever was on the same
           café Wi-Fi had twelve hours of admin: every player's email,
           every location, and the delete button.

           Sent over HTTPS only now. Set ADMIN_INSECURE_COOKIE=1 if you
           genuinely need to reach the portal over plain http on localhost
           while developing; never set it on a real server. */
        'Set-Cookie': `sb_admin=${t}; HttpOnly; SameSite=Strict; Max-Age=43200; Path=/admin`
          + (process.env.ADMIN_INSECURE_COOKIE === '1' ? '' : '; Secure') });
      return res.end();
    }
    recordFailedLogin(ip);
    return html(401, loginPage('Wrong password.'));
  }
  if (p === '/admin/logout' && m === 'POST'){
    const cookie = req.headers.cookie || ''; const mm = cookie.match(/sb_admin=([a-f0-9]+)/);
    if (mm) adminSessions.delete(mm[1]);
    res.writeHead(302, { Location:'/admin', 'Set-Cookie':'sb_admin=; Max-Age=0; Path=/admin' }); return res.end();
  }
  if (!validAdminSession(req)) return html(401, loginPage());

  if (p === '/admin' && m === 'GET') return html(200, renderDashboard(url.searchParams));
  if (p === '/admin/user' && m === 'GET') return html(200, renderUserLookup(url.searchParams.get('handle')));
  if (p === '/admin/user/delete' && m === 'POST'){
    const b = await body(req);
    scrubAccount(String(b.handle||''));
    return redirect('/admin?tab=players');
  }
  /* SUSPEND, as an alternative to deletion.

     The `banned` column has existed since the first schema and nothing
     ever set it or read it, which left deletion as the only moderation
     action in the whole portal. On a game with a public leaderboard and
     minors playing it, "the only thing I can do about this person is
     erase them permanently" is not a workable position -- it is
     irreversible, it destroys the evidence, and they re-register a minute
     later anyway.

     Suspending revokes every token immediately (so they are signed out of
     every device mid-session, not at their convenience) and is undone by
     pressing the same button again. auth() refuses a suspended account on
     every authenticated route. */
  if (p === '/admin/user/ban' && m === 'POST'){
    const b = await body(req);
    const key = String(b.handle||'').toLowerCase();
    const u2 = users.get(key);
    if (u2){
      u2.banned = b.unban ? 0 : 1;
      if (store){
        try {
          store.S.setBanned.run(u2.banned, key);
          if (u2.banned) store.S.dropUserTokens.run(key);   // out, now, everywhere
        } catch(e){ console.error('ban: ' + e.message); }
      } else if (u2.banned){
        for (const [t, k] of tokens) if (k === key) tokens.delete(t);
      }
    }
    return redirect('/admin?tab=players');
  }
  if (p === '/admin/ads' && m === 'POST'){
    const b = await body(req);
    adSlot.sold = !!b.sold;
    for (const k of ['name','sku','url','label','line','cta','display'])
      if (typeof b[k] === 'string') adSlot[k] = b[k].slice(0, 300);
    const n = parseInt(b.everyNRuns, 10), sec = parseInt(b.seconds, 10);
    if (n >= 1 && n <= 50) adSlot.everyNRuns = n;
    if (sec >= 1 && sec <= 30) adSlot.seconds = sec;
    return redirect('/admin');
  }
  if (p === '/admin/flags' && m === 'POST'){
    const b = await body(req);
    config.features = { liveDuels: !!b.liveDuels, boards: !!b.boards };
    return redirect('/admin');
  }
  return html(404, adminPage('<p>Not found. <a href="/admin">Back</a></p>'));
}

/* ---- static + dispatch ---- */
/* Which rate-limit bucket a path falls into. Auth is tightest because it
   is the one an attacker guesses against; reads are loose because the duel
   queue legitimately polls every 2.5 seconds. */
/* =========================================================================
   STATIC FILES — an allowlist, not a directory.

   This used to serve ANY file that existed under the project root:

       const f = path.join(ROOT, url.pathname.replace(/\.\./g,''));
       if (fs.existsSync(f) && fs.statSync(f).isFile()) ...send it

   The traversal guard was fine -- a request could not climb ABOVE the root.
   The problem was everything already inside it. `data/shutterblip.db` lives
   under the project directory, so `GET /data/shutterblip.db` handed anyone
   who asked the entire database: every player's email, birth year, password
   hash, and the tokens table -- which is a list of live 30-day bearer
   sessions. `/server/mock.js` went out the same way, and with it every
   comment in this file describing exactly how the thing works.

   Nothing about that needed an attacker to be clever. It needed them to
   guess a filename.

   So: a fixed list of the handful of files a browser genuinely needs. A
   path not on the list is a 404 whether or not it exists, which also means
   adding a file to this folder can never again quietly publish it. The
   resolved path is still checked against the root, because an allowlist
   with a traversal bug is just a slower directory listing.

   PRODUCTION: nginx serves these before Node ever sees them, so this alone
   is not enough. The nginx config needs a matching deny -- see SERVER.md.
   ========================================================================= */
const PUBLIC_FILES = new Set([
  '/sw.js', '/manifest.webmanifest',
  '/icon-192.png', '/icon-512.png', '/icon-512-maskable.png', '/apple-touch-icon.png',
  '/favicon.ico', '/robots.txt'
]);
const STATIC_TYPES = {
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png':  'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico':  'image/x-icon', '.css': 'text/css; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8'
};
function serveStatic(req, res, url){
  const name = url.pathname;
  if (!PUBLIC_FILES.has(name)){ res.writeHead(404); return res.end('not found'); }
  // Belt and braces: resolve, then confirm the result is still inside ROOT.
  const f = path.resolve(ROOT, '.' + name);
  if (f !== path.join(ROOT, name.slice(1)) || !f.startsWith(ROOT + path.sep)){
    res.writeHead(404); return res.end('not found');
  }
  let body;
  try { body = fs.readFileSync(f); }
  catch(e){ res.writeHead(404); return res.end('not found'); }
  // Content-Type matters here, it is not decoration: a browser refuses to
  // register a service worker that is not served as JavaScript, and it
  // ignores a manifest that is not served as JSON. Getting these wrong is
  // the usual reason "install to home screen" silently never appears.
  const headers = { 'Content-Type': STATIC_TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream' };
  // the service worker must never be cached, or a deploy cannot replace it
  if (name === '/sw.js') headers['Cache-Control'] = 'no-cache';
  res.writeHead(200, headers);
  return res.end(body);
}

function bucketFor(pathname, method){
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/v1/auth/')) return 'auth';
  if (pathname === '/v1/ads/event') return 'ads';
  // The heartbeat is a POST that writes nothing. Counting it against the
  // write budget would spend one of a player's 120 real actions per minute
  // on a ping, and a household behind one NAT address would start losing
  // shots to the limiter before anyone had done anything wrong.
  if (pathname === '/v1/beat') return 'read';
  if (method === 'POST' || method === 'DELETE') return 'write';
  return 'read';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = sec.clientIp(req);

  // CORS: the game and API are same-origin in any real deployment, so the
  // wildcard is only here for the loose-file development case. Tighten this
  // to your own domain in production -- see SERVER.md.
  /* The admin portal is not an API and has no business being readable
     cross-origin by anything. CORS headers go only on the game API. */
  if (!url.pathname.startsWith('/admin')){
    // A wildcard lets any site on the internet drive the public endpoints
    // from every one of its visitors -- handle enumeration via
    // /v1/auth/check, laundered past the per-IP limiter. Set CORS_ORIGIN to
    // your own domain in production; SERVER.md says so too.
    // CORS_ORIGIN may list several, comma-separated -- the website plus the
    // iPhone/Android app shells (capacitor://localhost, https://localhost).
    // The browser only accepts one value back, so echo the caller's origin
    // when it is on the list.
    const allowed = (process.env.CORS_ORIGIN || '*').split(',').map(x => x.trim()).filter(Boolean);
    const origin = req.headers.origin || '';
    res.setHeader('Access-Control-Allow-Origin',
      allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : allowed[0]));
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-SB-TZ, X-SB-Lang');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  sec.securityHeaders(res, {
    isHtml: url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname.startsWith('/admin')
      || /^\/(v1\/page\/)?(privacy|terms|delete-account)\/?$/.test(url.pathname),
    allowGoogle: !!process.env.GOOGLE_CLIENT_ID
  });
  if (req.method === 'OPTIONS') return res.end();

  // Persist anything the handler mutated, once, after the response. Doing
  // it here rather than in each handler means no endpoint can forget.
  if (store) res.on('finish', () => { try { store.flush(); } catch(e){ console.error('flush:', e.message); } });

  const rl = sec.rateLimit(bucketFor(url.pathname, req.method), ip);
  if (!rl.ok){
    res.writeHead(429, { 'Content-Type':'application/json', 'Retry-After': String(rl.retryAfter) });
    return res.end(JSON.stringify({ error: 'Too many requests. Slow down a moment.' }));
  }

  try {
    if (url.pathname.startsWith('/admin')) return await admin(req, res, url);
    // nginx forwards the public pages under /v1/page/<name> (a rewrite needs
    // no proxy address typed into the config); they are answered below.
    const PAGE_ALIAS = { '/v1/page/privacy':'/privacy', '/v1/page/terms':'/terms',
      '/v1/page/delete-account':'/delete-account', '/v1/page/assetlinks':'/.well-known/assetlinks.json' };
    if (PAGE_ALIAS[url.pathname]) url.pathname = PAGE_ALIAS[url.pathname];
    if (url.pathname.startsWith('/v1/')) return await api(req, res, url);
    /* The root serves the readable source, because this is the development
       server and that is the file it is built around (it also reads the
       puzzle generator out of it). In production nginx answers `/` with
       index.min.html and only proxies /v1/ and /admin, so this branch is
       never reached by a player.

       The `/index.html` alias is gone deliberately: it was the one obvious
       name by which anyone could ask for the fully-commented source, and
       nothing needs it -- browsers request `/`. */
    if (url.pathname === '/'){
      res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store' });
      return res.end(fs.readFileSync(INDEX));
    }
    // Plain web pages the app stores link to: the privacy policy, the terms,
    // and a way to delete an account without installing the app. Generated
    // by build.js from the same text the game shows (delete-account is
    // hand-written). Fixed names only -- nothing from the URL reaches a path.
    const PAGES = { '/privacy':'privacy.html', '/terms':'terms.html', '/delete-account':'delete-account.html' };
    const pg = PAGES[url.pathname.replace(/\/$/, '')];
    if (pg){
      let html;
      try { html = fs.readFileSync(path.join(ROOT, 'legal', pg)); }
      catch(e){ res.writeHead(404); return res.end('not found -- run node build.js'); }
      res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-cache' });
      return res.end(html);
    }
    // Android app link: proves to Google Play that the store app and this
    // website belong to the same person, so the Play Store app opens the
    // site full-screen with no browser bar. Values come from the Play
    // Console (see STORE-SUBMIT.md); without them this is a clean 404.
    if (url.pathname === '/.well-known/assetlinks.json'){
      const pkg = (process.env.ANDROID_PACKAGE || '').trim();
      const prints = (process.env.ANDROID_SHA256 || '').split(',').map(x => x.trim().toUpperCase())
        .filter(x => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(x));
      if (!pkg || !prints.length){ res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type':'application/json' });
      return res.end(JSON.stringify([{ relation:['delegate_permission/common.handle_all_urls'],
        target:{ namespace:'android_app', package_name:pkg, sha256_cert_fingerprints:prints } }]));
    }
    return serveStatic(req, res, url);
  } catch(e){ console.error(e); err(res, 500, 'Server error'); }
});
seedGuestCounter();
server.listen(PORT, () => {
  console.log(`ShutterBlip reference server on http://localhost:${PORT}`);
  // Say which mode this actually started in. The banner used to claim
  // "in-memory" unconditionally, including on a production box running with
  // PERSIST=1 -- a line you read during a deploy at 2am should not be
  // telling you the opposite of what the process is doing.
  console.log(PERSIST
    ? `  persistent · SQLite · ${store && store.DB_PATH ? store.DB_PATH : ''}`
    : `  in-memory · NOT for production, restart wipes everything · see SERVER.md`);
  console.log(`  Admin portal: http://localhost:${PORT}/admin`);
});
