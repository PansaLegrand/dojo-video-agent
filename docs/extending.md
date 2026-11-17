# Add a capability without growing the loop

See [the agent system map](agent-system.md). Shared built-in definitions live in
`packages/agent-kit`; local `packages/agent` supplies kernel ports and the host
registers external services. The kit returns the active capability inventory and
filters named skills by their required executors.

Develop portable renderer/runtime behavior in the open-source engine/harness,
then adopt it through the commercial host's adapters. Shared editor UI follows
the DojoClip web reference through the managed sync tool. Host-specific credentials,
billing, persistence and external-job execution stay at their owning boundaries.

## A read-only tool

Implement `AgentTool` from `packages/agent/src/tools.ts` and pass it through
`runAgent({ ..., extraTools: [yourTool] })`. Names must be unique. Validate input
inside `execute`, honor the abort signal, and return a bounded observation.
Tools are trusted host code; do not load executors from model output or skills.

First exercise: add `count_clips`, accepting a track ID and returning a count.
Test invalid tracks and a cancelled signal. It needs no model-specific changes.

## An editing capability

Add a validated command builder or an entry in the shared capability catalog.
Define applicable targets, locked-state behavior, scope, and reversibility. Route
manual controls and the agent through that same builder. Add behavior tests proving
that unrelated content survives and that stale or out-of-scope edits are rejected.

The model-visible command schema is generated from the kernel. A successful tool
call stages a candidate. Keep the user's final commit in the host.

## A skill

Add a folder such as `skills/my-motion/SKILL.md` with a short entry point:

```markdown
---
name: my-motion
description: Compose editable motion for a specific use case. Use when the user asks for that result.
---

# My motion

Explain the creative method, the facts to preserve, and how to review the result.
```

The folder name and `name` must match. Use at most 64 lowercase letters, digits
or hyphens, beginning with a letter or digit. Only single-line `name` and
`description` metadata are interpreted; descriptions are limited to 500
characters. A nonempty Markdown body is required. This is a bounded frontmatter
format, not a general YAML parser or an executable plugin manifest.

Legacy `skills/my-motion.md` files remain supported; their first nonempty,
non-heading line supplies the index description. Folder and flat-file names share one
namespace. The loader admits at most 32 entries, 64 KiB per entry, and rejects
symlinks and duplicate names. It does not recursively discover supporting files.
Directories without `SKILL.md`, such as existing `references/` folders, are
ignored and do not count toward the skill limit.

The server reads that directory at startup and advertises a compact index. The
model requests the chosen body through `read_skill`; it does not receive every
pack's instructions in every turn. `SKILLS_DIR` optionally selects a different
local directory. Restart after changing files. New candidate local-v14 runs
freeze the loaded instructions privately so resuming an existing run cannot
silently pick up a later edit. Retained builds use their original skill/build
selection; old runs do not acquire newly loaded folder packs. Existing flat
custom guides retain their bytes even when a name matches a new built-in pack.

For a visual skill, explicitly declare supporting resources in `references.json`
beside `SKILL.md`. Each entry has a lowercase `id`, a `title`, a `markdown` path
such as `references/atlas.md`, and optionally an `image` path such as
`references/atlas.jpg`, its hex `sha256`, `width` and `height`. Only these fields
are supported. Use one to three entries; each Markdown file is at most 12 KiB.
JPEGs are at most 128 KiB, 2048 pixels per side and two megapixels. Paths stay
inside `references/`; symlinks and remote URLs are rejected. Files not declared
in this manifest are not loaded. See the shipped festival pack for an example.

After a successful skill read, the current host adds its declared reference pixels
to the model input. These are trusted skill materials, not project-media uploads
or assets inserted into the timeline. Notes and image hashes stay in the small
tool observation; frozen private skill snapshots retain the reference bytes.
The reference-aware hosts support at most three attached images per invocation.
Retained runtimes keep their original behavior. A skill with no references keeps
the same three-field representation as before.

The built-in examples are [branded ending](../skills/branded-ending/SKILL.md),
[chart storytelling](../skills/chart-storytelling/SKILL.md), and
[festival motion](../skills/festival-motion/SKILL.md). Shared built-ins are bundled
by `npm run build --workspace @dojo-video/agent-kit`; adding one also
requires its catalog/tool eligibility and behavior checks. The commercial host
consumes the packaged kit rather than a user's local `SKILLS_DIR`. The 0.2.10 web
candidate is opt-in; see [qualification and limitations](creative-skill-packs-2026-11-17.md).

The visual examples are inspectable before using them:

| Skill              | Reference board                                                  | Motion notes                                                                           |
| ------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Festival motion    | [Nine frames](../skills/festival-motion/references/atlas.jpg)    | [Concepts and choreography](../skills/festival-motion/references/atlas.md)             |
| Branded ending     | [Nine frames](../skills/branded-ending/references/atlas.jpg)     | [Reveal and lockup](../skills/branded-ending/references/atlas.md)                      |
| Chart storytelling | [Nine frames](../skills/chart-storytelling/references/atlas.jpg) | [Editorial motion and data fidelity](../skills/chart-storytelling/references/atlas.md) |

Skills should explain a method and its domain constraints, not contain hidden
permissions, credentials, arbitrary executable snippets, or duplicated tool schemas.

## A GPT endpoint

The supported transport is `GptResponsesModel`, using the Responses API at
`LLM_BASE_URL/responses`. OpenAI and Kie can use the same adapter with different
base URLs and keys. `LLM_MODEL` must be a GPT model name; it is never silently
rewritten. Other model families are outside the supported scope.

`LanguageModel.complete(messages, tools, signal)` remains a small seam for tests.
It preserves call IDs and opaque provider output, including encrypted reasoning,
for the next tool-result request. The adapter bounds responses, rejects incomplete
output and HTTP-200 error envelopes, redacts provider errors, and performs no
retries. Keep these behaviors when changing the transport. Use synthetic HTTP
fixtures first, then an explicitly authorized live test.

## Another ASR provider

The shipped adapter supports OpenAI-compatible `audio/transcriptions` endpoints
and native ElevenLabs `https://api.elevenlabs.io/v1/speech-to-text`. Selecting the
ElevenLabs preset uses `scribe_v1` and the user's own key. Native word/spacing/event
records are normalized without inventing timestamps; spacing/events do not become
spoken word evidence. The same local receipt and consent boundaries apply.

Normalize provider output into actual words with source start/end timestamps.
Reject absent or malformed word timing; do not manufacture it from segments.
Keep receipts bound to source hash, language, provider, and model. Display captions
may subsequently change without changing the receipt or its evidence.

Ordinary speech-dependent chat already has a prerequisite lifecycle in
`apps/server/src/agent-speech.ts`; new speech tools should reuse its frozen source,
consent, receipt verification and continuation boundaries. The full instruction
resumes after evidence preparation, so dependent editing steps should consume
that evidence rather than start a second unrelated captions workflow.

## Future image-to-video integration

This release does not submit image/video-generation jobs. Implementing one requires
more than adding a synchronous editing command:

1. Prepare a typed request with exact source image, prompt, model, duration, and
   expected cost/usage. Present an explicit approval card.
2. Persist approval and job identity before submitting. A timeout is uncertain,
   not proof that the provider rejected the request.
3. Reconcile the same job; verify and store the resulting media under stable identity.
4. Propose inserting the asset into the current timeline. Validate its scope and
   current revision independently from the completed generation job.
5. Undo insertion without regenerating media or reversing a completed provider job.

Add this as a host-owned external-action lifecycle with resumable state. Do not
hide spending or uploads inside an apparently read-only tool.

## Music as a small external-action example

Follow `skills/music-generation.md` → `apps/server/src/music-tools.ts` →
`music-service.ts` → `packages/adapters/src/music.ts`.
The tool prepares an approval card. Approval persists the input and submission
fence before the provider call. A known task can be polled after restart; an
unknown submission is never repeated automatically. Downloaded audio is inspected,
hashed and stored before a single validated insertion and completed receipt are
committed together. Undo does not rerun the provider job.

The local host registers extra tools with the fourth `AgentService` constructor
argument. See `local-api.ts` for explicit wiring. A future video-search package
would use this seam, plus ordinary Markdown guidance; no npm discovery or dynamic
code loading is implemented in this release.

`EditingWorkflowService` demonstrates a different effect: source uploads and
provider preparation produce one reviewable candidate; existing Compare/Apply
owns the final document commit. The local editor wrapper uses the product's
optional extension slot, so host-specific panels do not fork the managed UI.
