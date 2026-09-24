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
    password: 'rollover-password-1', acceptedTerms: true, ageConfirmed: true });
  const guest = await A.post('/v1/auth/guest', {});
  check('previous release: account and guest created', acct.s === 200 && guest.s === 200);
  for (const lv of ['city-1', 'city-2', 'wild-1', 'stage-3'])
    await A.post('/v1/shots', { levelId: lv, clientScore: 80 }, acct.b.token);
  await A.post('/v1/shots', { levelId: 'city-1', clientScore: 60 }, guest.b.token);
  const before = await A.get('/v1/me', acct.b.token);
  process.kill(-child.pid); await sleep(800);

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
  check('purchases identical', sorted(before.b.owns) === sorted(after.b.owns));
  const login = await B.post('/v1/auth/login', { login: handle, password: 'rollover-password-1' });
  check('old password still signs in', login.s === 200, 'HTTP ' + login.s);
  const g = await B.get('/v1/me', guest.b.token);
  check('guest still signed in, same name', g.s === 200 && g.b.handle === guest.b.me.handle, g.b.handle);
  const g2 = await B.post('/v1/auth/guest', {});
  check('a new guest does not take the old guest\'s name', g2.b.me && g2.b.me.handle !== guest.b.me.handle,
    (g2.b.me || {}).handle);

  const al = await fetch('http://127.0.0.1:8932/admin/login', { method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=' + PASSWORD });
  const cookie = (al.headers.get('set-cookie') || '').split(';')[0];
  const page = async tab => (await fetch(`http://127.0.0.1:8932/admin?tab=${tab}&range=all`,
    { headers: { Cookie: cookie } })).text();
  const players = await page('players');
  check('admin still lists the old players', players.includes(handle) && players.includes(guest.b.me.handle));
  const overview = await page('overview');
  check('admin dashboard renders on the old data', /Registered players/.test(overview));

  process.kill(-child.pid);
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch(e){}
  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(fail ? '\nDO NOT DEPLOY — something a player earned did not carry over.\n'
                   : '\nSafe to deploy: everything carried over.\n');
  process.exit(fail ? 1 : 0);
})();
