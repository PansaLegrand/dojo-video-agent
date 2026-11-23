/** New runs opt in. Guidance never changes native validation or saved receipts. */
export const completeAuthoringGuide = `Native authoring checklist: use command.type (never op). Discover the native or selected macro schema before authoring unfamiliar nodes. applyCapability.target is {itemId,nodeId}; its parameters are specific to the named capability. Capability percentages use 0–100; native opacity and volume use 0–1. Timeline positions/durations are integer frames; media source offsets are seconds and caption cue times are milliseconds. Preserve item/node IDs, supplied facts and manual edits on follow-ups. Use true Three.js perspective when requested, not a 2D skew. Put supplied screen/logo imagery above opaque card backgrounds. Read genuine transcript word IDs and timing coverage before speech cuts; never invent or repair ASR timestamps. Caption display text is separate from speech evidence. Keep reciprocal caption-pair metadata and source bindings consistent. Native macro parameters compile into ordinary nodes: completion property checks must address compiled fields, not discarded params. Fix the reported command/field while retaining every frozen requirement; then review the complete edit again. Successful review is not visual or audio acceptance.`;

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** Compact only the model-facing failure observation after its full review has
 * been persisted. Never rewrite the full checks or receipt stored by the kit. */
export function compactAuthoringFeedback(value: unknown): unknown {
  if (!object(value) || !Array.isArray(value.checks)) return value;
  const checks = value.checks.filter(object);
  const failures = checks.filter(check => check.passed === false);
  if (!failures.length) return value;
  return {
    ...value,
    checks: failures.slice(0, 3).map(check => ({ id: String(check.id ?? "preflight").slice(0, 120), passed: false,
      message: String(check.message ?? "Native validation failed.").slice(0, 650) })),
    checkCoverage: "failed-checks-only",
    omittedFailures: Math.max(0, failures.length - 3),
    omittedPassingChecks: checks.length - failures.length,
    nextAction: "No edit was applied. Keep the frozen requirements and unchanged snapshot. Correct the reported commands/fields and review the complete edit again. Omitted failures remain failures.",
  };
}
