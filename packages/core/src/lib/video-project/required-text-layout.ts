import {
  parseColor,
  transformLayoutRect,
  type DisplayGroup,
  type DisplayTextOperation,
} from "@dojo-video-engine/core";
import type { CompletionRequirement } from "@dojo-video/agent-kit";
import { boundsText, solidCanvasBackground } from "./ending-frame-visibility";

import { opaqueContentCovers } from "./opaque-content-cover";

type Bounds = DisplayGroup["box"];
type Clip = { id: string; bounds: Bounds; parent?: Clip };
type Issue = {
  code: "text-overflow" | "text-clipped" | "text-occluded" | "image-occluded";
  detail: string;
};
export class RequiredTextLayoutError extends Error {
  constructor(
    readonly checkId: Issue["code"],
    message: string,
  ) {
    super(message);
  }
}

function contains(outer: Bounds, inner: Bounds) {
  return (
    inner.x >= outer.x - 1 &&
    inner.y >= outer.y - 1 &&
    inner.x + inner.width <= outer.x + outer.width + 1 &&
    inner.y + inner.height <= outer.y + outer.height + 1
  );
}

function enclosesCanvas(outer: Bounds, canvas: Bounds) {
  return (
    outer.x <= canvas.x &&
    outer.y <= canvas.y &&
    outer.x + outer.width >= canvas.x + canvas.width &&
    outer.y + outer.height >= canvas.y + canvas.height
  );
}

// Only count covers whose entire ancestor chain preserves opaque source-over paint.
function lastCanvasCover(
  groups: readonly DisplayGroup[],
  canvas: Bounds,
): DisplayGroup | undefined {
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]!;
    if (
      g.mask ||
      g.clip ||
      g.composite.opacity !== 1 ||
      g.composite.filter ||
      g.composite.blendMode !== "source-over"
    )
      continue;
    const clip = g.overflowClip;
    const fullViewport =
      clip?.kind === "rounded-rect" &&
      Object.values(clip.radii).every((radius) => radius === 0) &&
      g.worldTransform.b === 0 &&
      g.worldTransform.c === 0 &&
      enclosesCanvas(transformLayoutRect(g.worldTransform, clip.rect), canvas);
    const later =
      (!clip || fullViewport) && lastCanvasCover(g.children, canvas);
    if (later) return later;
    if (solidCanvasBackground(g, canvas)) return g;
  }
}

function visibleText(text: DisplayTextOperation, opacity: number) {
  const ink = (fill: string) =>
    fill === "transparent" ? 0 : (parseColor(fill)?.a ?? 1);
  if (text.lines.some((line) => line.runs.length))
    return text.lines.some((line) =>
      line.runs.some(
        (run) =>
          run.text.trim() &&
          opacity * run.opacity * (run.stroke ? 1 : ink(run.fill)) > 0.15,
      ),
    );
  return !!text.stroke || !!text.shadow || opacity * ink(text.fill) > 0.15;
}

function textIssue(
  g: DisplayGroup,
  text: DisplayTextOperation,
  exact: boolean,
  clip?: Clip,
): Issue | undefined {
  const { width, height } = g.contentBox;
  const box = `content box [${boundsText(g.contentBox)}]`;
  if (width <= 0 || height <= 0)
    return {
      code: "text-overflow",
      detail: `padding leaves no drawable area in ${box}. Enlarge the box or reduce its padding.`,
    };
  const normalize = (value: string) => value.replace(/\s/gu, "");
  const intentionalTruncation =
    g.node.style.textFit === "truncate" ||
    g.node.style.textOverflow === "ellipsis";
  if (
    (exact || !intentionalTruncation) &&
    normalize(text.lines.map((line) => line.text).join("")) !==
      normalize(text.value)
  ) {
    return {
      code: "text-overflow",
      detail: `maxLines/textFit drops authored copy in ${box}. Widen the box, allow more lines, or use shrink with enough height.`,
    };
  }
  const blockHeight = text.lines.length * text.lineHeight;
  if (text.lines.length > 1 && blockHeight > height + 1)
    return {
      code: "text-overflow",
      detail: `${text.lines.length} laid-out lines need ${Math.round(blockHeight)}px of height in ${box}. Increase the height or fit the entire text.`,
    };
  for (const line of text.lines) {
    if (!line.text.trim()) continue;
    if (line.maxWidth === null && line.width > width + 1)
      return {
        code: "text-overflow",
        detail: `rich-text line width ${Math.round(line.width)}px exceeds ${box}. Widen the text box or fit the text.`,
      };
    if (!clip) continue;
    // Plain text x is its alignment anchor. Styled runs use their positioned line start.
    const x =
      line.maxWidth === null || text.align === "left"
        ? line.x
        : text.align === "center"
          ? line.x - line.width / 2
          : line.x - line.width;
    const bounds = transformLayoutRect(g.worldTransform, {
      x,
      y: line.y - text.font.size / 2,
      width: line.width,
      height: text.font.size,
    });
    for (
      let ancestor: Clip | undefined = clip;
      ancestor;
      ancestor = ancestor.parent
    ) {
      if (!contains(ancestor.bounds, bounds))
        return {
          code: "text-clipped",
          detail: `line bounds [${boundsText(bounds)}] extend outside clip "${ancestor.id}" [${boundsText(ancestor.bounds)}]. Move the copy inside the clip or enlarge it.`,
        };
    }
  }
}

/** A reveal may briefly obscure copy. Require at least one clear sample for each
 * assessed text node and value. Reuse the same display lists as the other checks. */
export function requiredTextLayoutReview(
  requirements: CompletionRequirement[],
  canvas: Bounds,
  rootForItem: ReadonlyMap<string, string>,
  policy: "sampled-v1" | "sampled-v2" = "sampled-v1",
) {
  const items = new Set<string>(),
    exactItems = new Set<string>();
  const nodeTargets = new Map<string, Set<string>>();
  const exactNodes = new Set<string>();
  const endings = new Set<string>();
  for (const r of requirements) {
    if (
      r.kind === "property" &&
      (r.target.kind === "node" ||
        (r.target.kind === "item" && r.path[0] === "node"))
    ) {
      const { itemId } = r.target;
      let nodeId =
        r.target.kind === "node" ? r.target.nodeId : rootForItem.get(itemId);
      let offset = r.target.kind === "node" ? 0 : 1;
      // Both item.node and node targets can address descendants by stable child ID.
      while (r.path[offset] === "children" && r.path[offset + 1]) {
        nodeId = r.path[offset + 1];
        offset += 2;
      }
      if (!nodeId) continue;
      const ids = nodeTargets.get(itemId) ?? new Set<string>();
      ids.add(nodeId);
      nodeTargets.set(itemId, ids);
      if (r.path[offset] === "text" || r.path[offset] === "runs")
        exactNodes.add(nodeId);
    } else if (r.kind === "caption_pair") {
      items.add(r.originalItemId);
      items.add(r.translatedItemId);
      exactItems.add(r.originalItemId);
      exactItems.add(r.translatedItemId);
    } else if (
      r.kind === "item_present" ||
      r.kind === "appended_ending" ||
      r.kind === "speech_callout" ||
      r.kind === "speech_highlight"
    ) {
      items.add(r.itemId);
      if (r.kind !== "item_present") exactItems.add(r.itemId);
      if (r.kind === "appended_ending") endings.add(r.itemId);
    } else if (r.kind === "property" && "itemId" in r.target) {
      items.add(r.target.itemId);
      if (r.target.kind === "cue" && r.path[0] === "text")
        exactItems.add(r.target.itemId);
    }
  }
  const failures = new Map<string, RequiredTextLayoutError>(),
    clear = new Set<string>();
  return {
    sample(
      groups: readonly DisplayGroup[],
      frame: number,
      itemFor: (nodeId: string) => string | undefined,
      finalEndingFrame: boolean,
    ) {
      if (!items.size && !nodeTargets.size) return;
      const cover = lastCanvasCover(groups, canvas);
      const contentCover =
        policy === "sampled-v2" ? opaqueContentCovers(groups) : undefined;
      function visit(
        g: DisplayGroup,
        opacity: number,
        inTarget: boolean,
        parentClip?: Clip,
      ) {
        const alpha = opacity * g.composite.opacity;
        if (alpha <= 0.15) return;
        const item = itemFor(g.nodeId);
        const target =
          inTarget ||
          (!!item &&
            (items.has(item) || nodeTargets.get(item)?.has(g.nodeId) === true));
        let clip = parentClip;
        for (const geometry of [g.overflowClip, g.clip]) {
          if (geometry?.kind === "rounded-rect" || geometry?.kind === "ellipse")
            clip = {
              id: g.nodeId,
              bounds: transformLayoutRect(g.worldTransform, geometry.rect),
              parent: clip,
            };
        }
        const text = g.content;
        if (target && item && g.nodeType === "img" && contentCover) {
          const key = JSON.stringify([g.nodeId, "image", g.node.assetId]);
          const imageCover = contentCover(g);
          if (!imageCover) {
            clear.add(key);
            failures.delete(key);
          } else if (!clear.has(key) && !failures.has(key))
            failures.set(
              key,
              new RequiredTextLayoutError(
                "image-occluded",
                `Item "${item}", image "${g.nodeId}", frame ${frame}: opaque layer "${imageCover.nodeId}" paints later and covers the complete image. Move the image above it or shorten the cover’s interval.`,
              ),
            );
        }
        if (
          target &&
          item &&
          text?.kind === "text" &&
          text.value.trim() &&
          visibleText(text, alpha)
        ) {
          const key = JSON.stringify([g.nodeId, text.value]);
          const finalCopy = finalEndingFrame && endings.has(item);
          if (finalCopy || !clear.has(key)) {
            const localCover = contentCover?.(g);
            const issue: Issue | undefined = localCover
              ? {
                  code: "text-occluded",
                  detail: `opaque layer "${localCover.nodeId}" paints later and covers the complete text box. Move the text above it or shorten the cover’s interval.`,
                }
              : cover && cover.paintOrder > g.paintOrder
                ? {
                    code: "text-occluded",
                    detail: `opaque full-canvas layer "${cover.nodeId}" paints later. Move the text above it or shorten the cover's interval.`,
                  }
                : textIssue(
                    g,
                    text,
                    exactItems.has(item) || exactNodes.has(g.nodeId),
                    clip,
                  );
            if (issue && (finalCopy || !failures.has(key))) {
              const error = new RequiredTextLayoutError(
                issue.code,
                `Item "${item}", text "${g.nodeId}", frame ${frame}: ${issue.detail}`,
              );
              if (finalCopy) throw error;
              failures.set(key, error);
            }
            if (!issue) {
              clear.add(key);
              failures.delete(key);
            }
          }
        }
        for (const child of g.children) visit(child, alpha, target, clip);
      }
      for (const group of groups) visit(group, 1, false);
    },
    finish() {
      const first = failures.values().next().value;
      if (first) throw first;
    },
  };
}
