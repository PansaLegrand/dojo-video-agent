import {captionTimingDiagnostics} from "./caption-source-range";
import {
  executeVideoProjectCommands,
  type VideoProjectCommand,
} from "./commands";
import { canonicalSerialize, type VideoProjectDocument } from "./document";
import { sourceWindow } from "./source-clock";
type Item = VideoProjectDocument["items"][number];
export type CompletionSourceFamilies = {
  splitRoots: Set<string>;
  bySource: Map<string, Item[]>;
};
export function createSpeechSourceTrace(before: VideoProjectDocument) {
  const roots = new Map(
      before.items
        .filter((i) => ["video", "audio"].includes(i.node.type))
        .map((i) => [i.id, i.id]),
    ),
    splitRoots = new Set<string>();
  return {
    roots,
    splitRoots,
    onSplit(parent: string, child: string) {
      const root = roots.get(parent);
      if (root) {
        roots.set(child, root);
        splitRoots.add(root);
      }
    },
    coverage(sourceId: string) {
      const root = roots.get(sourceId);
      return root && splitRoots.has(root)
        ? sourceWindow(
            before.items.find((i) => i.id === root)!,
            before.format.fps,
          )
        : undefined;
    },
  };
}
/** Provenance comes from replaying the reviewed commands, never names, prefixes,
 * model-supplied lineage or an arbitrary same-asset clip elsewhere in the film. */
export function completionSourceFamilies(
  before: VideoProjectDocument,
  after: VideoProjectDocument,
  commands: readonly VideoProjectCommand[] | undefined,
): CompletionSourceFamilies {
  if (!commands)
    throw Error(
      "Edited speech completion needs the exact reviewed command batch.",
    );
  const trace = createSpeechSourceTrace(before),
    { roots, splitRoots } = trace;
  const replay = executeVideoProjectCommands(before, commands, trace);
  if (canonicalSerialize(replay.document) !== canonicalSerialize(after))
    throw Error(
      "Edited speech completion commands do not reproduce this candidate.",
    );
  const bySource = new Map<string, Item[]>();
  for (const item of after.items) {
    const root = roots.get(item.id);
    if (!root || !["video", "audio"].includes(item.node.type)) continue;
    const original = before.items.find((i) => i.id === root)!;
    if (splitRoots.has(root)) {
      if (
        item.node.assetId !== original.node.assetId ||
        canonicalSerialize(before.sources[original.node.assetId!]) !==
          canonicalSerialize(after.sources[item.node.assetId!])
      )
        throw Error(
          "An edited speech fragment changed its original source identity.",
        );
      const old = sourceWindow(original, before.format.fps),
        current = sourceWindow(item, after.format.fps);
      if (
        current.startMs < old.startMs - 1e-6 ||
        current.endMs > old.endMs + 1e-6 ||
        current.rate !== old.rate
      )
        throw Error(
          "An edited speech fragment leaves its declared original source window.",
        );
    }
    const list = bySource.get(root) ?? [];
    list.push(item);
    bySource.set(root, list);
  }
  for (const list of bySource.values())
    list.sort((a, b) => (a.node.from ?? 0) - (b.node.from ?? 0));
  return { splitRoots, bySource };
}

import type { CompletionRequirement } from "@dojo-video/agent-kit";
import { captionSourceCommands } from "./semantic";
import { normalizeCaptionLanguage } from "./caption-pair";
/** A frozen pair names the original clip. After host-proven splits, every
 * surviving speech fragment needs a complete, reciprocal, source-bound pair. */
export function assertFragmentCaptionPair(
  before: VideoProjectDocument,
  after: VideoProjectDocument,
  requirement: Extract<CompletionRequirement, { kind: "caption_pair" }>,
  families: CompletionSourceFamilies,
): boolean {
  if (!families.splitRoots.has(requirement.sourceItemId)) return false;
  const original = before.items.find((i) => i.id === requirement.sourceItemId),
    evidence = after.evidence[requirement.evidenceId],
    sources = families.bySource.get(requirement.sourceItemId) ?? [];
  if (
    !original ||
    !evidence ||
    original.node.assetId !== evidence.sourceAssetId ||
    !sources.length
  )
    throw Error(
      "The declared speech source has no surviving, proven fragments.",
    );
  if (canonicalSerialize(before.evidence[requirement.evidenceId]) !== canonicalSerialize(evidence)) throw Error("Edited speech must retain the original immutable transcript evidence.");
  const sourceCoverage = sourceWindow(original, before.format.fps);
  for (const source of sources) {
    if (captionTimingDiagnostics(after,source.id,evidence)) throw Error(`Edited speech fragment ${source.id} includes source tokens without genuine positive-duration timing; preserve the missing coverage and choose a supported source window.`);
    const window = sourceWindow(source, after.format.fps),
      words = evidence.words.filter(
        (w) =>
          w.endMs > window.startMs &&
          w.startMs < window.endMs &&
          Math.max(w.startMs, sourceCoverage.startMs) >=
            window.startMs - 1e-6 &&
          Math.min(w.endMs, sourceCoverage.endMs) <= window.endMs + 1e-6,
      );
    const originals = after.items.filter(
      (i) =>
        i.caption?.sourceItemId === source.id &&
        i.caption.role === "original" &&
        normalizeCaptionLanguage(i.caption.language ?? "") ===
          normalizeCaptionLanguage(requirement.originalLanguage),
    );
    if (!words.length) {
      if (originals.length)
        throw Error(
          `Edited speech fragment ${source.id} has no retained complete words; remove its stale caption pair.`,
        );
      continue;
    }
    const first = originals.length === 1 ? originals[0] : undefined,
      second =
        first && after.items.find((i) => i.id === first.caption?.pairedItemId);
    if (
      !first ||
      !second ||
      (source.id === original.id &&
        (first.id !== requirement.originalItemId ||
          second.id !== requirement.translatedItemId))
    )
      throw Error(
        `Edited speech fragment ${source.id} needs exactly one original/translated caption pair, preserving the declared IDs on the original clip.`,
      );
    const expected = captionSourceCommands(after, {
      sourceItemId: source.id,
      evidenceId: requirement.evidenceId,
      itemId: "completion-fragment-cues",
      trackId: first.trackId,
      phraseSafe: true,
      sourceCoverage,
    }).find((c) => c.type === "addItem");
    if (expected?.type !== "addItem")
      throw Error("Edited speech host cues are unavailable.");
    const cues = expected.item.caption!.cues;
    for (const [candidate, role, language, color, paired] of [
      [
        first,
        "original",
        requirement.originalLanguage,
        requirement.originalColor,
        second.id,
      ],
      [
        second,
        "translation",
        requirement.translatedLanguage,
        requirement.translatedColor,
        first.id,
      ],
    ] as const) {
      const c = candidate.caption;
      if (
        !c ||
        c.role !== role ||
        c.sourceItemId !== source.id ||
        c.pairedItemId !== paired ||
        normalizeCaptionLanguage(c.language ?? "") !==
          normalizeCaptionLanguage(language) ||
        String(candidate.node.style?.color).toLowerCase() !==
          color.toLowerCase()
      )
        throw Error(
          `Edited speech caption ${candidate.id} must retain the declared language, color, source and reciprocal pairing.`,
        );
      if (
        candidate.node.from !== source.node.from ||
        candidate.node.duration !== source.node.duration
      )
        throw Error(
          `Edited speech caption ${candidate.id} must follow fragment ${source.id}'s host-projected placement.`,
        );
      if (
        c.cues.length !== cues.length ||
        c.cues.some(
          (cue, i) =>
            cue.id !== cues[i]!.id ||
            Math.abs(cue.startMs - cues[i]!.startMs) > 0.001 ||
            Math.abs(cue.endMs - cues[i]!.endMs) > 0.001 ||
            !cue.text.trim() ||
            (role === "original" && cue.text !== cues[i]!.text),
        )
      ) {
        const manifest = cues.map(({ id, text, startMs, endMs }) => ({
          id,
          text,
          startMs,
          endMs,
        }));
        throw Error(
          `Edited speech cues for ${first.id} / ${second.id}, source ${source.id}: regenerate original wording from this host manifest and translate the same cue IDs/times for the paired item. Keep the frozen requirement and source words. ${JSON.stringify(manifest)}`,
        );
      }
    }
  }
  return true;
}
