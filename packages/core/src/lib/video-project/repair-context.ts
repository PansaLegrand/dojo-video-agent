type Message = { role: string; content?: unknown; tool_call_id?: string;
  tool_calls?: Array<{ id: string; function: { name: string } }> };
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Successful static schema discovery has no project/receipt/source authority.
 * Under bounded-v2 it may leave transport context when capacity is exhausted.
 * Keep the two newest tool groups and all unrecognized/error observations. */
export function compactSchemaReads<T extends Message>(messages: T[], exceeds: (messages: T[]) => boolean): T[] {
  if (!exceeds(messages)) return messages;
  const recent = new Set(messages.flatMap((message, i) => message.role === "assistant" && message.tool_calls?.length ? [i] : []).slice(-2));
  const removed = new Set<number>();
  let output = messages;
  for (let i = 0; i < messages.length - 1 && exceeds(output); i++) {
    const call = messages[i], result = messages[i + 1];
    if (recent.has(i) || call.role !== "assistant" || call.tool_calls?.length !== 1 ||
      call.tool_calls[0].function.name !== "inspect_graphics_schema" || result.role !== "tool" ||
      result.tool_call_id !== call.tool_calls[0].id || messages[i + 2]?.role === "tool" ||
      typeof result.content !== "string") continue;
    try {
      const value: unknown = JSON.parse(result.content);
      if (!object(value) || value.pinned === true || value.ok === false || value.valid === false || value.success === false ||
        ["error", "failed"].includes(String(value.status)) || ["error", "errors", "issues", "receipt", "completionPreflight"].some(key => key in value)) continue;
      const schema = (value.version === 1 && value.kind === "native" && object(value.node)) ||
        (value.version === 1 && value.kind === "macro" && (object(value.parameters) || Array.isArray(value.macros))) ||
        (object(value.three) && object(value.extension));
      if (!schema) continue;
      removed.add(i); removed.add(i + 1);
      output = messages.filter((_, index) => !removed.has(index));
    } catch { /* Keep malformed or unfamiliar observations. */ }
  }
  return output;
}

/** Model transport only. Persisted checkpoints, tool arguments, receipts and
 * latest feedback remain unchanged. A complete later review can supersede only
 * a failed, effect-free review of the exact same frozen requirement set. */
export function compactSupersededReviews<T extends Message>(messages: T[], exceeds: (messages: T[]) => boolean): T[] {
  if (!exceeds(messages)) return messages;
  const reviews: Array<{ start: number; end: number; key: string; failed: boolean }> = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const call = messages[i], result = messages[i + 1];
    if (call.role !== "assistant" || call.tool_calls?.length !== 1 ||
      call.tool_calls[0].function.name !== "review_edit" || result.role !== "tool" ||
      result.tool_call_id !== call.tool_calls[0].id || messages[i + 2]?.role === "tool" ||
      typeof result.content !== "string") continue;
    try {
      const value: unknown = JSON.parse(result.content);
      if (!object(value) || !object(value.completionPreflight)) continue;
      const review = value.completionPreflight;
      if (review.version !== 1 || review.previewRepair ||
        !["failed", "passed"].includes(String(review.status)) ||
        !Array.isArray(review.requirements) || !review.requirements.length ||
        !Array.isArray(review.checks) || !review.checks.length ||
        !/^sha256:[a-f0-9]{64}$/.test(String(review.snapshotHash)) ||
        !/^sha256:[a-f0-9]{64}$/.test(String(review.requirementsHash))) continue;
      const failed = review.status === "failed" && !review.receipt &&
        review.checks.some(check => object(check) && check.passed === false) &&
        typeof value.nextAction === "string" && value.nextAction.startsWith("No edit was applied.");
      reviews.push({ start: i, end: i + 2, failed,
        key: JSON.stringify([review.snapshotHash, review.requirementsHash, review.requirements]) });
    } catch { /* Malformed or unknown observations remain protected evidence. */ }
  }
  const removed = new Set<number>();
  let output = messages;
  for (const [index, review] of reviews.entries()) {
    if (!exceeds(output)) break;
    if (!review.failed || !reviews.slice(index + 1).some(next => next.key === review.key)) continue;
    for (let i = review.start; i < review.end; i++) removed.add(i);
    // Whole assistant/observation pairs include provider replay records. Never
    // rewrite an opaque provider record or leave an orphaned observation.
    output = messages.filter((_, i) => !removed.has(i));
  }
  return output;
}
