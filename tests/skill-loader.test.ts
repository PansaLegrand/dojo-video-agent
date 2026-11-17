import { it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadLocalSkills } from "../apps/server/src/skill-loader";
import { isLocalSkillPack } from "../packages/agent/src/local-skill-origin";
it("ignores unrelated helper directories and counts only actual skill entries", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dojo-skill-entry-count-"));
  try {
    await Promise.all(
      Array.from({ length: 32 }, (_, index) =>
        writeFile(
          path.join(root, `guide-${index}.md`),
          `# Guide\nMethod ${index}.`,
        ),
      ),
    );
    for (const directory of ["references", "assets", "Helper Files"])
      await mkdir(path.join(root, directory));
    await writeFile(
      path.join(root, "references/guide.md"),
      "Not a root skill.",
    );
    expect(await loadLocalSkills(root)).toHaveLength(32);
    await mkdir(path.join(root, "extra"));
    await writeFile(
      path.join(root, "extra/SKILL.md"),
      "---\nname: extra\ndescription: An extra skill.\n---\nA method.",
    );
    await expect(loadLocalSkills(root)).rejects.toThrow(/At most 32/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("preserves legacy custom Markdown bytes and discovery text across upgrade", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dojo-skill-crlf-"));
  try {
    const instructions = "# Legacy\r\nKeep original guidance.\r\n";
    await writeFile(path.join(root, "legacy.md"), instructions);
    const loaded = await loadLocalSkills(root);
    expect(loaded).toEqual([
      {
        name: "legacy",
        description: "Keep original guidance.\r",
        instructions,
      },
    ]);
    expect(isLocalSkillPack(loaded[0])).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("loads a SKILL.md pack for discovery without executing its sibling scripts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dojo-skill-pack-"));
  try {
    await mkdir(path.join(root, "brand-ending"));
    await writeFile(
      path.join(root, "brand-ending/SKILL.md"),
      '---\nname: brand-ending\ndescription: "Compose a branded ending."\n---\n# Ending\nKeep the supplied URL exact.',
    );
    await writeFile(
      path.join(root, "brand-ending/script.js"),
      "throw Error('must never execute')",
    );
    const loaded = await loadLocalSkills(root);
    expect(loaded).toEqual([
      {
        name: "brand-ending",
        description: "Compose a branded ending.",
        instructions: "# Ending\nKeep the supplied URL exact.",
      },
    ]);
    expect(isLocalSkillPack(loaded[0])).toBe(true);
    expect(Object.keys(loaded[0])).toEqual([
      "name",
      "description",
      "instructions",
    ]);
    expect(JSON.parse(JSON.stringify(loaded))).toEqual(loaded);
    await writeFile(
      path.join(root, "brand-ending.md"),
      "# Duplicate\nAnother guide.",
    );
    await expect(loadLocalSkills(root)).rejects.toThrow(/unique/);
    await rm(path.join(root, "brand-ending.md"));
    await writeFile(
      path.join(root, "brand-ending/SKILL.md"),
      "---\nname: another-skill\ndescription: A mismatched pack.\n---\nText.",
    );
    await expect(loadLocalSkills(root)).rejects.toThrow(/match its folder/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it.skipIf(process.platform === "win32")(
  "keeps a configured symlink root usable but rejects symlink pack directories",
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dojo-skill-root-link-"));
    try {
      const actual = path.join(root, "actual");
      await mkdir(actual);
      await writeFile(
        path.join(actual, "guide.md"),
        "# Guide\nA legacy method.",
      );
      await symlink(actual, path.join(root, "configured"), "dir");
      expect(await loadLocalSkills(path.join(root, "configured"))).toHaveLength(
        1,
      );
      const pack = path.join(root, "outside-pack");
      await mkdir(pack);
      await writeFile(
        path.join(pack, "SKILL.md"),
        "---\nname: linked\ndescription: Linked guide.\n---\nA method.",
      );
      await symlink(pack, path.join(actual, "linked"), "dir");
      await expect(loadLocalSkills(actual)).rejects.toThrow(/regular Markdown/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
it.skipIf(process.platform === "win32")(
  "rejects symlink pack entry points",
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dojo-pack-link-"));
    try {
      await mkdir(path.join(root, "brand-ending"));
      await writeFile(path.join(root, "guide.txt"), "# Outside");
      await symlink(
        path.join(root, "guide.txt"),
        path.join(root, "brand-ending/SKILL.md"),
      );
      await expect(loadLocalSkills(root)).rejects.toThrow(/regular file/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
it("loads bounded Markdown as instructions, never executable modules", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dojo-skills-"));
  try {
    await writeFile(
      path.join(root, "music.md"),
      "# Music\nPrepare instrumental music.\nUse only registered tools.",
    );
    await writeFile(
      path.join(root, "evil.js"),
      "throw new Error('must not execute')",
    );
    expect(await loadLocalSkills(root)).toEqual([
      {
        name: "music",
        description: "Prepare instrumental music.",
        instructions:
          "# Music\nPrepare instrumental music.\nUse only registered tools.",
      },
    ]);
    await writeFile(path.join(root, "huge.md"), "x".repeat(65537));
    await expect(loadLocalSkills(root)).rejects.toThrow(/64 KiB/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it.skipIf(process.platform === "win32")(
  "rejects symlink Markdown rather than reading outside its local directory",
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dojo-skills-link-"));
    try {
      await writeFile(path.join(root, "real.md"), "# Real");
      await symlink(path.join(root, "real.md"), path.join(root, "linked.md"));
      await expect(loadLocalSkills(root)).rejects.toThrow(/regular/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
