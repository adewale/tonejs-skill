#!/usr/bin/env node
// tonedoc: look up the official Tone.js API documentation for the version a project uses.
//
//   node tonedoc.mjs <Symbol | Class.member> [--version 15.1.22] [--examples]
//   node tonedoc.mjs --search <text> [--version …]
//   node tonedoc.mjs --version-info
//
// Source of truth: the TypeDoc JSON that Tone.js publishes with its docs,
// https://tonejs.github.io/docs/<version>/tone.json — the same data as the HTML API pages.
// Version: --version, else node_modules/tone/package.json, else npm's "latest" tag.
// Offline fallback: the JSDoc comments in node_modules/tone/build/esm/**/*.d.ts.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const bool = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const wantVersion = flag('--version');
const search = flag('--search');
const showExamples = bool('--examples');
const versionInfo = bool('--version-info');
const query = args[0];

function installedVersion(dir = process.cwd()) {
  for (let d = dir; ; d = dirname(d)) {
    const p = join(d, 'node_modules', 'tone', 'package.json');
    if (existsSync(p)) return { version: JSON.parse(readFileSync(p, 'utf8')).version, root: dirname(p) };
    if (dirname(d) === d) return null;
  }
}
async function npmLatest() {
  const r = await fetch('https://registry.npmjs.org/tone/latest');
  if (!r.ok) throw new Error(`npm registry ${r.status}`);
  return (await r.json()).version;
}

async function loadDocs(version) {
  const cacheDir = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'tonedoc');
  const file = join(cacheDir, `tone-${version}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const url = `https://tonejs.github.io/docs/${version}/tone.json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No published docs for ${version} (${url} → ${r.status})`);
  const text = await r.text();
  mkdirSync(cacheDir, { recursive: true }); writeFileSync(file, text);
  return JSON.parse(text);
}

// ---- TypeDoc helpers
const KIND = { 1: 'project', 4: 'namespace', 32: 'variable', 64: 'function', 128: 'class', 256: 'interface', 512: 'constructor', 1024: 'property', 2048: 'method', 4096: 'call', 262144: 'accessor', 2097152: 'type alias', 8: 'enum' };
const inline = (parts = []) => parts.map(p => p.kind === 'inline-tag' ? (p.text || '') : p.text).join('');
function typeStr(t) {
  if (!t) return 'unknown';
  switch (t.type) {
    case 'intrinsic': case 'reference': return t.name + (t.typeArguments ? `<${t.typeArguments.map(typeStr).join(', ')}>` : '');
    case 'literal': return JSON.stringify(t.value);
    case 'union': return t.types.map(typeStr).join(' | ');
    case 'intersection': return t.types.map(typeStr).join(' & ');
    case 'array': return typeStr(t.elementType) + '[]';
    case 'tuple': return `[${(t.elements || []).map(typeStr).join(', ')}]`;
    case 'reflection': return t.declaration && t.declaration.signatures ? '(…) => …' : '{…}';
    case 'indexedAccess': return `${typeStr(t.objectType)}[${typeStr(t.indexType)}]`;
    case 'typeOperator': return `${t.operator} ${typeStr(t.target)}`;
    case 'query': return `typeof ${typeStr(t.queryType)}`;
    case 'templateLiteral': return 'string';
    default: return t.name || t.type;
  }
}
function sigStr(name, s) {
  const ps = (s.parameters || []).map(p => `${p.name}${p.flags && p.flags.isOptional ? '?' : ''}: ${typeStr(p.type)}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`);
  return `${name}(${ps.join(', ')}): ${typeStr(s.type)}`;
}
function comment(n) {
  const c = n.comment || (n.signatures && n.signatures[0] && n.signatures[0].comment) || (n.getSignature && n.getSignature.comment);
  if (!c) return { summary: '', tags: [] };
  return { summary: inline(c.summary).trim(), tags: (c.blockTags || []).map(t => ({ tag: t.tag, text: inline(t.content).trim() })) };
}
function htmlUrl(version, owner, member) {
  const base = `https://tonejs.github.io/docs/${version}`;
  if (!owner) return null;
  const folder = { 128: 'classes', 256: 'interfaces', 64: 'functions', 32: 'variables', 2097152: 'types', 4: 'modules' }[owner.kind] || 'classes';
  return `${base}/${folder}/${owner.name}.html${member ? '#' + member.name.toLowerCase() : ''}`;
}

function index(doc) {
  const top = new Map();
  for (const c of doc.children || []) top.set(c.name, c);
  return top;
}
function findMember(cls, name) { return (cls.children || []).find(m => m.name === name); }

function print(version, owner, member) {
  const n = member || owner;
  const c = comment(n);
  const where = n.sources && n.sources[0];
  const lines = [];
  lines.push(`${owner.name}${member ? '.' + member.name : ''}  (${KIND[n.kind] || n.kind}, tone@${version})`);
  if (n.flags && n.flags.isInherited || member && member.inheritedFrom) lines.push(`  inherited from ${typeStr(member.inheritedFrom)}`);
  for (const s of n.signatures || []) lines.push('  ' + sigStr(n.name, s));
  if (n.getSignature) lines.push(`  get ${n.name}: ${typeStr(n.getSignature.type)}${n.setSignature ? '  (settable)' : '  (read-only)'}`);
  if (n.type && !n.signatures) lines.push(`  type: ${typeStr(n.type)}`);
  if (c.summary) lines.push('', c.summary.split('\n').map(l => '  ' + l).join('\n'));
  for (const t of c.tags) {
    if (t.tag === '@example' && !showExamples) { lines.push('  @example (run with --examples to show)'); continue; }
    lines.push(`  ${t.tag} ${t.text.split('\n').join('\n    ')}`);
  }
  if (!member && owner.kind === 128) {
    const own = (owner.children || []).filter(m => !m.inheritedFrom && m.kind !== 512).map(m => m.name);
    if (own.length) lines.push('', `  own members: ${own.join(', ')}`);
    if (owner.extendedTypes) lines.push(`  extends: ${owner.extendedTypes.map(typeStr).join(', ')}`);
  }
  lines.push('', `  docs:   ${htmlUrl(version, owner, member)}`);
  if (where && where.url) lines.push(`  source: ${where.url}`);
  console.log(lines.join('\n'));
}

function dtsFallback(root, q) {
  const [cls, mem] = q.split('.');
  const hits = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); const st = statSync(p); if (st.isDirectory()) walk(p); else if (f.endsWith('.d.ts')) { const t = readFileSync(p, 'utf8'); if (new RegExp(`(class|function|const) ${cls}\\b`).test(t)) hits.push([p, t]); } } };
  walk(join(root, 'build', 'esm'));
  for (const [p, t] of hits.slice(0, 2)) {
    console.log(`# ${p}`);
    if (!mem) { const i = t.search(new RegExp(`(class|function|const) ${cls}\\b`)); console.log(t.slice(Math.max(0, t.lastIndexOf('/**', i)), i + 200)); continue; }
    const re = new RegExp(`\\n\\s*(get |set |static |readonly )*${mem}[(<:?]`, 'g'); let m;
    while ((m = re.exec(t))) { const start = t.lastIndexOf('/**', m.index); console.log(t.slice(start > m.index - 3000 ? start : m.index, m.index + 160).trim(), '\n'); }
  }
}

(async () => {
  const inst = installedVersion();
  const version = wantVersion || (inst && inst.version) || await npmLatest();
  if (versionInfo) {
    const latest = await npmLatest().catch(() => 'unknown');
    console.log(JSON.stringify({ using: version, installed: inst && inst.version, npmLatest: latest, docs: `https://tonejs.github.io/docs/${version}/` }, null, 2));
    return;
  }
  if (!query && !search) { console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 12).join('\n')); return; }
  let doc;
  try { doc = await loadDocs(version); } catch (e) {
    console.error(`! ${e.message}`);
    if (inst && query) { console.error('! Falling back to the JSDoc in node_modules/tone (same version, less structure):'); dtsFallback(inst.root, query); return; }
    process.exit(2);
  }
  const top = index(doc);
  if (search) {
    const s = search.toLowerCase(); const out = [];
    for (const [name, n] of top) {
      if (name.toLowerCase().includes(s) || comment(n).summary.toLowerCase().includes(s)) out.push(`${name}  — ${comment(n).summary.split('\n')[0].slice(0, 90)}`);
      for (const m of n.children || []) if (!m.inheritedFrom && m.name.toLowerCase().includes(s)) out.push(`${name}.${m.name}`);
    }
    console.log(out.slice(0, 60).join('\n') || 'no matches'); return;
  }
  const [cls, mem] = query.replace(/^Tone\./, '').split('.');
  const owner = top.get(cls);
  if (!owner) { console.error(`! ${cls} is not exported by tone@${version}. Try --search ${cls}`); process.exit(1); }
  const member = mem ? findMember(owner, mem) : null;
  if (mem && !member) { console.error(`! ${cls}.${mem} does not exist in tone@${version}. Members: ${(owner.children || []).map(m => m.name).join(', ')}`); process.exit(1); }
  print(version, owner, member);
})();
