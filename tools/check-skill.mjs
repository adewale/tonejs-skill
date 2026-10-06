#!/usr/bin/env node
// Check every documentation link and API name in the skill against a Tone.js release's own docs.
//
//   node tools/check-skill.mjs                         # against npm's "latest" Tone.js
//   node tools/check-skill.mjs --version 15.5.57       # against a specific release
//   node tools/check-skill.mjs --sources               # also check github.com/Tonejs/Tone.js/blob/… links
//   node tools/check-skill.mjs --docs-json tone.json   # use a TypeDoc JSON file you already have
//   node tools/check-skill.mjs --bump 15.2.0           # check, then repoint every pinned link at 15.2.0
//   node tools/check-skill.mjs --json                  # machine-readable report
//
// What it checks, for the target version:
//   - each https://tonejs.github.io/docs/<v>/<kind>/<Name>.html#<member> link names a symbol (and member)
//     that exists in that version's published TypeDoc data, in the right section; deprecated ones are flagged
//   - each `Tone.Name`, `Name.member` and `getX()` written in the text or code blocks exists there too
//   - each probe ID mentioned in the text exists in scripts/probes.js, and every probe is cited somewhere
//   - each relative link between skill files resolves
//   - with --sources: each Tone.js source link's file still exists at the target version, and the linked
//     line's text is found in it (its new line number is reported, and used by --bump)
// Exit code 1 on any error. Warnings (deprecations, uncited probes) do not fail the run.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = join(ROOT, 'skills', 'tonejs');
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const has = (n) => args.includes(n);
const bumpTo = opt('--bump');
const wantSources = has('--sources') || !!bumpTo;
const asJson = has('--json');

const errors = [], warnings = [], notes = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

// ---------- inputs
const mdFiles = ['SKILL.md', ...readdirSync(join(SKILL, 'references')).filter(f => f.endsWith('.md')).map(f => `references/${f}`)];
const text = Object.fromEntries(mdFiles.map(f => [f, readFileSync(join(SKILL, f), 'utf8')]));

async function npm(spec) {
  const r = await fetch(`https://registry.npmjs.org/tone/${spec}`);
  if (!r.ok) throw new Error(`npm registry: tone/${spec} → ${r.status}`);
  return r.json();
}
async function loadDocs(version) {
  if (opt('--docs-json')) return JSON.parse(readFileSync(opt('--docs-json'), 'utf8'));
  const dir = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'tonedoc');
  const file = join(dir, `tone-${version}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const url = `https://tonejs.github.io/docs/${version}/tone.json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No published API docs for tone ${version} (${url} → ${r.status}). Links to this version would be broken.`);
  const body = await r.text();
  mkdirSync(dir, { recursive: true }); writeFileSync(file, body);
  return JSON.parse(body);
}
const rawCache = new Map();
async function raw(ref, path) {
  const key = `${ref}/${path}`;
  if (!rawCache.has(key)) {
    const r = await fetch(`https://raw.githubusercontent.com/Tonejs/Tone.js/${ref}/${path}`);
    rawCache.set(key, r.ok ? (await r.text()).split('\n') : null);
  }
  return rawCache.get(key);
}

// ---------- TypeDoc index
const FOLDER = { 128: 'classes', 256: 'interfaces', 64: 'functions', 32: 'variables', 2097152: 'types', 4: 'modules' };
function deprecated(n) {
  const cs = [n.comment, ...(n.signatures || []).map(s => s.comment), n.getSignature && n.getSignature.comment].filter(Boolean);
  for (const c of cs) { const t = (c.blockTags || []).find(t => t.tag === '@deprecated'); if (t) return t.content.map(p => p.text).join('').trim() || 'deprecated'; }
  return null;
}

(async () => {
  const latest = await npm('latest').catch(() => null);
  const version = bumpTo || opt('--version') || (latest && latest.version);
  if (!version) throw new Error('Could not determine a Tone.js version; pass --version.');
  const doc = await loadDocs(version);
  const top = new Map((doc.children || []).map(c => [c.name, c]));
  const memberOf = (owner, name) => (owner.children || []).find(m => m.name === name || m.name.toLowerCase() === name.toLowerCase());

  // ---------- 1. API reference links
  const pinned = new Set();
  const docLink = /https:\/\/tonejs\.github\.io\/docs\/([\w.\-]+)\/(classes|functions|interfaces|variables|types|modules)\/([\w$]+)\.html(?:#([\w$\-]+))?/g;
  for (const [f, t] of Object.entries(text)) {
    for (const m of t.matchAll(docLink)) {
      const [url, v, folder, name, anchor] = m;
      pinned.add(v);
      const owner = top.get(name);
      if (!owner) { err(f, `${url}: ${name} is not exported by tone ${version}`); continue; }
      if (FOLDER[owner.kind] !== folder) { err(f, `${url}: ${name} is under ${FOLDER[owner.kind]}/ in tone ${version}, not ${folder}/`); continue; }
      const said = /deprecated/i.test(t.split('\n').find(l => l.includes(url)) || ''); // the skill already calls it deprecated
      const d = deprecated(owner); if (d && !said) warn(f, `${name} is deprecated in tone ${version}: ${d}`);
      if (anchor) {
        const mem = memberOf(owner, anchor);
        if (!mem) { err(f, `${url}: ${name} has no member "${anchor}" in tone ${version}`); continue; }
        const dm = deprecated(mem); if (dm) warn(f, `${name}.${mem.name} is deprecated in tone ${version}: ${dm}`);
      }
    }
  }
  if (pinned.size > 1) warn('*', `links are pinned to several versions: ${[...pinned].join(', ')}`);

  // ---------- 2. API names in prose and code
  const checked = new Set();
  const checkName = (f, cls, mem, shown) => {
    const key = `${cls}.${mem || ''}`; if (checked.has(key + f)) return; checked.add(key + f);
    const owner = top.get(cls);
    if (!owner) { err(f, `\`${shown}\`: ${cls} is not exported by tone ${version}`); return; }
    const d = deprecated(owner);
    if (d) warn(f, `\`${shown}\`: ${cls} is deprecated in tone ${version}: ${d}`);
    if (mem && (owner.kind === 128 || owner.kind === 256)) {
      const m = (owner.children || []).find(c => c.name === mem);
      if (!m) err(f, `\`${shown}\`: ${cls}.${mem} does not exist in tone ${version}`);
      else { const dm = deprecated(m); if (dm) warn(f, `\`${shown}\`: ${cls}.${mem} is deprecated in tone ${version}: ${dm}`); }
    }
  };
  for (const [f, t] of Object.entries(text)) {
    const code = [...t.matchAll(/```[\s\S]*?```/g)].map(m => m[0]);
    const ticks = [...t.replace(/```[\s\S]*?```/g, '').matchAll(/`([^`\n]+)`/g)].map(m => m[1]);
    // the deprecated-globals rule names deprecated APIs on purpose
    const deliberatelyDeprecated = /deprecated/i;
    for (const s of [...code, ...ticks]) {
      for (const m of s.matchAll(/\bTone\.([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?/g)) {
        if (m[1] === 'js') continue; // "Tone.js", the library's name
        const line = t.split('\n').find(l => l.includes(m[0])) || '';
        if (deliberatelyDeprecated.test(line) && top.get(m[1]) && deprecated(top.get(m[1]))) continue;
        checkName(f, m[1], top.has(m[1]) && /^[A-Z]/.test(m[1]) ? m[2] : null, m[0]);
      }
    }
    for (const s of ticks) {
      const m = s.match(/^([A-Z][A-Za-z0-9_$]*)\.([a-z_$][\w$]*)\b/);
      if (m && top.has(m[1])) checkName(f, m[1], m[2], s);
      const fn = s.match(/^((?:get|set)[A-Z][\w$]*)\(/);
      if (fn && !(doc.children || []).some(c => (c.children || []).some(k => k.name === fn[1]))) checkName(f, fn[1], null, s);
    }
  }

  // ---------- 3. probes
  const probeSrc = readFileSync(join(SKILL, 'scripts', 'probes.js'), 'utf8');
  const probeIds = [...probeSrc.matchAll(/\bid:\s*'([^']+)'/g)].map(m => m[1]);
  const cited = new Set();
  for (const [f, t] of Object.entries(text)) {
    for (const m of t.matchAll(/probes? (`[^`]+`(?:,? (?:and )?`[^`]+`)*)/g)) {
      for (const id of m[1].match(/[^`,\s][^`]*(?=`)/g) || []) {
        if (/^(and|or)$/.test(id)) continue;
        const re = new RegExp('^' + id.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
        const hits = probeIds.filter(p => re.test(p));
        if (!hits.length) err(f, `cites probe \`${id}\`, which scripts/probes.js does not define`);
        hits.forEach(h => cited.add(h));
      }
    }
  }
  for (const id of probeIds) if (!cited.has(id)) warn('scripts/probes.js', `probe ${id} is not cited by any claim`);

  // ---------- 4. relative links
  for (const [f, t] of Object.entries(text)) {
    for (const m of t.matchAll(/\]\((?!https?:|#|mailto:)([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (!existsSync(join(SKILL, dirname(f), m[1]))) err(f, `relative link ${m[1]} does not resolve`);
    }
  }

  // ---------- 5. source links
  const relocations = [];
  let targetRef = version;
  const srcLink = /https:\/\/github\.com\/Tonejs\/Tone\.js\/blob\/([\w.\-]+)\/([^\s)#]+)(?:#L(\d+))?/g;
  const refCount = {};
  for (const t of Object.values(text)) for (const m of t.matchAll(srcLink)) refCount[m[1]] = (refCount[m[1]] || 0) + 1;
  const mainRef = Object.keys(refCount).sort((a, b) => refCount[b] - refCount[a])[0];
  if (wantSources) {
    const meta = await npm(version).catch(() => null);
    const tagExists = !!(await raw(version, 'package.json'));
    targetRef = tagExists ? version : (meta && meta.gitHead) || version;
    if (!tagExists) notes.push(`tone ${version} has no git tag; using commit ${targetRef} from the npm metadata`);
    for (const [f, t] of Object.entries(text)) {
      for (const m of t.matchAll(srcLink)) {
        const [url, ref, path, line] = m;
        if (ref !== mainRef) { // deliberately pinned elsewhere (e.g. a change only in a newer build): check it at its own ref
          const own = await raw(ref, path);
          if (!own) err(f, `${url}: ${path} does not exist at ${ref}`);
          else if (line && !(own[+line - 1] || '').trim()) err(f, `${url}: line ${line} is empty at ${ref}`);
          continue;
        }
        const now = await raw(targetRef, path);
        if (!now) { err(f, `${url}: ${path} does not exist in tone ${version}`); continue; }
        if (!line) continue;
        const then = await raw(ref, path);
        if (!then) { err(f, `${url}: cannot read the linked version (${ref})`); continue; }
        const want = (then[+line - 1] || '').trim();
        if (!want) { err(f, `${url}: line ${line} is empty at ${ref}`); continue; }
        const found = now.map((l, i) => l.trim() === want ? i + 1 : 0).filter(Boolean);
        if (!found.length) err(f, `${url}: the linked line ("${want.slice(0, 60)}") is gone in tone ${version}; recheck the claim`);
        else {
          const best = found.reduce((a, b) => Math.abs(b - line) < Math.abs(a - line) ? b : a);
          relocations.push({ f, url, path, line: +line, newLine: best });
        }
      }
    }
  }

  // ---------- report
  const result = { version, npmLatest: latest && latest.version, pinnedTo: [...pinned], errors, warnings, notes,
    sourceLinesMoved: [...new Set(relocations.filter(r => r.line !== r.newLine).map(r => `${r.path}#L${r.line} → #L${r.newLine}`))] };
  if (asJson) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Skill checked against tone ${version} (links pinned to ${[...pinned].join(', ') || 'nothing'}; npm latest ${result.npmLatest || 'unknown'})`);
    for (const n of notes) console.log(`note: ${n}`);
    for (const w of warnings) console.log(`warn: ${w}`);
    for (const e of errors) console.log(`ERROR: ${e}`);
    for (const r of result.sourceLinesMoved) console.log(`moved: ${r}`);
    console.log(errors.length ? `\n${errors.length} error(s). The docs win: fix or remove the claim, then re-run.` : '\nAll links and API names exist in this version.');
  }
  if (errors.length) { process.exitCode = 1; return; }

  // ---------- bump
  if (bumpTo) {
    for (const f of mdFiles) {
      let t = text[f];
      for (const r of relocations.filter(r => r.f === f)) t = t.split(r.url).join(`https://github.com/Tonejs/Tone.js/blob/${targetRef}/${r.path}#L${r.newLine}`);
      t = t.replace(/https:\/\/tonejs\.github\.io\/docs\/[\w.\-]+\//g, `https://tonejs.github.io/docs/${bumpTo}/`);
      if (mainRef) t = t.split(`https://github.com/Tonejs/Tone.js/blob/${mainRef}/`).join(`https://github.com/Tonejs/Tone.js/blob/${targetRef}/`);
      if (f === 'SKILL.md') t = t.replace(/Links below point at [\w.\-]+,/, `Links below point at ${bumpTo},`);
      if (t !== text[f]) { writeFileSync(join(SKILL, f), t); console.log(`bumped ${f}`); }
    }
    console.log(`Links now point at ${bumpTo}. Run the probes against it and update the "Claims last checked" line in SKILL.md.`);
  }
})().catch(e => { console.error(e.message); process.exit(2); });
