/* Phone audit: every main screen, on real iPhone and Android sizes, upright
   and sideways, with the notch / Dynamic Island / home-bar safe areas
   emulated. Writes screenshots plus a findings.json of what is broken.
   node tools/phone-audit.js [url] [outdir] [deviceFilter]
   Needs Playwright (npm i -D playwright) and the game running, e.g. http://localhost:8790 */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const URL = process.argv[2] || 'http://127.0.0.1:8790';
const OUT = path.resolve(process.argv[3] || 'phone-audit-shots');
const FILTER = process.argv[4] || '';
fs.mkdirSync(OUT, { recursive: true });

// w,h are CSS px of the visible page. ins = safe-area insets.
const DEVICES = [
  { id: 'iphone-se',     w: 375, h: 667, dpr: 2, ins: { top: 20, bottom: 0, left: 0, right: 0 },
    land: { w: 667, h: 375, ins: { top: 0, bottom: 0, left: 0, right: 0 } } },
  { id: 'iphone-15',     w: 393, h: 852, dpr: 3, ins: { top: 59, bottom: 34, left: 0, right: 0 },
    land: { w: 852, h: 393, ins: { top: 0, bottom: 21, left: 59, right: 59 } } },
  { id: 'iphone-15-safari-landscape', only: 'land', w: 393, h: 852, dpr: 3, ins: {},
    land: { w: 750, h: 340, ins: { top: 0, bottom: 21, left: 47, right: 47 } } },   // Safari bars eat height
  { id: 'iphone-promax', w: 430, h: 932, dpr: 3, ins: { top: 59, bottom: 34, left: 0, right: 0 },
    land: { w: 932, h: 430, ins: { top: 0, bottom: 21, left: 59, right: 59 } } },
  { id: 'android-small', w: 360, h: 740, dpr: 3, ins: { top: 24, bottom: 0, left: 0, right: 0 },
    land: { w: 740, h: 330, ins: { top: 0, bottom: 0, left: 0, right: 0 } } },     // Chrome with its toolbar
  { id: 'pixel-8',       w: 412, h: 915, dpr: 2.625, ins: { top: 32, bottom: 24, left: 0, right: 0 },
    land: { w: 915, h: 412, ins: { top: 0, bottom: 0, left: 32, right: 0 } } },
  { id: 'ipad-mini',     w: 744, h: 1133, dpr: 2, ins: { top: 24, bottom: 20, left: 0, right: 0 },
    land: { w: 1133, h: 744, ins: { top: 24, bottom: 20, left: 0, right: 0 } } }
];

const SCREENS = ['home', 'brief', 'game', 'result', 'lesson', 'puzzle', 's-duel-tab', 's-learn', 's-you', 's-store',
                 's-board', 's-puzzles-tab', 's-rush-start', 's-name', 's-account'];

// runs in the page: what is wrong with what is on screen right now
const CHECK = ({ ins, screen }) => {
  const W = innerWidth, H = innerHeight, out = [];
  const sec = document.querySelector('section.screen.show');
  const vis = el => {
    if (!el.checkVisibility || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1;
  };
  const name = el => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''))
    + ' "' + (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 28) + '"';
  if (document.documentElement.scrollWidth > W + 1) out.push({ k: 'page-scrolls-sideways', d: document.documentElement.scrollWidth + ' > ' + W });
  if (sec && sec.scrollWidth > sec.clientWidth + 2 && getComputedStyle(sec).overflowX !== 'hidden') out.push({ k: 'screen-scrolls-sideways', d: sec.id + ' ' + sec.scrollWidth + '>' + sec.clientWidth });
  const ctl = [...document.querySelectorAll('button, a[href], input, select, [role=button], [role=tab], .dial, .chip-btn')].filter(vis);
  // only things actually inside the window right now
  const inView = ctl.filter(el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < H; });
  for (const el of inView){
    const r = el.getBoundingClientRect();
    const scroller = (() => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement){ const o = getComputedStyle(a).overflowX; if ((o === 'auto' || o === 'scroll') && a.scrollWidth > a.clientWidth + 1) return a; } return null; })();
    if (scroller){ const sr = scroller.getBoundingClientRect(); if (sr.right > W - ins.right + 1 || sr.left < ins.left - 1) out.push({ k: 'scroller-off-screen', d: name(scroller) }); continue; }
    if (r.right > W + 1 || r.left < -1) out.push({ k: 'control-off-screen', d: name(el) + ` x ${r.left|0}..${r.right|0} of ${W}` });
    // a fixed / sticky control (or one on a screen that cannot scroll) sitting under the notch or home bar
    const noscroll = !sec || sec.scrollHeight <= sec.clientHeight + 2 || el.closest('#tabbar,#btn-home') || getComputedStyle(el).position === 'fixed';
    if (r.left < ins.left - 1 || r.right > W - ins.right + 1) out.push({ k: 'control-under-notch', d: name(el) + ` x ${r.left|0}..${r.right|0}, safe ${ins.left}..${W - ins.right}` });
    if (noscroll && r.top < ins.top - 1 && r.bottom > 0) out.push({ k: 'control-under-status-bar', d: name(el) + ` top ${r.top|0} < ${ins.top}` });
    if (noscroll && r.bottom > H - ins.bottom + 1 && r.top < H) out.push({ k: 'control-under-home-bar', d: name(el) + ` bottom ${r.bottom|0} > ${H - ins.bottom}` });
    const m = Math.min(r.width, r.height);
    if (m < 32 && !el.closest('.strip')) out.push({ k: 'tap-target-small', d: name(el) + ` ${r.width|0}x${r.height|0}` });
  }
  // controls stacked on top of each other
  for (let i = 0; i < inView.length; i++) for (let j = i + 1; j < inView.length; j++){
    const a = inView[i], b = inView[j];
    if (a.contains(b) || b.contains(a)) continue;
    // content scrolling under the tab bar is normal, unless the screen cannot scroll
    const inBar = x => x.closest('#tabbar');
    if ((inBar(a) || inBar(b)) && sec && sec.scrollHeight > sec.clientHeight + 2) continue;
    const r1 = a.getBoundingClientRect(), r2 = b.getBoundingClientRect();
    const ox = Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left), oy = Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top);
    if (ox > 4 && oy > 4){
      const area = ox * oy, small = Math.min(r1.width * r1.height, r2.width * r2.height);
      if (area > small * 0.25){
        // is one actually covering the other where they meet?
        const cx = Math.max(r1.left, r2.left) + ox / 2, cy = Math.max(r1.top, r2.top) + oy / 2;
        const top = document.elementFromPoint(cx, cy);
        if (top && (a.contains(top) || b.contains(top))) out.push({ k: 'controls-overlap', d: name(a) + ' ⟂ ' + name(b) });
      }
    }
  }
  // text cut off with no ellipsis
  if (sec) for (const el of sec.querySelectorAll('h1,h2,h3,p,span,b,div,button,label')){
    if (!vis(el) || el.children.length > 0) continue;
    const cs = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 3 && (cs.overflow === 'hidden' || cs.overflowX === 'hidden') && cs.textOverflow !== 'ellipsis' && el.textContent.trim().length > 2)
      out.push({ k: 'text-clipped', d: name(el) + ` ${el.scrollWidth}>${el.clientWidth}` });
  }
  // the camera: everything needed to shoot must be on screen without scrolling
  if (screen === 'game'){
    const need = ['#shutter', '.vfwrap', '.dials', '.strip'];
    for (const s of need){
      const el = document.querySelector('#s-game ' + s) || document.querySelector(s);
      if (!el || !vis(el)){ out.push({ k: 'camera-part-missing', d: s }); continue; }
      const r = el.getBoundingClientRect();
      if (r.bottom > H - ins.bottom + 1 || r.top < 0 || r.right > W - ins.right + 1 || r.left < ins.left - 1)
        out.push({ k: 'camera-part-not-fully-visible', d: `${s} ${r.left|0},${r.top|0} ${r.right|0},${r.bottom|0} in ${W}x${H}` });
    }
    const vf = document.querySelector('#s-game .vfwrap');
    if (vf){ const r = vf.getBoundingClientRect(); out.push({ k: 'info-viewfinder', d: `${r.width|0}x${r.height|0} = ${Math.round(r.width * r.height / (W * H) * 100)}% of screen` }); }
    for (const d of document.querySelectorAll('#s-game .dial')){ const r = d.getBoundingClientRect(); if (r.width < 40) out.push({ k: 'dial-too-narrow', d: name(d) + ' ' + (r.width|0) }); }
  }
  return out;
};

async function runConfig(b, dev, orient){
  const L = orient === 'land';
  const w = L ? dev.land.w : dev.w, h = L ? dev.land.h : dev.h, ins = { top: 0, bottom: 0, left: 0, right: 0, ...(L ? dev.land.ins : dev.ins) };
  const tag = `${dev.id}-${orient}`;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('ah:P:introDone', 'true'); localStorage.setItem('ah:P:camTourSeen', 'true'); localStorage.setItem('ah:P:warmupSeen', 'true'); localStorage.setItem('ah:P:playMode', '"free"'); } catch (e) {} });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: ins });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(URL); await p.waitForSelector('#s-home.show', { timeout: 20000 });
  await p.evaluate(() => ensurePlayer()); await p.waitForTimeout(900);
  await p.evaluate(() => { try { Audio_.shutter = () => {}; Audio_.levelup = () => {}; Audio_.click = () => {}; } catch (e) {} });
  const found = {};
  for (const sc of SCREENS){
    try {
      if (sc === 'home') await p.evaluate(() => show('s-home'));
      else if (sc === 'brief'){ await p.evaluate(() => startCareer()); await p.waitForTimeout(500); }
      else if (sc === 'game'){
        await p.evaluate(() => { const b = document.querySelector('#btn-go'); if (b && b.offsetParent) b.click(); });
        await p.waitForTimeout(4200);
      }
      else if (sc === 'result'){ await p.evaluate(() => { if (S.phase !== 'live') S.phase = 'live'; capture(false); }); await p.waitForTimeout(1600); await p.evaluate(() => { try { hideRankUp(); } catch (e) {} }); }
      else if (sc === 'lesson'){ await p.evaluate(() => { S.phase = 'idle'; startLesson(1); }); await p.waitForTimeout(900);
        await p.evaluate(() => { const b = [...document.querySelectorAll('section.screen.show button.primary')][0]; if (b) b.click(); }); await p.waitForTimeout(1500); }
      else if (sc === 'puzzle'){ await p.evaluate(() => { S.phase = 'idle'; openPuzzle(1); }); await p.waitForTimeout(1200); }
      else { await p.evaluate(id => { S.phase = 'idle'; show(id); }, sc); }
      await p.waitForTimeout(500);
      const shown = await p.evaluate(() => (document.querySelector('section.screen.show') || {}).id);
      const f = await p.evaluate(CHECK, { ins, screen: sc });
      found[sc] = { shown, issues: f };
      await p.screenshot({ path: path.join(OUT, `${tag}--${sc}.png`) });
    } catch (e){ found[sc] = { error: String(e).slice(0, 200) }; }
  }
  // turn the phone round mid-round: the camera must re-fit, not stay laid out for the old shape
  try {
    await p.evaluate(() => { S.phase = 'idle'; startCareer(); });
    await p.waitForTimeout(400);
    await p.evaluate(() => { const b = document.querySelector('#btn-go'); if (b && b.offsetParent) b.click(); });
    await p.waitForTimeout(4000);
    await p.setViewportSize({ width: h, height: w });
    const ins2 = { top: 0, bottom: 0, left: 0, right: 0, ...(L ? dev.ins : dev.land.ins) };
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: ins2 });
    await p.waitForTimeout(900);
    const canvas = await p.evaluate(() => { const c = document.querySelector('#s-game canvas'); const r = c.getBoundingClientRect(); return { cw: c.width, ch: c.height, w: r.width, h: r.height, dpr: devicePixelRatio }; });
    const f = await p.evaluate(CHECK, { ins: ins2, screen: 'game' });
    const ratio = canvas.cw / canvas.ch, box = canvas.w / canvas.h;
    if (Math.abs(ratio - box) / box > 0.04) f.push({ k: 'canvas-stretched-after-rotate', d: JSON.stringify(canvas) });
    found['rotate-mid-round'] = { issues: f, canvas };
    await p.screenshot({ path: path.join(OUT, `${tag}--rotated.png`) });
  } catch (e){ found['rotate-mid-round'] = { error: String(e).slice(0, 200) }; }
  found.pageErrors = errs;
  await ctx.close();
  return { tag, w, h, ins, found };
}

(async () => {
  const b = await chromium.launch();
  const all = [];
  for (const dev of DEVICES){
    if (FILTER && !dev.id.includes(FILTER)) continue;
    for (const o of ['port', 'land']){
      if (dev.only && dev.only !== o) continue;
      const r = await runConfig(b, dev, o);
      all.push(r);
      const n = Object.values(r.found).reduce((a, v) => a + ((v && v.issues) ? v.issues.filter(i => !i.k.startsWith('info')).length : 0), 0);
      console.log(r.tag.padEnd(36), n, 'issues', r.found.pageErrors.length ? 'ERRORS ' + r.found.pageErrors.length : '');
    }
  }
  fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(all, null, 1));
  await b.close();
})();
