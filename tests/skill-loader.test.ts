import { it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadLocalSkills } from "../apps/server/src/skill-loader";
it("preserves legacy custom Markdown bytes and discovery text across upgrade", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dojo-skill-crlf-"));
  try {
    const instructions = "# Legacy\r\nKeep original guidance.\r\n";
    await writeFile(path.join(root, "legacy.md"), instructions);
    expect(await loadLocalSkills(root)).toEqual([
      {
        name: "legacy",
        description: "Keep original guidance.\r",
        instructions,
      },
    ]);
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
    expect(await loadLocalSkills(root)).toEqual([
      {
        name: "brand-ending",
        description: "Compose a branded ending.",
        instructions: "# Ending\nKeep the supplied URL exact.",
      },
    ]);
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
