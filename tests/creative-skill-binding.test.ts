import { describe, it, expect } from "vitest";
import {
  builtInSkills,
  CREATIVE_SKILL_NAMES,
  selectSkills,
  parseSkillMarkdown,
  readSkill,
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
  it("uses exact retained 0.2.9 bytes and does not add new pack guidance to old runs", () => {
    const kit = selectAgentKit("local-editor-v14", "0.2.9");
    expect(kit.AGENT_KIT_VERSION).toBe("0.2.9");
    expect(
      skillsForSavedRun(
        { agentProfile: "local-editor-v14", agentKitVersion: "0.2.9" },
        builtInSkills(),
      ).some((s) => s.name === "branded-ending"),
    ).toBe(false);
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
