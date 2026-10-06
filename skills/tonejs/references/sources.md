# Sources, gaps and keeping current

## Precedence

1. API reference for the installed version
2. Tone.js source at that version
3. Behaviour probes (`scripts/probes.js`), run against that version
4. Wiki and examples
5. This skill

A higher source overrides a lower one. If this skill disagrees with the API reference, follow the reference and tell the user the skill is out of date.

## Where to look

| What | URL or command |
|---|---|
| Installed version | `node_modules/tone/package.json`, or `node scripts/tonedoc.mjs --version-info` |
| API reference, per version | `https://tonejs.github.io/docs/<version>/` |
| One class, function, interface or variable | `https://tonejs.github.io/docs/<version>/{classes,functions,interfaces,variables}/<Name>.html#<member-in-lowercase>` |
| The same data as JSON (what `tonedoc` reads) | `https://tonejs.github.io/docs/<version>/tone.json` |
| Look up a symbol from the terminal | `node scripts/tonedoc.mjs Context.lookAhead`; `--search <text>`; `--examples` to print code examples |
| Offline | the JSDoc in `node_modules/tone/build/esm/**/*.d.ts` (`tonedoc` falls back to it) |
| Source at a version | `https://github.com/Tonejs/Tone.js/blob/<version>/Tone/...` (`tonedoc` prints the exact file and line) |
| Defaults for a class | `Tone.<Class>.getDefaults()` in a browser console, or `getDefaults` in the source |
| Release notes | [CHANGELOG.md](https://github.com/Tonejs/Tone.js/blob/dev/CHANGELOG.md), [releases](https://github.com/Tonejs/Tone.js/releases) |
| Guides | `https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/<Page>.md` (raw markdown; [page list](https://github.com/Tonejs/Tone.js/wiki)) |
| Examples | [tonejs.github.io/examples](https://tonejs.github.io/examples/) |
| Web Audio itself | [MDN Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) |

`npm view tone dist-tags` shows `latest` and `next`. `next` builds are published from the development branch and have API docs but no git tag.

## Where the documentation is silent or disagrees

These behaviours matter in practice but are missing from, or unclear in, the API reference. Each has a probe so it can be rechecked on a new version. If a probe fails, the behaviour changed: trust what the probe now shows.

| Behaviour | What the docs say | Probe |
|---|---|---|
| An omitted time means `now()`, which includes `lookAhead` | [Context.now](https://tonejs.github.io/docs/15.1.22/classes/Context.html#now) says so; the top-level [now](https://tonejs.github.io/docs/15.1.22/functions/now.html) page only says "current audio context time", and the [Time wiki page](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/Time.md) says an omitted time is `currentTime`. **Conflict; the API and the probe agree.** | `now-includes-lookahead`, `omitted-time-means-now` |
| Connecting a signal to a param zeroes the param | Stated on [connectSignal](https://tonejs.github.io/docs/15.1.22/functions/connectSignal.html), not on `connect` or the param pages. What happens after `disconnect()` is undocumented and changed: 15.1.22 leaves the param at 0, 15.5.57 restores it. | `signal-overrides-param`, `param-after-signal-disconnect` |
| `Tremolo`, `AutoFilter`, `AutoPanner`, `Chorus` do nothing until started | [Tremolo.start](https://tonejs.github.io/docs/15.1.22/classes/Tremolo.html#start) says only "Start the tremolo." | `lfo-effects-need-start` |
| `Limiter` lets transients through | [Limiter](https://tonejs.github.io/docs/15.1.22/classes/Limiter.html) describes a compressor with fast attack; no overshoot figure | `limiter-not-brickwall` |
| A delay cannot grow past its construction-time maximum | [DelayOptions.maxDelay](https://tonejs.github.io/docs/15.1.22/interfaces/DelayOptions.html#maxdelay) has no description | `delay-length-capped-at-construction` |
| Two starts at the same time on a monophonic instrument throw | Not documented; the error comes from [Source.ts](https://github.com/Tonejs/Tone.js/blob/15.1.22/Tone/source/Source.ts#L206) | `monophonic-same-start-throws`, `monophonic-rejects-chord` |
| `PolySynth` voices must be monophonic | [PolySynth](https://tonejs.github.io/docs/15.1.22/classes/PolySynth.html) says it wraps "monophonic synthesizers"; it does not say other classes are rejected | `polysynth-needs-monophonic-voice` |
| `Offline` replaces the global context while it runs | [Offline](https://tonejs.github.io/docs/15.1.22/functions/Offline.html) does not mention it | `offline-swaps-global-context` |
| Nodes cannot be used with a context other than their own | [wiki: AudioContext](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/AudioContext.md); not in the API reference | `nodes-bound-to-creation-context` |
| Notation follows the Transport tempo when the Transport is stopped | [wiki: Time](https://raw.githubusercontent.com/wiki/Tonejs/Tone.js/Time.md) | `notation-follows-transport-bpm` |
| `Reverb.ready` is replaced when `decay` or `preDelay` changes | Documented on [Reverb.ready](https://tonejs.github.io/docs/15.1.22/classes/Reverb.html#ready) | `reverb-ready-replaced` |
| Worklets and the ticker load from `blob:` URLs (CSP) | Not documented | `worklets-load-from-blob-urls` |
| Default option values | Not listed on API pages; use `getDefaults()` | — |
| No seed for `Math.random`-based features | Not documented; see [testing](testing.md) | — |

Field reports from [Keyboardia](https://github.com/Adewale/Keyboardia), an open-source multiplayer sequencer that uses Tone.js beside native Web Audio, are linked where they show what a rule prevents. They are evidence of impact, not of API behaviour.

## How this skill stays current

- **Links are pinned** to the version the claims were last checked against, so a reader sees the same page the claim was checked on. Substitute the installed version when you follow one.
- **`tools/check-skill.mjs`** (in the skill's repository) checks every API reference link and every Tone API name written in these files (such as `Tone.Reverb` or `Reverb.ready`) against the target version's `tone.json`, flags deprecations, checks that each linked source line still exists, and that every cited probe exists. `--bump <version>` repoints the links when everything passes.
- **`scripts/run-probes.mjs`** re-runs the behaviour claims in headless Chromium.
- **A weekly workflow** runs both against npm `latest` and `next`. A failure opens an issue; a new `latest` that passes opens a pull request with bumped links.

Rules for changing the skill, adapted from [Cloudflare's skills](https://github.com/cloudflare/skills/blob/main/CONTRIBUTING.md):

- Read the API page or source for the claim and confirm it supports the guidance; a working link is not enough.
- Link to the documentation instead of copying signatures, defaults or examples that will go stale.
- When the docs do not cover a behaviour, add a probe that demonstrates it and list it in the table above, rather than asserting it unsupported.
- When the docs and a claim disagree, fix the claim to match the docs, or delete it.
