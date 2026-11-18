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

## Live evaluation boundary

No new provider request was made during implementation. Existing task accounting
remains **307 requests / USD 18.68188825** against the approved **320 / US$20**
ceiling, including USD 0.39765375 retained for three old unknown requests.
That leaves **13 requests / USD 1.31811175**. The new four packs have local
contract/consumer evidence; they are not yet actual-model or visual-quality
qualified. The expanded matrix needs a separately authorized budget extension.
No paid media generation is part of this work.

Local evidence: agent `test-results/creative-skills/skill-expansion-20261118/`
contains the package receipts; agent
`test-results/creative-skills/expanded-reference-reliability.json` records the
reference fixture run. Web
`test-results/creative-skills/expanded-compiled-smoke.json` records the compiled
reference checks. The unique adapter is
`test-results/creative-skills/adapter-expanded-cee1d3d4.mjs`; it uses current SDK
dist, so historical reproduction requires the exact archives above.
