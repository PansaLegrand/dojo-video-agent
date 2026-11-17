import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import type { Scene } from "@dojo-video-engine/schema";
import type { LanguageModel, ModelReply } from "../../packages/agent/src/types";
import { AgentService } from "../../apps/server/src/agent-service";
import {
  ProjectStore,
  commitDocument,
  type StoredRun,
} from "../../apps/server/src/store";
import { loadLocalSkills } from "../../apps/server/src/skill-loader";
import {
  canonicalSerialize,
  type VideoProjectDocument,
} from "../../packages/core/src/lib/video-project/document";
import { compileVideoProjectDocument } from "../../packages/core/src/lib/video-project/compilation";
import { EvaluationBudget, EvaluationAdmissionError } from "./request-budget";
import { redactEvidence } from "./evidence";
import type { CreativeScenario } from "./creative-scenarios";

export type CreativeHost = "open-source" | "commercial-web";
export type CreativeHistory = Array<{
  role: "user" | "assistant";
  text: string;
}>;
export type CreativeTurnResult = {
  result: {
    outcome: "edit" | "question" | "advice";
    question?: string;
    summary: string;
    reviewed: boolean;
    native?: unknown;
  };
  document: VideoProjectDocument;
  scene: Scene;
  history: CreativeHistory;
  events?: unknown;
  toolRecords?: unknown;
  usage?: unknown;
  inventories?: unknown;
};
export type CreativeWebAdapter = {
  assertCreativeWebReady: () => void | Promise<void>;
  runCreativeWebTurn(input: {
    document: VideoProjectDocument;
    instruction: string;
    history: CreativeHistory;
    model: LanguageModel;
    signal: AbortSignal;
    outputDir?: string;
  }): Promise<CreativeTurnResult>;
};
export type CreativeRequestContext = {
  host: CreativeHost;
  scenario: string;
  repetition: number;
  turn: number;
};
export type CreativeRequestRecord = CreativeRequestContext & {
  ordinal: number;
  phase: "dispatching" | "completed" | "unknown" | "not-dispatched";
  requestFile: string;
  responseFile?: string;
  error?: string;
};

export async function atomicReport(
  file: string,
  value: unknown,
): Promise<void> {
  await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  await rename(`${file}.tmp`, file);
}
export async function writeCreativeArtifact(
  directory: string,
  name: string,
  value: unknown,
): Promise<{ file: string; sha256: string }> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const data = JSON.stringify(value, null, 2) + "\n";
  const file = path.join(directory, name);
  await writeFile(file, data, { flag: "wx", mode: 0o600 });
  return { file, sha256: createHash("sha256").update(data).digest("hex") };
}

/** One instance owns admission across every host, case and repetition. */
export function createCreativeCampaignModel(options: {
  transport: LanguageModel;
  budget: EvaluationBudget;
  requests: CreativeRequestRecord[];
  directory: string;
  context: () => CreativeRequestContext;
  sourceUnchanged: () => Promise<boolean>;
  persist: () => Promise<void>;
  signal?: AbortSignal;
  secrets?: string[];
}) {
  let stoppedReason: string | null = null;
  let busy = false;
  const cleanError = (cause: unknown) =>
    String(
      redactEvidence(
        cause instanceof Error ? cause.message : String(cause),
        options.secrets,
      ),
    ).slice(0, 2000);
  const sourceIsUnchanged = async () => {
    try {
      return await options.sourceUnchanged();
    } catch {
      return false;
    }
  };
  const stop = async (message: string): Promise<never> => {
    stoppedReason ??= message;
    await options.persist();
    throw new EvaluationAdmissionError(stoppedReason);
  };
  const model: LanguageModel = {
    identity: options.transport.identity,
    async complete(messages, tools, signal, limits): Promise<ModelReply> {
      if (stoppedReason) throw new EvaluationAdmissionError(stoppedReason);
      if (busy)
        return stop(
          "Concurrent creative-evaluation model calls are not permitted.",
        );
      busy = true;
      try {
        if (options.signal?.aborted || signal.aborted)
          return stop("Creative evaluation was cancelled before admission.");
        if (!(await sourceIsUnchanged()))
          return stop(
            "Candidate source changed; no further model request was dispatched.",
          );
        const maximumOutputTokens = Math.min(
          8192,
          limits?.maxOutputTokens ?? 8192,
        );
        if (
          !Number.isSafeInteger(maximumOutputTokens) ||
          maximumOutputTokens < 1
        )
          return stop(
            "No positive output allowance remains; stopped before admission.",
          );
        let admitted;
        try {
          admitted = options.budget.admit(
            Buffer.byteLength(JSON.stringify({ messages, tools })),
            maximumOutputTokens,
          );
        } catch (cause) {
          return stop(cleanError(cause));
        }
        const record: CreativeRequestRecord = {
          ...options.context(),
          ordinal: admitted.ordinal,
          phase: "dispatching",
          requestFile: `requests/${String(admitted.ordinal).padStart(4, "0")}.request.json`,
        };
        options.requests.push(record);
        // Persist a redacted normalized request and its reservation BEFORE dispatch.
        // Opaque reasoning/providerOutput is deliberately excluded from review artifacts.
        try {
          await writeCreativeArtifact(
            path.dirname(path.join(options.directory, record.requestFile)),
            path.basename(record.requestFile),
            redactEvidence(
              {
                context: options.context(),
                messages,
                tools,
                limits: { ...limits, maxOutputTokens: maximumOutputTokens },
              },
              options.secrets,
            ),
          );
          await options.persist();
        } catch (cause) {
          // No transport call can precede this awaited admission fence. Record
          // known non-dispatch explicitly, rather than inventing uncertain spend.
          record.phase = "not-dispatched";
          options.budget.settle(admitted, { inputTokens: 0, outputTokens: 0 });
          record.error = cleanError(cause);
          return stop(
            "Could not persist evaluation admission; stopped before provider dispatch.",
          );
        }
        let reply: ModelReply;
        try {
          reply = await options.transport.complete(
            messages,
            tools,
            options.signal ? AbortSignal.any([signal, options.signal]) : signal,
            { ...limits, maxOutputTokens: maximumOutputTokens },
          );
        } catch (cause) {
          options.budget.settle(admitted);
          record.phase = "unknown";
          record.error = cleanError(cause);
          stoppedReason =
            "Provider/transport failure or uncertain usage; campaign stopped without retry.";
          await options.persist();
          throw cause;
        }
        // A complete but semantically invalid response is still a paid result.
        // Its caller may use ordinary validation feedback under the remaining allowance.
        options.budget.settle(admitted, reply.usage);
        record.phase =
          admitted.status === "completed" ? "completed" : "unknown";
        const responseFile = `requests/${String(admitted.ordinal).padStart(4, "0")}.response.json`;
        try {
          await writeCreativeArtifact(
            path.dirname(path.join(options.directory, responseFile)),
            path.basename(responseFile),
            {
              ...(redactEvidence(
                { text: reply.text, calls: reply.calls },
                options.secrets,
              ) as Record<string, unknown>),
              usage: reply.usage
                ? {
                    input: reply.usage.inputTokens,
                    output: reply.usage.outputTokens,
                  }
                : null,
              outputLimit: reply.outputTokenLimit ?? maximumOutputTokens,
            },
          );
          record.responseFile = responseFile;
        } catch (cause) {
          record.error = cleanError(cause);
          return stop(
            "Could not retain the paid model response; usage is retained and campaign stopped.",
          );
        }
        let retainKnownReply = false;
        if (admitted.status !== "completed")
          stoppedReason =
            "Provider returned unknown usage; campaign stopped without retry.";
        else if (options.budget.accountedUsd > options.budget.maximumUsd)
          stoppedReason =
            "Observed provider usage exceeded the admitted dollar ceiling; no further dispatch.";
        else if (reply.usage && reply.usage.outputTokens > maximumOutputTokens)
          stoppedReason =
            "Observed provider output exceeded its requested cap; no further dispatch.";
        else if (!(await sourceIsUnchanged()))
          stoppedReason =
            "Candidate source changed during the request; reply retained and campaign stopped.";
        else if (
          admitted.actualUsd !== null &&
          admitted.actualUsd > admitted.reservedUsd
        ) {
          stoppedReason =
            "Reported provider usage exceeded its pre-dispatch reservation; reply retained and no further requests admitted.";
          // Let the normal loop persist/consume this already-paid known reply.
          // Any subsequent model call fails before admission, including another host.
          retainKnownReply = true;
        }
        await options.persist();
        if (stoppedReason && !retainKnownReply)
          throw new EvaluationAdmissionError(stoppedReason);
        return reply;
      } finally {
        busy = false;
      }
    },
  };
  return {
    model,
    get stoppedReason() {
      return stoppedReason;
    },
  };
}

export type CreativeSourceSnapshot = {
  root: string;
  commit: string;
  dirty: boolean;
  fingerprint: string;
  files: string[];
};
const git = (root: string, ...args: string[]) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
export function repositoryRoot(fileOrDirectory: string): string {
  return git(fileOrDirectory, "rev-parse", "--show-toplevel");
}
async function hashSource(root: string, files: readonly string[]) {
  const hash = createHash("sha256");
  for (const file of files)
    hash.update(file).update(await readFile(path.join(root, file)));
  return hash.digest("hex");
}
export async function captureCreativeSource(
  root: string,
  host: CreativeHost,
): Promise<CreativeSourceSnapshot> {
  const prefixes =
    host === "open-source"
      ? [
          "packages/",
          "apps/server/",
          "skills/",
          "evals/",
          "config/",
          "scripts/evaluate-creative.ts",
        ]
      : [
          "lib/",
          "services/",
          "packages/",
          "config/",
          "scripts/lib/creative-skill-eval.ts",
          "scripts/build-creative-skill-eval.mjs",
        ];
  const files = git(root, "ls-files", "-z")
    .split("\0")
    .filter(
      (file) =>
        file &&
        (prefixes.some((prefix) => file.startsWith(prefix)) ||
          [
            "package.json",
            "package-lock.json",
            "tsconfig.json",
            "AGENTS.md",
          ].includes(file)) &&
        /\.(?:[cm]?[jt]sx?|json|md|tgz)$/.test(file),
    )
    .sort();
  return {
    root,
    commit: git(root, "rev-parse", "HEAD"),
    dirty: !!git(root, "status", "--porcelain"),
    fingerprint: await hashSource(root, files),
    files,
  };
}
export async function creativeSourceUnchanged(
  snapshot: CreativeSourceSnapshot,
): Promise<boolean> {
  return (
    git(snapshot.root, "rev-parse", "HEAD") === snapshot.commit &&
    !git(snapshot.root, "status", "--porcelain") &&
    (await hashSource(snapshot.root, snapshot.files)) === snapshot.fingerprint
  );
}

export async function createOpenSourceCreativeSession(options: {
  scenario: CreativeScenario;
  directory: string;
  model: LanguageModel;
  skillsDirectory: string;
  signal: AbortSignal;
}) {
  const store = new ProjectStore(options.directory);
  await store.init();
  const skills = await loadLocalSkills(options.skillsDirectory);
  const project = await store.create(
    `Creative evaluation: ${options.scenario.id}`,
  );
  await store.transaction(project.id, (state) =>
    commitDocument(state, options.scenario.document, false),
  );
  let activeRun: string | undefined;
  const history: CreativeHistory = [];
  let callCount = 0;
  const counted: LanguageModel = {
    identity: options.model.identity,
    complete: async (...args) => {
      callCount++;
      return options.model.complete(...args);
    },
  };
  // Model factory lets the service keep its normal immutable provider binding.
  const agent = new AgentService(
    store,
    () => counted,
    skills,
    undefined,
    "review",
    undefined,
    "local-editor-v14",
  );
  async function settle(id: string): Promise<StoredRun> {
    const deadline = Date.now() + 210_000;
    while (Date.now() < deadline) {
      options.signal.throwIfAborted();
      const state = await store.read(project.id),
        run = state.runs.find((value) => value.id === id);
      if (!run) throw new Error("Creative run disappeared.");
      if (!["queued", "running"].includes(run.status)) return run;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Creative agent turn exceeded its bounded deadline.");
  }
  return {
    projectId: project.id,
    async run(instruction: string, turn: number): Promise<CreativeTurnResult> {
      const before = await store.read(project.id);
      const input = {
        operationId: `creative-turn-${turn}`,
        instruction,
        baseHash: before.documentHash,
        baseRevision: before.revision,
        scope: { kind: "project" },
        context: { selectedItemIds: [], playheadFrame: 0 },
      };
      const started = await agent.start(project.id, input);
      activeRun = started.run.id;
      assert.equal(
        (await agent.start(project.id, input)).run.id,
        activeRun,
        "Duplicate start created a second run.",
      );
      const run = await settle(activeRun);
      assert.equal(
        (await store.read(project.id)).documentHash,
        before.documentHash,
        "Model execution changed the document before guarded Apply.",
      );
      if (run.status === "failed")
        throw new Error(run.error?.message ?? "Agent failed.");
      if (run.status === "needs_input") {
        const question = run.clarification?.question ?? "";
        history.push(
          { role: "user", text: instruction },
          { role: "assistant", text: question },
        );
        return {
          result: {
            outcome: "question",
            question,
            summary: question,
            reviewed: false,
          },
          document: before.document,
          scene: compileVideoProjectDocument(before.document).scene,
          history: structuredClone(history),
          events: run.events,
        };
      }
      if (run.status === "completed" && !run.proposal) {
        const summary = "Agent completed without an edit proposal.";
        history.push(
          { role: "user", text: instruction },
          { role: "assistant", text: summary },
        );
        return {
          result: { outcome: "advice", summary, reviewed: false },
          document: before.document,
          scene: compileVideoProjectDocument(before.document).scene,
          history: structuredClone(history),
          events: run.events,
        };
      }
      if (run.status !== "awaiting_review" || !run.proposal)
        throw new Error(
          `Expected a reviewed proposal, received ${run.status}.`,
        );
      const comparison = await agent.review(project.id, activeRun);
      const approval = {
        operationId: `creative-apply-${turn}`,
        baseRevision: before.revision,
        baseHash: before.documentHash,
        reviewBasis: comparison.review.basis,
      };
      const applied = await agent.apply(project.id, activeRun, approval),
        count = callCount;
      const replay = await agent.apply(project.id, activeRun, approval);
      assert.equal(
        replay.revision,
        applied.revision,
        "Apply replay created another revision.",
      );
      assert.equal(
        callCount,
        count,
        "Apply replay repeated a provider request.",
      );
      const loaded = await new ProjectStore(options.directory).read(project.id);
      assert.equal(
        canonicalSerialize(loaded.document),
        canonicalSerialize(comparison.afterDocument),
        "Reload did not retain the reviewed document.",
      );
      const summary = run.proposal.summary;
      history.push(
        { role: "user", text: instruction },
        { role: "assistant", text: summary },
      );
      return {
        result: {
          outcome: "edit",
          summary,
          reviewed: true,
          native: run.proposal,
        },
        document: loaded.document,
        scene: compileVideoProjectDocument(loaded.document).scene,
        history: structuredClone(history),
        events: {
          sequence: run.events,
          guardedApply: true,
          duplicateStart: true,
          duplicateApply: true,
          reloaded: true,
          agentProfile: run.agentProfile,
          kitVersion: run.agentKitVersion,
        },
      };
    },
    async close() {
      if (!activeRun) return;
      const state = await store.read(project.id);
      if (
        state.runs.some(
          (run) =>
            run.id === activeRun &&
            ["running", "queued", "needs_input"].includes(run.status),
        )
      )
        await agent.cancel(project.id, activeRun);
    },
  };
}
