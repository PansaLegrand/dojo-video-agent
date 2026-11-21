import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { EvaluationBudget } from "../evals/agent/request-budget";
import {
  createCreativeCampaignModel,
  createOpenSourceCreativeSession,
  type CreativeRequestContext,
  type CreativeRequestRecord,
} from "../evals/agent/creative-runner";
import {
  parseCreativeOptions,
  evaluateCreativeMain,
} from "../scripts/evaluate-creative";
import { creativeScenarios, creativeScenarioVariants, gradeCreativeOutcome } from "../evals/agent/creative-scenarios";
import type { LanguageModel } from "../packages/agent/src/types";

async function workspace<T>(run: (directory: string) => Promise<T>) {
  const directory = await mkdtemp(
    path.join(tmpdir(), "dojo-creative-runner-test-"),
  );
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
const rates = { inputUsdPerMillion: 1, outputUsdPerMillion: 1 };
const context: CreativeRequestContext = {
  host: "open-source",
  scenario: "fixture",
  repetition: 1,
  turn: 0,
};

describe("shared creative-evaluation admission and evidence", () => {
  it("rejects an oversized serialized provider body before reserving or dispatching", async () =>
    workspace(async directory => {
      const budget = new EvaluationBudget(2, 1, rates), records: CreativeRequestRecord[] = [];
      const complete = vi.fn(async () => ({ text: "", calls: [], usage: { inputTokens: 1, outputTokens: 1 } }));
      const campaign = createCreativeCampaignModel({ budget, requests: records, directory, context: () => context,
        sourceUnchanged: async () => true, persist: async () => {}, transport: { complete, requestBytes: () => 1024 * 1024 + 1 } });
      await expect(campaign.model.complete([], [], new AbortController().signal)).rejects.toThrow(/serialized provider input limit/);
      expect(complete).not.toHaveBeenCalled();
      expect(records).toHaveLength(0);
      expect(budget.requests).toHaveLength(0);
    }));
  it("shares one cap across hosts and persists the reservation/request before dispatch", async () =>
    workspace(async (directory) => {
      const budget = new EvaluationBudget(2, 1, rates),
        records: CreativeRequestRecord[] = [];
      let current = { ...context },
        persisted = 0,
        calls = 0;
      const transport: LanguageModel = {
        async complete(_messages, _tools, _signal, limits) {
          calls++;
          expect(persisted).toBeGreaterThan(0);
          expect(budget.requests.at(-1)?.status).toBe("pending");
          const record = records.at(-1)!;
          const saved = JSON.parse(
            await readFile(path.join(directory, record.requestFile), "utf8"),
          );
          expect(saved.context.host).toBe(current.host);
          expect(limits?.maxOutputTokens).toBe(8192);
          return {
            text: "complete",
            calls: [],
            usage: { inputTokens: 10, outputTokens: 5 },
          };
        },
      };
      const campaign = createCreativeCampaignModel({
        transport,
        budget,
        requests: records,
        directory,
        context: () => current,
        sourceUnchanged: async () => true,
        persist: async () => {
          persisted++;
        },
      });
      await campaign.model.complete([], [], new AbortController().signal);
      current = { ...context, host: "commercial-web" };
      await campaign.model.complete([], [], new AbortController().signal);
      await expect(
        campaign.model.complete([], [], new AbortController().signal),
      ).rejects.toThrow(/budget exhausted/);
      expect(calls).toBe(2);
      expect(budget.requests).toHaveLength(2);
      expect(records.map((record) => record.host)).toEqual([
        "open-source",
        "commercial-web",
      ]);
      expect(budget.accountedUsd).toBeCloseTo(0.00003);
    }));
  it("retains unknown usage and stops every later host without retry", async () =>
    workspace(async (directory) => {
      const budget = new EvaluationBudget(10, 1, rates),
        requests: CreativeRequestRecord[] = [];
      let calls = 0;
      const campaign = createCreativeCampaignModel({
        transport: {
          async complete() {
            calls++;
            return { text: "Saved result without usage", calls: [] };
          },
        },
        budget,
        requests,
        directory,
        context: () => context,
        sourceUnchanged: async () => true,
        persist: async () => {},
      });
      await expect(
        campaign.model.complete([], [], new AbortController().signal),
      ).rejects.toThrow(/unknown usage/);
      await expect(
        campaign.model.complete([], [], new AbortController().signal),
      ).rejects.toThrow(/unknown usage/);
      expect(calls).toBe(1);
      expect(budget.requests[0].status).toBe("unknown");
      expect(budget.accountedUsd).toBeGreaterThan(0);
      expect(
        await readFile(path.join(directory, requests[0].responseFile!), "utf8"),
      ).toContain("Saved result without usage");
    }));
  it("retains a known paid reply but blocks further dispatch when its reservation is exceeded", async () =>
    workspace(async (directory) => {
      const budget = new EvaluationBudget(10, 1, rates),
        requests: CreativeRequestRecord[] = [];
      let calls = 0;
      const campaign = createCreativeCampaignModel({
        transport: {
          async complete() {
            calls++;
            return {
              text: "Keep this paid reply.",
              calls: [],
              providerOutput: [{ encrypted_content: "opaque-test-reply" }],
              usage: { inputTokens: 20000, outputTokens: 5 },
            };
          },
        },
        budget,
        requests,
        directory,
        context: () => context,
        sourceUnchanged: async () => true,
        persist: async () => {},
      });
      const reply = await campaign.model.complete(
        [],
        [],
        new AbortController().signal,
        { maxOutputTokens: 2000 },
      );
      expect(reply.text).toBe("Keep this paid reply.");
      expect(reply.providerOutput).toEqual([
        { encrypted_content: "opaque-test-reply" },
      ]);
      expect(budget.requests[0].status).toBe("completed");
      expect(budget.accountedUsd).toBeGreaterThan(
        budget.requests[0].reservedUsd,
      );
      expect(budget.accountedUsd).toBeLessThan(budget.maximumUsd);
      await expect(
        campaign.model.complete([], [], new AbortController().signal),
      ).rejects.toThrow(/pre-dispatch reservation/);
      expect(calls).toBe(1);
      const saved = await readFile(
        path.join(directory, requests[0].responseFile!),
        "utf8",
      );
      expect(saved).toContain("Keep this paid reply.");
      expect(saved).not.toContain("opaque-test-reply");
    }));
  it("keeps known usage overruns visible and redacts secrets/opaque reasoning from evidence", async () =>
    workspace(async (directory) => {
      const budget = new EvaluationBudget(10, 1, rates),
        requests: CreativeRequestRecord[] = [];
      const secret = "fixture-private-key";
      const campaign = createCreativeCampaignModel({
        transport: {
          async complete() {
            return {
              text: `Bearer ${secret}`,
              calls: [],
              providerOutput: [{ encrypted_content: "private-reasoning" }],
              usage: { inputTokens: 2_000_000, outputTokens: 10 },
            };
          },
        },
        budget,
        requests,
        directory,
        context: () => context,
        sourceUnchanged: async () => true,
        persist: async () => {},
        secrets: [secret],
      });
      await expect(
        campaign.model.complete(
          [
            {
              role: "assistant",
              content: `Bearer ${secret}`,
              providerOutput: [{ encrypted_content: "private-reasoning" }],
            },
          ],
          [],
          new AbortController().signal,
        ),
      ).rejects.toThrow(/dollar ceiling/);
      expect(budget.requests[0].status).toBe("completed");
      expect(budget.accountedUsd).toBeGreaterThan(2);
      for (const file of [requests[0].requestFile, requests[0].responseFile!]) {
        const encoded = await readFile(path.join(directory, file), "utf8");
        expect(encoded).not.toContain(secret);
        expect(encoded).not.toContain("private-reasoning");
      }
    }));
  it("stops before admission on changed source and after transport ambiguity", async () =>
    workspace(async (directory) => {
      const budget = new EvaluationBudget(10, 1, rates);
      let calls = 0;
      const options = {
        budget,
        requests: [] as CreativeRequestRecord[],
        directory,
        context: () => context,
        persist: async () => {},
        transport: {
          async complete() {
            calls++;
            throw new Error("upstream connection lost");
          },
        },
      };
      const changed = createCreativeCampaignModel({
        ...options,
        sourceUnchanged: async () => false,
      });
      await expect(
        changed.model.complete([], [], new AbortController().signal),
      ).rejects.toThrow(/source changed/);
      expect(calls).toBe(0);
      expect(budget.requests).toHaveLength(0);
      const ambiguous = createCreativeCampaignModel({
        ...options,
        sourceUnchanged: async () => true,
      });
      await expect(
        ambiguous.model.complete([], [], new AbortController().signal),
      ).rejects.toThrow(/connection lost/);
      await expect(
        ambiguous.model.complete([], [], new AbortController().signal),
      ).rejects.toThrow(/uncertain usage/);
      expect(calls).toBe(1);
      expect(budget.requests[0].status).toBe("unknown");
    }));
  it("records a failed admission fence as known non-dispatch", async () =>
    workspace(async (directory) => {
      const budget = new EvaluationBudget(10, 1, rates),
        requests: CreativeRequestRecord[] = [];
      let persistenceCalls = 0,
        providerCalls = 0;
      const campaign = createCreativeCampaignModel({
        transport: {
          async complete() {
            providerCalls++;
            return {
              text: "",
              calls: [],
              usage: { inputTokens: 1, outputTokens: 1 },
            };
          },
        },
        budget,
        requests,
        directory,
        context: () => context,
        sourceUnchanged: async () => true,
        persist: async () => {
          if (persistenceCalls++ === 0)
            throw new Error("simulated disk failure");
        },
      });
      await expect(
        campaign.model.complete([], [], new AbortController().signal),
      ).rejects.toThrow(/before provider dispatch/);
      expect(providerCalls).toBe(0);
      expect(requests[0].phase).toBe("not-dispatched");
      expect(budget.accountedUsd).toBe(0);
    }));
  it("stops if a paid response cannot be retained and does not overwrite older evidence", async () =>
    workspace(async (directory) => {
      await mkdir(path.join(directory, "requests"));
      const responseFile = path.join(directory, "requests/0001.response.json");
      await writeFile(responseFile, "retained original evidence");
      const budget = new EvaluationBudget(10, 1, rates),
        requests: CreativeRequestRecord[] = [];
      let calls = 0;
      const campaign = createCreativeCampaignModel({
        transport: {
          async complete() {
            calls++;
            return {
              text: "paid response",
              calls: [],
              usage: { inputTokens: 10, outputTokens: 5 },
            };
          },
        },
        budget,
        requests,
        directory,
        context: () => context,
        sourceUnchanged: async () => true,
        persist: async () => {},
      });
      await expect(
        campaign.model.complete([], [], new AbortController().signal),
      ).rejects.toThrow(/retain the paid model response/);
      await expect(
        campaign.model.complete([], [], new AbortController().signal),
      ).rejects.toThrow(/retain the paid model response/);
      expect(calls).toBe(1);
      expect(budget.requests[0].status).toBe("completed");
      expect(budget.accountedUsd).toBeGreaterThan(0);
      expect(await readFile(responseFile, "utf8")).toBe(
        "retained original evidence",
      );
    }));
  it("requires explicit live caps and rejects renewed or malformed allowances", () => {
    expect(parseCreativeOptions([]).live).toBe(false);
    expect(parseCreativeOptions(["--hosts", "commercial-web"]).hosts).toEqual(["commercial-web"]);
    expect(() => parseCreativeOptions(["--hosts", "commercial-web,commercial-web"])).toThrow(/at most once/);
    expect(() => parseCreativeOptions(["--hosts", "unknown"])).toThrow(/accepts/);
    expect(() => parseCreativeOptions(["--live"])).toThrow(/requires explicit/);
    expect(() => parseCreativeOptions(["--max-usd", "11"])).toThrow(/US\$10/);
    expect(() => parseCreativeOptions(["--max-requests", "257"])).toThrow(
      /256/,
    );
    expect(() =>
      parseCreativeOptions(["--repeat", "2", "--repeat", "3"]),
    ).toThrow(/duplicate/);
    expect(() => parseCreativeOptions(["--resume"])).toThrow(/Invalid/);
  });
  it("validates an optional focused scenario allowlist without weakening live budget flags", () => {
    const picked = "creative-festival-birthday,creative-ending-domain";
    const required = [
      "--live",
      "--web-adapter",
      "/tmp/adapter.mjs",
      "--repeat",
      "1",
      "--max-requests",
      "28",
      "--max-usd",
      "6.13527775",
      "--input-usd-per-million",
      "1",
      "--output-usd-per-million",
      "1",
      "--outputdir",
      "/tmp/new-campaign",
    ];
    expect(parseCreativeOptions(required).scenarioIds).toBeUndefined();
    expect(
      parseCreativeOptions([...required, "--scenarios", picked]),
    ).toMatchObject({
      live: true,
      scenarioIds: picked.split(","),
      maximumRequests: 28,
      maximumUsd: 6.13527775,
    });
    for (const invalid of [
      " ",
      ",",
      "creative-ending-domain,",
      ",creative-ending-domain",
      "creative-ending-domain,,creative-festival-birthday",
      "creative-ending-domain, creative-ending-domain",
      "not-a-scenario",
    ]) {
      expect(() => parseCreativeOptions(["--scenarios", invalid])).toThrow(
        /scenario IDs|Unknown scenario/,
      );
    }
    expect(() =>
      parseCreativeOptions(["--scenarios", picked, "--scenarios", picked]),
    ).toThrow(/duplicate/);
    expect(() => parseCreativeOptions(["--scenarios", ""])).toThrow(/Invalid/);
    expect(() =>
      parseCreativeOptions(["--live", "--scenarios", picked]),
    ).toThrow(/requires explicit/);
  });
  it("records focused four-trial plans with the original prompts and keeps the all-case default", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const original = JSON.stringify(creativeScenarios);
    try {
      await evaluateCreativeMain([
        "--scenarios",
        "creative-festival-birthday,creative-ending-domain",
        "--repeat",
        "1",
      ]);
      const focused = JSON.parse(String(log.mock.calls.at(-1)![0]));
      expect(focused).toMatchObject({
        mode: "plan-only",
        hosts: ["open-source", "commercial-web"],
        totalTrials: 4,
        repeats: 1,
        scenarioSelection: {
          mode: "explicit",
          selectedIds: ["creative-festival-birthday", "creative-ending-domain"],
          fullSuiteSelected: false,
        },
      });
      expect(focused.scenarios).toEqual(
        ["creative-festival-birthday", "creative-ending-domain"].map((id) => {
          const scenario = creativeScenarios.find((value) => value.id === id)!;
          return {
            id,
            turns: scenario.turns.map((turn) => ({
              prompt: turn.prompt,
              expected: turn.expected,
            })),
          };
        }),
      );
      await evaluateCreativeMain(["--repeat", "2"]);
      const all = JSON.parse(String(log.mock.calls.at(-1)![0]));
      expect(all.totalTrials).toBe(32);
      expect(all.scenarios).toHaveLength(8);
      expect(all.scenarioSelection).toMatchObject({
        mode: "all",
        fullSuiteSelected: true,
      });
      expect(JSON.stringify(creativeScenarios)).toBe(original);
      await evaluateCreativeMain([
        "--scenarios",
        "creative-festival-birthday-3d",
      ]);
      const probe = JSON.parse(String(log.mock.calls.at(-1)![0]));
      expect(probe.totalTrials).toBe(2);
      expect(probe.scenarioSelection.fullSuiteSelected).toBe(false);
      expect(probe.scenarios[0].turns[0].prompt).toContain("Noor, turning 21");
    } finally {
      log.mockRestore();
    }
  });
});

it(
  "executes the OSS adapter through actual review/Apply/reload/replay with a scripted model",
  async () =>
    workspace(async (directory) => {
      let calls = 0;
      const model: LanguageModel = {
        identity: "scripted-creative-host-smoke",
        async complete(messages, tools) {
          calls++;
          const reviewed = messages.some((message) => {
            if (message.role !== "tool") return false;
            try {
              return (
                JSON.parse(String(message.content)).completionPreflight
                  ?.status === "passed"
              );
            } catch {
              return false;
            }
          });
          const name = reviewed ? "propose_edit" : "review_edit";
          expect(tools.some((tool) => tool.name === name)).toBe(true);
          const edit = {
            outcome: "proposal",
            summary: "Scripted host integration edit",
            commands: [
              {
                type: "set",
                target: {
                  kind: "node",
                  itemId: "existing-intro",
                  nodeId: "existing-heading",
                },
                path: ["text"],
                value: "Scripted title",
              },
            ],
          };
          return {
            text: "",
            calls: [
              {
                id: randomUUID(),
                name,
                arguments: JSON.stringify(
                  reviewed
                    ? { reviewed: true }
                    : {
                        requirements: [
                          {
                            id: "exact-heading",
                            kind: "property",
                            target: {
                              kind: "node",
                              itemId: "existing-intro",
                              nodeId: "existing-heading",
                            },
                            path: ["text"],
                            equals: "Scripted title",
                          },
                        ],
                        edit,
                      },
                ),
              },
            ],
            usage: { inputTokens: 0, outputTokens: 0 },
          };
        },
      };
      const session = await createOpenSourceCreativeSession({
        scenario: creativeScenarios[0],
        directory: path.join(directory, "host"),
        model,
        skillsDirectory: path.resolve("skills"),
        signal: AbortSignal.timeout(5000),
      });
      try {
        const result = await session.run(
          "Change the opening title to Scripted title.",
          0,
        );
        expect(result.result).toMatchObject({
          outcome: "edit",
          reviewed: true,
        });
        expect(result.document.items[0].node.children?.[0].text).toBe(
          "Scripted title",
        );
        expect(result.events).toMatchObject({
          guardedApply: true,
          duplicateStart: true,
          duplicateApply: true,
          reloaded: true,
          agentProfile: "local-editor-v14",
        });
        expect(calls).toBe(2);
      } finally {
        await session.close();
      }
    }),
  10000,
);


it("checks an in-place title revision while preserving the complete surrounding document", () => {
  const scenario = creativeScenarioVariants.find(value => value.id === "release13-watch-studio")!;
  const before = structuredClone(scenario.document);
  before.items = [{id:"title",trackId:"visual",name:"Title",node:{id:"title",type:"text",text:"MERIDIAN",duration:180,style:{fontSize:58,letterSpacing:3}}},
    {id:"support",trackId:"visual",name:"Support",node:{id:"support",type:"text",text:"A study in precision meridian.studio",duration:180}}];
  const after = structuredClone(before);
  after.items[0].node.text = "MERIDIAN ATELIER";
  after.items[0].node.style!.fontSize = 36;
  const grade = (document: typeof after) => gradeCreativeOutcome(scenario, before, document, 1, {outcome:"edit"});
  expect(grade(after).automatedStatus).toBe("passed");
  const drift = structuredClone(after);
  drift.format.fps = 24;
  expect(grade(drift).automatedStatus).toBe("failed");
  const lostCopy = structuredClone(after);
  lostCopy.items[1].node.text = "A different studio";
  expect(grade(lostCopy).automatedStatus).toBe("failed");
});
