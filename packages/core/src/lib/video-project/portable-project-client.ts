import type { EditorAsset } from "@/lib/editor/document";
import type { VideoWorkspaceController } from "./client-controller";
import { videoProjectRequest } from "./client-controller";
import {
  readLocalVideoSource,
  saveLocalVideoSource,
  probeLocalMedia,
} from "./local-assets";
import {
  createPortableProject,
  readPortableProject,
  portableProjectCommands,
  PORTABLE_PROJECT_LIMITS,
} from "./portable-project";

export async function exportPortableProject(
  projectId: string,
  controller: VideoWorkspaceController,
  name: string,
  urls: Record<string, string>,
  signal?: AbortSignal,
) {
  const snapshot = await controller.flush();
  return createPortableProject({
    document: snapshot.document,
    name,
    signal,
    readAsset: async (asset: EditorAsset) => {
      const local = await readLocalVideoSource(projectId, asset.id);
      if (local) return local.file;
      const url = asset.source === "static" ? asset.src : urls[asset.id];
      if (!url)
        throw Error(
          `Relink "${asset.name}" before exporting the project package.`,
        );
      const response = await fetch(url, { signal, credentials: "same-origin" });
      if (!response.ok || !response.body)
        throw Error(`Could not read "${asset.name}".`);
      const reader = response.body.getReader(),
        chunks: Uint8Array<ArrayBuffer>[] = [];
      let size = 0;
      try {
        for (;;) {
          signal?.throwIfAborted();
          const result = await reader.read();
          if (result.done) break;
          size += result.value.byteLength;
          if (size > PORTABLE_PROJECT_LIMITS.assetBytes)
            throw Error("A package asset exceeds 250 MiB.");
          chunks.push(new Uint8Array(result.value));
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      return new Blob(chunks, {
        type:
          asset.mimeType ??
          response.headers.get("content-type") ??
          "application/octet-stream",
      });
    },
  });
}
export async function importPortableProject(
  projectId: string,
  controller: VideoWorkspaceController,
  file: Blob,
  signal?: AbortSignal,
) {
  const snapshot = await controller.flush(),
    bundle = await readPortableProject(file, signal),
    commands = portableProjectCommands(
      snapshot.document,
      bundle.manifest.document,
    );
  // Validate every decoder input before creating source records or editing.
  for (const entry of bundle.manifest.assets) {
    const asset = bundle.manifest.document.assets[entry.assetId],
      blob = bundle.files.get(entry.assetId)!;
    if (["image", "video", "audio"].includes(asset.type)) {
      const metadata = await probeLocalMedia(
        new File([blob], entry.fileName, { type: entry.mimeType }),
        signal,
      );
      if (
        metadata.type !== asset.type ||
        (asset.width !== undefined && metadata.width !== asset.width) ||
        (asset.height !== undefined && metadata.height !== asset.height) ||
        (asset.durationSeconds !== undefined &&
          Math.abs((metadata.duration ?? 0) - asset.durationSeconds) > 0.1)
      )
        throw Error(`Media metadata mismatch for "${entry.fileName}".`);
    } else if (blob.size > 8 * 1024 * 1024)
      throw Error(
        "Packaged fonts and Lottie files must be at most 8 MiB each.",
      );
  }
  for (const entry of bundle.manifest.assets) {
    signal?.throwIfAborted();
    const blob = bundle.files.get(entry.assetId)!,
      asset = bundle.manifest.document.assets[entry.assetId];
    await saveLocalVideoSource(
      {
        projectId,
        sourceId: entry.assetId,
        fingerprint: entry.sha256,
        scheme: "sha256",
        byteLength: entry.byteLength,
        mimeType: entry.mimeType,
        fileName: entry.fileName,
        file: blob,
        asset,
      },
      signal,
    );
    await videoProjectRequest(
      `/api/projects/${encodeURIComponent(projectId)}/sources/register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          sourceId: entry.assetId,
          fingerprint: entry.sha256,
          scheme: "sha256",
          byteLength: entry.byteLength,
          mimeType: entry.mimeType,
          fileName: entry.fileName,
        }),
      },
    );
  }
  signal?.throwIfAborted();
  // The request carries the original empty snapshot; a concurrent edit conflicts.
  try {
    await videoProjectRequest(
      `/api/projects/${encodeURIComponent(projectId)}/commands`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          baseRevision: snapshot.revision,
          baseHash: snapshot.documentHash,
          requireExactBasis: true,
          commands,
        }),
      },
    );
  } catch (error) {
    // A lost response is not permission to submit another import transaction.
    try { await controller.refresh(); } catch { throw error; }
    if (
      controller.getState().snapshot?.documentHash !==
      bundle.manifest.documentHash
    )
      throw error;
  }
  await controller.refresh();
  return bundle;
}
