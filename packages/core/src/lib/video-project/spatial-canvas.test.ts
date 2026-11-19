import { describe, expect, it } from "vitest";
import { createVideoProjectDocument, hashVideoProjectDocument } from "./document";
import { compileNativeCompletionResponse, reviewNativeCompletionEdit } from "./completion-preflight";

const params = {
  camera: { kind: "perspective", position: { x: 0, y: 1, z: 5 }, target: { x: 0, y: 0, z: 0 } },
  materials: { plum: { color: "#904870" } },
  objects: { ball: { kind: "mesh", materialId: "plum", geometry: { kind: "sphere", radius: 1 } } },
};
const mesh = { id: "mesh", type: "extension", extension: { name: "dojo.three-scene", version: "1.0.0", params } };
const requirements = [{ id: "scene-exists", kind: "item_present", itemId: "scene" }];
async function snapshot(populated: boolean, color?: string) {
  const document = createVideoProjectDocument(color ? { backgroundColor: color } : {});
  if (populated) document.items.push({ id: "title", name: "Title", trackId: "visual",
    node: { id: "title", type: "text", text: "Opening", from: 0, duration: 30 } });
  return { contract: "video-project-commands" as const, version: 1 as const, baseRevision: 0,
    baseHash: await hashVideoProjectDocument(document), document, context: { selectedItemIds: [], playheadFrame: 30 },
    authoring: { version: 1 as const, spatialCanvas: "scene-v1" as const } };
}
const scene = { type: "insertGraphic", itemId: "scene", trackId: "visual", name: "Scene",
  node: { type: "div", from: 30, duration: 60, children: [mesh] } };
const setFormat = (key: string, value: unknown) => ({ type: "set", target: { kind: "format" }, path: [key], value });
const edit = (...commands: unknown[]) => ({ outcome: "proposal", summary: "Insert a spatial scene.", commands: [scene, ...commands] });

describe("3D scene canvas preservation", () => {
  it("allows an empty starter background and distinguishes a previously chosen canvas", async () => {
    const input = { requirements, edit: edit(setFormat("backgroundColor", "#29154d")) };
    expect((await reviewNativeCompletionEdit(await snapshot(false), input)).receipt).toBeDefined();
    for (const request of [await snapshot(true), await snapshot(false, "#24354a")]) {
      const review = await reviewNativeCompletionEdit(request, input);
      expect(review.receipt).toBeUndefined();
      expect(review.checks).toContainEqual(expect.objectContaining({ id: "spatial-canvas", passed: false, message: expect.stringContaining("backgroundColor") }));
      const legacy = await reviewNativeCompletionEdit({ ...request, authoring: { version: 1 } }, input);
      expect(legacy.receipt).toBeDefined();
      await expect(compileNativeCompletionResponse(request, { ...input.edit, completion: { requirements, receipt: legacy.receipt } })).rejects.toThrow(/receipt/);
    }
  });

  it.each([["width", 640], ["height", 360], ["fps", 24]] as const)("requires a declared project-wide %s change even on a starter", async (field, value) => {
    const request = await snapshot(false), proposal = edit(setFormat(field, value));
    expect((await reviewNativeCompletionEdit(request, { requirements, edit: proposal })).receipt).toBeUndefined();
    const explicit = [...requirements, { id: "format", kind: "property", target: { kind: "format" }, path: [field], equals: value }];
    expect((await reviewNativeCompletionEdit(request, { requirements: explicit, edit: proposal })).receipt).toBeDefined();
  });

  it("accepts a timed backdrop on an existing timeline without a global write", async () => {
    const request = await snapshot(true, "#24354a");
    const review = await reviewNativeCompletionEdit(request, { requirements, edit: edit({
      type: "insertGraphic", itemId: "plum", trackId: "visual", name: "Plum",
      node: { type: "div", from: 30, duration: 60, style: { inset: 0, position: "absolute", backgroundColor: "#29154d" } },
    }) });
    expect(review.receipt).toBeDefined();
    expect(review.result.proposal!.commands).not.toContainEqual(expect.objectContaining({ target: { kind: "format" } }));
  });
});
