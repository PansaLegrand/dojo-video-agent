import {
  contactSheetLayout,
  sampledFrameStride,
  measureFrame,
  VISUAL_SEQUENCE_LIMITS,
  type ContactSheet,
  type VisualAnalysisRequest,
} from "./visual-measurements";

export async function jpegMeasurements(
  blob: Blob,
  analysis: VisualAnalysisRequest = {},
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const bitmap = await createImageBitmap(blob);
  try {
    signal?.throwIfAborted();
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context)
      throw new Error("Pixel measurements require a browser canvas.");
    context.drawImage(bitmap, 0, 0);
    return measureFrame(
      context.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width,
      canvas.height,
      analysis,
    );
  } finally {
    bitmap.close();
  }
}

export function createContactSheet(
  width: number,
  height: number,
  positions: readonly number[],
  unit: ContactSheet["unit"],
  maxDimension: number,
  analysis: VisualAnalysisRequest = {},
) {
  const layout = contactSheetLayout(
    width,
    height,
    positions.length,
    Math.min(768, maxDimension),
  );
  const canvas = new OffscreenCanvas(layout.width, layout.height),
    context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Contact sheets require a browser canvas.");
  context.fillStyle = "#0b1220";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const timings: Array<{
    position: number;
    actualMs: number;
    durationMs: number | null;
    rect: [number, number, number, number];
  }> = [];
  return {
    add(
      image: CanvasImageSource,
      position: number,
      actualMs: number,
      durationMs: number | null,
    ) {
      const index = timings.length;
      if (index >= positions.length || position !== positions[index])
        throw new Error("Contact-sheet samples changed order.");
      const x = (index % layout.columns) * layout.tileWidth,
        y =
          Math.floor(index / layout.columns) *
          (layout.tileHeight + VISUAL_SEQUENCE_LIMITS.labelHeight);
      context.drawImage(image, x, y, layout.tileWidth, layout.tileHeight);
      context.font = "12px monospace";
      context.fillStyle = "#ffffff";
      context.textBaseline = "alphabetic";
      const label =
        unit === "source-ms"
          ? `${index + 1}  ${(actualMs / 1000).toFixed(3)}s`
          : `${index + 1}  f${position}  ${(actualMs / 1000).toFixed(3)}s`;
      context.fillText(
        label,
        x + 4,
        y + layout.tileHeight + 13,
        Math.max(1, layout.tileWidth - 8),
      );
      timings.push({
        position,
        actualMs,
        durationMs,
        rect: [x, y, layout.tileWidth, layout.tileHeight],
      });
    },
    async finish(maxBytes: number, signal?: AbortSignal) {
      if (timings.length !== positions.length)
        throw new Error("Contact sheet is missing requested samples.");
      let blob: Blob | undefined;
      for (const quality of [0.82, 0.68, 0.52, 0.38]) {
        signal?.throwIfAborted();
        const encoded = await canvas.convertToBlob({
          type: "image/jpeg",
          quality,
        });
        if (encoded.type !== "image/jpeg")
          throw new Error("JPEG encoding is unavailable.");
        if (encoded.size <= maxBytes) {
          blob = encoded;
          break;
        }
      }
      if (!blob)
        throw new Error(
          "The contact sheet exceeds its approved byte allowance.",
        );
      signal?.throwIfAborted();
      const bitmap = await createImageBitmap(blob);
      try {
        signal?.throwIfAborted();
        const decoded = new OffscreenCanvas(layout.width, layout.height),
          pixels = decoded.getContext("2d", { willReadFrequently: true });
        if (!pixels)
          throw new Error(
            "Contact-sheet measurements require a browser canvas.",
          );
        pixels.drawImage(bitmap, 0, 0);
        const tiles = timings.map((tile) => {
          const [x, y, w, h] = tile.rect;
          return {
            ...tile,
            measurements: measureFrame(
              pixels.getImageData(x, y, w, h).data,
              w,
              h,
              analysis,
            ),
          };
        });
        return {
          blob,
          width: layout.width,
          height: layout.height,
          sheet: {
            version: 1 as const,
            unit,
            coverage: "sampled-interval-strip" as const,
            columns: layout.columns,
            rows: layout.rows,
            everyNthFrame: sampledFrameStride(tiles, unit),
            tiles,
          },
        };
      } finally {
        bitmap.close();
      }
    },
  };
}
