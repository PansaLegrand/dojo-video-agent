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

## Actual-model evaluation

Live evaluation has not yet run for these new bytes. Before this continuation,
the original task allowance had **8 requests and USD 3.41898375** remaining
(248 requests / USD 6.58101625 conservatively accounted). The user then authorized an additional **US$10 / 64 requests**, raising the
cumulative task ceiling to **US$20 / 320 requests**. No paid calls were made
during implementation. The planned comparison uses two bounded rounds of the
same three short-prompt scenarios in both hosts, with cumulative accounting
across all campaigns; a new round never resets the task allowance.

The evaluation should keep the earlier short prompts, model, fixtures, grading
and deadlines unchanged. Record actual image inputs, render/fully decode every
result, inspect motion and final holds, and preserve failed attempts. Compare
against the earlier Astra outputs, rather than counting extra objects as quality.

See [the skill-pack handoff](creative-skill-packs-2026-11-17.md) and
[the Astra baseline](creative-skill-astra-comparison-2026-11-17.md).
