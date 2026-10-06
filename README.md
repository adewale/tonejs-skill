# Tone.js skill

An agent skill for writing, debugging and testing browser audio code with [Tone.js](https://tonejs.github.io/).

It is deliberately small. It does not restate the API; it tells the agent:

1. **Where the truth lives**, in order: the API reference for the installed Tone.js version, the source at that version, behaviour probes, the wiki, and only then the skill. When the docs and the skill disagree, the docs win.
2. **The handful of mistakes that cost real projects the most**: each rule links to the API page, source line, probe or field report that supports it.
3. **How to check its own work**: render offline in a real browser and measure the output instead of trusting code that looks right.

## Layout

```
skills/tonejs/
  SKILL.md                    rules table, source precedence, validation
  references/                 timing, context lifecycle, sound, testing, sources and doc gaps
  scripts/tonedoc.mjs         look up any symbol in the official TypeDoc data for the installed version
  scripts/probes.js           behaviour claims the API reference does not state, as runnable checks
  scripts/run-probes.mjs      run them in headless Chromium (or open scripts/probes.html)
  scripts/render-check.mjs    render a patch with Tone.Offline and report peak, true peak, DC, NaN, onsets
tools/check-skill.mjs         check every link and API name against a release's API docs; --bump to repoint
.github/workflows/            weekly check against npm latest and next
```

## Install

Copy `skills/tonejs` into your agent's skills folder (for Claude Code: `~/.claude/skills/tonejs` or `.claude/skills/tonejs` in a project). The scripts need Node 18+; the browser checks need Playwright or Puppeteer in the project.

To work on the skill itself, `npm install && npx playwright install chromium` in this repository installs Tone.js and a headless browser for the checks below.

## How it stays current

- Every API link is pinned to the version it was last checked against (currently 15.1.22).
- `node tools/check-skill.mjs --version <v> --sources` verifies every link, API name, cited probe and source line against that release's published docs and source.
- `node skills/tonejs/scripts/run-probes.mjs` re-runs the behaviour claims.
- The weekly workflow runs both against npm `latest` and `next`, opens an issue on drift, and opens a pull request that repoints the links when a new `latest` passes.

The 2026-10-06 check is an example: tone 15.5.57 (npm `next`) changed what happens when a modulating signal is disconnected from a param. The probe caught it, and the skill now states both behaviours.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the rules on changing a claim.
