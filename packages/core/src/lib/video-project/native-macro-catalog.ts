import { macroDefinitions } from "@dojo-video-engine/presets/macros";

import { chartMacroCatalog, kineticMacroCatalog, radialMacroCatalog, walkthroughMacroCatalog, comparisonMacroCatalog, blueprintMacroCatalog } from "./agent-authoring";
export type NativeMacroCatalog = typeof chartMacroCatalog | typeof kineticMacroCatalog | typeof radialMacroCatalog | typeof walkthroughMacroCatalog | typeof comparisonMacroCatalog | typeof blueprintMacroCatalog;

const legacyNames = Object.freeze([
  "effectOverlay", "cartoonBurst", "textEffect", "lowerThird", "titleCard",
  "calloutArrow", "kineticText", "progressBar", "chapterTransition", "lottieOverlay",
  "emphasis", "bRoll", "textOverlay", "imageOverlay", "videoOverlay", "audioOverlay",
  "transition", "subtitles", "captions", "countdown",
]);
// Each revision appends one macro. A saved run always sees its original prefix.
const revisions = [
  { id: chartMacroCatalog, name: "dataChart", label: "chart" },
  { id: kineticMacroCatalog, name: "kineticSplit", label: "kinetic" },
  { id: radialMacroCatalog, name: "radialGroup", label: "radial" },
  { id: walkthroughMacroCatalog, name: "uiWalkthroughCard", label: "walkthrough" },
  { id: comparisonMacroCatalog, name: "comparisonChart", label: "comparison" },
  { id: blueprintMacroCatalog, name: "remixBlueprint", label: "blueprints" },
] as const;
const menus = revisions.map((_, index) => Object.freeze([...legacyNames, ...revisions.slice(0, index + 1).map(r => r.name)]));

export function installedNativeMacroCatalog(): NativeMacroCatalog | undefined {
  const available = new Set(macroDefinitions().map(d => d.name));
  let installed: NativeMacroCatalog | undefined;
  for (const revision of revisions) {
    if (!available.has(revision.name)) break;
    installed = revision.id;
  }
  return installed;
}

export function nativeMacroNames(catalog?: NativeMacroCatalog): readonly string[] {
  if (!catalog) return legacyNames;
  const requested = revisions.findIndex(r => r.id === catalog);
  const installed = installedNativeMacroCatalog();
  if (requested < 0 || requested > revisions.findIndex(r => r.id === installed))
    throw new Error(`The saved ${revisions[requested]?.label ?? "unknown"} macro catalog is not installed.`);
  return menus[requested]!;
}

export function nativeInsertableMacros(catalog?: NativeMacroCatalog) {
  const names = nativeMacroNames(catalog);
  return macroDefinitions().filter(({ name }) =>
    names.includes(name) && name !== "captions" && name !== "subtitles");
}
