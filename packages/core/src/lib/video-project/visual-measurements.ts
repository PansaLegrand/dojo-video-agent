import { applyEasing } from "@dojo-video-engine/core";
import { z } from "zod/v3";

const fraction = z.number().finite().min(0).max(1);
const coordinate = z.number().int().nonnegative().max(1024);
export const visualRegionSchema = z
  .object({
    x: fraction,
    y: fraction,
    width: fraction.positive(),
    height: fraction.positive(),
  })
  .strict()
  .refine(
    (region) => region.x + region.width <= 1 && region.y + region.height <= 1,
    "The region must fit inside the frame.",
  );
export const visualAnalysisRequestSchema = z
  .object({
    region: visualRegionSchema.optional(),
    background: z
      .tuple([coordinate.max(255), coordinate.max(255), coordinate.max(255)])
      .optional(),
  })
  .strict();
export type VisualAnalysisRequest = z.infer<typeof visualAnalysisRequestSchema>;
export const frameMeasurementsSchema = z
  .object({
    algorithm: z.literal("dojo-frame-measurements-v1"),
    width: coordinate.positive(),
    height: coordinate.positive(),
    meanLuma: z.number().finite().min(0).max(255),
    edgeDetailRatio: fraction,
    chromaAccentRatio: fraction,
    foreground: z
      .object({
        status: z.enum(["measured", "empty", "unresolved"]),
        background: z.tuple([
          z.number().min(0).max(255),
          z.number().min(0).max(255),
          z.number().min(0).max(255),
        ]),
        region: z.tuple([
          coordinate,
          coordinate,
          coordinate.positive(),
          coordinate.positive(),
        ]),
        bbox: z
          .tuple([
            coordinate,
            coordinate,
            coordinate.positive(),
            coordinate.positive(),
          ])
          .nullable(),
        centroid: z
          .tuple([
            z.number().finite().nonnegative().max(1024),
            z.number().finite().nonnegative().max(1024),
          ])
          .nullable(),
        pixelCount: z.number().int().nonnegative().max(1048576),
        touchesRegionEdge: z.boolean(),
        touchesFrameEdge: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type FrameMeasurements = z.infer<typeof frameMeasurementsSchema>;
export const contactSheetSchema = z
  .object({
    version: z.literal(1),
    coverage: z.literal("sampled-interval-strip"),
    unit: z.enum(["source-ms", "timeline-frames"]),
    columns: z.number().int().min(1).max(4),
    rows: z.number().int().min(1).max(16),
    everyNthFrame: z.number().int().positive().nullable(),
    tiles: z
      .array(
        z
          .object({
            position: z.number().finite().nonnegative(),
            actualMs: z.number().finite().min(-60000),
            durationMs: z.number().finite().positive().nullable(),
            rect: z.tuple([
              coordinate,
              coordinate,
              coordinate.positive(),
              coordinate.positive(),
            ]),
            measurements: frameMeasurementsSchema,
          })
          .strict(),
      )
      .min(4)
      .max(16),
  })
  .strict();
export type ContactSheet = z.infer<typeof contactSheetSchema>;
export const VISUAL_SEQUENCE_LIMITS = Object.freeze({
  tiles: 16,
  decodedFramesPerRun: 64,
  labelHeight: 18,
});

export function inspectionImageCount(request: {
  contactSheet?: boolean;
  momentsMs?: readonly number[];
  frames?: readonly number[];
}) {
  return request.contactSheet
    ? 1
    : (request.momentsMs ?? request.frames ?? []).length;
}
export function intervalSamples(
  start: number,
  end: number,
  count: number,
  integer = false,
) {
  if (
    ![start, end].every(Number.isFinite) ||
    start < 0 ||
    end <= start ||
    !Number.isInteger(count) ||
    count < 4 ||
    count > 16
  )
    throw new Error("Choose an increasing interval and 4–16 samples.");
  const samples = Array.from(
    { length: count },
    (_, index) => start + ((end - start) * index) / (count - 1),
  );
  const result = integer ? samples.map(Math.round) : samples;
  if (new Set(result).size !== count)
    throw new Error("The interval is too short for distinct samples.");
  return result;
}
export function contactSheetLayout(
  width: number,
  height: number,
  count: number,
  maxDimension: number,
) {
  if (
    ![width, height, count, maxDimension].every(Number.isSafeInteger) ||
    width <= 0 ||
    height <= 0 ||
    count < 4 ||
    count > 16 ||
    maxDimension < 64 ||
    maxDimension > 768
  )
    throw new Error("Invalid bounded contact-sheet dimensions.");
  const columns = Math.min(4, count),
    rows = Math.ceil(count / columns);
  if (maxDimension < rows * (VISUAL_SEQUENCE_LIMITS.labelHeight + 1))
    throw new Error("The contact-sheet allowance is too small for its labels and tiles.");
  const scale = Math.min(
    1,
    Math.floor(maxDimension / columns) / width,
    (Math.floor(maxDimension / rows) - VISUAL_SEQUENCE_LIMITS.labelHeight) /
      height,
  );
  const tileWidth = Math.max(1, Math.floor(width * scale)),
    tileHeight = Math.max(1, Math.floor(height * scale));
  return {
    columns,
    rows,
    tileWidth,
    tileHeight,
    width: columns * tileWidth,
    height: rows * (tileHeight + VISUAL_SEQUENCE_LIMITS.labelHeight),
  };
}
export function sampledFrameStride(
  tiles: ContactSheet["tiles"],
  unit: ContactSheet["unit"],
) {
  if (tiles.length < 2) return null;
  const duration = tiles[0]!.durationMs;
  const steps = tiles
    .slice(1)
    .map((tile, index) =>
      unit === "timeline-frames"
        ? tile.position - tiles[index]!.position
        : duration
          ? (tile.actualMs - tiles[index]!.actualMs) / duration
          : NaN,
    );
  const step = Math.round(steps[0]!);
  if (
    step < 1 ||
    steps.some(
      (value) => !Number.isFinite(value) || Math.abs(value - step) > 0.001,
    ) ||
    (unit === "source-ms" &&
      tiles.some(
        (tile) =>
          !tile.durationMs ||
          !duration ||
          Math.abs(tile.durationMs - duration) > 0.001,
      ))
  )
    return null;
  return step;
}

export function validateContactSheet(
  sheet: ContactSheet,
  positions: readonly number[],
  width: number,
  height: number,
  analysis: VisualAnalysisRequest = {},
) {
  contactSheetSchema.parse(sheet);
  if (sheet.everyNthFrame !== sampledFrameStride(sheet.tiles, sheet.unit))
    throw new Error("Contact-sheet sampling stride changed.");
  if (
    sheet.tiles.length !== positions.length ||
    sheet.rows !== Math.ceil(positions.length / sheet.columns) ||
    width % sheet.columns ||
    height % sheet.rows
  )
    throw new Error(
      "Contact-sheet layout or coverage differs from its request.",
    );
  const tileWidth = width / sheet.columns,
    cellHeight = height / sheet.rows;
  for (const [index, tile] of sheet.tiles.entries()) {
    const expected = [
      (index % sheet.columns) * tileWidth,
      Math.floor(index / sheet.columns) * cellHeight,
      tileWidth,
      cellHeight - VISUAL_SEQUENCE_LIMITS.labelHeight,
    ];
    if (
      tile.position !== positions[index] ||
      tile.rect.some((value, axis) => value !== expected[axis])
    )
      throw new Error(
        "A contact-sheet tile changed position, order or bounds.",
      );
    validateFrameMeasurements(
      tile.measurements,
      tile.rect[2],
      tile.rect[3],
      analysis,
    );
  }
}
export function validateFrameMeasurements(
  raw: unknown,
  width: number,
  height: number,
  analysis?: VisualAnalysisRequest,
): FrameMeasurements {
  const value = frameMeasurementsSchema.parse(raw),
    f = value.foreground;
  const [x, y, w, h] = f.region;
  if (analysis) {
    const region = analysis.region ?? { x: 0, y: 0, width: 1, height: 1 };
    const left = Math.floor(region.x * width),
      top = Math.floor(region.y * height);
    const expected = [
      left,
      top,
      Math.ceil((region.x + region.width) * width) - left,
      Math.ceil((region.y + region.height) * height) - top,
    ];
    if (
      f.region.some((value, index) => value !== expected[index]) ||
      (analysis.background &&
        f.background.some(
          (value, index) => value !== analysis.background![index],
        ))
    )
      throw new Error(
        "Measurements do not match the approved region or background.",
      );
  }
  if (
    value.width !== width ||
    value.height !== height ||
    x + w > width ||
    y + h > height ||
    f.pixelCount > w * h
  )
    throw new Error("Measurements do not match their image dimensions.");
  if (f.status === "measured") {
    const b = f.bbox,
      c = f.centroid;
    if (
      !b ||
      !c ||
      !f.pixelCount ||
      b[0] < x ||
      b[1] < y ||
      b[0] + b[2] > x + w ||
      b[1] + b[3] > y + h ||
      f.pixelCount > b[2] * b[3] ||
      c[0] < b[0] ||
      c[0] > b[0] + b[2] ||
      c[1] < b[1] ||
      c[1] > b[1] + b[3] ||
      f.touchesRegionEdge !==
        (b[0] === x ||
          b[1] === y ||
          b[0] + b[2] === x + w ||
          b[1] + b[3] === y + h) ||
      f.touchesFrameEdge !==
        (b[0] === 0 ||
          b[1] === 0 ||
          b[0] + b[2] === width ||
          b[1] + b[3] === height)
    )
      throw new Error("Foreground measurements are internally inconsistent.");
  } else if (
    f.bbox ||
    f.centroid ||
    f.pixelCount ||
    f.touchesRegionEdge ||
    f.touchesFrameEdge
  )
    throw new Error("Unmeasured foreground must not claim geometry.");
  return value;
}

/** Measurements describe the sampled pixels. They do not grade aesthetic quality. */
export function measureFrame(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  request: VisualAnalysisRequest = {},
): FrameMeasurements {
  visualAnalysisRequestSchema.parse(request);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 1024 ||
    height > 1024 ||
    rgba.length !== width * height * 4
  )
    throw new Error("Frame measurements require a bounded RGBA image.");
  const region = request.region ?? { x: 0, y: 0, width: 1, height: 1 };
  const left = Math.floor(region.x * width),
    top = Math.floor(region.y * height);
  const right = Math.min(width, Math.ceil((region.x + region.width) * width)),
    bottom = Math.min(height, Math.ceil((region.y + region.height) * height));
  const pixel = (x: number, y: number) => {
    const at = (y * width + x) * 4,
      alpha = rgba[at + 3]! / 255;
    return [rgba[at]! * alpha, rgba[at + 1]! * alpha, rgba[at + 2]! * alpha];
  };
  const corners = [
    pixel(left, top),
    pixel(right - 1, top),
    pixel(left, bottom - 1),
    pixel(right - 1, bottom - 1),
  ];
  const background =
    request.background ??
    [0, 1, 2].map(
      (channel) => corners.reduce((sum, p) => sum + p[channel]!, 0) / 4,
    );
  const uniform =
    !!request.background ||
    corners.every((p) =>
      p.every((value, index) => Math.abs(value - background[index]!) <= 12),
    );
  let luma = 0,
    edges = 0,
    accents = 0,
    comparisons = 0,
    count = 0,
    sumX = 0,
    sumY = 0,
    minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  const luminance = (x: number, y: number) => {
    const p = pixel(x, y);
    return p[0]! * 0.2126 + p[1]! * 0.7152 + p[2]! * 0.0722;
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = pixel(x, y),
        light = p[0]! * 0.2126 + p[1]! * 0.7152 + p[2]! * 0.0722;
      luma += light;
      if (Math.max(...p) - Math.min(...p) >= 40 && Math.max(...p) >= 80)
        accents++;
      if (x) {
        comparisons++;
        if (Math.abs(light - luminance(x - 1, y)) >= 24) edges++;
      }
      if (y) {
        comparisons++;
        if (Math.abs(light - luminance(x, y - 1)) >= 24) edges++;
      }
      if (
        uniform &&
        x >= left &&
        x < right &&
        y >= top &&
        y < bottom &&
        p.some((v, i) => Math.abs(v - background[i]!) > 32)
      ) {
        count++;
        sumX += x;
        sumY += y;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  return validateFrameMeasurements(
    {
      algorithm: "dojo-frame-measurements-v1",
      width,
      height,
      meanLuma: luma / (width * height),
      edgeDetailRatio: comparisons ? edges / comparisons : 0,
      chromaAccentRatio: accents / (width * height),
      foreground: {
        status: !uniform ? "unresolved" : count ? "measured" : "empty",
        background,
        region: [left, top, right - left, bottom - top],
        bbox: count ? [minX, minY, maxX - minX + 1, maxY - minY + 1] : null,
        centroid: count ? [sumX / count, sumY / count] : null,
        pixelCount: count,
        touchesRegionEdge:
          !!count &&
          (minX === left ||
            minY === top ||
            maxX === right - 1 ||
            maxY === bottom - 1),
        touchesFrameEdge:
          !!count &&
          (minX === 0 ||
            minY === 0 ||
            maxX === width - 1 ||
            maxY === height - 1),
      },
    },
    width,
    height,
  );
}

export function compareFrameMeasurements(
  reference: FrameMeasurements,
  candidate: FrameMeasurements,
) {
  validateFrameMeasurements(reference, reference.width, reference.height);
  validateFrameMeasurements(candidate, candidate.width, candidate.height);
  const a = reference.foreground,
    b = candidate.foreground;
  if (a.status !== "measured" || b.status !== "measured")
    return {
      status: "blocked" as const,
      reason: "A foreground region is empty or unresolved.",
      referenceStatus: a.status,
      candidateStatus: b.status,
    };
  return {
    status: "measured" as const,
    meanLumaDelta: candidate.meanLuma - reference.meanLuma,
    edgeDetailRatioDelta: candidate.edgeDetailRatio - reference.edgeDetailRatio,
    chromaAccentRatioDelta:
      candidate.chromaAccentRatio - reference.chromaAccentRatio,
    widthRatio: b.bbox![2] / candidate.width / (a.bbox![2] / reference.width),
    heightRatio:
      b.bbox![3] / candidate.height / (a.bbox![3] / reference.height),
    centroidDelta: [
      b.centroid![0] / candidate.width - a.centroid![0] / reference.width,
      b.centroid![1] / candidate.height - a.centroid![1] / reference.height,
    ],
    touchesFrameEdge: b.touchesFrameEdge,
    touchesRegionEdge: b.touchesRegionEdge,
  };
}

export function measureMotion(tiles: ContactSheet["tiles"]) {
  const unresolved = (reason: string) => ({
    status: "unresolved" as const,
    reason,
  });
  if (
    tiles.length < 4 ||
    tiles.some(
      (t) =>
        t.measurements.foreground.status !== "measured" ||
        t.measurements.foreground.touchesRegionEdge,
    )
  )
    return unresolved(
      "Motion needs at least four measured, unclipped foreground samples.",
    );
  const first = tiles[0]!,
    last = tiles.at(-1)!,
    elapsed = last.actualMs - first.actualMs;
  if (
    elapsed <= 0 ||
    tiles.some((t, i) => i > 0 && t.actualMs <= tiles[i - 1]!.actualMs)
  )
    return unresolved("Decoded timestamps must advance.");
  const origin = first.measurements.foreground.centroid!,
    end = last.measurements.foreground.centroid!;
  const dx = end[0] - origin[0],
    dy = end[1] - origin[1],
    distance = Math.hypot(dx, dy);
  if (distance < 3)
    return unresolved("The measured displacement is too small.");
  const area = first.measurements.foreground.pixelCount;
  if (
    tiles.some(
      (t) => Math.abs(t.measurements.foreground.pixelCount / area - 1) > 0.2,
    )
  )
    return unresolved(
      "Foreground area changes prevent a translation estimate.",
    );
  const samples = tiles.map((tile) => {
    const c = tile.measurements.foreground.centroid!,
      x = c[0] - origin[0],
      y = c[1] - origin[1];
    return {
      time: (tile.actualMs - first.actualMs) / elapsed,
      progress: (x * dx + y * dy) / (distance * distance),
      cross: Math.abs(x * dy - y * dx) / distance,
    };
  });
  if (samples.some((t) => t.cross > Math.max(2, distance * 0.08)))
    return unresolved("The motion is not a consistent translation.");
  const curves = [
    "linear",
    "easeOut",
    "easeInOut",
    "cubic-bezier(0.16,1,0.3,1)",
    "spring(0.15)",
    "spring(0.35)",
  ];
  const fits = curves
    .map((easing) => ({
      easing,
      error: Math.sqrt(
        samples.reduce(
          (sum, s) => sum + (s.progress - applyEasing(s.time, easing)) ** 2,
          0,
        ) / samples.length,
      ),
    }))
    .sort((a, b) => a.error - b.error);
  if (fits[0]!.error > 0.12)
    return unresolved("No supported simple easing fits the sampled motion.");
  return {
    status: "measured" as const,
    startMs: first.actualMs,
    endMs: last.actualMs,
    travelPx: [dx, dy],
    measurementSize: {
      width: first.measurements.width,
      height: first.measurements.height,
    },
    travelRatio: [
      dx / first.measurements.width,
      dy / first.measurements.height,
    ],
    overshootRatio: Math.max(0, ...samples.map((s) => s.progress - 1)),
    easing: fits[0]!.easing,
    fitError: fits[0]!.error,
    coverage: "sampled-interval-strip" as const,
    samples: tiles.length,
  };
}
