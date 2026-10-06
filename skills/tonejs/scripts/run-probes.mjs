#!/usr/bin/env node
// Run the behaviour probes against a Tone.js build in headless Chromium.
//
//   node run-probes.mjs                      # the project's node_modules/tone
//   node run-probes.mjs --version 15.1.22    # a published version, fetched from jsDelivr
//   node run-probes.mjs --json               # machine-readable output (for CI)
//
// Needs Playwright (`npx playwright install chromium`) or Puppeteer. Without either,
// open probes.html in any browser instead: probes.html?version=15.1.22
// Exit code 1 when any probe fails, so CI can flag a stale claim.

import { join } from 'node:path';
import { here, localTone, launch } from './browser.mjs';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const version = opt('--version');
const json = args.includes('--json');

(async () => {
  const local = version ? null : localTone();
  const toneSrc = local ? { path: local.path } : { url: `https://cdn.jsdelivr.net/npm/tone@${version || 'latest'}/build/Tone.js` };
  const { b, page } = await launch();
  try {
    await page.goto('about:blank');
    await page.addScriptTag(toneSrc);
    await page.addScriptTag({ path: join(here, 'probes.js') });
    const results = await page.evaluate(async () => {
      await Tone.start().catch(() => {});
      const out = [];
      for (const p of window.TONE_PROBES) {
        try { const r = await p.run(); out.push({ id: p.id, claim: p.claim, ...r }); }
        catch (e) { out.push({ id: p.id, claim: p.claim, pass: false, detail: 'probe crashed: ' + e.message }); }
      }
      return { version: Tone.version, results: out };
    });
    if (json) console.log(JSON.stringify(results, null, 2));
    else {
      console.log(`Tone.js ${results.version}\n`);
      for (const r of results.results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id}\n      ${r.detail}`);
      const failed = results.results.filter(r => !r.pass).length;
      console.log(`\n${results.results.length - failed}/${results.results.length} claims still hold.${failed ? ' Failed claims are out of date for this version: follow the docs, then update the skill.' : ''}`);
    }
    process.exitCode = results.results.some(r => !r.pass) ? 1 : 0;
  } finally { await b.close(); }
})().catch(e => { console.error(e.message); process.exit(2); });
