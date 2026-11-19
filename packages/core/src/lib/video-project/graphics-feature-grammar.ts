import { animationTargets, audioReactiveEffectNames, effectNames, effectParamsSchema, maskDescriptorSchema, shapeGeometrySchema } from "@dojo-video-engine/schema";
import { z } from "zod/v3";
import { zodToJsonSchema } from "zod-to-json-schema";

function fields(schema: z.ZodTypeAny) {
  const { $schema: _dialect, ...data } = zodToJsonSchema(schema, { $refStrategy: "none" });
  return data;
}

export function graphicsFeatureGrammar(kind: "clip" | "mask" | "effect") {
  if (kind === "effect") return {
    fields: { effect: { type: "string", enum: [...effectNames] }, params: fields(effectParamsSchema) },
    requiresAudioAssetId: [...audioReactiveEffectNames],
  };
  const closedShape = { anyOf: shapeGeometrySchema.options
    .filter(option => !["line", "polyline"].includes(option.shape.kind.value)).map(fields) };
  if (kind === "clip") return { fields: { clip: closedShape } };
  const mask = fields(maskDescriptorSchema);
  if (!("properties" in mask)) throw new Error("The installed mask schema has no fields.");
  return {
    fields: { mask: { ...mask, properties: { ...mask.properties, shape: closedShape } } },
    animationTargets: animationTargets.filter(target => target.startsWith("mask.")),
  };
}
