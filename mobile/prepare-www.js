/* Copies the built game into www/, which is what the app shell bundles.
   Run `node build.js` in the main folder first so index.min.html is fresh. */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), www = path.join(__dirname, 'www');
const src = path.join(root, 'index.min.html');
if (!fs.existsSync(src)){ console.error('index.min.html not found. Run: node build.js  (in the main folder)'); process.exit(1); }
fs.rmSync(www, { recursive:true, force:true }); fs.mkdirSync(www);
fs.copyFileSync(src, path.join(www, 'index.html'));
for (const f of ['manifest.webmanifest','icon-192.png','icon-512.png','icon-512-maskable.png','apple-touch-icon.png'])
  if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(www, f));
console.log('www/ ready. The app talks to https://shutterblip.com for accounts and scores.');
