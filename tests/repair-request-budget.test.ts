import { expect, it, vi } from "vitest";
import { boundCreativeRequest } from "../packages/agent/src/request-budget";

const signal = new AbortController().signal;
const transport = () => ({ prepare: vi.fn(async () => {}), complete: vi.fn(async () => ({ text: "done", calls: [] })) });
it("fits an oversized repair conversation only under the frozen opt-in, identically for prepare and complete", async () => {
  const hash = "sha256:" + "a".repeat(64);
  const pair = (id: string, status: string) => [
    { role: "assistant" as const, content: "draft", providerOutput: [{ arguments: "x".repeat(110000) }], tool_calls: [{ id, type: "function" as const, function: { name: "review_edit", arguments: "{}" } }] },
    { role: "tool" as const, tool_call_id: id, content: JSON.stringify({ nextAction: "No edit was applied.", completionPreflight: { version: 1, status, snapshotHash: hash, requirementsHash: hash, requirements: [{ id: "keep" }], checks: [{ passed: status === "passed" }] } }) },
  ];
  const messages = [{ role: "system" as const, content: "Never change frozen facts" }, ...pair("old", "failed"), ...pair("new", "passed")];
  const before = structuredClone(messages), seen: unknown[] = [];
  const wrapped = boundCreativeRequest({ prepare: async m => { seen.push(m); }, complete: async m => { seen.push(m); return { text: "done", calls: [] }; } }, "bounded-v1");
  await wrapped.prepare!(messages, [], signal); await wrapped.complete(messages, [], signal);
  expect(seen).toEqual([[messages[0], ...messages.slice(-2)], [messages[0], ...messages.slice(-2)]]);
  expect(messages).toEqual(before);
  await expect(boundCreativeRequest(transport()).complete(messages, [], signal)).rejects.toThrow(/text and tool limit/);
  await expect(wrapped.complete([{ role: "user", content: "x".repeat(200000) }], [], signal)).rejects.toThrow(/text and tool limit/);
});
it("checks exact UTF-8 text at the boundary, including tools and opaque replay", async () => {
  const mock = transport(), model = boundCreativeRequest(mock);
  const header = [{ role: "user" as const, content: "" }];
  const n = 192 * 1024 - Buffer.byteLength(JSON.stringify({ messages: header, tools: [] }));
  const messages = [{ role: "user" as const, content: "x".repeat(n) }];
  await model.prepare!(messages, [], signal);
  await model.complete(messages, [], signal);
  messages[0].content += "a";
  await expect(model.complete(messages, [], signal)).rejects.toThrow(/text and tool limit/);
  await expect(model.prepare!([], [{ name: "inspect", description: "界".repeat(66000), parameters: {} }], signal)).rejects.toThrow(/text and tool limit/);
  await expect(model.prepare!([{ role: "assistant", content: null, providerOutput: [{ encrypted_content: "x".repeat(n) }] }], [], signal)).rejects.toThrow(/text and tool limit/);
  expect(mock.prepare).toHaveBeenCalledTimes(1);
  expect(mock.complete).toHaveBeenCalledTimes(1);
});
it("counts real user image parts against the total and inline tool images as text", async () => {
  const model = boundCreativeRequest(transport());
  const image = { type: "image_url", image_url: { url: "data:image/jpeg;base64," + "a".repeat(300000) } };
  await model.prepare!([{ role: "user", content: [image] }], [], signal);
  await expect(model.prepare!([{ role: "user", content: Array(4).fill(image) }], [], signal)).rejects.toThrow(/model input limit/);
  await expect(model.prepare!([{ role: "tool", content: JSON.stringify(image) }], [], signal)).rejects.toThrow(/text and tool limit/);
});
