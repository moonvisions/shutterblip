/* How pm2 starts the game on the server.
 *
 *   pm2 start ecosystem.config.js      (first time, or after pm2 delete)
 *   pm2 restart shutterblip            (every update after that)
 *
 * The ordinary settings live here, in the repository. The private ones —
 * your admin password, the Android app fingerprint — live in
 * server/local.env on the server only. That file is never committed
 * (.gitignore) and never served (nginx and the server both refuse /server).
 *
 * server/local.env is plain lines of NAME=value, for example:
 *
 *   ADMIN_PASSWORD=pick-a-long-one
 *   ANDROID_SHA256=AB:CD:...          (from STORE-SUBMIT.md, Play step 4)
 *
 * Anything set in local.env wins over the defaults below.
 */
'use strict';
const fs = require('fs');
const path = require('path');

function readLocalEnv(){
  const out = {};
  let text = '';
  try { text = fs.readFileSync(path.join(__dirname, 'server', 'local.env'), 'utf8'); }
  catch(e){ return out; }
  for (const raw of text.split(/\r?\n/)){
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

const SITE = 'https://' + 'shutterblip.com';

// Use the database wherever it already is. SECURITY-FIX-NOW.md moves it to
// /var/lib/shutterblip; a server that has not done that yet still has it in
// the data folder. Pointing at an empty folder would start a blank database
// and every player would look lost -- never allowed (the rollover rule).
const LIB = '/var/lib/shutterblip';
const OLD = path.join(__dirname, 'data');
const has = d => fs.existsSync(path.join(d, 'shutterblip.db'));
const DATA_DIR = has(LIB) ? LIB : has(OLD) ? OLD : LIB;

module.exports = {
  apps: [{
    name: 'shutterblip',
    script: 'server/mock.js',
    cwd: __dirname,
    env: Object.assign({
      PERSIST: '1',
      DATA_DIR,
      TRUST_PROXY: '1',
      // the website, then the iPhone app shell, then the Android app shell
      CORS_ORIGIN: [SITE, 'capacitor://localhost', 'https://localhost'].join(','),
      ANDROID_PACKAGE: 'com.moonvisionmedia.shutterblip'
    }, readLocalEnv())
  }]
};
