# Timing and scheduling

Check every API named here with `node scripts/tonedoc.mjs <Name>` for the installed version.

## Pick one clock

- **Tone's Transport** suits most apps: `Loop`, `Sequence`, `Part` and `getTransport().schedule` call you slightly ahead of time with the exact `time` to use. Tempo, loops, swing and `"4n"`-style notation all follow it. ([Transport docs](https://tonejs.github.io/docs/15.1.22/functions/getTransport.html), [Part](https://tonejs.github.io/docs/15.1.22/classes/Part.html), [wiki: Transport](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/Transport.md))
- **Your own scheduler** (common in sequencers that sync between users) is fine too: compute AudioContext times yourself and pass them straight to Tone. Then treat Tone as the sound renderer only, and convert any notation to seconds with your own tempo (see below).

Do not mix the two for the same events.

## Always pass `time`

```ts
const seq = new Tone.Sequence((time, note) => {
  synth.triggerAttackRelease(note, "8n", time);      // time from the callback
  Tone.getDraw().schedule(() => highlight(note), time); // visuals, not audio, go through Draw
}, ["C4", "E4", "G4"], "8n").start(0);
```

Without `time`, the note plays when the callback runs, which is up to `lookAhead` early and jittery. ([wiki: Accurate Timing](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/Accurate-Timing.md), [getDraw](https://tonejs.github.io/docs/15.1.22/functions/getDraw.html))

## `now()`, `immediate()` and lookahead

| Expression | Value | Use it for |
|---|---|---|
| `Tone.immediate()` | the context's current time | "now" when you have no scheduled time |
| `Tone.now()` | current time + `getContext().lookAhead` (0.1 s by default) | triggering from a UI event with a little safety margin |
| an omitted time argument | the same as `Tone.now()` | — |
| a time from a Transport callback or your scheduler | already in the future | pass unchanged |

Sources: [Context.now](https://tonejs.github.io/docs/15.1.22/classes/Context.html#now) ("the current audio context time plus a short lookAhead"; the page for the top-level [now](https://tonejs.github.io/docs/15.1.22/functions/now.html) only says "current audio context time" and links there), [immediate](https://tonejs.github.io/docs/15.1.22/functions/immediate.html), [Context.lookAhead](https://tonejs.github.io/docs/15.1.22/classes/Context.html#lookahead); probes `now-includes-lookahead`, `omitted-time-means-now`.

The [Time wiki page](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/Time.md) says an omitted time means `audioContext.currentTime`. The API reference and the probe show it includes the lookahead; follow the API.

**The 100 ms bug.** Turning an absolute time into an offset (`time - rawContext.currentTime`) and then adding `Tone.now()` applies the lookahead twice. A sequencer that did this heard its Tone voices about 100 ms behind its other voices ([field report](https://github.com/Adewale/Keyboardia/commit/6f1f61ed)). Keep absolute times absolute. `lookAhead` can be lowered (even to 0) for lower latency at some risk of glitches ([wiki: Performance](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/Performance.md)).

## Notation uses the Transport tempo

`"4n"`, `"8n."`, `"1m"` and `"1:2:0"` are converted with `getTransport().bpm` and time signature, even when the Transport is not running ([wiki: Time](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/Time.md); probe `notation-follows-transport-bpm`). If your app keeps its own tempo, either keep the Transport's `bpm` in sync or pass seconds. A delay set to `"8n."` is converted once, when it is set; after a tempo change, set it again.

Tempo changes: `getTransport().bpm.rampTo(140, 4)` ramps smoothly, and callbacks scheduled on the Transport follow the new tempo ([wiki: Transport](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/Transport.md), [Transport.ts](https://github.com/Tonejs/Tone.js/blob/15.1.22/Tone/core/clock/Transport.ts#L130)).

## One note per start time on monophonic instruments

`Synth`, `MonoSynth`, `FMSynth`, `AMSynth`, `DuoSynth`, `MembraneSynth` and `MetalSynth` are monophonic (they extend `Monophonic`; see `tonedoc` for each class's `extends`). Starting one twice at the same time throws "Start time must be strictly greater than previous start time" ([Source.ts](https://github.com/Tonejs/Tone.js/blob/15.1.22/Tone/source/Source.ts#L206); probe `monophonic-same-start-throws`), and an array of notes throws (probe `monophonic-rejects-chord`).

- Chords or overlapping notes: `new Tone.PolySynth(Tone.Synth, options)`. Voices must extend Monophonic, so `PluckSynth` and `Sampler` are not valid voices ([PolySynth](https://tonejs.github.io/docs/15.1.22/classes/PolySynth.html); probe `polysynth-needs-monophonic-voice`). `Sampler` is already polyphonic.
- Several tracks or presets: give each its own instance rather than sharing one.
- If a trigger throws, log it and drop that note. Nudging it to a later time (`+0.001`, or a retry at `now()+0.01`) hides the bug and audibly breaks the groove ([field report](https://github.com/Adewale/Keyboardia/blob/main/specs/AUDIO-TIMING-ARCHITECTURE.md)).

## Schedule parameter changes too

Set values that must line up with notes with `param.setValueAtTime(v, time)`, not `param.value = v`, which takes effect immediately, before the note scheduled 100 ms ahead ([wiki: Signals](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/Signals.md)). For live user changes, ramp over a few tens of milliseconds (`param.rampTo(v, 0.04)`) to avoid zipper noise.

## Timers

Use audio time, not `setTimeout`, to decide when a voice is free: a backgrounded tab keeps wall-clock time moving while the audio clock stops. Compare against `Tone.immediate()`, or use `getContext().setTimeout`, which the docs describe as "guaranteed by the clock source" and which also runs offline ([Context.setTimeout](https://tonejs.github.io/docs/15.1.22/classes/Context.html#settimeout)).
