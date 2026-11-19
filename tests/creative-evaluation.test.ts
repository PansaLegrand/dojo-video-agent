import { describe, expect, it } from "vitest";
import {
  parseScene,
  type Scene,
  type SceneNode,
} from "@dojo-video-engine/schema";
import {
  creativeScenarios,
  creativeScenarioVariants,
  gradeCreativeOutcome,
  measureCreativeChart,
  type CreativeContract,
} from "../evals/agent/creative-scenarios";
import {
  parseVideoProjectDocument,
  type VideoProjectDocument,
} from "../packages/core/src/lib/video-project/document";

const find = (id: string) =>
  creativeScenarios.find((scenario) => scenario.id === id)!;
const motion = (): SceneNode["animations"] => [
  {
    kind: "keyframes",
    property: "opacity",
    frames: [
      { frame: 0, value: 0 },
      { frame: 20, value: 1 },
    ],
  },
];
function ending(before: VideoProjectDocument, color = "#ff4f3a") {
  const after = structuredClone(before);
  after.format.durationInFrames = 210;
  after.items.push({
    id: "chosen-ending",
    name: "A freely chosen design",
    trackId: "visual",
    node: {
      id: "chosen-ending",
      type: "div",
      from: 120,
      duration: 90,
      style: { position: "absolute", inset: 0, backgroundColor: color },
      animations: motion(),
      children: [
        {
          id: "website",
          type: "text",
          text: "dojoclip.com",
          style: { left: 50, top: 200, width: 1000, fontSize: 80 },
        },
      ],
    },
  });
  return parseVideoProjectDocument(after);
}
function toScene(document: VideoProjectDocument): Scene {
  return parseScene({
    schemaVersion: 1,
    width: document.format.width,
    height: document.format.height,
    fps: document.format.fps,
    duration: document.format.durationInFrames,
    assets: {},
    nodes: document.items.map((item) => item.node),
  });
}
const text = (
  id: string,
  value: string,
  center: number,
  y: number,
): SceneNode => ({
  id,
  type: "text",
  text: value,
  style: {
    position: "absolute",
    left: center - 40,
    top: y,
    width: 80,
    height: 30,
    fontSize: 20,
    textAlign: "center",
  },
});
function chart(line = false) {
  const scenario = find(
    line ? "creative-chart-percent-portrait" : "creative-chart-monthly",
  );
  const contract = scenario.turns[0].contract as Extract<
    CreativeContract,
    { kind: "chart" }
  >;
  const after = structuredClone(scenario.document);
  const centers = contract.data.map((_, index) => 120 + index * 150),
    baseline = 500;
  const children = contract.data.flatMap((datum, index) => [
    text(`label-${index}`, datum.label, centers[index], baseline + 20),
    text(
      `value-${index}`,
      `${datum.value}${contract.unit}`,
      centers[index],
      80,
    ),
  ]);
  if (line)
    children.push({
      id: "plot-line",
      type: "shape",
      shape: {
        kind: "polyline",
        points: contract.data.map((datum, index) => ({
          x: index / (contract.data.length - 1),
          y: 1 - datum.value / 100,
        })),
      },
      style: {
        position: "absolute",
        left: centers[0],
        top: 100,
        width: centers.at(-1)! - centers[0],
        height: 400,
        stroke: "#2563eb",
        strokeWidth: 4,
      },
      animations: motion(),
    });
  else
    children.push(
      ...contract.data.map(
        (datum, index): SceneNode => ({
          id: `plot-bar-${index}`,
          type: "shape",
          shape: { kind: "rect" },
          style: {
            position: "absolute",
            left: centers[index] - 30,
            top: baseline - datum.value * 10,
            width: 60,
            height: datum.value * 10,
            fill: "#2563eb",
          },
          animations: motion(),
        }),
      ),
    );
  after.items.push({
    id: "chart",
    name: "Independent manual fixture",
    trackId: "visual",
    node: {
      id: "chart",
      type: "div",
      from: 0,
      duration: 180,
      style: { position: "absolute", inset: 0 },
      children,
    },
  });
  return { scenario, contract, after: parseVideoProjectDocument(after) };
}

describe("creative short-prompt fixtures and independent grading", () => {
  it("covers eight cases and leaves visual/style acceptance separate", () => {
    expect(creativeScenarios).toHaveLength(8);
    expect(new Set(creativeScenarios.map((scenario) => scenario.id)).size).toBe(
      8,
    );
    for (const scenario of creativeScenarios) {
      expect(parseVideoProjectDocument(scenario.document)).toBeTruthy();
      expect(scenario.visualReview.length).toBeGreaterThan(0);
    }
  });
  it("accepts different ending styles without a template or skill-read oracle", () => {
    const scenario = find("creative-ending-domain");
    for (const color of ["#ff4f3a", "#112244"]) {
      expect(
        gradeCreativeOutcome(
          scenario,
          scenario.document,
          ending(scenario.document, color),
        ),
      ).toMatchObject({
        automatedStatus: "passed",
        visualReviewRequired: true,
      });
    }
  });
  it("rejects changed originals, early placement, wrong URL and blank padding", () => {
    const scenario = find("creative-ending-domain"),
      before = scenario.document;
    const mutations = [
      (after: VideoProjectDocument) => {
        after.items[0].node.children![0].text = "Changed original";
      },
      (after: VideoProjectDocument) => {
        after.items[1].node.from = 90;
      },
      (after: VideoProjectDocument) => {
        after.items[1].node.children![0].text = "dojoclip.com.evil";
      },
      (after: VideoProjectDocument) => {
        after.format.durationInFrames += 30;
      },
    ];
    for (const mutate of mutations) {
      const after = ending(before);
      mutate(after);
      expect(
        gradeCreativeOutcome(scenario, before, after).automatedStatus,
      ).toBe("failed");
    }
  });
  it("requires a missing-data question and no invented edit", () => {
    const scenario = find("creative-chart-missing-data");
    expect(
      gradeCreativeOutcome(scenario, scenario.document, scenario.document, 0, {
        outcome: "question",
      }).automatedStatus,
    ).toBe("passed");
    expect(
      gradeCreativeOutcome(
        scenario,
        scenario.document,
        ending(scenario.document),
        0,
        { outcome: "edit" },
      ).automatedStatus,
    ).toBe("failed");
  });
  it("preserves the actual ending identity/window on a follow-up", () => {
    const scenario = find("creative-ending-calmer-followup"),
      before = ending(scenario.document),
      after = structuredClone(before);
    after.items[1].node.animations![0].frames[1].frame = 35;
    expect(
      gradeCreativeOutcome(scenario, before, after, 1).automatedStatus,
    ).toBe("passed");
    after.items.push({
      ...structuredClone(after.items[1]),
      id: "duplicate-ending",
    });
    expect(
      gradeCreativeOutcome(scenario, before, after, 1).automatedStatus,
    ).toBe("failed");
  });
  it("accepts new creative decisions while retaining the existing brief", () => {
    const scenario = find("creative-ending-domain"),
      after = ending(scenario.document);
    after.creativeContext = {
      decisions: [
        {
          id: "chosen-look",
          text: "Use a quiet editorial ending.",
          entityIds: ["chosen-ending"],
        },
      ],
      references: [],
    };
    expect(
      gradeCreativeOutcome(scenario, scenario.document, after).automatedStatus,
    ).toBe("passed");
  });
  it("accepts age/anniversary ordinals without accepting different numbers", () => {
    const scenario = find("creative-festival-company"),
      after = structuredClone(scenario.document);
    after.items.push({
      id: "anniversary",
      name: "Anniversary",
      trackId: "visual",
      node: {
        ...text("anniversary", "Aster · 25th anniversary", 500, 200),
        from: 0,
        duration: 180,
        animations: motion(),
      },
    });
    expect(
      gradeCreativeOutcome(scenario, scenario.document, after).automatedStatus,
    ).toBe("passed");
    after.items[0].node.text = "Aster · 125th anniversary";
    expect(
      gradeCreativeOutcome(scenario, scenario.document, after).automatedStatus,
    ).toBe("failed");
  });
  it("accepts supported 3D motion without requiring redundant 2D keyframes", () => {
    const scenario = find("creative-ending-domain"),
      after = ending(scenario.document);
    delete after.items[1].node.animations;
    after.items[1].node.children!.push({
      id: "orbit",
      type: "extension",
      extension: {
        name: "dojo.three-scene",
        version: "1.0.0",
        params: {
          camera: {
            kind: "perspective",
            position: { x: 0, y: 1, z: 5 },
            target: { x: 0, y: 0, z: 0 },
            orbit: { degreesPerSecond: 10 },
          },
          materials: { blue: { color: "#2563eb" } },
          objects: {
            ball: {
              kind: "mesh",
              geometry: { kind: "sphere", radius: 1 },
              materialId: "blue",
            },
          },
        },
      },
      style: { width: 200, height: 200 },
    });
    expect(
      gradeCreativeOutcome(scenario, scenario.document, after).automatedStatus,
    ).toBe("passed");
  });
  it("requires actual declared 3D mesh motion for the opt-in 3D brief", () => {
    const scenario = creativeScenarioVariants[0],
      after = structuredClone(scenario.document);
    after.items.push({
      id: "greeting",
      name: "Greeting",
      trackId: "visual",
      node: {
        ...text("greeting", "Noor 21", 500, 200),
        from: 0,
        duration: 180,
        animations: motion(),
      },
    });
    const grade = () =>
      gradeCreativeOutcome(scenario, scenario.document, after).checks.find(
        (check) => check.id === "declared-3d-motion",
      )?.status;
    expect(grade()).toBe("failed");
    const params = {
      camera: {
        kind: "perspective",
        position: { x: 0, y: 1, z: 5 },
        target: { x: 0, y: 0, z: 0 },
        orbit: { degreesPerSecond: 0 },
      },
      materials: { blue: { color: "#2563eb" } },
      objects: {
        ball: {
          kind: "mesh",
          geometry: { kind: "sphere", radius: 1 },
          materialId: "blue",
        },
      },
    };
    after.items.push({
      id: "sculpture",
      name: "Sculpture",
      trackId: "visual",
      node: {
        id: "sculpture",
        type: "extension",
        from: 0,
        duration: 180,
        extension: { name: "dojo.three-scene", version: "1.0.0", params },
        style: { width: 300, height: 300 },
      },
    });
    expect(grade()).toBe("failed");
    params.camera.orbit.degreesPerSecond = 10;
    expect(grade()).toBe("passed");
  });
  it("checks expanded-copy briefs without accepting missing words, invented labels or a flat spatial scene", () => {
    const scenario = creativeScenarioVariants.find(
        (s) => s.id === "creative-kinetic-copy",
      )!,
      after = structuredClone(scenario.document);
    after.items.push({
      id: "message",
      name: "Message",
      trackId: "visual",
      node: {
        ...text("message", "MAKE EVERY FRAME COUNT", 400, 200),
        from: 0,
        duration: 180,
        animations: motion(),
      },
    });
    expect(
      gradeCreativeOutcome(scenario, scenario.document, after).automatedStatus,
    ).toBe("passed");
    after.items[0].node.text = "MAKE EVERY FRAME COUNTER";
    expect(
      gradeCreativeOutcome(scenario, scenario.document, after).automatedStatus,
    ).toBe("failed");
    delete after.items[0].node.text;
    after.items[0].node.type = "div";
    after.items[0].node.children = [..."MAKE EVERY FRAME COUNT"].map(
      (letter, i) => text(`glyph-${i}`, letter, 20 + i * 20, 200),
    );
    expect(
      gradeCreativeOutcome(scenario, scenario.document, after).automatedStatus,
    ).toBe("passed");
    after.items[0].node.children.push(text("extra-glyph", "R", 700, 200));
    expect(
      gradeCreativeOutcome(scenario, scenario.document, after).automatedStatus,
    ).toBe("failed");
    after.items[0].node.type = "text";
    delete after.items[0].node.children;
    const product = creativeScenarioVariants.find(
      (s) => s.id === "creative-product-concept",
    )!;
    after.items[0].node.text = "Capture Organize Share";
    expect(
      gradeCreativeOutcome(product, product.document, after).automatedStatus,
    ).toBe("failed");
    after.items[0].node.text = "Concept UI Capture Organize Share";
    expect(
      gradeCreativeOutcome(product, product.document, after).automatedStatus,
    ).toBe("passed");
    const spatial = creativeScenarioVariants.find(
      (s) => s.id === "creative-spatial-world",
    )!;
    after.items[0].node.text = "Small world";
    expect(
      gradeCreativeOutcome(spatial, spatial.document, after).checks.find(
        (c) => c.id === "declared-3d-motion",
      )?.status,
    ).toBe("failed");
  });
  it("measures bars independently of their labels and catches distorted heights", () => {
    const { scenario, contract, after } = chart(),
      scene = toScene(after);
    expect(
      gradeCreativeOutcome(scenario, scenario.document, after, 0, { scene }),
    ).toMatchObject({
      automatedStatus: "passed",
      chartEncoding: { status: "verified" },
    });
    const wrong = structuredClone(scene),
      bar = wrong.nodes[0].children!.find((node) => node.id === "plot-bar-2")!;
    bar.style!.height = 240;
    bar.style!.top = 260;
    expect(measureCreativeChart(wrong, contract, 100).status).toBe("failed");
  });
  it("catches wrong line geometry despite correct displayed percentages", () => {
    const { contract, after } = chart(true),
      scene = toScene(after);
    expect(measureCreativeChart(scene, contract, 100).status).toBe("verified");
    const line = scene.nodes[0].children!.find(
      (node) => node.id === "plot-line",
    )!;
    if (line.shape?.kind !== "polyline")
      throw new Error("Fixture line missing");
    line.shape.points[1].y = 0.1;
    expect(measureCreativeChart(scene, contract, 100).status).toBe("failed");
  });
  it("does not call a text-only or opaque-path chart a measured data pass", () => {
    const { scenario, contract, after } = chart();
    after.items[0].node.children = after.items[0].node.children!.filter(
      (node) => node.type === "text",
    );
    after.items[0].node.animations = motion();
    expect(
      gradeCreativeOutcome(scenario, scenario.document, after, 0, {
        scene: toScene(after),
      }),
    ).toMatchObject({
      automatedStatus: "needs-review",
      chartEncoding: { status: "unknown" },
    });
    after.items[0].node.children.push({
      id: "custom-path",
      type: "shape",
      shape: {
        kind: "path",
        d: "M0 0 C20 20 40 10 60 0",
        viewBox: { x: 0, y: 0, width: 60, height: 30 },
      },
      style: { width: 500, height: 300, stroke: "#000000", strokeWidth: 2 },
    });
    expect(measureCreativeChart(toScene(after), contract, 100).status).toBe(
      "unknown",
    );
  });
  it("rejects heading-only movement around an otherwise static measured chart", () => {
    const { scenario, after } = chart();
    for (const node of after.items[0].node.children!) delete node.animations;
    after.items[0].node.children!.push({
      ...text("heading", "Results", 400, 20),
      animations: motion(),
    });
    const grade = gradeCreativeOutcome(scenario, scenario.document, after, 0, {
      scene: toScene(after),
    });
    expect(
      grade.checks.find((check) => check.id === "chart-animation")?.status,
    ).toBe("failed");
  });
  it("does not accept a correct intermediate chart if its final geometry is wrong", () => {
    const { scenario, after } = chart();
    const bar = after.items[0].node.children!.find(
      (node) => node.id === "plot-bar-2",
    )!;
    bar.animations!.push({
      kind: "keyframes",
      property: "height",
      frames: [
        { frame: 0, value: 160 },
        { frame: 100, value: 160 },
        { frame: 140, value: 240 },
      ],
    });
    bar.animations!.push({
      kind: "keyframes",
      property: "top",
      frames: [
        { frame: 0, value: 340 },
        { frame: 100, value: 340 },
        { frame: 140, value: 260 },
      ],
    });
    expect(
      gradeCreativeOutcome(scenario, scenario.document, after, 0, {
        scene: toScene(after),
      }).chartEncoding?.status,
    ).toBe("failed");
  });
});
