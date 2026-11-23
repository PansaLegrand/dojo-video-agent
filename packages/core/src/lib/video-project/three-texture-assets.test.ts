import { it, expect } from "vitest";
import {
  createVideoProjectDocument,
  hashVideoProjectDocument,
} from "./document";
import { compileNativeAgentResult } from "./agent-runtime";
const id = "local:" + "a".repeat(64);
async function fixture(type: "image" | "audio" = "image") {
  const document = createVideoProjectDocument({
    width: 960,
    height: 540,
    fps: 30,
    durationInFrames: 120,
  });
  document.assets[id] = { id, type, name: "Imported screen", source: "local" };
  document.sources[id] = {
    assetId: id,
    revision: "sha256:" + "a".repeat(64),
    contentHash: "a".repeat(64),
  };
  return {
    contract: "video-project-commands" as const,
    version: 1 as const,
    baseRevision: 0,
    baseHash: await hashVideoProjectDocument(document),
    document,
    context: { selectedItemIds: [], playheadFrame: 0 },
    authoring: { version: 1 as const, threeAssetIds: "scene-v1" as const },
  };
}
const edit = (mapAssetId = id) => ({
  outcome: "proposal",
  summary: "Use the supplied screen on a real perspective plane",
  commands: [
    {
      type: "insertGraphic",
      itemId: "screen",
      name: "Screen",
      trackId: "visual",
      node: {
        id: "screen",
        type: "extension",
        from: 0,
        duration: 120,
        style: { width: 960, height: 540 },
        extension: {
          name: "dojo.three-scene",
          version: "1.0.0",
          params: {
            camera: {
              kind: "perspective",
              position: { x: 0, y: 0, z: 5 },
              target: { x: 0, y: 0, z: 0 },
            },
            objects: {
              plane: {
                kind: "mesh",
                geometry: { kind: "plane", width: 4, height: 2.25 },
                materialId: "screen",
                rotation: { x: 0, y: -12, z: 0 },
              },
            },
            materials: { screen: { color: "#fff", unlit: true, mapAssetId } },
          },
        },
      },
    },
  ],
});
it("authors an owned content-hash image as a perspective texture without renaming assets", async () => {
  const f = await fixture(),
    before = JSON.stringify(f.document);
  const result = await compileNativeAgentResult(f, edit());
  expect(result.proposal).toBeTruthy();
  expect(JSON.stringify(result.proposal!.commands)).toContain(id);
  expect(JSON.stringify(f.document)).toBe(before);
});
it("still rejects undeclared or wrong-type material image references", async () => {
  await expect(
    compileNativeAgentResult(await fixture(), edit("not-owned")),
  ).rejects.toThrow(/image declared/);
  await expect(
    compileNativeAgentResult(await fixture("audio"), edit()),
  ).rejects.toThrow(/image declared/);
});
