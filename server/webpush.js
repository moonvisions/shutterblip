/* © 2026 Moon Vision Media LLC. All rights reserved. Proprietary and confidential — see LICENSE.txt. */
'use strict';
/* =========================================================================
   WEB PUSH, WITH NOTHING BUT NODE'S OWN CRYPTO.

   Sends a notification to a browser that has subscribed (Chrome and
   Android, Firefox, Edge, and Safari on an iPhone once the game is added
   to the home screen). Two standards, both implemented here:

   - RFC 8291 + RFC 8188 (aes128gcm): the message is encrypted for that one
     browser, so the push service in between (Google, Mozilla, Apple)
     carries it without being able to read it.
   - RFC 8292 (VAPID): a signed token that proves the message comes from
     this server. The key pair is made once, on first start, and kept in
     the data folder beside the database -- never in the repository.

   Why not the `web-push` package: one more dependency on the server means
   one more thing `npm install` can fail on during an update. This is about
   a hundred lines of standard crypto, and it is checked against an
   independent decoder in the test suite.
   ========================================================================= */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = str => Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/* ---- the server's VAPID key pair, made once and kept ---- */
function loadKeys(dir){
  const file = dir ? path.join(dir, 'vapid.json') : null;
  if (file){
    try {
      const k = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (k.publicKey && k.privateKey) return k;
    } catch(e){ /* none yet */ }
  }
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const keys = { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()), created: Date.now() };
  if (file){
    try { fs.writeFileSync(file, JSON.stringify(keys, null, 2), { mode: 0o600 }); }
    catch(e){ console.error('push: could not save keys — ' + e.message); }
  }
  return keys;
}

// A raw P-256 private key (32 bytes) plus its public point (65 bytes) as a
// KeyObject, which is what crypto.sign needs for ES256.
function privateKeyObject(keys){
  const pub = unb64u(keys.publicKey);
  return crypto.createPrivateKey({ key: {
    kty: 'EC', crv: 'P-256',
    d: b64u(unb64u(keys.privateKey)),
    x: b64u(pub.subarray(1, 33)),
    y: b64u(pub.subarray(33, 65))
  }, format: 'jwk' });
}

/* ---- RFC 8292: the VAPID authorization header ---- */
function vapidHeader(endpoint, keys, subject){
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const unsigned = header + '.' + claims;
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key: privateKeyObject(keys), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${b64u(sig)}, k=${keys.publicKey}`;
}

/* ---- RFC 8291: encrypt one message for one browser ---- */
function encrypt(payload, p256dh, auth){
  const uaPublic = unb64u(p256dh), authSecret = unb64u(auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('bad subscription keys');
  const as = crypto.createECDH('prime256v1'); as.generateKeys();
  const asPublic = as.getPublicKey();
  const shared = as.computeSecret(uaPublic);
  const salt = crypto.randomBytes(16);
  const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));
  // the input keying material, bound to both public keys
  const ikm = hkdf(authSecret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  // one record: the message, then the 0x02 "last record" delimiter
  const plain = Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([2])]);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/* ---- send ----
   Resolves { ok, status, gone }. `gone` (404/410) means the browser has
   unsubscribed or the subscription expired: the caller should forget it. */
function send(sub, message, keys, subject, ttl){
  return new Promise(resolve => {
    let body, url;
    try {
      url = new URL(sub.endpoint);
      if (url.protocol !== 'https:') return resolve({ ok:false, status:0, error:'not https' });
      body = encrypt(JSON.stringify(message), sub.p256dh, sub.auth);
    } catch(e){ return resolve({ ok:false, status:0, error: e.message }); }
    const req = https.request({
      method: 'POST', hostname: url.hostname, port: url.port || 443, path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Content-Length': body.length,
        TTL: String(ttl || 6 * 3600),
        Urgency: 'normal',
        Authorization: vapidHeader(sub.endpoint, keys, subject)
      },
      timeout: 10000
    }, res => {
      res.resume();
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode,
                                    gone: res.statusCode === 404 || res.statusCode === 410 }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok:false, status:0, error:'timeout' }); });
    req.on('error', e => resolve({ ok:false, status:0, error: e.message }));
    req.end(body);
  });
}

module.exports = { loadKeys, encrypt, vapidHeader, send, b64u, unb64u };
