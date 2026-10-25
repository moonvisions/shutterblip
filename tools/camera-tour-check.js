/* The camera walkthrough on real phone shapes: it appears on the first Pro
   round, every popup sits on screen without covering what it points at,
   the demo really moves the setting, Skip works, the clock waits, and HOW TO
   and Learn bring it back. node tools/camera-tour-check.js [url] [outdir]   (needs Playwright and the game running) */
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const URL = process.argv[2] || 'http://127.0.0.1:8790', OUT = path.resolve(process.argv[3] || 'camera-tour-shots'); fs.mkdirSync(OUT, { recursive:true });
let pass = 0, fail = 0; const check = (n, ok, d) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const C = [['iphone-15-port', 393, 852, { top:59, bottom:34, left:0, right:0 }], ['iphone-15-land', 852, 393, { top:0, bottom:21, left:59, right:59 }],
           ['android-small-land', 740, 330, { top:0, bottom:0, left:0, right:0 }], ['iphone-se-port', 375, 667, { top:20, bottom:0, left:0, right:0 }],
           ['android-narrow-port', 360, 740, { top:24, bottom:0, left:0, right:0 }], ['laptop', 1280, 800, { top:0, bottom:0, left:0, right:0 }]];
(async () => {
  const b = await chromium.launch();
  for (const [tag, w, h, ins] of C){
    console.log('\n' + tag);
    const mobile = tag !== 'laptop';
    const ctx = await b.newContext({ viewport:{ width:w, height:h }, isMobile:mobile, hasTouch:mobile });
    await ctx.addInitScript(() => { localStorage.setItem('ah:P:introDone', 'true'); localStorage.setItem('ah:P:warmupSeen', 'true'); localStorage.setItem('ah:P:playMode', '"normal"'); });
    const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets:ins });
    const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await p.goto(URL); await p.waitForSelector('#s-home.show'); await p.evaluate(() => ensurePlayer()); await p.waitForTimeout(800);
    await p.evaluate(() => startCareer()); await p.waitForTimeout(500);
    await p.evaluate(() => document.querySelector('#btn-go').click()); await p.waitForTimeout(700);
    const up = await p.evaluate(() => document.querySelector('#ct').classList.contains('show'));
    check('the walkthrough opens on the first Pro round', up);
    const cd = await p.evaluate(() => document.querySelector('#countdown').classList.contains('show'));
    check('and the countdown waits for it', !cd);
    const n = await p.evaluate(() => document.querySelectorAll('#ct-dots i').length + 1);
    const base0 = await p.evaluate(() => ({ ap:S.ap, sh:S.shIdx, iso:S.iso, f:S.focal, fd:S.focusDist, x:S.camX, g:0, m:S.mode }));
    let offs = 0, covers = 0, demoMoved = 0, demoSteps = 0;
    for (let k = 0; k < n; k++){
      const before = await p.evaluate(() => ({ ap:S.ap, sh:S.shIdx, iso:S.iso, f:S.focal, fd:S.focusDist, x:S.camX, g:S.grid, m:S.mode }));
      await p.waitForTimeout(1500);
      const r = await p.evaluate(() => {
        const c = document.querySelector('#ct-card').getBoundingClientRect(); const ring = document.querySelector('.ct-ring');
        // the REAL control, not where the ring was drawn
        const tr = CamTour.targetRect(); let t = tr ? { l:tr.l, t:tr.t, r:tr.r, b:tr.b } : null;
        if (t && ring){ const rx = +ring.getAttribute('x') + 6, ry = +ring.getAttribute('y') + 6; if (Math.abs(rx - t.l) > 3 || Math.abs(ry - t.t) > 3) window.__ringMaybe = 1; }
        return { c:{ l:c.left, t:c.top, r:c.right, b:c.bottom }, t, h:document.querySelector('#ct-h').textContent, W:innerWidth, H:innerHeight,
                 s:{ ap:S.ap, sh:S.shIdx, iso:S.iso, f:S.focal, fd:S.focusDist, x:S.camX, g:S.grid, m:S.mode }, ph:S.phase };
      });
      // a moving control is followed every frame: a mismatch must last a few frames to count
      if (await p.evaluate(() => window.__ringMaybe)){ await p.waitForTimeout(120);
        const still = await p.evaluate(() => { window.__ringMaybe = 0; const ring = document.querySelector('.ct-ring'), t = CamTour.targetRect(); return !!(t && ring && (Math.abs(+ring.getAttribute('x') + 6 - t.l) > 3 || Math.abs(+ring.getAttribute('y') + 6 - t.t) > 3)); });
        if (still) await p.evaluate(() => { window.__ringOff = (window.__ringOff || 0) + 1; }); }
      if (r.c.l < ins.left - 1 || r.c.r > r.W - ins.right + 1 || r.c.t < ins.top - 1 || r.c.b > r.H - ins.bottom + 1){ offs++; console.log('    off-screen:', r.h, JSON.stringify(r.c)); }
      if (r.t){ const ox = Math.min(r.c.r, r.t.r) - Math.max(r.c.l, r.t.l), oy = Math.min(r.c.b, r.t.b) - Math.max(r.c.t, r.t.t); if (ox > 2 && oy > 2){ covers++; console.log('    covers its control:', r.h); } }
      const hasDemo = await p.evaluate(k => !!(document.querySelector('#ct-card') && k), k);
      // each demo shows the camera at a setting it was not on before the tour
      if (JSON.stringify(base0) !== JSON.stringify({ ...r.s, g:0, m:base0.m })) demoMoved++;
      await p.screenshot({ path:path.join(OUT, `${tag}--${String(k).padStart(2, '0')}.png`) });
      if (k < n - 1) await p.evaluate(() => document.querySelector('#ct-next').click());
    }
    check('every popup is fully on screen, clear of notch and home bar', offs === 0, offs + ' off');
    check('no popup covers the control it is about', covers === 0, covers + ' covering');
    check('the spotlight sits exactly on its control', !(await p.evaluate(() => window.__ringOff)), String(await p.evaluate(() => window.__ringOff || 0)));
    check('the demos really move the camera settings', demoMoved >= 6, demoMoved + ' steps changed something');
    const ph = await p.evaluate(() => S.phase);
    check('nothing is timed during the tour', ph === 'countdown', ph);
    await p.evaluate(() => document.querySelector('#ct-next').click()); await p.waitForTimeout(400);
    const after = await p.evaluate(() => ({ open:document.querySelector('#ct').classList.contains('show'), cd:document.querySelector('#countdown').classList.contains('show'), ap:S.ap, sh:SHUTTERS[S.shIdx].l, iso:S.iso, f:S.focal }));
    check('"Start shooting" closes it and the countdown begins', !after.open && after.cd, JSON.stringify(after));
    check('the settings are put back as they were', after.ap === 4 && after.iso === 400 && after.f === 50, JSON.stringify(after));
    await p.waitForTimeout(3800);
    check('the round goes live', await p.evaluate(() => S.phase === 'live'));
    // HOW TO mid-round: the clock must stop
    const hasTips = await p.evaluate(() => { const b = document.querySelector('#btn-tips'); return !!(b && b.offsetParent); });
    check('HOW TO is on the camera', hasTips);
    const tl0 = await p.evaluate(() => S.timeLeft);
    await p.evaluate(() => document.querySelector('#btn-tips').click()); await p.waitForTimeout(2500);
    const tl1 = await p.evaluate(() => S.timeLeft);
    check('HOW TO reopens it, and the round clock stops while it is open', await p.evaluate(() => document.querySelector('#ct').classList.contains('show')) && Math.abs(tl1 - tl0) < 0.2, `${tl0} → ${tl1}`);
    await p.evaluate(() => document.querySelector('#ct-skip').click()); await p.waitForTimeout(300);
    check('Skip closes it and the round carries on', await p.evaluate(() => !document.querySelector('#ct').classList.contains('show') && S.phase === 'live'));
    // not again on its own
    await p.evaluate(() => { S.phase = 'idle'; startCareer(); }); await p.waitForTimeout(400);
    await p.evaluate(() => document.querySelector('#btn-go').click()); await p.waitForTimeout(600);
    check('once seen, it does not come back on its own', await p.evaluate(() => !document.querySelector('#ct').classList.contains('show')));
    // and it survives a reload
    await p.reload(); await p.waitForSelector('#s-home.show'); await p.waitForTimeout(700);
    await p.evaluate(() => { startCareer(); }); await p.waitForTimeout(400);
    await p.evaluate(() => document.querySelector('#btn-go').click()); await p.waitForTimeout(600);
    check('...not even after reopening the app', await p.evaluate(() => !document.querySelector('#ct').classList.contains('show')));
    // Learn brings it back
    await p.evaluate(() => { S.phase = 'idle'; stopCountdown && stopCountdown(); show('s-learn'); }); await p.waitForTimeout(300);
    await p.evaluate(() => document.querySelector('#btn-camtour').click()); await p.waitForTimeout(800);
    check('Learn → "Every camera control, explained" opens it on a free round', await p.evaluate(() => document.querySelector('#ct').classList.contains('show') && S.free === true));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    check('Escape skips it', await p.evaluate(() => !document.querySelector('#ct').classList.contains('show')));
    check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  // duel / easy / lesson never get it
  const ctx = await b.newContext({ viewport:{ width:393, height:852 }, isMobile:true, hasTouch:true });
  await ctx.addInitScript(() => { localStorage.setItem('ah:P:introDone', 'true'); localStorage.setItem('ah:P:warmupSeen', 'true'); });
  const p = await ctx.newPage(); await p.goto(URL); await p.waitForSelector('#s-home.show'); await p.evaluate(() => ensurePlayer()); await p.waitForTimeout(800);
  await p.evaluate(() => startLesson(1)); await p.waitForTimeout(800);
  await p.evaluate(() => { const b = [...document.querySelectorAll('section.screen.show button.primary')][0]; if (b) b.click(); }); await p.waitForTimeout(1200);
  console.log('\nother modes');
  check('a lesson does not open the walkthrough', await p.evaluate(() => !document.querySelector('#ct').classList.contains('show')));
  check('HOW TO is hidden in a lesson', await p.evaluate(() => { const b = document.querySelector('#btn-tips'); return !b.offsetParent; }));
  await p.evaluate(async () => { S.phase = 'idle'; await refreshDuelTab(); show('s-duel-tab'); document.querySelector('#dt-practice').click(); }); await p.waitForTimeout(2500);
  await p.evaluate(() => { const b = [...document.querySelectorAll('section.screen.show button.primary')].find(x => x.offsetParent); if (b) b.click(); }); await p.waitForTimeout(1500);
  check('a duel does not open it', await p.evaluate(() => S.duel && !document.querySelector('#ct').classList.contains('show')), await p.evaluate(() => document.querySelector('section.screen.show').id + ' duel=' + !!S.duel));
  check('HOW TO is hidden in a duel', await p.evaluate(() => { const b = document.querySelector('#btn-tips'); return !b.offsetParent; }));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
