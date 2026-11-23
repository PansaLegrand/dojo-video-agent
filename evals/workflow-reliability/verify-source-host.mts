import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {workflowFixtures} from './fixtures.mjs';
import {fixtureSourceHost} from './source-host.mjs';
import {hashVideoProjectDocument} from '../../packages/core/src/lib/video-project/document';
import type {ChatMessage} from '../../packages/agent-loop/src/index';
const fixtures=await workflowFixtures(),directory=await fs.mkdtemp(path.join(os.tmpdir(),'dojo-source-host-'));
try {
 for(const [workflow,name,toolName,args] of [['walkthrough','capture.png','inspect_image',{}],['speech','news.mp4','sample_video_frames',{momentsMs:[1000,3000]}]] as const){
  const doc=fixtures.workflows.find(w=>w.id===workflow)!.document, source=fixtures.files.find((f:any)=>f.name===name);
  const host=fixtureSourceHost(fixtures.files,directory)!,request={contract:'video-project-commands' as const,version:1 as const,baseRevision:0,baseHash:await hashVideoProjectDocument(doc),document:doc,instruction:'Inspect the authorized fixture',context:{selectedItemIds:[],playheadFrame:0}};
  const tool=host.tools('fixture','run',request).find(t=>t.name===toolName)!,signal=new AbortController().signal;
  const result=await tool.execute({sourceId:source.assetId,...args},signal);assert.equal(result.kind,'observation');if(result.kind!=='observation')throw Error('Expected pixels');
  assert(!JSON.stringify(result).includes('base64'));
  await assert.rejects(tool.execute({sourceId:'not-owned',...args},signal),/owned source/);
  const value=result.value as any;assert.equal(value.visualInput.frames.length,workflow==='speech'?2:1);assert(value.visualInput.frames.every((f:any)=>f.width<=768&&f.height<=768&&f.byteLength<=128*1024));
  const messages:ChatMessage[]=[{role:'assistant',content:'',tool_calls:[{id:'inspect',type:'function',function:{name:toolName,arguments:JSON.stringify({sourceId:source.assetId,...args})}}]},{role:'tool',tool_call_id:'inspect',content:JSON.stringify(result.value)}];
  let calls=0;const model=host.model('fixture','run',{identity:'fixture-proof',complete:async input=>{calls++;const images=input.flatMap(m=>typeof m.content==='string'?[]:m.content??[]).filter((p:any)=>p.type==='image_url');assert.equal(images.length,value.visualInput.frames.length);return{text:'inspected',calls:[]}}});
  await model.prepare!(messages,[],signal);await model.complete(messages,[],signal);assert.equal(calls,1);
  const tampered=structuredClone(messages);tampered[1].content=JSON.stringify({visualInput:{...value.visualInput,receiptHash:'a'.repeat(64)}});await assert.rejects(model.prepare!(tampered,[],signal),/not owned/);assert.equal(calls,1);
 }
 console.log(JSON.stringify({passed:true,providerRequests:0,checks:['image pixels','exact video source PTS','owned receipts','metadata-only observations','hydrated trusted model inputs','tampered ref refused']}));
} finally {await fs.rm(directory,{recursive:true,force:true})}
