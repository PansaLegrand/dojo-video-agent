import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { SkillReference } from "../../../packages/agent-kit/src/catalog";
import { skillReferenceJpegSize } from "../../../packages/agent-kit/src/skill-reference-image";

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const bounded = async (file: string, maximum: number) => {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.size > maximum)
    throw Error(
      "Skill references must be bounded regular files, never symlinks.",
    );
  const bytes = await readFile(file);
  if (bytes.length > maximum)
    throw Error("Skill reference exceeds its byte limit.");
  return bytes;
};
export async function loadSkillReferences(
  folder: string,
): Promise<SkillReference[] | undefined> {
  const manifest = path.join(folder, "references.json");
  try {
    await lstat(manifest);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const value: unknown = JSON.parse(
    (await bounded(manifest, 8192)).toString("utf8"),
  );
  if (!Array.isArray(value) || value.length < 1 || value.length > 3)
    throw Error("A skill supports one to three declared references.");
  const refdir = await lstat(path.join(folder, "references"));
  if (!refdir.isDirectory() || refdir.isSymbolicLink())
    throw Error("Skill reference directory must be local and regular.");
  const ids = new Set<string>();
  return Promise.all(
    value.map(async (raw) => {
      if (
        !object(raw) ||
        Object.keys(raw).some(
          (key) =>
            ![
              "id",
              "title",
              "markdown",
              "image",
              "sha256",
              "width",
              "height",
            ].includes(key),
        ) ||
        typeof raw.id !== "string" ||
        !/^[a-z0-9][a-z0-9-]{0,63}$/.test(raw.id) ||
        ids.has(raw.id) ||
        typeof raw.title !== "string" ||
        !raw.title.trim() ||
        raw.title.length > 180 ||
        typeof raw.markdown !== "string" ||
        !/^references\/[a-z0-9-]+\.md$/.test(raw.markdown)
      )
        throw Error("Invalid skill reference manifest.");
      ids.add(raw.id);
      const reference: SkillReference = {
        id: raw.id,
        title: raw.title,
        instructions: (
          await bounded(path.join(folder, raw.markdown), 12288)
        ).toString("utf8"),
      };
      if (!reference.instructions.trim()) throw Error("Empty skill reference.");
      if (raw.image !== undefined) {
        if (
          typeof raw.image !== "string" ||
          !/^references\/[a-z0-9-]+\.jpg$/.test(raw.image) ||
          typeof raw.sha256 !== "string" ||
          !/^[a-f0-9]{64}$/.test(raw.sha256) ||
          !Number.isSafeInteger(raw.width) ||
          !Number.isSafeInteger(raw.height) ||
          Number(raw.width) < 1 ||
          Number(raw.height) < 1 ||
          Number(raw.width) > 2048 ||
          Number(raw.height) > 2048 ||
          Number(raw.width) * Number(raw.height) > 2097152
        )
          throw Error("Invalid skill reference image declaration.");
        const bytes = await bounded(path.join(folder, raw.image), 131072);
        const size = skillReferenceJpegSize(bytes);
        if (
          size.width !== raw.width ||
          size.height !== raw.height ||
          createHash("sha256").update(bytes).digest("hex") !== raw.sha256
        )
          throw Error(
            "Skill reference image bytes differ from their declaration.",
          );
        reference.image = {
          dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`,
          sha256: raw.sha256,
          width: Number(raw.width),
          height: Number(raw.height),
        };
      } else if (
        ["sha256", "width", "height"].some((key) => raw[key] !== undefined)
      )
        throw Error("Image metadata requires an image.");
      return reference;
    }),
  );
}
