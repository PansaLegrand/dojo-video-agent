import { describe, expect, it } from "vitest";
import {
  createVideoProjectDocument,
  hashVideoProjectDocument,
  parseVideoProjectDocument,
} from "../packages/core/src/lib/video-project/document";
import {
  executeVideoProjectCommands,
  rebaseVideoProjectCommands,
  type VideoProjectCommand,
} from "../packages/core/src/lib/video-project/commands";
import {
  prepareNativeAgentReview,
  assertNativeReviewBasis,
} from "../packages/core/src/lib/video-project/agent-review";
import { buildVideoProjectRevertCommands } from "../packages/core/src/lib/video-project/revert";

function fixture() {
  const doc = createVideoProjectDocument({
    width: 1920,
    height: 1080,
    fps: 30,
    durationInFrames: 6221,
  });
  doc.items.push({
    id: "english",
    name: "English",
    trackId: "visual",
    node: {
      id: "english",
      type: "div",
      from: 0,
      duration: 6221,
      style: {
        position: "absolute",
        left: 96,
        top: 788,
        width: 1728,
        height: 238,
        fontFamily: "Inter",
        color: "#ffffff",
        fontSize: 48,
      },
    },
    caption: {
      role: "original",
      language: "en",
      mode: "sentence",
      highlightColor: "#ffff00",
      direction: "ltr",
      cues: [
        { id: "cue:0", text: "Revenue increased.", startMs: 500, endMs: 2000 },
      ],
    },
  });
  const base = parseVideoProjectDocument(doc);
  const commands: VideoProjectCommand[] = [
    { type: "duplicateItem", id: "english", newId: "chinese" },
    {
      type: "set",
      target: { kind: "caption", itemId: "chinese" },
      path: ["cues"],
      value: [{ id: "cue:0", text: "营收增长。", startMs: 500, endMs: 2000 }],
    },
    {
      type: "set",
      target: { kind: "caption", itemId: "chinese" },
      path: ["role"],
      value: "translation",
    },
    {
      type: "set",
      target: { kind: "caption", itemId: "chinese" },
      path: ["language"],
      value: "zh-CN",
    },
    {
      type: "set",
      target: { kind: "caption", itemId: "chinese" },
      path: ["pairedItemId"],
      value: "english",
    },
    {
      type: "set",
      target: { kind: "caption", itemId: "english" },
      path: ["pairedItemId"],
      value: "chinese",
    },
    {
      type: "set",
      target: { kind: "node", itemId: "chinese", nodeId: "chinese" },
      path: ["style", "top"],
      value: 903,
    },
    {
      type: "set",
      target: { kind: "node", itemId: "chinese", nodeId: "chinese" },
      path: ["style", "height"],
      value: 120,
    },
    {
      type: "set",
      target: { kind: "node", itemId: "chinese", nodeId: "chinese" },
      path: ["style", "fontFamily"],
      value: "Noto Sans SC",
    },
  ];
  return { base, commands };
}
const styleEdit = (
  property: string,
  value: number | string,
): VideoProjectCommand => ({
  type: "set",
  target: { kind: "node", itemId: "english", nodeId: "english" },
  path: ["style", property],
  value,
});

describe("saved caption translation application", () => {
  it("aligns an appended translation with its source without extending the video", () => {
    const { base, commands } = fixture();
    const result = rebaseVideoProjectCommands(base, base, commands, {
      captionTranslations: true,
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.document.format.durationInFrames).toBe(6221);
    expect(
      result.document.items.find((item) => item.id === "chinese")?.node.from,
    ).toBe(0);
    expect(
      result.commands.some((command) => command.type === "duplicateItem"),
    ).toBe(false);
    expect(executeVideoProjectCommands(base, result.commands).document).toEqual(
      result.document,
    );
  });

  it("preserves current English styling and keeps both caption boxes visible", async () => {
    const { base, commands } = fixture();
    const current = executeVideoProjectCommands(base, [
      styleEdit("top", 858),
      styleEdit("height", 221),
      styleEdit("left", 0),
      styleEdit("width", 1918),
      styleEdit("color", "#00ff00"),
    ]).document;
    const original = structuredClone(current.items[0]);
    const result = rebaseVideoProjectCommands(base, current, commands, {
      captionTranslations: true,
    });
    if (!result.ok) throw new Error(result.reason);
    const translated = result.document.items.find(
      (item) => item.id === "chinese",
    )!;
    expect(result.document.items[0]?.node).toEqual(original!.node);
    expect(translated.node).toMatchObject({
      from: 0,
      duration: 6221,
      style: {
        color: "#00ff00",
        left: 0,
        width: 1918,
        top: 730,
        height: 120,
        fontFamily: "Noto Sans SC",
      },
    });
    expect(translated.caption?.cues).toEqual([
      { id: "cue:0", text: "营收增长。", startMs: 500, endMs: 2000 },
    ]);
    const input = {
      runId: "translation",
      captionTranslations: true,
      baseDocument: base,
      baseHash: await hashVideoProjectDocument(base),
      proposal: {
        commands,
        summary: "Chinese captions",
        impact: "direct" as const,
        changedItemIds: ["english", "chinese"],
        previewHash: await hashVideoProjectDocument(
          executeVideoProjectCommands(base, commands).document,
        ),
      },
      current: {
        projectId: "project",
        revision: 20,
        documentHash: await hashVideoProjectDocument(current),
        document: current,
        sources: [],
        history: { canUndo: true, canRedo: false },
      },
    };
    const review = await prepareNativeAgentReview(input),
      apply = await prepareNativeAgentReview(input);
    expect(() =>
      assertNativeReviewBasis(review.review.basis, apply.review.basis),
    ).not.toThrow();
    expect(
      review.afterDocument.items.find((item) => item.id === "chinese"),
    ).toEqual({ ...translated, trackId: "track:translation" });
    expect(review.afterDocument.items[0]).toEqual(result.document.items[0]);
    expect(review.afterDocument.format).toEqual(result.document.format);
    const undone = executeVideoProjectCommands(
      review.afterDocument,
      buildVideoProjectRevertCommands(current, review.afterDocument),
    ).document;
    expect(undone.items).toEqual(current.items);
    expect(undone.format).toEqual(current.format);
    expect(undone.evidence).toEqual(current.evidence);
  });

  it("also protects explicit translation insertion against changed source text", () => {
    const { base, commands } = fixture();
    const translated = executeVideoProjectCommands(
      base,
      commands,
    ).document.items.find((item) => item.id === "chinese")!;
    translated.node.from = 0;
    const insert: VideoProjectCommand[] = [
      { type: "addItem", item: translated },
      commands[5]!,
    ];
    const current = executeVideoProjectCommands(base, [
      styleEdit("color", "#00ff00"),
    ]).document;
    const result = rebaseVideoProjectCommands(base, current, insert, {
      captionTranslations: true,
    });
    expect(
      result.ok &&
        result.document.items.find((item) => item.id === "chinese")?.node.style
          ?.color,
    ).toBe("#00ff00");
    const edited = executeVideoProjectCommands(current, [
      {
        type: "set",
        target: { kind: "cue", itemId: "english", cueId: "cue:0" },
        path: ["text"],
        value: "Different wording",
      },
    ]).document;
    expect(
      rebaseVideoProjectCommands(base, edited, insert, {
        captionTranslations: true,
      }).ok,
    ).toBe(false);
  });

  it.each(["text", "startMs"])(
    "rejects source cue %s changes instead of attaching stale translated text",
    (property) => {
      const { base, commands } = fixture();
      const current = executeVideoProjectCommands(base, [
        {
          type: "set",
          target: { kind: "cue", itemId: "english", cueId: "cue:0" },
          path: [property],
          value: property === "text" ? "Revenue decreased." : 600,
        },
      ]).document;
      expect(
        rebaseVideoProjectCommands(base, current, commands, {
          captionTranslations: true,
        }),
      ).toMatchObject({
        ok: false,
        reason: expect.stringContaining("subtitle text or timing changed"),
      });
    },
  );

  it("keeps historical comparisons and exact inverse proposals on their original commands", async () => {
    const { base, commands } = fixture();
    const prior = executeVideoProjectCommands(base, commands).document;
    const comparison = await prepareNativeAgentReview({
      runId: "historical",
      baseDocument: base,
      baseHash: await hashVideoProjectDocument(base),
      organizeTracks: false,
      proposal: {
        commands,
        summary: "Historical translation",
        impact: "direct",
        changedItemIds: ["english", "chinese"],
        previewHash: await hashVideoProjectDocument(prior),
      },
      current: {
        projectId: "project",
        revision: 1,
        documentHash: await hashVideoProjectDocument(base),
        document: base,
        sources: [],
        history: { canUndo: true, canRedo: false },
      },
    });
    expect(comparison.afterDocument).toEqual(prior);
    expect(comparison.review.commands).toEqual(commands);
  });

  it("preserves unrelated timeline extensions", () => {
    const { base, commands } = fixture();
    const current = executeVideoProjectCommands(base, [
      {
        type: "set",
        target: { kind: "format" },
        path: ["durationInFrames"],
        value: 9000,
      },
    ]).document;
    const result = rebaseVideoProjectCommands(base, current, commands, {
      captionTranslations: true,
    });
    expect(result.ok && result.document.format.durationInFrames).toBe(9000);
  });

  it("rejects incompatible custom positioning changes", () => {
    const { base, commands } = fixture();
    const current = executeVideoProjectCommands(base, [
      styleEdit("top", "70%"),
    ]).document;
    expect(
      rebaseVideoProjectCommands(base, current, commands, {
        captionTranslations: true,
      }),
    ).toMatchObject({
      ok: false,
      reason: expect.stringContaining("custom positioning"),
    });
  });

  it("retains ordinary duplication and rejects changed locks or reused translation IDs", () => {
    const { base, commands } = fixture();
    const copy = rebaseVideoProjectCommands(base, base, [commands[0]!]);
    expect(
      copy.ok &&
        copy.document.items.find((item) => item.id === "chinese")?.node.from,
    ).toBe(6221);
    const locked = executeVideoProjectCommands(base, [
      {
        type: "set",
        target: { kind: "track", trackId: "visual" },
        path: ["locked"],
        value: true,
      },
    ]).document;
    expect(
      rebaseVideoProjectCommands(base, locked, commands, {
        captionTranslations: true,
      }).ok,
    ).toBe(false);
    expect(
      copy.ok &&
        rebaseVideoProjectCommands(base, copy.document, commands, {
          captionTranslations: true,
        }).ok,
    ).toBe(false);
  });
});
