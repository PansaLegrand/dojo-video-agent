import { parseColor, type DisplayGroup } from "@dojo-video-engine/core";

type Bounds = DisplayGroup["transformedBounds"];
type Clip = { id: string; bounds: Bounds; parent?: Clip };

function intersection(first: Bounds, second: Bounds) {
  const x = Math.max(first.x, second.x),
    y = Math.max(first.y, second.y);
  return {
    x,
    y,
    width: Math.min(first.x + first.width, second.x + second.width) - x,
    height: Math.min(first.y + first.height, second.y + second.height) - y,
  };
}
export function boundsText(bounds: Bounds) {
  return [bounds.x, bounds.y, bounds.width, bounds.height]
    .map((value) => Math.round(value * 10) / 10)
    .join(", ");
}
export function solidCanvasBackground(group: DisplayGroup, canvas: Bounds) {
  const { background, worldTransform, composite } = group;
  if (
    group.nodeType !== "div" ||
    group.clip ||
    group.mask ||
    composite.opacity !== 1 ||
    composite.filter ||
    composite.blendMode !== "source-over" ||
    worldTransform.b !== 0 ||
    worldTransform.c !== 0 ||
    background?.geometry.kind !== "rounded-rect" ||
    Object.values(background.geometry.radii).some((radius) => radius !== 0) ||
    background.paint.kind !== "color" ||
    parseColor(background.paint.source)?.a !== 1
  )
    return false;
  const bounds = group.transformedBounds;
  return (
    bounds.x <= 0 &&
    bounds.y <= 0 &&
    bounds.x + bounds.width >= canvas.width &&
    bounds.y + bounds.height >= canvas.height
  );
}

export function assertEndingFrame(
  groups: readonly DisplayGroup[],
  expected: ReadonlyMap<string, string>,
  frame: number,
  canvas: Bounds,
) {
  const seen = new Set<string>();
  let coverIndex = -1;
  groups.forEach((group, index) => {
    if (!group.children.length && solidCanvasBackground(group, canvas)) coverIndex = index;
  });
  const fail = (id: string, why: string): never => {
    throw Error(
      `Ending "${expected.get(id)}", text "${id}", final frame ${frame}: ${why}`,
    );
  };
  const visit = (
    group: DisplayGroup,
    rootIndex: number,
    opacity: number,
    ancestorClip?: Clip,
  ) => {
    const visibleAlpha = opacity * group.composite.opacity;
    const clip =
      group.overflowClip ||
      group.clip?.kind === "rounded-rect" ||
      group.clip?.kind === "ellipse"
        ? {
            id: group.nodeId,
            bounds: group.transformedBounds,
            parent: ancestorClip,
          }
        : ancestorClip;
    if (expected.has(group.nodeId)) {
      const id = group.nodeId,
        text = group.content;
      if (text?.kind !== "text" || !text.lines.some((line) => line.text.trim()))
        fail(
          id,
          "no text line is painted; keep the closing copy on screen through the end.",
        );
      if (visibleAlpha === 0)
        fail(
          id,
          "the text or an ancestor has zero opacity; keep the closing copy visible through the end.",
        );
      if (
        text?.kind === "text" &&
        !group.node.runs?.length &&
        !text.stroke &&
        !text.shadow &&
        (text.fill === "transparent" || parseColor(text.fill)?.a === 0)
      )
        fail(
          id,
          "the final text fill is transparent; keep the closing copy visible through the end.",
        );
      const bounds = group.transformedBounds;
      let visible = intersection(bounds, canvas);
      if (visible.width <= 0 || visible.height <= 0)
        fail(
          id,
          `text bounds [${boundsText(bounds)}] have no area on the canvas. Reposition or resize the closing copy.`,
        );
      for (let ancestor = clip; ancestor; ancestor = ancestor.parent) {
        visible = intersection(visible, ancestor.bounds);
        if (visible.width <= 0 || visible.height <= 0)
          fail(
            id,
            `text bounds [${boundsText(bounds)}] are clipped out by "${ancestor.id}" [${boundsText(ancestor.bounds)}]. Move the text inside the clipping region or enlarge it.`,
          );
      }
      if (rootIndex < coverIndex)
        fail(
          id,
          `opaque full-canvas layer "${groups[coverIndex]!.nodeId}" paints later. Move the closing text above it or end the covering layer earlier.`,
        );
      seen.add(id);
    }
    for (const child of group.children)
      visit(child, rootIndex, visibleAlpha, clip);
  };
  groups.forEach((root, index) => visit(root, index, 1));
  for (const id of expected.keys())
    if (!seen.has(id))
      fail(
        id,
        "the text layer is inactive or hidden; extend its visible interval to the end.",
      );
}
