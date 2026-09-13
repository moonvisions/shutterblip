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
let guestCounter = 1000;      // guests start at Guest1001, like most sites
const duels = new Map();      // duelId -> {seed, startsAt, players:[handle,handle|'BOT'], results:{}, status}
const config = {
  v:2, xpMult:1, streakBonus:0.15, coachMode:2, timerRevealAt:999, paywall:false, freeRounds:3,
  grades:{S:95, A:88, B:78, C:66, D:52},
  features:{ liveDuels:true, boards:true }
};
const BOT_OFFER_AFTER_MS = 30000, QUEUE_STALE_MS = 60000;
// A ghost is offered sooner than a bot: it is a real person's real
// performance, so there is no honesty cost to reaching for it quickly --
// unlike a bot, which the client is careful to label as practice and never
// let affect rating.
const GHOST_OFFER_AFTER_MS = 8000;

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

const dayKey = () => new Date().toISOString().slice(0,10);
const PUZZLE_STATS = new Map();   // n -> {attempts, correct, template}

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
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
  return { handle, email: email || null, name: (consent.name || '').slice(0,60) || null,
    birthYear: by, salt, pw: hash(password, salt), createdAt: Date.now(),
    consent: { acceptedTerms: !!consent.acceptedTerms, termsVersion: consent.termsVersion || null,
               ageConfirmed: !!consent.ageConfirmed, marketingOk: !!consent.marketingOk },
    xp: 0, bests: {}, owns: [], blips: 40, equipped: null,
    lastSeenAt: Date.now(),
    livePracticed: false, duelRating: 1000, duels: { w:0, l:0, t:0 },
    puzzles: { next:1, rating: 800, solved:0, attempted:0, streak:0, bestStreak:0, solvedSet: new Set() },
    recoveryCode: Array.from({length:4}, () => crypto.randomBytes(2).toString('hex').toUpperCase()).join('-') };
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
  consent: u.consent });

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
  if (u) u.lastSeenAt = Date.now();
  return u; }
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
    matchedEntries.set(a.id, { duelId:id, seed, startsAt: duels.get(id).startsAt, opponent:{ handle:b.handle, rating: users.get(b.handle.toLowerCase()).duelRating } });
    matchedEntries.set(b.id, { duelId:id, seed, startsAt: duels.get(id).startsAt, opponent:{ handle:a.handle, rating: users.get(a.handle.toLowerCase()).duelRating } });
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
  return true;
}
function settleDuel(d){
  const [a, b] = d.players; if (!(d.results[a] && d.results[b])) return;
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
  events.push({ type:'duel_result', handle:ua.handle, at:Date.now(), meta:{ kind:d.kind||'live', outcome: ra===1?'win':ra===0?'loss':'tie', opponent:ub.handle } });
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
  events.push({ type:'duel_result', handle, at:Date.now(),
    meta:{ kind:'ghost', outcome: ra===1?'win':ra===0?'loss':'tie', opponent:d.players.find(x => x !== handle) } });
}
// Bot matches never call settleDuel (no rating to update — see the guard
// above), so they need their own log line or "duels played" quietly
// undercounts every practice match against the fallback.
function logBotDuel(handle, seed){
  events.push({ type:'duel_result', handle, at:Date.now(), meta:{ kind:'bot', outcome:null, opponent:'BOT' } });
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

function adminPage(body){
  return `<!doctype html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ShutterBlip — Admin</title>
  <style>
    :root{--gold:#F2A03D;--teal:#35D6C1;--red:#E5484D;--bg:#0E1117;--card:#161B24;--line:#242B38;--dim:#8A93A6;--bone:#F5F2EC}
    *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--bone);
      font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
    .wrap{max-width:1000px;margin:0 auto;padding:24px 16px 60px}
    h1{font-size:22px;margin:0 0 4px} .sub{color:var(--dim);font-size:13px;margin:0 0 22px}
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:22px}
    .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}
    .card b{display:block;font-size:26px;color:var(--gold);line-height:1.1}
    .card span{font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.08em;color:var(--dim)}
    table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:22px}
    th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line)}
    th{color:var(--dim);font-size:10px;letter-spacing:.08em;font-weight:600}
    .section{margin-bottom:26px} .section h2{font-size:14px;color:var(--teal);margin:0 0 10px;letter-spacing:.04em}
    .bars{display:flex;align-items:flex-end;gap:3px;height:70px;margin-bottom:6px}
    .bars i{flex:1;background:var(--gold);border-radius:2px 2px 0 0;min-height:2px;display:block}
    form.inline{display:inline} button,input[type=submit]{font:inherit;cursor:pointer}
    .btn{background:var(--gold);color:#1A1206;border:0;border-radius:8px;padding:7px 12px;font-weight:700;font-size:12px}
    .btn.danger{background:var(--red);color:#fff}
    .btn.ghost{background:#1C222D;color:var(--bone);border:1px solid var(--line)}
    input[type=text],input[type=password]{background:#0E1219;border:1px solid var(--line);color:var(--bone);
      border-radius:8px;padding:9px 10px;font-size:14px}
    a{color:var(--teal)} .flag{display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:6px}
    .topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
  </style></head><body><div class="wrap">${body}</div></body></html>`;
}

function loginPage(err){
  return adminPage(`
    <h1>ShutterBlip Admin</h1>
    <p class="sub">${err ? '<span style="color:var(--red)">'+esc(err)+'</span>' : 'Sign in to continue.'}</p>
    <form method="POST" action="/admin/login">
      <input type="password" name="password" placeholder="Admin password" autofocus style="width:220px">
      <input type="submit" class="btn" value="Sign in">
    </form>`);
}

function renderDashboard(qs){
  qs = qs || new URLSearchParams();
  const all = [...users.values()];
  const accounts = all.filter(u => !u.guest), guests = all.filter(u => u.guest);
  const revenueCents = events.filter(e => e.type === 'purchase').reduce((s,e) => s + (e.meta && e.meta.cents || 0), 0);
  const now = Date.now(), day = 86400000;
  const since = ts => events.filter(e => e.at >= ts);
  const signups7 = since(now - 7*day).filter(e => e.type === 'signup' || e.type === 'guest').length;
  const purchases7 = since(now - 7*day).filter(e => e.type === 'purchase').length;

  // DAU/WAU/MAU from lastSeenAt, which every authenticated call refreshes —
  // the only honest definition of "active" available without client-side
  // session instrumentation this reference server does not have.
  const activeSince = ts => all.filter(u => u.lastSeenAt >= ts).length;
  const dau = activeSince(now - day), wau = activeSince(now - 7*day), mau = activeSince(now - 30*day);

  // Day-1 retention: of the accounts created exactly two days ago (so a
  // full day has had the chance to pass), what fraction came back the next
  // day. Two days ago rather than yesterday, so "created yesterday, seen
  // today" — which is normal same-session behaviour, not return behaviour —
  // is not counted as a return.
  const cohortStart = now - 2*day, cohortEnd = now - day;
  const cohort = all.filter(u => u.createdAt >= cohortStart && u.createdAt < cohortEnd);
  const returned = cohort.filter(u => u.lastSeenAt >= cohortEnd);
  const retentionD1 = cohort.length ? Math.round(returned.length / cohort.length * 100) : null;

  // 14-day signup bar chart
  const days = Array.from({length:14}, (_,i) => dayKeyOf(now - (13-i)*day));
  const perDay = days.map(d => events.filter(e => (e.type === 'signup' || e.type === 'guest') && dayKeyOf(e.at) === d).length);
  const maxPerDay = Math.max(1, ...perDay);
  const bars = perDay.map(n => `<i style="height:${Math.max(2, n/maxPerDay*70)}px" title="${n}"></i>`).join('');

  // Duel kind split: live tells you the queue is doing its job; bot tells
  // you how often it is not, and someone hit the fallback instead.
  const duelEvents = events.filter(e => e.type === 'duel_result');
  const liveDuelN = duelEvents.filter(e => e.meta.kind === 'live').length;
  const botDuelN = duelEvents.filter(e => e.meta.kind === 'bot').length;

  // Puzzle difficulty by template — the thing actually worth acting on, far
  // more than a raw solved count: which QUESTIONS are too hard, not just
  // how many were answered.
  const templateStats = new Map();
  for (const [n, s] of PUZZLE_STATS){
    const t = s.template || '(unknown)';
    const agg = templateStats.get(t) || { attempts:0, correct:0 };
    agg.attempts += s.attempts; agg.correct += s.correct;
    templateStats.set(t, agg);
  }
  const hardestTemplates = [...templateStats.entries()]
    .filter(([,a]) => a.attempts >= 3)
    .map(([t,a]) => ({ t, rate: a.correct/a.attempts, attempts:a.attempts }))
    .sort((a,b) => a.rate - b.rate).slice(0,10);

  const topXp = accounts.slice().sort((a,b) => b.xp - a.xp).slice(0,10);
  const topDuel = accounts.filter(u => u.duels.w+u.duels.l+u.duels.t > 0).sort((a,b) => b.duelRating - a.duelRating).slice(0,10);
  const purchaseLog = events.filter(e => e.type === 'purchase').slice(-20).reverse();
  const activityLog = events.slice(-30).reverse();

  // Players table: search + sort, server-rendered via query params — no
  // client framework, consistent with the rest of this portal, and it
  // means the page still works if you view it from a phone with JS off.
  const q = (qs.get('q') || '').trim().toLowerCase();
  const sort = qs.get('sort') || 'created';
  let rows = all.filter(u => !q || u.handle.toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q));
  const sorters = {
    created: (a,b) => b.createdAt - a.createdAt,
    lastSeen: (a,b) => b.lastSeenAt - a.lastSeenAt,
    xp: (a,b) => b.xp - a.xp,
    duel: (a,b) => b.duelRating - a.duelRating
  };
  rows.sort(sorters[sort] || sorters.created);
  const total = rows.length;
  rows = rows.slice(0, 50);
  const sortLink = (key, label) => `<a href="/admin?q=${encodeURIComponent(q)}&sort=${key}"${sort===key?' style="color:var(--gold)"':''}>${label}</a>`;

  const f = config.features || {};
  return adminPage(`
    <div class="topbar"><h1>ShutterBlip Admin</h1>
      <form method="POST" action="/admin/logout"><button class="btn ghost">Sign out</button></form></div>
    <p class="sub">In-memory reference server — restart wipes everything. This is what production data will look like once a real database is behind it.</p>

    <div class="cards">
      <div class="card"><b>${accounts.length}</b><span>ACCOUNTS</span></div>
      <div class="card"><b>${guests.length}</b><span>GUESTS</span></div>
      <div class="card"><b>${dau}</b><span>ACTIVE TODAY</span></div>
      <div class="card"><b>${wau}</b><span>ACTIVE, 7D</span></div>
      <div class="card"><b>${mau}</b><span>ACTIVE, 30D</span></div>
      <div class="card"><b>${retentionD1 == null ? '—' : retentionD1+'%'}</b><span>DAY-1 RETENTION${retentionD1==null?' (NO COHORT YET)':''}</span></div>
      <div class="card"><b>${signups7}</b><span>NEW, LAST 7 DAYS</span></div>
      <div class="card"><b>${shots.length}</b><span>SHOTS RECORDED</span></div>
      <div class="card"><b>${liveDuelN} / ${botDuelN}</b><span>DUELS: LIVE / BOT</span></div>
      <div class="card"><b>${fmtCents(revenueCents)}</b><span>REVENUE (${purchases7} SALES / 7D)</span></div>
    </div>

    <div class="section"><h2>Signups — last 14 days (accounts + guests)</h2>
      <div class="bars">${bars}</div>
      <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--dim)">
        <span>${days[0]}</span><span>${days[13]}</span></div></div>

    <div class="section"><h2>Feature flags</h2>
      <form method="POST" action="/admin/flags">
        <div class="flag"><input type="checkbox" name="liveDuels" id="fd1" ${f.liveDuels!==false?'checked':''}>
          <label for="fd1">Live 1v1 matchmaking on (off = Duel tab shows Practice + "coming soon")</label></div>
        <div class="flag"><input type="checkbox" name="boards" id="fd2" ${f.boards!==false?'checked':''}>
          <label for="fd2">Public leaderboards on</label></div>
        <button class="btn" style="margin-top:6px">Save flags</button>
      </form></div>

    <div class="section"><h2>Players — ${total} match${total===1?'':'es'}</h2>
      <form method="GET" action="/admin" style="margin-bottom:10px">
        <input type="hidden" name="sort" value="${esc(sort)}">
        <input type="text" name="q" value="${esc(q)}" placeholder="Search handle or email">
        <button class="btn ghost">Search</button>
      </form>
      <table><tr><th>Handle</th><th>Type</th><th>${sortLink('created','Created')}</th><th>${sortLink('lastSeen','Last seen')}</th>
        <th>${sortLink('xp','XP')}</th><th>${sortLink('duel','Duel rating')}</th><th></th></tr>
      ${rows.map(u => `<tr><td><a href="/admin/user?handle=${encodeURIComponent(u.handle)}">${esc(u.handle)}</a></td>
        <td>${u.guest?'guest':'account'}</td>
        <td>${new Date(u.createdAt).toLocaleDateString()}</td>
        <td>${new Date(u.lastSeenAt||u.createdAt).toLocaleDateString()}</td>
        <td>${u.xp}</td><td>${u.duelRating}</td>
        <td><form class="inline" method="POST" action="/admin/user/delete" onsubmit="return confirm('Delete ${esc(u.handle)}? This removes their shots and event history too. This cannot be undone.')">
          <input type="hidden" name="handle" value="${esc(u.handle)}"><button class="btn danger" style="padding:4px 9px;font-size:11px">Delete</button></form></td></tr>`).join('') || '<tr><td colspan=7>No match.</td></tr>'}
      </table>
      ${total > 50 ? `<p class="sub">Showing the first 50 of ${total} — narrow the search to see more.</p>` : ''}
    </div>

    <div class="section"><h2>Ad performance${adSlot.sold ? ' — ' + esc(adSlot.name) : ''}</h2>
      ${adStatsHTML()}
      <h2 style="margin-top:18px">The sold slot</h2>
      <form method="POST" action="/admin/ads">
        <div class="flag"><input type="checkbox" name="sold" id="adsold" ${adSlot.sold?'checked':''}>
          <label for="adsold"><b>Slot is sold and live.</b> Unticked = no ads shown to anyone.</label></div>
        <table style="margin-top:8px">
          <tr><th style="width:150px">Advertiser</th><td><input type="text" name="name" value="${esc(adSlot.name)}" style="width:100%"></td></tr>
          <tr><th>Billing ref (sku)</th><td><input type="text" name="sku" value="${esc(adSlot.sku)}" style="width:100%"></td></tr>
          <tr><th>Link URL</th><td><input type="text" name="url" value="${esc(adSlot.url)}" style="width:100%"></td></tr>
          <tr><th>Label</th><td><input type="text" name="label" value="${esc(adSlot.label)}" style="width:100%"></td></tr>
          <tr><th>Line</th><td><input type="text" name="line" value="${esc(adSlot.line)}" style="width:100%"></td></tr>
          <tr><th>Call to action</th><td><input type="text" name="cta" value="${esc(adSlot.cta)}" style="width:100%"></td></tr>
          <tr><th>Shown as</th><td><input type="text" name="display" value="${esc(adSlot.display)}" style="width:100%"></td></tr>
          <tr><th>Interstitial every</th><td><input type="text" name="everyNRuns" value="${adSlot.everyNRuns}" style="width:60px"> rounds
            &nbsp;&nbsp;for <input type="text" name="seconds" value="${adSlot.seconds}" style="width:50px"> seconds</td></tr>
        </table>
        <button class="btn" style="margin-top:8px">Save advertiser</button>
      </form>
      <p class="sub" style="margin-top:8px">Changes reach players on their next app open — no redeploy. Supporters never see any of this.</p>
    </div>

    <div class="section"><h2>Hardest puzzle templates (3+ attempts)</h2>
      <table><tr><th>Template</th><th>Pass rate</th><th>Attempts</th></tr>
      ${hardestTemplates.map(h => `<tr><td>${esc(h.t)}</td><td>${Math.round(h.rate*100)}%</td><td>${h.attempts}</td></tr>`).join('') || '<tr><td colspan=3>Not enough answers yet.</td></tr>'}
      </table></div>

    <div class="section"><h2>Top by XP</h2><table><tr><th>Handle</th><th>XP</th><th>Puzzle rating</th></tr>
      ${topXp.map(u => `<tr><td>${esc(u.handle)}</td><td>${u.xp}</td><td>${u.puzzles.rating}</td></tr>`).join('') || '<tr><td colspan=3>Nobody yet.</td></tr>'}
      </table></div>

    <div class="section"><h2>Top by duel rating</h2><table><tr><th>Handle</th><th>Rating</th><th>W-L-T</th></tr>
      ${topDuel.map(u => `<tr><td>${esc(u.handle)}</td><td>${u.duelRating}</td><td>${u.duels.w}-${u.duels.l}-${u.duels.t}</td></tr>`).join('') || '<tr><td colspan=3>No duels yet.</td></tr>'}
      </table></div>

    <div class="section"><h2>Recent purchases</h2><table><tr><th>Handle</th><th>Item</th><th>Amount</th><th>When</th></tr>
      ${purchaseLog.map(e => `<tr><td>${esc(e.handle)}</td><td>${esc(e.meta.sku)}</td><td>${fmtCents(e.meta.cents)}</td><td>${new Date(e.at).toLocaleString()}</td></tr>`).join('') || '<tr><td colspan=4>No sales yet.</td></tr>'}
      </table></div>

    <div class="section"><h2>Live activity feed</h2><table><tr><th>When</th><th>Type</th><th>Handle</th><th>Detail</th></tr>
      ${activityLog.map(e => `<tr><td>${new Date(e.at).toLocaleTimeString()}</td><td>${esc(e.type)}</td><td>${esc(e.handle||'—')}</td>
        <td>${esc(e.meta ? JSON.stringify(e.meta) : '')}</td></tr>`).join('') || '<tr><td colspan=4>Nothing yet.</td></tr>'}
      </table>
      <p class="sub">Auto-refreshes every 15s.</p></div>
    <script>setTimeout(()=>location.reload(), 15000)<\/script>
  `);
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
  return `<div class="cards">
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

  /* Google sign-in. PRODUCTION: verify `credential` properly — fetch
     https://www.googleapis.com/oauth2/v3/certs and check the JWT signature,
     the `aud` (your client id), the `iss` (accounts.google.com) and `exp`.
     This mock only DECODES the token, which is trivially forgeable and is
     the single most dangerous shortcut in this file. Never ship it. */
  if (p === '/v1/auth/google' && m === 'POST'){
    const b = await body(req);
    if (!b.credential) return err(res, 400, 'No credential.');
    let claims;
    try { claims = JSON.parse(Buffer.from(String(b.credential).split('.')[1], 'base64').toString()); }
    catch(e){ return err(res, 400, 'Could not read that Google token.'); }
    const sub = claims.sub, email = claims.email || null;
    if (!sub) return err(res, 400, 'Google token had no subject.');
    let user = [...users.values()].find(x => x.googleSub === sub)
            || (email ? [...users.values()].find(x => x.email && x.email.toLowerCase() === email.toLowerCase()) : null);
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
      events.push({ type:'signup', handle, at:Date.now(), meta:{ via:'google' } });
    } else if (!user.googleSub) user.googleSub = sub;      // link to an existing account
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
  if (p === '/v1/auth/guest' && m === 'POST'){
    const n = ++guestCounter;
    const handle = 'Guest' + n;
    const user = newUser(handle, null, crypto.randomBytes(16).toString('hex'), { acceptedTerms:true, ageConfirmed:true });
    user.guest = true;
    users.set(handle.toLowerCase(), user);
    events.push({ type:'guest', handle, at:Date.now() });
    const t = newToken(); tokens.set(t, handle.toLowerCase());
    return send(res, 200, { token:t, me: me(user), guest:true });
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
    events.push({ type:'signup', handle, at:Date.now() });
    const t = newToken(); tokens.set(t, handle.toLowerCase());
    return send(res, 200, { token:t, me: me(user), recoveryCode: user.recoveryCode });
  }
  if (p === '/v1/auth/login' && m === 'POST'){
    const b = await body(req); const login = String(b.login||'').trim().toLowerCase();
    const user = users.get(login) || [...users.values()].find(x => x.email && x.email.toLowerCase() === login);
    if (!user || hash(String(b.password||''), user.salt) !== user.pw) return err(res, 401, 'Wrong username or password.');
    const t = newToken(); tokens.set(t, user.handle.toLowerCase());
    events.push({ type:'login', handle:user.handle, at:Date.now() });
    return send(res, 200, { token:t, me: me(user) });
  }

  if (p === '/v1/board') return board(res, url);          // public read
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
    u.consent = { acceptedTerms:true, termsVersion: b.termsVersion || null,
                  ageConfirmed:true, marketingOk: !!b.marketingOk };
    // the rename above already moved every child row in the database case
    if (store) store.persist(u); else users.set(handle.toLowerCase(), u);
    if (!store) for (const [t,k] of tokens) if (k === old.toLowerCase()) tokens.set(t, handle.toLowerCase());
    for (const sh of shots) if (sh.handle === old) sh.handle = handle;
    for (const e of events) if (e.handle === old) e.handle = handle;
    events.push({ type:'upgrade', handle, at:Date.now() });
    return send(res, 200, { me: me(u), upgraded:true });
  }
  // NOTE: there is intentionally no rename endpoint. A handle on a public
  // leaderboard has to be stable or the board means nothing -- you could
  // farm a high score, rename, and farm again, and nobody could tell who
  // anyone was. If you ever add one, it must be rate-limited to about once
  // a year AND carry the score history with it.
  if (p === '/v1/me/handle' && m === 'POST') return err(res, 403, 'Usernames are permanent.');
  if (p === '/v1/me/practiced-duel' && m === 'POST'){ u.livePracticed = true; return send(res, 200, { ok:true, livePracticed:true }); }
  if (p === '/v1/me/export') return send(res, 200, { ...me(u), shots: shots.filter(s => s.handle === u.handle) });
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
  if (p === '/v1/purchase/checkout' && m === 'POST'){
    const b = await body(req);
    const item = CATALOGUE.find(i => i.sku === b.sku);
    if (!item || !item.price_cents) return err(res, 400, 'No such item.');
    if ((u.owns||[]).includes(item.sku)) return err(res, 409, 'Already owned.');
    u.owns = [...new Set([...(u.owns||[]), ...grantsFor(item.sku)])];
    events.push({ type:'purchase', handle:u.handle, at:Date.now(), meta:{ sku:item.sku, cents:item.price_cents } });
    return send(res, 200, { url: '/?purchased=' + encodeURIComponent(item.sku), mock:true });
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
    const score = Math.max(0, Math.min(100, +b.clientScore || +b.score || 0));
    shots.push({ handle:u.handle, levelId:b.levelId, score, at: Date.now(), day: dayKey() });
    if (store){
      store.S.addShot.run(u.handleLower, String(b.levelId||''), score, Date.now(), dayKey());
      store.S.setBest.run(u.handleLower, String(b.levelId||''), score);
    }
    if (!(u.bests[b.levelId] >= score)) u.bests[b.levelId] = score;
    u.xp += Math.max(0, Math.round(+b.xp || score * 2));
    events.push({ type:'shot', handle:u.handle, at:Date.now(), meta:{ levelId:b.levelId, score } });
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
async function apiRest(req, res, url, u){
  const p = url.pathname, m = req.method;

  if (p === '/v1/puzzles' && m === 'GET'){ const q = u.puzzles;
    return send(res, 200, { next:q.next, progress:{ rating:q.rating, solved:q.solved, attempted:q.attempted, streak:q.streak, best_streak:q.bestStreak }, rewards:[], nextReward:null }); }
  if (p === '/v1/puzzles/daily'){ const d = Math.floor(Date.now()/86400000); return send(res, 200, { day: dayKey(), easy: 1 + (d*37)%600, hard: 1201 + (d*53)%700, bothDone:false, streak:0 }); }
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
      if (!b.measure) return err(res, 422, 'Camera puzzles are marked locally in this mock.');
      verdict = PuzzleGen.checkCamera(n, b.measure);
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
    events.push({ type:'puzzle_answer', handle:u.handle, at:Date.now(), meta:{ n, template, correct: !!verdict.correct } });
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
    // A real ghost, if the store has one and enough time has passed to make
    // "nobody live right now" a fair read of the room, not just bad luck on
    // the first second of searching.
    const canOfferGhost = !!store && waited >= GHOST_OFFER_AFTER_MS;
    return send(res, 200, { status:'waiting', elapsed: waited,
      canOfferGhost, canOfferBot: waited >= BOT_OFFER_AFTER_MS,
      rangeText:'FIRST COME, FIRST MATCHED' });
  }
  const dm = p.match(/^\/v1\/duels\/([a-f0-9]+)(\/result)?$/);
  if (dm){
    const d = duels.get(dm[1]); if (!d) return err(res, 404, 'No such duel.');
    if (!d.players.includes(u.handle)) return err(res, 403, 'Not your duel.');
    const other = d.players.find(x => x !== u.handle);
    if (dm[2] && m === 'POST'){
      const b = await body(req);
      if (!Array.isArray(b.rows) || b.rows.length !== 5) return err(res, 400, 'Five rows, please.');
      // PRODUCTION: re-score every row's cam server-side before trusting it.
      d.results[u.handle] = b.rows;
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
    if (b.password === ADMIN_PASSWORD){
      clearFailedLogins(ip);
      const t = newAdminSession();
      res.writeHead(302, { Location:'/admin',
        'Set-Cookie': `sb_admin=${t}; HttpOnly; SameSite=Strict; Max-Age=43200; Path=/admin` });
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
    return redirect('/admin');
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
function bucketFor(pathname, method){
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/v1/auth/')) return 'auth';
  if (pathname === '/v1/ads/event') return 'ads';
  if (method === 'POST' || method === 'DELETE') return 'write';
  return 'read';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = sec.clientIp(req);

  // CORS: the game and API are same-origin in any real deployment, so the
  // wildcard is only here for the loose-file development case. Tighten this
  // to your own domain in production -- see SERVER.md.
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  sec.securityHeaders(res, {
    isHtml: url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname.startsWith('/admin'),
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
    if (url.pathname.startsWith('/v1/')) return await api(req, res, url);
    if (url.pathname === '/' || url.pathname === '/index.html'){
      res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store' });
      return res.end(fs.readFileSync(INDEX));
    }
    const f = path.join(ROOT, url.pathname.replace(/\.\./g,''));
    if (fs.existsSync(f) && fs.statSync(f).isFile()){
      // Content-Type matters here, it is not decoration: a browser refuses to
      // register a service worker that is not served as JavaScript, and it
      // ignores a manifest that is not served as JSON. Getting these wrong is
      // the usual reason "install to home screen" silently never appears.
      const TYPES = {
        '.js':   'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.webmanifest': 'application/manifest+json; charset=utf-8',
        '.png':  'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
        '.ico':  'image/x-icon', '.css': 'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8'
      };
      const ext = path.extname(f).toLowerCase();
      const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream' };
      // the service worker must never be cached, or a deploy cannot replace it
      if (url.pathname === '/sw.js') headers['Cache-Control'] = 'no-cache';
      res.writeHead(200, headers);
      return res.end(fs.readFileSync(f));
    }
    res.writeHead(404); res.end('not found');
  } catch(e){ console.error(e); err(res, 500, 'Server error'); }
});
server.listen(PORT, () => {
  console.log(`ShutterBlip reference server on http://localhost:${PORT}`);
  console.log(`  in-memory · not for production · see SERVER.md`);
  console.log(`  Admin portal: http://localhost:${PORT}/admin`);
});
