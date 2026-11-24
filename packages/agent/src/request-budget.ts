import type { SkillReferenceModel } from "../../agent-kit/src/skill-references";
import { compactSupersededReviews } from "../../core/src/lib/video-project/repair-context";

type ModelInput = Parameters<SkillReferenceModel["complete"]>;
const textLimit = 192 * 1024;
const totalLimit = 1024 * 1024;

// Measure the exact UTF-8 JSON supplied to the commercial model adapter, including
// opaque replay records and tool schemas. Only actual user image parts get the
// larger pixel allowance. Tool results containing data URLs count in full.
function requestSize([messages, tools]: ModelInput) {
  const bytes = new TextEncoder().encode(JSON.stringify({ messages, tools })).byteLength;
  let imageBytes = 0;
  for (const message of messages) {
    if (message.role !== "user" || !Array.isArray(message.content)) continue;
    for (const raw of message.content) {
      const part = raw as { type?: string; image_url?: { url?: unknown } } | null;
      const url = part?.image_url?.url;
      if (part?.type !== "image_url" || typeof url !== "string") continue;
      const prefix = /^data:image\/(?:png|jpeg|webp);base64,/.exec(url);
      if (prefix && /^[A-Za-z0-9+/]+={0,2}$/.test(url.slice(prefix[0].length))) imageBytes += url.length - prefix[0].length;
    }
  }
  return { bytes, textBytes: bytes - imageBytes };
}
function checkRequest(args: ModelInput) {
  const { bytes, textBytes } = requestSize(args);
  if (bytes > totalLimit) throw Error(`Creative request exceeds the ${totalLimit}-byte model input limit (${bytes} bytes). Reduce attached images or project context.`);
  if (textBytes > textLimit) throw Error(`Creative request exceeds the ${textLimit}-byte text and tool limit (${textBytes} bytes). Read fewer items or a smaller range.`);
}

export function boundCreativeRequest(model: SkillReferenceModel, repairContext?: "bounded-v1"): SkillReferenceModel {
  const prepareInput = (args: ModelInput): ModelInput => {
    const [messages, tools, signal, ...rest] = args;
    const compacted = repairContext === "bounded-v1" ? compactSupersededReviews(messages, candidate => {
      const size = requestSize([candidate, tools, signal, ...rest]);
      return size.bytes > totalLimit || size.textBytes > textLimit;
    }) : messages;
    const input: ModelInput = [compacted, tools, signal, ...rest];
    checkRequest(input);
    return input;
  };
  return {
    identity: model.identity,
    async prepare(...args) {
      const input = prepareInput(args);
      await model.prepare?.(...input);
    },
    async complete(...args) {
      return model.complete(...prepareInput(args));
    },
  };
}
