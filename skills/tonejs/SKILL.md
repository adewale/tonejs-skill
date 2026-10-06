---
name: tonejs
description: Write, debug or review browser audio code that uses Tone.js — synths, samplers, effects, scheduling, the Transport, offline rendering and audio tests. Use whenever code imports "tone" or the user wants to make sound in a web page.
---

# Tone.js

Your knowledge of Tone.js may be out of date or wrong. **Prefer the documentation over memory, and over this skill.** This skill tells you where the truth lives and which mistakes cost real projects the most; every rule below links to its evidence so you can check it.

## Where the truth lives, in order

When two sources disagree, the higher one wins. Tell the user when you find a disagreement with this skill.

1. **The API reference for the project's installed version**: `https://tonejs.github.io/docs/<version>/` (find the version in `node_modules/tone/package.json`). Look things up with the bundled script, which reads Tone's own published TypeDoc data for that version:
   `node scripts/tonedoc.mjs Reverb.ready` · `node scripts/tonedoc.mjs --search delay` · `node scripts/tonedoc.mjs --version-info`
   Offline, the same comments are in `node_modules/tone/build/esm/**/*.d.ts`.
2. **Tone.js source at that version's tag** (`https://github.com/Tonejs/Tone.js/blob/<version>/Tone/...`). `tonedoc` prints the source link for every symbol.
3. **Behaviour probes** in `scripts/probes.js`: small experiments that check, in a real browser, behaviour the reference does not state. Run `node scripts/run-probes.mjs` (needs Playwright or Puppeteer) or open `scripts/probes.html`.
4. **The wiki and examples** ([wiki](https://github.com/Tonejs/Tone.js/wiki), [examples](https://tonejs.github.io/examples/)). Useful explanations, but versionless and older than the API; some pages still use deprecated globals.
5. **This skill.** Links below point at 15.1.22, the version the claims were last checked against. Substitute the installed version.

If none of these settle a question, say so and test it (render it offline, see [testing](references/testing.md)) instead of guessing.

## Rules that prevent most failures

| Rule | Why | Evidence |
|---|---|---|
| Call `await Tone.start()` inside a click, key or touch handler before any sound or `getTransport().start()`. Hover and page load are not gestures. | Browsers keep the context suspended until a gesture; everything fails silently. | [start](https://tonejs.github.io/docs/15.1.22/functions/start.html), [wiki: Autoplay](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/Autoplay.md) |
| Use `getTransport()`, `getDestination()`, `getDraw()`, `getContext()`. | The globals `Tone.Transport`, `Tone.Destination`, `Tone.Draw`, `Tone.context` and `toMaster()` are deprecated. | [Transport](https://tonejs.github.io/docs/15.1.22/variables/Transport.html), [Draw](https://tonejs.github.io/docs/15.1.22/variables/Draw.html), [context](https://tonejs.github.io/docs/15.1.22/variables/context.html) |
| Pass the callback's `time` to every `trigger…`, `start` and `set…AtTime` call. | Without it the sound plays when JavaScript runs, not when it was scheduled. | [wiki: Accurate Timing](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/Accurate-Timing.md) |
| If you already have an AudioContext time, pass it unchanged. Use `Tone.immediate()` for "now"; `Tone.now()` and an omitted time both add `lookAhead` (0.1 s by default). | Adding `Tone.now()` to a time you scheduled yourself plays notes ~100 ms late. | [Context.now](https://tonejs.github.io/docs/15.1.22/classes/Context.html#now), [immediate](https://tonejs.github.io/docs/15.1.22/functions/immediate.html), [lookAhead](https://tonejs.github.io/docs/15.1.22/classes/Context.html#lookahead); probes `now-includes-lookahead`, `omitted-time-means-now` |
| Notation such as `"4n"` or `"1m"` uses the Transport's `bpm`. Keep `getTransport().bpm` equal to your tempo, or convert to seconds yourself. | Durations and delay times silently use 120 bpm. | [wiki: Time](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/Time.md); probe `notation-follows-transport-bpm` |
| Monophonic synths play one note per start time. Use `PolySynth` (Monophonic voices only) for chords and `Sampler` for samples. | Two starts at the same time throw "Start time must be strictly greater than previous start time"; an array of notes throws. | [PolySynth](https://tonejs.github.io/docs/15.1.22/classes/PolySynth.html), [Source.ts](https://github.com/Tonejs/Tone.js/blob/15.1.22/Tone/source/Source.ts#L206); probes `monophonic-*`, `polysynth-needs-monophonic-voice` |
| Never touch the DOM in audio callbacks; use `getDraw().schedule(fn, time)`. | Callbacks run ahead of time; visuals drift. | [getDraw](https://tonejs.github.io/docs/15.1.22/functions/getDraw.html), [wiki: Performance](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/Performance.md) |
| Own one context. Call `setContext` before creating any node, create nodes per app instance (no module-level singletons), and `dispose()` them on teardown and hot reload. | Nodes stay bound to the context they were created in and cannot connect across contexts. | [wiki: AudioContext](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/AudioContext.md), [setContext](https://tonejs.github.io/docs/15.1.22/functions/setContext.html); probe `nodes-bound-to-creation-context` |
| Await `Tone.loaded()` before playing a `Sampler` or `Player`, and await `reverb.ready` again after changing `decay` or `preDelay`. | Unloaded buffers are silent; a new impulse response is generated asynchronously. | [loaded](https://tonejs.github.io/docs/15.1.22/functions/loaded.html), [Reverb.ready](https://tonejs.github.io/docs/15.1.22/classes/Reverb.html#ready); probe `reverb-ready-replaced` |
| Call `.start()` on LFO effects: `Tremolo`, `AutoFilter`, `AutoPanner`, `Chorus`. | They pass audio through unchanged until started. | [Tremolo.start](https://tonejs.github.io/docs/15.1.22/classes/Tremolo.html#start); probe `lfo-effects-need-start` |
| Connecting a signal (LFO, Envelope, Signal) to a param **replaces** the param's value. Put the base value in the modulator (`LFO` `min`/`max`, `Tone.Add`), and set the param again after `disconnect()`. | Native Web Audio adds them; Tone zeroes the param, e.g. a filter cutoff becomes 0 Hz and the voice goes silent. | [connectSignal](https://tonejs.github.io/docs/15.1.22/functions/connectSignal.html); probes `signal-overrides-param`, `param-after-signal-disconnect` |
| Pass `maxDelay` when a delay time can grow later (for example after a tempo change). | Setting `delayTime` beyond the construction-time maximum (1 s by default) throws a RangeError. | [DelayOptions.maxDelay](https://tonejs.github.io/docs/15.1.22/interfaces/DelayOptions.html#maxdelay); probe `delay-length-capped-at-construction` |
| `Limiter` is a compressor, not a ceiling. Measure true peak, and add a clipper (`WaveShaper`) if you need a hard bound. | Transients pass the threshold (+15 dB in the probe). | [Limiter](https://tonejs.github.io/docs/15.1.22/classes/Limiter.html); probe `limiter-not-brickwall` |
| Run `Tone.Offline` renders one at a time and create their nodes inside the callback. | It swaps the global context while the callback runs. | [Offline](https://tonejs.github.io/docs/15.1.22/functions/Offline.html), [Offline.ts](https://github.com/Tonejs/Tone.js/blob/15.1.22/Tone/core/context/Offline.ts); probe `offline-swaps-global-context` |
| If the page has a Content-Security-Policy, allow `blob:` in `script-src` / `worker-src`. | Tone loads its AudioWorklets (BitCrusher, Freeverb, JCReverb, FeedbackCombFilter) and its ticker worker from blob URLs. | [ToneAudioWorklet.ts](https://github.com/Tonejs/Tone.js/blob/15.1.22/Tone/core/worklet/ToneAudioWorklet.ts#L53); probe `worklets-load-from-blob-urls` |

More detail, with the reasoning and fixes, in the references:

- [Timing and scheduling](references/timing.md): Transport or your own clock, lookahead, notation, voice reuse.
- [Context lifecycle](references/context-lifecycle.md): unlock, resume after backgrounding, iOS and Safari, sharing a context, hot reload, teardown.
- [Sound: signals, instruments, effects, levels](references/sound.md)
- [Testing audio](references/testing.md): offline rendering in a real browser, determinism, objective checks.
- [Sources and gaps](references/sources.md): URL patterns, what the docs do not cover, and how this skill is kept current.

## Validate your change

Code that looks right can still be silent, late or clipping. When you change how something sounds, render it in a real browser and check the samples:

```sh
node scripts/render-check.mjs patch.js --duration 2 --seed 1   # peak, true peak, RMS, DC, NaN, onsets; exit 1 on silence, NaN or clipping
node scripts/run-probes.mjs                                     # do this skill's claims hold for the installed Tone.js?
```

Both need Playwright or Puppeteer. Mocks of Tone only prove the code calls the API; see [testing](references/testing.md). If you cannot run a browser, say that the sound is unverified.

---
Claims last checked on 2026-10-06 against tone 15.1.22 (npm `latest`) and 15.5.57 (npm `next`): every link and API name exists in both, and all 15 probes pass on both. One behaviour differs between them (`param-after-signal-disconnect`).
