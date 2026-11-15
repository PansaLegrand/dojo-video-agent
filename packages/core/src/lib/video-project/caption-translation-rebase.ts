import { getEditorFontAssets } from "@/lib/editor/fonts";
import { canonicalSerialize, type VideoProjectDocument } from "./document";
import type { VideoProjectCommand } from "./commands";

type Item = VideoProjectDocument["items"][number];
const equal = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
const content = ({ name: _name, node, ...item }: Item) => ({
  ...item,
  node: { ...node, style: undefined },
});

/** Resolve a complete translation of existing captions without replacing later appearance edits. */
export function captionTranslationRebaseCommands(
  base: VideoProjectDocument,
  current: VideoProjectDocument,
  commands: readonly VideoProjectCommand[],
  proposed: VideoProjectDocument,
): VideoProjectCommand[] | null {
  const added = proposed.items.filter(
    (item) =>
      !base.items.some((original) => original.id === item.id) &&
      item.caption?.role === "translation",
  );
  if (added.length !== 1) return null;
  const translated = added[0]!;
  const translation = translated.caption;
  if (!translation) return null;
  const before = base.items.find(
    (item) => item.id === translation.pairedItemId,
  );
  if (!before?.caption || before.caption.role === "translation") return null;
  const source = current.items.find((item) => item.id === before.id);
  if (!source?.caption || !equal(content(before), content(source)))
    throw new Error(
      "The source subtitle text or timing changed while this translation was being prepared.",
    );
  const creation = commands.find(
    (command) =>
      (command.type === "duplicateItem" &&
        command.id === before.id &&
        command.newId === translated.id) ||
      (command.type === "addItem" && command.item.id === translated.id),
  );
  if (!creation) return null;
  const onlyTranslation = commands.every((command) => {
    if (command === creation) return true;
    if (command.type === "addAsset") return command.asset.type === "font";
    if (command.type === "moveItem")
      return (
        command.id === translated.id &&
        command.from === (before.node.from ?? 0) &&
        (!command.trackId || command.trackId === before.trackId)
      );
    if (command.type !== "set" && command.type !== "clear") return false;
    if (!("itemId" in command.target)) return false;
    if (command.target.itemId === translated.id) return true;
    return (
      command.target.kind === "caption" &&
      command.target.itemId === before.id &&
      command.type === "set" &&
      command.path.join(".") === "pairedItemId" &&
      command.value === translated.id
    );
  });
  if (
    !onlyTranslation ||
    translated.trackId !== before.trackId ||
    translation.sourceItemId !== before.caption.sourceItemId ||
    translated.node.duration !== before.node.duration
  )
    return null;
  const from = before.node.from ?? 0;
  if (
    (translated.node.from ?? 0) !== from &&
    !(
      creation.type === "duplicateItem" &&
      translated.node.from === from + before.node.duration!
    )
  )
    return null;
  if (
    translation.cues.length !== before.caption.cues.length ||
    translation.cues.some((cue, index) => {
      const original = before.caption!.cues[index]!;
      return (
        cue.id !== original.id ||
        cue.startMs !== original.startMs ||
        cue.endMs !== original.endMs
      );
    })
  )
    return null;
  if (
    ["width", "height", "fps"].some(
      (key) =>
        base.format[key as keyof typeof base.format] !==
        current.format[key as keyof typeof current.format],
    )
  )
    throw new Error(
      "The canvas size or frame rate changed while this translation was being prepared.",
    );
  if (current.items.some((item) => item.id === translated.id))
    throw new Error("A caption item already uses this translation's ID.");
  if (
    Object.values(base.bindings).some(
      (binding) =>
        binding.itemId === before.id || binding.sourceItemId === before.id,
    ) ||
    Object.values(current.bindings).some(
      (binding) =>
        binding.itemId === source.id || binding.sourceItemId === source.id,
    )
  )
    return null;

  const item = structuredClone(translated);
  const oldStyle = before.node.style ?? {},
    currentStyle = source.node.style ?? {},
    proposedStyle = translated.node.style ?? {};
  const style: Record<string, unknown> = { ...currentStyle };
  for (const key of new Set([
    ...Object.keys(oldStyle),
    ...Object.keys(proposedStyle),
  ])) {
    if (
      equal(
        oldStyle[key as keyof typeof oldStyle],
        proposedStyle[key as keyof typeof proposedStyle],
      )
    )
      continue;
    const value = proposedStyle[key as keyof typeof proposedStyle];
    if (value === undefined) delete style[key];
    else style[key] = value;
  }
  const layoutKeys = [
    "left",
    "top",
    "width",
    "height",
    "position",
    "transform",
  ] as const;
  const simpleLayout = (value: typeof oldStyle) =>
    value.position === "absolute" &&
    (!value.transform || value.transform === "none") &&
    [value.left, value.top, value.width, value.height].every(
      (entry) => typeof entry === "number",
    );
  const layoutChanged = layoutKeys.some(
    (key) => !equal(oldStyle[key], currentStyle[key]),
  );
  if (
    layoutChanged &&
    (!simpleLayout(oldStyle) ||
      !simpleLayout(currentStyle) ||
      !simpleLayout(proposedStyle))
  )
    throw new Error(
      "The caption layout changed to custom positioning. Adjust it before applying this saved translation.",
    );
  // Keep the model's relative placement when the original caption box has moved.
  for (const key of ["left", "top"] as const) {
    if (
      simpleLayout(oldStyle) &&
      simpleLayout(currentStyle) &&
      simpleLayout(proposedStyle) &&
      typeof oldStyle[key] === "number" &&
      typeof currentStyle[key] === "number" &&
      typeof proposedStyle[key] === "number"
    ) {
      style[key] = proposedStyle[key] + currentStyle[key] - oldStyle[key];
    }
  }
  if (
    simpleLayout(currentStyle) &&
    simpleLayout(proposedStyle) &&
    typeof style.top === "number" &&
    typeof style.height === "number" &&
    typeof currentStyle.top === "number" &&
    typeof currentStyle.height === "number"
  ) {
    const overlaps =
      style.top < currentStyle.top + currentStyle.height &&
      style.top + style.height > currentStyle.top;
    if (
      overlaps ||
      style.top < 0 ||
      style.top + style.height > current.format.height
    ) {
      const below = currentStyle.top + currentStyle.height + 8;
      style.top =
        below + style.height <= current.format.height
          ? below
          : Math.max(0, currentStyle.top - style.height - 8);
    }
  }
  item.node = {
    ...item.node,
    from: source.node.from,
    duration: source.node.duration,
    style: style as Item["node"]["style"],
  };
  item.caption = {
    ...translation,
    mode: "sentence",
    cues: translation.cues.map(({ words: _words, ...cue }) => cue),
  };
  const assets = new Map(
    commands
      .filter((command) => command.type === "addAsset")
      .map((command) => [command.asset.id, command.asset]),
  );
  for (const asset of getEditorFontAssets(String(style.fontFamily ?? "Inter")))
    assets.set(asset.id, asset);
  const output: VideoProjectCommand[] = [];
  for (const asset of assets.values()) {
    if (current.assets[asset.id]) {
      if (!equal(current.assets[asset.id], asset))
        throw new Error("A font used by this translation changed.");
    } else output.push({ type: "addAsset", asset });
  }
  output.push({ type: "addItem", item });
  if (source.caption.pairedItemId !== item.id)
    output.push({
      type: "set",
      target: { kind: "caption", itemId: source.id },
      path: ["pairedItemId"],
      value: item.id,
    });
  return output;
}
