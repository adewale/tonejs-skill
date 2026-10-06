// Behaviour probes: each one checks, against a real Tone.js build in a real browser, a claim the skill
// makes that the API reference does not state outright. IDs match the [probe: …] tags in the skill.
// A probe "passes" when Tone still behaves as the skill says. A failing probe means the skill is out of
// date for that Tone.js version: trust the docs and the code you can run, and update the skill.
// Loaded into a page that already has the global `Tone`; exposes window.TONE_PROBES.
(function () {
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const peak = (buf) => { let p = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i])); } return p; };

  window.TONE_PROBES = [
    {
      id: 'now-includes-lookahead',
      claim: 'Tone.now() = context time + lookAhead; Tone.immediate() has no lookAhead.',
      run: async () => {
        const d = Tone.now() - Tone.immediate(), la = Tone.getContext().lookAhead;
        return { pass: near(d, la, 0.02), detail: `now−immediate=${d.toFixed(3)}s, lookAhead=${la}` };
      },
    },
    {
      id: 'omitted-time-means-now',
      claim: 'A Time argument left out resolves to Tone.now() (with lookAhead), not the raw context time.',
      run: async () => {
        const g = new Tone.Gain(); const t = g.toSeconds(undefined); const n = Tone.now(); g.dispose();
        return { pass: near(t, n, 0.02) && t > Tone.immediate() + 0.01, detail: `toSeconds()=${t.toFixed(3)} now=${n.toFixed(3)} immediate=${Tone.immediate().toFixed(3)}` };
      },
    },
    {
      id: 'notation-follows-transport-bpm',
      claim: 'Notation such as "4n" is converted with the Transport tempo, even if you never start the Transport.',
      run: async () => {
        const tr = Tone.getTransport(); const old = tr.bpm.value;
        tr.bpm.value = 120; const a = Tone.Time('4n').toSeconds();
        tr.bpm.value = 60; const b = Tone.Time('4n').toSeconds();
        tr.bpm.value = old;
        return { pass: near(a, 0.5, 1e-6) && near(b, 1, 1e-6), detail: `"4n" = ${a}s at 120 bpm, ${b}s at 60 bpm` };
      },
    },
    {
      id: 'monophonic-same-start-throws',
      claim: 'Starting a monophonic synth twice at the same time throws "Start time must be strictly greater than previous start time".',
      run: async () => {
        const s = new Tone.Synth(); const t = Tone.now() + 0.3; let err = null;
        s.triggerAttackRelease('C4', 0.1, t);
        try { s.triggerAttackRelease('E4', 0.1, t); } catch (e) { err = e; }
        s.dispose();
        return { pass: !!err && /strictly greater/.test(err.message), detail: err ? err.message : 'no error thrown' };
      },
    },
    {
      id: 'monophonic-rejects-chord',
      claim: 'Passing an array of notes to a monophonic synth throws; use PolySynth for chords.',
      run: async () => {
        const s = new Tone.Synth(); let err = null;
        try { s.triggerAttack(['C4', 'E4', 'G4'], Tone.now() + 0.2); } catch (e) { err = e; }
        s.dispose();
        return { pass: !!err, detail: err ? err.message.slice(0, 90) : 'no error thrown' };
      },
    },
    {
      id: 'signal-overrides-param',
      claim: 'Connecting a Tone signal to a Param replaces the Param\'s own value (native AudioParams would add them).',
      run: async () => {
        const buf = await Tone.Offline(() => {
          const g = new Tone.Gain(0.5).toDestination();
          new Tone.Signal(1).connect(g).start?.();
          new Tone.Signal(0.25).connect(g.gain);
        }, 0.05, 1);
        const v = buf.getChannelData(0)[1000];
        return { pass: near(v, 0.25, 0.01), detail: `output ${v.toFixed(3)} (0.25 = replaced, 0.75 = summed)` };
      },
    },
    {
      id: 'param-after-signal-disconnect',
      claim: 'After the modulating signal is disconnected, tone <= 15.1.22 leaves the param at 0 and tone >= 15.5.57 restores its old value; setting it again works on both.',
      run: async () => {
        const render = (reset) => Tone.Offline(() => {
          const g = new Tone.Gain(0.5).toDestination();
          new Tone.Signal(1).connect(g);
          const mod = new Tone.Signal(0.25).connect(g.gain);
          mod.disconnect();
          if (reset) g.gain.value = 0.5;
        }, 0.05, 1).then(b => b.getChannelData(0)[1000]);
        const left = await render(false), reset = await render(true);
        const [ma, mi, pa] = Tone.version.split('.').map(Number), v = ma * 1e6 + mi * 1e3 + pa;
        const restored = Math.abs(left - 0.5) < 0.01, zeroed = Math.abs(left) < 0.01;
        const expected = v <= 15001022 ? zeroed : v >= 15005057 ? restored : (zeroed || restored);
        return { pass: expected && Math.abs(reset - 0.5) < 0.01, detail: `after disconnect ${left.toFixed(3)} (${restored ? 'restored' : zeroed ? 'left at 0' : 'other'}), after setting it again ${reset.toFixed(3)}` };
      },
    },
    {
      id: 'lfo-effects-need-start',
      claim: 'Tremolo, AutoFilter, AutoPanner, Chorus and similar LFO effects do nothing until .start() is called.',
      run: async () => {
        const render = (start) => Tone.Offline(() => {
          const t = new Tone.Tremolo({ frequency: 20, depth: 1, spread: 0 }).toDestination();
          if (start) t.start(0);
          new Tone.Signal(1).connect(t);
        }, 0.2, 1);
        const spread = (b) => { const d = b.getChannelData(0); let lo = 9, hi = -9; for (let i = 2000; i < d.length; i++) { lo = Math.min(lo, d[i]); hi = Math.max(hi, d[i]); } return hi - lo; };
        const off = spread(await render(false)), on = spread(await render(true));
        return { pass: off < 0.01 && on > 0.3, detail: `modulation range without start ${off.toFixed(3)}, with start ${on.toFixed(3)}` };
      },
    },
    {
      id: 'limiter-not-brickwall',
      claim: 'Tone.Limiter is a compressor; transients can exceed its threshold, so it is not a hard ceiling.',
      run: async () => {
        const buf = await Tone.Offline(() => {
          const lim = new Tone.Limiter(-6).toDestination();
          const osc = new Tone.Oscillator(110, 'square').connect(new Tone.Gain(4).connect(lim));
          osc.start(0);
        }, 0.5, 1);
        const p = peak(buf), ceil = Tone.dbToGain(-6);
        return { pass: p > ceil * 1.05, detail: `peak ${Tone.gainToDb(p).toFixed(1)} dBFS against a −6 dB threshold` };
      },
    },
    {
      id: 'reverb-ready-replaced',
      claim: 'Changing Reverb.decay or preDelay replaces .ready; await the new promise.',
      run: async () => {
        const r = new Tone.Reverb(1); const a = r.ready; r.decay = 2; const b = r.ready; await b; r.dispose();
        return { pass: a !== b, detail: a !== b ? 'ready was replaced' : 'ready unchanged' };
      },
    },
    {
      id: 'offline-swaps-global-context',
      claim: 'Tone.Offline swaps the global context while its callback runs; run offline renders one at a time.',
      run: async () => {
        const orig = Tone.getContext(); let inside = null;
        await Tone.Offline(() => { inside = Tone.getContext(); }, 0.05, 1);
        return { pass: inside !== orig && Tone.getContext() === orig, detail: `inside callback: ${inside === orig ? 'same' : 'different'} context; afterwards restored: ${Tone.getContext() === orig}` };
      },
    },
    {
      id: 'nodes-bound-to-creation-context',
      claim: 'Nodes keep the context they were created in; after Tone.setContext they cannot connect to new nodes.',
      run: async () => {
        const orig = Tone.getContext(); const a = new Tone.Gain();
        Tone.setContext(new Tone.Context()); const b = new Tone.Gain(); let err = null;
        try { a.connect(b); } catch (e) { err = e; }
        const tmp = Tone.getContext(); Tone.setContext(orig); b.dispose(); a.dispose(); tmp.dispose();
        return { pass: !!err, detail: err ? `${err.name}: ${err.message.slice(0, 70)}` : 'connected without error' };
      },
    },
    {
      id: 'delay-length-capped-at-construction',
      claim: 'Setting a Delay/FeedbackDelay longer than its maxDelay (by default 1 s, or the initial delayTime if longer) throws a RangeError; pass maxDelay up front if tempo changes can lengthen it.',
      run: async () => {
        const arrival = async (opts) => {
          const buf = await Tone.Offline(() => {
            const d = new Tone.FeedbackDelay({ feedback: 0, wet: 1, ...opts }).toDestination();
            d.delayTime.value = 2;                                   // e.g. a tempo change after construction
            const click = new Float32Array(64); click[0] = 1;
            new Tone.Player(Tone.ToneAudioBuffer.fromArray(click)).connect(d).start(0.1);
          }, 2.6, 1);
          const x = buf.getChannelData(0); for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 0.5) return i / buf.sampleRate - 0.1;
          return null;
        };
        let cappedErr = null; try { await arrival({ delayTime: 0.25 }); } catch (e) { cappedErr = e; }
        const roomy = await arrival({ delayTime: 0.25, maxDelay: 4 });
        return { pass: !!cappedErr && cappedErr instanceof RangeError && roomy != null && Math.abs(roomy - 2) < 0.05, detail: `2 s without maxDelay → ${cappedErr ? cappedErr.name + ': ' + cappedErr.message : 'no error'}; with maxDelay 4 → heard after ${roomy == null ? 'none' : roomy.toFixed(2) + ' s'}` };
      },
    },
    {
      id: 'polysynth-needs-monophonic-voice',
      claim: 'PolySynth only accepts Monophonic voices (Synth, FMSynth, …); PluckSynth and Sampler are not valid voices.',
      run: async () => {
        let err = null; try { const p = new Tone.PolySynth(Tone.PluckSynth); p.triggerAttackRelease('C4', 0.1, Tone.now() + 0.2); p.dispose(); } catch (e) { err = e; }
        return { pass: !!err, detail: err ? err.message.slice(0, 90) : 'PolySynth(PluckSynth) worked' };
      },
    },
    {
      id: 'worklets-load-from-blob-urls',
      claim: 'Tone loads its AudioWorklets (e.g. BitCrusher, Freeverb) from blob: URLs, so a strict CSP must allow blob:.',
      run: async () => {
        const seen = []; const orig = URL.createObjectURL;
        URL.createObjectURL = function (b) { seen.push(b && b.type); return orig.apply(this, arguments); };
        try { const c = new Tone.BitCrusher(4); await new Promise(r => setTimeout(r, 300)); c.dispose(); } finally { URL.createObjectURL = orig; }
        return { pass: seen.some(t => /javascript/.test(t || '')), detail: `blob URLs created: ${seen.length} (${seen.join(', ')})` };
      },
    },
  ];
})();
