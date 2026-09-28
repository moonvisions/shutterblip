#!/usr/bin/env node
/* Build script for a production copy of ShutterBlip.
 *
 * What this buys you: index.html today is fully commented — the comments
 * are a design document, explaining WHY every tricky decision was made.
 * That is exactly what you don't want sitting in view-source on a public
 * site. This script produces index.min.html: the JavaScript run through a
 * real minifier (variable names shortened, whitespace and comments gone,
 * logic restructured), and the HTML comments stripped from everything
 * outside <script>. It is NOT encryption and does not stop a determined
 * person — nothing running in a browser can. It raises the bar from
 * "read the comments, understand the whole design in an afternoon" to
 * "reverse-engineer minified code", which is what basically every
 * commercial web app relies on, and it is the honest, standard amount of
 * effort to spend on this.
 *
 * Usage:  node build.js
 * Output: index.min.html   <- deploy THIS file
 *         index.html stays exactly as-is — never deploy the commented copy.
 */
'use strict';
const fs = require('fs');
const { minify } = require('terser');

async function build(){
  const src = fs.readFileSync('index.html', 'utf8');

  const scriptStart = src.indexOf('<script>');
  const scriptOpenEnd = scriptStart + '<script>'.length;
  const scriptEnd = src.lastIndexOf('</script>');
  if (scriptStart < 0 || scriptEnd < 0) throw new Error('Could not find the main <script> block.');

  const before = src.slice(0, scriptStart);
  const code = src.slice(scriptOpenEnd, scriptEnd);
  const after = src.slice(scriptEnd);

  console.log('Minifying JavaScript with terser...');
  const result = await minify(code, {
    compress: { passes: 2 },
    mangle: { toplevel: false },   // keep top-level names: several are read from onclick="" attributes
    format: { comments: false }
  });
  if (result.error) throw result.error;
  const minifiedJS = result.code;
  console.log(`  JS: ${code.length.toLocaleString()} -> ${minifiedJS.length.toLocaleString()} bytes`);

  // Strip HTML comments outside the script block. Safe here because the
  // JS comments are already gone (handled by terser above) and the CSS
  // block has no string literals that could contain "<!--" by accident.
  const stripHtmlComments = s => s.replace(/<!--[\s\S]*?-->/g, '');
  const beforeClean = stripHtmlComments(before);
  const afterClean = stripHtmlComments(after);

  const licenseHeader = `<!-- ShutterBlip — © ${new Date().getFullYear()}. All rights reserved.
     Unauthorized copying, redistribution, or reuse of this file or its
     source is prohibited. See LICENSE-NOTICE.txt. -->\n`;

  const out = licenseHeader + beforeClean + '<script>' + minifiedJS + afterClean;
  fs.writeFileSync('index.min.html', out);
  console.log(`  Total: ${src.length.toLocaleString()} -> ${out.length.toLocaleString()} bytes`);
  console.log('Wrote index.min.html — deploy this file, not index.html.');
  writeLegalPages(src);
}

/* The app stores want the privacy policy and terms at a plain web address
   that opens without running the game. They are generated from the same
   text the game shows, so the two can never say different things. */
function writeLegalPages(src){
  const grab = name => {
    const i = src.indexOf(`const ${name} = {`);
    if (i < 0) throw new Error(`Could not find ${name} in index.html`);
    // the block ends at the first "\n};" after it
    const j = src.indexOf('\n};', i);
    return src.slice(i, j + 3);
  };
  const vm = require('vm');
  const ctx = {};
  vm.runInNewContext(grab('OPERATOR') + '\n' + grab('LEGAL') + '\nthis.OPERATOR=OPERATOR;this.LEGAL=LEGAL;', ctx);
  const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · ShutterBlip</title>
<style>
body{margin:0;background:#0C0C0D;color:#E8E4DC;font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:30px;margin:0 0 4px}h3{margin:28px 0 6px;color:#F2A03D;font-size:17px}
a{color:#35D6C1}.meta{color:#8A93A6;font-size:14px}ul{padding-left:20px}li{margin:6px 0}
</style></head><body><main>
<p class="meta"><a href="/">ShutterBlip</a></p>
<h1>${title}</h1>
${body}
<p class="meta" style="margin-top:40px"><a href="/privacy">Privacy policy</a> · <a href="/terms">Terms of use</a> · <a href="/delete-account">Delete your account</a></p>
</main></body></html>\n`;
  fs.mkdirSync('legal', { recursive:true });
  fs.writeFileSync('legal/privacy.html', page(ctx.LEGAL.privacy.title, ctx.LEGAL.privacy.body));
  fs.writeFileSync('legal/terms.html', page(ctx.LEGAL.terms.title, ctx.LEGAL.terms.body));
  console.log('Wrote legal/privacy.html and legal/terms.html (served at /privacy and /terms).');
}

build().catch(e => { console.error('Build failed:', e.message); process.exit(1); });
