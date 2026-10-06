#!/usr/bin/env node
// Render Tone.js code offline in a real browser and report what it actually sounds like, in numbers.
//
//   node render-check.mjs patch.js [--duration 2] [--seed 1] [--channels 2] [--json]
//
// patch.js is evaluated in the page as the body of an async function that receives `Tone` and
// `time` helpers, inside Tone.Offline — build the graph and schedule notes there, e.g.
//
//   const synth = new Tone.PolySynth(Tone.Synth).toDestination();
//   synth.triggerAttackRelease(["C4", "E4", "G4"], 0.5, 0.1);
//
// Reports: sample peak and 4×-oversampled true peak (dBFS), RMS, DC offset, non-finite samples,
// silence, and onset times (where the level first rises after quiet). With --seed, Math.random is
// replaced by a seeded generator during the render so noise-based sounds are repeatable.
// Exit code 1 when a hard check fails (non-finite samples, silence, or true peak above 0 dBFS).

import { readFileSync } from 'node:fs';
import { localTone, launch } from './browser.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const file = args.find(a => !a.startsWith('--') && !/^\d/.test(a));
if (!file) { console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 17).join('\n')); process.exit(0); }
const duration = +opt('--duration', 2), channels = +opt('--channels', 2), seed = opt('--seed', null), json = args.includes('--json');
const version = opt('--version', null);
const body = readFileSync(file, 'utf8');

(async () => {
  const local = version ? null : localTone();
  const { b, page } = await launch();
  try {
    await page.goto('about:blank');
    await page.addScriptTag(local ? { path: local.path } : { url: `https://cdn.jsdelivr.net/npm/tone@${version || 'latest'}/build/Tone.js` });
    const r = await page.evaluate(async ({ body, duration, channels, seed }) => {
      const realRandom = Math.random;
      if (seed != null) { let s = (+seed >>> 0) || 1; Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
      let buf;
      try {
        const fn = new Function('Tone', `return (async () => {\n${body}\n})()`);
        buf = await Tone.Offline(async () => { await fn(Tone); await Tone.loaded(); }, duration, channels);
      } finally { Math.random = realRandom; }
      const sr = buf.sampleRate, out = { version: Tone.version, sampleRate: sr, duration, channels: [] };
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const x = buf.getChannelData(c);
        let peak = 0, sum = 0, sq = 0, bad = 0;
        for (let i = 0; i < x.length; i++) { const v = x[i]; if (!Number.isFinite(v)) { bad++; continue; } peak = Math.max(peak, Math.abs(v)); sum += v; sq += v * v; }
        // 4× oversampled true peak (windowed-sinc interpolation, 32 taps)
        let tp = peak; const taps = 16;
        for (let i = taps; i < x.length - taps; i++) {
          if (Math.abs(x[i]) < peak * 0.5) continue;
          for (let k = 1; k < 4; k++) {
            const f = k / 4; let acc = 0;
            for (let j = -taps + 1; j <= taps; j++) { const t = j - f; const w = 0.5 + 0.5 * Math.cos(Math.PI * t / taps); acc += x[i + j] * (t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)) * w; }
            tp = Math.max(tp, Math.abs(acc));
          }
        }
        // onsets: 10 ms windows rising 12 dB above the previous window and above −50 dBFS
        const win = Math.round(sr * 0.01), onsets = []; let prev = 0;
        for (let i = 0; i + win <= x.length; i += win) {
          let e = 0; for (let j = i; j < i + win; j++) e += x[j] * x[j]; e = Math.sqrt(e / win);
          if (e > 0.00316 && e > prev * 4 && (onsets.length === 0 || i / sr - onsets[onsets.length - 1] > 0.05)) onsets.push(+(i / sr).toFixed(3));
          prev = e;
        }
        const db = (v) => v > 0 ? +(20 * Math.log10(v)).toFixed(2) : -Infinity;
        out.channels.push({ peakDb: db(peak), truePeakDb: db(tp), rmsDb: db(Math.sqrt(sq / x.length)), dc: +(sum / x.length).toFixed(5), nonFinite: bad, silent: peak < 1e-4, onsets: onsets.slice(0, 32) });
      }
      return out;
    }, { body, duration, channels, seed });
    const fail = r.channels.some(c => c.nonFinite > 0 || c.silent || c.truePeakDb > 0);
    if (json) console.log(JSON.stringify(r, null, 2));
    else {
      console.log(`Tone.js ${r.version}, ${r.duration} s at ${r.sampleRate} Hz${seed != null ? `, seed ${seed}` : ''}`);
      r.channels.forEach((c, i) => console.log(`ch${i + 1}: peak ${c.peakDb} dBFS, true peak ${c.truePeakDb} dBFS, RMS ${c.rmsDb} dBFS, DC ${c.dc}, non-finite ${c.nonFinite}${c.silent ? ', SILENT' : ''}\n     onsets (s): ${c.onsets.join(', ') || 'none'}`));
      console.log(fail ? 'FAIL: silent, non-finite or over full scale.' : 'OK');
    }
    process.exitCode = fail ? 1 : 0;
  } finally { await b.close(); }
})().catch(e => { console.error(e.message); process.exit(2); });
