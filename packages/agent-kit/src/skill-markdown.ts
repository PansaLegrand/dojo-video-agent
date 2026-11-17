import type { Skill } from "./catalog.js";

/** Bounded skill entry point. Only name/description metadata is interpreted;
 * Markdown stays guidance and cannot install tools or executable modules. */
export function parseSkillMarkdown(
  name: string,
  markdown: string,
  pack = false,
): Skill {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  if (
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name) ||
    new TextEncoder().encode(normalized).length > 65536
  )
    throw new Error("A skill needs a short lowercase name and at most 64 KiB.");
  if (!pack)
    return {
      name,
      description: (
        normalized
          .split("\n")
          .find((line) => line.trim() && !line.startsWith("#")) ?? name
      ).slice(0, 500),
      instructions: normalized,
    };
  const header = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(normalized);
  if (!header)
    throw new Error("SKILL.md requires name and description frontmatter.");
  const fields = new Map<string, string>();
  for (const line of header[1]!.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const field = /^(name|description):\s*(.+)$/.exec(line);
    if (!field || fields.has(field[1]!))
      throw new Error(
        "Skill frontmatter supports unique name/description fields only.",
      );
    let value = field[2]!.trim();
    if (value.startsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        throw new Error("Invalid quoted skill metadata.");
      }
    } else if (value.startsWith("'")) {
      if (!value.endsWith("'"))
        throw new Error("Invalid quoted skill metadata.");
      value = value.slice(1, -1).replace(/''/g, "'");
    }
    if (typeof value !== "string")
      throw new Error("Skill metadata must be text.");
    fields.set(field[1]!, value);
  }
  const description = fields.get("description"),
    instructions = header[2]!.trim();
  if (
    fields.get("name") !== name ||
    !description?.trim() ||
    description.length > 500 ||
    !instructions
  )
    throw new Error(
      "Skill name must match its folder; description and instructions are required.",
    );
  return { name, description, instructions };
}
