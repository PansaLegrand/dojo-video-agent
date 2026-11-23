/** New runs opt in. Guidance never changes native validation or saved receipts. */
export const completeAuthoringGuide = `Native authoring checklist: when plan_edit_stages is offered, multi-source bilingual captions combined with source cuts or callouts need an early durable plan. The built-in planning/direct invocation has only 16 model calls, within the original 64-call overall allowance. Read at most one needed skill and the exact word IDs needed for requirements, then plan captionPairs and the complete outcomes before preparing every caption/graphic. Caption batches and assembly get their own bounded invocations from the same original allowance. Inspect source frames and author additional graphics in assembly; do not spend the planning allowance on every preparation tool. Simple edits may still review directly. Reuse genuine IDs and schema facts already supplied in context, frozen requirements or owned prepared artifacts; query only missing data. Helper-produced commands already follow native grammar, so do not rediscover the whole graphics schema just to reuse them. Use command.type (never op). Discover the native or selected macro schema before authoring unfamiliar nodes. applyCapability.target is {itemId,nodeId}; its parameters are specific to the named capability. Capability percentages use 0–100; native opacity and volume use 0–1. lineHeight is a unitless font-size multiplier (for example 1.1), never a pixel count such as 48. CSS lengths such as fontSize are pixels for numbers. 3D object rotations use degrees and 3D keyframe time uses seconds. Timeline positions/durations are integer frames; media source offsets are seconds and caption cue times are milliseconds. Preserve item/node IDs, supplied facts and manual edits on follow-ups. Use true Three.js perspective when requested, not a 2D skew. Put supplied screen/logo imagery above opaque card backgrounds. When owned source-inspection tools are available, inspect representative source frames before placing captions/callouts; protect faces and burned-in text. Read genuine transcript word IDs and timing coverage before speech cuts; never invent or repair ASR timestamps. Caption display text is separate from speech evidence. Prepared caption pairs use generic default placement, not source-aware visual placement. After inspecting each source, explicitly recompose its original/translated caption bounds into clear picture space without covering faces, existing headlines, tickers or logos. Use readable contrasting treatment; leaving default captions over burned-in source text is a visual failure even if native cue checks pass. Use anchorSpeech.holdMs for a readable callout; never set an anchored item duration. When cutting speech, regenerate captions for every surviving source fragment; stale split cues can repeat removed words. Edited-speech review supplies host cue manifests for exact original text and translated cue IDs/times. Keep reciprocal caption-pair metadata and source bindings consistent. Native macro parameters compile into ordinary nodes: completion property checks must address compiled fields, not discarded params. Fix the reported command/field while retaining every frozen requirement; then review the complete edit again. Successful review is not visual or audio acceptance.`;

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** Compact only the model-facing failure observation after its full review has
 * been persisted. Never rewrite the full checks or receipt stored by the kit. */
export function compactAuthoringFeedback(value: unknown): unknown {
  if (!object(value)) return value;
  if (object(value.completionPreflight)) {
    const review=compactAuthoringFeedback(value.completionPreflight);
    const bounded = object(review) ? Object.fromEntries(Object.entries(review).filter(([key])=>key!=="nextAction")) : review;
    return review===value.completionPreflight ? value : { ...value, completionPreflight: bounded,
      nextAction: value.completionPreflight.previewRepair ? value.nextAction : "No edit was applied. Keep every frozen requirement. Correct the reported fields and review the complete edit again." };
  }
  if (!Array.isArray(value.checks)) return value;
  const checks = value.checks.filter(object);
  const failures = checks.filter(check => check.passed === false);
  if (!failures.length) return value;
  return {
    ...value,
    checks: failures.slice(0, 3).map(check => ({ id: String(check.id ?? "preflight").slice(0, 120), passed: false,
      message: String(check.message ?? "Native validation failed.").slice(0, String(check.message ?? "").startsWith("Edited speech cues") ? 1800 : 650) })),
    checkCoverage: "failed-checks-only",
    omittedFailures: Math.max(0, failures.length - 3),
    omittedPassingChecks: checks.length - failures.length,
    nextAction: "No edit was applied. Keep the frozen requirements and unchanged snapshot. Correct the reported commands/fields and review the complete edit again. Omitted failures remain failures.",
  };
}

export const completeAuthoringUnits = Object.freeze({
  lineHeight: "Unitless font-size multiplier; 1.1 means 1.1 × fontSize, not 1.1 pixels.",
  lengths: "Numeric style widths/heights/offsets/fontSize are composition pixels.",
  timeline: "Integer frames; nested from/duration and animation frames are parent/node-local.",
  sourceOffsets: "videoStartTime/audioStartTime are source seconds.",
  captions: "Cue startMs/endMs are milliseconds relative to their caption item.",
  three: "Object rotations are degrees; object.keyframes channel times are seconds.",
  ratios: "Native opacity/volume use 0–1; applyCapability percent uses 0–100.",
});
export function completeAuthoringObservation(name: string, value: unknown): unknown {
  return name === "review_edit" ? compactAuthoringFeedback(value)
    : name === "inspect_graphics_schema" && object(value) ? { ...value, authoringUnits: completeAuthoringUnits } : value;
}
