import { macroDefinitions } from "@dojo-video-engine/presets/macros";

import { chartMacroCatalog } from "./agent-authoring";
export type NativeMacroCatalog = typeof chartMacroCatalog;

const legacyNames = Object.freeze([
  "effectOverlay", "cartoonBurst", "textEffect", "lowerThird", "titleCard",
  "calloutArrow", "kineticText", "progressBar", "chapterTransition", "lottieOverlay",
  "emphasis", "bRoll", "textOverlay", "imageOverlay", "videoOverlay", "audioOverlay",
  "transition", "subtitles", "captions", "countdown",
]);
const chartNames = Object.freeze([...legacyNames, "dataChart"]);

export function installedChartCatalog() {
  return macroDefinitions().some(({ name }) => name === "dataChart") ? chartMacroCatalog : undefined;
}

export function nativeMacroNames(catalog?: NativeMacroCatalog): readonly string[] {
  if (catalog && catalog !== installedChartCatalog()) throw new Error("The saved chart macro catalog is not installed.");
  return catalog === chartMacroCatalog ? chartNames : legacyNames;
}

export function nativeInsertableMacros(catalog?: NativeMacroCatalog) {
  const names = nativeMacroNames(catalog);
  return macroDefinitions().filter(({ name }) =>
    names.includes(name) && name !== "captions" && name !== "subtitles");
}
