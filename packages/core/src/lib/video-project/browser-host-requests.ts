import { visualAnalysisRequestSchema, frameMeasurementsSchema, contactSheetSchema, validateFrameMeasurements, validateContactSheet, inspectionImageCount } from "./visual-measurements";
import { supportedReceiptEngines } from "./engine-version";
import { z } from "zod/v3";
import hash from "fast-sha256";
import { canonicalSerialize } from "./document";
import { inspectionSourceSchema, sourceInspectionLimitsSchema, sourceInspectionPlanSchema, inspectionImageDimensions, sourceInspectionMimeSchema } from "./source-inspection";

const id = z.string().min(1).max(191), digest = z.string().regex(/^[a-f0-9]{64}$/), positive = z.number().int().positive();
export const browserInspectionFailureCodeSchema = z.enum(["SOURCE_MISSING", "SOURCE_CHANGED", "DECODE_FAILED", "UNSUPPORTED", "CANCELLED", "BUDGET_EXHAUSTED"]);
export const browserInspectionFailureSchema = z.object({ code: browserInspectionFailureCodeSchema, message: z.string().min(1).max(500) }).strict();
export type BrowserInspectionFailureCode = z.infer<typeof browserInspectionFailureCodeSchema>;
export const BROWSER_INSPECTION_BODY_BYTES = 6 * 1024 * 1024;
export const SOURCE_SEEK_TOLERANCE_MS = 0.05;
const scopeSchema = z.object({ version: z.literal(1), kind: z.literal("source-inspection"), projectId: id, runId: id,
  snapshot: z.object({ revision: z.number().int().min(0), documentHash: z.string().min(1).max(300) }).strict(), source: inspectionSourceSchema,
  momentsMs: z.array(z.number().finite().nonnegative()).min(1).max(16), contactSheet: z.literal(true).optional(), analysis: visualAnalysisRequestSchema.optional(), limits: sourceInspectionLimitsSchema }).strict();
export type BrowserInspectionScope = z.infer<typeof scopeSchema>;
const sha = (bytes: Uint8Array) => [...hash(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
export const browserHostValueHash = (value: unknown) => sha(new TextEncoder().encode(canonicalSerialize(value)));
export function browserInspectionScopeHash(raw: BrowserInspectionScope) {
  const scope = scopeSchema.parse(raw); validatePlan(scope);
  return browserHostValueHash(scope);
}
// sourceInspectionPlanSchema is strict: pass only its three declared fields.
function validatePlan(scope: BrowserInspectionScope) { sourceInspectionPlanSchema.parse({ source: scope.source, momentsMs: scope.momentsMs, limits: scope.limits, ...(scope.contactSheet ? {contactSheet:true} : {}), ...(scope.analysis ? {analysis:scope.analysis} : {}) }); }
export const browserInspectionRequestSchema = scopeSchema.extend({ id, scopeHash: digest }).strict().superRefine((value, context) => {
  try { const { id: _id, scopeHash, ...scope } = value; validatePlan(scope); if (scopeHash !== browserInspectionScopeHash(scope)) throw new Error("Inspection scope hash changed."); }
  catch (error) { context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid inspection scope." }); }
});
export type BrowserInspectionRequest = z.infer<typeof browserInspectionRequestSchema>;
export function createBrowserInspectionRequest(scope: BrowserInspectionScope, requestId: string): BrowserInspectionRequest {
  validatePlan(scope); return browserInspectionRequestSchema.parse({ ...scope, id: requestId, scopeHash: browserInspectionScopeHash(scope) });
}
export const browserInspectionGrantSchema = z.object({ version: z.literal(1), id, scopeHash: digest, mode: z.literal("cloud-visual-analysis"), authorizedAt: z.string().datetime() }).strict();
export type BrowserInspectionGrant = z.infer<typeof browserInspectionGrantSchema>;
export function assertBrowserInspectionGrant(request: BrowserInspectionRequest, raw: unknown): BrowserInspectionGrant {
  const grant = browserInspectionGrantSchema.parse(raw);
  if (grant.scopeHash !== request.scopeHash) throw new Error("Approve this exact source, snapshot and frame scope before sending pixels.");
  return grant;
}
export const sourceInspectionFrameSchema = z.object({ requestedMs: z.number().finite().nonnegative(), actualMs: z.number().finite().min(-60_000), durationMs: z.number().finite().positive().nullable(),
  width: positive.max(1024), height: positive.max(1024), byteLength: positive.max(4 * 1024 * 1024), sha256: digest, mimeType: z.literal("image/jpeg"), measurements: frameMeasurementsSchema.optional(), contactSheet: contactSheetSchema.optional() }).strict();
export const sourceInspectionProvenanceSchema = z.object({ algorithm: z.literal("dojo-source-inspection-v1"), engineVersion: z.enum(supportedReceiptEngines), sourceKind: z.literal("original"), source: inspectionSourceSchema,
  displayWidth: positive.max(16_384), displayHeight: positive.max(16_384), orientation: z.literal("display-oriented"), rotationDegrees: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).nullable(),
  sourceMimeType: sourceInspectionMimeSchema, colorPolicy: z.literal("browser-sdr-to-srgb-v1"),
  colorMetadata: z.object({ primaries: z.string().max(80).nullable(), transfer: z.string().max(80).nullable(), matrix: z.string().max(80).nullable(), fullRange: z.boolean().nullable() }).strict().nullable(),
  firstTimestampMs: z.number().finite().min(-60_000), sourceEndMs: z.number().finite().positive().nullable(), coverage: z.enum(["requested-moments-only", "sampled-interval-strip"]) }).strict();
export const browserInspectionReceiptSchema = z.object({ version: z.literal(1), requestId: id, requestHash: digest, scopeHash: digest, authorizationId: id,
  provenance: sourceInspectionProvenanceSchema, frames: z.array(sourceInspectionFrameSchema.extend({ dataUrl: z.string().min(30).max(BROWSER_INSPECTION_BODY_BYTES) }).strict()).min(1).max(8) }).strict();
export type BrowserInspectionReceipt = z.infer<typeof browserInspectionReceiptSchema>;

/** Server and browser both validate bounded bytes; ownership/grant authority stays in the service. */
export function validateBrowserInspectionReceipt(request: BrowserInspectionRequest, grant: BrowserInspectionGrant, raw: unknown): BrowserInspectionReceipt {
  browserInspectionRequestSchema.parse(request); assertBrowserInspectionGrant(request, grant);
  const receipt = browserInspectionReceiptSchema.parse(raw);
  if (receipt.requestId !== request.id || receipt.requestHash !== browserHostValueHash(request) || receipt.scopeHash !== request.scopeHash || receipt.authorizationId !== grant.id
    || canonicalSerialize(receipt.provenance.source) !== canonicalSerialize(request.source)) throw new Error("The inspection receipt belongs to another request or source.");
  if (receipt.frames.length !== inspectionImageCount(request)) throw new Error("All requested source moments require a receipt.");
  if (!receipt.provenance.sourceMimeType.startsWith(request.source.type + "/")) throw new Error("Inspection media type does not match the named source.");
  if (receipt.provenance.coverage !== (request.contactSheet ? "sampled-interval-strip" : "requested-moments-only")) throw new Error("Inspection coverage changed.");
  let bytes = 0, pixels = 0;
  for (const [index, frame] of receipt.frames.entries()) {
    if (request.contactSheet) {
      if (!frame.contactSheet || frame.contactSheet.unit !== "source-ms" || frame.measurements) throw new Error("A contact sheet requires its source tile metadata.");
      validateContactSheet(frame.contactSheet,request.momentsMs,frame.width,frame.height,request.analysis);
      if (frame.requestedMs !== frame.contactSheet.tiles[0]!.position || frame.actualMs !== frame.contactSheet.tiles[0]!.actualMs || frame.durationMs !== frame.contactSheet.tiles[0]!.durationMs)
        throw new Error("Contact-sheet first-sample identity changed.");
    } else {
      if (frame.contactSheet || frame.requestedMs !== request.momentsMs[index]) throw new Error("Inspection moments changed order or identity.");
      if (!!frame.measurements !== !!request.analysis) throw new Error("Inspection measurement scope changed.");
      if (frame.measurements) validateFrameMeasurements(frame.measurements,frame.width,frame.height,request.analysis);
    }
    const moments = frame.contactSheet?.tiles.map(tile=>({requestedMs:tile.position,actualMs:tile.actualMs,durationMs:tile.durationMs})) ?? [frame];
    for (const moment of moments) {
      if (request.source.type === "video" && (receipt.provenance.sourceEndMs === null || moment.requestedMs >= receipt.provenance.sourceEndMs || moment.actualMs < receipt.provenance.firstTimestampMs - SOURCE_SEEK_TOLERANCE_MS)) throw new Error("Inspection source timing is outside the available media.");
      if (request.source.type === "image" ? moment.actualMs !== 0 || moment.durationMs !== null : moment.durationMs === null
        || moment.actualMs > Math.max(moment.requestedMs, receipt.provenance.firstTimestampMs) + SOURCE_SEEK_TOLERANCE_MS
        || moment.actualMs + moment.durationMs <= Math.max(moment.requestedMs, receipt.provenance.firstTimestampMs) - SOURCE_SEEK_TOLERANCE_MS) throw new Error("The decoded frame does not cover the requested source time.");
    }
    const encoded = frame.dataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/)?.[1];
    if (!encoded || encoded.length % 4 !== 0) throw new Error("Inspection pixels must be canonical bounded JPEG data.");
    const binary = atob(encoded); if (btoa(binary) !== encoded) throw new Error("Invalid inspection pixel encoding.");
    const buffer = Uint8Array.from(binary, char => char.charCodeAt(0));
    if (buffer.length !== frame.byteLength || sha(buffer) !== frame.sha256 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer.at(-2) !== 0xff || buffer.at(-1) !== 0xd9) throw new Error("Inspection image bytes changed.");
    const size = inspectionImageDimensions(buffer.subarray(0, 256 * 1024)); if (size.width !== frame.width || size.height !== frame.height) throw new Error("Inspection dimensions do not match the image bytes.");
    bytes += buffer.length; pixels += frame.width * frame.height;
    if (bytes > request.limits.maxOutputBytes || pixels > request.limits.maxTotalPixels || frame.width * frame.height > request.limits.maxFramePixels || Math.max(frame.width, frame.height) > request.limits.maxDimension) throw new Error("Inspection receipt exceeds the approved allowance.");
  }
  if (new TextEncoder().encode(JSON.stringify(receipt)).byteLength > BROWSER_INSPECTION_BODY_BYTES) throw new Error("Inspection transport exceeds its bounded envelope.");
  return receipt;
}

/** A sheet is one JPEG with several separately timestamped source samples. */
export function inspectionReceiptMoments(receipt: BrowserInspectionReceipt) {
  return receipt.frames.flatMap(frame => frame.contactSheet ? frame.contactSheet.tiles.map((tile, tileIndex) => ({ requestedMs: tile.position, actualMs: tile.actualMs, durationMs: tile.durationMs, sha256: frame.sha256, contactSheet: { tileIndex, rect: tile.rect } })) : [{ requestedMs: frame.requestedMs, actualMs: frame.actualMs, durationMs: frame.durationMs, sha256: frame.sha256 }]);
}
