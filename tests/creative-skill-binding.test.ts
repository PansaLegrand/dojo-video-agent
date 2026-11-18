import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadLocalSkills } from "../apps/server/src/skill-loader";
import {
  builtInSkills,
  CREATIVE_SKILL_NAMES,
  EXPANDED_CREATIVE_SKILL_NAMES,
  selectSkills,
  parseSkillMarkdown,
  readSkill,
  composeToolAgentPrompt,
} from "../packages/agent-kit/src/index";
import {
  selectAgentKit,
  skillsForSavedRun,
} from "../packages/agent/src/runtime-build";
const tools = [
  "inspect_project",
  "inspect_graphics_schema",
  "review_edit",
  "propose_edit",
  "prepare_three_scene",
];
describe("creative skill candidate boundaries", () => {
  it("exposes matched creative guidance only on current profiles with its execution tools", () => {
    const skills = builtInSkills();
    for (const profile of [
      "local-editor-v14",
      "commercial-editing-v15",
    ] as const)
      expect(
        selectSkills(skills, tools, profile)
          .filter((s) =>
            CREATIVE_SKILL_NAMES.includes(
              s.name as (typeof CREATIVE_SKILL_NAMES)[number],
            ),
          )
          .map((s) => s.name),
      ).toEqual([...CREATIVE_SKILL_NAMES]);
    expect(
      selectSkills(skills, tools, "local-editor-v13").some(
        (s) => s.name === "branded-ending",
      ),
    ).toBe(false);
    expect(
      selectSkills(skills, ["inspect_project"], "commercial-editing-v15").some(
        (s) => s.name === "branded-ending",
      ),
    ).toBe(false);
  });
  it("uses exact retained 0.2.9 bytes and does not add new pack guidance to old runs", async () => {
    const kit = selectAgentKit("local-editor-v14", "0.2.9");
    expect(kit.AGENT_KIT_VERSION).toBe("0.2.9");
    expect(
      skillsForSavedRun(
        { agentProfile: "local-editor-v14", agentKitVersion: "0.2.9" },
        await loadLocalSkills(path.resolve("skills")),
      ).some((s) => s.name === "branded-ending"),
    ).toBe(false);
  });
  it("retains distinct legacy custom names without imposing new tool requirements or prompt guidance", () => {
    const retained = selectAgentKit("local-editor-v14", "0.2.9");
    const oldTools = [
      "inspect_project",
      "propose_edit",
      "prepare_text_overlay",
    ];
    const custom = CREATIVE_SKILL_NAMES.map((name) => ({
      name,
      description: `Legacy ${name}`,
      instructions: `Keep the original custom ${name} method.`,
    }));
    for (const profile of ["local-editor-v1", "local-editor-v13"] as const) {
      const selected = selectSkills(custom, oldTools, profile);
      expect(selected).toEqual(
        retained.selectSkills(custom, oldTools, profile),
      );
      expect(selected).toHaveLength(custom.length);
      const input = {
        profile,
        editingGuide: "Existing editing guide.",
        toolNames: oldTools,
        skills: selected,
      };
      expect(composeToolAgentPrompt(input)).toBe(
        retained.composeToolAgentPrompt(input),
      );
      expect(
        selectSkills(
          builtInSkills(),
          [...tools, "prepare_text_overlay"],
          profile,
        ).some((skill) =>
          CREATIVE_SKILL_NAMES.includes(
            skill.name as (typeof CREATIVE_SKILL_NAMES)[number],
          ),
        ),
      ).toBe(false);
    }
    expect(
      selectSkills(custom, ["inspect_project"], "local-editor-v14"),
    ).toEqual(
      custom.filter((skill) =>
        (EXPANDED_CREATIVE_SKILL_NAMES as readonly string[]).includes(
          skill.name,
        ),
      ),
    );
  });
  it("resumes a persisted skill snapshot after its installed file changes", () => {
    const original = {
      name: "branded-ending",
      description: "Original",
      instructions: "Use the exact URL.",
    };
    const run = JSON.parse(
      JSON.stringify({
        agentProfile: "local-editor-v14",
        agentKitVersion: "0.2.10",
        skillSnapshot: [original],
      }),
    );
    const skills = skillsForSavedRun(run, [
      { ...original, instructions: "A changed guide." },
    ]);
    expect(readSkill(skills, "branded-ending")).toBe("Use the exact URL.");
    skills[0]!.instructions = "Mutated reader copy";
    expect(run.skillSnapshot[0].instructions).toBe(original.instructions);
  });
  it("rejects incomplete or executable metadata instead of treating it as authority", () => {
    for (const header of [
      "name: test",
      "name: test\ndescription: Test\nexecute: evil.js",
      "name: test\nname: test\ndescription: Test",
    ])
      expect(() =>
        parseSkillMarkdown("test", `---\n${header}\n---\nA method.`, true),
      ).toThrow();
  });
});
