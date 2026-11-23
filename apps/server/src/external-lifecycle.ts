import {z} from "zod/v3";
import {randomUUID} from "node:crypto";
import {canonicalSerialize} from "../../../packages/core/src/lib/video-project/document";
import {ProjectStore,HttpError,identifier,projectSummary} from "./store";
const operation=z.string().min(1).max(191).refine(id=>!["__proto__","constructor","prototype"].includes(id));
const basis={projectId:identifier,expectedRevision:z.number().int().nonnegative(),documentHash:z.string().regex(/^sha256:[a-f0-9]{64}$/)};
export class ExternalLifecycle {
 constructor(private store:ProjectStore){}
 handles(name:string){return["dojo_create_project","dojo_rename_project","dojo_history","dojo_undo","dojo_redo","dojo_list_sources","dojo_request_media_import","dojo_read_media_import"].includes(name)}
 async mediaRequests(projectId:string){const p=await this.store.read(projectId);return{requests:Object.values(p.externalMediaImports??{}).filter(r=>r.status==="pending"),revision:p.revision,documentHash:p.documentHash}}
 async finishMedia(projectId:string,id:string,raw:unknown){const input=z.object({status:z.enum(["completed","cancelled"]),sourceIds:z.array(z.string().max(191)).max(12).default([])}).strict().parse(raw);return this.store.transaction(projectId,p=>{
  const r=p.externalMediaImports?.[id];if(!r)throw new HttpError("Media request not found.",404);
  if(r.status!=="pending"){if(r.status!==input.status||canonicalSerialize(r.sourceIds)!==canonicalSerialize(input.sourceIds))throw new HttpError("Media request already settled.",409);return r;}
  if(input.status==="completed"&&(!input.sourceIds.length||input.sourceIds.some(id=>!p.sources.some(s=>s.sourceId===id)||!p.document.assets[id])))throw new HttpError("Choose and import the files before completing this request.",409);
  if(input.status==="cancelled"&&input.sourceIds.length)throw new HttpError("Cancelled requests have no imported files.",400);
  r.status=input.status;r.sourceIds=input.sourceIds;return r;
 })}
 async call(name:string,raw:unknown):Promise<unknown>{
  if(name==="dojo_create_project"){const v=z.object({name:z.string().trim().min(1).max(100),operationId:operation}).strict().parse(raw);const p=await this.store.createExternal(v.name,v.operationId);return{...projectSummary(p),revision:p.revision,documentHash:p.documentHash,editorPath:`/en/applications/editor/${p.id}`};}
  if(name==="dojo_undo"||name==="dojo_redo"){const v=z.object({...basis,operationId:operation}).strict().parse(raw);const s=await this.store.history(v.projectId,name==="dojo_undo"?"undo":"redo",{operationId:v.operationId,baseRevision:v.expectedRevision,baseHash:v.documentHash});return{projectId:v.projectId,revision:s.revision,documentHash:s.documentHash,history:s.history};}
  if(name==="dojo_history"||name==="dojo_list_sources"){const v=z.object({projectId:identifier}).strict().parse(raw),p=await this.store.read(v.projectId);return{projectId:p.id,revision:p.revision,documentHash:p.documentHash,...(name==="dojo_history"?{undoCount:p.past.length,redoCount:p.future.length,coverage:"available-history-counts"}:{sources:p.sources.map(({sourceId,fingerprint,byteLength,mimeType,fileName,status})=>({sourceId,fingerprint,byteLength,mimeType,fileName,status,assetId:p.document.assets[sourceId]?sourceId:null})),coverage:"registered-local-sources",browserFileAvailability:"not-inspected"})};}
  if(name==="dojo_read_media_import"){const v=z.object({projectId:identifier,requestId:identifier}).strict().parse(raw),p=await this.store.read(v.projectId),r=p.externalMediaImports?.[v.requestId];if(!r)throw new HttpError("Media request not found.",404);return{...r,revision:p.revision,documentHash:p.documentHash};}
  const v=name==="dojo_rename_project"?z.object({...basis,operationId:operation,expectedName:z.string().max(100),name:z.string().trim().min(1).max(100)}).strict().parse(raw):z.object({...basis,operationId:operation,purpose:z.string().trim().min(1).max(500)}).strict().parse(raw);
  return this.store.transaction(v.projectId,p=>{
   const hash=canonicalSerialize({name,input:v}),prior=Object.hasOwn(p.externalOperations??{},v.operationId)?p.externalOperations?.[v.operationId]:undefined;
   if(prior){if(prior.hash!==hash)throw new HttpError("Operation belongs to different inputs.",409);return prior.result;}
   if(p.revision!==v.expectedRevision||p.documentHash!==v.documentHash)throw new HttpError("Project changed. Inspect it again.",409,"NATIVE_REVIEW_STALE");
   let result:unknown;
   if("name"in v){if(p.name!==v.expectedName)throw new HttpError("Project name changed. Read it again.",409);p.name=v.name;result={projectId:p.id,name:p.name,revision:p.revision,documentHash:p.documentHash};}
   else{if(Object.values(p.externalMediaImports??{}).filter(r=>r.status==="pending").length>=4)throw new HttpError("Finish pending media requests first.",409);const r={id:randomUUID(),purpose:v.purpose,status:"pending"as const,sourceIds:[]as string[]};p.externalMediaImports??={};p.externalMediaImports[r.id]=r;result={requestId:r.id,status:r.status,requiresBrowser:true,nextAction:"The user chooses local files in the open editor. Read this request after completion; do not upload files or start paid work."};}
   p.externalOperations??={};p.externalOperations[v.operationId]={hash,result};return result;
  });
 }
}
