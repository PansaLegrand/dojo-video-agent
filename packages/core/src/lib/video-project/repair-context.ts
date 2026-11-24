type Message = { role: string; content?: unknown; tool_call_id?: string;
  tool_calls?: Array<{ id: string; function: { name: string } }> };
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
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
