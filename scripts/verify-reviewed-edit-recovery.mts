import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { AgentService } from "../apps/server/src/agent-service";
import { ProjectStore } from "../apps/server/src/store";

// Rehearse against a separate copy of the historical local qualification store.
const [sourceArg, outArg, projectId, runId, expectedHash] =
  process.argv.slice(2);
if (
  !sourceArg ||
  !outArg ||
  !projectId ||
  !runId ||
  !/^sha256:[a-f0-9]{64}$/.test(expectedHash ?? "")
)
  throw Error(
    "Usage: node --import tsx scripts/verify-reviewed-edit-recovery.mts SAVED_STORE NEW_DIRECTORY PROJECT_ID RUN_ID EXPECTED_REVIEWED_DOCUMENT_HASH",
  );
const source = path.resolve(sourceArg),
  out = path.resolve(outArg);
if (out === source || out.startsWith(source + path.sep))
  throw Error("Use an independent output directory.");
await mkdir(out);
if (
  !(await readdir(path.join(source, "projects"))).includes(projectId + ".json")
)
  throw Error("Expected saved project is missing.");
const originalFile = path.join(source, "projects", projectId + ".json");
const originalHash = () =>
  readFile(originalFile).then((bytes) =>
    createHash("sha256").update(bytes).digest("hex"),
  );
const beforeFileHash = await originalHash();
await mkdir(path.join(out, "store", "projects"), { recursive: true });
await copyFile(
  originalFile,
  path.join(out, "store", "projects", projectId + ".json"),
);
const store = new ProjectStore(path.join(out, "store"));
await store.init();
let modelCalls = 0;
const agent = new AgentService(
  store,
  {
    async complete() {
      modelCalls++;
      throw Error("Provider dispatch is forbidden in this rehearsal.");
    },
  },
  [],
);
const initial = await store.read(projectId);
const parent = initial.runs.find((r) => r.id === runId);
assert.equal(parent?.status, "failed");
const available = (await agent.list(projectId)).runs.find(
  (r) => r.id === runId,
);
assert.equal(available?.recoverableReviewedEdit, true);
const input = {
  operationId: randomUUID(),
  baseRevision: initial.revision,
  baseHash: initial.documentHash,
};
const child = await agent.recoverReviewedEdit(projectId, runId, input);
assert.equal(child.run.status, "awaiting_review");
assert.equal(child.run.manualReviewRequired, true);
assert.equal(child.run.proposal?.previewHash, expectedHash);
assert.equal((await store.read(projectId)).documentHash, initial.documentHash);
const replay = await agent.recoverReviewedEdit(projectId, runId, input);
assert.equal(replay.run.id, child.run.id);
assert.equal(replay.replayed, true);
const compared = await agent.review(projectId, child.run.id);
const apply = {
  ...input,
  operationId: randomUUID(),
  reviewBasis: compared.review.basis,
};
const applied = await agent.apply(projectId, child.run.id, apply);
assert.equal(applied.documentHash, expectedHash);
assert.equal(
  (await agent.apply(projectId, child.run.id, apply)).revision,
  applied.revision,
);
const final = await store.read(projectId);
const retained = final.runs.find((r) => r.id === runId)!;
assert.equal(retained.status, "failed");
assert.deepEqual(retained.error, parent!.error);
assert.deepEqual(retained.loopCheckpoint, parent!.loopCheckpoint);
assert.equal(final.runs.length, initial.runs.length + 1);
assert.equal(final.revision, initial.revision + 1);
assert.equal(modelCalls, 0);
assert.equal(await originalHash(), beforeFileHash);
const report = {
  scope: "offline local recovery, real saved run; original failure retained",
  modelCalls,
  sourceProjectFileHash: beforeFileHash,
  expectedHash,
  recoveredHash: final.documentHash,
  source: retained.reviewedEditRecovery?.source,
  recoveryReceipt: retained.reviewedEditRecovery?.receiptHash,
  revisionDelta: final.revision - initial.revision,
};
await writeFile(
  path.join(out, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
