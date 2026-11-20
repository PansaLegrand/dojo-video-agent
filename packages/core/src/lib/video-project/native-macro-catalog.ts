import { macroDefinitions } from "@dojo-video-engine/presets/macros";

import { chartMacroCatalog, kineticMacroCatalog, radialMacroCatalog } from "./agent-authoring";
export type NativeMacroCatalog = typeof chartMacroCatalog | typeof kineticMacroCatalog | typeof radialMacroCatalog;

const legacyNames = Object.freeze([
  "effectOverlay", "cartoonBurst", "textEffect", "lowerThird", "titleCard",
  "calloutArrow", "kineticText", "progressBar", "chapterTransition", "lottieOverlay",
  "emphasis", "bRoll", "textOverlay", "imageOverlay", "videoOverlay", "audioOverlay",
  "transition", "subtitles", "captions", "countdown",
]);
const chartNames = Object.freeze([...legacyNames, "dataChart"]);

const kineticNames = Object.freeze([...chartNames, "kineticSplit"]);

const radialNames = Object.freeze([...kineticNames, "radialGroup"]);

export function installedNativeMacroCatalog(): NativeMacroCatalog | undefined {
  const names = new Set(macroDefinitions().map(({ name }) => name));
  if (!names.has("dataChart")) return undefined;
  if (!names.has("kineticSplit")) return chartMacroCatalog;
  return names.has("radialGroup") ? radialMacroCatalog : kineticMacroCatalog;
}

export function nativeMacroNames(catalog?: NativeMacroCatalog): readonly string[] {
  if (!catalog) return legacyNames;
  const installed = installedNativeMacroCatalog();
  if (catalog === chartMacroCatalog && installed) return chartNames;
  if (catalog === kineticMacroCatalog && (installed === kineticMacroCatalog || installed === radialMacroCatalog)) return kineticNames;
  if (catalog === radialMacroCatalog) {
    if (installed === radialMacroCatalog) return radialNames;
    throw new Error("The saved radial macro catalog is not installed.");
  }
  throw new Error(catalog === chartMacroCatalog ? "The saved chart macro catalog is not installed." : "The saved kinetic macro catalog is not installed.");
}

export function nativeInsertableMacros(catalog?: NativeMacroCatalog) {
  const names = nativeMacroNames(catalog);
  return macroDefinitions().filter(({ name }) =>
    names.includes(name) && name !== "captions" && name !== "subtitles");
}
