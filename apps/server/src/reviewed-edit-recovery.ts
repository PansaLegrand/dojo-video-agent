import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import {
  assertEditStageBinding,
  completionCanonical,
  completionHash,
  mergePreparedAssemblyCommands,
  parseCompletionRequirements,
  parseEditArtifactRef,
  parseEditStagePlan,
  parsePreviewRepairClaim,
  restoreCompletionStateFromMessages,
  usesAppendPreviewRepair,
  usesCompletionPreflight,
  usesDerivedCaptionPlan,
  usesPreviewRepair,
  usesReviewedEditReferences,
  validateCompletionReceipt,
  type AgentProfile,
  type CompletionContract,
  type CompletionReceipt,
  type CompletionRequirement,
  type EditArtifactRef,
  type PreviewRepairClaim,
} from "../../../packages/agent-kit/src/index";
import { parseLoopCheckpoint } from "../../../packages/agent-loop/src/index";
import {
  savedAgentKitVersion,
  sourceRequirementValidation,
} from "../../../packages/agent/src/runtime-build";
import {
  canonicalSerialize,
  hashVideoProjectDocument,
  parseVideoProjectDocument,
  type VideoProjectDocument,
} from "../../../packages/core/src/lib/video-project/document";
import {
  executeVideoProjectCommands,
  type VideoProjectCommand,
} from "../../../packages/core/src/lib/video-project/commands";
import {
  nativeVisualFrameBasis,
  type NativeAgentRequest,
  type NativeAgentResult,
} from "../../../packages/core/src/lib/video-project/agent-runtime";
import {
  checkNativeCompletionRequirements,
  compileNativeCompletionResponse,
} from "../../../packages/core/src/lib/video-project/completion-preflight";
import {
  nativeChangedItemIds,
  NativeReviewConflict,
  prepareNativeAgentReview,
} from "../../../packages/core/src/lib/video-project/agent-review";
import { previewRepairEvidence } from "../../../packages/core/src/lib/video-project/preview-repair-evidence";
import {
  AgentCheckpointConflict,
  readVerifiedAgentLoopCheckpoint,
} from "./agent-loop-checkpoint";
import {
  localEditStageBinding,
  readLocalEditStageArtifact,
  type StoredEditStageState,
} from "./edit-stage-store";
import {
  assertAgentSpeechEvidence,
  type AgentSpeechPort,
} from "./agent-speech";
import type { LocalBrowserRecord } from "./local-browser-requests";
import {
  HttpError,
  message,
  runOf,
  snapshot,
  type Project,
  type StoredRun,
} from "./store";

export type ReviewedEditRecoverySource =
  | "planning-checkpoint"
  | "stage-review"
  | "stage-candidate";

export type ReviewedEditRecoveryReceipt = {
  version: 1;
  childRunId: string;
  operationId: string;
  receiptHash: string;
  source: ReviewedEditRecoverySource;
  recoveredAt: string;
};

export const reviewedEditRecoveryInputSchema = z
  .object({
    operationId: z.string().trim().min(1).max(191),
    baseRevision: z.number().int().nonnegative(),
    baseHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

type ExtractedCandidate = {
  source: ReviewedEditRecoverySource;
  edit: Record<string, unknown>;
  requirements: CompletionRequirement[];
  receipt: CompletionReceipt;
  reviewRef?: EditArtifactRef;
};

const plain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function completionOptionsForRun(run: StoredRun) {
  const profile = (run.agentProfile ?? "local-editor-v1") as AgentProfile;
  return {
    validateSourceRequirements: sourceRequirementValidation(
      profile,
      savedAgentKitVersion(run),
    ),
    preserveAuthoredPaintOrder: [
      "local-editor-v12",
      "local-editor-v13",
      "local-editor-v14",
    ].includes(profile),
    preciseSpeechDiagnostics: ["local-editor-v13", "local-editor-v14"].includes(
      profile,
    ),
    endingVisibility: run.request.authoring?.endingVisibility,
    spatialCanvas: run.request.authoring?.spatialCanvas,
  };
}

async function effectiveRequestForRun(run: StoredRun): Promise<{
  baseDocument: VideoProjectDocument;
  effectiveRequest: NativeAgentRequest;
}> {
  const baseDocument = parseVideoProjectDocument(run.request.document);
  if ((await hashVideoProjectDocument(baseDocument)) !== run.baseHash)
    throw new HttpError(
      "The original run document failed its integrity check.",
      409,
      "REVIEWED_EDIT_INVALID",
    );
  const evidenceCommands = run.speechContinuation?.evidenceCommands ?? [];
  if (!evidenceCommands.length)
    return { baseDocument, effectiveRequest: run.request };
  const prepared = executeVideoProjectCommands(
    baseDocument,
    evidenceCommands,
  ).document;
  return {
    baseDocument,
    effectiveRequest: {
      ...run.request,
      document: prepared,
      baseHash: await hashVideoProjectDocument(prepared),
      visualDocumentHash: run.baseHash,
    },
  };
}

function latestPassingChecksFromMessages(messages: readonly unknown[]): {
  sawReview: boolean;
  passedChecks?: unknown[];
} {
  let latestReviewId: string | undefined;
  let passedChecks: unknown[] | undefined;
  for (const entry of messages) {
    if (!plain(entry)) continue;
    if (entry.role === "assistant" && Array.isArray(entry.tool_calls)) {
      for (const call of entry.tool_calls) {
        if (
          plain(call) &&
          typeof call.id === "string" &&
          plain(call.function) &&
          call.function.name === "review_edit"
        ) {
          latestReviewId = call.id;
          passedChecks = undefined;
        }
      }
    }
    if (
      entry.role !== "tool" ||
      typeof entry.tool_call_id !== "string" ||
      typeof entry.content !== "string" ||
      entry.tool_call_id !== latestReviewId
    )
      continue;
    passedChecks = undefined;
    const parsed = JSON.parse(entry.content);
    const preflight = plain(parsed) ? parsed.completionPreflight : undefined;
    if (
      plain(preflight) &&
      preflight.status === "passed" &&
      Array.isArray(preflight.checks) &&
      preflight.checks.length > 0 &&
      preflight.checks.every((check) => plain(check) && check.passed === true)
    )
      passedChecks = preflight.checks;
  }
  return { sawReview: latestReviewId !== undefined, passedChecks };
}

async function readVerifiedStageReviewArtifact(
  staged: StoredEditStageState,
  ref: EditArtifactRef,
  expectedSnapshotHash: string,
  expectedRequirementsHash: string,
) {
  const parsedRef = parseEditArtifactRef(ref);
  if (parsedRef.kind !== "verification")
    throw new HttpError(
      "The latest saved review did not pass verification.",
      409,
      "REVIEWED_EDIT_UNAVAILABLE",
    );
  const raw = await readLocalEditStageArtifact(staged, parsedRef);
  if (!plain(raw) || raw.kind !== "editing-review" || !plain(raw.edit))
    throw new HttpError(
      "The saved review artifact is invalid.",
      409,
      "REVIEWED_EDIT_INVALID",
    );
  const receipt = await validateCompletionReceipt(raw.receipt);
  const requirements = parseCompletionRequirements(raw.requirements, {
    assetSequence: true,
    speechCallout: true,
  });
  const requirementsHash = await completionHash(requirements);
  if (
    receipt.snapshotHash !== expectedSnapshotHash ||
    requirementsHash !== expectedRequirementsHash ||
    receipt.requirementsHash !== expectedRequirementsHash ||
    !Array.isArray(raw.checks) ||
    !raw.checks.length ||
    raw.checks.some((check) => !plain(check) || check.passed !== true) ||
    receipt.checksHash !== (await completionHash(raw.checks)) ||
    !Array.isArray(raw.edit.commands) ||
    !raw.edit.commands.length ||
    receipt.commandsHash !== (await completionHash(raw.edit.commands))
  )
    throw new HttpError(
      "The saved review artifact failed its verification checks.",
      409,
      "REVIEWED_EDIT_INVALID",
    );
  return {
    ref: parsedRef,
    edit: structuredClone(raw.edit) as Record<string, unknown>,
    requirements,
    receipt,
  };
}

function hasSecondPreviewReceiptLocal(
  project: Project,
  runId: string,
  claim: PreviewRepairClaim,
  receipt: CompletionReceipt,
  reviewRef?: EditArtifactRef,
): boolean {
  const rows = Object.values(project.browserRequests?.[runId] ?? {});
  for (const row of rows) {
    if (row.kind !== "project-preview") continue;
    const preview = row as LocalBrowserRecord;
    if (preview.status !== "fulfilled" || !preview.receipt || !preview.grant)
      continue;
    try {
      const evidence = previewRepairEvidence({
        request: preview.request,
        grant: preview.grant,
        receipt: preview.receipt,
      });
      if (
        evidence.requestId === claim.requestId ||
        evidence.renderHash !== receipt.previewHash
      )
        continue;
      if (reviewRef) {
        if (!evidence.candidateRef) continue;
        if (
          completionCanonical(parseEditArtifactRef(evidence.candidateRef)) !==
          completionCanonical(reviewRef)
        )
          continue;
      }
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

async function extractStagedCandidateLocal(
  project: Project,
  run: StoredRun,
  staged: StoredEditStageState,
  effectiveBaseHash: string,
): Promise<ExtractedCandidate> {
  const profile = (run.agentProfile ?? "local-editor-v1") as AgentProfile;
  const plan = parseEditStagePlan(staged.plan);
  if (plan.status === "cancelled")
    throw new HttpError(
      "Cancelled editing runs cannot recover a reviewed edit.",
      409,
      "REVIEWED_EDIT_UNAVAILABLE",
    );
  await assertEditStageBinding(
    plan,
    await localEditStageBinding(project, run, plan.binding.modelIdentity),
  );
  if (staged.savedCandidateRef) {
    const ref = parseEditArtifactRef(staged.savedCandidateRef);
    if (ref.kind !== "verification")
      throw new HttpError(
        "The saved final candidate is not a verified artifact.",
        409,
        "REVIEWED_EDIT_INVALID",
      );
    const raw = await readLocalEditStageArtifact(staged, ref);
    if (
      !plain(raw) ||
      raw.kind !== "final-candidate" ||
      !plain(raw.edit) ||
      !plain(raw.completion)
    )
      throw new HttpError(
        "The saved final candidate failed its integrity check.",
        409,
        "REVIEWED_EDIT_INVALID",
      );
    const receipt = await validateCompletionReceipt(raw.completion.receipt);
    const requirements = parseCompletionRequirements(
      raw.completion.requirements,
      { assetSequence: true, speechCallout: true },
    );
    if (
      receipt.snapshotHash !== effectiveBaseHash ||
      (await completionHash(requirements)) !== plan.requirementsHash ||
      receipt.requirementsHash !== plan.requirementsHash
    )
      throw new HttpError(
        "The saved final candidate no longer matches its frozen requirements.",
        409,
        "REVIEWED_EDIT_INVALID",
      );
    return {
      source: "stage-candidate",
      edit: structuredClone(raw.edit) as Record<string, unknown>,
      requirements,
      receipt,
      reviewRef: ref,
    };
  }
  const assemble = plan.stages.find((stage) => stage.kind === "assemble");
  if (!assemble)
    throw new HttpError(
      "No verified assembly edit is available for recovery.",
      409,
      "REVIEWED_EDIT_UNAVAILABLE",
    );
  const lastReviewRef = staged.lastReviews?.[assemble.id];
  if (!lastReviewRef || lastReviewRef.kind !== "verification")
    throw new HttpError(
      "No passing reviewed edit is available for recovery.",
      409,
      "REVIEWED_EDIT_UNAVAILABLE",
    );
  let storedRepairClaim: PreviewRepairClaim | undefined;
  for (const entry of Object.values(staged.artifacts)) {
    if (entry.ref.kind !== "creative-decision") continue;
    const value = await readLocalEditStageArtifact(staged, entry.ref);
    if (plain(value) && value.kind === "preview-repair") {
      const claim = parsePreviewRepairClaim(value);
      if (
        claim.basisRef.runId !== run.id ||
        claim.basisRef.bindingHash !== plan.bindingHash
      )
        throw new HttpError(
          "The saved preview correction belongs to another editing basis.",
          409,
          "REVIEWED_EDIT_INVALID",
        );
      storedRepairClaim = claim;
    }
  }
  const attempts = plan.attempts.filter(
    (attempt) => attempt.stageId === assemble.id,
  );
  let latestReceipt: CompletionReceipt | undefined;
  let latestReviewRef: EditArtifactRef | undefined;
  let latestRepairClaim: PreviewRepairClaim | undefined = storedRepairClaim;
  let sawAnyReview = false;
  for (const attempt of attempts) {
    const rawCheckpoint = staged.checkpoints[attempt.id];
    if (!rawCheckpoint)
      throw new HttpError(
        "An assembly checkpoint is missing.",
        409,
        "REVIEWED_EDIT_UNAVAILABLE",
      );
    const checkpoint = parseLoopCheckpoint(rawCheckpoint);
    if (
      checkpoint.snapshot.runId !== `${run.id}:${attempt.id}` ||
      checkpoint.snapshot.snapshotHash !==
        `${plan.binding.baseHash}:${assemble.id}:${attempt.id}` ||
      checkpoint.snapshot.modelIdentity !== plan.binding.modelIdentity ||
      checkpoint.bindingHash !==
        (
          await completionHash({ version: 1, snapshot: checkpoint.snapshot })
        ).slice(7)
    )
      throw new HttpError(
        "The assembly checkpoint binding has changed.",
        409,
        "REVIEWED_EDIT_INVALID",
      );
    const scan = latestPassingChecksFromMessages(checkpoint.messages);
    if (
      attempt === attempts.at(-1) &&
      (!scan.sawReview ||
        !["model-pending", "model-rejected"].includes(checkpoint.phase))
    )
      throw new HttpError(
        "The latest assembly attempt did not stop at a provider fence after a review.",
        409,
        "REVIEWED_EDIT_UNAVAILABLE",
      );
    if (!scan.sawReview) continue;
    sawAnyReview = true;
    const frozen = attempt.inputRef
      ? ((await readLocalEditStageArtifact(staged, attempt.inputRef)) as {
          preparedRef?: EditArtifactRef;
        })
      : undefined;
    const preparedCommands = frozen?.preparedRef
      ? ((
          (await readLocalEditStageArtifact(staged, frozen.preparedRef)) as {
            commands?: unknown[];
          }
        ).commands ?? [])
      : [];
    const resolvePreparedEdit = async (rawEdit: unknown) => {
      if (
        plain(rawEdit) &&
        Object.keys(rawEdit).length === 1 &&
        "reviewRef" in rawEdit
      ) {
        const ref = parseEditArtifactRef(rawEdit.reviewRef);
        const reviewed = await readVerifiedStageReviewArtifact(
          staged,
          ref,
          effectiveBaseHash,
          plan.requirementsHash,
        );
        return reviewed.edit;
      }
      if (!plain(rawEdit) || !Array.isArray(rawEdit.commands))
        throw new Error("Editing requires an explicit command array.");
      return {
        ...rawEdit,
        commands: usesDerivedCaptionPlan(profile)
          ? mergePreparedAssemblyCommands(preparedCommands, rawEdit.commands)
          : [...preparedCommands, ...rawEdit.commands],
      };
    };
    const restored = await restoreCompletionStateFromMessages(
      checkpoint.messages,
      effectiveBaseHash,
      {
        resolvePreparedEdit,
        ...(usesReviewedEditReferences(profile)
          ? { reviewReferences: true as const }
          : {}),
        ...(usesPreviewRepair(profile) ? { previewRepair: true as const } : {}),
        ...(usesAppendPreviewRepair(profile)
          ? { appendPreviewRepair: true as const }
          : {}),
        retainSuccessfulEdit: true,
      },
    );
    if (restored?.previewRepair) latestRepairClaim = restored.previewRepair;
    if (
      !restored?.successfulReceipt ||
      !scan.passedChecks ||
      restored.successfulReceipt.checksHash !==
        (await completionHash(scan.passedChecks))
    ) {
      latestReceipt = undefined;
      latestReviewRef = undefined;
      continue;
    }
    latestReceipt = restored.successfulReceipt;
    latestReviewRef = restored.successfulReviewRef;
  }
  if (!sawAnyReview || !latestReceipt)
    throw new HttpError(
      "The latest review did not pass; no verified edit can be recovered.",
      409,
      "REVIEWED_EDIT_UNAVAILABLE",
    );
  const artifact = await readVerifiedStageReviewArtifact(
    staged,
    lastReviewRef,
    effectiveBaseHash,
    plan.requirementsHash,
  );
  if (
    completionCanonical(artifact.receipt) !==
      completionCanonical(latestReceipt) ||
    (latestReviewRef &&
      completionCanonical(latestReviewRef) !==
        completionCanonical(artifact.ref))
  )
    throw new HttpError(
      "The saved review artifact does not match the latest passing checkpoint review.",
      409,
      "REVIEWED_EDIT_INVALID",
    );
  if (latestRepairClaim) {
    if (artifact.receipt.commandsHash !== latestRepairClaim.commandsHash)
      throw new HttpError(
        "The claimed preview correction does not match the latest passing review.",
        409,
        "PREVIEW_REPAIR_INCOMPLETE",
      );
    if (
      !hasSecondPreviewReceiptLocal(
        project,
        run.id,
        latestRepairClaim,
        artifact.receipt,
        artifact.ref,
      )
    )
      throw new HttpError(
        "The repaired edit requires a second preview inspection before recovery.",
        409,
        "PREVIEW_REPAIR_INCOMPLETE",
      );
  }
  return {
    source: "stage-review",
    edit: artifact.edit,
    requirements: artifact.requirements,
    receipt: artifact.receipt,
    reviewRef: artifact.ref,
  };
}

async function extractDirectCheckpointCandidateLocal(
  project: Project,
  run: StoredRun,
  effectiveBaseHash: string,
): Promise<ExtractedCandidate> {
  const profile = (run.agentProfile ?? "local-editor-v1") as AgentProfile;
  const saved = readVerifiedAgentLoopCheckpoint(project, run);
  if (!saved)
    throw new HttpError(
      "No saved review checkpoint is available for recovery.",
      409,
      "REVIEWED_EDIT_UNAVAILABLE",
    );
  if (!["model-pending", "model-rejected"].includes(saved.checkpoint.phase))
    throw new HttpError(
      "The saved planning turn did not stop at a provider fence after a review.",
      409,
      "REVIEWED_EDIT_UNAVAILABLE",
    );
  if (
    saved.checkpoint.bindingHash !==
    (
      await completionHash({ version: 1, snapshot: saved.checkpoint.snapshot })
    ).slice(7)
  )
    throw new HttpError(
      "The planning checkpoint binding has changed.",
      409,
      "REVIEWED_EDIT_INVALID",
    );
  const scan = latestPassingChecksFromMessages(saved.checkpoint.messages);
  if (!scan.sawReview || !scan.passedChecks)
    throw new HttpError(
      "The latest review did not pass; no verified edit can be recovered.",
      409,
      "REVIEWED_EDIT_UNAVAILABLE",
    );
  const restored = await restoreCompletionStateFromMessages(
    saved.checkpoint.messages,
    effectiveBaseHash,
    {
      ...(usesReviewedEditReferences(profile)
        ? { reviewReferences: true as const }
        : {}),
      ...(usesPreviewRepair(profile) ? { previewRepair: true as const } : {}),
      ...(usesAppendPreviewRepair(profile)
        ? { appendPreviewRepair: true as const }
        : {}),
      retainSuccessfulEdit: true,
    },
  );
  if (restored?.previewRepair)
    throw new HttpError(
      "Preview corrections require a completed staged preview before recovery.",
      409,
      "PREVIEW_REPAIR_INCOMPLETE",
    );
  if (
    !restored?.successfulReceipt ||
    !plain(restored.successfulEdit) ||
    restored.successfulReceipt.checksHash !==
      (await completionHash(scan.passedChecks))
  )
    throw new HttpError(
      "No passing reviewed edit is available for recovery.",
      409,
      "REVIEWED_EDIT_UNAVAILABLE",
    );
  return {
    source: "planning-checkpoint",
    edit: structuredClone(restored.successfulEdit) as Record<string, unknown>,
    requirements: restored.requirements,
    receipt: restored.successfulReceipt,
  };
}

async function compileAndVerifyReviewedCandidateLocal(
  project: Project,
  run: StoredRun,
): Promise<{
  candidate: ExtractedCandidate;
  compiled: NativeAgentResult;
  completion: CompletionContract;
  baseDocument: VideoProjectDocument;
}> {
  if (run.status !== "failed" || run.proposal)
    throw new HttpError(
      "Only an interrupted failed run without an existing proposal can recover a reviewed edit.",
      409,
      "REVIEWED_EDIT_UNAVAILABLE",
    );
  const profile = (run.agentProfile ?? "local-editor-v1") as AgentProfile;
  if (!usesCompletionPreflight(profile))
    throw new HttpError(
      "This run profile does not support reviewed-edit recovery.",
      409,
      "REVIEWED_EDIT_UNAVAILABLE",
    );
  const { baseDocument, effectiveRequest } = await effectiveRequestForRun(run);
  const staged = project.editStagePlans?.[run.id];
  let candidate: ExtractedCandidate;
  let compiled: NativeAgentResult;
  try {
    candidate = staged
      ? await extractStagedCandidateLocal(
          project,
          run,
          staged,
          effectiveRequest.baseHash,
        )
      : await extractDirectCheckpointCandidateLocal(
          project,
          run,
          effectiveRequest.baseHash,
        );
    compiled = await compileNativeCompletionResponse(
      effectiveRequest,
      {
        ...candidate.edit,
        completion: {
          requirements: candidate.requirements,
          receipt: candidate.receipt,
        },
      },
      completionOptionsForRun(run),
    );
  } catch (cause) {
    if (cause instanceof HttpError) throw cause;
    const code =
      cause instanceof AgentCheckpointConflict
        ? cause.code
        : cause &&
            typeof cause === "object" &&
            "code" in cause &&
            typeof cause.code === "string"
          ? cause.code
          : "REVIEWED_EDIT_INVALID";
    throw new HttpError(
      cause instanceof Error
        ? cause.message
        : "The saved reviewed edit failed verification.",
      409,
      code,
    );
  }
  if (
    compiled.outcome !== "proposal" ||
    !compiled.proposal ||
    !compiled.completion ||
    compiled.baseRevision !== run.baseRevision ||
    compiled.baseHash !== effectiveRequest.baseHash ||
    completionCanonical(compiled.completion.receipt) !==
      completionCanonical(candidate.receipt)
  )
    throw new HttpError(
      "The recovered edit failed deterministic host recompilation.",
      409,
      "REVIEWED_EDIT_INVALID",
    );
  return {
    candidate,
    compiled,
    completion: compiled.completion,
    baseDocument,
  };
}

export async function hasRecoverableReviewedEditLocal(
  project: Project,
  run: StoredRun,
): Promise<boolean> {
  if (
    run.status !== "failed" ||
    run.proposal ||
    run.reviewedEditRecovery ||
    project.runs.some((candidate) => candidate.recoveredFromRunId === run.id)
  )
    return false;
  if (
    !usesCompletionPreflight(
      (run.agentProfile ?? "local-editor-v1") as AgentProfile,
    )
  )
    return false;
  if (!project.editStagePlans?.[run.id] && !run.loopCheckpoint) return false;
  try {
    await compileAndVerifyReviewedCandidateLocal(project, run);
    return true;
  } catch {
    return false;
  }
}

export async function recoverReviewedEditInTransactionLocal(
  project: Project,
  originalRunId: string,
  raw: unknown,
  speech?: AgentSpeechPort,
): Promise<{ run: StoredRun; originalRun: StoredRun; replayed: boolean }> {
  const input = reviewedEditRecoveryInputSchema.parse(raw);
  const fingerprint = canonicalSerialize({
    kind: "reviewed-edit-recovery",
    originalRunId,
    ...input,
  });
  const existingByOperation = project.runs.find(
    (candidate) => candidate.operationId === input.operationId,
  );
  if (existingByOperation) {
    if (existingByOperation.requestHash !== fingerprint)
      throw new HttpError(
        "Operation ID belongs to another recovery request.",
        409,
        "OPERATION_ID_CONFLICT",
      );
    const original = runOf(project, originalRunId);
    return { run: existingByOperation, originalRun: original, replayed: true };
  }
  const original = runOf(project, originalRunId);
  const existingChildId =
    original.reviewedEditRecovery?.childRunId ??
    project.runs.find(
      (candidate) => candidate.recoveredFromRunId === original.id,
    )?.id;
  if (existingChildId) {
    const child = project.runs.find(
      (candidate) => candidate.id === existingChildId,
    );
    if (child?.status === "applied")
      throw new HttpError(
        "This reviewed edit has already been applied to the project.",
        409,
        "REVIEWED_EDIT_ALREADY_APPLIED",
      );
    throw new HttpError(
      "This reviewed edit has already been recovered. Review or apply the existing recovered card.",
      409,
      "REVIEWED_EDIT_ALREADY_RECOVERED",
    );
  }
  if (
    project.revision !== input.baseRevision ||
    project.documentHash !== input.baseHash
  )
    throw new HttpError(
      "Save or refresh current edits before recovering this reviewed edit.",
      409,
      "REVISION_CONFLICT",
    );
  if (speech) await assertAgentSpeechEvidence(project, original, speech);
  const { candidate, compiled, completion, baseDocument } =
    await compileAndVerifyReviewedCandidateLocal(project, original);
  if (
    original.context.visualWitness &&
    nativeVisualFrameBasis(baseDocument, original.context.playheadFrame) !==
      nativeVisualFrameBasis(project.document, original.context.playheadFrame)
  )
    throw new HttpError(
      "The preview frame used for this visual request changed. Start a new request.",
      409,
      "VISUAL_CONTEXT_STALE",
    );
  const evidenceCommands: VideoProjectCommand[] =
    original.speechContinuation?.evidenceCommands ?? [];
  const fullCommands: VideoProjectCommand[] = [
    ...evidenceCommands,
    ...compiled.proposal!.commands,
  ];
  const composed = executeVideoProjectCommands(baseDocument, fullCommands);
  const summary = compiled.proposal!.summary;
  const proposal = {
    ...compiled.proposal!,
    commands: fullCommands,
    summary,
    impact: "review" as const,
    previewHash: await hashVideoProjectDocument(composed.document),
    changedItemIds: nativeChangedItemIds(
      baseDocument,
      composed.document,
      composed.changedItemIds,
    ),
  };
  const childId = randomUUID();
  const options = completionOptionsForRun(original);
  // Pre-validate rebaseability and completion checks against the current
  // project BEFORE claiming the single-use recovery lock on the failed run.
  let comparison: Awaited<ReturnType<typeof prepareNativeAgentReview>>;
  try {
    comparison = await prepareNativeAgentReview({
      runId: childId,
      baseDocument,
      baseHash: original.baseHash,
      proposal,
      current: snapshot(project),
      captionTranslations: original.captionTranslationRebase === true,
      organizeTracks: true,
      preserveAuthoredPaintOrder: options.preserveAuthoredPaintOrder,
    });
  } catch (cause) {
    if (cause instanceof NativeReviewConflict)
      throw new HttpError(cause.message, 409, cause.code);
    throw cause;
  }
  const failedChecks = checkNativeCompletionRequirements(
    comparison.beforeDocument,
    comparison.afterDocument,
    completion.requirements,
    options,
  ).filter((check) => !check.passed);
  if (failedChecks.length)
    throw new HttpError(
      failedChecks
        .map((check) => check.message)
        .join(" ")
        .slice(0, 2000),
      409,
      "COMPLETION_PREFLIGHT_FAILED",
    );
  const now = new Date().toISOString();
  const childRun: StoredRun = {
    id: childId,
    operationId: input.operationId,
    status: "awaiting_review",
    phase: "reviewed_recovery",
    instruction: original.instruction,
    cloudConsent: original.cloudConsent,
    baseRevision: original.baseRevision,
    baseHash: original.baseHash,
    context: structuredClone(original.context),
    proposal,
    prerequisites: original.prerequisites
      ? structuredClone(original.prerequisites)
      : null,
    error: null,
    createdAt: now,
    updatedAt: now,
    scope: original.scope ? structuredClone(original.scope) : undefined,
    referenceRunId: original.referenceRunId,
    reviewBasisRequired: true,
    recoveredFromRunId: original.id,
    captionTranslationRebase: original.captionTranslationRebase,
    agentProfile: original.agentProfile,
    agentKitVersion: original.agentKitVersion,
    speechContinuation: original.speechContinuation
      ? structuredClone(original.speechContinuation)
      : undefined,
    completion: structuredClone(completion),
    request: structuredClone(original.request),
    requestHash: fingerprint,
    events: [],
  };
  original.reviewedEditRecovery = {
    version: 1,
    childRunId: childId,
    operationId: input.operationId,
    receiptHash: candidate.receipt.receiptHash,
    source: candidate.source,
    recoveredAt: now,
  };
  if (original.stageRecovery)
    original.stageRecovery = { canResume: false, canReuseSavedResult: false };
  original.updatedAt = now;
  project.runs.push(childRun);
  message(project, childId, "assistant", summary);
  return { run: childRun, originalRun: original, replayed: false };
}
