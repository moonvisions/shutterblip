#!/usr/bin/env node
/* =========================================================================
   ROLLOVER CHECK — run before every release. No exceptions.

   Standing rule for ShutterBlip: every account, every stat and every piece
   of analytics must carry over into a new version, always. Nothing a player
   has earned may be reset, orphaned or re-locked by an upgrade.

   This proves it rather than hoping. It starts the PREVIOUS release on a
   fresh database, plays on it the way real people do (an account, a guest,
   shots in several locations, a visit), stops it, then starts THIS release
   on the very same database file and checks that everything came through:
   old logins still work, XP and bests are identical, the guest keeps their
   name, the next guest does not steal it, and the admin dashboard still
   counts all of it.

   USAGE (from the folder of the NEW release):

       node tools/check-rollover.js /path/to/previous/release

   The previous release is just the folder you are replacing — on the
   server, copy it aside before pulling:  cp -r /var/www/shutterblip /root/prev
   Needs `npm install` to have been run in both folders.

   Exit code 0 means safe to ship. Anything else: do not deploy.
   ========================================================================= */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const OLD = path.resolve(process.argv[2] || '');
const NEW = path.resolve(__dirname, '..');
if (!process.argv[2] || !fs.existsSync(path.join(OLD, 'server', 'mock.js'))){
  console.error('Usage: node tools/check-rollover.js /path/to/previous/release');
  process.exit(2);
}
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-rollover-'));
const PASSWORD = 'rollover-check-' + Math.random().toString(36).slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

function boot(dir, port){
  const c = spawn(process.execPath, ['server/mock.js'], { cwd: dir, detached: true, stdio: 'ignore',
    env: { ...process.env, PERSIST: '1', DATA_DIR: DATA, PORT: String(port),
           ADMIN_PASSWORD: PASSWORD, ADMIN_INSECURE_COOKIE: '1' } });
  c.unref(); return c;
}
async function up(port){
  for (let i = 0; i < 40; i++){
    try { const r = await fetch(`http://127.0.0.1:${port}/v1/health`); if (r.ok) return true; } catch(e){}
    await sleep(250);
  }
  return false;
}
// A freshly started server can drop the odd connection while it settles;
// one dropped request must not read as "the data did not carry over".
const fetch = async (url, opts) => {
  for (let i = 0; ; i++){
    try { return await globalThis.fetch(url, opts); }
    catch(e){ if (i >= 4) throw e; await sleep(400); }
  }
};
const api = (port) => ({
  get: async (p, tok) => { const r = await fetch(`http://127.0.0.1:${port}${p}`,
    { headers: tok ? { Authorization: 'Bearer ' + tok } : {} });
    return { s: r.status, b: await r.json().catch(() => ({})) }; },
  post: async (p, body, tok) => { const r = await fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: JSON.stringify(body || {}) });
    return { s: r.status, b: await r.json().catch(() => ({})) }; }
});
const sorted = o => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, o[k]]));

(async () => {
  let child;
  const bail = (why) => { console.error('\n' + why); try { process.kill(-child.pid); } catch(e){} process.exit(1); };

  console.log('\nPREVIOUS RELEASE: ' + OLD);
  child = boot(OLD, 8931);
  if (!(await up(8931))) bail('The previous release did not start. Run `npm install` in it first.');
  const A = api(8931);
  const handle = 'RollCheck' + Math.floor(Math.random() * 9000 + 1000);
  const acct = await A.post('/v1/auth/register', { handle, email: handle.toLowerCase() + '@example.com',
    password: 'rollover-password-1', acceptedTerms: true, ageConfirmed: true, marketingOk: true });
  const guest = await A.post('/v1/auth/guest', {});
  check('previous release: account and guest created', acct.s === 200 && guest.s === 200);
  for (const lv of ['city-1', 'city-2', 'wild-1', 'stage-3'])
    await A.post('/v1/shots', { levelId: lv, clientScore: 80 }, acct.b.token);
  await A.post('/v1/shots', { levelId: 'city-1', clientScore: 60 }, guest.b.token);
  /* A PAYING PLAYER FROM THE OLD PRICING. They bought the all-locations
     bundle back when the shop sold five separate things. Pricing changed;
     what they paid for must not. Written straight into the database,
     because the old release's shop could not take a payment either. */
  try {
    const odb = new (require(OLD + '/node_modules/better-sqlite3'))(path.join(DATA, 'shutterblip.db'));
    for (const sku of ['pack.all','pack.wild','pack.stage','pack.field','pack.rail'])
      odb.prepare('INSERT OR IGNORE INTO owns (handle_lower,sku,granted_at) VALUES (?,?,?)')
         .run(handle.toLowerCase(), sku, Date.now());
    odb.close();
  } catch(e){ console.log('  (could not seed an old purchase: ' + e.message + ')'); }
  /* LIVE DUELS AND THE WEEKLY CUP, on releases that have them. A guest
     who plays a live duel owns a recorded run; a guest with one of those
     once could not sign up at all. And a Cup run is a score someone
     earned this week. Feature-detected, so this works against older
     releases too. */
  const duelGuest = await A.post('/v1/auth/guest', {});
  let duelPlayed = false;
  try {
    for (const t of [acct.b.token, duelGuest.b.token]) await A.post('/v1/me/practiced-duel', {}, t);
    const qa = await A.post('/v1/duels/queue', { mode: 'classic' }, acct.b.token);
    const qb = await A.post('/v1/duels/queue', { mode: 'classic' }, duelGuest.b.token);
    if (qa.s === 200 && qb.s === 200){
      const pa = await A.get('/v1/duels/queue/' + qa.b.queueId, acct.b.token);
      await A.get('/v1/duels/queue/' + qb.b.queueId, duelGuest.b.token);
      const rows = Array.from({ length: 5 }, () => ({ e: 70, c: 70, t: 70 }));
      if (pa.b.duelId){
        await A.post(`/v1/duels/${pa.b.duelId}/result`, { rows }, acct.b.token);
        const rb = await A.post(`/v1/duels/${pa.b.duelId}/result`, { rows: rows.map(r => ({ ...r, t: 60 })) }, duelGuest.b.token);
        duelPlayed = rb.s === 200;
      }
    }
  } catch(e){}
  let cupBefore = null;
  const cs = await A.post('/v1/cup/start', {}, acct.b.token);
  if (cs.s === 200 && cs.b.entryId){
    await A.post(`/v1/cup/${cs.b.entryId}/result`, { rows: Array.from({ length: 5 }, () => ({ e: 81, c: 79, t: 80 })) }, acct.b.token);
    cupBefore = (await A.get('/v1/cup', acct.b.token)).b;
  }
  const before = await A.get('/v1/me', acct.b.token);
  process.kill(-child.pid); await sleep(800);
  /* A reminder subscription and the operator's settings, as they sit on
     disk -- written directly, so this holds whether or not the previous
     release had these features. */
  let subSeeded = false;
  try {
    const odb = new (require(OLD + '/node_modules/better-sqlite3'))(path.join(DATA, 'shutterblip.db'));
    const hasSubs = odb.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='push_subs'`).get();
    if (hasSubs){
      odb.prepare(`INSERT OR IGNORE INTO push_subs (endpoint,handle_lower,p256dh,auth,tz,prefs,created_at) VALUES (?,?,?,?,?,?,?)`)
        .run('https://fcm.googleapis.com/fcm/send/rollover-check', handle.toLowerCase(), 'x'.repeat(87), 'y'.repeat(22), 'America/Denver', '{}', Date.now());
      subSeeded = true;
    }
    odb.close();
  } catch(e){ console.log('  (could not seed a reminder subscription: ' + e.message + ')'); }
  let settingsBefore = null;
  try { settingsBefore = JSON.parse(fs.readFileSync(path.join(DATA, 'settings.json'), 'utf8')); } catch(e){}
  if (!settingsBefore){
    settingsBefore = { features: { liveDuels: true, boards: true }, unlockBy: 'pro', push: true, pushHour: 19 };
    fs.writeFileSync(path.join(DATA, 'settings.json'), JSON.stringify(settingsBefore));
  }

  console.log('\nTHIS RELEASE: ' + NEW);
  child = boot(NEW, 8932);
  if (!(await up(8932))) bail('This release did not start against the old database. DO NOT DEPLOY.');
  const B = api(8932);
  const after = await B.get('/v1/me', acct.b.token);
  check('old sign-in token still works', after.s === 200, 'HTTP ' + after.s);
  const xpB = before.b.profile && before.b.profile.xp, xpA = after.b.profile && after.b.profile.xp;
  check('XP identical', xpB === xpA, `${xpB} → ${xpA}`);
  check('every personal best identical', sorted(before.b.bests) === sorted(after.b.bests),
    Object.keys(after.b.bests || {}).length + ' bests');
  check('duel rating identical', before.b.duelRating === after.b.duelRating);
  /* NOTHING LOST, rather than "identical". The old purchase is written
     straight into the database above, which the previous release has
     already cached in memory and therefore does not report -- so an exact
     comparison would fail on a difference this check itself created. What
     matters is the direction: everything they had, they still have. */
  const hadOwns = [...new Set([...(before.b.owns||[]), 'pack.all','pack.wild','pack.stage','pack.field','pack.rail'])];
  const keptAll = hadOwns.every(x => (after.b.owns||[]).includes(x));
  check('every purchase carried over', keptAll,
    keptAll ? hadOwns.length + ' kept' : 'missing: ' + hadOwns.filter(x => !(after.b.owns||[]).includes(x)).join(','));
  /* The pricing changed in October 2026 from five separate purchases to
     one Pro unlock. Anyone who had bought the old bundle must come out the
     other side with the whole game still open. */
  const ps = await B.get('/v1/purchase/status', acct.b.token);
  check('a player who bought the old bundle is Pro under the new pricing',
    ps.s === 200 && ps.b.pro === true, 'pro=' + (ps.b && ps.b.pro));
  check('and still owns every location they paid for',
    ['pack.wild','pack.stage','pack.field','pack.rail'].every(x => (after.b.owns||[]).includes(x)),
    (after.b.owns||[]).join(','));
  const login = await B.post('/v1/auth/login', { login: handle, password: 'rollover-password-1' });
  check('old password still signs in', login.s === 200, 'HTTP ' + login.s);
  const g = await B.get('/v1/me', guest.b.token);
  check('guest still signed in, same name', g.s === 200 && g.b.handle === guest.b.me.handle, g.b.handle);
  const g2 = await B.post('/v1/auth/guest', {});
  check('a new guest does not take the old guest\'s name', g2.b.me && g2.b.me.handle !== guest.b.me.handle,
    (g2.b.me || {}).handle);

  // The newer data, on releases that have it.
  check('news sign-up carried over', after.b.news === undefined || after.b.news === true,
    after.b.news === undefined ? 'this release has no news switch' : 'news=' + after.b.news);
  if (cupBefore && cupBefore.available){
    const cupAfter = (await B.get('/v1/cup', acct.b.token)).b;
    check('Weekly Cup score and tries carried over', cupAfter.best === cupBefore.best && cupAfter.tries === cupBefore.tries,
      `best ${cupBefore.best} → ${cupAfter.best}, tries ${cupBefore.tries} → ${cupAfter.tries}`);
  }
  if (subSeeded){
    let kept = false;
    try { const ndb = new (require(NEW + '/node_modules/better-sqlite3'))(path.join(DATA, 'shutterblip.db'), { readonly: true });
      kept = !!ndb.prepare('SELECT 1 FROM push_subs WHERE handle_lower = ?').get(handle.toLowerCase()); ndb.close(); } catch(e){}
    check('reminder subscription carried over', kept);
  }
  const cfgAfter = (await B.get('/v1/config')).b;
  check('admin settings carried over', !cfgAfter.unlockBy || cfgAfter.unlockBy === settingsBefore.unlockBy,
    `unlockBy ${settingsBefore.unlockBy} → ${cfgAfter.unlockBy || '(not in this release)'}`);
  if (duelPlayed){
    const up = await B.post('/v1/auth/upgrade', { handle: 'Roll' + Math.floor(Math.random() * 90000 + 10000), password: 'rollover-password-2',
      acceptedTerms: true, ageConfirmed: true }, duelGuest.b.token);
    check('a guest who played live duels can still create an account', up.s === 200, 'HTTP ' + up.s + (up.b.error ? ' ' + up.b.error : ''));
  }

  const al = await fetch('http://127.0.0.1:8932/admin/login', { method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=' + PASSWORD });
  const cookie = (al.headers.get('set-cookie') || '').split(';')[0];
  const page = async tab => (await fetch(`http://127.0.0.1:8932/admin?tab=${tab}&range=all`,
    { headers: { Cookie: cookie } })).text();
  const players = await page('players');
  check('admin still lists the old players', players.includes(handle) && players.includes(guest.b.me.handle));
  const overview = await page('overview');
  check('admin dashboard renders on the old data', /Registered players/.test(overview));

  /* A location added in this release (The Dark Sky, October 2026). An old
     account can play it straight away, the server accepts its rounds, and
     playing it changes nothing the player already had. */
  const locs = (() => { try {
    const h = fs.readFileSync(path.join(NEW, 'index.html'), 'utf8'), blk = h.slice(h.indexOf('const LOCATIONS = ['));
    return [...blk.matchAll(/\{\s*id:'([a-z0-9_]{2,16})',\s*scene:'[a-z0-9_]+',\s*name:'([^']{1,40})'/g)].map(m => ({ id: m[1], name: m[2] }));
  } catch(e){ return []; } })();
  const newest = locs[locs.length - 1];
  if (newest){
    const sh = await B.post('/v1/shots', { levelId: newest.id + '-1', clientScore: 71.5, seed: 1, runShot: 0 }, acct.b.token);
    const me2 = await B.get('/v1/me', acct.b.token);
    const untouched = Object.keys(before.b.bests || {}).every(k => (me2.b.bests || {})[k] === before.b.bests[k]);
    check(`a round in the newest location (${newest.name}) is saved, and every old best is untouched`,
      sh.s === 200 && (me2.b.bests || {})[newest.id + '-1'] === 71.5 && untouched,
      'HTTP ' + sh.s + ' · best ' + (me2.b.bests || {})[newest.id + '-1']);
    const content = await page('content');
    check('admin progression lists every location', locs.every(l => content.includes(l.name)),
      locs.filter(l => !content.includes(l.name)).map(l => l.name).join(', ') || locs.length + ' locations');
  }

  process.kill(-child.pid);
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch(e){}
  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(fail ? '\nDO NOT DEPLOY — something a player earned did not carry over.\n'
                   : '\nSafe to deploy: everything carried over.\n');
  process.exit(fail ? 1 : 0);
})();
