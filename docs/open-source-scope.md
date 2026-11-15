# Open-source scope and synchronization

Dojo Video Engine and Dojo Video Harness are useful developer foundations for
[DojoClip](https://dojoclip.com/en/applications/video-edit-ai). They intentionally
cover less than the hosted commercial product. Shared editing improvements belong
upstream when they fit these foundations; commercial infrastructure stays with
its host.

## Capability boundary

| Concern                                               | Open-source engine                | Open-source harness                                                            | Commercial DojoClip host                             |
| ----------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Scene validation, rendering, playback, browser export | Owns reusable packages            | Consumes exact published versions                                              | Consumes exact published versions                    |
| Timeline and chat UI                                  | No complete editor app            | Selected shared components, English UI                                         | Reference UI and product localization                |
| Agent tools and skills                                | Scene-level primitives            | Owns portable loop/kit and local integration                                   | Consumes portable packages through commercial ports  |
| Editing state                                         | Renderable Scene data             | Local ProjectDocument, commands, history, JSON files and browser IndexedDB     | Owned projects and commercial persistence adapters   |
| Model/transcription access                            | No model service required         | User-configured BYOK providers                                                 | Managed service access and commercial funding policy |
| Generated media                                       | Renders supported supplied assets | Optional approved BYOK music; general image/video job adapters are not shipped | Managed generation jobs and provider lifecycle       |
| Accounts, billing, databases, queues, cloud storage   | Not included                      | Not included                                                                   | Commercial host responsibility                       |
| Production deployment and credentials                 | Not included                      | Loopback local host only                                                       | Commercial host responsibility                       |

A shared schema may name commercial profiles or describe a host capability.
That does not install a database, expose a paid tool, or supply an executor.
The local registry advertises only implemented tools. Skills cannot enable a
missing service or grant consent.

BYOK configuration is intentionally supported: public provider base URLs and
blank API-key fields belong in the example environment file. Customer keys,
commercial database URLs, bucket settings, billing secrets, worker addresses,
and deployment credentials do not. A normal clone runs without a private sibling
checkout, DojoClip account, database, Redis service, or commercial `.env`.

## What to synchronize

1. **Shared UI: web to harness.** Review the managed sync plan, then apply only
   selected editor components. Keep user, provider, persistence, and product-copy
   behavior behind local adapters. Review new imports as well as file hashes.
2. **Rendering: engine to both consumers.** Fix renderer/media primitives upstream;
   release immutable engine packages and update both consumers' exact versions,
   lockfiles, and provenance. A README example must use a tested published version.
3. **Portable agent behavior: harness to commercial host.** Develop neutral loop,
   tool, and skill changes in the harness. Commercial code supplies its own
   authentication, funding, persistence, queue, and provider ports.
4. **Editing semantics: verify both kernels.** Some helpers are shared; remaining
   command implementations need deliberate ports and the same semantic corpus.
   Matching versions alone do not prove all behaviors match.
5. **Host services: keep ownership separate.** A commercial feature is not an
   instruction to copy its service into open source. A local addition needs its
   own scope, implementation, and tests before being advertised.

Do not strip useful editing behavior just to make the local application smaller.
The boundary is the supported product scope and host services. Avoid importing
the SaaS runtime or implying full parity.

## Current source audit — 2026-11-15

Against harness `9e2b71b` and commercial web `80676e41`:

- All **110 managed UI files** match the current web source through the sync
  transforms; the plan has no pending changes or conflicts. The manifest's older
  source commit records the last actual sync, not the last audit.
- Both consumers pin published **engine 1.2.3**. Release provenance and
  lockfile integrity match for shared packages.
- The commercial host consumes harness **agent kit 0.2.9** and **loop 0.2.0**.
  Their recorded source commits have no subsequent package-source drift in the
  audited harness. Local `local-editor-v14` and commercial `commercial-editing-v15`
  are intentionally different host profiles.
- The freshly run shared conformance suites pass: **19 numeric clock vectors**
  and **17 kernel cases** in each host, with identical kernel document and
  observation hashes. This is bounded semantic coverage, not every command.
- Commercial databases, accounts, credits, cloud publication, and worker queues
  remain outside the local host. Local image/video generation remains an
  explicitly unimplemented extension, not a missing UI synchronization step.

The deeper comparison found one portable behavior missing from the harness:
safe application of a completed caption translation after a source appearance
change. This covers one complete translated caption item with matching cue IDs
and timings; unsupported or bound cases keep ordinary conflict checks. This review ports the web helper and its review/Apply integration. New
runs freeze an explicit host policy; old runs without it retain their prior
behavior, and Undo skips translation normalization. Supported appearance changes
preserve the saved translation; changed source text/timing, canvas, conflicting
IDs, locks, and unsupported custom layout retain conflict checks. It adds no
provider call or commercial dependency and changes no retained package archive.

The review also corrected stale README descriptions and refreshed the engine's
standalone terminal example from 1.1.3 to 1.2.3. The engine starter, title example,
terminal editing/export/reopen workflow, and caption MP4 example were executed
against the documented setup. The terminal oracle checks 120 decoded frames and
audio; the caption example exports 150 frames over five seconds. Existing
historical reports keep their original versions and outcomes.

## Remaining source differences

This is selective synchronization, not complete kernel/schema parity. One active
portable discoverability difference remains: the web's
`nativeAgentOperationDescriptors()` expands `applyCapability.action` with
`editorCapabilityInputSchema`; the harness's
`packages/core/src/lib/video-project/agent-schema.ts` currently retains a generic
object for that action's `target`. Inspecting the actual `local-editor-v14` /
kit 0.2.9 assembly `review_edit` schema confirms that nested `itemId`/`nodeId`
fields are not advertised there.

This affects schema guidance for `text.color`, `text.font`, `text.style`,
`layer.opacity`, `layer.center`, `media.fit`, `media.look`, and `audio.volume`.
Native validation still checks the target; ordinary `set`/`clear` expose the
expanded target schema and prompt examples remain available. No live-model
trial was run to measure this difference. Porting that schema expansion needs
an explicitly versioned or per-run-frozen contract plus recovery/snapshot
qualification; this audit does not rewrite existing tool/checkpoint bytes.

Conversely, the harness includes transition/linked-group facts in its native
context that the commercial native context does not include. Commercial jobs,
publication, and funding are intentional host differences. These findings are
why matching package versions and a passing bounded corpus must not be described
as identical end-to-end behavior.

## Automated boundary check

`npm run check:oss-boundary` checks repository paths, package manifests and the
lockfile, runtime imports and environment access, and `.env.example`. It rejects
commercial database/auth/billing/storage/queue dependencies and configuration,
tracked private environment or local-data files, and nonblank example API keys.
It allows public BYOK endpoints and neutral compatibility-profile names. The
normal `npm run check` includes this gate. It is an architectural regression
check, not an exhaustive secret scanner.

## Validation for this change

- Final harness check: **1,072 tests in 107 files**, TypeScript, production build,
  kit integrity, all 110 managed UI hashes, and the new infrastructure boundary
  gate passed.
- Focused translation checks: **66 tests**, including ten kernel rebase cases,
  five host persistence/recovery cases, existing agent-service tests, and the
  shared semantic corpus. They exercise style preservation, content/timing
  conflicts, stale review rejection, saved-run compatibility, idempotent Apply,
  exact Undo, and reuse without another provider request.
- Actual browser verification: **66/66 checks** with synthetic provider HTTP,
  exercising storage/reload, captions, Compare/Undo, media recovery, SVG/Three.js,
  intro/outro editing, decoded MP4/audio, saved export hashes, and narrow layout.
  No browser exceptions were reported.
- README workflow regressions: **38 tests** for corrections, graphics,
  multi-clip preparation, and speech continuation passed.
- Engine boundary contracts: **11 tests and all 17 public packages** passed;
  runnable README examples are described above.

These checks use local/synthetic fixtures, not new paid provider evaluations.
Publication and production deployment are separate from this source review.

## Review checklist

- Inspect each repository's status and source identity before changing it.
- Use [UI sync instructions](syncing-product-ui.md); never hand-edit managed copies.
- Check runtime versions, archive integrity, and the semantic cases when portable
  behavior changes. Keep old archives needed by saved runs.
- Inspect dependency, environment, import, and distribution boundaries. Neither
  ordinary startup nor CI should require the private product checkout.
- Run the owning repository's checks and any relevant browser/media examples.
- Keep source tests, synthetic provider tests, actual provider evaluation,
  publication, and deployment separate in reports.
- Update README examples only with valid paths, commands, prerequisites, and
  honest limits. Link users who want the hosted service to DojoClip.

See [current runtime and evidence](agent-system.md),
[the synchronization history](synchronization-readiness-2026-11-08.md), and
[the extension guide](extending.md).
