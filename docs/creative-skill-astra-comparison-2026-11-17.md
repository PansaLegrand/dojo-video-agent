# GPT-6 Astra creative skill comparison — 2026-11-17

The user requested a stronger model because the first short-prompt outputs were
not expressive enough. This follow-up changes the model to Kie's
`gpt-6-astra`; it does not change the creative skill content or production defaults.

## Controls and scope

Four trials: one birthday and one branded ending in each host, one repetition.
The exact user instructions are:

- “Make a joyful birthday animation for Maya, turning 30.”
- “Make a cool ending with dojoclip.com on it.”

The comparison baseline is the first repetition of those same cases in
`live-20261117-04`, using `gpt-6-sol`. Canvas, supplied content, tools, skill
instructions, grading and runtime deadlines remain unchanged. Provider reasoning
effort is not overridden. The existing 8,192-token per-request output limit and
180-second runtime deadline remain in place.

A strict `--scenarios` evaluation option selects existing cases in the supplied
order and records the subset explicitly. It does not rewrite fixtures or grading.
Source commit: agent `6d94744`; web `5b2658c8`. Both stayed unchanged throughout
the live run. Runtime artifacts are kit `ec25f635` and SDK `d57cc80d`.
The preceding compatibility comparison established exact current-profile contract
equality with baseline kit `038b89ef` across 48 configurations; these source
differences are disclosed rather than presented as identical archive bytes.

Actual model work runs through the local AgentService/ProjectStore and commercial
SDK/loop/kernel adapter with owned memory records. The actual web editor renders,
edits/undoes, reloads and exports each result with mocked owned HTTP/auth. This
does not establish production database, worker HTTP, billing or deployment acceptance.

## Observed results

All **four Astra trials passed** the unchanged automated checks. All **four actual
editor exports passed**, including full MP4 decode and sampled preview/export
frames. No provider-uncertainty stop occurred.

| Brief / host              | Sol baseline seconds | Astra seconds | Astra model requests |
| ------------------------- | -------------------: | ------------: | -------------------: |
| Birthday / OSS            |                 71.7 |         145.3 |                    5 |
| Birthday / commercial web |                 70.6 |          83.6 |                    4 |
| Ending / OSS              |                125.4 |          59.5 |                    4 |
| Ending / commercial web   |                 94.5 |          90.0 |                    7 |

These are single observed trials, not a general latency comparison.

One commercial ending initially used a kinetic-text macro while declaring a
native root-text completion property. The host rejected that mismatch and a
subsequent attempt to change the frozen checklist. Astra then authored native
text satisfying the original requirement and finalized successfully. Intermediate
failures remain in the original trace; the final pass does not imply every draft
was valid. No validator was relaxed.

## Independent visual comparison

A separate reviewer received only A/B-labeled videos, decoded frames and the
original briefs. Model labels were withheld and counterbalanced; source/provider
traces were excluded. The reviewer inspected 12 distinct frames per output,
**96 frames total**, then locked preferences before the parent revealed labels.
This is sampled-frame review, not continuous playback or user acceptance.

| Pair                      | Preferred model after reveal | Findings                                                                                                                                                             |
| ------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Birthday / OSS            | Astra, moderate confidence   | More exuberant type/color hierarchy and evolving confetti; Sol has cleaner spacing. Astra's large disc crops at the bottom and its footer crosses the disc boundary. |
| Birthday / commercial web | Astra, moderate confidence   | More coherent rounded typography, balloon framing and staged reveals. Both remain conventional birthday-card concepts.                                               |
| Ending / OSS              | Astra, moderate confidence   | Stronger centered URL, subtle gradient and a more deliberate accent sequence. Still a familiar framed technology card.                                               |
| Ending / commercial web   | Astra, narrow preference     | A focused glowing URL suits the brief; Sol has more observable animation stages. Astra's treatment is simpler, not more elaborate.                                   |

Astra was preferred in all four sampled pairs, but this is one reviewer, two
briefs and one output per model/host/brief. It does not establish statistical
superiority, broad creative reliability or README-showcase-level expressiveness.

The evidence supports a modest improvement in execution and occasion-appropriate
design. Stronger art direction, distinctive visual concepts, multi-beat
choreography and render-based feedback remain useful next work. That is an
inference from these outputs, not a controlled diagnosis of every quality limit.
No skill changes were made during this comparison.

## Budget and verification

The original combined authorization remains **US$10 / 256 model requests**,
with no paid media generation. Before this comparison, 228 requests and
USD 3.86472225 were conservatively accounted, including three unresolved
reservations.

Kie's [model inventory](https://docs.kie.ai/market/chat/gpt-6-astra) and an actual
`GET /openai/v1/models` read confirmed the exact model identifier.
The [Kie pricing table](https://kie.ai/market/openai) listed USD 2.80/M input and
14/M output on the evaluation date. This run deliberately reserved/accounted at
the higher **7/M input and 21/M output**, without cache discounts; it is not
invoice verification.

- Astra: **20 requests**, **USD 2.716294** conservatively accounted, no new unknowns.
- Combined task: **248 requests**, **USD 6.58101625**, including the unchanged
  **USD 0.39765375** reservations from three earlier unknown requests.
- Remaining original allowance: **8 requests / USD 3.41898375**.
- Runner change: 23 focused tests and full TypeScript; complete agent check passed
  **1,107 tests and production build**.
- All four browser/export checks passed; all 680 baseline evidence hashes stayed
  unchanged. No package, runtime-default, production model or deployment change.

## Evidence

Local ignored artifacts preserve requests, results, grades and both successful
and failed intermediate tool reviews:

- Agent: `test-results/creative-skills/live-20261117-05-astra/report.json`.
- Agent: `test-results/creative-skills/astra-comparison-20261117/` contains the
  pre-dispatch plan, selected runner plan and separate repair observations.
- Agent: `test-results/creative-skills/final-budget-with-astra.json`; the original
  01–04 summary and all original reports remain unchanged.
- Web: `test-results/creative-skills/astra-ui/verification-summary.json`, plus
  four original MP4s and decoded frames.
- Web: `test-results/creative-skills/model-comparison-20261117/index.html`
  provides side-by-side playback of all four comparisons.
- The comparison's `blind/review-01.md` and `blind/review-01.json` preserve the
  independent review; `unblinded-review.json` records the later label reveal.

This adds actual-model evidence for these four current-candidate cases. It does
not replace the earlier 32-trial matrix, erase its failures, qualify unseen cases,
or establish production rollout. See the [main R27 handoff](creative-skill-packs-2026-11-17.md).
