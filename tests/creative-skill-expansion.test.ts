import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadLocalSkills } from "../apps/server/src/skill-loader";
import {
  builtInSkills,
  selectSkills,
  composeToolAgentPrompt,
  buildAgentInventory,
  EXPANDED_CREATIVE_SKILL_NAMES,
  parseSkillMarkdown,
  readSkill,
} from "../packages/agent-kit/src/index";
import { skillsForSavedRun } from "../packages/agent/src/runtime-build";
import type { AgentProfile, Skill } from "../packages/agent-kit/src/catalog";

describe("expanded creative library", () => {
  it("keeps saved pre-expansion skills, prompt and inventory bytes stable, including custom name collisions", async () => {
    const fixture = JSON.parse(
      await readFile(
        "tests/fixtures/creative-expansion-compatibility.json",
        "utf8",
      ),
    );
    const savedGuides = new Map<string, Skill>();
    for (const name of ["chart-storytelling", "festival-motion", "branded-ending"]) {
      savedGuides.set(name, parseSkillMarkdown(name,
        await readFile(`tests/fixtures/pre-expansion-${name}.md`, "utf8"), true));
    }
    for (const c of fixture.cases) {
      const input: Skill[] =
        c.kind === "pre-expansion-library"
          ? builtInSkills().filter((s) => fixture.originalNames.includes(s.name))
              .map((s) => ({ ...s, ...savedGuides.get(s.name) }))
          : EXPANDED_CREATIVE_SKILL_NAMES.map((name) => ({
              name,
              description: "Existing custom guide " + name,
              instructions: "Preserve this custom guide for " + name + ".",
            }));
      const saved = JSON.parse(
        JSON.stringify({
          agentProfile: c.profile,
          agentKitVersion: "0.2.10",
          skillSnapshot: input,
        }),
      );
      const selected = selectSkills(
        skillsForSavedRun(saved, builtInSkills()),
        fixture.tools,
        c.profile as AgentProfile,
      );
      const prompt = composeToolAgentPrompt({
        profile: c.profile,
        editingGuide: "Frozen fixture editing guide.",
        toolNames: fixture.tools,
        skills: selected,
      });
      const inventory = buildAgentInventory({
        profile: c.profile,
        tools: [],
        skills: selected,
      });
      expect(
        createHash("sha256")
          .update(
            JSON.stringify({
              selected,
              prompt,
              inventorySkills: inventory.skills,
            }),
          )
          .digest("hex"),
        `${c.profile}/${c.kind}`,
      ).toBe(c.sha256);
    }
  });
  it("loads identical new packs locally and in the shared kit, gates their executors and hides them from old builds", async () => {
    const local = await loadLocalSkills(path.resolve("skills")),
      built = builtInSkills();
    const tools = [
      "inspect_project",
      "inspect_graphics_schema",
      "review_edit",
      "propose_edit",
      "prepare_three_scene",
    ];
    for (const name of EXPANDED_CREATIVE_SKILL_NAMES) {
      const s = built.find((s) => s.name === name)!;
      expect(s).toEqual(local.find((s) => s.name === name));
      expect(s.family).toBe("creative");
      expect(s.references).toHaveLength(1);
      expect(s.references![0].image?.width).toBe(1296);
      for (const profile of [
        "local-editor-v14",
        "commercial-editing-v15",
      ] as const) {
        const selected = selectSkills(built, tools, profile);
        expect(selected.some((s) => s.name === name)).toBe(true);
        expect(readSkill(selected, name)).toContain(
          s.references![0].instructions,
        );
        expect(selectSkills([s], ["inspect_project"], profile)).toEqual([]);
      }
      expect(selectSkills([s], tools, "local-editor-v13")).toEqual([]);
    }
    const withoutThree = selectSkills(
      built,
      tools.filter((t) => t !== "prepare_three_scene"),
      "local-editor-v14",
    );
    expect(withoutThree.some((s) => s.name === "spatial-scenes")).toBe(false);
    expect(withoutThree.some((s) => s.name === "kinetic-typography")).toBe(
      true,
    );
  });
  it("keeps creative family opt-in and bounded without installing or authorizing executors", () => {
    const parse = (metadata: string) =>
      parseSkillMarkdown(
        "custom-motion",
        `---\nname: custom-motion\ndescription: Custom motion.\nmetadata: ${metadata}\n---\nMake an original composition.`,
        true,
      );
    expect(parse('{"dojo-family":"creative"}').family).toBe("creative");
    for (const value of [
      "{}",
      "[]",
      '{"dojo-family":"admin"}',
      '{"dojo-family":"creative","execute":"evil.js"}',
      "{dojo-family: creative}",
    ])
      expect(() => parse(value)).toThrow();
    const custom = parse('{"dojo-family":"creative"}');
    expect(
      selectSkills([custom], ["inspect_project"], "local-editor-v14"),
    ).toEqual([]);
    expect(
      selectSkills(
        [custom],
        [
          "inspect_project",
          "inspect_graphics_schema",
          "review_edit",
          "propose_edit",
        ],
        "local-editor-v14",
      ),
    ).toHaveLength(1);
    expect(
      selectSkills(
        [custom],
        [
          "inspect_project",
          "inspect_graphics_schema",
          "review_edit",
          "propose_edit",
        ],
        "local-editor-v13",
      ),
    ).toEqual([]);
  });
});
