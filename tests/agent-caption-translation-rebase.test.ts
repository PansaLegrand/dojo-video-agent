import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentService } from "../apps/server/src/agent-service";
import { ProjectStore, snapshot } from "../apps/server/src/store";
import type { VideoProjectCommand } from "../packages/core/src/lib/video-project/commands";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const style = (key: string, value: string | number): VideoProjectCommand => ({
  type: "set",
  target: { kind: "node", itemId: "english", nodeId: "english" },
  path: ["style", key],
  value,
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "harness-translation-"));
  roots.push(root);
  const store = new ProjectStore(root);
  await store.init();
  const created = await store.create();
  await store.commit(created.id, {
    operationId: "setup",
    baseRevision: 0,
    baseHash: created.documentHash,
    commands: [
      { type: "set", target: { kind: "format" }, path: ["width"], value: 1920 },
      {
        type: "set",
        target: { kind: "format" },
        path: ["height"],
        value: 1080,
      },
      {
        type: "set",
        target: { kind: "format" },
        path: ["durationInFrames"],
        value: 300,
      },
      {
        type: "addItem",
        item: {
          id: "english",
          name: "English",
          trackId: "visual",
          node: {
            id: "english",
            type: "div",
            from: 0,
            duration: 300,
            style: {
              position: "absolute",
              left: 96,
              top: 750,
              width: 1728,
              height: 100,
              fontFamily: "Inter",
              fontSize: 48,
              color: "#ffffff",
            },
          },
          caption: {
            role: "original",
            language: "en",
            mode: "sentence",
            highlightColor: "#ffff00",
            direction: "ltr",
            cues: [
              {
                id: "cue:0",
                text: "Revenue increased.",
                startMs: 500,
                endMs: 2000,
              },
            ],
          },
        },
      },
    ],
  });
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
      value: 870,
    },
  ];
  const model = {
    complete: vi.fn(async () => ({
      text: "",
      calls: [
        {
          id: "proposal",
          name: "propose_edit",
          arguments: JSON.stringify({
            summary: "Add Chinese captions",
            commands,
          }),
        },
      ],
    })),
  };
  const service = new AgentService(store, model, []);
  const base = await store.read(created.id);
  const started = await service.start(base.id, {
    operationId: "translation",
    instruction: "Add a Chinese translation of the English captions.",
    baseRevision: base.revision,
    baseHash: base.documentHash,
    scope: { kind: "project" },
    context: { selectedItemIds: [], playheadFrame: 0 },
  });
  expect(started.run).not.toHaveProperty("captionTranslationRebase");
  await vi.waitFor(async () => {
    expect((await store.read(base.id)).runs[0].status).toBe("awaiting_review");
  });
  return { root, store, base, model, service, runId: started.run.id };
}

async function manual(
  store: ProjectStore,
  projectId: string,
  commands: VideoProjectCommand[],
  operationId = "manual",
) {
  const current = await store.read(projectId);
  return store.commit(projectId, {
    operationId,
    baseRevision: current.revision,
    baseHash: current.documentHash,
    commands,
  });
}

it("rebases a new saved translation after restart, guards stale review, then preserves exact Apply and Undo", async () => {
  const { root, store, base, model, runId } = await fixture();
  const initial = (await store.read(base.id)).runs[0];
  expect(initial.captionTranslationRebase).toBe(true);
  const originalProposal = structuredClone(initial.proposal);
  await manual(store, base.id, [style("top", 700), style("color", "#00ff00")]);
  const reopenedStore = new ProjectStore(root);
  const reopened = new AgentService(reopenedStore, model, []);
  const review = await reopened.review(base.id, runId);
  expect(review.afterDocument.format.durationInFrames).toBe(300);
  expect(
    review.afterDocument.items.find((item) => item.id === "chinese")?.node,
  ).toMatchObject({
    from: 0,
    duration: 300,
    style: { top: 820, color: "#00ff00" },
  });
  await manual(
    reopenedStore,
    base.id,
    [style("color", "#ffff00")],
    "later-manual",
  );
  const before = await reopenedStore.read(base.id);
  await expect(
    reopened.apply(base.id, runId, {
      operationId: "stale",
      baseRevision: before.revision,
      baseHash: before.documentHash,
      reviewBasis: review.review.basis,
    }),
  ).rejects.toThrow(/comparison|review/i);
  expect((await reopenedStore.read(base.id)).documentHash).toBe(
    before.documentHash,
  );
  const fresh = await reopened.review(base.id, runId);
  const applied = await reopened.apply(base.id, runId, {
    operationId: "apply",
    baseRevision: before.revision,
    baseHash: before.documentHash,
    reviewBasis: fresh.review.basis,
  });
  const repeated = await reopened.apply(base.id, runId, {
    operationId: "apply",
    baseRevision: before.revision,
    baseHash: before.documentHash,
    reviewBasis: fresh.review.basis,
  });
  expect(repeated).toEqual(applied);
  const historical = await new AgentService(
    new ProjectStore(root),
    model,
    [],
  ).review(base.id, runId);
  expect(historical.afterDocument).toEqual(applied.document);
  expect(historical.beforeDocument).toEqual(before.document);
  expect((await reopenedStore.read(base.id)).runs[0].proposal).toEqual(
    originalProposal,
  );
  await reopened.undo(base.id, runId, {
    operationId: "undo",
    baseRevision: applied.revision,
    baseHash: applied.documentHash,
  });
  const undone = snapshot(await reopenedStore.read(base.id));
  expect(undone.document.items).toEqual(before.document.items);
  expect(undone.document.format).toEqual(before.document.format);
  expect(model.complete).toHaveBeenCalledTimes(1);
});

it("keeps unmarked retained runs and historical comparisons on their original commands", async () => {
  const { store, base, model, service, runId } = await fixture();
  await store.transaction(base.id, (project) => {
    delete project.runs[0].captionTranslationRebase;
  });
  const comparison = await service.review(base.id, runId);
  expect(
    comparison.afterDocument.items.find((item) => item.id === "chinese")?.node
      .from,
  ).toBe(300);
  const applied = await service.apply(base.id, runId, {
    operationId: "legacy-apply",
    baseRevision: base.revision,
    baseHash: base.documentHash,
    reviewBasis: comparison.review.basis,
  });
  expect((await service.review(base.id, runId)).afterDocument).toEqual(
    applied.document,
  );
  expect(model.complete).toHaveBeenCalledTimes(1);
});

it("does not enable normalization while recovering an old unmarked pending run", async () => {
  const { root, store, base, model, runId } = await fixture();
  await store.transaction(base.id, (project) => {
    delete project.runs[0].captionTranslationRebase;
  });
  await manual(store, base.id, [style("color", "#00ff00")]);
  const reopened = new AgentService(new ProjectStore(root), model, []);
  await expect(reopened.review(base.id, runId)).rejects.toThrow(
    /changed properties|timing/,
  );
  expect(model.complete).toHaveBeenCalledTimes(1);
});

it.each(["text", "startMs"])(
  "rejects changed source cue %s without regenerating or modifying the project",
  async (key) => {
    const { store, base, model, service, runId } = await fixture();
    await manual(store, base.id, [
      {
        type: "set",
        target: { kind: "cue", itemId: "english", cueId: "cue:0" },
        path: [key],
        value: key === "text" ? "Revenue decreased." : 600,
      },
    ]);
    const before = await store.read(base.id);
    await expect(service.review(base.id, runId)).rejects.toThrow(
      "subtitle text or timing changed",
    );
    expect((await store.read(base.id)).documentHash).toBe(before.documentHash);
    expect(model.complete).toHaveBeenCalledTimes(1);
  },
);
