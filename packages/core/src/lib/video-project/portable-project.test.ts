import { describe, expect, it } from "vitest";
import { createVideoProjectDocument, canonicalSerialize } from "./document";
import { executeVideoProjectCommands } from "./commands";
import {
  createPortableProject,
  readPortableProject,
  portableProjectCommands,
} from "./portable-project";
function fixture() {
  const d = createVideoProjectDocument({
    width: 640,
    height: 360,
    fps: 30,
    durationInFrames: 90,
  });
  d.assets.logo = {
    id: "logo",
    name: "logo.png",
    type: "image",
    source: "project",
    assetId: "private-cloud-id",
  };
  d.sources.logo = { assetId: "logo", revision: "cloud-owned" };
  d.creativeContext.brandKit = { name: "Studio", logoAssetId: "logo" };
  d.items = [
    {
      id: "graphic",
      name: "Graphic",
      trackId: "visual",
      node: {
        id: "graphic",
        type: "img",
        assetId: "logo",
        from: 0,
        duration: 90,
        style: { width: 100, height: 100 },
      },
    },
  ];
  d.metadata = { privateJobId: "never-export" };
  return d;
}
const bytes = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });
async function bundle() {
  return createPortableProject({
    document: fixture(),
    name: "Test",
    readAsset: async () => bytes,
  });
}
describe("portable editable project", () => {
  it("round-trips media, identity remapping and editable composition through ordinary commands", async () => {
    const file = await bundle(),
      read = await readPortableProject(file),
      d = read.manifest.document,
      id = Object.keys(d.assets)[0];
    expect(read.files.size).toBe(1);
    expect([
      ...new Uint8Array(await read.files.get(id)!.arrayBuffer()),
    ]).toEqual([1, 2, 3, 4]);
    expect(d.items[0].node.assetId).toBe(id);
    expect(d.creativeContext.brandKit?.logoAssetId).toBe(id);
    expect(d.assets[id]).not.toHaveProperty("assetId");
    expect(d.metadata).toEqual({});
    const blank = createVideoProjectDocument();
    expect(
      canonicalSerialize(
        executeVideoProjectCommands(blank, portableProjectCommands(blank, d))
          .document,
      ),
    ).toBe(canonicalSerialize(d));
    expect(() => portableProjectCommands(fixture(), d)).toThrow(
      /empty project/,
    );
    expect(await file.text()).not.toContain("private-cloud-id");
    expect(await file.text()).not.toContain("never-export");
  });
  it("rejects corrupt, truncated and trailing bytes before returning an import", async () => {
    const file = await bundle(),
      raw = new Uint8Array(await file.arrayBuffer());
    raw[raw.length - 1] ^= 1;
    await expect(readPortableProject(new Blob([raw]))).rejects.toThrow(
      /Checksum/,
    );
    await expect(
      readPortableProject(file.slice(0, file.size - 1)),
    ).rejects.toThrow(/truncated/);
    await expect(
      readPortableProject(new Blob([file, "extra"])),
    ).rejects.toThrow(/extra/);
    await expect(
      readPortableProject(new Blob(["not a package"])),
    ).rejects.toThrow();
  });
  it("does not accept a different file for an existing immutable source", async () => {
    const d = fixture();
    d.sources.logo.contentHash = "a".repeat(64);
    await expect(
      createPortableProject({
        document: d,
        name: "Mismatch",
        readAsset: async () => bytes,
      }),
    ).rejects.toThrow(/fingerprint/);
  });
  it("deduplicates identical owned media while remapping all references", async () => {
    const d = fixture();
    d.assets.copy = { ...d.assets.logo, id: "copy", name: "copy.png" };
    d.sources.copy = { assetId: "copy", revision: "owned" };
    d.items.push({
      ...d.items[0],
      id: "copy",
      node: { ...d.items[0].node, id: "copy", assetId: "copy" },
    });
    const file = await createPortableProject({
      document: d,
      name: "Copies",
      readAsset: async () => bytes,
    });
    const read = await readPortableProject(file);
    expect(read.files.size).toBe(1);
    expect(read.manifest.document.items[0].node.assetId).toBe(
      read.manifest.document.items[1].node.assetId,
    );
  });
  it("honors cancellation without producing partial imports", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      readPortableProject(await bundle(), controller.signal),
    ).rejects.toThrow();
  });
  it("retains caption display and layer locks without importing ASR authority", async () => {
    const d = createVideoProjectDocument({
      width: 640,
      height: 360,
      fps: 30,
      durationInFrames: 90,
    });
    d.tracks[0].locked = true;
    d.items = [
      {
        id: "caption",
        name: "Captions",
        trackId: "visual",
        node: { id: "caption", type: "div", from: 0, duration: 90 },
        caption: {
          mode: "sentence",
          highlightColor: "#ffffff",
          direction: "ltr",
          cues: [
            { id: "cue", text: "Keep this text", startMs: 0, endMs: 3000 },
          ],
        },
      },
    ];
    const read = await readPortableProject(
      await createPortableProject({
        document: d,
        name: "Captions",
        readAsset: async () => {
          throw Error("No files");
        },
      }),
    );
    const blank = createVideoProjectDocument();
    expect(
      executeVideoProjectCommands(
        blank,
        portableProjectCommands(blank, read.manifest.document),
      ).document.items[0].caption?.cues[0].text,
    ).toBe("Keep this text");
  });
});

it("requires self-contained non-executable Lottie payloads", async () => {
  for (const data of [
    { assets: [{ p: "missing-image.png" }] },
    { layers: [{ ks: { x: "execute()" } }] },
  ]) {
    const d = createVideoProjectDocument();
    d.assets.animation = {
      id: "animation",
      name: "Animation",
      source: "local",
      type: "lottie",
    };
    d.sources.animation = { assetId: "animation", revision: "local" };
    await expect(
      createPortableProject({
        document: d,
        name: "Lottie",
        readAsset: async () => new Blob([JSON.stringify(data)]),
      }),
    ).rejects.toThrow(/Lottie/);
  }
});

it("round-trips a textured perspective plane with content IDs while retaining internal material IDs", async () => {
  const d = fixture();
  const three = {
    camera: {
      kind: "perspective",
      position: { x: 0, y: 0, z: 5 },
      target: { x: 0, y: 0, z: 0 },
    },
    materials: { logo: { color: "white", unlit: true, mapAssetId: "logo" } },
    objects: {
      card: {
        kind: "mesh",
        materialId: "logo",
        geometry: { kind: "plane", width: 4, height: 2.25 },
      },
    },
  };
  d.items = [
    {
      id: "three",
      name: "Screen",
      trackId: "visual",
      node: {
        id: "three",
        type: "extension",
        from: 0,
        duration: 90,
        style: { width: 640, height: 360 },
        extension: {
          name: "dojo.three-scene",
          version: "1.0.0",
          params: three,
        },
      },
    },
  ];
  const packaged = await readPortableProject(
    await createPortableProject({
      document: d,
      name: "3D package",
      readAsset: async () => bytes,
    }),
  );
  const restored = packaged.manifest.document,
    id = Object.keys(restored.assets)[0]!;
  const params = restored.items[0]!.node.extension!.params as typeof three;
  expect(id).toMatch(/^local:[a-f0-9]{64}$/);
  expect(params.materials.logo.mapAssetId).toBe(id);
  expect(params.objects.card.materialId).toBe("logo");
  const blank = createVideoProjectDocument();
  expect(
    canonicalSerialize(
      executeVideoProjectCommands(
        blank,
        portableProjectCommands(blank, restored),
      ).document,
    ),
  ).toBe(canonicalSerialize(restored));
});
