import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  inspectExampleEnvironment,
  inspectLockfile,
  inspectManifest,
  inspectPath,
  inspectSource,
  isRuntimeSource,
} from "./lib/oss-boundary.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Include newly added source while respecting ignored private local files.
const files = [
  ...new Set(
    execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      {
        cwd: root,
        encoding: "utf8",
      },
    )
      .split("\0")
      .filter(Boolean),
  ),
];
const errors = [];
for (const file of files) {
  errors.push(...inspectPath(file));
  const manifest = /(?:^|\/)package\.json$/.test(file);
  const lock = file === "package-lock.json";
  const example = /(?:^|\/)\.env\.example$/.test(file);
  const source = isRuntimeSource(file);
  if (!manifest && !lock && !example && !source) continue;
  let contents;
  try {
    contents = await fs.readFile(path.join(root, file), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") continue;
    throw error;
  }
  if (manifest) errors.push(...inspectManifest(JSON.parse(contents), file));
  if (lock) errors.push(...inspectLockfile(JSON.parse(contents), file));
  if (example) errors.push(...inspectExampleEnvironment(contents, file));
  if (source) errors.push(...inspectSource(contents, file));
}
if (errors.length) {
  // Only rule names/locations are reported; never print environment values.
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Verified OSS boundary across ${files.length} repository files: local/BYOK configuration and no commercial infrastructure dependencies/imports.`,
  );
