# Sound: signals, instruments, effects, levels

The API reference lists options and methods but not default values. To see defaults, call the class's static `getDefaults()` in a browser console (for example `Tone.PolySynth.getDefaults()`), or read `getDefaults` in the source link `tonedoc` prints.

## Signals and params

- Setting `.value` changes a param immediately. To line it up with notes, schedule it (`setValueAtTime`, `linearRampToValueAtTime`, `setTargetAtTime`) with the event's `time`. For live user changes, use `rampTo(value, 0.03–0.05)` to avoid zipper noise ([wiki: Signals](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/Signals.md)).
- **Connecting a signal to a param replaces the param's value.** In native Web Audio, an input to an AudioParam is added to the param's own value. Tone instead zeroes the param so the signal passes through unchanged ([connectSignal](https://tonejs.github.io/docs/15.1.22/functions/connectSignal.html); probe `signal-overrides-param`). Consequences:
  - Give the modulator the full range, not an offset: `new Tone.LFO({ frequency: 2, min: 400, max: 2000 }).connect(filter.frequency)` ([LFO.min](https://tonejs.github.io/docs/15.1.22/classes/LFO.html#min)).
  - To combine a base value with an envelope and an LFO, sum them first (`Tone.Add`, `Tone.Multiply`, `Tone.Scale`) and connect the sum. One app's bass preset went completely silent because its filter envelope, scaled by an amount of 0, replaced the cutoff with 0 Hz ([field report](https://github.com/Adewale/Keyboardia/commit/adf77a9e)).
  - After `disconnect()`, tone 15.1.22 leaves the param at 0; builds from 15.5.57 (npm `next`) restore the old value ([disconnectSignal in the 15.5.57 source](https://github.com/Tonejs/Tone.js/blob/de9df332ca7573b90a9aaca10c0729a3091dda0a/Tone/signal/Signal.ts#L330)). Setting the param again after disconnecting works on both (probe `param-after-signal-disconnect`). The same app went silent when switching away from a tremolo preset until it reset `gain.value` ([field report](https://github.com/Adewale/Keyboardia/commit/abcd8b4d)).

## Choosing an instrument

| Need | Use | Notes |
|---|---|---|
| One line of notes | `Synth`, `MonoSynth`, `FMSynth`, `AMSynth`, `DuoSynth` | Monophonic: one note per start time. |
| Chords, overlapping notes | `PolySynth(Voice, options)` | Voice must be monophonic; `maxPolyphony` caps the voice count ([PolySynth](https://tonejs.github.io/docs/15.1.22/classes/PolySynth.html)). |
| Recorded instruments | `Sampler` | Repitches the nearest sample; polyphonic; await `Tone.loaded()` first ([Sampler](https://tonejs.github.io/docs/15.1.22/classes/Sampler.html), [loaded](https://tonejs.github.io/docs/15.1.22/functions/loaded.html)). |
| Loops, one-shots, stems | `Player`, `Players`, `GrainPlayer` | `GrainPlayer` changes pitch and speed independently ([GrainPlayer](https://tonejs.github.io/docs/15.1.22/classes/GrainPlayer.html)). |
| Kick, toms | `MembraneSynth` | |
| Hats, cymbals, bells | `MetalSynth` | Loud by default; measure and trim. |
| Plucked strings | `PluckSynth` | Karplus-Strong; `triggerRelease` ramps the resonance down ([PluckSynth](https://tonejs.github.io/docs/15.1.22/classes/PluckSynth.html)). Not a valid `PolySynth` voice. |
| Noise hits, risers | `NoiseSynth` | No pitch: `triggerAttackRelease(duration, time, velocity)`. |

Envelopes are attack, decay, sustain, release. There is no hold stage; emulate one with sustain 1 and a note length of attack + hold ([Envelope](https://tonejs.github.io/docs/15.1.22/classes/Envelope.html)).

Output levels differ a lot between synth types. One project measured two `MetalSynth` presets peaking above full scale (up to +1.9 dB true peak) and re-trimmed voices by up to 9 dB ([field report](https://github.com/Adewale/Keyboardia/pull/102)). Measure each voice (see [testing](testing.md)) rather than trusting defaults.

## Effects

- Effects have a `wet` control for the dry/wet mix ([Effect.wet on Tremolo](https://tonejs.github.io/docs/15.1.22/classes/Tremolo.html#wet)).
- `Tremolo`, `AutoFilter`, `AutoPanner` and `Chorus` are silent passthroughs until `.start()` (probe `lfo-effects-need-start`).
- `Reverb` builds its impulse response asynchronously from noise; await `reverb.ready`, and again after changing `decay` or `preDelay` ([Reverb.ready](https://tonejs.github.io/docs/15.1.22/classes/Reverb.html#ready); probe `reverb-ready-replaced`). Because it is noise, two reverbs never render identical samples ([Reverb.ts](https://github.com/Tonejs/Tone.js/blob/15.1.22/Tone/effect/Reverb.ts#L123)). `Freeverb` and `JCReverb` are ready immediately but run as AudioWorklets (CSP: allow `blob:`).
- Delays: pass `maxDelay` if `delayTime` can later grow past its initial value or 1 s, whichever is larger ([DelayOptions.maxDelay](https://tonejs.github.io/docs/15.1.22/interfaces/DelayOptions.html#maxdelay); probe `delay-length-capped-at-construction`).
- Share effects through buses instead of one reverb per track: `channel.send("verb", -12)` and a channel that calls `receive("verb")` ([Channel.send](https://tonejs.github.io/docs/15.1.22/classes/Channel.html#send)).

## Levels

- Keep headroom in one place. Several "safe" gains in a row (0.5 × 0.5 × 0.8) leave a thin, quiet mix.
- `Limiter` is a fast compressor ([Limiter](https://tonejs.github.io/docs/15.1.22/classes/Limiter.html)); short peaks get through (probe `limiter-not-brickwall` measured +9 dBFS with a −6 dB threshold). If output must never exceed full scale, add a clipper after it:

  ```ts
  const clip = new Tone.WaveShaper((x) => Math.max(-0.95, Math.min(0.95, x)), 4096);
  clip.oversample = "2x";
  limiter.chain(clip, Tone.getDestination());
  ```
- Check peaks by rendering offline; `Tone.Meter` smooths its readings and misses short overs.

## CPU

Every Tone voice is several native nodes. A sequencer that measured both rendered 16 Tone voices at 3.2× real time against 32× for its hand-built native voices, about 10× the cost ([field report](https://github.com/Adewale/Keyboardia/pull/102)). Cap `maxPolyphony`, share effects on buses, keep rarely needed nodes off shared paths, and dispose what is idle.
