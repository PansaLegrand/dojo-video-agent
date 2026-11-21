import release from "../../../../../config/engine-release.json";

export const supportedReceiptEngines = ["1.2.3", "1.3.0", "1.3.1"] as const;
export type ReceiptEngineVersion = (typeof supportedReceiptEngines)[number];

export function receiptEngineVersion(): ReceiptEngineVersion {
  const version = supportedReceiptEngines.find(value => value === release.engineVersion);
  if (!version) throw Error("This engine release has no supported browser receipt format.");
  return version;
}
