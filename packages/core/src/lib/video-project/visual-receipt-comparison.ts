import { z } from "zod/v3";
import {
  browserInspectionRequestSchema,
  browserInspectionGrantSchema,
  validateBrowserInspectionReceipt,
  browserHostValueHash,
} from "./browser-host-requests";
import {
  projectPreviewRequestSchema,
  validateProjectPreviewReceipt,
} from "./browser-output-requests";
import { compareFrameMeasurements, measureMotion } from "./visual-measurements";

export const visualComparisonSelectionSchema = z
  .object({
    kind: z.enum(["source-inspection", "project-preview"]),
    requestId: z.string().min(1).max(191),
    frameIndex: z.number().int().min(0).max(3).default(0),
    tileIndex: z.number().int().min(0).max(15).optional(),
  })
  .strict();
export const visualComparisonInputSchema = z
  .object({
    reference: visualComparisonSelectionSchema,
    candidate: visualComparisonSelectionSchema,
  })
  .strict();
export type VisualComparisonSelection = z.infer<
  typeof visualComparisonSelectionSchema
>;
export type OwnedVisualReceipt = {
  request: unknown;
  grant: unknown;
  receipt: unknown;
};

function measuredSelection(
  input: OwnedVisualReceipt,
  selection: VisualComparisonSelection,
) {
  const request =
    selection.kind === "source-inspection"
      ? browserInspectionRequestSchema.parse(input.request)
      : projectPreviewRequestSchema.parse(input.request);
  if (request.id !== selection.requestId || request.kind !== selection.kind)
    throw new Error("The compared request identity changed.");
  const receipt =
    request.kind === "source-inspection"
      ? validateBrowserInspectionReceipt(
          request,
          browserInspectionGrantSchema.parse(input.grant),
          input.receipt,
        )
      : validateProjectPreviewReceipt(request, input.grant, input.receipt);
  const frame = receipt.frames[selection.frameIndex];
  if (!frame) throw new Error("Choose an existing inspected frame.");
  const tile =
    selection.tileIndex === undefined
      ? undefined
      : frame.contactSheet?.tiles[selection.tileIndex];
  if (
    (!!frame.contactSheet && !tile) ||
    (!frame.contactSheet && selection.tileIndex !== undefined)
  )
    throw new Error("Choose an existing tile for a contact-sheet comparison.");
  const measurements = tile?.measurements ?? frame.measurements;
  const identity = {
    requestId: request.id,
    receiptHash: browserHostValueHash(receipt),
    snapshot: request.snapshot,
    frameIndex: selection.frameIndex,
    ...(tile ? { tileIndex: selection.tileIndex } : {}),
    ...(request.kind === "source-inspection"
      ? {
          source: request.source,
          requestedMs:
            tile?.position ?? (frame as { requestedMs: number }).requestedMs,
          actualMs: tile?.actualMs ?? (frame as { actualMs: number }).actualMs,
        }
      : {
          renderHash: request.renderHash,
          frame: tile?.position ?? (frame as { frame: number }).frame,
        }),
    coverage:
      "provenance" in receipt ? receipt.provenance.coverage : receipt.coverage,
  };
  return {
    identity,
    measurements,
    ...(frame.contactSheet
      ? { motion: measureMotion(frame.contactSheet.tiles) }
      : {}),
  };
}
/** Call only after the host resolves both references through its owned receipt readers. */
export function compareVisualReceipts(
  reference: OwnedVisualReceipt,
  candidate: OwnedVisualReceipt,
  raw: unknown,
) {
  const selection = visualComparisonInputSchema.parse(raw);
  const a = measuredSelection(reference, selection.reference),
    b = measuredSelection(candidate, selection.candidate);
  if (!a.measurements || !b.measurements)
    return {
      status: "blocked" as const,
      reason: "Request measured inspection or preview frames first.",
      reference: a.identity,
      candidate: b.identity,
    };
  return {
    ...compareFrameMeasurements(a.measurements, b.measurements),
    reference: {
      ...a.identity,
      measurements: a.measurements,
      ...(a.motion ? { motion: a.motion } : {}),
    },
    candidate: {
      ...b.identity,
      measurements: b.measurements,
      ...(b.motion ? { motion: b.motion } : {}),
    },
  };
}

/** Facts from a validated receipt, attached alongside its actual JPEG for model input. */
export function visualReceiptFrameFacts(frame: { measurements?: unknown; contactSheet?: unknown }) {
  return { ...(frame.contactSheet ? { coverage: "sampled-interval-strip", contactSheet: frame.contactSheet } : {}), ...(frame.measurements ? { measurements: frame.measurements } : {}) };
}
