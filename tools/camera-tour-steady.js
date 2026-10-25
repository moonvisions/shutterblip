/* How still is the walkthrough while you read it? For every step, for 4 s:
   does the popup move or change size, does the spotlight move, how often does
   anything in the camera behind it change. node tools/camera-tour-steady.js [url] [outdir]   (needs Playwright and the game running) */
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const URL = process.argv[2] || 'http://127.0.0.1:8790', OUT = path.resolve(process.argv[3] || 'camera-tour-steady-shots'); fs.mkdirSync(OUT, { recursive:true });
const C = [['iphone-15-port', 393, 852, { top:59, bottom:34, left:0, right:0 }], ['iphone-15-land', 852, 393, { top:0, bottom:21, left:59, right:59 }],
           ['android-small-land', 740, 330, { top:0, bottom:0, left:0, right:0 }], ['iphone-se-port', 375, 667, { top:20, bottom:0, left:0, right:0 }]];
let pass = 0, fail = 0; const check = (n, ok, d) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
(async () => {
  const b = await chromium.launch();
  for (const [tag, w, h, ins] of C){
    console.log('\n' + tag);
    const ctx = await b.newContext({ viewport:{ width:w, height:h }, isMobile:true, hasTouch:true });
    await ctx.addInitScript(() => { localStorage.setItem('ah:P:introDone', 'true'); localStorage.setItem('ah:P:warmupSeen', 'true'); });
    const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets:ins });
    const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    await p.goto(URL); await p.waitForSelector('#s-home.show'); await p.evaluate(() => ensurePlayer()); await p.waitForTimeout(700);
    await p.evaluate(() => startCareer()); await p.waitForTimeout(400);
    await p.evaluate(() => document.querySelector('#btn-go').click()); await p.waitForTimeout(600);
    const n = await p.evaluate(() => document.querySelectorAll('#ct-dots i').length + 1);
    let worstMove = 0, worstRing = 0, worstChanges = 0, worstWho = '';
    for (let k = 0; k < n; k++){
      await p.waitForTimeout(450);   // let the step settle in
      const samples = await p.evaluate(async () => {
        const out = []; const t0 = performance.now();
        while (performance.now() - t0 < 4000){
          const c = document.querySelector('#ct-card').getBoundingClientRect(); const ring = document.querySelector('.ct-ring');
          out.push({ c:[c.left, c.top, c.width, c.height].map(Math.round), r:ring ? [ring.getAttribute('x'), ring.getAttribute('y')].join() : '', v:[S.ap, S.shIdx, S.iso, S.focal, Math.round(S.focusDist * 10), S.grid, S.mode].join(),
                    h:document.querySelector('#ct-h').textContent });
          await new Promise(r => setTimeout(r, 50));
        }
        return out;
      });
      let moves = 0, ringMoves = 0, changes = 0;
      for (let j = 1; j < samples.length; j++){
        if (samples[j].c.join() !== samples[j - 1].c.join()) moves++;
        if (samples[j].r !== samples[j - 1].r) ringMoves++;
        if (samples[j].v !== samples[j - 1].v) changes++;
      }
      const name = samples[0].h;
      if (moves > worstMove) worstMove = moves;
      if (ringMoves > worstRing) worstRing = ringMoves;
      if (changes > worstChanges){ worstChanges = changes; worstWho = name; }
      console.log(`    ${String(k).padStart(2)} ${name.padEnd(34)} card moved ${moves}  ring moved ${ringMoves}  camera changed ${changes}x in 4s`);
      await p.screenshot({ path:path.join(OUT, `${tag}--${String(k).padStart(2, '0')}.png`) });
      if (k < n - 1) await p.evaluate(() => document.querySelector('#ct-next').click());
    }
    check('the popup never moves or resizes while you read it', worstMove === 0, 'worst ' + worstMove);
    check('the spotlight never moves while you read it', worstRing === 0, 'worst ' + worstRing);
    check('the demonstration is calm (no more than 8 changes in 4 s)', worstChanges <= 8, `worst ${worstChanges} (${worstWho})`);
    check('no page errors', !errs.length, errs[0]);
    await ctx.close();
  }
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
