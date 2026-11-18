import { describe, expect, it } from "vitest";
import {
  createVideoProjectDocument,
  hashVideoProjectDocument,
} from "../packages/core/src/lib/video-project/document";
import {
  compileNativeCompletionResponse,
  reviewNativeCompletionEdit,
} from "../packages/core/src/lib/video-project/completion-preflight";
import type { SceneNodeInput } from "@dojo-video-engine/schema";

const box = (left: number, top: number, width: number, height: number) => ({
  position: "absolute" as const,
  left,
  top,
  width,
  height,
});
const requirements = [
  {
    id: "close",
    kind: "appended_ending",
    itemId: "end",
    exactText: "dojo.example",
    minDurationMs: 1000,
    animated: true,
  },
];
type Variant =
  | "readable"
  | "early-exit"
  | "fade"
  | "transparent-ink"
  | "clip"
  | "wipes-open"
  | "cover"
  | "translucent"
  | "cover-behind";
async function fixture(variant: Variant) {
  const document = createVideoProjectDocument({
    width: 640,
    height: 360,
    fps: 30,
    durationInFrames: 30,
  });
  const request = {
    contract: "video-project-commands" as const,
    version: 1 as const,
    baseRevision: 0,
    baseHash: await hashVideoProjectDocument(document),
    document,
    context: { selectedItemIds: [], playheadFrame: 0 },
    authoring: {
      version: 1 as const,
      scope: { kind: "project" as const },
      endingVisibility: "final-frame-v1" as const,
    },
  };
  const title: SceneNodeInput = {
    id: "url",
    type: "text",
    text: "dojo.example",
    from: 0,
    duration: variant === "early-exit" ? 59 : 60,
    style: {
      ...box(variant === "clip" ? 224 : 8, 8, 190, 48),
      fontSize: 29,
      color: "#e7f8d5",
    },
  };
  if (variant === "transparent-ink")
    title.animations = [
      {
        kind: "keyframes",
        property: "color",
        frames: [
          { frame: 58, value: "#e7f8d5" },
          { frame: 59, value: "#e7f8d500" },
        ],
      },
    ];
  const window: SceneNodeInput = {
    id: "window",
    type: "div",
    style: { ...box(32, 106, 212, 70), overflow: "hidden" },
    children: [title],
  };
  if (variant === "wipes-open")
    window.animations = [
      {
        kind: "keyframes",
        property: "width",
        frames: [
          { frame: 0, value: 0 },
          { frame: 45, value: 0 },
          { frame: 58, value: 212 },
        ],
      },
    ];
  const node: SceneNodeInput = {
    id: "end",
    type: "div",
    from: 30,
    duration: 60,
    style: box(0, 0, 640, 360),
    children: [window],
    animations: [
      {
        kind: "keyframes",
        property: "opacity",
        frames: [
          { frame: 0, value: 0.25 },
          { frame: 12, value: 1 },
          ...(variant === "fade"
            ? [
                { frame: 58, value: 1 },
                { frame: 59, value: 0 },
              ]
            : []),
        ],
      },
    ],
  };
  const cover = ["cover", "translucent", "cover-behind"].includes(variant)
    ? [
        {
          type: "insertGraphic",
          itemId: "curtain",
          trackId: "visual",
          name: "Wipe",
          node: {
            id: "curtain",
            type: "div",
            from: 89,
            duration: 1,
            style: {
              ...box(0, 0, 640, 360),
              zIndex: variant === "cover-behind" ? 0 : 500,
              backgroundColor:
                variant === "translucent" ? "#112233bb" : "#112233",
            },
          },
        },
      ]
    : [];
  const edit = {
    outcome: "proposal",
    summary: "Hold the URL at the end",
    commands: [
      {
        type: "set",
        target: { kind: "format" },
        path: ["durationInFrames"],
        value: 90,
      },
      ...(variant === "cover-behind" ? cover : []),
      {
        type: "insertGraphic",
        itemId: "end",
        trackId: "visual",
        name: "Ending",
        node,
      },
      ...(variant === "cover-behind" ? [] : cover),
    ],
  };
  return { request, edit };
}

describe("R28 terminal visibility of a declared ending", () => {
  it("keeps the existing receipt for edits without a declared ending", async () => {
    const { request, edit } = await fixture("early-exit");
    const input = {
      edit,
      requirements: [{ id: "present", kind: "item_present", itemId: "end" }],
    };
    const retained = await reviewNativeCompletionEdit(
      { ...request, authoring: { version: 1 } },
      input,
    );
    const current = await reviewNativeCompletionEdit(request, input);
    expect(retained.receipt).toBeDefined();
    expect(current.receipt).toEqual(retained.receipt);
  });
  it("reserves the last frame inside the existing 24-frame budget", async () => {
    const { request, edit } = await fixture("readable");
    const accents = Array.from({ length: 25 }, (_, index) => ({
      type: "insertGraphic",
      itemId: "accent-" + index,
      trackId: "visual",
      name: "Accent",
      node: {
        id: "accent-" + index,
        type: "div",
        from: index,
        duration: 11,
        style: { ...box(index * 4, 8, 2, 4), backgroundColor: "#776688" },
      },
    }));
    const result = await reviewNativeCompletionEdit(
      request,
      {
        requirements,
        edit: { ...edit, commands: [...edit.commands, ...accents] },
      },
      { preserveAuthoredPaintOrder: true },
    );
    expect(result.receipt, JSON.stringify(result.checks)).toBeDefined();
    expect(
      result.checks.find((check) => check.id === "layout")?.message,
    ).toMatch(/^Checked 24 bounded layout frames: .*?,89\.$/);
  });
  it.each([
    ["early-exit", /url.*final frame 89:.*inactive/],
    ["fade", /url.*final frame 89:.*(opacity|inactive)/],
    ["transparent-ink", /url.*final frame 89:.*transparent/],
    ["clip", /url.*final frame 89:.*window.*\[/],
    ["cover", /url.*final frame 89:.*curtain/],
  ] as const)(
    "rejects %s only for a bound run and rejects an old receipt on replay",
    async (variant, reason) => {
      const { request, edit } = await fixture(variant);
      const oldRequest = {
        ...request,
        authoring: { version: 1 as const, scope: { kind: "project" as const } },
      };
      const retained = await reviewNativeCompletionEdit(
        oldRequest,
        { requirements, edit },
        { preserveAuthoredPaintOrder: true },
      );
      expect(retained.receipt, JSON.stringify(retained.checks)).toBeDefined();
      const result = await reviewNativeCompletionEdit(
        request,
        { requirements, edit },
        { preserveAuthoredPaintOrder: true },
      );
      expect(result.receipt).toBeUndefined();
      expect(
        result.checks.find((check) => check.id === "layout")?.message,
      ).toMatch(reason);
      const payload = {
        ...edit,
        completion: { version: 1, requirements, receipt: retained.receipt },
      };
      await expect(
        compileNativeCompletionResponse(oldRequest, payload, {
          preserveAuthoredPaintOrder: true,
        }),
      ).resolves.toMatchObject({ outcome: "proposal" });
      await expect(
        compileNativeCompletionResponse(request, payload, {
          preserveAuthoredPaintOrder: true,
        }),
      ).rejects.toThrow(/receipt/i);
    },
  );
  it.each(["readable", "wipes-open", "translucent", "cover-behind"] as const)(
    "allows %s and binds the final frame into the receipt",
    async (variant) => {
      const { request, edit } = await fixture(variant);
      const result = await reviewNativeCompletionEdit(
        request,
        { requirements, edit },
        { preserveAuthoredPaintOrder: true },
      );
      expect(result.receipt, JSON.stringify(result.checks)).toBeDefined();
      expect(
        result.checks.find((check) => check.id === "layout")?.message,
      ).toMatch(/,89\./);
      await expect(
        compileNativeCompletionResponse(
          request,
          {
            ...edit,
            completion: { version: 1, requirements, receipt: result.receipt },
          },
          { preserveAuthoredPaintOrder: true },
        ),
      ).resolves.toMatchObject({ outcome: "proposal" });
    },
  );
});
