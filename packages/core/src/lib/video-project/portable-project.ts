import { z } from "zod/v3";
import {
  canonicalSerialize,
  hashVideoProjectDocument,
  parseVideoProjectDocument,
  videoProjectDocumentSchema,
  type VideoProjectDocument,
} from "./document";
import {
  executeVideoProjectCommands,
  videoProjectCommandsSchema,
  type VideoProjectCommand,
} from "./commands";
import { fingerprintLocalFile } from "./local-file-fingerprint";
import type { EditorAsset } from "@/lib/editor/document";
const MAGIC = new TextEncoder().encode("DOJOPROJECT1\n");
export const PORTABLE_PROJECT_LIMITS = Object.freeze({
  headerBytes: 4 * 1024 * 1024,
  assetBytes: 250 * 1024 * 1024,
  totalBytes: 1024 * 1024 * 1024,
  assets: 200,
});
const entrySchema = z
  .object({
    assetId: z.string().min(1).max(191),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    byteLength: z
      .number()
      .int()
      .positive()
      .max(PORTABLE_PROJECT_LIMITS.assetBytes),
    mimeType: z.string().max(100),
    fileName: z.string().max(500),
  })
  .strict();
const manifestSchema = z
  .object({
    kind: z.literal("dojo-portable-project"),
    version: z.literal(1),
    name: z.string().max(100),
    document: videoProjectDocumentSchema,
    documentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    assets: z.array(entrySchema).max(PORTABLE_PROJECT_LIMITS.assets),
    omittedAuthority: z.literal("provider-jobs-transcript-evidence-history"),
  })
  .strict();
export type PortableProjectManifest = z.infer<typeof manifestSchema>;
export type PortableProject = {
  manifest: PortableProjectManifest;
  files: Map<string, Blob>;
};
const assetFields = new Set([
  "assetId",
  "sourceAssetId",
  "mapAssetId",
  "fontAssetId",
  "audioAssetId",
  "coverAssetId",
  "logoAssetId",
  "entityIds",
]);
function remap(value: unknown, ids: Map<string, string>, key = ""): unknown {
  if (typeof value === "string" && assetFields.has(key))
    return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => remap(v, ids, key));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, remap(v, ids, k)]),
    );
  return value;
}
async function assertPortablePayload(asset: EditorAsset, blob: Blob) {
  if (["font", "lottie"].includes(asset.type) && blob.size > 8 * 1024 * 1024)
    throw Error("Packaged fonts and Lottie files must be at most 8 MiB each.");
  if (asset.type !== "lottie") return;
  const value: unknown = JSON.parse(await blob.text());
  function visit(node: unknown, depth = 0): void {
    if (depth > 100) throw Error("Lottie nesting exceeds the portable package limit.");
    if (Array.isArray(node)) { node.forEach(child => visit(child, depth + 1)); return; }
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      if ((key === "p" || key === "fPath") && typeof child === "string" && child && !child.startsWith("data:"))
        throw Error("Embed external Lottie images/fonts before packaging this project.");
      if (key === "x" && typeof child === "string" && child.trim())
        throw Error("Lottie expressions are not supported in portable projects.");
      visit(child, depth + 1);
    }
  }
  visit(value);
}

/** Bundles include editable display data, never executable host history, paid
 * jobs, credentials or authority to introduce external ASR evidence. */
function portableDocument(
  input: VideoProjectDocument,
  entries: z.infer<typeof entrySchema>[],
): VideoProjectDocument {
  const ids = new Map(entries.map((e) => [e.assetId, `local:${e.sha256}`])),
    result = structuredClone(input);
  result.evidence = {};
  result.bindings = {};
  result.metadata = {};
  result.items = remap(result.items, ids) as typeof result.items;
  result.creativeContext = remap(
    result.creativeContext,
    ids,
  ) as typeof result.creativeContext;
  result.assets = {};
  result.sources = {};
  for (const e of entries) {
    const original = input.assets[e.assetId];
    if (!original)
      throw Error("Package asset does not belong to the document.");
    const { assetId: _cloud, src: _url, ...asset } = original;
    const id = ids.get(e.assetId)!;
    if (
      result.assets[id] &&
      canonicalSerialize({ ...result.assets[id], name: "" }) !==
        canonicalSerialize({
          ...asset,
          id,
          source: "local",
          byteLength: e.byteLength,
          mimeType: e.mimeType,
          name: "",
        })
    )
      throw Error("Shared file bytes have incompatible asset metadata.");
    result.assets[id] = {
      ...asset,
      id,
      source: "local",
      byteLength: e.byteLength,
      mimeType: e.mimeType,
    };
    result.sources[id] = {
      assetId: id,
      revision: `sha256:${e.sha256}`,
      contentHash: e.sha256,
    };
  }
  return parseVideoProjectDocument(result);
}
export async function createPortableProject(input: {
  document: VideoProjectDocument;
  name: string;
  readAsset: (asset: EditorAsset) => Promise<Blob>;
  signal?: AbortSignal;
}): Promise<Blob> {
  const document = parseVideoProjectDocument(input.document),
    assets = Object.values(document.assets);
  if (assets.length > 200)
    throw Error("A portable package supports at most 200 assets.");
  const entries: z.infer<typeof entrySchema>[] = [],
    files = new Map<string, Blob>();
  let total = 0;
  for (const asset of assets) {
    input.signal?.throwIfAborted();
    const blob = await input.readAsset(asset);
    if (!blob.size || blob.size > PORTABLE_PROJECT_LIMITS.assetBytes)
      throw Error(
        `Asset "${asset.name}" exceeds the 250 MiB package limit or is empty.`,
      );
    await assertPortablePayload(asset, blob);
    const digest = await fingerprintLocalFile(blob, { signal: input.signal });
    const declared = document.sources[asset.id]?.contentHash;
    if (declared && declared !== digest)
      throw Error(
        `Asset "${asset.name}" differs from its source fingerprint. Relink the original file.`,
      );
    entries.push({
      assetId: asset.id,
      sha256: digest,
      byteLength: blob.size,
      mimeType: asset.mimeType ?? blob.type,
      fileName: asset.name,
    });
    if (!files.has(digest)) {
      files.set(digest, blob);
      total += blob.size;
    }
    if (total > PORTABLE_PROJECT_LIMITS.totalBytes)
      throw Error("Portable package exceeds 1 GiB.");
  }
  const portable = portableDocument(document, entries),
    unique = [...files.keys()].map((hash) => {
      const e = entries.find((e) => e.sha256 === hash)!;
      return { ...e, assetId: `local:${hash}` };
    });
  const manifest = manifestSchema.parse({
    kind: "dojo-portable-project",
    version: 1,
    name: input.name.slice(0, 100),
    document: portable,
    documentHash: await hashVideoProjectDocument(portable),
    assets: unique,
    omittedAuthority: "provider-jobs-transcript-evidence-history",
  });
  const header = new TextEncoder().encode(JSON.stringify(manifest));
  if (header.byteLength > PORTABLE_PROJECT_LIMITS.headerBytes)
    throw Error("Portable project metadata exceeds 4 MiB.");
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, header.byteLength, true);
  const result = new Blob([MAGIC, length, header, ...files.values()], {
    type: "application/x-dojo-project",
  });
  if (result.size > PORTABLE_PROJECT_LIMITS.totalBytes)
    throw Error("Portable package exceeds 1 GiB.");
  return result;
}
export async function readPortableProject(
  blob: Blob,
  signal?: AbortSignal,
): Promise<PortableProject> {
  signal?.throwIfAborted();
  if (
    blob.size > PORTABLE_PROJECT_LIMITS.totalBytes ||
    blob.size < MAGIC.length + 4
  )
    throw Error("Invalid portable package size.");
  const prefix = new Uint8Array(
    await blob.slice(0, MAGIC.length + 4).arrayBuffer(),
  );
  if (!MAGIC.every((byte, i) => prefix[i] === byte))
    throw Error("Choose a Dojo project package (.dojoproject).");
  const length = new DataView(prefix.buffer).getUint32(MAGIC.length, true);
  if (
    length > PORTABLE_PROJECT_LIMITS.headerBytes ||
    length < 2 ||
    MAGIC.length + 4 + length > blob.size
  )
    throw Error("Invalid portable project header.");
  const raw = JSON.parse(
      await blob.slice(MAGIC.length + 4, MAGIC.length + 4 + length).text(),
    ),
    manifest = manifestSchema.parse(raw),
    document = parseVideoProjectDocument(manifest.document);
  if (
    Object.keys(document.evidence).length ||
    Object.keys(document.bindings).length ||
    Object.keys(document.metadata).length
  )
    throw Error(
      "A package cannot import provider evidence, source bindings or host metadata.",
    );
  if ((await hashVideoProjectDocument(document)) !== manifest.documentHash)
    throw Error("Portable document checksum mismatch.");
  const files = new Map<string, Blob>();
  let offset = MAGIC.length + 4 + length;
  for (const entry of manifest.assets) {
    signal?.throwIfAborted();
    if (entry.assetId !== `local:${entry.sha256}` || files.has(entry.assetId))
      throw Error("Duplicate or mismatched package asset identity.");
    const asset = document.assets[entry.assetId],
      source = document.sources[entry.assetId];
    if (
      !asset ||
      asset.source !== "local" ||
      asset.src ||
      asset.assetId ||
      asset.byteLength !== entry.byteLength ||
      source?.contentHash !== entry.sha256 ||
      source.revision !== `sha256:${entry.sha256}`
    )
      throw Error("Package asset metadata does not match its verified bytes.");
    if (offset + entry.byteLength > blob.size)
      throw Error("Portable package is truncated.");
    const file = blob.slice(offset, offset + entry.byteLength, entry.mimeType);
    offset += entry.byteLength;
    if ((await fingerprintLocalFile(file, { signal })) !== entry.sha256)
      throw Error(`Checksum mismatch for "${entry.fileName}".`);
    await assertPortablePayload(asset, file);
    files.set(entry.assetId, file);
  }
  if (
    offset !== blob.size ||
    files.size !== Object.keys(document.assets).length ||
    files.size !== Object.keys(document.sources).length
  )
    throw Error("Package has missing or extra assets/bytes.");
  return { manifest: { ...manifest, document }, files };
}
/** An import uses normal validated commands and one undoable history entry.
 * Existing timelines are never replaced by a package. */
export function portableProjectCommands(
  currentInput: VideoProjectDocument,
  incomingInput: VideoProjectDocument,
): VideoProjectCommand[] {
  const current = parseVideoProjectDocument(currentInput),
    incoming = parseVideoProjectDocument(incomingInput);
  if (
    current.items.length ||
    Object.keys(current.assets).length ||
    Object.keys(current.evidence).length ||
    Object.keys(current.bindings).length
  )
    throw Error(
      "Import a package into an empty project. Create a new project to preserve this timeline.",
    );
  if (
    Object.keys(incoming.evidence).length ||
    Object.keys(incoming.bindings).length ||
    Object.values(incoming.assets).some(
      (a) => a.source !== "local" || a.src || a.assetId,
    )
  )
    throw Error("Package imports accept local files and display data only.");
  const commands: VideoProjectCommand[] = [];
  for (const [key, value] of Object.entries(incoming.format))
    commands.push({
      type: "set",
      target: { kind: "format" },
      path: [key],
      value,
    });
  for (const asset of Object.values(incoming.assets))
    commands.push({ type: "addAsset", asset });
  for (const source of Object.values(incoming.sources))
    commands.push({ type: "addSource", source });
  for (const track of current.tracks)
    if (!incoming.tracks.some((t) => t.id === track.id))
      commands.push({ type: "removeTrack", id: track.id });
  for (const track of incoming.tracks) {
    if (!current.tracks.some((t) => t.id === track.id))
      commands.push({ type: "addTrack", track: { ...track, locked: false } });
    else
      for (const [key, value] of Object.entries(track))
        if (key !== "id")
          commands.push({
            type: "set",
            target: { kind: "track", trackId: track.id },
            path: [key],
            value: key === "locked" ? false : value,
          });
  }
  for (const key of ["audioBuses", "markers"] as const)
    if (incoming[key])
      commands.push({
        type: "set",
        target: { kind: "project" },
        path: [key],
        value: incoming[key],
      });
  for (const item of incoming.items) commands.push({ type: "addItem", item });
  for (const transition of Object.values(incoming.transitions ?? {}))
    commands.push({ type: "setTransition", transition });
  for (const group of Object.values(incoming.linkedGroups ?? {}))
    commands.push({ type: "setLinkedGroup", group });
  commands.push(
    { type: "updateCreativeContext", context: incoming.creativeContext },
    { type: "reorderTracks", ids: incoming.tracks.map((t) => t.id) },
  );
  for (const track of incoming.tracks)
    if (track.locked)
      commands.push({
        type: "set",
        target: { kind: "track", trackId: track.id },
        path: ["locked"],
        value: true,
      });
  videoProjectCommandsSchema.parse(commands);
  const result = executeVideoProjectCommands(current, commands).document;
  if (canonicalSerialize(result) !== canonicalSerialize(incoming))
    throw Error(
      "Package cannot be restored exactly by the current command kernel.",
    );
  return commands;
}
