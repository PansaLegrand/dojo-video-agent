/** One bounded admission ledger for actual-model creative evaluations in both hosts. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseScene } from "@dojo-video-engine/schema";
import { GptResponsesModel } from "../packages/adapters/src/gpt-responses";
import { providerUrl } from "../packages/adapters/src/provider-http";
import { parseVideoProjectDocument } from "../packages/core/src/lib/video-project/document";
import {
  creativeScenarios,
  creativeScenarioVariants,
  gradeCreativeOutcome,
} from "../evals/agent/creative-scenarios";
import { assertKieEvaluationEndpoint } from "../evals/agent/reliability";
import { EvaluationBudget } from "../evals/agent/request-budget";
import { redactEvidence } from "../evals/agent/evidence";
import {
  atomicReport,
  captureCreativeSource,
  creativeSourceUnchanged,
  createCreativeCampaignModel,
  createOpenSourceCreativeSession,
  repositoryRoot,
  writeCreativeArtifact,
  type CreativeHistory,
  type CreativeHost,
  type CreativeRequestContext,
  type CreativeRequestRecord,
  type CreativeTurnResult,
  type CreativeWebAdapter,
} from "../evals/agent/creative-runner";

export function parseCreativeOptions(args: readonly string[]) {
  const allowed = new Set([
    "--web-adapter",
    "--repeat",
    "--max-requests",
    "--max-usd",
    "--input-usd-per-million",
    "--output-usd-per-million",
    "--outputdir",
    "--scenarios",
  ]);
  const values = new Map<string, string>();
  let live = false;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--live" && !live) {
      live = true;
      continue;
    }
    if (
      !allowed.has(flag) ||
      values.has(flag) ||
      !args[index + 1] ||
      args[index + 1].startsWith("--")
    )
      throw new Error(
        `Invalid or duplicate creative-evaluation option: ${flag}`,
      );
    values.set(flag, args[++index]);
  }
  if (live)
    for (const flag of allowed)
      if (flag !== "--scenarios" && !values.has(flag))
        throw new Error(`Live evaluation requires explicit ${flag}.`);
  const scenarioIds = values.has("--scenarios")
    ? values
        .get("--scenarios")!
        .split(",")
        .map((id) => id.trim())
    : undefined;
  if (scenarioIds) {
    if (
      scenarioIds.some((id) => !id) ||
      new Set(scenarioIds).size !== scenarioIds.length
    )
      throw new Error(
        "--scenarios must contain unique, nonempty scenario IDs.",
      );
    const known = new Set(
      [...creativeScenarios, ...creativeScenarioVariants].map(
        (scenario) => scenario.id,
      ),
    );
    if (scenarioIds.some((id) => !known.has(id)))
      throw new Error(
        `Unknown scenario ID. Choose from: ${[...known].join(", ")}.`,
      );
  }
  const repeat = Number(values.get("--repeat") ?? 1),
    maximumRequests = Number(values.get("--max-requests") ?? 256),
    maximumUsd = Number(values.get("--max-usd") ?? 10);
  if (!Number.isSafeInteger(repeat) || repeat < 1 || repeat > 3)
    throw new Error("Use 1–3 explicit repetitions.");
  if (
    !Number.isSafeInteger(maximumRequests) ||
    maximumRequests < 1 ||
    maximumRequests > 256 ||
    !Number.isFinite(maximumUsd) ||
    maximumUsd <= 0 ||
    maximumUsd > 10
  )
    throw new Error(
      "This campaign is authorized for at most 256 requests and US$10 across BOTH hosts and ALL repetitions.",
    );
  const rates = {
    inputUsdPerMillion: Number(values.get("--input-usd-per-million") ?? 0),
    outputUsdPerMillion: Number(values.get("--output-usd-per-million") ?? 0),
  };
  if (live) new EvaluationBudget(maximumRequests, maximumUsd, rates); // Validate supplied quote; do not infer pricing.
  return {
    live,
    repeat,
    maximumRequests,
    maximumUsd,
    rates,
    scenarioIds,
    webAdapter: values.get("--web-adapter")
      ? path.resolve(values.get("--web-adapter")!)
      : undefined,
    outputdir: values.get("--outputdir")
      ? path.resolve(values.get("--outputdir")!)
      : undefined,
  };
}

export async function evaluateCreativeMain(args = process.argv.slice(2)) {
  const options = parseCreativeOptions(args);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const hosts: CreativeHost[] = ["open-source", "commercial-web"];
  // Cover each skill family before variants; all cases and grading remain fixed.
  // A provider-uncertainty stop must not always leave the third family unseen.
  const order = [
    "creative-ending-domain",
    "creative-chart-monthly",
    "creative-festival-birthday",
    "creative-festival-company",
    "creative-chart-missing-data",
    "creative-ending-portrait",
    "creative-chart-percent-portrait",
    "creative-ending-calmer-followup",
  ];
  const availableScenarios = [...creativeScenarios].sort(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
  );
  const selectableScenarios = [
    ...availableScenarios,
    ...creativeScenarioVariants,
  ];
  const orderedScenarios = options.scenarioIds
    ? options.scenarioIds.map(
        (id) => selectableScenarios.find((scenario) => scenario.id === id)!,
      )
    : availableScenarios;
  const plan = {
    version: 1,
    mode: options.live ? "live" : "plan-only",
    hosts,
    repeats: options.repeat,
    scenarioSelection: {
      mode: options.scenarioIds ? "explicit" : "all",
      availableIds: selectableScenarios.map((scenario) => scenario.id),
      defaultIds: availableScenarios.map((scenario) => scenario.id),
      selectedIds: orderedScenarios.map((scenario) => scenario.id),
      fullSuiteSelected:
        orderedScenarios.length === availableScenarios.length &&
        availableScenarios.every((scenario) =>
          orderedScenarios.some((selected) => selected.id === scenario.id),
        ),
    },
    scenarios: orderedScenarios.map((scenario) => ({
      id: scenario.id,
      turns: scenario.turns.map((turn) => ({
        prompt: turn.prompt,
        expected: turn.expected,
      })),
    })),
    totalTrials: hosts.length * orderedScenarios.length * options.repeat,
    maximumRequests: options.maximumRequests,
    maximumUsd: options.maximumUsd,
    note: "No browser/creative-quality acceptance is implied by automated semantic checks. No provider call without --live.",
  };
  if (!options.live) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  const adapterPath = options.webAdapter!,
    outputdir = options.outputdir!;
  const adapterBytes = await readFile(adapterPath);
  const adapterHash = createHash("sha256").update(adapterBytes).digest("hex");
  const webRoot = repositoryRoot(path.dirname(adapterPath));
  if (path.resolve(webRoot) === root)
    throw new Error(
      "The web adapter must come from the independent commercial repository.",
    );
  const sources = await Promise.all([
    captureCreativeSource(root, "open-source"),
    captureCreativeSource(webRoot, "commercial-web"),
  ]);
  if (sources.some((source) => source.dirty))
    throw new Error(
      "Commit both candidates before live evaluation; neither worktree may be dirty.",
    );
  const graderFiles = [
    "evals/agent/creative-scenarios.ts",
    "evals/agent/creative-runner.ts",
    "scripts/evaluate-creative.ts",
  ];
  const graderHash = createHash("sha256");
  for (const file of graderFiles)
    graderHash.update(file).update(await readFile(path.join(root, file)));
  const sourceUnchanged = async () =>
    (await Promise.all(sources.map(creativeSourceUnchanged))).every(Boolean) &&
    createHash("sha256")
      .update(await readFile(adapterPath))
      .digest("hex") === adapterHash;
  const baseUrl = process.env.LLM_BASE_URL ?? "https://api.kie.ai/codex/v1";
  const endpoint = assertKieEvaluationEndpoint(
    providerUrl(baseUrl, "responses").href,
  );
  const modelName = process.env.LLM_MODEL;
  if (!modelName)
    throw new Error(
      "Set the exact task-authorized LLM_MODEL; this runner has no model default/fallback.",
    );
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey)
    throw new Error(
      "Set LLM_API_KEY privately before opting into live evaluation.",
    );
  const transport = new GptResponsesModel({
    baseUrl,
    model: modelName,
    apiKey,
  });
  const adapter = (await import(
    pathToFileURL(adapterPath).href
  )) as CreativeWebAdapter;
  if (typeof adapter.runCreativeWebTurn !== "function")
    throw new Error("Web adapter must export runCreativeWebTurn.");
  if (typeof adapter.assertCreativeWebReady !== "function")
    throw new Error(
      "Web adapter must export assertCreativeWebReady for zero-cost admission.",
    );
  await adapter.assertCreativeWebReady();
  // Exclusive directory ownership protects previous ledgers/results from reruns.
  await mkdir(path.dirname(outputdir), { recursive: true });
  await mkdir(outputdir, { mode: 0o700 });
  const reportFile = path.join(outputdir, "report.json");
  await writeFile(reportFile, "", { flag: "wx", mode: 0o600 });
  const controller = new AbortController();
  const onInterrupt = () =>
    controller.abort(
      new Error("Evaluation interrupted; no automatic continuation."),
    );
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onInterrupt);
  const requests: CreativeRequestRecord[] = [],
    trials: Array<Record<string, unknown>> = [];
  const budget = new EvaluationBudget(
    options.maximumRequests,
    options.maximumUsd,
    options.rates,
  );
  let context: CreativeRequestContext = {
    host: "open-source",
    scenario: "not-started",
    repetition: 0,
    turn: 0,
  };
  let completed = false,
    finalError: string | null = null;
  const startedAt = new Date().toISOString();
  const clean = (value: unknown) => redactEvidence(value, [apiKey]);
  let campaign: ReturnType<typeof createCreativeCampaignModel> | undefined;
  async function persist() {
    await atomicReport(reportFile, {
      ...plan,
      startedAt,
      updatedAt: new Date().toISOString(),
      completed,
      finalError,
      cancelled: controller.signal.aborted,
      measuredScope: {
        "open-source":
          "Actual local AgentService/ProjectStore review, guarded Apply, duplicate replay and reload.",
        "commercial-web":
          "Actual commercial agent runtime/native kernel through a supplied evaluation adapter; excludes web HTTP, authentication, database, billing and deployment acceptance.",
      },
      creativeQualityAccepted: false,
      visualReviewRequired: true,
      sources,
      sourceUnchanged: await sourceUnchanged(),
      adapter: { path: adapterPath, sha256: adapterHash },
      grader: {
        version: 1,
        files: graderFiles,
        sha256: graderHash.copy().digest("hex"),
      },
      sourceAgentKitVersion: JSON.parse(
        await readFile(
          path.join(root, "packages/agent-kit/package.json"),
          "utf8",
        ),
      ).version,
      model: modelName,
      endpoint,
      stoppedReason: campaign?.stoppedReason ?? null,
      paidAdmissionLedger: {
        maximumRequests: budget.maximumRequests,
        maximumUsd: budget.maximumUsd,
        rates: budget.rates,
        accountedUsd: budget.accountedUsd,
        requests: budget.requests,
        costBasis:
          "Conservative pre-dispatch reservations and supplied quote rates; reported usage is not invoice verification.",
      },
      requestEvidence: requests,
      trials,
      summary: {
        expectedTrials: plan.totalTrials,
        recordedTrials: trials.length,
        skippedTrials: plan.totalTrials - trials.length,
        automatedPassed: trials.filter((trial) => trial.status === "passed")
          .length,
        needsReview: trials.filter((trial) => trial.status === "needs-review")
          .length,
        failed: trials.filter((trial) => trial.status === "failed").length,
      },
    });
  }
  campaign = createCreativeCampaignModel({
    transport,
    budget,
    requests,
    directory: outputdir,
    context: () => context,
    sourceUnchanged,
    persist,
    signal: controller.signal,
    secrets: [apiKey],
  });
  await persist();
  try {
    outer: for (
      let repetition = 1;
      repetition <= options.repeat;
      repetition++
    ) {
      for (const scenario of orderedScenarios)
        for (const host of hosts) {
          if (controller.signal.aborted || campaign.stoppedReason) break outer;
          context = { host, scenario: scenario.id, repetition, turn: 0 };
          const trialDirectory = path.join(
            outputdir,
            `${String(repetition).padStart(2, "0")}-${scenario.id}-${host}`,
          );
          await mkdir(trialDirectory, { mode: 0o700 });
          const start = Date.now(),
            requestStart = budget.requests.length;
          const turnResults: Array<Record<string, unknown>> = [];
          let document = structuredClone(scenario.document),
            history: CreativeHistory = [];
          let local:
            | Awaited<ReturnType<typeof createOpenSourceCreativeSession>>
            | undefined;
          let status = "passed",
            error: string | undefined;
          try {
            if (host === "open-source")
              local = await createOpenSourceCreativeSession({
                scenario,
                directory: path.join(trialDirectory, "host-state"),
                model: campaign.model,
                skillsDirectory: path.join(root, "skills"),
                signal: controller.signal,
              });
            for (let turn = 0; turn < scenario.turns.length; turn++) {
              context = { host, scenario: scenario.id, repetition, turn };
              const instruction = scenario.turns[turn].prompt;
              const before = structuredClone(document);
              const beforeEvidence = await writeCreativeArtifact(
                trialDirectory,
                `${turn}-before.json`,
                before,
              );
              const result: CreativeTurnResult =
                host === "open-source"
                  ? await local!.run(instruction, turn)
                  : await adapter.runCreativeWebTurn({
                      document: before,
                      instruction,
                      history,
                      model: campaign.model,
                      signal: AbortSignal.any([
                        controller.signal,
                        AbortSignal.timeout(210_000),
                      ]),
                      outputDir: path.join(trialDirectory, `web-turn-${turn}`),
                    });
              document = parseVideoProjectDocument(result.document);
              const scene = parseScene(result.scene);
              history = result.history;
              if (
                !["edit", "question", "advice"].includes(result.result.outcome)
              )
                throw new Error("Adapter returned an unknown outcome.");
              const grade = gradeCreativeOutcome(
                scenario,
                before,
                document,
                turn,
                { scene, outcome: result.result.outcome },
              );
              const afterEvidence = await writeCreativeArtifact(
                trialDirectory,
                `${turn}-after.json`,
                document,
              );
              const sceneEvidence = await writeCreativeArtifact(
                trialDirectory,
                `${turn}-scene.json`,
                scene,
              );
              const turnEvidence = await writeCreativeArtifact(
                trialDirectory,
                `${turn}-result.json`,
                clean({
                  result: result.result,
                  history,
                  events: result.events,
                  toolRecords: result.toolRecords,
                  hostUsage: result.usage,
                  inventories: result.inventories,
                  grade,
                }),
              );
              turnResults.push({
                turn,
                instruction,
                outcome: result.result.outcome,
                grade,
                before: beforeEvidence,
                after: afterEvidence,
                scene: sceneEvidence,
                result: turnEvidence,
              });
              if (grade.automatedStatus === "failed") {
                status = "failed";
                break;
              }
              if (grade.automatedStatus === "needs-review")
                status = "needs-review";
              await persist();
            }
          } catch (cause) {
            status = "failed";
            error = String(
              clean(cause instanceof Error ? cause.message : String(cause)),
            ).slice(0, 2000);
          } finally {
            await local?.close().catch(() => {});
          }
          trials.push({
            host,
            scenarioId: scenario.id,
            repetition,
            status,
            error,
            durationMs: Date.now() - start,
            requestOrdinals: budget.requests
              .slice(requestStart)
              .map((request) => request.ordinal),
            turns: turnResults,
            evidenceDirectory: trialDirectory,
            visualReviewRequired: true,
          });
          await persist();
          console.log(
            `${status.toUpperCase()} ${host} ${scenario.id} (${repetition}/${options.repeat})${error ? `: ${error}` : ""}`,
          );
        }
    }
    completed =
      trials.length === plan.totalTrials &&
      !campaign.stoppedReason &&
      !controller.signal.aborted;
  } catch (cause) {
    finalError = String(
      clean(cause instanceof Error ? cause.message : String(cause)),
    ).slice(0, 2000);
  } finally {
    await persist();
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onInterrupt);
  }
  console.log(
    JSON.stringify({
      report: reportFile,
      completed,
      requests: requests.length,
      accountedUsd: budget.accountedUsd,
      stoppedReason: campaign.stoppedReason,
      visualReviewRequired: true,
    }),
  );
  if (!completed || trials.some((trial) => trial.status !== "passed"))
    process.exitCode = 1;
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  evaluateCreativeMain().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Creative evaluation failed.",
    );
    process.exitCode = 1;
  });
}
