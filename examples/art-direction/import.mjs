import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const [dir, direction, base = "http://127.0.0.1:4310"] = process.argv.slice(2);
if (
  !dir ||
  !["nocturne", "press", "open-assembly"].includes(direction) ||
  process.argv.length > 5
)
  throw Error(
    "Usage: node import.mjs COMMANDS_DIRECTORY nocturne|press|open-assembly [LOCAL_EDITOR_ORIGIN]",
  );
const origin = new URL(base);
if (
  origin.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(origin.hostname) ||
  origin.origin + "/" !== origin.href
)
  throw Error("Use the local editor's loopback origin.");
const commands = JSON.parse(
  await readFile(path.join(dir, direction + "-commands.json"), "utf8"),
);
assert.ok(
  Array.isArray(commands) &&
    commands.length > 0 &&
    commands.every((c) =>
      ["addItem", "addAsset", "addTrack", "set", "moveItem", "reorderTracks"].includes(c.type),
    ),
  "Expected a reviewed specimen command batch.",
);
async function request(endpoint, body) {
  const response = await fetch(new URL(endpoint, origin), {
    method: body ? "POST" : "GET",
    redirect: "error",
    signal: AbortSignal.timeout(30000),
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok || !result.success)
    throw Error(endpoint + ": " + (result.message ?? response.statusText));
  return result.data;
}
const title = direction === "open-assembly" ? "Open Assembly"
  : "Night Garden · " + (direction === "nocturne" ? "Nocturne" : "Ink Press");
const project = await request("/api/projects", { name: title });
const api = "/api/projects/" + encodeURIComponent(project.id);
const snapshot = await request(api + "/document");
const format = Object.entries(direction === "open-assembly" ? {} : {
  width: 1280,
  height: 720,
  fps: 30,
  durationInFrames: 240,
}).map(([key, value]) => ({
  type: "set",
  target: { kind: "format" },
  path: [key],
  value,
}));
const imported = await request(api + "/commands", {
  operationId: randomUUID(),
  baseRevision: snapshot.revision,
  baseHash: snapshot.documentHash,
  summary: "Import " + title,
  commands: [...format, ...commands],
});
console.log(
  JSON.stringify({
    projectId: project.id,
    editorUrl: new URL("/en/applications/editor/" + project.id, origin).href,
    documentHash: imported.documentHash,
    layers: imported.document.items.length,
  }),
);
