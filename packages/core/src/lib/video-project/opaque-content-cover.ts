import {
  parseColor,
  pointInRoundedLayoutRect,
  type DisplayGroup,
} from "@dojo-video-engine/core";

type Bounds = DisplayGroup["transformedBounds"];
type Contains = (bounds: Bounds) => boolean;

/** Prove containment in a convex painted rectangle, including rounded corners.
 * A bounding-box overlap alone is never sufficient evidence of occlusion. */
function containment(
  group: DisplayGroup,
  geometry: DisplayGroup["clip"],
): Contains | undefined {
  const m = group.worldTransform;
  if (
    geometry?.kind !== "rounded-rect" ||
    m.b !== 0 ||
    m.c !== 0 ||
    !m.a ||
    !m.d
  )
    return;
  return (bounds) =>
    bounds.width > 0 &&
    bounds.height > 0 &&
    [bounds.x, bounds.x + bounds.width].every((x) =>
      [bounds.y, bounds.y + bounds.height].every((y) =>
        pointInRoundedLayoutRect(
          { x: (x - m.e) / m.a, y: (y - m.f) / m.d },
          geometry.rect,
          geometry.radii,
        ),
      ),
    );
}

/** Conservative positive proof only: ignore masks, filters, translucent paint,
 * non-source-over compositing and unsupported clipping/transform geometry. */
export function opaqueContentCovers(groups: readonly DisplayGroup[]) {
  const covers: Array<{
    nodeId: string;
    paintOrder: number;
    contains: Contains;
  }> = [];
  function visit(group: DisplayGroup, clips: Contains[]) {
    const { composite, background } = group;
    if (
      group.mask ||
      composite.opacity !== 1 ||
      composite.filter ||
      composite.backdropFilter ||
      composite.blendMode !== "source-over"
    )
      return;
    let ownClips = clips;
    if (group.clip) {
      const clip = containment(group, group.clip);
      if (!clip) return;
      ownClips = [...clips, clip];
    }
    const contains = background && containment(group, background.geometry);
    if (
      contains &&
      background?.paint.kind === "color" &&
      parseColor(background.paint.source)?.a === 1
    ) {
      covers.push({
        nodeId: group.nodeId,
        paintOrder: group.paintOrder,
        contains: (bounds) =>
          contains(bounds) && ownClips.every((clip) => clip(bounds)),
      });
    }
    // Overflow clips descendants, but is applied after this group's background.
    let childClips = ownClips;
    if (group.overflowClip) {
      const clip = containment(group, group.overflowClip);
      if (!clip) return;
      childClips = [...ownClips, clip];
    }
    group.children.forEach((child) => visit(child, childClips));
  }
  groups.forEach((group) => visit(group, []));
  return (target: DisplayGroup) =>
    covers.find(
      (cover) =>
        cover.paintOrder > target.paintOrder &&
        cover.contains(target.transformedBounds),
    );
}
