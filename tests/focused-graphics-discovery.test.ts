import { expect, it } from "vitest";
import { createVideoToolset } from "../packages/agent/src/tools";
import { createVideoProjectDocument, hashVideoProjectDocument } from "../packages/core/src/lib/video-project/document";
import { compileNativeAgentResult } from "../packages/core/src/lib/video-project/agent-runtime";

async function fixture(focusedGraphicsDiscovery: boolean, agentKitVersion = "0.2.10") {
  const document = createVideoProjectDocument({ width: 640, height: 360, fps: 30, durationInFrames: 90 });
  const request = { contract: "video-project-commands" as const, version: 1 as const, baseRevision: 0, baseHash: await hashVideoProjectDocument(document), document, context: { selectedItemIds: [], playheadFrame: 0 } };
  const unused = async () => { throw Error("Schema discovery should not invoke a stage"); };
  const session = createVideoToolset(request, [], [], { profile: "local-editor-v14", agentKitVersion, focusedGraphicsDiscovery,
    stages: { generalEditing: true, preparedCommands: false, planEditStages: unused, saveCaptionBatch: unused, readEditArtifact: unused, resolvePreparedEdit: unused },
  });
  const tool = session.tools.find(tool => tool.name === "inspect_graphics_schema")!;
  return { request, tool, invoke: (args: unknown) => tool.execute(args, new AbortController().signal) };
}

it("returns individually bounded installed feature grammar and executable native examples", async () => {
  const { request, tool, invoke } = await fixture(true);
  expect(tool.parameters).toMatchObject({ properties: { kind: { enum: expect.arrayContaining(["clip", "mask", "effect"]) } } });
  for (const kind of ["clip", "mask", "effect"]) {
    const reply = await invoke({ kind });
    if (reply.kind !== "observation") throw Error("Expected a read-only graphics descriptor");
    expect(Buffer.byteLength(JSON.stringify(reply.value))).toBeLessThan(8192);
    expect(reply.value).toMatchObject({ kind, fields: { [kind]: expect.any(Object) } });
    const value = reply.value as { example: Record<string, unknown> };
    await expect(compileNativeAgentResult(request, { summary: kind, outcome: "proposal", commands: [
      { type: "insertGraphic", itemId: "demo", trackId: "visual", name: kind, node: value.example },
    ] })).resolves.toMatchObject({ outcome: "proposal", proposal: { commands: [{ type: "addItem", item: { id: "demo", node: value.example } }] } });
    if (kind === "mask") {
      expect(value).toMatchObject({ animationTargets: ["mask.opacity", "mask.feather", "mask.radius"] });
      expect(JSON.stringify(value)).not.toContain('"const":"polyline"');
    }
    if (kind === "effect") expect(value).toMatchObject({ requiresAudioAssetId: expect.arrayContaining(["pulseRings"]) });
  }
  await expect(invoke({ kind: "mask", macro: "kineticText" })).rejects.toThrow();
  await expect(invoke({ kind: "shader" })).rejects.toThrow();
  await expect(invoke({ kind: ["mask"] })).rejects.toThrow();
});

it("retains earlier tool schemas and behavior for saved runs without the opt-in and frozen kits", async () => {
  for (const session of [await fixture(false), await fixture(true, "0.2.9"), await fixture(true, "0.2.8")]) {
    expect(session.tool.parameters).toMatchObject({ properties: { kind: { enum: ["native", "macro", "three"] } } });
    await expect(session.invoke({ kind: "clip" })).rejects.toThrow();
  }
});
