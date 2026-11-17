import {
  evaluateScene,
  layoutScene,
  type LayoutBox,
} from "@dojo-video-engine/core";
import type { Scene, SceneNode } from "@dojo-video-engine/schema";
import {
  canonicalSerialize,
  createVideoProjectDocument,
  parseVideoProjectDocument,
  type VideoProjectDocument,
} from "../../packages/core/src/lib/video-project/document";

export type CreativeSkill =
  | "branded-ending"
  | "chart-storytelling"
  | "festival-motion";
export type CreativeDatum = { label: string; value: number };
export type CreativeContract =
  | { kind: "ending"; text: string }
  | { kind: "calmer-ending"; text: string; originalEnd: number }
  | {
      kind: "chart";
      data: readonly CreativeDatum[];
      unit: "" | "%";
      plot: "bar-or-line" | "line";
    }
  | {
      kind: "festival";
      requiredText: readonly string[];
      occasion: "birthday" | "company-anniversary";
      requireThreeMotion?: true;
    }
  | { kind: "missing-data" };
export type CreativeTurn = {
  prompt: string;
  expected: "edit" | "question";
  contract: CreativeContract;
};
export type CreativeScenario = {
  id: string;
  skill: CreativeSkill;
  document: VideoProjectDocument;
  turns: readonly CreativeTurn[];
  visualReview: readonly string[];
};
export type CreativeCheck = {
  id: string;
  status: "passed" | "failed" | "unknown";
  detail: string;
};
export type CreativeGrade = {
  version: 1;
  automatedStatus: "passed" | "failed" | "needs-review";
  checks: CreativeCheck[];
  visualReviewRequired: true;
  visualReview: readonly string[];
  sampleFrames: number[];
  chartEncoding?: {
    status: "verified" | "failed" | "unknown";
    detail: string;
    animated?: boolean;
  };
};

/** Synthetic, asset-free inputs: browser rendering requires no provider/media jobs. */
export function creativeFixture(
  portrait = false,
  opening = false,
): VideoProjectDocument {
  const doc = createVideoProjectDocument({
    width: portrait ? 720 : 1280,
    height: portrait ? 1280 : 720,
    fps: 30,
    durationInFrames: opening ? 120 : 180,
  });
  doc.metadata = {
    fixture: "creative-short-prompts-v1",
    originalNote: "Preserve this fixture metadata.",
  };
  if (opening)
    doc.items = [
      {
        id: "existing-intro",
        trackId: "visual",
        name: "Existing opening card",
        node: {
          id: "existing-intro",
          type: "div",
          from: 0,
          duration: 120,
          style: { position: "absolute", inset: 0, backgroundColor: "#172554" },
          children: [
            {
              id: "existing-heading",
              type: "text",
              text: "A small beginning",
              style: {
                position: "absolute",
                left: 48,
                top: 80,
                width: portrait ? 620 : 1100,
                height: 100,
                fontSize: 44,
                color: "#ffffff",
              },
            },
          ],
        },
      },
    ];
  return parseVideoProjectDocument(doc);
}

const commonVisualReview = [
  "Watch the full decoded export, not only a poster. Check readable type, hierarchy, clipping, overlaps, pacing and the ending hold.",
  "Inspect relevant entrance, settled and exit frames in the actual browser; node/layout checks alone do not establish contrast or visual quality.",
  "Record the reviewer verdict and failures separately from automated checks. No template identity or skill-read count is a quality oracle.",
] as const;
const endingReview = [
  ...commonVisualReview,
  "The new ending follows the complete existing content, displays the exact requested URL legibly, and feels intentional in this aspect ratio.",
];
const chartReview = [
  ...commonVisualReview,
  "Visually match every category/value pair, unit, baseline and scale to the supplied data; reject distorted geometry even when labels are correct.",
  "The chart itself animates coherently; a static chart with only an animated heading does not satisfy the request.",
  "Unknown machine measurements (for example curved SVG paths) require explicit numerical/visual review and must not become automatic passes.",
];
export const creativeScenarios: readonly CreativeScenario[] = [
  {
    id: "creative-ending-domain",
    skill: "branded-ending",
    document: creativeFixture(false, true),
    turns: [
      {
        prompt: "Make a cool ending with dojoclip.com on it.",
        expected: "edit",
        contract: { kind: "ending", text: "dojoclip.com" },
      },
    ],
    visualReview: endingReview,
  },
  {
    id: "creative-ending-portrait",
    skill: "branded-ending",
    document: creativeFixture(true, true),
    turns: [
      {
        prompt:
          "Give this a slick ending with studio.dojoclip.com/creative-tools.",
        expected: "edit",
        contract: {
          kind: "ending",
          text: "studio.dojoclip.com/creative-tools",
        },
      },
    ],
    visualReview: endingReview,
  },
  {
    id: "creative-chart-monthly",
    skill: "chart-storytelling",
    document: creativeFixture(),
    turns: [
      {
        prompt:
          "Make a smooth chart animation: Jan 12, Feb 20, Mar 16, Apr 28.",
        expected: "edit",
        contract: {
          kind: "chart",
          data: [
            { label: "Jan", value: 12 },
            { label: "Feb", value: 20 },
            { label: "Mar", value: 16 },
            { label: "Apr", value: 28 },
          ],
          unit: "",
          plot: "bar-or-line",
        },
      },
    ],
    visualReview: chartReview,
  },
  {
    id: "creative-chart-percent-portrait",
    skill: "chart-storytelling",
    document: creativeFixture(true),
    turns: [
      {
        prompt:
          "Animate a line chart: Alpha 25%, Beta 50%, Gamma 75%. Keep the percentage labels.",
        expected: "edit",
        contract: {
          kind: "chart",
          data: [
            { label: "Alpha", value: 25 },
            { label: "Beta", value: 50 },
            { label: "Gamma", value: 75 },
          ],
          unit: "%",
          plot: "line",
        },
      },
    ],
    visualReview: chartReview,
  },
  {
    id: "creative-festival-birthday",
    skill: "festival-motion",
    document: creativeFixture(),
    turns: [
      {
        prompt: "Make a joyful birthday animation for Maya, turning 30.",
        expected: "edit",
        contract: {
          kind: "festival",
          requiredText: ["Maya", "30"],
          occasion: "birthday",
        },
      },
    ],
    visualReview: [
      ...commonVisualReview,
      "The celebration suits a personal birthday and emphasizes the correct name and age. Compare with the company-anniversary case for context-sensitive art direction; do not enforce a particular palette or template.",
    ],
  },
  {
    id: "creative-festival-company",
    skill: "festival-motion",
    document: creativeFixture(),
    turns: [
      {
        prompt: "Make an elegant animation for Aster's 25th anniversary.",
        expected: "edit",
        contract: {
          kind: "festival",
          requiredText: ["Aster", "25"],
          occasion: "company-anniversary",
        },
      },
    ],
    visualReview: [
      ...commonVisualReview,
      "The result suits a company anniversary and preserves Aster and 25. Assess its tone against the birthday result without requiring a particular color, layout or count of decorative objects.",
    ],
  },
  {
    id: "creative-chart-missing-data",
    skill: "chart-storytelling",
    document: creativeFixture(),
    turns: [
      {
        prompt: "Make a smooth chart of our sales.",
        expected: "question",
        contract: { kind: "missing-data" },
      },
    ],
    visualReview: [
      "The clarification requests the essential sales data/source rather than inventing business figures or asking only about aesthetic preferences.",
    ],
  },
  {
    id: "creative-ending-calmer-followup",
    skill: "branded-ending",
    document: creativeFixture(false, true),
    turns: [
      {
        prompt: "Make a cool ending with dojoclip.com on it.",
        expected: "edit",
        contract: { kind: "ending", text: "dojoclip.com" },
      },
      {
        prompt: "Make that ending calmer. Keep its wording and duration.",
        expected: "edit",
        contract: {
          kind: "calmer-ending",
          text: "dojoclip.com",
          originalEnd: 120,
        },
      },
    ],
    visualReview: [
      ...endingReview,
      "Compare the two actual outputs: the follow-up should feel calmer while preserving ending wording, placement, duration and existing content. Geometry/style differences alone cannot prove calmer motion.",
    ],
  },
];

/** Optional probes are explicitly selected; they do not change the original eight-case suite. */
export const creativeScenarioVariants: readonly CreativeScenario[] = [
  {
    id: "creative-festival-birthday-3d",
    skill: "festival-motion",
    document: creativeFixture(),
    turns: [
      {
        prompt: "Make a playful 3D birthday animation for Noor, turning 21.",
        expected: "edit",
        contract: {
          kind: "festival",
          requiredText: ["Noor", "21"],
          occasion: "birthday",
          requireThreeMotion: true,
        },
      },
    ],
    visualReview: [
      ...commonVisualReview,
      "Verify visible dimensional geometry and actual object/camera motion in the export, with exact readable Noor/21 text. A flat imitation or only animated overlays is not this 3D probe.",
    ],
  },
];

const equal = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
const nodes = (roots: readonly SceneNode[]): SceneNode[] =>
  roots.flatMap((node) => [node, ...nodes(node.children ?? [])]);
const textOf = (node: SceneNode) =>
  node.text ?? node.runs?.map((run) => run.text).join("") ?? "";
const compact = (text: string) => text.replace(/\s+/g, "").toLowerCase();
const escapePattern = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const containsToken = (text: string, value: string) =>
  new RegExp(
    `(^|[^\\p{L}\\p{N}_])${escapePattern(value).replace(/\\ /g, "\\s*")}($|[^\\p{L}\\p{N}_])`,
    "iu",
  ).test(text);
const containsUrl = (text: string, value: string) =>
  new RegExp(
    `(^|[\\s(\"'])(?:https?://)?${escapePattern(value)}(?=$|[\\s!?,;:)\"']|\\.(?:\\s|$))`,
    "u",
  ).test(text);
const containsOrdinal = (text: string, value: string) =>
  new RegExp(
    `(^|[^\\p{L}\\p{N}_])${escapePattern(value)}(?:st|nd|rd|th)?($|[^\\p{L}\\p{N}_])`,
    "iu",
  ).test(text);
const animated = (node: SceneNode) =>
  (node.animations ?? []).some(
    (animation) =>
      new Set(animation.frames.map((point) => JSON.stringify(point.value)))
        .size > 1,
  );
function threeMotion(node: SceneNode): boolean {
  if (node.extension?.name !== "dojo.three-scene") return false;
  const params = node.extension.params as Record<string, unknown>;
  const camera = params.camera as
    | { orbit?: { degreesPerSecond?: number } }
    | undefined;
  if (camera?.orbit?.degreesPerSecond) return true;
  const objects = params.objects as
    | Record<
        string,
        {
          spin?: Record<string, number>;
          keyframes?: Record<string, Array<{ value: number }>>;
        }
      >
    | undefined;
  return Object.values(objects ?? {}).some(
    (object) =>
      Object.values(object.spin ?? {}).some((value) => value !== 0) ||
      Object.values(object.keyframes ?? {}).some(
        (points) => new Set(points.map((point) => point.value)).size > 1,
      ),
  );
}
const itemEnd = (item: VideoProjectDocument["items"][number]) =>
  (item.node.from ?? 0) + (item.node.duration ?? 0);
const endOf = (doc: VideoProjectDocument) =>
  Math.max(doc.format.durationInFrames, ...doc.items.map(itemEnd));

type Measured = {
  box: LayoutBox;
  opacity: number;
  transformed: boolean;
  animated: boolean;
};
function measuredBoxes(scene: Scene, frame: number): Measured[] {
  const result: Measured[] = [];
  function visit(
    box: LayoutBox,
    opacity = 1,
    transformed = false,
    parentMotion = false,
  ) {
    const style = box.node.style;
    const alpha =
      opacity * (typeof style.opacity === "number" ? style.opacity : 1);
    const transform =
      transformed || (!!style.transform && style.transform !== "none");
    result.push({
      box,
      opacity: alpha,
      transformed: transform,
      animated: parentMotion || animated(box.node),
    });
    box.children.forEach((child) =>
      visit(child, alpha, transform, parentMotion || animated(box.node)),
    );
  }
  layoutScene(evaluateScene(scene, frame)).boxes.forEach((box) => visit(box));
  return result;
}

/** Bounded geometric measurement. Complex/transformed paths remain unknown, never label-only passes. */
export function measureCreativeChart(
  scene: Scene,
  contract: Extract<CreativeContract, { kind: "chart" }>,
  frame: number,
): NonNullable<CreativeGrade["chartEncoding"]> {
  const boxes = measuredBoxes(scene, frame).filter(
    (value) => value.opacity > 0.15 && !value.transformed,
  );
  const labelBoxes = contract.data.map((datum) =>
    boxes.filter(
      (value) => compact(textOf(value.box.node)) === compact(datum.label),
    ),
  );
  if (labelBoxes.some((matches) => matches.length !== 1))
    return {
      status: "unknown",
      detail:
        "Chart category labels are missing, ambiguous or transformed in the measurement frame.",
    };
  const labels = labelBoxes.map((matches) => matches[0].box);
  const centers = labels.map((box) => box.x + box.width / 2);
  if (!centers.every((x, i) => i === 0 || x > centers[i - 1]))
    return {
      status: "unknown",
      detail:
        "Measurement supports unambiguous left-to-right category placement only.",
    };
  const spacing = Math.min(...centers.slice(1).map((x, i) => x - centers[i]));
  const valueLabelsMatch = contract.data.every((datum, index) =>
    boxes.some(
      ({ box }) =>
        compact(textOf(box.node)) ===
          compact(`${datum.value}${contract.unit}`) &&
        Math.abs(box.x + box.width / 2 - centers[index]) <= spacing * 0.4,
    ),
  );
  if (!valueLabelsMatch)
    return {
      status: "unknown",
      detail:
        "Numeric labels cannot be bound unambiguously to their category positions; inspect the rendered chart.",
    };
  const lines = boxes.filter(
    ({ box }) =>
      box.node.shape?.kind === "polyline" &&
      box.node.shape.points.length === contract.data.length,
  );
  for (const { box, animated: plotAnimated } of lines) {
    if (box.node.shape?.kind !== "polyline") continue;
    const points = box.node.shape.points.map((point) => ({
      x: box.x + point.x * box.width,
      y: box.y + point.y * box.height,
    }));
    if (
      !points.every(
        (point, i) => Math.abs(point.x - centers[i]) <= spacing * 0.25,
      )
    )
      continue;
    const values = contract.data.map((datum) => datum.value),
      meanValue = values.reduce((a, b) => a + b) / values.length,
      meanY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    const denominator = values.reduce(
      (sum, value) => sum + (value - meanValue) ** 2,
      0,
    );
    const slope =
      values.reduce(
        (sum, value, i) => sum + (value - meanValue) * (points[i].y - meanY),
        0,
      ) / denominator;
    const intercept = meanY - slope * meanValue;
    const span =
      Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
    const valid =
      denominator > 0 &&
      slope < 0 &&
      span > 5 &&
      points.every(
        (point, i) =>
          Math.abs(point.y - (intercept + slope * values[i])) <=
          Math.max(2, span * 0.025),
      );
    return {
      status: valid ? "verified" : "failed",
      animated: plotAnimated,
      detail: valid
        ? "Category/value labels and a native polyline agree with the supplied values under one linear vertical scale."
        : "The identified line chart does not encode the supplied values with a consistent increasing vertical scale.",
    };
  }
  if (contract.plot === "line")
    return {
      status: "unknown",
      detail:
        "No unambiguous native polyline was measurable; SVG curves or other representations require numerical visual review.",
    };
  const bars = centers.map((x, i) =>
    boxes.filter(({ box }) => {
      const rectangular =
        box.node.shape?.kind === "rect" ||
        (box.node.type === "div" &&
          !box.node.children?.length &&
          !!(box.node.style.backgroundColor || box.node.style.background));
      return (
        rectangular &&
        box.width > 2 &&
        box.width < spacing * 0.9 &&
        box.height > 5 &&
        Math.abs(box.x + box.width / 2 - x) <= spacing * 0.25 &&
        box.y + box.height <= labels[i].y + 3 &&
        labels[i].y - box.y - box.height < scene.height * 0.15
      );
    }),
  );
  if (bars.some((matches) => matches.length !== 1))
    return {
      status: "unknown",
      detail:
        "No unique upright bar could be paired with every category; inspect custom, horizontal or transformed chart geometry.",
    };
  const rectangles = bars.map((matches) => matches[0].box),
    baselines = rectangles.map((box) => box.y + box.height),
    heights = rectangles.map((box) => box.height);
  const maxHeight = Math.max(...heights),
    scales = heights.map((height, i) => height / contract.data[i].value),
    scale = scales.reduce((sum, value) => sum + value, 0) / scales.length;
  const valid =
    contract.data.every((datum) => datum.value > 0) &&
    Math.max(...baselines) - Math.min(...baselines) <=
      Math.max(2, maxHeight * 0.01) &&
    heights.every(
      (height, i) =>
        Math.abs(height - contract.data[i].value * scale) <=
        Math.max(2, maxHeight * 0.025),
    );
  return {
    status: valid ? "verified" : "failed",
    animated: bars.some((matches) => matches[0].animated),
    detail: valid
      ? "Category/value labels, upright bar heights and a shared zero baseline agree with the supplied values."
      : "The identified bars have inconsistent baselines or heights that distort the supplied values.",
  };
}

/** Grades facts and preservation directly; never executes reference commands or demands a particular template. */
export function gradeCreativeOutcome(
  scenario: CreativeScenario,
  before: VideoProjectDocument,
  after: VideoProjectDocument,
  turnIndex = 0,
  options: { scene?: Scene; outcome?: "edit" | "question" | "advice" } = {},
): CreativeGrade {
  const turn = scenario.turns[turnIndex];
  if (!turn) throw new Error(`Unknown creative turn ${turnIndex}.`);
  const contract = turn.contract,
    checks: CreativeCheck[] = [];
  const check = (id: string, condition: boolean, detail: string) =>
    checks.push({ id, status: condition ? "passed" : "failed", detail });
  if (contract.kind === "missing-data") {
    check(
      "essential-question",
      options.outcome === "question",
      "Missing real sales data requires a clarification, not fabricated business figures.",
    );
    check(
      "no-edit-before-data",
      equal(before, after),
      "A clarification must preserve the entire saved document.",
    );
    return {
      version: 1,
      automatedStatus: checks.every((c) => c.status === "passed")
        ? "passed"
        : "failed",
      checks,
      visualReviewRequired: true,
      visualReview: scenario.visualReview,
      sampleFrames: [],
    };
  }
  check(
    "edit-outcome",
    !options.outcome || options.outcome === "edit",
    "A supported creative request produces a concrete edit.",
  );
  const allowedIds = new Set(
    contract.kind === "calmer-ending"
      ? before.items
          .filter((item) => (item.node.from ?? 0) >= contract.originalEnd)
          .map((item) => item.id)
      : [],
  );
  const preserved = before.items.filter((item) => !allowedIds.has(item.id));
  check(
    "preserve-existing-items",
    preserved.every((item) =>
      equal(
        item,
        after.items.find((candidate) => candidate.id === item.id),
      ),
    ),
    "Original items, timing, appearance and content remain unchanged.",
  );
  check(
    "preserve-existing-order",
    equal(
      preserved.map((item) => item.id),
      after.items
        .filter((item) => preserved.some((original) => original.id === item.id))
        .map((item) => item.id),
    ),
    "Original paint order remains unchanged.",
  );
  check(
    "preserve-existing-tracks",
    before.tracks.every((track) =>
      equal(
        track,
        after.tracks.find((candidate) => candidate.id === track.id),
      ),
    ),
    "Existing track identities, locks, visibility and sound remain unchanged.",
  );
  check(
    "preserve-format",
    before.format.width === after.format.width &&
      before.format.height === after.format.height &&
      before.format.fps === after.format.fps &&
      before.format.backgroundColor === after.format.backgroundColor,
    "Canvas dimensions, frame rate and project background remain unchanged.",
  );
  const {
    items: _bi,
    tracks: _bt,
    format: _bf,
    assets: beforeAssets,
    creativeContext: beforeContext,
    ...beforeRest
  } = before;
  const {
    items: _ai,
    tracks: _at,
    format: _af,
    assets: afterAssets,
    creativeContext: afterContext,
    ...afterRest
  } = after;
  check(
    "preserve-evidence-and-metadata",
    equal(beforeRest, afterRest),
    "Source evidence, bindings, markers and existing metadata remain unchanged.",
  );
  check(
    "preserve-existing-assets",
    Object.entries(beforeAssets).every(([id, asset]) =>
      equal(asset, afterAssets[id]),
    ),
    "Existing asset identity and metadata remain unchanged.",
  );
  check(
    "preserve-creative-decisions",
    (beforeContext?.decisions ?? []).every((decision) =>
      equal(
        decision,
        afterContext?.decisions.find(
          (candidate) => candidate.id === decision.id,
        ),
      ),
    ) &&
      (beforeContext?.references ?? []).every((reference) =>
        (afterContext?.references ?? []).some((candidate) =>
          equal(reference, candidate),
        ),
      ),
    "Existing creative decisions remain unchanged; new choices may be recorded.",
  );
  const fresh = after.items.filter(
    (item) => !before.items.some((old) => old.id === item.id),
  );
  const target =
    contract.kind === "calmer-ending"
      ? after.items.filter((item) => allowedIds.has(item.id))
      : fresh;
  check(
    "visual-content",
    target.length > 0 && target.some((item) => item.node.type !== "audio"),
    "The result contains new or revised visual content.",
  );
  check(
    "timeline-covers-output",
    target.every(
      (item) =>
        (item.node.from ?? 0) >= 0 &&
        itemEnd(item) <= after.format.durationInFrames &&
        (item.node.duration ?? 0) > 0,
    ),
    "Every target item fits the resulting timeline with positive duration.",
  );
  const content = nodes(target.map((item) => item.node)),
    text = content.map(textOf).filter(Boolean);
  const knownMotion = content.some(
    (node) => animated(node) || threeMotion(node),
  );
  if (contract.kind === "festival" && contract.requireThreeMotion)
    check(
      "declared-3d-motion",
      content.some(
        (node) =>
          threeMotion(node) &&
          Object.values(
            (
              node.extension?.params as {
                objects?: Record<string, { kind?: string }>;
              }
            )?.objects ?? {},
          ).some((object) => object.kind === "mesh"),
      ),
      "The installed 3D extension declares a mesh plus object/camera motion; rendered visibility still requires review.",
    );
  if (!knownMotion && content.some((node) => node.type === "lottie"))
    checks.push({
      id: "animated-content",
      status: "unknown",
      detail:
        "Inspect the actual Lottie asset/export to establish motion; a clip reference alone is not proof.",
    });
  else
    check(
      "animated-content",
      knownMotion && target.some((item) => (item.node.duration ?? 0) >= 2),
      "At least one native keyframe or declared 3D motion changes the output; visual pacing still requires rendered review.",
    );
  const required =
    contract.kind === "chart"
      ? contract.data.flatMap((datum) => [
          datum.label,
          `${datum.value}${contract.unit}`,
        ])
      : contract.kind === "festival"
        ? contract.requiredText
        : [contract.text];
  const textCorpus = [...text, text.join(""), text.join(" ")];
  for (const value of required)
    check(
      `text:${value}`,
      textCorpus.some((actual) =>
        contract.kind === "ending" || contract.kind === "calmer-ending"
          ? containsUrl(actual, value)
          : contract.kind === "festival" && /^\d+$/.test(value)
            ? containsOrdinal(actual, value)
            : containsToken(actual.replace(/\s+%/g, "%"), value),
      ),
      `The authored output retains supplied text/value: ${value}.`,
    );
  if (contract.kind === "ending") {
    check(
      "append-after-original",
      target.every((item) => (item.node.from ?? 0) >= endOf(before)),
      "The ending begins after the complete original timeline, including any existing trailing content.",
    );
    check(
      "extend-timeline",
      after.format.durationInFrames > endOf(before),
      "The ending extends the original timeline.",
    );
    check(
      "ending-reaches-final-frame",
      target.some((item) => itemEnd(item) === after.format.durationInFrames),
      "The ending reaches the final frame without an added blank tail.",
    );
  }
  if (contract.kind === "calmer-ending") {
    check(
      "reuse-existing-ending",
      fresh.length === 0 && target.length === allowedIds.size,
      "The follow-up revises the existing ending instead of adding another one.",
    );
    check(
      "preserve-ending-window",
      target.every((item) => {
        const old = before.items.find((value) => value.id === item.id);
        return (
          old &&
          old.node.from === item.node.from &&
          old.node.duration === item.node.duration
        );
      }) && before.format.durationInFrames === after.format.durationInFrames,
      "The ending keeps its exact placement and duration.",
    );
    check(
      "followup-changes-ending",
      !equal(
        before.items.filter((item) => allowedIds.has(item.id)),
        target,
      ),
      "The calmer follow-up changes the ending; perceived calmness needs side-by-side video review.",
    );
  }
  const start = Math.min(...target.map((item) => item.node.from ?? 0)),
    end = Math.max(...target.map(itemEnd));
  const sampleFrames = target.length
    ? [
        ...new Set([
          start,
          start + Math.floor((end - start) * 0.2),
          start + Math.floor((end - start) * 0.55),
          Math.max(start, end - 2),
        ]),
      ]
    : [];
  let chartEncoding: CreativeGrade["chartEncoding"];
  if (contract.kind === "chart") {
    if (!options.scene)
      chartEncoding = {
        status: "unknown",
        detail:
          "Supply the actual compiled candidate Scene or perform explicit numerical review; text labels alone do not prove a chart.",
      };
    else {
      const frames = sampleFrames.slice(1),
        measurements = frames.map((frame) =>
          measureCreativeChart(options.scene!, contract, frame),
        );
      chartEncoding = [...measurements]
        .reverse()
        .find((value) => value.status !== "unknown") ??
        measurements[0] ?? {
          status: "unknown",
          detail: "No chart measurement frames.",
        };
    }
    checks.push({
      id: "chart-data-encoding",
      status:
        chartEncoding.status === "verified"
          ? "passed"
          : chartEncoding.status === "failed"
            ? "failed"
            : "unknown",
      detail: chartEncoding.detail,
    });
    if (chartEncoding.animated !== undefined)
      check(
        "chart-animation",
        chartEncoding.animated,
        "At least one measured plot mark or its containing graphic animates; heading-only animation is insufficient.",
      );
  }
  return {
    version: 1,
    automatedStatus: checks.some((c) => c.status === "failed")
      ? "failed"
      : checks.some((c) => c.status === "unknown")
        ? "needs-review"
        : "passed",
    checks,
    visualReviewRequired: true,
    visualReview: scenario.visualReview,
    sampleFrames,
    ...(chartEncoding ? { chartEncoding } : {}),
  };
}
