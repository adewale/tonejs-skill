# Testing audio

A Tone.js change can type-check, pass unit tests and still be silent, late, clipping or full of clicks. Only rendered samples show that.

## What each kind of test proves

| Test | Proves | Misses |
|---|---|---|
| Unit test with Tone mocked (`vi.mock("tone")`, jsdom) | Your code calls the API you expected, with the arguments you expected | Whether any sound comes out, its timing, its level |
| `Tone.Offline` in a real browser | What the graph produces, sample by sample, faster than real time | Device latency, autoplay, backgrounding, Bluetooth |
| Playwright against the running app | Routing, UI wiring, meters, unlock flow | Subtle sound quality |
| Listening | Taste | Regressions you did not listen for |

One project's rule: mocks and jsdom prove structure; audio routing needs a real runtime ([field report: Lesson 30](https://github.com/Adewale/Keyboardia/blob/main/docs/LESSONS-LEARNED.md#lesson-30-jsdom-proves-structure-only-real-runtimes-prove-behaviour)). If you mock Tone, check that the mock's method names still exist on the real classes, so the mock cannot drift from the library.

## Render offline in a real browser

[`Tone.Offline(callback, duration, channels)`](https://tonejs.github.io/docs/15.1.22/functions/Offline.html) runs your callback against an `OfflineAudioContext` and resolves to a `ToneAudioBuffer`. Node has no Web Audio, so run it in headless Chromium (Playwright or Puppeteer).

```ts
const buffer = await Tone.Offline(async ({ transport }) => {
  const synth = new Tone.PolySynth(Tone.Synth).toDestination(); // create nodes inside the callback
  synth.triggerAttackRelease(["C4", "E4", "G4"], 0.5, 0.1);
  await Tone.loaded();                                          // wait for any samples
}, 1.5);
const samples = buffer.getChannelData(0);
```

- Create every node inside the callback. Nodes made outside belong to the real-time context and cannot connect to the offline one (probe `nodes-bound-to-creation-context`).
- Run renders one at a time. `Offline` swaps the global context while the callback runs and swaps it back afterwards ([Offline.ts](https://github.com/Tonejs/Tone.js/blob/15.1.22/Tone/core/context/Offline.ts); probe `offline-swaps-global-context`), so two concurrent renders, or real-time code running during a render, can create nodes in the wrong context. Queue them, for example `chain = chain.then(() => Tone.Offline(...))`.
- Await `Tone.loaded()` (samples) and `reverb.ready` inside the callback, before the render starts.

The bundled script does this for you:

```sh
node scripts/render-check.mjs patch.js --duration 2 --seed 1
```

`patch.js` is the body of the callback. The script prints sample peak, 4× oversampled true peak, RMS, DC offset, non-finite sample count and onset times for each channel, and exits 1 if the output is silent, contains NaN or Infinity, or has a true peak above 0 dBFS. Use `--json` in CI, and `--version <v>` to try a different Tone release.

Example: a `PolySynth` triad at default settings measured +4.7 dBFS peak with tone 15.1.22. Three voices at the default level sum past full scale; lower `volume` or the per-voice level.

## Make renders repeatable

These use `Math.random()`, so the same code renders different samples each time:

- `Noise` (its buffers and its random start offset) ([Noise.ts](https://github.com/Tonejs/Tone.js/blob/15.1.22/Tone/source/Noise.ts#L144)), and so `NoiseSynth` and `Reverb`, which builds its impulse response from noise ([Reverb.ts](https://github.com/Tonejs/Tone.js/blob/15.1.22/Tone/effect/Reverb.ts#L123))
- `probability` and `humanize` on `Loop`, `Part`, `Sequence` and other events ([ToneEvent.ts](https://github.com/Tonejs/Tone.js/blob/15.1.22/Tone/event/ToneEvent.ts#L320))
- `Pattern` with the `"random"`, `"randomOnce"` and `"randomWalk"` patterns ([PatternGenerator.ts](https://github.com/Tonejs/Tone.js/blob/15.1.22/Tone/event/PatternGenerator.ts#L112))

Tone has no seed option. Replace `Math.random` with a seeded generator for the duration of the render, in a fresh page (Tone caches its noise buffers after first use), and print the seed with any failure so the run can be replayed ([field report](https://github.com/Adewale/Keyboardia/blob/main/app/src/test/seeded-random.ts)). `render-check.mjs --seed` does this. For everything else, compare measurements with tolerances rather than exact samples.

## Checks worth automating

Cheap, objective and hard to argue with:

| Check | Fails when | Typical bound |
|---|---|---|
| Non-finite samples | Any NaN or Infinity | 0 |
| Silence | Peak below about −80 dBFS where you expected sound | |
| True peak | Inter-sample peak above full scale; plain sample peak under-reads | ≤ −1 dBFS for delivery, ≤ 0 as a hard fail |
| DC offset | Mean far from 0 (asymmetric waveshaping, stuck params) | below about −60 dB |
| Onset times | Notes land late or early relative to the schedule | within a few ms of the scheduled time, after any attack |
| Clicks | Jumps between neighbouring samples far above the signal's usual slope, often at note starts and ends | |
| Pitch | Estimated pitch is wrong, and the estimate's confidence is high enough to trust | cents tolerance per instrument |

One project gates generated instruments on true peak, DC, leading silence and pitch with a confidence threshold, and its measurements found two `MetalSynth` presets above full scale ([field report](https://github.com/Adewale/Keyboardia/pull/102), `app/scripts/sample-quality-core.ts`). Report the measurement with the failure, not just "failed".

## Keep the test honest

- **Fail when the renderer is missing.** A test that skips itself when the browser or audio backend cannot load reports green having rendered nothing. One project found seven audio tests silently skipping this way and made them fail instead ([field report](https://github.com/Adewale/Keyboardia/pull/122), commit 8d234ba7).
- **Do not retry or loosen a failing audio test to make it pass.** Retries hid real server errors in the same project ([field report](https://github.com/Adewale/Keyboardia/pull/122), `docs/LESSONS-LEARNED.md`, Lesson 16).
- **Avoid wall-clock deadlines in render tests.** Sample loading time varies; wait for `Tone.loaded()` and fail on its rejection instead.
- **Tag each expectation with the Tone.js version** so a library upgrade that changes the numbers is visible as such.
