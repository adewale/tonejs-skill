// Shared helpers: find the project's Tone build and launch a headless browser.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

export const here = dirname(fileURLToPath(import.meta.url));

export function localTone() {
  for (let d = process.cwd(); ; d = dirname(d)) {
    const p = join(d, 'node_modules', 'tone');
    if (existsSync(join(p, 'build', 'Tone.js'))) return { path: join(p, 'build', 'Tone.js'), version: JSON.parse(readFileSync(join(p, 'package.json'), 'utf8')).version };
    if (dirname(d) === d) return null;
  }
}

// Resolve browser libraries from the project being checked (cwd), falling back to this script's location.
async function load(mod) {
  for (const base of [process.cwd(), here]) {
    try { const req = createRequire(join(base, 'noop.js')); return await import(pathToFileURL(req.resolve(mod)).href); } catch (e) { /* next */ }
  }
  return null;
}
export async function launch() {
  const exe = process.env.CHROME_PATH;
  const extra = process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(' ') : [];
  const pw = await load('playwright');
  const chromium = pw && (pw.chromium || (pw.default && pw.default.chromium));
  if (chromium) { const b = await chromium.launch({ executablePath: exe || undefined, args: extra }); return { b, page: await b.newPage() }; }
  for (const mod of ['puppeteer', 'puppeteer-core']) {
    const m = await load(mod); if (!m) continue;
    const p = m.default || m;
    const b = await p.launch({ headless: true, executablePath: exe || undefined, args: ['--autoplay-policy=no-user-gesture-required', ...extra] });
    return { b, page: await b.newPage() };
  }
  throw new Error('No headless browser found. Install Playwright (npm i -D playwright && npx playwright install chromium), or open scripts/probes.html in a browser.');
}

