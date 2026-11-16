// Import supplied, editable graphics through the normal local command API.
// No provider calls, generated media, or direct writes to the project store.
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { parseScene } from "@dojo-video-engine/schema";
import { validateThreeLayers } from "@dojo-video-engine/three/schema";

const examples = {
  festival: "AFTER HOURS — festive 3D",
  company: "ORBIT — company launch",
  journey: "NIGHT TRAIN — illustrated journey",
  "data-story": "FIELD NOTES — data storytelling",
  kinetic: "TYPE IN MOTION — kinetic poster",
  cinema: "DEEP FIELD — cinematic titles",
  city: "LITTLE WORLDS — miniature city",
  precision: "PRECISION — engineered motion",
  bloom: "CHROMA BLOOM — kinetic vector art",
};
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const positional = args.filter((arg) => arg !== "--check");
const [example, originArgument = "http://127.0.0.1:4310"] = positional;
if (!Object.hasOwn(examples, example) || positional.length > 2) {
  console.error(
    `Usage: node examples/creative-showcase/import.mjs ${Object.keys(examples).join("|")} [http://127.0.0.1:4310] [--check]`,
  );
  process.exit(1);
}

const origin = new URL(originArgument);
if (
  origin.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(origin.hostname) ||
  origin.username ||
  origin.password ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash
)
  throw new Error("Use the running harness's HTTP localhost origin only.");

const scene = parseScene(
  JSON.parse(
    await readFile(new URL(`./${example}.json`, import.meta.url), "utf8"),
  ),
);
validateThreeLayers(scene.nodes);
if (Object.keys(scene.assets).length)
  throw new Error("These supplied showcases must not require media assets.");
if (Object.keys(scene.audioBuses ?? {}).length)
  throw new Error("This silent graphics importer does not import audio buses.");
if (
  scene.width < 64 ||
  scene.width > 4096 ||
  scene.height < 64 ||
  scene.height > 4096 ||
  !Number.isInteger(scene.fps) ||
  scene.fps > 120
)
  throw new Error("The scene exceeds the editor's format limits.");

// These supplied designs have known layer boundaries. Read them strictly in
// source order so a future scene revision cannot silently change its paint order.
// Added wrappers start at frame zero with an identity transform and full-canvas
// bounds; their children keep all original animation and visibility clocks.
let cursor = 0;
function take(ids) {
  return ids.map((id) => {
    const node = scene.nodes[cursor++];
    if (node?.id !== id)
      throw new Error(
        `Update the showcase layer map: expected source node ${id}.`,
      );
    return node;
  });
}
function group(id, ids) {
  return {
    id: `showcase-${example}-${id}`,
    type: "div",
    from: 0,
    duration: scene.duration,
    style: { position: "absolute", inset: 0 },
    children: take(ids),
  };
}
const layers =
  example === "festival"
    ? [
        {
          name: "Background & light",
          nodes: [
            group("atmosphere", [
              "backdrop",
              "ambient-wash",
              "orange-disc",
              "halo",
            ]),
          ],
        },
        {
          name: "Confetti",
          nodes: [
            group(
              "confetti",
              Array.from({ length: 32 }, (_, i) => `confetti-${i}`),
            ),
          ],
        },
        { name: "3D sculpture", nodes: take(["disco-sculpture"]) },
        {
          name: "Event identity",
          nodes: [group("identity", ["eyebrow", "edition", "invite-pill"])],
        },
        { name: "Titles", nodes: take(["act-0", "act-1", "act-2"]) },
        {
          name: "Footer & chapter marks",
          nodes: [
            group("footer", [
              "footer-rule",
              "footer",
              "footer-right",
              "chapter-0",
              "chapter-1",
              "chapter-2",
            ]),
          ],
        },
      ]
    : example === "company"
      ? [
          {
            name: "Company launch",
            nodes: take([
              "orbit-chapter-1",
              "orbit-chapter-2",
              "orbit-chapter-3",
            ]),
          },
        ]
      : example === "journey"
        ? [
            ["Sky, moon & stars", "journey-sky"],
            ["Mountain parallax", "journey-mountains"],
            ["River & village", "journey-valley"],
            ["Arched viaduct", "journey-viaduct"],
            ["Night train", "journey-train"],
            ["Foreground pines", "journey-foreground"],
            ["Journey lettering", "journey-lettering"],
          ].map(([name, id]) => ({ name, nodes: take([id]) }))
        : example === "data-story"
          ? [
              {
                name: "Data story",
                nodes: take([
                  "data-chapter-1",
                  "data-chapter-2",
                  "data-chapter-3",
                ]),
              },
            ]
          : example === "kinetic"
            ? [
                {
                  name: "Kinetic poster",
                  nodes: take([
                    "kinetic-assemble",
                    "kinetic-disrupt",
                    "kinetic-move",
                  ]),
                },
              ]
            : example === "cinema"
              ? [
                  { name: "Atmosphere", nodes: take(["atmosphere"]) },
                  { name: "3D light tunnel", nodes: take(["light-tunnel"]) },
                  {
                    name: "Lens & letterbox",
                    nodes: take(["lens-and-letterbox"]),
                  },
                  {
                    name: "Cinematic titles",
                    nodes: take(["prologue", "main-title", "epilogue"]),
                  },
                ]
              : {
                  city: [
                    ["City atmosphere", "city-atmosphere"],
                    ["3D miniature city", "miniature-city"],
                    ["City lettering", "city-editorial"],
                  ],
                  precision: [
                    ["Instrument atmosphere", "precision-atmosphere"],
                    ["3D instrument", "precision-instrument"],
                    ["Technical annotations", "precision-annotations"],
                    ["Editorial frame", "precision-frame"],
                    ["Opening title", "precision-opening"],
                    ["Exploded title", "precision-exploded"],
                    ["Closing title", "precision-ending"],
                  ],
                  bloom: [
                    ["Bloom atmosphere", "bloom-atmosphere"],
                    ["Contour field", "bloom-contour-field"],
                    ["Kinetic vector sculpture", "bloom-vector-sculpture"],
                    ["Bloom lettering", "bloom-editorial-marks"],
                  ],
                }[example].map(([name, id]) => ({ name, nodes: take([id]) }));
if (cursor !== scene.nodes.length)
  throw new Error(
    "Update the showcase layer map to include every source node.",
  );
const groupedScene = parseScene({
  ...scene,
  nodes: layers.flatMap((layer) => layer.nodes),
});
validateThreeLayers(groupedScene.nodes);

const commands = [
  ...Object.entries({
    width: scene.width,
    height: scene.height,
    fps: scene.fps,
    durationInFrames: scene.duration,
    backgroundColor: "#000000",
  }).map(([key, value]) => ({
    type: "set",
    target: { kind: "format" },
    path: [key],
    value,
  })),
  ...(scene.markers
    ? [
        {
          type: "set",
          target: { kind: "project" },
          path: ["markers"],
          value: scene.markers,
        },
      ]
    : []),
  ...layers.map((layer, index) => ({
    type: "addTrack",
    track: {
      id: `showcase-${example}-${index}`,
      name: layer.name,
      kind: "visual",
      muted: false,
      hidden: false,
      locked: false,
    },
  })),
  { type: "removeTrack", id: "visual" },
  { type: "removeTrack", id: "audio" },
  ...layers.flatMap((layer, index) =>
    layer.nodes.map((node) => ({
      type: "addItem",
      item: {
        id: node.id,
        trackId: `showcase-${example}-${index}`,
        name:
          layer.nodes.length === 1
            ? layer.name
            : `${layer.name} · ${layer.nodes.indexOf(node) + 1}`,
        node: {
          ...node,
          from: node.from ?? 0,
          duration:
            node.duration ?? Math.max(1, scene.duration - (node.from ?? 0)),
        },
      },
    })),
  ),
];
if (commands.length > 500)
  throw new Error("The scene exceeds the editor's 500-command batch limit.");

if (checkOnly) {
  console.log(
    `Validated ${example}: ${scene.width}×${scene.height}, ${scene.duration} frames, ${groupedScene.nodes.length} editable items across ${layers.length} track${layers.length === 1 ? "" : "s"}. No project created.`,
  );
} else {
  async function request(path, body) {
    const response = await fetch(new URL(path, origin), {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json();
    if (!response.ok || !result.success)
      throw new Error(`${path}: ${result.message ?? response.statusText}`);
    return result.data;
  }

  const project = await request("/api/projects", { name: examples[example] });
  const editorUrl = new URL(`/en/applications/editor/${project.id}`, origin);
  try {
    const snapshot = await request(`/api/projects/${project.id}/document`);
    const imported = await request(`/api/projects/${project.id}/commands`, {
      operationId: `showcase:${example}:${randomUUID()}`,
      baseRevision: snapshot.revision,
      baseHash: snapshot.documentHash,
      summary: `Import supplied ${examples[example]} scene. No model generation.`,
      commands,
    });
    console.log(
      `Imported ${examples[example]} as ${imported.document.items.length} editable items.`,
    );
    console.log(editorUrl.href);
  } catch (error) {
    console.error(
      `Import did not complete. The new project is at ${editorUrl.href}`,
    );
    throw error;
  }
}
