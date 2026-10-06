# Context lifecycle: unlock, resume, share, tear down

## Unlock from a real gesture

```ts
playButton.addEventListener("click", async () => {
  await Tone.start();                 // resumes the context; must run inside the gesture
  Tone.getTransport().start();
});
```

- Sound is blocked until a click, key or touch; until then `Tone.getContext().state` is `"suspended"` ([start](https://tonejs.github.io/docs/15.1.22/functions/start.html), [wiki: Autoplay](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/Autoplay.md)).
- What counts as a gesture differs between browsers; the wiki recommends starting from a button. Hover (`mouseenter`) does not count.
- Call `Tone.start()` before any slow `await` in the handler. Browsers only honour a gesture for a short time, so a handler that first waits for samples to download can lose it. One app's Play button was silent on a cold cache for exactly this reason ([field report](https://github.com/Adewale/Keyboardia/commit/de3fde10)).

## Resume after the page was backgrounded

A context that was running can stop: tab switches, screen lock, phone calls.

- Listen for the context's `statechange` (Tone's context emits it: [BaseContext](https://tonejs.github.io/docs/15.1.22/classes/BaseContext.html)) and for `visibilitychange`, and resume on the next gesture if the state is not `"running"`.
- Safari uses a fourth state, `"interrupted"`, for pauses it imposed (phone call, leaving the page on iOS). Treat it like `"suspended"` and resume it ([MDN: BaseAudioContext.state](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state)).
- After resuming, check that `Tone.immediate()` actually advances before scheduling; some Safari versions resolve `resume()` while the clock stays parked ([field report](https://github.com/Adewale/Keyboardia/commit/5217f4b8)).
- If you mix Tone with your own `AudioContext`, resume both: `Tone.start()` alone does not resume a separate native context, and the reverse is also true.

**iOS ringer switch.** On iPhones the silent switch can mute Web Audio. Where supported, `navigator.audioSession.type = "playback"` declares media playback ([MDN: AudioSession.type](https://developer.mozilla.org/docs/Web/API/AudioSession/type), [W3C Audio Session](https://www.w3.org/TR/audio-session/)); feature-detect it. Another approach, used in production, routes the final output through `createMediaStreamDestination()` into a hidden `<audio playsinline>` element ([field report](https://github.com/Adewale/Keyboardia/blob/main/app/src/audio/mobile-media-output.ts)). Test either on a real device.

## Share one context with other audio code

```ts
const ctx = new AudioContext({ latencyHint: "playback" });
Tone.setContext(ctx);                          // before creating any Tone node
if (Tone.getContext().rawContext !== ctx) throw new Error("Tone is on a different context");
const synth = new Tone.Synth();
Tone.connect(myNativeGainNode, synth);         // native → Tone
synth.connect(otherNativeNode);                // Tone → native
```

- Set the context before creating nodes: nodes keep the context they were made in and cannot connect to nodes from another ([wiki: AudioContext](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/AudioContext.md); probe `nodes-bound-to-creation-context`). This includes nodes cached in module-level variables, which is why singletons break after a hot reload.
- `setContext(context, disposeOld)` takes a flag to dispose the previous context ([setContext](https://tonejs.github.io/docs/15.1.22/functions/setContext.html)). Do not close Tone's previous context yourself before switching; that left one app's Tone graph unusable ([field report](https://github.com/Adewale/Keyboardia/commit/7600ca42)).
- `latencyHint` is fixed when a context is created; to change it, create a new context ([wiki: Performance](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/Performance.md), [Context.latencyHint](https://tonejs.github.io/docs/15.1.22/classes/Context.html#latencyhint)).
- `Tone.connect` and `Tone.disconnect` connect Tone and native nodes in either direction ([connect](https://tonejs.github.io/docs/15.1.22/functions/connect.html)). In TypeScript you may need a cast when passing a native node to a Tone node's `connect`.

## Create, dispose, hot reload

- Every Tone node has `dispose()` ([ToneAudioNode.dispose](https://tonejs.github.io/docs/15.1.22/classes/ToneAudioNode.html#dispose)). Dispose synths, effects, players and event objects (`Part`, `Sequence`, `Loop`) when a component unmounts or a track is removed.
- Build the audio graph in a function that returns its nodes, not at module level. With Vite, dispose it in `import.meta.hot.dispose`.
- Async setup (loading samples, `reverb.ready`) can finish after the user removed the thing it was for; check that the owner still exists before connecting the result.
- On mobile, decoding many large files can crash the page; load what the current view needs ([wiki: Performance](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/Performance.md)). Decoded audio is far larger than the files: 20–25× for 128–160 kbps MP3 at 44.1 kHz (32-bit float samples).

## Content Security Policy

Tone creates blob URLs for its ticker worker and AudioWorklets ([Ticker.ts](https://github.com/Tonejs/Tone.js/blob/15.1.22/Tone/core/clock/Ticker.ts#L62), [ToneAudioWorklet.ts](https://github.com/Tonejs/Tone.js/blob/15.1.22/Tone/core/worklet/ToneAudioWorklet.ts#L53); probe `worklets-load-from-blob-urls`). With a strict CSP, allow `blob:` in `worker-src` and `script-src`, or effects such as `BitCrusher`, `Freeverb` and `JCReverb` fail with "Unable to load a worklet's module".
