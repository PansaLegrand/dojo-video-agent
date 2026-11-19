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
const title: SceneNodeInput = {
  id: "headline",
  type: "text",
  text: "NIGHT\nSHIFT",
  style: {
    ...rect(24, 32, 340, 160),
    fontSize: 52,
    lineHeight: 1.1,
    color: "#f4eacb",
  },
};
const present = [
  { id: "poster-exists", kind: "item_present", itemId: "poster" },
];
const exact = [
  {
    id: "copy",
    kind: "property",
    target: { kind: "node", itemId: "poster", nodeId: "headline" },
    path: ["text"],
    equals: title.text,
  },
];
const cover: SceneNodeInput = {
  id: "ink",
  type: "div",
  style: { ...rect(0, 0, 640, 360), backgroundColor: "#411c32" },
};
async function fixture(
  children: SceneNodeInput[],
  requirements: unknown = present,
) {
  const document = createVideoProjectDocument({
    width: 640,
    height: 360,
    fps: 30,
    durationInFrames: 90,
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
      requiredTextLayout: "sampled-v1" as const,
    },
  };
  const edit = {
    outcome: "proposal",
    summary: "Add a listening-room poster.",
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
  const input = { requirements, edit };
  return {
    request,
    input,
    checked: await reviewNativeCompletionEdit(request, input),
  };
}

describe("readability of required native text", () => {
  it("reports lost copy with its node, frame and content box; replays legacy receipts under their original policy", async () => {
    const { request, input, checked } = await fixture(
      [{ ...title, style: { ...title.style, maxLines: 1 } }],
      exact,
    );
    expect(checked.receipt).toBeUndefined();
    expect(checked.checks).toContainEqual({
      id: "text-overflow",
      passed: false,
      message: expect.stringMatching(
        /poster.*headline.*frame 10.*maxLines.*340, 160/,
      ),
    });
    const old = await reviewNativeCompletionEdit(
      { ...request, authoring: { version: 1 } },
      input,
    );
    expect(old.receipt).toBeDefined();
    await expect(
      compileNativeCompletionResponse(request, {
        ...input.edit,
        completion: { requirements: exact, receipt: old.receipt },
      }),
    ).rejects.toThrow(/receipt/);
    expect((await fixture([title], exact)).checked.receipt).toBeDefined();
  });

  it("uses the padded content height, including wrapped copy without a maxLines limit", async () => {
    const { checked } = await fixture([
      {
        ...title,
        text: "Late sessions from the listening room",
        style: { ...title.style, width: 185, height: 80, padding: 12 },
      },
    ]);
    expect(checked.checks).toContainEqual(
      expect.objectContaining({
        id: "text-overflow",
        message: expect.stringMatching(/lines need .*height.*161, 56/),
      }),
    );
  });

  it("accepts a successful shrink and deliberate truncation for a non-verbatim label", async () => {
    const shrink = {
      ...title,
      style: {
        ...title.style,
        height: 80,
        textFit: "shrink" as const,
        minFontSize: 20,
      },
    };
    const truncate = {
      ...title,
      style: {
        ...title.style,
        textFit: "truncate" as const,
        textOverflow: "ellipsis" as const,
      },
    };
    expect((await fixture([shrink], exact)).checked.receipt).toBeDefined();
    expect((await fixture([truncate])).checked.receipt).toBeDefined();
    expect((await fixture([truncate], exact)).checked.receipt).toBeUndefined();
  });

  it("protects literal copy addressed through a parent or the item node path", async () => {
    const truncated = {
      ...title,
      style: { ...title.style, textFit: "truncate" as const },
    };
    for (const [target, path] of [
      [
        { kind: "item", itemId: "poster" },
        ["node", "children", "headline", "text"],
      ],
      [
        { kind: "node", itemId: "poster", nodeId: "poster" },
        ["children", "headline", "text"],
      ],
    ] as const) {
      const { checked } = await fixture(
        [truncated],
        [{ id: "copy", kind: "property", target, path, equals: title.text }],
      );
      expect(
        checked.checks
          .filter((check) => !check.passed)
          .map((check) => check.id),
      ).toEqual(["text-overflow"]);
    }
  });

  it("identifies a later opaque background in nested paint order and accepts putting it behind the title", async () => {
    const panel: SceneNodeInput = {
      ...cover,
      children: [{ id: "accent", type: "div", style: rect(500, 0, 20, 40) }],
    };
    const { checked } = await fixture([title, panel]);
    expect(checked.checks).toContainEqual(
      expect.objectContaining({
        id: "text-occluded",
        message: expect.stringMatching(/headline.*ink.*paints later/),
      }),
    );
    expect((await fixture([panel, title])).checked.receipt).toBeDefined();
  });

  it("accepts temporary covers, translucent ancestors and covers clipped inside a small viewport", async () => {
    expect(
      (await fixture([title, { ...cover, duration: 15 }])).checked.receipt,
    ).toBeDefined();
    for (const style of [
      { ...rect(0, 0, 640, 360), opacity: 0.6 },
      { ...rect(500, 120, 40, 40), overflow: "hidden" as const },
    ]) {
      expect(
        (
          await fixture([
            title,
            { id: "panel", type: "div", style, children: [cover] },
          ])
        ).checked.receipt,
      ).toBeDefined();
    }
  });

  it("uses transformed line bounds rather than an empty portion of a clipped text box", async () => {
    const window = (width: number): SceneNodeInput => ({
      id: "window",
      type: "div",
      style: { ...rect(24, 0, width, 260), overflow: "hidden" },
      children: [title],
    });
    expect((await fixture([window(40)])).checked.checks).toContainEqual(
      expect.objectContaining({
        id: "text-clipped",
        message: expect.stringMatching(/headline.*line bounds.*window/),
      }),
    );
    expect((await fixture([window(310)])).checked.receipt).toBeDefined();
  });

  it("does not make an unrelated sibling's decorative text a verbatim target", async () => {
    expect(
      (
        await fixture(
          [
            title,
            {
              ...title,
              id: "decoration",
              style: { ...title.style, left: 400, width: 180, maxLines: 1 },
            },
          ],
          exact,
        )
      ).checked.receipt,
    ).toBeDefined();
  });

  it("includes brief parent-local text intervals in bounded review", async () => {
    const group: SceneNodeInput = {
      id: "short-shot",
      type: "div",
      from: 19,
      duration: 12,
      children: [
        {
          ...title,
          from: 3,
          duration: 3,
          style: { ...title.style, maxLines: 1 },
        },
      ],
    };
    expect((await fixture([group])).checked.checks).toContainEqual(
      expect.objectContaining({
        id: "text-overflow",
        message: expect.stringContaining("frame 23"),
      }),
    );
  });
});
