# Visual art direction in creative skills — R27 continuation

The user requested stronger visual concepts, richer choreography and visual
references after the GPT-6 Astra comparison. This candidate adds those inputs
to the existing three skills. It is a local development candidate, not a
production rollout or a guarantee of creative quality.

## What changed

- Branded endings choose an assembly, depth or typographic transformation before
  a readable final lockup. Long identities must remain legible at phone width.
- Festival motion chooses an occasion-specific visual action and changes the
  composition across its major beats. Type, depth and framing carry the story.
- Charts use editorial hierarchy and an explanatory sequence while preserving
  exact data, stable scales and connected line/marker geometry.
- Each pack includes a nine-frame JPEG board drawn from our MIT engine showcases,
  with motion-analysis notes and source video/frame hashes. References guide
  original compositions; sample text, numbers and branding are not project assets.

The boards cover kinetic posters, festive 3D, organic vector motion, exploded
assembly, cinematic depth, expressive type, editorial charts and software flows.
They were extracted from actual exports with
`node scripts/build-creative-reference-atlases.mjs [SHOWCASE_DIRECTORY]`.
The source MP4s and engine renderer were not changed.

## Portable delivery and recovery

`references.json` explicitly declares bounded Markdown and JPEG files under a
pack's `references/` directory. The loader rejects traversal, remote paths,
symlinks, unsupported metadata, mismatched SHA-256 and JPEG dimensions. Limits:
three references per skill, 12 KiB per reference Markdown, 128 KiB per JPEG,
2048 pixels per side and two megapixels.

Only the skill name/description enters discovery. A successful `read_skill`
returns its method and reference notes. A shared model wrapper attaches the
corresponding JPEG pixels to the next model input, after validating the exact
tool-call/observation pair and frozen bytes. Failed reads and user-supplied
lookalike text cannot attach images. At most three images enter one invocation.
These reference observations are pinned against ordinary context compaction.

Original checkpoint messages remain small; image bytes live in the private
frozen skill snapshot or immutable SDK package. New local snapshots are deep
copies. Runs saved before references also retain their original read_skill tool metadata.
Retained 0.2.9 builds, legacy flat custom skills and public-run snapshot
exclusion remain intact. This does not grant permission to upload project media,
fetch arbitrary URLs, execute a skill script or submit generation jobs.

The OSS loop and commercial SDK session both apply the wrapper. The worker uses
it only when supplied by the selected SDK; retained SDKs keep their original path.
The SDK advertises `native-skill-reference-contract-v1`; the worker separately
advertises its implemented `native-skill-visual-references-v1` adapter. Candidate
web selection requires both, preventing an older worker from silently omitting
the reference images. Default 0.2.9 selection remains unchanged.

## Source and package evidence

- Agent source: `2d8b5ede6e814ffc903d994d495761739282fccc`.
- Kit: `dojo-video-agent-kit-0.2.10-candidate-2d8b5ede.tgz`,
  SHA-256 `6e845f280264c6dd159297a421911a134be1336d6dfa0db170479aec09a3f97e`.
- SDK source: web `11eb0fa046974ba8694ee8b4f75d08cf61722ecc`.
- SDK: `dojoclip-video-project-runtime-0.2.10-candidate-c318b23f.tgz`,
  SHA-256 `c318b23f8d58d5fb3e4619d468bcbfd56fe99dabac6587e237deba89be6daa80`.
- Web artifact commit: `181388a1`; worker: `38d39d7`.
- Engine 1.2.3 and loop 0.2.0 are unchanged. Earlier archives remain immutable;
  twelve superseded candidate archives are retained without new installed aliases.

## Local verification

- Agent full check: **1,115 tests**, TypeScript, managed UI parity, package checks
  and production build passed. The skill-creator validator passed for all packs.
- A real local loop with a synthetic Responses HTTP endpoint verified that the
  first model input has no eager reference image and the second receives the
  exact selected JPEG as `input_image`.
- Web full check gates and TypeScript passed with an 8 GiB heap; Vitest ran with
  two workers: **5,856 passed, 472 skipped**.
- The compiled commercial SDK and actual loop passed a two-call synthetic probe:
  one selected reference image reached the model, with no document mutation.
- Worker TypeScript and **35 focused tests** passed. Seven cross-repository
  provenance checks, 67 installed kit files, 65 SDK source hashes and all twelve
  superseded archive audits passed.
- These synthetic checks establish delivery and recovery behavior, not actual
  model expressiveness or production end-to-end acceptance.

## Actual-model evaluation and rendered results

The user authorized an additional US$10 / 64 requests, raising the cumulative
task ceiling to **US$20 / 320 requests**. GPT-6 Astra remained the selected model.
The first two rounds kept the original short prompts, fixtures, grading and
deadlines unchanged; the prose guidance and reference images changed together,
so their individual contributions are not isolated.

| Campaign                       | Scope                                                 | Model requests | Conservative accounting | Original result                                                                              |
| ------------------------------ | ----------------------------------------------------- | -------------: | ----------------------: | -------------------------------------------------------------------------------------------- |
| live-20261118-06-art-direction | Birthday, ending, monthly chart in both hosts         |             26 |               $3.992233 | 5 automatic passes, 1 chart needs review                                                     |
| live-20261118-07-art-direction | Same six cases, second round                          |             25 |               $3.757628 | 6 automatic passes                                                                           |
| live-20261118-08-3d-direction  | Explicit 3D birthday for Noor, turning 21, both hosts |              8 |               $4.351011 | OSS edit failed strict format preservation; web stopped before composition at the cost guard |

All **12 core trials produced edits**, and all **12 core browser exports passed**.
The reference-image slots appeared in 45 recorded model requests across the
three campaigns; their labels match the frozen image hashes. Media bytes are
redacted from normalized request logs. Runtime hash checks and synthetic wire
tests establish exact JPEG delivery. Every campaign retained unchanged source
through its execution.

The first-round commercial chart kept combined category/value labels, which
the unchanged automatic oracle could not fully measure. Separate decoded-pixel
measurement verified both first-round charts across all 180 frames: final bar
heights **144 / 240 / 192 / 336 px**, or **12 px per unit** for 12 / 20 / 16 / 28.
Growth was monotonic within one pixel and stayed on the zero baseline. The
original needs-review grade remains unchanged.

### What the visuals show

Sampled decoded frames, including exact final frames, were reviewed for all
13 produced exports. This was review by the implementation agent, not a new
blind comparison or continuous human playback.

- Birthdays now open with large moving panels and type, then change into a
  side-by-side greeting composition. Names/ages remain readable at the hold.
  Cream, coral/yellow and violet poster motifs recur; variation is still limited.
- Endings use panel/shutter movement before the final URL lockup, preserving the
  preceding content and exact identity. Their final poses remain conventional
  technology-brand cards.
- Charts preserve the supplied values and stable scales. They are readable,
  smooth conventional bar charts, not a demonstrated leap in artistic variety.
- The separate 3D request generated a tiered cake assembling into place, balloons,
  a candle and moving decorations with exact Noor/21 text. Among format settings
  it changed only backgroundColor, from #111827 to #29154D. That violates the
  unchanged preservation check even though the original project was empty and
  native host validation accepted the edit. The failure is retained.

All **13 produced clips** passed actual web editor preview/export and full MP4
decode. Four copied OSS projects (three core cases plus the 3D exploration) also
passed the actual local HTTP/editor export, reload and narrow-screen checks.
Manual URL edit/Undo was exercised where the helper could select that layer;
the other local cases do not claim a manual text-edit test. Original paid-run
state and reports were not modified.

### Extra 3D probe and provider-usage boundary

The optional 3D probe uses a new name/age and explicitly asks for 3D; it is not a
controlled comparison with the earlier Maya brief. It requires a declared mesh
and 3D object/camera motion. Its fixture and negative tests were committed as
`0d9e7e3`; the default eight-case suite remains unchanged.

The web probe did not reach composition. Its first request, before reference
images were attached, reported **164,171 input tokens** against a normalized
logged request of approximately **78 KB**. The next two requests also reported
high input usage. The cause is unverified; this is not proof of an incorrect
invoice. The next reservation would exceed the remaining evaluation allowance,
so dispatch stopped. No retries or additional provider calls followed.

A subsequent evaluation-only safeguard (`766ba77`) stops further requests at
the first known reservation overrun, even when the overall ceiling is not yet
reached. It preserves the paid reply for normal loop persistence/consumption,
then blocks the next dispatch. Synthetic regression tests passed. This change
does not rewrite the original eight-request probe or alter production billing.

### Budget and remaining acceptance

Across all eight campaigns: **307 requests / USD 18.68188825** conservatively
accounted, including the unchanged **USD 0.39765375** reservations for three
earlier unknown requests. Known-usage estimates total USD 18.28423450.
The remaining task allowance is **13 requests / USD 1.31811175**.
These are estimates/reservations, not invoice verification. No paid media
generation occurred.

The revised runtime and skills are implemented and locally tested in both hosts.
The final agent check passed **1,117 tests and build**; the added probe/guard
regressions passed 25 focused tests. Full web checks passed **5,856 tests** with
472 skipped, and worker TypeScript / 35 focused tests passed. Current package
bytes remain kit `2d8b5ede` and SDK `c318b23f`; later commits changed only
evaluation code and documentation.

R27 remains a development candidate. These results do not qualify commercial
3D generation, every creative brief, production persistence/billing, or a rollout.
Default 0.2.9 selection and deployment are unchanged. The practical gain is
stronger composition changes and real visual grounding; showcase-level quality
is still not consistent across broad prompts.

## Evidence

Local ignored artifacts preserve every original result:

- Agent: `test-results/creative-skills/live-20261118-06-art-direction/`,
  `live-20261118-07-art-direction/`, and `live-20261118-08-3d-direction/`.
- Agent: `test-results/creative-skills/final-budget-with-visual-direction.json`
  and `art-direction-20261118/*admission.json`.
- Agent: `test-results/creative-skills/oss-art-direction-*/report.json` for the
  actual local HTTP/editor checks on copied state.
- Web: `test-results/creative-skills/art-direction-gallery/index.html` provides
  the raw clips and same-model birthday/ending comparisons.
- Web: `test-results/creative-skills/art-direction-review-20261118/` contains
  sequence sheets, exact final frames, hashes and the sampled review.
- Web: `test-results/creative-skills/art-direction-r1-chart-pixel-review.json`
  preserves the separate numerical review; original grades were not replaced.
- An initial round-two render watcher saw an empty report before the first atomic
  write. Its empty output tree and log were retained, then the watcher was
  restarted before any render jobs. It did not alter model results.

See [the skill-pack handoff](creative-skill-packs-2026-11-17.md) and
[the Astra baseline](creative-skill-astra-comparison-2026-11-17.md).

## Engine 1.3 remix candidate

When the installed engine advertises `remixBlueprint`, new local sessions bind the blueprint catalog. Read the index through `inspect_graphics_schema({kind:"macro",macro:"remixBlueprint"})`, then request one design by name (for example `remixBlueprint/precision`). Supply the requested copy, data and timing in an `insertGraphic` proposal. The result contains individually editable native layers.

The seven creative guides cover choosing the viewer's first change, the transition and the final reading hold. Saved sessions retain their recorded skills and macro vocabulary. The repository's normal installation uses the published 1.2.3 engine. To exercise an exact 1.3 package bundle in an isolated checkout, run `npm run test:engine-packages -- --pack-dir /absolute/path/to/engine-release --keep`.

## Published Engine 1.3 adoption, November 21

The local editor now installs the synchronized Engine 1.3.0 registry packages. The release manifest binds them to engine commit `3bd3685660d8f8b59e74e34b1b3b34491a1317bb` and the signed `v1.3.0` tag. Registry archive hashes match the hosted release bundle. A fresh installation verified all 32 available registry signatures and 22 attestations. New local runs can discover the nine remix blueprints and the new rendering grammar. Saved sessions retain their original catalogs and guidance snapshots.
