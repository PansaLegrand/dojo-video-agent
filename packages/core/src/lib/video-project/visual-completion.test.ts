import { describe, expect, it } from "vitest";
import type { SceneNodeInput } from "@dojo-video-engine/schema";
import { createVideoProjectDocument } from "./document";
import {
  reviewVisualCompletion,
  rectangleUnionArea,
} from "./visual-completion";
const box = (left: number, top: number, width: number, height: number) => ({
  position: "absolute" as const,
  left,
  top,
  width,
  height,
});
const title: SceneNodeInput = {
  id: "title",
  type: "text",
  text: "Read this title",
  style: { ...box(40, 40, 400, 60), fontSize: 30, color: "#ffffff" },
};
const logo: SceneNodeInput = {
  id: "logo",
  type: "img",
  assetId: "logo",
  style: box(40, 160, 300, 80),
};
const card = (
  id: string,
  left: number,
  top: number,
  width: number,
  height: number,
): SceneNodeInput => ({
  id,
  type: "div",
  style: {
    ...box(left, top, width, height),
    backgroundColor: "#111111",
    zIndex: 40,
  },
});
function fixture(children: SceneNodeInput[], duration = 120) {
  const d = createVideoProjectDocument({
    width: 640,
    height: 360,
    fps: 30,
    durationInFrames: duration,
  });
  d.assets.logo = { id: "logo", type: "image", source: "local", name: "Logo" };
  d.sources.logo = { assetId: "logo", revision: "owned" };
  d.items = [
    {
      id: "poster",
      name: "Poster",
      trackId: "visual",
      node: {
        id: "poster",
        type: "div",
        from: 0,
        duration,
        style: box(0, 0, 640, 360),
        children,
      },
    },
  ];
  return d;
}
const requirements = [
  { id: "poster", kind: "item_present" as const, itemId: "poster" },
];
describe("event-sampled visual completion", () => {
  it("measures rectangle unions without double counting", () => {
    expect(
      rectangleUnionArea([
        { x: 0, y: 0, width: 20, height: 20 },
        { x: 10, y: 0, width: 20, height: 20 },
      ]),
    ).toBe(600);
  });
  it("rejects a partially covered required logo and accepts moving it above the card", () => {
    const hidden = fixture([logo, card("cover", 180, 150, 200, 100)]);
    expect(reviewVisualCompletion(hidden, requirements)).toEqual([
      expect.objectContaining({
        passed: false,
        id: "visual-completion",
        message: expect.stringMatching(/logo.*unobscured/),
      }),
    ]);
    hidden.items[0].node.children![0].style!.zIndex = 50;
    expect(reviewVisualCompletion(hidden, requirements)[0].passed).toBe(true);
  });
  it("evaluates actual text line bounds and rejects a partially hidden headline", () => {
    const failed = reviewVisualCompletion(
      fixture([title, card("cover", 40, 30, 100, 90)]),
      requirements,
    );
    expect(failed[0]).toMatchObject({ passed: false, id: "visual-completion" });
    expect(
      reviewVisualCompletion(
        fixture([title, card("empty-space", 500, 30, 100, 90)]),
        requirements,
      )[0].passed,
    ).toBe(true);
  });
  it("does not count translucent covers as opaque", () => {
    const c = card("glass", 30, 30, 500, 80);
    c.style!.opacity = 0.5;
    expect(
      reviewVisualCompletion(fixture([title, c]), requirements)[0].passed,
    ).toBe(true);
  });
  it("requires a readable hold rather than accepting one clear sample", () => {
    expect(
      reviewVisualCompletion(
        fixture([{ ...title, duration: 6 }]),
        requirements,
      )[0],
    ).toMatchObject({
      passed: false,
      message: expect.stringMatching(/clear hold.*needs/),
    });
    expect(
      reviewVisualCompletion(
        fixture([{ ...title, duration: 90 }]),
        requirements,
      )[0].passed,
    ).toBe(true);
  });
  it("reports required assets outside every rendered sample", () => {
    expect(
      reviewVisualCompletion(
        fixture([{ ...logo, from: 120, duration: 20 }]),
        requirements,
      )[0],
    ).toMatchObject({
      passed: false,
      message: expect.stringMatching(
        /logo.*inactive|logo.*absent|logo.*No active/,
      ),
    });
  });
  it("includes nested boundaries and keyframe neighbors in explicit temporal coverage", () => {
    const nested: SceneNodeInput = {
      id: "shot",
      type: "div",
      from: 11,
      duration: 99,
      children: [
        {
          ...title,
          from: 5,
          duration: 90,
          animations: [
            {
              kind: "keyframes",
              property: "opacity",
              frames: [
                { frame: 0, value: 0 },
                { frame: 13, value: 1 },
              ],
            },
          ],
        },
      ],
    };
    const result = reviewVisualCompletion(fixture([nested]), requirements)[0];
    expect(result.passed).toBe(true);
    expect(result.message).toMatch(/28,29,30/);
  });
  it("never turns sample-budget exhaustion into a visibility pass", () => {
    expect(
      reviewVisualCompletion(fixture([logo], 2000), requirements)[0],
    ).toMatchObject({ passed: false, id: "visual-coverage" });
  });
  it("checks declared speech reading duration and leaves unrequested siblings alone", () => {
    const d = fixture([
      { ...title, duration: 30 },
      { ...logo, id: "decoration", from: 500, duration: 5 },
    ]);
    const r = [
      {
        id: "title",
        kind: "property" as const,
        target: { kind: "node" as const, itemId: "poster", nodeId: "title" },
        path: ["text"],
        equals: "Read this title",
      },
    ];
    expect(reviewVisualCompletion(d, r)[0].passed).toBe(true);
    const speech = [
      {
        id: "quote",
        kind: "speech_callout" as const,
        itemId: "poster",
        bindingId: "speech",
        sourceItemId: "source",
        evidenceId: "asr",
        wordIds: ["word"],
        exactText: "Read this title",
        minReadableMs: 1800,
      },
    ];
    expect(reviewVisualCompletion(d, speech)[0].passed).toBe(false);
  });
});
