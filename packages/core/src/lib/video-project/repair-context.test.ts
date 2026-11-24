import { expect, it } from "vitest";
import { compactSupersededReviews } from "./repair-context";

const hash = "sha256:" + "a".repeat(64);
const review = (id: string, status = "failed", extra: Record<string, unknown> = {}) => [
  { role: "assistant", content: null, providerOutput: [{ arguments: "unchanged opaque provider replay" }],
    tool_calls: [{ id, function: { name: "review_edit", arguments: JSON.stringify({ edit: { commands: ["large draft"] } }) } }] },
  { role: "tool", tool_call_id: id, content: JSON.stringify({ nextAction: status === "failed" ? "No edit was applied. Keep every frozen requirement." : "Propose the checked edit.",
    completionPreflight: { version: 1, snapshotHash: hash, requirementsHash: hash,
      requirements: [{ id: "kept", kind: "property", equals: 3 }], status, checks: [{ id: "layout", passed: status === "passed" }], ...extra } }) },
];
const initial = [{ role: "system", content: "immutable instructions" }, { role: "user", content: "requested edit" }];
it("omits only a superseded failed review pair and preserves the latest complete draft, feedback and caller checkpoint", () => {
  const messages = [...initial, ...review("old"), ...review("latest", "passed", { receipt: { receiptHash: hash } })];
  const saved = structuredClone(messages);
  expect(compactSupersededReviews(messages, m => m.length > 4)).toEqual([...initial, ...messages.slice(-2)]);
  expect(messages).toEqual(saved);
  expect(compactSupersededReviews(messages, () => false)).toBe(messages);
});
it("keeps earlier successful reviews and the newest failure, including all frozen requirements", () => {
  const messages = [...initial, ...review("passed", "passed", { receipt: {} }), ...review("old"), ...review("latest")];
  expect(compactSupersededReviews(messages, () => true)).toEqual([...messages.slice(0, 4), ...messages.slice(-2)]);
});
it.each([
  { snapshotHash: "sha256:" + "b".repeat(64) }, { requirementsHash: "sha256:" + "b".repeat(64) },
  { requirements: [{ id: "kept", kind: "property", equals: 4 }] }, { previewRepair: true },
  { requirements: [] }, { checks: [] }, { status: "unknown" },
])("protects reviews with mismatched or incomplete authority: %j", extra => {
  const messages = [...initial, ...review("old"), ...review("next", "failed", extra)];
  expect(compactSupersededReviews(messages, () => true)).toEqual(messages);
});
it("protects preview repairs, mixed tool batches, incomplete pairs, and malformed observations", () => {
  for (const change of [
    (group: any[]) => { group[0].tool_calls.push({ id: "other", function: { name: "write" } }); },
    (group: any[]) => { group[1].tool_call_id = "other"; },
    (group: any[]) => { group[1].content = "not JSON"; },
    (group: any[]) => { const v = JSON.parse(group[1].content); v.completionPreflight.previewRepair = true; group[1].content = JSON.stringify(v); },
  ]) {
    const old = review("old"); change(old);
    const messages = [...initial, ...old, ...review("next")];
    expect(compactSupersededReviews(messages, () => true)).toEqual(messages);
  }
});
