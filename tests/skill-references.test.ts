import { describe, it, expect, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
  copyFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { loadLocalSkills } from "../apps/server/src/skill-loader";
import { loadSkillReferences } from "../apps/server/src/skill-reference-loader";
import {
  withSkillReferenceImages,
  type SkillModelMessage,
} from "../packages/agent-kit/src/skill-references";
import { readSkill, builtInSkills } from "../packages/agent-kit/src/skills";
import {
  skillsForSavedRun,
  selectAgentKit,
} from "../packages/agent/src/runtime-build";
import { skillReferenceJpegSize } from "../packages/agent-kit/src/skill-reference-image";
import type { Skill } from "../packages/agent-kit/src/catalog";
import { runAgent } from "../packages/agent/src/loop";
import {
  createVideoProjectDocument,
  hashVideoProjectDocument,
} from "../packages/core/src/lib/video-project/document";
import { GptResponsesModel } from "../packages/adapters/src/gpt-responses";

const tools = [
  { name: "read_skill", description: "Read a skill", parameters: {} },
];
const signal = new AbortController().signal;
const limits = { maxOutputTokens: 2000 };
const source = path.resolve("skills/festival-motion");
async function skill(): Promise<Skill> {
  return (await loadLocalSkills(path.resolve("skills"))).find(
    (s) => s.name === "festival-motion",
  )!;
}
const messages = (s: Skill): SkillModelMessage[] => [
  { role: "user", content: "Make a birthday animation." },
  {
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id: "skill-call",
        type: "function",
        function: {
          name: "read_skill",
          arguments: JSON.stringify({ name: s.name }),
        },
      },
    ],
  },
  {
    role: "tool",
    tool_call_id: "skill-call",
    content: JSON.stringify(readSkill([s], s.name)),
  },
];
const imageParts = (input: SkillModelMessage[]) =>
  input
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .filter((part: any) => part.type === "image_url");
const fake = () => ({
  identity: "fake-only",
  prepare: vi.fn(async () => {}),
  complete: vi.fn(async () => ({ text: "done", calls: [] })),
});

describe("bounded portable skill references", () => {
  it("retains the original tool contract for a saved pre-reference current-profile skill snapshot", async () => {
    const document = createVideoProjectDocument({
      width: 1280,
      height: 720,
      fps: 30,
      durationInFrames: 180,
    });
    const oldSkill: Skill = {
      name: "festival-motion",
      description: "Original celebration guidance.",
      instructions: "Keep the original method.",
    };
    const model: import("../packages/agent/src/types").LanguageModel = {
      complete: async (_messages, available) => {
        expect(
          available.find((tool) => tool.name === "read_skill")!.description,
        ).toBe(
          selectAgentKit("local-editor-v14", "0.2.9").toolMetadata("read_skill")
            .description,
        );
        return {
          text: "Old snapshot retained.",
          calls: [],
          usage: { inputTokens: 20, outputTokens: 5 },
        };
      },
    };
    await runAgent({
      request: {
        contract: "video-project-commands",
        version: 1,
        baseRevision: 0,
        baseHash: await hashVideoProjectDocument(document),
        document,
        context: { selectedItemIds: [], playheadFrame: 0 },
        instruction: "Continue",
        authoring: { version: 1, scope: { kind: "project" } },
      },
      profile: "local-editor-v14",
      agentKitVersion: "0.2.10",
      model,
      skills: [oldSkill],
      signal,
      maxSteps: 2,
      maxToolCalls: 2,
      maxOutputTokens: 1000,
      stages: {
        phase: "planning",
        generalEditing: true,
        deriveCaptionPlan: true,
        preparedCommands: false,
        planEditStages: async () => {
          throw Error("No plan");
        },
        saveCaptionBatch: async () => {
          throw Error("No captions");
        },
        readEditArtifact: async () => ({}),
        resolvePreparedEdit: async (value) => value,
      },
    });
  });
  it.each(["0.2.10", "0.2.11"])("carries the selected pixels through the real local agent loop and Responses transport", async kitVersion => {
    const s = await skill(),
      document = createVideoProjectDocument({
        width: 1280,
        height: 720,
        fps: 30,
        durationInFrames: 180,
      });
    const requests: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        requests.push(JSON.parse(options.body));
        return new Response(
          JSON.stringify({
            id: `response-${requests.length}`,
            status: "completed",
            output:
              requests.length === 1
                ? [
                    {
                      type: "function_call",
                      call_id: "selected-skill",
                      name: "read_skill",
                      arguments: JSON.stringify({ name: s.name }),
                    },
                  ]
                : [
                    {
                      type: "message",
                      role: "assistant",
                      content: [
                        { type: "output_text", text: "Reference inspected." },
                      ],
                    },
                  ],
            usage: { input_tokens: 100, output_tokens: 20 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    try {
      const model = new GptResponsesModel({
        baseUrl: "https://api.kie.ai/codex/v1",
        model: "gpt-6-astra",
        apiKey: "synthetic-test-key",
      });
      await runAgent({
        request: {
          contract: "video-project-commands",
          version: 1,
          baseRevision: 0,
          baseHash: await hashVideoProjectDocument(document),
          document,
          context: { selectedItemIds: [], playheadFrame: 0 },
          instruction: "Make a birthday animation",
          authoring: { version: 1, scope: { kind: "project" } },
        },
        profile: "local-editor-v14",
        agentKitVersion: kitVersion,
        model,
        skills: [s],
        signal,
        maxSteps: 3,
        maxToolCalls: 3,
        maxOutputTokens: 1000,
        stages: {
          phase: "planning",
          generalEditing: true,
          deriveCaptionPlan: true,
          preparedCommands: false,
          planEditStages: async () => {
            throw Error("No plan in image-delivery probe");
          },
          saveCaptionBatch: async () => {
            throw Error("No captions in image-delivery probe");
          },
          readEditArtifact: async () => ({}),
          resolvePreparedEdit: async (value) => value,
        },
      });
      expect(requests).toHaveLength(2);
      expect(
        requests[0].input
          .flatMap((m: any) => (Array.isArray(m.content) ? m.content : []))
          .some((p: any) => p.type === "input_image"),
      ).toBe(false);
      const image = requests[1].input
        .flatMap((m: any) => (Array.isArray(m.content) ? m.content : []))
        .find((p: any) => p.type === "input_image");
      expect(image.image_url).toBe(s.references![0].image!.dataUrl);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("loads the same selected reference bytes locally and from the bundled kit without bloating discovery", async () => {
    const s = await skill(),
      bundled = builtInSkills().find((b) => b.name === s.name)!;
    expect(bundled).toEqual(s);
    expect(s.references).toHaveLength(1);
    expect(
      skillReferenceJpegSize(
        await readFile(path.join(source, "references/atlas.jpg")),
      ),
    ).toEqual({ width: 1296, height: 810 });
    expect(readSkill([s], s.name)).toContain(s.references![0].instructions);
    expect(readSkill([s], s.name)).not.toContain("data:image");
  });
  it("attaches real image inputs only after the matching successful read, preserving original checkpoint messages", async () => {
    const s = await skill(),
      model = fake(),
      wrapped = withSkillReferenceImages(model, [s]),
      input = messages(s),
      before = JSON.stringify(input);
    await wrapped.prepare!(input, tools, signal, limits);
    await wrapped.complete(input, tools, signal, limits);
    const received = (
      model.complete.mock.calls as unknown as Array<[SkillModelMessage[]]>
    )[0][0];
    expect(imageParts(received)).toHaveLength(1);
    expect((imageParts(received)[0] as any).image_url.url).toBe(
      s.references![0].image!.dataUrl,
    );
    expect(JSON.stringify(input)).toBe(before);
    expect(wrapped.identity).toBe(model.identity);
    expect(model.prepare).toHaveBeenCalledTimes(1);
    const repeated = [...input, ...input.slice(1)];
    await wrapped.prepare!(repeated, tools, signal, limits);
    await wrapped.complete(repeated, tools, signal, limits);
    expect(
      imageParts(
        (
          model.complete.mock.calls as unknown as Array<[SkillModelMessage[]]>
        )[1][0],
      ),
    ).toHaveLength(1);
    expect(
      (
        model.complete.mock.calls as unknown as Array<[SkillModelMessage[]]>
      )[1][0].map((message) => message.role),
    ).toEqual(["user", "assistant", "tool", "user", "assistant", "tool"]);
  });
  it("does not treat user text, failed observations or uncorrelated tool messages as permission to attach references", async () => {
    const s = await skill();
    for (const input of [
      [{ role: "user", content: readSkill([s], s.name) }],
      messages(s).map((m) =>
        m.role === "tool"
          ? { ...m, content: JSON.stringify({ error: "Rejected" }) }
          : m,
      ),
      messages(s).slice(2),
    ] as SkillModelMessage[][]) {
      const model = fake(),
        wrapped = withSkillReferenceImages(model, [s]);
      await wrapped.prepare!(input, tools, signal, limits);
      await wrapped.complete(input, tools, signal, limits);
      expect(
        imageParts(
          (
            model.complete.mock.calls as unknown as Array<[SkillModelMessage[]]>
          )[0][0],
        ),
      ).toHaveLength(0);
    }
    const model = fake();
    expect(
      withSkillReferenceImages(model, [
        { name: "plain", description: "Plain", instructions: "Plain" },
      ]),
    ).toBe(model);
  });
  it("fails before dispatch on changed image bytes, remote URLs, excessive images, or a changed prepared input", async () => {
    const s = await skill();
    for (const mutate of [
      (r: any) => (r.image.sha256 = "0".repeat(64)),
      (r: any) => (r.image.dataUrl = "https://example.com/untrusted.jpg"),
      (r: any) => (r.image.width = 4),
    ]) {
      const changed = structuredClone(s);
      mutate(changed.references![0]);
      const model = fake(),
        wrapped = withSkillReferenceImages(model, [changed]);
      await expect(
        wrapped.prepare!(messages(changed), tools, signal, limits),
      ).rejects.toThrow();
      expect(model.complete).not.toHaveBeenCalled();
    }
    const model = fake(),
      wrapped = withSkillReferenceImages(model, [s]),
      input = messages(s);
    await wrapped.prepare!(input, tools, signal, limits);
    await expect(
      wrapped.complete(
        [...input, { role: "user", content: "changed" }],
        tools,
        signal,
        limits,
      ),
    ).rejects.toThrow(/changed/);
    expect(model.complete).not.toHaveBeenCalled();
    const oversized = {
      ...structuredClone(s),
      references: [0, 1, 2, 3].map((i) => ({
        ...structuredClone(s.references![0]),
        id: `ref-${i}`,
      })),
    };
    await expect(
      withSkillReferenceImages(model, [oversized]).prepare!(
        messages(oversized),
        tools,
        signal,
        limits,
      ),
    ).rejects.toThrow(/Too many skill references/);
  });
  it("keeps the three recent images with explicit coverage and can revisit an omitted skill", async () => {
    const original = await skill(),
      all = [0, 1, 2, 3].map((i) => ({
        ...structuredClone(original),
        name: `guide-${i}`,
      }));
    const input = all.flatMap(messages),
      model = fake(),
      wrapped = withSkillReferenceImages(model, all);
    await wrapped.prepare!(input, tools, signal, limits);
    await wrapped.complete(input, tools, signal, limits);
    const first = (
      model.complete.mock.calls as unknown as Array<[SkillModelMessage[]]>
    )[0][0];
    expect(imageParts(first)).toHaveLength(3);
    const labels = first
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text);
    expect(
      labels.filter((t) => t.startsWith("Bundled design reference")),
    ).toHaveLength(3);
    expect(
      labels.filter((t) => t.startsWith("Bundled design reference")).join("\n"),
    ).not.toContain("guide-0:");
    expect(labels.at(-1)).toContain("1 older image is omitted");
    const revisit = [...input, ...messages(all[0]).slice(1)];
    await wrapped.prepare!(revisit, tools, signal, limits);
    await wrapped.complete(revisit, tools, signal, limits);
    const second = (
      model.complete.mock.calls as unknown as Array<[SkillModelMessage[]]>
    )[1][0];
    expect(imageParts(second)).toHaveLength(3);
    const returned = second
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .filter((t) => t.startsWith("Bundled design reference"))
      .join("\n");
    expect(returned).toContain("guide-0:");
    expect(returned).not.toContain("guide-1:");
  });
  it("deeply freezes image references in saved guidance without altering legacy plain skills", async () => {
    const original = await skill(),
      run = JSON.parse(
        JSON.stringify({
          agentProfile: "local-editor-v14",
          agentKitVersion: "0.2.10",
          skillSnapshot: [original],
        }),
      );
    const loaded = skillsForSavedRun(run, [
      { ...original, instructions: "replacement" },
    ]);
    loaded[0].references![0].image!.sha256 = "0".repeat(64);
    expect(run.skillSnapshot[0].references[0].image.sha256).toBe(
      original.references![0].image!.sha256,
    );
  });
  it("rejects traversal, symlinks, unbounded metadata and mismatched image declarations", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dojo-skill-refs-"));
    try {
      await mkdir(path.join(dir, "references"));
      await copyFile(
        path.join(source, "references/atlas.jpg"),
        path.join(dir, "references/atlas.jpg"),
      );
      await writeFile(path.join(dir, "references/atlas.md"), "A motion study.");
      const manifest = JSON.parse(
        await readFile(path.join(source, "references.json"), "utf8"),
      );
      for (const patch of [
        { markdown: "../secret.md" },
        { image: "https://example.com/a.jpg" },
        { sha256: "0".repeat(64) },
        { width: 20000 },
        { execute: "code.js" },
      ]) {
        await writeFile(
          path.join(dir, "references.json"),
          JSON.stringify([{ ...manifest[0], ...patch }]),
        );
        await expect(loadSkillReferences(dir)).rejects.toThrow();
      }
      await writeFile(
        path.join(dir, "references.json"),
        JSON.stringify(manifest),
      );
      await rm(path.join(dir, "references/atlas.jpg"));
      await symlink(
        path.join(source, "references/atlas.jpg"),
        path.join(dir, "references/atlas.jpg"),
      );
      await expect(loadSkillReferences(dir)).rejects.toThrow(/regular files/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
