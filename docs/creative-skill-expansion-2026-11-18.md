# Creative skill expansion — R27 continuation

The requested expansion adds four disciplines to the candidate: kinetic
typography, presentation motion, product walkthroughs and spatial scenes.
There are now seven creative packs and ten operational guides. This extends
R27 without changing the completed R00–R26 scope or the R25 provider blocker.

## New guidance

| Pack                | Short instruction used by the new evaluation case                                       | Main boundary                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Kinetic typography  | Animate “MAKE EVERY FRAME COUNT” as an energetic motion poster.                         | Exact supplied words, editable text and a readable final hold. Real handwriting needs appropriate owned paths/assets.     |
| Presentation motion | Make a clean motion slide explaining these steps: Plan, Build, Launch.                  | Explain supplied content and order; no PPTX/PDF parser or source-deck export is added.                                    |
| Product walkthrough | Create a concept app walkthrough showing Capture, Organize, Share. Label it Concept UI. | Show a visible action and response; preserve supplied facts and identify fictional UI. No external product action occurs. |
| Spatial scenes      | Make a tiny 3D island scene with a slow camera move and the title “Small world”.        | Actual supported geometry and motion, with a scene-local backdrop that preserves global format settings.                  |

Each pack has a nine-frame JPEG board, motion-analysis notes and source/frame
hash provenance, drawn from existing MIT engine showcase exports. The reference
videos are authored examples, not evidence of new model-generated results.
The four boards were visually inspected. The original three boards and default
eight-case evaluation suite remain unchanged.

## Ownership and runtime behavior

The agent owns the portable Markdown, discovery, reference delivery and tests.
Web consumes the packaged kit through its native SDK. Worker dependencies carry
the matching immutable archives; its existing model wrapper needs no source change.
Engine 1.2.3 and loop 0.2.0 remain pinned. Current local-v14 candidate runs use
kit 0.2.10. Web requires explicit `harness-tools-v11`, including the new
`native-expanded-creative-library-v1` capability. Default/retained 0.2.9 behavior
is unchanged. Nothing here establishes package publication or deployment.

The optional frontmatter `metadata: {"dojo-family":"creative"}` marks new
creative packs without reclassifying old custom guides by their names or body
text. The selected capability/tool inventory gates eligibility. Spatial scenes
also require `prepare_three_scene`. Skill content grants no execution authority.

A successful skill read loads its frozen instructions and references. If more
than three images have been read, the wrapper attaches the three most recent
and states which IDs were attached and how many were omitted. Re-reading a
skill restores its board. When all images fit, original attachment ordering is
preserved. Reference pixels remain outside checkpoint messages.

Pre-expansion saved skills retain exact prompt and inventory hashes in both
current profiles, including custom guides whose names match new built-ins.
Older profiles keep their original behavior and omit newly marked creative packs.

## Source and package identities

| Owner/artifact                  | Exact identity                                                     |
| ------------------------------- | ------------------------------------------------------------------ |
| Agent implementation            | `8547e4e`                                                          |
| Agent package/evaluation source | `cee1d3d488750a31d9498c26169f270841d2cbe0`                         |
| Web SDK source                  | `823fa98c1dcd9232a11dfd01431471d955d35b4a`                         |
| Web archive commit              | `200303e6`                                                         |
| Worker consumer commit          | `b95d9c0`                                                          |
| Kit archive                     | `dojo-video-agent-kit-0.2.10-candidate-cee1d3d4.tgz`               |
| Kit SHA-256                     | `56183ff50c55a3962033a309cda924ec38a5158ad6ae3b3bba1ce3ef74d9655e` |
| SDK archive                     | `dojoclip-video-project-runtime-0.2.10-candidate-13deaf19.tgz`     |
| SDK SHA-256                     | `13deaf19f2ae17aadf4293c5db03e096f23d18961669cbe7288f8141d0500f3d` |

All commits are local development candidates. Prior package archives and original
live reports remain retained. Documentation changes do not alter these artifacts.

## Observed checks

- Agent full `npm run check`: **1,122 tests**, TypeScript, integrity, managed UI
  parity and production build passed. Four new SKILL.md packs passed the skill
  format validator.
- Web full check gates: shared-package/frozen-runtime integrity, TypeScript and
  **5,856 tests passed; 472 integration tests skipped**. Used an 8 GiB Node heap
  and `npm test -- --maxWorkers=2`; skipped DB/provider tests are not acceptance.
- Worker TypeScript and **35 focused tests** passed.
- Seven release provenance checks passed, including source verification; 14
  superseded development archives were audited. Two retained qualified archives
  remain verified by content, with their historical source-provenance caveat.
- Compiled web adapter passed seven synthetic two-call scenarios. Each skill
  delivered its exact JPEG only after a successful read; the input document
  stayed unchanged. This makes no real-provider or rendered-quality claim.
- Compatibility tests preserve the pre-expansion prompt/inventory hashes and
  exercise reference eviction/revisit behavior and parser/tool eligibility.
- The current-profile reliability suite passed **32/32 reference-fixture trials**
  over two repeats with zero provider requests. This checks deterministic host
  behavior and does not qualify real-model quality.
- Four new opt-in short briefs produce an eight-trial plan across both hosts.
  Their automated checks require supplied words, preservation and motion; the
  spatial case also requires actual 3D geometry/motion. Readability, choreography
  and logical action order still require rendered review.

## Live evaluation and retained HTTP 429 stop

**User stop, 2026-11-18:** Paid testing is on hold at the user’s explicit request.
Do not resume provider calls or the pending login/reconciliation workflow
automatically. The remaining allowance is historical authorization, not permission
to restart while this stop is in force. Saved evidence and reservations remain.

The user added **US$10 / 64 Kie model requests**, making the cumulative task
ceiling **US$30 / 384 requests**. Campaign
`live-20261118-09-skill-expansion` admitted eight trials on `gpt-6-astra`, with
its own maximum of US$10 / 64 requests and the prior conservative rates of
US$7/M input and US$21/M output. Source commits `0bc4c04` (agent) and `df5c363c`
(web) stayed unchanged throughout the campaign; their package bytes are listed
above. No paid media generation was allowed or requested.

The first OSS typography trial read the correct skill, inspected the native
grammar and returned a complete `review_edit` draft. Native completion preflight
passed all declared checks. The next provider request returned **HTTP 429**,
without usage data. The uncertainty guard stopped immediately, without retry.
Original outcome: **one failed trial, seven unattempted; zero completed live
workflows**. The commercial model path and other three new disciplines have
not been exercised by this campaign.

Kie's [Codex API documentation](https://docs.kie.ai/market/codex/gpt-codex)
identifies 429 as rate limiting. A zero-cost account-credit query succeeded and
confirmed a positive balance; it cannot resolve that request's billing. The
[request log dashboard](https://kie.ai/logs) required sign-in. The reserved cost
remains held. Further paid requests require the user to resume testing and
resolution of the usage uncertainty. No key,
account balance, or provider credentials are copied into tracked evidence.

### Saved-draft recovery and browser evidence

The third paid response's original edit was replayed through the same native
review/compiler with its original snapshot and current-profile options. Its
full completion receipt and resulting document hash matched the prior successful
review exactly. No model call, manual command authoring or composition change
was needed. The original failed project/campaign was not altered, and this
separate replay does not convert the failed live workflow into a pass.

The recovered 1280×720, 30 fps, six-second draft passed:

- **14 actual unified web-editor checks**, including a native text edit/Undo,
  revision-bound export, all 180 frames fully decoded, reload, narrow viewport,
  no browser exceptions and unchanged input/source. Owned HTTP/authentication
  are mocked in this web test; it does not establish production storage.
- **Actual OSS HTTP/editor export**, using an isolated copy with provider
  dispatch disabled. All 180 frames decoded; reload and narrow-screen checks
  passed. This helper did not perform a manual text edit/Undo for this phrase.
- Independent semantic checks on the saved document, preserving exact supplied
  words, original project settings and native motion.

Sampled review of seven decoded frames found readable words, coherent cream /
black / orange contrast, staged reveals and a settled reading hold. The motion
is restrained and does not establish the range or quality of the other packs.
The draft remains a partial paid result, not a completed model-generated edit.

### Accounting and evidence

The new campaign made **four requests**: known token usage accounts for
**US$0.412440**, with **US$1.764147** reserved for the failed request; total
**US$2.176587** conservatively accounted. Cumulative task accounting is now
**311 requests / US$20.85847525**, including **US$2.16180075** in unresolved
reservations from four requests. The combined remaining allowance is
**73 requests / US$9.14152475**. These are quote-rate estimates/reservations,
not verified invoice amounts. Existing and failed reports are retained unchanged.

Local evidence:

- Agent `test-results/creative-skills/live-20261118-09-skill-expansion/`: original
  campaign, requests, paid responses, authorization and non-sensitive balance check.
- Agent `test-results/creative-skills/expansion-budget-20261118.json`: aggregate
  accounting without modifying any earlier ledger.
- Agent `test-results/creative-skills/expanded-kinetic-saved-draft/`: exact
  recovered document, original-receipt equality and separate semantic checks.
- Web `test-results/creative-skills/expanded-saved-draft-web/`: MP4, decoded
  frames, browser report, sampled visual review and contact sheet.
- Agent `test-results/creative-skills/expanded-saved-draft-oss/`: local HTTP/editor
  screenshots, MP4 and decode report.
- Agent `test-results/creative-skills/skill-expansion-20261118/`: package receipts;
  `expanded-reference-reliability.json` in the parent directory records fixtures.
- Web `test-results/creative-skills/expanded-compiled-smoke.json`: synthetic
  delivery checks; unique adapter `adapter-expanded-cee1d3d4.mjs` in that directory.
  It imports current SDK dist; reproduction requires the frozen archives above.

No push, publication, runtime-default change or deployment occurred.
