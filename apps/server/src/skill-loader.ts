import { readdir, readFile, lstat } from "node:fs/promises";
import path from "node:path";
import type { Skill } from "../../../packages/agent/src/skills";
import { parseSkillMarkdown } from "../../../packages/agent-kit/src/skill-markdown";

/** Local Markdown only: no imports, executable modules, or permission grants. */
export async function localSkillFiles(
  directory: string,
): Promise<Array<{ name: string; file: string; pack: boolean }>> {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.name.endsWith(".md") ||
        entry.isDirectory() ||
        entry.isSymbolicLink(),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length > 32)
    throw new Error("At most 32 local Markdown skills are supported.");
  const files = await Promise.all(
    entries.map(async (entry) => {
      const pack = entry.isDirectory();
      if (
        entry.isSymbolicLink() ||
        (!pack && !entry.isFile()) ||
        !(
          pack ? /^[a-z0-9][a-z0-9-]{0,63}$/ : /^[a-z0-9][a-z0-9-]{0,63}\.md$/
        ).test(entry.name)
      )
        throw new Error(
          "Skills must be regular Markdown files with short lowercase names.",
        );
      const file = path.join(
          directory,
          entry.name,
          ...(pack ? ["SKILL.md"] : []),
        ),
        info = await lstat(file);
      if (!info.isFile() || info.size > 64 * 1024)
        throw new Error(
          "A skill must be a regular file no larger than 64 KiB.",
        );
      return { name: pack ? entry.name : entry.name.slice(0, -3), file, pack };
    }),
  );
  if (new Set(files.map((skill) => skill.name)).size !== files.length)
    throw new Error(
      "Skill names must be unique across Markdown files and packs.",
    );
  return files;
}

export async function loadLocalSkills(directory: string): Promise<Skill[]> {
  return Promise.all(
    (await localSkillFiles(directory)).map(async ({ name, file, pack }) =>
      parseSkillMarkdown(name, await readFile(file, "utf8"), pack),
    ),
  );
}
