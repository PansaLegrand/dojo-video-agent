# Dojo Video Agent naming migration

The local editor formerly named **Dojo Video Harness** (`dojo-video-harness`) is
now **Dojo Video Agent** (`dojo-video-agent`). **Dojo Video Engine** keeps its name
and its rendering, preview, and export responsibility. DojoClip remains the hosted
commercial product.

## Current names and links

- Repository: <https://github.com/PansaLegrand/dojo-video-agent>.
- README, clone instructions, badges, application title/header, and current
  repository metadata use the new name.
- Existing pull-request and CI links in Markdown point to the same records under
  the new repository URL. Their commits, dates, acceptance, and outcomes are unchanged.
- The private root workspace is named `dojo-video-agent`; its lockfile matches.
  Package repository metadata points to the new repository.

## Existing clones

Update the remote from inside an existing clone:

```sh
git remote set-url origin https://github.com/PansaLegrand/dojo-video-agent.git
```

The local directory name does not affect the application. When renaming it, retain
`.env` and `.data`, repair any linked Git worktrees, and keep the same localhost
address and port so browser-stored media remains available.

## Compatibility retained

- Public package names, including `@dojo-video/agent-kit`, `@dojo-video/agent-loop`,
  and `@dojo-video-engine/*`, do not change. This migration publishes no package
  and does not replace immutable archives.
- Runtime profiles, compiler versions, tool contracts, stored receipts, local
  data paths, browser storage keys, and `HARNESS_NO_OPEN` keep their established
  identities. Existing projects require no conversion.
- **Harness** remains a technical term for the agent's host, execution controls,
  and evaluation infrastructure. Existing module and guide filenames retain
  stable paths.
- Copyright notices, historical JSON reports, original local paths in recorded
  errors, and retained provenance preserve their original wording.

## Validation

- Fresh locked dependency installation succeeded.
- `npm run check` passed: open-source boundary, agent-kit build/skill integrity,
  all 110 managed UI hashes, TypeScript, **1,072 tests in 107 files**, and the
  production build.
- `node scripts/browser-smoke.mjs` passed **66 browser checks**, including
  saved projects, Compare/Undo, captions, graphics, decoded MP4/audio, and export
  receipts with synthetic provider HTTP. No browser exceptions were reported.
- Targeted actual-browser checks and visual inspection passed for the renamed
  document title and home header at 1440×1000 and 390×844, plus provider-settings
  navigation. The narrow page had no horizontal overflow.
- Changed Markdown local links and `git diff --check` passed.

The first full test run, concurrent with another repository's suite, recorded one
15-second timeout in `reviewed-edit-reference.test.ts`; the other 1,071 tests
passed. The isolated file then passed all 13 tests, and the full check above
passed without changing test limits or assertions.

This migration makes no paid provider requests, publishes no packages, and does
not establish a new provider qualification or commercial deployment.
