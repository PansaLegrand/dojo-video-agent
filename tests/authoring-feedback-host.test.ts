import {it,expect} from "vitest";
import {createVideoProjectDocument,hashVideoProjectDocument} from "../packages/core/src/lib/video-project/document";
import {createVideoToolset} from "../packages/agent/src/tools";
import {builtInSkills} from "../packages/agent-kit/src/index";
it("delivers compact node-specific failure feedback through the actual local tool session",async()=>{
 const document=createVideoProjectDocument({width:640,height:360,fps:30,durationInFrames:90});const request={contract:"video-project-commands"as const,version:1 as const,baseRevision:0,baseHash:await hashVideoProjectDocument(document),document,context:{selectedItemIds:[],playheadFrame:0},authoring:{version:1 as const,scope:{kind:"project"as const},requiredTextLayout:"sampled-v3"as const,authoringGuide:"complete-v1"as const}};
 const unavailable=async():Promise<never>=>{throw Error("Unexpected stage mutation")};
 const stages={phase:"planning"as const,generalEditing:true,deriveCaptionPlan:true,preparedCommands:false,planEditStages:unavailable,saveCaptionBatch:unavailable,readEditArtifact:unavailable,resolvePreparedEdit:async(value:unknown)=>value};
 const session=createVideoToolset(request,builtInSkills(),[],{profile:"local-editor-v14",agentKitVersion:"0.2.12",stages});const result:any=await session.tools.find(t=>t.name==="review_edit")!.execute({requirements:[{id:"title",kind:"item_present",itemId:"title"}],edit:{outcome:"proposal",summary:"Title",commands:[{type:"insertGraphic",itemId:"title",trackId:"visual",name:"Title",node:{id:"bad-title",type:"text",text:"Too much text",from:0,duration:90,style:{width:4,height:10,fontSize:32,minFontSize:12,maxLines:1,textFit:"shrink"}}}]}},new AbortController().signal);
 expect(result.value.completionPreflight).toMatchObject({status:"failed",checkCoverage:"failed-checks-only",omittedPassingChecks:1});expect(result.value.completionPreflight.checks.every((c:any)=>c.passed===false)).toBe(true);expect(result.value.completionPreflight.checks[0].message).toMatch(/title.*frame.*fit bounds/);expect(document.items).toHaveLength(0);
});
