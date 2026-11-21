import { describe, expect, it } from "vitest";
import { brandKitPresets, videoBrandKitSchema } from "./brand-kit";
import { createVideoProjectDocument, parseVideoProjectDocument, canonicalSerialize, hashVideoProjectDocument } from "./document";
import { executeVideoProjectCommands, rebaseVideoProjectCommands } from "./commands";
import { planNativeAgentContext } from "./agent-context";
import { buildNativeAgentPrompts } from "./agent-runtime";

describe("saved Brand Kit", () => {
 it("keeps legacy documents exact and rejects unsafe or oversized brand data",()=>{
  const document=createVideoProjectDocument();expect(document.creativeContext).toEqual({decisions:[],references:[]});
  expect(canonicalSerialize(parseVideoProjectDocument(document))).toBe(canonicalSerialize(document));
  for(const raw of [{colors:{primary:"url(https://unowned.invalid)"}},{logoAssetId:"__proto__"},{cornerRadiusPx:201},{gradient:"url(https://unowned.invalid)"},{approvedFacts:Array.from({length:21},()=>"fact")},{rules:["x".repeat(501)]}]) expect(videoBrandKitSchema.safeParse(raw).success).toBe(false);
  brandKitPresets.forEach(p=>expect(videoBrandKitSchema.safeParse(p.kit).success).toBe(true));
 });
 it("updates identity alone, preserves comments, supports inverse history and rejects stale rebase",()=>{
  const document=createVideoProjectDocument();document.creativeContext.decisions=[{id:"story",text:"Keep a calm ending",entityIds:[]}];
  const context={...document.creativeContext,brandKit:brandKitPresets[0].kit},command={type:"updateCreativeContext" as const,context};
  const after=executeVideoProjectCommands(document,[command]).document;
  expect(after.items).toEqual(document.items);expect(after.format).toEqual(document.format);expect(after.creativeContext.decisions).toEqual(document.creativeContext.decisions);
  expect(executeVideoProjectCommands(after,[{type:"updateCreativeContext",context:document.creativeContext}]).document).toEqual(document);
  const concurrent=executeVideoProjectCommands(document,[{type:"updateCreativeContext",context:{...document.creativeContext,brandKit:brandKitPresets[1].kit}}]).document;
  expect(rebaseVideoProjectCommands(document,concurrent,[command]).ok).toBe(false);
 });
 it("requires an owned image logo and keeps it in bounded model context",async()=>{
  const document=createVideoProjectDocument();
  expect(()=>executeVideoProjectCommands(document,[{type:"updateCreativeContext",context:{...document.creativeContext,brandKit:{logoAssetId:"missing"}}}])).toThrow(/logo/);
  document.assets.logo={id:"logo",name:"Brand mark",type:"image",source:"local"};document.sources.logo={assetId:"logo",revision:"owned-logo"};
  document.creativeContext.brandKit={...brandKitPresets[1].kit,logoAssetId:"logo",approvedFacts:["Made in Lyon"]};
  const parsed=parseVideoProjectDocument(document),context={selectedItemIds:[],playheadFrame:0};
  const plan=planNativeAgentContext({document:parsed,instruction:"Add a matching ending",context});
  expect(plan.document.creativeContext.brandKit).toEqual(document.creativeContext.brandKit);expect(plan.document.assets.logo).toEqual(document.assets.logo);expect(plan.document.sources.logo).toEqual(document.sources.logo);
  const prompt=buildNativeAgentPrompts({document:parsed,baseHash:await hashVideoProjectDocument(parsed),context,instruction:"Add a matching ending",messages:[],responseMode:"tools"});
  expect(prompt.systemPrompt).toContain("not a timing or layout template");expect(prompt.userPrompt).toContain("Made in Lyon");
 });
});
