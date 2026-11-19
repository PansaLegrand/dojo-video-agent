import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import {
  ProjectStore,
  commitDocument,
  snapshot,
} from "../apps/server/src/store";
import { AgentService } from "../apps/server/src/agent-service";
import { putLocalEditStageArtifact } from "../apps/server/src/edit-stage-store";
import {
  builtInSkills,
  parseEditArtifactRef,
  parsePreviewRepairClaim,
} from "../packages/agent-kit/src/index";
import {
  createProjectPreviewRequest,
  OUTPUT_PREVIEW_LIMITS,
} from "../packages/core/src/lib/video-project/browser-output-requests";
import { browserHostValueHash } from "../packages/core/src/lib/video-project/browser-host-requests";
import type { LanguageModel, ModelReply } from "../packages/agent/src/types";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

const colorRequirements = [
  {
    id: "title-color",
    kind: "property",
    target: { kind: "node", itemId: "title", nodeId: "title" },
    path: ["style", "color"],
    equals: "#2563eb",
  },
];

const colorEdit = {
  outcome: "proposal",
  summary: "Set title color to blue",
  commands: [
    {
      type: "set",
      target: { kind: "node", itemId: "title", nodeId: "title" },
      path: ["style", "color"],
      value: "#2563eb",
    },
  ],
};

async function createTitleProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dojo-reviewed-recovery-"));
  roots.push(root);
  const store = new ProjectStore(root);
  await store.init();
  const created = await store.create("Reviewed Recovery Test");
  await store.commit(created.id, {
    operationId: "setup-title",
    baseRevision: 0,
    baseHash: created.documentHash,
    commands: [
      {
        type: "addItem",
        item: {
          id: "title",
          name: "Title",
          trackId: "visual",
          node: {
            id: "title",
            type: "text",
            text: "MAKE EVERY FRAME COUNT",
            from: 0,
            duration: 90,
            style: { color: "#ffffff", fontSize: 48 },
          },
        },
      },
    ],
  });
  const project = await store.read(created.id);
  return { root, store, project };
}

async function waitForSettled(
  store: ProjectStore,
  projectId: string,
  runId: string,
) {
  for (let i = 0; i < 300; i++) {
    const project = await store.read(projectId);
    const run = project.runs.find((r) => r.id === runId);
    if (run && !["queued", "running"].includes(run.status))
      return { project, run };
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Run ${runId} did not settle in time`);
}

function scriptedModel(
  steps: Array<() => Promise<ModelReply>>,
  identity = "test/gpt-6-astra",
): { model: LanguageModel; callCount: () => number } {
  let calls = 0;
  return {
    callCount: () => calls,
    model: {
      identity,
      complete: async () => {
        const index = calls++;
        const step = steps[index];
        if (!step) throw new Error(`Unexpected extra model call #${index + 1}`);
        return step();
      },
    },
  };
}

describe("reviewed-edit zero-model-call recovery (local host)", () => {
  it("recovers a direct planning-phase reviewed edit after HTTP 429 with zero extra model calls and prevents double-apply even after Undo", async () => {
    const { store, project } = await createTitleProject();
    const { model, callCount } = scriptedModel([
      async () => ({
        text: "",
        calls: [
          {
            id: "call-review-1",
            name: "review_edit",
            arguments: JSON.stringify({
              requirements: colorRequirements,
              edit: colorEdit,
            }),
          },
        ],
        usage: { inputTokens: 1200, outputTokens: 200 },
      }),
      async () => {
        throw new Error("HTTP 429 Too Many Requests: upstream rate limit");
      },
    ]);
    const agent = new AgentService(
      store,
      model,
      builtInSkills(),
      undefined,
      "direct",
      undefined,
      "local-editor-v14",
    );

    const started = await agent.start(project.id, {
      operationId: "start-direct-429",
      instruction: "Make the title blue",
      baseRevision: project.revision,
      baseHash: project.documentHash,
      scope: { kind: "project" },
      context: { selectedItemIds: ["title"], playheadFrame: 0 },
    });
    const { run: failedRun } = await waitForSettled(
      store,
      project.id,
      started.run.id,
    );
    expect(failedRun.status).toBe("failed");
    expect(failedRun.error?.message).toContain("HTTP 429");
    expect(failedRun.proposal).toBeNull();
    expect(callCount()).toBe(2);

    // Listing exposes recoverableReviewedEdit: true on the failed run.
    const listedBefore = await agent.list(project.id);
    const listedFailed = listedBefore.runs.find((r) => r.id === failedRun.id);
    expect(listedFailed?.recoverableReviewedEdit).toBe(true);

    // Recover with ZERO additional model calls.
    const recoverOp = randomUUID();
    const recovered = await agent.recoverReviewedEdit(
      project.id,
      failedRun.id,
      {
        operationId: recoverOp,
        baseRevision: project.revision,
        baseHash: project.documentHash,
      },
    );
    expect(callCount()).toBe(2);
    expect(recovered.replayed).toBe(false);
    expect(recovered.run.status).toBe("awaiting_review");
    expect(recovered.run.phase).toBe("reviewed_recovery");
    expect(recovered.run.manualReviewRequired).toBe(true);
    expect(recovered.run.recoveredFromRunId).toBe(failedRun.id);
    expect(recovered.run.proposal?.impact).toBe("review");
    expect(recovered.run.proposal?.commands).toEqual(colorEdit.commands);
    expect(recovered.run.proposal?.summary).toBe(colorEdit.summary);
    // Original failed run retains its failure state and error diagnostics.
    expect(recovered.originalRun.status).toBe("failed");
    expect(recovered.originalRun.error?.message).toContain("HTTP 429");

    // Listing no longer offers recovery on the original failed run.
    const listedAfterRecover = await agent.list(project.id);
    expect(
      listedAfterRecover.runs.find((r) => r.id === failedRun.id)
        ?.recoverableReviewedEdit,
    ).toBeUndefined();

    // Replaying with the exact same operationId is idempotent.
    const replayed = await agent.recoverReviewedEdit(project.id, failedRun.id, {
      operationId: recoverOp,
      baseRevision: project.revision,
      baseHash: project.documentHash,
    });
    expect(replayed.replayed).toBe(true);
    expect(replayed.run.id).toBe(recovered.run.id);

    // A different operationId cannot create a second recovery run.
    await expect(
      agent.recoverReviewedEdit(project.id, failedRun.id, {
        operationId: randomUUID(),
        baseRevision: project.revision,
        baseHash: project.documentHash,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "REVIEWED_EDIT_ALREADY_RECOVERED",
    });

    // Review and apply ONCE.
    const comparison = await agent.review(project.id, recovered.run.id);
    expect(comparison.applied).toBe(false);
    expect(
      comparison.afterDocument.items.find((i) => i.id === "title")?.node.style
        ?.color,
    ).toBe("#2563eb");

    const applied = await agent.apply(project.id, recovered.run.id, {
      operationId: randomUUID(),
      baseRevision: project.revision,
      baseHash: project.documentHash,
      reviewBasis: comparison.review.basis,
    });
    expect(applied.revision).toBe(project.revision + 1);
    expect(
      applied.document.items.find((i) => i.id === "title")?.node.style?.color,
    ).toBe("#2563eb");

    // Second apply (even with a brand new operationId) is an idempotent no-op.
    const appliedAgain = await agent.apply(project.id, recovered.run.id, {
      operationId: randomUUID(),
      baseRevision: applied.revision,
      baseHash: applied.documentHash,
      reviewBasis: comparison.review.basis,
    });
    expect(appliedAgain.revision).toBe(applied.revision);

    // Attempting another recovery after apply fails with REVIEWED_EDIT_ALREADY_APPLIED.
    await expect(
      agent.recoverReviewedEdit(project.id, failedRun.id, {
        operationId: randomUUID(),
        baseRevision: applied.revision,
        baseHash: applied.documentHash,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "REVIEWED_EDIT_ALREADY_APPLIED",
    });

    // Undo works cleanly, AND recovery stays blocked after Undo.
    const undone = await agent.undo(project.id, recovered.run.id, {
      operationId: randomUUID(),
      baseRevision: applied.revision,
      baseHash: applied.documentHash,
    });
    expect(undone.revision).toBe(applied.revision + 1);
    expect(
      undone.document.items.find((i) => i.id === "title")?.node.style?.color,
    ).toBe("#ffffff");

    await expect(
      agent.recoverReviewedEdit(project.id, failedRun.id, {
        operationId: randomUUID(),
        baseRevision: undone.revision,
        baseHash: undone.documentHash,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "REVIEWED_EDIT_ALREADY_APPLIED",
    });
    expect(callCount()).toBe(2);
  });

  it("recovers a staged assembly verification artifact after HTTP 429 and blocks resuming the original run", async () => {
    const { store, project } = await createTitleProject();
    const { model, callCount } = scriptedModel([
      // Planning turn: initialize general editing stage plan.
      async () => ({
        text: "",
        calls: [
          {
            id: "call-plan",
            name: "plan_edit_stages",
            arguments: JSON.stringify({
              requirements: colorRequirements,
              captionPairs: [],
            }),
          },
        ],
        usage: { inputTokens: 800, outputTokens: 150 },
      }),
      // Assemble turn 1: review_edit passes and saves immutable verification artifact.
      async () => ({
        text: "",
        calls: [
          {
            id: "call-assemble-review",
            name: "review_edit",
            arguments: JSON.stringify({ edit: colorEdit }),
          },
        ],
        usage: { inputTokens: 900, outputTokens: 200 },
      }),
      // Assemble turn 2: provider rate-limits before propose_edit({reviewed:true}).
      async () => {
        throw new Error("HTTP 429 rate limited before propose_edit");
      },
    ]);
    const agent = new AgentService(
      store,
      model,
      builtInSkills(),
      undefined,
      "direct",
      undefined,
      "local-editor-v14",
    );

    const started = await agent.start(project.id, {
      operationId: "start-staged-429",
      instruction: "Make the title blue in staged mode",
      baseRevision: project.revision,
      baseHash: project.documentHash,
      scope: { kind: "project" },
      context: { selectedItemIds: ["title"], playheadFrame: 0 },
    });
    const { project: afterFail, run: failedRun } = await waitForSettled(
      store,
      project.id,
      started.run.id,
    );
    expect(failedRun.status).toBe("failed");
    expect(
      afterFail.editStagePlans?.[failedRun.id]?.lastReviews?.assemble?.kind,
    ).toBe("verification");
    expect(callCount()).toBe(3);

    const listed = await agent.list(project.id);
    expect(
      listed.runs.find((r) => r.id === failedRun.id)?.recoverableReviewedEdit,
    ).toBe(true);

    const recovered = await agent.recoverReviewedEdit(
      project.id,
      failedRun.id,
      {
        operationId: randomUUID(),
        baseRevision: project.revision,
        baseHash: project.documentHash,
      },
    );
    expect(callCount()).toBe(3);
    expect(recovered.run.status).toBe("awaiting_review");
    expect(recovered.run.recoveredFromRunId).toBe(failedRun.id);

    // Resuming the original failed staged run is now strictly forbidden (no dual proposal!).
    await expect(
      agent.resume(project.id, failedRun.id, {
        operationId: "resume-after-recover",
        baseRevision: project.revision,
        baseHash: project.documentHash,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "REVIEWED_EDIT_ALREADY_RECOVERED",
    });

    const comparison = await agent.review(project.id, recovered.run.id);
    const applied = await agent.apply(project.id, recovered.run.id, {
      operationId: randomUUID(),
      baseRevision: project.revision,
      baseHash: project.documentHash,
      reviewBasis: comparison.review.basis,
    });
    expect(
      applied.document.items.find((i) => i.id === "title")?.node.style?.color,
    ).toBe("#2563eb");
    expect(callCount()).toBe(3);
  });

  it("rebases cleanly over an unrelated manual edit and rejects a conflicting edit without burning the recovery lock", async () => {
    const { store, project } = await createTitleProject();
    const { model } = scriptedModel([
      async () => ({
        text: "",
        calls: [
          {
            id: "call-review",
            name: "review_edit",
            arguments: JSON.stringify({
              requirements: colorRequirements,
              edit: colorEdit,
            }),
          },
        ],
        usage: { inputTokens: 600, outputTokens: 120 },
      }),
      async () => {
        throw new Error("HTTP 429");
      },
    ]);
    const agent = new AgentService(
      store,
      model,
      builtInSkills(),
      undefined,
      "direct",
      undefined,
      "local-editor-v14",
    );
    const started = await agent.start(project.id, {
      operationId: "start-rebase",
      instruction: "Make the title blue",
      baseRevision: project.revision,
      baseHash: project.documentHash,
      scope: { kind: "project" },
      context: { selectedItemIds: ["title"], playheadFrame: 0 },
    });
    const { run: failedRun } = await waitForSettled(
      store,
      project.id,
      started.run.id,
    );

    // First, make a CONFLICTING manual edit (remove the target title item).
    const afterDelete = await store.commit(project.id, {
      operationId: "manual-delete-title",
      baseRevision: project.revision,
      baseHash: project.documentHash,
      commands: [{ type: "removeItem", id: "title" }],
    });
    await expect(
      agent.recoverReviewedEdit(project.id, failedRun.id, {
        operationId: randomUUID(),
        baseRevision: afterDelete.revision,
        baseHash: afterDelete.documentHash,
      }),
    ).rejects.toMatchObject({ status: 409 });

    // Restore the title and add an UNRELATED badge item instead.
    const restored = await store.transaction(project.id, async (p) => {
      const prev = p.past.pop()!;
      await commitDocument(p, prev, false);
      return snapshot(p);
    });
    const withBadge = await store.commit(project.id, {
      operationId: "manual-add-badge",
      baseRevision: restored.revision,
      baseHash: restored.documentHash,
      commands: [
        {
          type: "addItem",
          item: {
            id: "badge",
            name: "Badge",
            trackId: "visual",
            node: {
              id: "badge",
              type: "text",
              text: "NEW",
              from: 100,
              duration: 60,
              style: { color: "#facc15" },
            },
          },
        },
      ],
    });

    // Recovery lock was NOT burned by the rejected conflict, so recovery now succeeds and rebases!
    const recovered = await agent.recoverReviewedEdit(
      project.id,
      failedRun.id,
      {
        operationId: randomUUID(),
        baseRevision: withBadge.revision,
        baseHash: withBadge.documentHash,
      },
    );
    const comparison = await agent.review(project.id, recovered.run.id);
    const applied = await agent.apply(project.id, recovered.run.id, {
      operationId: randomUUID(),
      baseRevision: withBadge.revision,
      baseHash: withBadge.documentHash,
      reviewBasis: comparison.review.basis,
    });
    expect(applied.document.items.some((i) => i.id === "badge")).toBe(true);
    expect(
      applied.document.items.find((i) => i.id === "title")?.node.style?.color,
    ).toBe("#2563eb");
  });

  it("fails closed when a later review_edit fails (invalidating an earlier passing review)", async () => {
    const { store, project } = await createTitleProject();
    const { model } = scriptedModel([
      // Turn 1: passing review_edit
      async () => ({
        text: "",
        calls: [
          {
            id: "call-pass",
            name: "review_edit",
            arguments: JSON.stringify({
              requirements: colorRequirements,
              edit: colorEdit,
            }),
          },
        ],
        usage: { inputTokens: 600, outputTokens: 120 },
      }),
      // Turn 2: subsequent failing review_edit (wrong color)
      async () => ({
        text: "",
        calls: [
          {
            id: "call-fail",
            name: "review_edit",
            arguments: JSON.stringify({
              edit: {
                outcome: "proposal",
                summary: "Broken repair",
                commands: [
                  {
                    type: "set",
                    target: { kind: "node", itemId: "title", nodeId: "title" },
                    path: ["style", "color"],
                    value: "#ef4444",
                  },
                ],
              },
            }),
          },
        ],
        usage: { inputTokens: 700, outputTokens: 120 },
      }),
      // Turn 3: HTTP 429
      async () => {
        throw new Error("HTTP 429");
      },
    ]);
    const agent = new AgentService(
      store,
      model,
      builtInSkills(),
      undefined,
      "direct",
      undefined,
      "local-editor-v14",
    );
    const started = await agent.start(project.id, {
      operationId: "start-invalidated",
      instruction: "Make the title blue",
      baseRevision: project.revision,
      baseHash: project.documentHash,
      scope: { kind: "project" },
      context: { selectedItemIds: ["title"], playheadFrame: 0 },
    });
    const { run: failedRun } = await waitForSettled(
      store,
      project.id,
      started.run.id,
    );
    expect(failedRun.status).toBe("failed");

    const listed = await agent.list(project.id);
    expect(
      listed.runs.find((r) => r.id === failedRun.id)?.recoverableReviewedEdit,
    ).toBeUndefined();
    await expect(
      agent.recoverReviewedEdit(project.id, failedRun.id, {
        operationId: randomUUID(),
        baseRevision: project.revision,
        baseHash: project.documentHash,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "REVIEWED_EDIT_UNAVAILABLE",
    });
  });

  it("fails closed when a staged second review_edit throws validation before updating lastReviews, or when artifact bytes are tampered", async () => {
    const { store, project } = await createTitleProject();
    const { model } = scriptedModel([
      async () => ({
        text: "",
        calls: [
          {
            id: "call-plan",
            name: "plan_edit_stages",
            arguments: JSON.stringify({
              requirements: colorRequirements,
              captionPairs: [],
            }),
          },
        ],
        usage: { inputTokens: 600, outputTokens: 100 },
      }),
      async () => ({
        text: "",
        calls: [
          {
            id: "call-pass",
            name: "review_edit",
            arguments: JSON.stringify({ edit: colorEdit }),
          },
        ],
        usage: { inputTokens: 700, outputTokens: 150 },
      }),
      // Invalid schema edit throws inside review_edit catch block (does not call recordReview!).
      async () => ({
        text: "",
        calls: [
          {
            id: "call-throw",
            name: "review_edit",
            arguments: JSON.stringify({ edit: { outcome: "proposal" } }),
          },
        ],
        usage: { inputTokens: 750, outputTokens: 100 },
      }),
      async () => {
        throw new Error("HTTP 429");
      },
    ]);
    const agent = new AgentService(
      store,
      model,
      builtInSkills(),
      undefined,
      "direct",
      undefined,
      "local-editor-v14",
    );
    const started = await agent.start(project.id, {
      operationId: "start-staged-throw",
      instruction: "Make title blue",
      baseRevision: project.revision,
      baseHash: project.documentHash,
      scope: { kind: "project" },
      context: { selectedItemIds: ["title"], playheadFrame: 0 },
    });
    const { project: afterFail, run: failedRun } = await waitForSettled(
      store,
      project.id,
      started.run.id,
    );
    // Even though lastReviews.assemble still points to the earlier verification ref,
    // checkpoint replay detects the later failed review_edit and fails closed!
    expect(
      afterFail.editStagePlans?.[failedRun.id]?.lastReviews?.assemble?.kind,
    ).toBe("verification");
    const listed = await agent.list(project.id);
    expect(
      listed.runs.find((r) => r.id === failedRun.id)?.recoverableReviewedEdit,
    ).toBeUndefined();
    await expect(
      agent.recoverReviewedEdit(project.id, failedRun.id, {
        operationId: randomUUID(),
        baseRevision: project.revision,
        baseHash: project.documentHash,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "REVIEWED_EDIT_UNAVAILABLE",
    });
  });

  it("fails closed on tampered checkpoint/artifact, cancelled runs, and incomplete preview repairs, and recovers once a second preview receipt exists", async () => {
    const { store, project } = await createTitleProject();
    const { model } = scriptedModel([
      async () => ({
        text: "",
        calls: [
          {
            id: "call-plan",
            name: "plan_edit_stages",
            arguments: JSON.stringify({
              requirements: colorRequirements,
              captionPairs: [],
            }),
          },
        ],
        usage: { inputTokens: 600, outputTokens: 100 },
      }),
      async () => ({
        text: "",
        calls: [
          {
            id: "call-review",
            name: "review_edit",
            arguments: JSON.stringify({ edit: colorEdit }),
          },
        ],
        usage: { inputTokens: 700, outputTokens: 150 },
      }),
      async () => {
        throw new Error("HTTP 429");
      },
    ]);
    const agent = new AgentService(
      store,
      model,
      builtInSkills(),
      undefined,
      "direct",
      undefined,
      "local-editor-v14",
    );
    const started = await agent.start(project.id, {
      operationId: "start-preview-gate",
      instruction: "Make title blue",
      baseRevision: project.revision,
      baseHash: project.documentHash,
      scope: { kind: "project" },
      context: { selectedItemIds: ["title"], playheadFrame: 0 },
    });
    const { run: failedRun } = await waitForSettled(
      store,
      project.id,
      started.run.id,
    );

    // 1. Simulate a claimed preview-repair decision without a second fulfilled preview receipt.
    let repairRefId = "";
    let reviewRef!: ReturnType<typeof parseEditArtifactRef>;
    let renderHash = "";
    await store.transaction(project.id, async (p) => {
      const staged = p.editStagePlans![failedRun.id]!;
      reviewRef = parseEditArtifactRef(staged.lastReviews!.assemble);
      const reviewValue = staged.artifacts[reviewRef.id]!.value as {
        receipt: { previewHash: string; commandsHash: string };
      };
      renderHash = reviewValue.receipt.previewHash;
      const claim = parsePreviewRepairClaim({
        kind: "preview-repair",
        requestId: "preview-1",
        receiptHash: "a".repeat(64),
        issues: [{ frame: 0, description: "Title contrast too dim" }],
        basisRef: reviewRef,
        renderHash,
        commandsHash: reviewValue.receipt.commandsHash,
      });
      const claimRef = await putLocalEditStageArtifact(
        staged,
        "creative-decision",
        claim,
      );
      repairRefId = claimRef.id;
    });

    expect(
      (await agent.list(project.id)).runs.find((r) => r.id === failedRun.id)
        ?.recoverableReviewedEdit,
    ).toBeUndefined();
    await expect(
      agent.recoverReviewedEdit(project.id, failedRun.id, {
        operationId: randomUUID(),
        baseRevision: project.revision,
        baseHash: project.documentHash,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "PREVIEW_REPAIR_INCOMPLETE",
    });

    // 2. Add a valid SECOND fulfilled preview receipt (requestId: "preview-2") -> recovery now succeeds!
    await store.transaction(project.id, (p) => {
      const previewRequest = createProjectPreviewRequest(
        {
          version: 1,
          kind: "project-preview",
          projectId: project.id,
          runId: failedRun.id,
          candidateRef: { ...reviewRef, kind: "verification" },
          renderHash,
          snapshot: {
            revision: project.revision,
            documentHash: project.documentHash,
          },
          format: {
            width: 1280,
            height: 720,
            fps: 30,
            durationInFrames: 180,
            hasAudio: false,
            requireAudibleAudio: false,
          },
          frames: [0],
          limits: OUTPUT_PREVIEW_LIMITS,
        },
        "preview-2",
      );
      const scopeHash = previewRequest.scopeHash;
      const grant = {
        version: 1 as const,
        id: "grant-preview-2",
        scopeHash,
        mode: "cloud-visual-analysis" as const,
        authorizedAt: new Date().toISOString(),
      };
      const rawBytes = Buffer.from([
        255, 216, 255, 192, 0, 17, 8, 0, 180, 1, 64, 3, 1, 17, 0, 2, 17, 0, 3,
        17, 0, 255, 217,
      ]);
      const pixelDataUrl = `data:image/jpeg;base64,${rawBytes.toString("base64")}`;
      p.browserRequests ??= {};
      p.browserRequests[failedRun.id] ??= {};
      p.browserRequests[failedRun.id]!["preview-2"] = {
        kind: "project-preview",
        request: previewRequest,
        status: "fulfilled",
        grant,
        error: null,
        receipt: {
          version: 1,
          kind: "project-preview",
          requestId: previewRequest.id,
          requestHash: browserHostValueHash(previewRequest),
          scopeHash,
          authorizationId: grant.id,
          snapshot: previewRequest.snapshot,
          renderHash,
          engineVersion: "1.2.3",
          frames: [
            {
              frame: 0,
              sceneTimestampUs: 0,
              mimeType: "image/jpeg",
              width: 320,
              height: 180,
              byteLength: rawBytes.byteLength,
              sha256: createHash("sha256").update(rawBytes).digest("hex"),
              dataUrl: pixelDataUrl,
            },
          ],
          coverage: "requested-frames-only",
          semanticCoverage: "unknown",
          audio: "not-inspected",
        },
      };
      expect(repairRefId).toMatch(/^artifact:/);
    });

    expect(
      (await agent.list(project.id)).runs.find((r) => r.id === failedRun.id)
        ?.recoverableReviewedEdit,
    ).toBe(true);

    // 3. Tampering with the verification artifact payload causes fail-closed rejection.
    await store.transaction(project.id, (p) => {
      const staged = p.editStagePlans![failedRun.id]!;
      (
        staged.artifacts[reviewRef.id]!.value as { edit: { summary: string } }
      ).edit.summary = "Tampered summary";
    });
    expect(
      (await agent.list(project.id)).runs.find((r) => r.id === failedRun.id)
        ?.recoverableReviewedEdit,
    ).toBeUndefined();
    await expect(
      agent.recoverReviewedEdit(project.id, failedRun.id, {
        operationId: randomUUID(),
        baseRevision: project.revision,
        baseHash: project.documentHash,
      }),
    ).rejects.toMatchObject({ status: 409 });

    // 4. Cancelled runs are never recoverable.
    await agent.cancel(project.id, failedRun.id);
    await expect(
      agent.recoverReviewedEdit(project.id, failedRun.id, {
        operationId: randomUUID(),
        baseRevision: project.revision,
        baseHash: project.documentHash,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "REVIEWED_EDIT_UNAVAILABLE",
    });
  });

  it("rejects recovery when operationId is reused with different parameters", async () => {
    const { store, project } = await createTitleProject();
    const { model } = scriptedModel([
      async () => ({
        text: "",
        calls: [
          {
            id: "call-review",
            name: "review_edit",
            arguments: JSON.stringify({
              requirements: colorRequirements,
              edit: colorEdit,
            }),
          },
        ],
        usage: { inputTokens: 500, outputTokens: 100 },
      }),
      async () => {
        throw new Error("HTTP 429");
      },
    ]);
    const agent = new AgentService(
      store,
      model,
      builtInSkills(),
      undefined,
      "direct",
      undefined,
      "local-editor-v14",
    );
    const started = await agent.start(project.id, {
      operationId: "start-op-conflict",
      instruction: "Make title blue",
      baseRevision: project.revision,
      baseHash: project.documentHash,
      scope: { kind: "project" },
      context: { selectedItemIds: ["title"], playheadFrame: 0 },
    });
    const { run: failedRun } = await waitForSettled(
      store,
      project.id,
      started.run.id,
    );
    const sharedOp = randomUUID();
    await agent.recoverReviewedEdit(project.id, failedRun.id, {
      operationId: sharedOp,
      baseRevision: project.revision,
      baseHash: project.documentHash,
    });
    await expect(
      agent.recoverReviewedEdit(project.id, failedRun.id, {
        operationId: sharedOp,
        baseRevision: project.revision + 1,
        baseHash: project.documentHash,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "OPERATION_ID_CONFLICT",
    });
  });

  it("supports concurrent duplicate recovery calls safely with zero double-creation", async () => {
    const { store, project } = await createTitleProject();
    const { model } = scriptedModel([
      async () => ({
        text: "",
        calls: [
          {
            id: "call-review",
            name: "review_edit",
            arguments: JSON.stringify({
              requirements: colorRequirements,
              edit: colorEdit,
            }),
          },
        ],
        usage: { inputTokens: 500, outputTokens: 100 },
      }),
      async () => {
        throw new Error("HTTP 429");
      },
    ]);
    const agent = new AgentService(
      store,
      model,
      builtInSkills(),
      undefined,
      "direct",
      undefined,
      "local-editor-v14",
    );
    const started = await agent.start(project.id, {
      operationId: "start-concurrent",
      instruction: "Make title blue",
      baseRevision: project.revision,
      baseHash: project.documentHash,
      scope: { kind: "project" },
      context: { selectedItemIds: ["title"], playheadFrame: 0 },
    });
    const { run: failedRun } = await waitForSettled(
      store,
      project.id,
      started.run.id,
    );

    // Same operationId racing -> both succeed, one created, one replayed, same child ID.
    const sameOp = randomUUID();
    const [a, b] = await Promise.all([
      agent.recoverReviewedEdit(project.id, failedRun.id, {
        operationId: sameOp,
        baseRevision: project.revision,
        baseHash: project.documentHash,
      }),
      agent.recoverReviewedEdit(project.id, failedRun.id, {
        operationId: sameOp,
        baseRevision: project.revision,
        baseHash: project.documentHash,
      }),
    ]);
    expect(a.run.id).toBe(b.run.id);
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
    const persisted = await store.read(project.id);
    expect(
      persisted.runs.filter((r) => r.recoveredFromRunId === failedRun.id),
    ).toHaveLength(1);
  });

  it("recovers cleanly when savedCandidateRef (final-candidate) exists on a failed staged run", async () => {
    const { store, project } = await createTitleProject();
    const { model } = scriptedModel([
      async () => ({
        text: "",
        calls: [
          {
            id: "call-plan",
            name: "plan_edit_stages",
            arguments: JSON.stringify({
              requirements: colorRequirements,
              captionPairs: [],
            }),
          },
        ],
        usage: { inputTokens: 600, outputTokens: 100 },
      }),
      async () => ({
        text: "",
        calls: [
          {
            id: "call-review",
            name: "review_edit",
            arguments: JSON.stringify({ edit: colorEdit }),
          },
        ],
        usage: { inputTokens: 700, outputTokens: 150 },
      }),
      async () => {
        throw new Error("HTTP 429");
      },
    ]);
    const agent = new AgentService(
      store,
      model,
      builtInSkills(),
      undefined,
      "direct",
      undefined,
      "local-editor-v14",
    );
    const started = await agent.start(project.id, {
      operationId: "start-saved-candidate",
      instruction: "Make title blue",
      baseRevision: project.revision,
      baseHash: project.documentHash,
      scope: { kind: "project" },
      context: { selectedItemIds: ["title"], playheadFrame: 0 },
    });
    const { run: failedRun } = await waitForSettled(
      store,
      project.id,
      started.run.id,
    );
    // Promote the verified review into savedCandidateRef as if interrupted right after propose_edit.
    await store.transaction(project.id, async (p) => {
      const staged = p.editStagePlans![failedRun.id]!;
      const reviewRef = staged.lastReviews!.assemble!;
      const review = staged.artifacts[reviewRef.id]!.value as {
        edit: unknown;
        requirements: unknown;
        receipt: unknown;
      };
      staged.savedCandidateRef = await putLocalEditStageArtifact(
        staged,
        "verification",
        {
          kind: "final-candidate",
          edit: review.edit,
          completion: {
            requirements: review.requirements,
            receipt: review.receipt,
          },
        },
      );
    });

    const recovered = await agent.recoverReviewedEdit(
      project.id,
      failedRun.id,
      {
        operationId: randomUUID(),
        baseRevision: project.revision,
        baseHash: project.documentHash,
      },
    );
    expect(recovered.run.status).toBe("awaiting_review");
    expect(recovered.run.proposal?.commands).toEqual(colorEdit.commands);
    const stored = await store.read(project.id);
    expect(
      stored.runs.find((r) => r.id === failedRun.id)?.reviewedEditRecovery
        ?.source,
    ).toBe("stage-candidate");
  });

  it("fails closed when a source media identity changes after failure", async () => {
    const { store, project } = await createTitleProject();
    const { model } = scriptedModel([
      async () => ({
        text: "",
        calls: [
          {
            id: "call-review",
            name: "review_edit",
            arguments: JSON.stringify({
              requirements: colorRequirements,
              edit: colorEdit,
            }),
          },
        ],
        usage: { inputTokens: 500, outputTokens: 100 },
      }),
      async () => {
        throw new Error("HTTP 429");
      },
    ]);
    const agent = new AgentService(
      store,
      model,
      builtInSkills(),
      undefined,
      "direct",
      undefined,
      "local-editor-v14",
    );
    const started = await agent.start(project.id, {
      operationId: "start-source-change",
      instruction: "Make title blue",
      baseRevision: project.revision,
      baseHash: project.documentHash,
      scope: { kind: "project" },
      context: { selectedItemIds: ["title"], playheadFrame: 0 },
    });
    const { run: failedRun } = await waitForSettled(
      store,
      project.id,
      started.run.id,
    );

    // Mutate registered source identity after failure.
    await store.transaction(project.id, async (p) => {
      p.document.assets["new-source"] = {
        id: "new-source",
        name: "Replacement Clip",
        type: "video",
        source: "local",
        durationSeconds: 5,
      };
      p.document.sources["new-source"] = {
        assetId: "new-source",
        revision: "rev-2",
        contentHash: "b".repeat(64),
      };
      await commitDocument(p, p.document);
    });
    const mutated = await store.read(project.id);
    expect(
      (await agent.list(project.id)).runs.find((r) => r.id === failedRun.id)
        ?.recoverableReviewedEdit,
    ).toBeUndefined();
    await expect(
      agent.recoverReviewedEdit(project.id, failedRun.id, {
        operationId: randomUUID(),
        baseRevision: mutated.revision,
        baseHash: mutated.documentHash,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("keeps legacy profiles without completion preflight ineligible and supports retained 0.2.9 runs", async () => {
    const { store, project } = await createTitleProject();
    // Legacy v1 run (no completion preflight) fails cleanly without offering reviewed recovery.
    const { model: failModel } = scriptedModel([
      async () => {
        throw new Error("HTTP 429");
      },
    ]);
    const legacyAgent = new AgentService(
      store,
      failModel,
      [],
      undefined,
      "review",
      undefined,
      "local-editor-v1",
    );
    const legacyStarted = await legacyAgent.start(project.id, {
      operationId: "start-legacy-v1",
      instruction: "Make title blue",
      baseRevision: project.revision,
      baseHash: project.documentHash,
      scope: { kind: "project" },
      context: { selectedItemIds: ["title"], playheadFrame: 0 },
    });
    const { run: legacyFailed } = await waitForSettled(
      store,
      project.id,
      legacyStarted.run.id,
    );
    expect(
      (await legacyAgent.list(project.id)).runs.find(
        (r) => r.id === legacyFailed.id,
      )?.recoverableReviewedEdit,
    ).toBeUndefined();
    await expect(
      legacyAgent.recoverReviewedEdit(project.id, legacyFailed.id, {
        operationId: randomUUID(),
        baseRevision: project.revision,
        baseHash: project.documentHash,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "REVIEWED_EDIT_UNAVAILABLE",
    });

    // Retained 0.2.9 local-editor-v14 run recovers cleanly through its frozen kit build.
    const { model: v29Model } = scriptedModel([
      async () => ({
        text: "",
        calls: [
          {
            id: "call-v29-review",
            name: "review_edit",
            arguments: JSON.stringify({
              requirements: colorRequirements,
              edit: colorEdit,
            }),
          },
        ],
        usage: { inputTokens: 500, outputTokens: 100 },
      }),
      async () => {
        throw new Error("HTTP 429");
      },
    ]);
    const v14Agent = new AgentService(
      store,
      v29Model,
      builtInSkills(),
      undefined,
      "direct",
      undefined,
      "local-editor-v14",
    );
    const started = await v14Agent.start(project.id, {
      operationId: "start-retained-029",
      instruction: "Make title blue",
      baseRevision: project.revision,
      baseHash: project.documentHash,
      scope: { kind: "project" },
      context: { selectedItemIds: ["title"], playheadFrame: 0 },
    });
    const { run: failedRun } = await waitForSettled(
      store,
      project.id,
      started.run.id,
    );
    await store.transaction(project.id, (p) => {
      const target = p.runs.find((r) => r.id === failedRun.id)!;
      target.agentKitVersion = "0.2.9";
    });
    const recovered = await v14Agent.recoverReviewedEdit(
      project.id,
      failedRun.id,
      {
        operationId: randomUUID(),
        baseRevision: project.revision,
        baseHash: project.documentHash,
      },
    );
    expect(recovered.run.status).toBe("awaiting_review");
    expect(recovered.run.proposal?.commands).toEqual(colorEdit.commands);
  });

  it("exposes GET /agent-runs recoverableReviewedEdit and POST /recover-reviewed over the local HTTP API", async () => {
    const { root, store, project } = await createTitleProject();
    const { model } = scriptedModel([
      async () => ({
        text: "",
        calls: [
          {
            id: "call-http-review",
            name: "review_edit",
            arguments: JSON.stringify({
              requirements: colorRequirements,
              edit: colorEdit,
            }),
          },
        ],
        usage: { inputTokens: 500, outputTokens: 100 },
      }),
      async () => {
        throw new Error("HTTP 429");
      },
    ]);
    const agent = new AgentService(
      store,
      model,
      builtInSkills(),
      undefined,
      "direct",
      undefined,
      "local-editor-v14",
    );
    const started = await agent.start(project.id, {
      operationId: "start-http-api",
      instruction: "Make title blue",
      baseRevision: project.revision,
      baseHash: project.documentHash,
      scope: { kind: "project" },
      context: { selectedItemIds: ["title"], playheadFrame: 0 },
    });
    const { run: failedRun } = await waitForSettled(
      store,
      project.id,
      started.run.id,
    );

    const prevDataDir = process.env.DATA_DIR;
    const prevPort = process.env.PORT;
    process.env.DATA_DIR = root;
    process.env.PORT = "4310";
    try {
      const { createLocalApi } = await import("../apps/server/src/local-api");
      const { Readable, PassThrough } = await import("node:stream");
      const api = await createLocalApi();
      async function callApi(method: string, urlPath: string, body?: unknown) {
        const incoming = Readable.from(
          body === undefined ? [] : [Buffer.from(JSON.stringify(body))],
        );
        const req = Object.assign(incoming, {
          method,
          url: urlPath,
          headers: {
            host: "127.0.0.1:4310",
            ...(body === undefined
              ? {}
              : { "content-type": "application/json" }),
          },
        }) as unknown as import("node:http").IncomingMessage;
        const stream = new PassThrough();
        let status = 200;
        const chunks: Buffer[] = [];
        stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        const res = Object.assign(stream, {
          writeHead(code: number) {
            status = code;
            return res;
          },
        }) as unknown as import("node:http").ServerResponse;
        try {
          await api(req, res);
        } catch (cause) {
          const code =
            cause && typeof cause === "object" && "status" in cause
              ? Number(cause.status)
              : cause && typeof cause === "object" && "issues" in cause
                ? 400
                : 500;
          return {
            status: code,
            body: {
              success: false,
              code:
                cause && typeof cause === "object" && "code" in cause
                  ? cause.code
                  : "ERROR",
            },
          };
        }
        return {
          status,
          body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
        };
      }

      const listed = await callApi(
        "GET",
        `/api/projects/${project.id}/agent-runs`,
      );
      expect(listed.status).toBe(200);
      expect(
        listed.body.data.runs.find((r: { id: string }) => r.id === failedRun.id)
          ?.recoverableReviewedEdit,
      ).toBe(true);

      // Malformed payload (extra field) -> 400.
      const bad = await callApi(
        "POST",
        `/api/projects/${project.id}/agent-runs/${failedRun.id}/recover-reviewed`,
        {
          operationId: randomUUID(),
          baseRevision: project.revision,
          baseHash: project.documentHash,
          unexpected: true,
        },
      );
      expect(bad.status).toBe(400);

      // Valid recovery -> 200 with zero model calls.
      const recovered = await callApi(
        "POST",
        `/api/projects/${project.id}/agent-runs/${failedRun.id}/recover-reviewed`,
        {
          operationId: randomUUID(),
          baseRevision: project.revision,
          baseHash: project.documentHash,
        },
      );
      expect(recovered.status).toBe(200);
      expect(recovered.body.data.run.status).toBe("awaiting_review");
      expect(recovered.body.data.run.recoveredFromRunId).toBe(failedRun.id);

      // Second recovery with new operationId -> 409.
      const dup = await callApi(
        "POST",
        `/api/projects/${project.id}/agent-runs/${failedRun.id}/recover-reviewed`,
        {
          operationId: randomUUID(),
          baseRevision: project.revision,
          baseHash: project.documentHash,
        },
      );
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe("REVIEWED_EDIT_ALREADY_RECOVERED");
    } finally {
      if (prevDataDir === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = prevDataDir;
      if (prevPort === undefined) delete process.env.PORT;
      else process.env.PORT = prevPort;
    }
  });
});
