import { NativeAgentDiagnosticError } from "../../../packages/core/src/lib/video-project/agent-diagnostics";
import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { AGENT_KIT_VERSION, builtInSkills, completionCanonical, completionHash, createEditStagePlan, parseCompletionRequirements, type Skill } from "../../../packages/agent-kit/src/index";
import { createVideoToolset } from "../../../packages/agent/src/tools";
import { reviewNativeCompletionEdit, compileNativeCompletionResponse } from "../../../packages/core/src/lib/video-project/completion-preflight";
import { hashVideoProjectDocument } from "../../../packages/core/src/lib/video-project/document";
import { nativeAgentScopeSchema } from "../../../packages/core/src/lib/video-project/agent-authoring";
import { installedNativeMacroCatalog } from "../../../packages/core/src/lib/video-project/native-macro-catalog";
import { buildNativeAgentPrompts, compileNativeAgentResult, type NativeAgentRequest } from "../../../packages/core/src/lib/video-project/agent-runtime";
import { ProjectStore, HttpError, identifier, runOf, snapshot, type Project, type StoredRun } from "./store";
import type { AgentService } from "./agent-service";
import type { LocalBrowserRequests } from "./local-browser-requests";
import { localEditStageBinding, putLocalEditStageArtifact } from "./edit-stage-store";

const operation=z.string().min(1).max(191), hash=z.string().regex(/^sha256:[a-f0-9]{64}$/);
const basis=z.object({projectId:identifier,expectedRevision:z.number().int().nonnegative(),documentHash:hash}).strict();
const reviewInput=basis.extend({operationId:operation,instruction:z.string().min(1).max(4000),scope:nativeAgentScopeSchema.optional(),edit:z.unknown(),requirements:z.array(z.unknown()).min(1).max(12)}).strict();
const applyInput=basis.extend({operationId:operation,reviewId:identifier}).strict();
export const externalReadTools = ["inspect_project","list_assets","read_caption_cues","read_caption_track","search_transcript","read_skill","inspect_graphics_schema","prepare_svg_graphic","prepare_three_scene"] as const;
const readerInput=z.object({projectId:identifier,args:z.record(z.unknown()).default({})}).strict();
const options={preserveAuthoredPaintOrder:true,preciseSpeechDiagnostics:true,validateSourceRequirements:true} as const;
function requestFor(project:Project,instruction="Inspect the saved local project.",scope:z.infer<typeof nativeAgentScopeSchema>={kind:"project"}):NativeAgentRequest {
 return {contract:"video-project-commands",version:1,baseRevision:project.revision,baseHash:project.documentHash,document:structuredClone(project.document),instruction,context:{selectedItemIds:scope.kind==='selection'?scope.itemIds:[],playheadFrame:0},authoring:{version:1,scope,macroCatalog:installedNativeMacroCatalog(),visualReview:'sequence-v1',requiredTextLayout:'sampled-v1',spatialCanvas:'scene-v1',endingVisibility:'final-frame-v1'}};
}
function snapshotIdentity(value:ReturnType<typeof snapshot>){return {projectId:value.projectId,revision:value.revision,documentHash:value.documentHash,history:value.history}}
function assertBasis(project:Project,input:z.infer<typeof basis>){if(project.revision!==input.expectedRevision||project.documentHash!==input.documentHash)throw new HttpError("The project changed. Inspect the latest revision and review the edit again.",409,"NATIVE_REVIEW_STALE")}
function externalRun(project:Project,id:string){const run=runOf(project,id);if(!run.externalAgent)throw new HttpError("This review belongs to another editing workflow.",409);return run}
/** Local authority shared by the stdio bridge and existing browser. No model calls. */
export class ExternalAgentService {
 constructor(private store:ProjectStore,private agent:AgentService,private browser:LocalBrowserRequests,private skills:Skill[]=builtInSkills()){}
 async state(projectId:string){const project=await this.store.read(identifier.parse(projectId));return {enabled:true,stateKey:await completionHash({documentHash:project.documentHash,revision:project.revision,runs:project.runs.filter(run=>run.externalAgent).map(run=>({id:run.id,status:run.status,requests:Object.values(project.browserRequests?.[run.id]??{}).map(row=>({status:row.status,receipt:!!row.receipt,error:row.error}))}))})};}
 async list(){return {projects:await this.store.list(),coverage:"all-local-projects" as const}}
 async read(tool:typeof externalReadTools[number],raw:unknown,signal:AbortSignal){
  const input=readerInput.parse(raw),project=await this.store.read(input.projectId),request=requestFor(project);
  const unavailable=async():Promise<never>=>{throw new HttpError("Use the explicit review/apply tools for edits.",400)};
  const session=createVideoToolset(request,this.skills,[],{profile:'local-editor-v14',agentKitVersion:AGENT_KIT_VERSION,stages:{phase:'planning',generalEditing:true,deriveCaptionPlan:true,preparedCommands:false,planEditStages:unavailable,saveCaptionBatch:unavailable,readEditArtifact:unavailable,resolvePreparedEdit:async value=>value}});
  const selected=session.tools.find(value=>value.name===tool);if(!selected)throw new HttpError("This tool is unavailable for the current editing runtime.",400);
  const result=await selected.execute(input.args,signal);if(result.kind!=='observation')throw new HttpError("A reader attempted to change the project.",409);
  const selectedSkill=tool==='read_skill'&&session.skills.some(skill=>skill.name===input.args.name)?this.skills.find(skill=>skill.name===input.args.name):undefined;
  return {projectId:project.id,revision:project.revision,documentHash:project.documentHash,kitVersion:AGENT_KIT_VERSION,result:result.value,...(tool==='inspect_project'?{skills:this.skills.map(({name,description})=>({name,description})),authoringGuide:buildNativeAgentPrompts({...request,document:project.document,instruction:request.instruction??'Inspect the saved project.',messages:[],responseMode:'tools'}).systemPrompt}:{}),...(selectedSkill?.references?.some(ref=>ref.image)?{visualReferences:selectedSkill.references.filter(ref=>ref.image).map(ref=>ref.image)}:{})};
 }
 async review(raw:unknown){
  const input=reviewInput.parse(raw),requestHash='external:'+await completionHash(input);
  return this.store.transaction(input.projectId,async project=>{
   const prior=project.runs.find(run=>run.operationId===input.operationId);
   if(prior){if(prior.requestHash!==requestHash||!prior.externalAgent)throw new HttpError("Operation ID already belongs to another edit.",409);return {reviewId:prior.id,candidateRef:prior.externalAgent.reviewRef,baseRevision:prior.baseRevision,baseHash:prior.baseHash,checks:(project.editStagePlans?.[prior.id]?.artifacts[prior.externalAgent.reviewRef.id]?.value as {checks?:unknown[]}|undefined)?.checks??[],replayed:true}}
   assertBasis(project,input);const request=requestFor(project,input.instruction,input.scope);
   let review;try{review=await reviewNativeCompletionEdit(request,{requirements:input.requirements,edit:input.edit},options)}catch(error){if(error instanceof NativeAgentDiagnosticError)return {status:'failed' as const,saved:false,diagnostic:error.diagnostic,nextAction:'Use the reported command and full field path to correct the draft, then review again. No edit was saved or applied.'};throw error}
   if(!review.receipt)return {status:'failed' as const,checks:review.checks,saved:false};
   const result=await compileNativeCompletionResponse(request,{...(input.edit as object),completion:{requirements:input.requirements,receipt:review.receipt}},options);
   if(!result.proposal||result.outcome!=='proposal')throw new HttpError("Review requires an edit proposal.",400);
   const now=new Date().toISOString(),run:StoredRun={id:randomUUID(),operationId:input.operationId,instruction:input.instruction,status:'needs_evidence',phase:'waiting_for_host',baseRevision:project.revision,baseHash:project.documentHash,context:request.context,scope:request.authoring?.scope,proposal:result.proposal,completion:result.completion??{requirements:input.requirements as any,receipt:review.receipt},prerequisites:null,error:null,createdAt:now,updatedAt:now,reviewBasisRequired:true,captionTranslationRebase:true,browserToolsEnabled:true,agentProfile:'local-editor-v14',agentKitVersion:AGENT_KIT_VERSION,request,requestHash,events:[]};
   project.runs.push(run);
   const binding=await localEditStageBinding(project,run,'external-agent:no-provider'),plan=await createEditStagePlan({id:'external:'+run.id,binding,instruction:run.instruction,requirements:parseCompletionRequirements(input.requirements,{assetSequence:true,speechCallout:true}),limits:{modelCalls:1,toolCalls:64,outputTokens:32000,attempts:64,expiresAt:new Date(Date.now()+86400000).toISOString(),perStage:{modelCalls:1,toolCalls:24,outputTokens:32000}},stages:[{id:'assemble',kind:'assemble',execution:'model',dependencies:[],inputs:[]}]});
   const state={definitionHash:plan.definitionHash,plan,artifacts:{},checkpoints:{}};const ref=await putLocalEditStageArtifact(state,'verification',{kind:'editing-review',edit:input.edit,requirements:input.requirements,checks:review.checks,receipt:review.receipt});
   project.editStagePlans??={};project.editStagePlans[run.id]={...state,lastReviews:{assemble:ref},savedCandidateRef:ref};run.externalAgent={version:1,reviewRef:ref};
   project.messages.push({id:randomUUID(),runId:run.id,role:'user',text:input.instruction,status:'completed',createdAt:now});
   return {status:'reviewed' as const,reviewId:run.id,candidateRef:ref,baseRevision:run.baseRevision,baseHash:run.baseHash,checks:review.checks,replayed:false};
  });
 }
 async apply(raw:unknown){
  const input=applyInput.parse(raw);
  await this.store.transaction(input.projectId,project=>{const run=externalRun(project,input.reviewId);if(run.status==='applied')return;if(run.status==='cancelled'||run.status==='failed')throw new HttpError('This external edit is stopped.',409);if(run.baseRevision!==input.expectedRevision||run.baseHash!==input.documentHash)throw new HttpError('This review belongs to an older project revision. Review the edit again.',409,'NATIVE_REVIEW_STALE');assertBasis(project,input);run.status='awaiting_review';});
  const review=await this.agent.review(input.projectId,input.reviewId);
  if(review.applied)return {snapshot:snapshotIdentity(snapshot(await this.store.read(input.projectId))),replayed:true};
  const result=await this.agent.apply(input.projectId,input.reviewId,{operationId:input.operationId,baseRevision:input.expectedRevision,baseHash:input.documentHash,reviewBasis:review.review.basis});
  return {snapshot:snapshotIdentity(result),replayed:false};
 }
 async preview(raw:unknown,signal:AbortSignal){
  const input=z.object({projectId:identifier,reviewId:identifier,args:z.record(z.unknown())}).strict().parse(raw),project=await this.store.read(input.projectId),run=externalRun(project,input.reviewId);
  if(Object.hasOwn(input.args,'candidateRef')||Object.hasOwn(input.args,'reviewed'))throw new HttpError('The host binds the preview to its exact external review.',400);
  const tool=this.browser.tools(project.id,run.id,run.request).find(t=>t.name==='request_project_preview')!;
  return tool.execute({...input.args,candidateRef:run.externalAgent!.reviewRef},signal);
 }
 async export(raw:unknown,signal:AbortSignal){
  const input=z.object({projectId:identifier,reviewId:identifier,args:z.record(z.unknown())}).strict().parse(raw),project=await this.store.read(input.projectId),run=externalRun(project,input.reviewId);
  const tool=this.browser.tools(project.id,run.id,run.request).find(t=>t.name==='request_project_export')!;
  return tool.execute(input.args,signal);
 }
 async readPreview(raw:unknown){const input=z.object({projectId:identifier,reviewId:identifier,requestId:z.string().min(1).max(191)}).strict().parse(raw);externalRun(await this.store.read(input.projectId),input.reviewId);return this.browser.receipt(input.projectId,input.reviewId,input.requestId)}
 async call(name:string,raw:unknown,signal:AbortSignal){
  signal.throwIfAborted();if(raw===undefined)throw new HttpError('Tool input is required.',400);if(Buffer.byteLength(JSON.stringify(raw))>256*1024)throw new HttpError('External tool input exceeds its allowance.',413);
  if(name==='dojo_list_projects'){z.object({}).strict().parse(raw);return this.list()}
  if(name==='dojo_prepare_blueprint_graphic'){
   const input=z.object({projectId:identifier,itemId:operation,trackId:operation,from:z.number().int().nonnegative(),duration:z.number().int().min(1).max(18000),params:z.record(z.unknown())}).strict().parse(raw);
   const project=await this.store.read(input.projectId),request=requestFor(project,'Prepare an editable blueprint without applying it.');
   const prepared=await compileNativeAgentResult(request,{outcome:'proposal',summary:'Prepared editable blueprint',commands:[{type:'insertGraphic',itemId:input.itemId,name:'Prepared blueprint',trackId:input.trackId,node:{...input.params,id:input.itemId,macro:'remixBlueprint',from:input.from,duration:input.duration}}]});
   const item=prepared.proposal?.commands.find(command=>command.type==='addItem');
   if(!item||item.type!=='addItem')throw new HttpError('The blueprint did not produce an editable item.',409);
   return {projectId:project.id,revision:project.revision,documentHash:project.documentHash,node:item.item.node,applied:false,next:'Use insertGraphic in dojo_review_edit to review this node before applying.'};
  }
  if(name==='dojo_review_edit')return this.review(raw);
  if(name==='dojo_apply_edit')return this.apply(raw);
  if(name==='dojo_request_preview')return this.preview(raw,signal);
  if(name==='dojo_request_export')return this.export(raw,signal);
  if(name==='dojo_read_preview'||name==='dojo_read_output')return this.readPreview(raw);
  const tool=name.replace(/^dojo_/,'');if(!(externalReadTools as readonly string[]).includes(tool))throw new HttpError('Unknown external editor tool.',404);
  return this.read(tool as typeof externalReadTools[number],raw,signal);
 }
}
