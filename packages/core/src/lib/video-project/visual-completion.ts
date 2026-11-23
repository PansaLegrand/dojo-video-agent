import { diagnosticDisplayList } from "./diagnostic-display-list";
import {
  compileDisplayList,
  evaluateScene,
  layoutScene,
  parseColor,
  transformLayoutRect,
  type DisplayGroup,
} from "@dojo-video-engine/core";
import type { SceneNodeInput } from "@dojo-video-engine/schema";
import type {
  CompletionCheck,
  CompletionRequirement,
} from "@dojo-video/agent-kit";
import type { VideoProjectDocument } from "./document";
import { compileVideoProjectDocument } from "./compilation";

type Rect = DisplayGroup["box"];
type Target = {
  id: string;
  itemId: string;
  from: number;
  to: number;
  text: string;
  minimumFrames: number;
  minimumVisibleFraction: number;
};
export const VISUAL_COMPLETION_LIMITS = Object.freeze({
  samples: 192,
  targets: 128,
  visibleFraction: 0.85,
  samplesPerSecond: 4,
  charactersPerSecond: 18,
});
const area = (r: Rect) => Math.max(0, r.width) * Math.max(0, r.height);
function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x),
    y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
}
/** Union area prevents overlapping cards from being counted twice. */
export function rectangleUnionArea(rects: Rect[]): number {
  const useful = rects.filter((r) => area(r) > 0),
    xs = [...new Set(useful.flatMap((r) => [r.x, r.x + r.width]))].sort(
      (a, b) => a - b,
    );
  let total = 0;
  for (let i = 1; i < xs.length; i++) {
    const left = xs[i - 1]!,
      right = xs[i]!,
      ys = useful
        .filter((r) => r.x < right && r.x + r.width > left)
        .map((r) => [r.y, r.y + r.height])
        .sort((a, b) => a[0]! - b[0]!);
    let low = 0,
      high = 0,
      sum = 0;
    for (const [from, to] of ys) {
      if (from! > high) {
        sum += high - low;
        low = from!;
        high = to!;
      } else high = Math.max(high, to!);
    }
    total += (right - left) * (sum + high - low);
  }
  return total;
}
function innerRect(
  g: DisplayGroup,
  geometry: DisplayGroup["clip"],
): Rect | undefined {
  const m = g.worldTransform;
  if (geometry?.kind !== "rounded-rect" || m.b || m.c || !m.a || !m.d) return;
  const radius = Math.max(...Object.values(geometry.radii));
  const r = geometry.rect;
  // Each candidate lies entirely inside every rounded corner. Pick the largest
  // proven opaque rectangle; insetting by a full radius on both axes would
  // incorrectly erase a pill's opaque center.
  const diagonalInset = radius * (1 - Math.SQRT1_2);
  const inside = [
    {
      x: r.x + radius,
      y: r.y,
      width: Math.max(0, r.width - 2 * radius),
      height: r.height,
    },
    {
      x: r.x,
      y: r.y + radius,
      width: r.width,
      height: Math.max(0, r.height - 2 * radius),
    },
    {
      x: r.x + diagonalInset,
      y: r.y + diagonalInset,
      width: Math.max(0, r.width - 2 * diagonalInset),
      height: Math.max(0, r.height - 2 * diagonalInset),
    },
  ].sort((a, b) => area(b) - area(a))[0]!;
  return transformLayoutRect(m, inside);
}
function paintedRects(g: DisplayGroup): Rect[] {
  const c = g.content;
  if (c?.kind !== "text") return [g.transformedBounds];
  return c.lines
    .filter((line) => line.text.trim())
    .map((line) => {
      const x =
        line.maxWidth === null || c.align === "left"
          ? line.x
          : c.align === "center"
            ? line.x - line.width / 2
            : line.x - line.width;
      return transformLayoutRect(g.worldTransform, {
        x,
        y: line.y - c.font.size / 2,
        width: line.width,
        height: c.font.size,
      });
    });
}
function targetNodes(
  document: VideoProjectDocument,
  requirements: CompletionRequirement[],
): Target[] {
  const selections = new Map<string, Set<string> | null>(),
    minimums = new Map<string, number>();
  const all = (id: string) => selections.set(id, null);
  for (const r of requirements) {
    if (r.kind === "asset_sequence")
      r.items.forEach((entry) => all(entry.itemId));
    else if (
      r.kind === "item_present" ||
      r.kind === "appended_ending" ||
      r.kind === "speech_callout" ||
      r.kind === "speech_highlight"
    ) {
      all(r.itemId);
      if (r.kind === "speech_callout" || r.kind === "speech_highlight")
        minimums.set(r.itemId, r.minReadableMs);
    } else if (r.kind === "property" && "itemId" in r.target) {
      if (r.target.kind === "node" || r.target.kind === "item") {
        const itemId = r.target.itemId;
        let nodeId =
          r.target.kind === "node"
            ? r.target.nodeId
            : document.items.find((item) => item.id === itemId)?.node.id;
        let index = r.target.kind === "item" && r.path[0] === "node" ? 1 : 0;
        while (r.path[index] === "children" && r.path[index + 1]) {
          nodeId = r.path[index + 1];
          index += 2;
        }
        if (nodeId && selections.get(r.target.itemId) !== null) {
          const ids = selections.get(r.target.itemId) ?? new Set();
          ids.add(nodeId);
          selections.set(r.target.itemId, ids);
        }
      }
    }
  }
  const targets: Target[] = [];
  for (const item of document.items) {
    if (!selections.has(item.id) || item.caption) continue;
    const selected = selections.get(item.id);
    function visit(
      node: SceneNodeInput,
      start: number,
      end: number,
      chosen: boolean,
    ) {
      const from = start + (node.from ?? 0),
        to = Math.min(end, from + (node.duration ?? end - from)),
        target = chosen || selected === null || selected?.has(node.id) === true;
      const text =
        node.text ?? node.runs?.map((run) => run.text).join("") ?? "";
      if (
        target &&
        (node.type === "img" ||
          node.type === "video" ||
          (node.type === "text" && text.trim()))
      ) {
        const ms =
          node.type === "text"
            ? (minimums.get(item.id) ??
              Math.max(
                600,
                Math.min(
                  8000,
                  ([...text.replace(/\s/gu, "")].length / 18) * 1000,
                ),
              ))
            : 200;
        targets.push({
          id: node.id,
          itemId: item.id,
          from,
          to,
          text,
          minimumFrames: Math.ceil((ms * document.format.fps) / 1000),
          minimumVisibleFraction: node.type === "video" ? 0.5 : 0.85,
        });
      }
      node.children?.forEach((child) => visit(child, from, to, target));
    }
    visit(item.node, 0, document.format.durationInFrames, false);
  }
  return targets;
}

/** New saved v3 policy: bounded event-aware samples, explicit uncovered targets,
 * positive partial-occlusion proof and a sampled readable hold. It is not a
 * pixel/semantic/aesthetic grader or proof about unsampled motion. */
export function reviewVisualCompletion(
  document: VideoProjectDocument,
  requirements: CompletionRequirement[],
): CompletionCheck[] {
  const targets = targetNodes(document, requirements);
  if (!targets.length) return [];
  const fail = (id: string, message: string): CompletionCheck[] => [
    { id, passed: false, message },
  ];
  if (targets.length > VISUAL_COMPLETION_LIMITS.targets)
    return fail(
      "visual-coverage",
      `Declared visuals contain ${targets.length} targets; at most 128 can be assessed in one review. Split the edit into bounded stages; coverage is incomplete.`,
    );
  const frames = new Set<number>(),
    duration = document.format.durationInFrames,
    step = Math.max(1, Math.floor(document.format.fps / 4));
  const relevant = (f: number) => targets.some((t) => f >= t.from && f < t.to);
  const add = (f: number) => {
    if (Number.isInteger(f) && f >= 0 && f < duration && relevant(f))
      frames.add(f);
  };
  for (const t of targets) {
    add(t.from);
    add(t.to - 1);
    for (let f = t.from; f < t.to; f += step) {
      add(f);
      if (frames.size > 192) break;
    }
    if (frames.size > 192) break;
  }
  function events(node: SceneNodeInput, start: number, end: number) {
    const from = start + (node.from ?? 0),
      to = Math.min(end, from + (node.duration ?? end - from));
    for (const point of [from, to])
      for (const delta of [-1, 0, 1]) add(point + delta);
    for (const animation of node.animations ?? [])
      if (animation.kind === "keyframes")
        for (const key of animation.frames)
          for (const delta of [-1, 0, 1]) add(from + key.frame + delta);
    node.children?.forEach((child) => events(child, from, to));
  }
  document.items.forEach((item) => events(item.node, 0, duration));
  if (frames.size > 192)
    return fail(
      "visual-coverage",
      `The declared visuals require ${frames.size} event/interval samples, exceeding 192. No full visibility or reading-hold pass is claimed; shorten/split the reviewed edit.`,
    );
  const scene = compileVideoProjectDocument(
    document,
    Object.fromEntries(
      Object.keys(document.assets).map((id) => [id, `asset:${id}`]),
    ),
  ).scene;
  const sorted = [...frames].sort((a, b) => a - b),
    holds = new Map(
      targets.map((t) => [
        t.id,
        {
          last: -1,
          run: 0,
          best: 0,
          reason: "Visible interval is too short",
          seen: 0,
        },
      ]),
    );
  const canvas = {
    x: 0,
    y: 0,
    width: document.format.width,
    height: document.format.height,
  };
  for (const frame of sorted) {
    const groups = diagnosticDisplayList(scene, frame).groups;
    const found = new Map<
        string,
        {
          group: DisplayGroup;
          opacity: number;
          clips: Rect[];
          unknown: boolean;
        }
      >(),
      covers: Array<{ id: string; order: number; rect: Rect }> = [];
    function visit(
      g: DisplayGroup,
      opacity: number,
      clips: Rect[],
      opaque: boolean,
      unknown: boolean,
    ) {
      const alpha = opacity * g.composite.opacity,
        complex =
          unknown ||
          !!g.mask ||
          !!g.composite.filter ||
          !!g.composite.backdropFilter ||
          g.composite.blendMode !== "source-over";
      const ownClip = g.clip ? innerRect(g, g.clip) : undefined,
        ownClips = ownClip ? [...clips, ownClip] : clips;
      const safe =
        opaque &&
        g.composite.opacity === 1 &&
        !complex &&
        (!g.clip || !!ownClip);
      const background = g.background;
      if (
        safe &&
        background?.paint.kind === "color" &&
        parseColor(background.paint.source)?.a === 1
      ) {
        let r = innerRect(g, background.geometry);
        if (r) {
          for (const clip of ownClips) r = intersect(r, clip);
          if (area(r) > 0)
            covers.push({ id: g.nodeId, order: g.paintOrder, rect: r });
        }
      }
      const overflow = g.overflowClip
          ? innerRect(g, g.overflowClip)
          : undefined,
        nextClips = overflow ? [...ownClips, overflow] : ownClips;
      const shape = g.content;
      if (
        safe &&
        (!g.overflowClip || !!overflow) &&
        shape?.kind === "shape" &&
        shape.geometry.kind === "rounded-rect" &&
        shape.fill?.kind === "color" &&
        parseColor(shape.fill.source)?.a === 1
      ) {
        let r = innerRect(g, shape.geometry);
        if (r) {
          for (const clip of nextClips) r = intersect(r, clip);
          if (area(r) > 0)
            covers.push({ id: g.nodeId, order: g.paintOrder, rect: r });
        }
      }
      found.set(g.nodeId, {
        group: g,
        opacity: alpha,
        clips: nextClips,
        unknown:
          complex || (!!g.clip && !ownClip) || (!!g.overflowClip && !overflow),
      });
      g.children.forEach((child) =>
        visit(
          child,
          alpha,
          nextClips,
          safe && (!g.overflowClip || !!overflow),
          complex,
        ),
      );
    }
    groups.forEach((g) => visit(g, 1, [], true, false));
    for (const target of targets) {
      if (frame < target.from || frame >= target.to) continue;
      const state = holds.get(target.id)!,
        sample = found.get(target.id);
      let good = false,
        reason = "Layer inactive or absent";
      if (sample) {
        state.seen++;
        const g = sample.group,
          rects = paintedRects(g),
          total = rectangleUnionArea(rects);
        let visible = 0,
          covered = 0;
        for (const rect of rects) {
          let r = intersect(rect, canvas);
          for (const clip of sample.clips) r = intersect(r, clip);
          visible += area(r);
          covered += rectangleUnionArea(
            covers
              .filter((c) => c.order > g.paintOrder)
              .map((c) => intersect(c.rect, r)),
          );
        }
        const ink =
          g.content?.kind === "text" ? (parseColor(g.content.fill)?.a ?? 1) : 1;
        const fraction =
          total > 0 ? Math.max(0, (visible - covered) / total) : 0;
        good =
          !sample.unknown &&
          sample.opacity * ink > 0.15 &&
          fraction >= target.minimumVisibleFraction;
        reason = sample.unknown
          ? "Complex mask/filter requires separate rendered inspection"
          : sample.opacity * ink <= 0.15
            ? "Layer is transparent"
            : `Only ${Math.round(fraction * 100)}% of estimated content bounds is unobscured`;
      }
      if (good) {
        state.run =
          state.last >= 0 && frame - state.last <= step
            ? state.run + frame - state.last
            : 1;
        state.last = frame;
        state.best = Math.max(state.best, state.run);
      } else {
        state.last = -1;
        state.run = 0;
        state.reason = `frame ${frame}: ${reason}`;
      }
    }
  }
  const failures = targets.filter(
    (t) => holds.get(t.id)!.best < t.minimumFrames,
  );
  if (failures.length)
    return fail(
      "visual-completion",
      failures
        .slice(0, 5)
        .map((t) => {
          const s = holds.get(t.id)!;
          if (!s.seen) s.reason = "No active rendered sample";
          return `Item "${t.itemId}" node "${t.id}": sampled clear hold ${Math.round((s.best * 1000) / document.format.fps)}ms, needs ${Math.round((t.minimumFrames * 1000) / document.format.fps)}ms; ${s.reason}. Preserve required content and repair placement/paint order/hold.`;
        })
        .join(" ")
        .slice(0, 1900),
    );
  return [
    {
      id: "visual-completion",
      passed: true,
      message: `Assessed ${targets.length} required visuals at ${sorted.length} event/interval frames (${sorted.join(",")}). Unobscured bounds (85% for text/images, 50% for source video with overlays) and sampled reading holds passed; intervening motion and audio remain ungraded.`,
    },
  ];
}
