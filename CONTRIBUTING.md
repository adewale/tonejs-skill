# Contributing

Keep the skill small: help agents find and trust the Tone.js documentation, not maintain another copy of it.

- **Read the source of a claim before adding it.** Confirm that the API page, the source at the pinned version, or a probe actually supports the guidance. A working link is not enough.
- **Link, don't copy.** Prefer a link to the API page (`https://tonejs.github.io/docs/<version>/...`) over pasting signatures, defaults or examples that will go stale. Use `node skills/tonejs/scripts/tonedoc.mjs <Symbol>` to find the right page and source line.
- **When the docs are silent, add a probe.** A behaviour the API reference does not state goes in `skills/tonejs/scripts/probes.js`, is cited by its ID next to the claim, and is listed in the gaps table in `references/sources.md`. Do not add unsupported guidance.
- **When the docs and a claim disagree, the docs win.** Fix the claim or delete it. If the docs themselves are wrong, show it with a probe and report it upstream.
- **Field reports show impact, not behaviour.** A link to a project that hit a bug explains why a rule matters; it does not replace an API link or probe.
- **Before opening a pull request**, run:

  ```sh
  npm install && npx playwright install chromium   # once: installs tone and a headless browser
  npm run check                                     # every link, API name, probe ID and source line
  npm run probes                                    # the behaviour probes, in headless Chromium
  ```

  `npm run probes` can also run from any other project that has `tone` and `playwright` installed, to check the skill against that project's version.
