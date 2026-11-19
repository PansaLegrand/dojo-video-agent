export const graphicsFeatures = ["clip", "mask", "effect"] as const;
export type GraphicsFeature = (typeof graphicsFeatures)[number];

const surface = {
  type: "div", from: 0, duration: 60,
  style: { position: "absolute", width: 320, height: 180, backgroundColor: "#22d3ee" },
};
const descriptors = {
  clip: {
    usage: "Set node.clip to a closed shape on a visual node. Polygon points are relative to the node box; path coordinates use its viewBox. A clip is not a node type.",
    example: { ...surface, clip: { kind: "ellipse" } },
  },
  mask: {
    usage: "Set node.mask.shape on a visual node. Animate mask.opacity (0..1), mask.feather (0..256 pixels) or mask.radius (rect only). Keyframe times are local to the masked node.",
    example: { ...surface, mask: { shape: { kind: "rect", radius: 12 }, feather: 4 },
      animations: [{ kind: "keyframes", property: "mask.opacity",
        frames: [{ frame: 0, value: 0 }, { frame: 24, value: 1 }] }] },
  },
  effect: {
    usage: "Use type:effect with an installed preset in node.effect. params apply only to an effect node. Presets listed in requiresAudioAssetId require an existing project audio asset in params.audioAssetId.",
    example: { type: "effect", from: 0, duration: 60, effect: "confettiBurst",
      style: { position: "absolute", inset: 0 }, params: { intensity: "medium", seed: 7 } },
  },
};

export function focusedGraphicsDescriptor(kind: GraphicsFeature, grammar: Record<string, unknown>) {
  const descriptor = { version: 1, kind, ...grammar, ...structuredClone(descriptors[kind]) };
  if (new TextEncoder().encode(JSON.stringify(descriptor)).byteLength > 8192)
    throw new Error("Focused graphics descriptor exceeds its 8 KiB bound.");
  return descriptor;
}
