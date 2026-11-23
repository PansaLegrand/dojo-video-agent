import { describe, expect, it } from "vitest";
import type { SceneNodeInput } from "@dojo-video-engine/schema";
import {
  createVideoProjectDocument,
  hashVideoProjectDocument,
} from "./document";
import {
  reviewNativeCompletionEdit,
  compileNativeCompletionResponse,
} from "./completion-preflight";

const rect = (left: number, top: number, width: number, height: number) => ({
  position: "absolute" as const,
  left,
  top,
  width,
  height,
});
const card: SceneNodeInput = {
  id: "card",
  type: "div",
  style: { ...rect(20, 80, 350, 100), backgroundColor: "#101010", zIndex: 40 },
};
const subject = (kind: "text" | "img"): SceneNodeInput =>
  kind === "text"
    ? {
        id: "subject",
        type: "text",
        text: "Visible title",
        style: { ...rect(40, 100, 300, 60), fontSize: 30, color: "#ffffff" },
      }
    : {
        id: "subject",
        type: "img",
        assetId: "logo",
        style: rect(40, 100, 300, 60),
      };
async function fixture(
  children: SceneNodeInput[],
  policy: "sampled-v1" | "sampled-v2" = "sampled-v2",
) {
  const document = createVideoProjectDocument({
    width: 640,
    height: 360,
    fps: 30,
    durationInFrames: 90,
  });
  document.assets.logo = {
    id: "logo",
    name: "Logo",
    type: "image",
    source: "local",
  };
  document.sources.logo = { assetId: "logo", revision: "logo-v1" };
  const request = {
    contract: "video-project-commands" as const,
    version: 1 as const,
    baseRevision: 0,
    baseHash: await hashVideoProjectDocument(document),
    document,
    context: { selectedItemIds: [], playheadFrame: 0 },
    authoring: { version: 1 as const, requiredTextLayout: policy },
  };
  const edit = {
    outcome: "proposal",
    summary: "Show the supplied title or logo",
    commands: [
      {
        type: "insertGraphic",
        itemId: "poster",
        name: "Poster",
        trackId: "visual",
        node: {
          type: "div",
          from: 0,
          duration: 90,
          style: rect(0, 0, 640, 360),
          children,
        },
      },
    ],
  };
  const requirements = [
    {
      id: "subject",
      kind: "property",
      target: { kind: "node", itemId: "poster", nodeId: "subject" },
      path: ["id"],
      equals: "subject",
    },
  ];
  const options = { preserveAuthoredPaintOrder: true };
  return {
    request,
    edit,
    requirements,
    options,
    checked: await reviewNativeCompletionEdit(
      request,
      { requirements, edit },
      options,
    ),
  };
}

describe("required content visibility policy", () => {
  it.each(["text", "img"] as const)(
    "rejects a completely covered %s and accepts a layer-order repair",
    async (kind) => {
      const covered = await fixture([subject(kind), card]);
      expect(covered.checked.receipt).toBeUndefined();
      expect(covered.checked.checks).toContainEqual(
        expect.objectContaining({
          id: kind === "img" ? "image-occluded" : "text-occluded",
          passed: false,
          message: expect.stringMatching(/poster.*subject.*frame 10.*card/),
        }),
      );
      const repaired = await fixture([
        { ...subject(kind), style: { ...subject(kind).style, zIndex: 50 } },
        card,
      ]);
      expect(repaired.checked.receipt).toBeDefined();
      await expect(
        compileNativeCompletionResponse(
          repaired.request,
          {
            ...repaired.edit,
            completion: {
              requirements: repaired.requirements,
              receipt: repaired.checked.receipt,
            },
          },
          repaired.options,
        ),
      ).resolves.toMatchObject({ outcome: "proposal" });
    },
  );

  it.each(["text", "img"] as const)(
    "preserves saved v1 %s receipts but cannot reuse them for v2",
    async (kind) => {
      const old = await fixture([subject(kind), card], "sampled-v1");
      expect(old.checked.receipt).toBeDefined();
      const response = {
        ...old.edit,
        completion: {
          requirements: old.requirements,
          receipt: old.checked.receipt,
        },
      };
      await expect(
        compileNativeCompletionResponse(old.request, response, old.options),
      ).resolves.toMatchObject({ outcome: "proposal" });
      await expect(
        compileNativeCompletionResponse(
          {
            ...old.request,
            authoring: { version: 1, requiredTextLayout: "sampled-v2" },
          },
          response,
          old.options,
        ),
      ).rejects.toThrow();
    },
  );

  it("follows nested paint order and rounded backgrounds", async () => {
    const nested: SceneNodeInput = {
      id: "chrome",
      type: "div",
      style: { ...rect(0, 0, 640, 360), zIndex: 40 },
      children: [{ ...card, style: { ...card.style, borderRadius: 16 } }],
    };
    expect(
      (await fixture([subject("img"), nested])).checked.receipt,
    ).toBeUndefined();
    // A box intersection is insufficient when the subject sits in a cut-out corner.
    expect(
      (
        await fixture([
          { ...subject("img"), style: rect(20, 80, 10, 10) },
          nested,
        ])
      ).checked.receipt,
    ).toBeDefined();
  });

  it.each([
    { opacity: 0.5 },
    { backgroundColor: "#10101080" },
    { transform: "rotate(35deg)" },
    { filter: "blur(4px)" },
    { blendMode: "multiply" },
    { left: 200 },
    { zIndex: -1 },
  ])(
    "does not infer total occlusion from uncertain or partial paint: %j",
    async (style) => {
      expect(
        (
          await fixture([
            subject("img"),
            { ...card, style: { ...card.style, ...style } } as SceneNodeInput,
          ])
        ).checked.receipt,
      ).toBeDefined();
    },
  );

  it("honors translucent ancestors and clipped covering descendants", async () => {
    for (const style of [
      { ...rect(0, 0, 640, 360), opacity: 0.5 },
      { ...rect(0, 0, 50, 50), overflow: "hidden" as const },
    ]) {
      expect(
        (
          await fixture([
            subject("img"),
            {
              id: "window",
              type: "div",
              style: { ...style, zIndex: 40 },
              children: [card],
            },
          ])
        ).checked.receipt,
      ).toBeDefined();
    }
  });

  it("allows an intentional reveal with a clear sample", async () => {
    expect(
      (await fixture([subject("img"), { ...card, duration: 15 }])).checked
        .receipt,
    ).toBeDefined();
  });

  it("samples a short image inside parent-local intervals", async () => {
    const children: SceneNodeInput[] = [
      {
        id: "shot",
        type: "div",
        from: 19,
        duration: 12,
        children: [{ ...subject("img"), from: 3, duration: 3 }, card],
      },
    ];
    const result = await fixture(children);
    expect(result.checked.checks).toContainEqual(
      expect.objectContaining({
        id: "image-occluded",
        message: expect.stringContaining("frame 23"),
      }),
    );
  });

  it("leaves unrelated decorative images outside the requirement alone", async () => {
    expect(
      (
        await fixture([
          { ...subject("text"), style: { ...subject("text").style, top: 240 } },
          { ...subject("img"), id: "decoration" },
          card,
        ])
      ).checked.receipt,
    ).toBeDefined();
  });
});
