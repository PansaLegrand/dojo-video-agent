import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {createEditorHostTools,completionCanonical,type EditorVisualInputRef} from '../../packages/agent-kit/src/index';
import {withLocalVisualInputs,type ResolvedVisualFrame} from '../../apps/server/src/local-visual-model';
import {parseVideoProjectDocument} from '../../packages/core/src/lib/video-project/document';
import type {NativeAgentResult} from '../../packages/core/src/lib/video-project/agent-runtime';
import type {AgentService} from '../../apps/server/src/agent-service';
const hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
/** Actual pixels from the immutable, task-authorized local qualification corpus.
 * Only these source IDs can be inspected. This is a fixture consent adapter, not
 * production UI consent or a new source of upload/generation authority. */
export function fixtureSourceHost(files:any[],directory:string):NonNullable<ConstructorParameters<typeof AgentService>[7]>['browser'] {
 const records=new Map<string,{ref:EditorVisualInputRef;frames:ResolvedVisualFrame[]}>();
 return {
  tools(projectId,runId,request){
   const document=parseVideoProjectDocument(request.document);
   const inspect=async(input:Record<string,unknown>,video:boolean)=>{
    const sourceId=String(input.sourceId),asset=document.assets[sourceId],source=document.sources[sourceId],file=files.find(f=>f.assetId===sourceId);
    if(!file||!asset||!source||asset.type!==(video?'video':'image')||source.contentHash!==file.sha256)throw Error('Choose an owned source in this frozen fixture.');
    const moments=video?input.momentsMs as number[]:[0];if(!Array.isArray(moments)||!moments.length||moments.length>4||moments.some(ms=>!Number.isFinite(ms)||ms<0||video&&ms>12000))throw Error('Choose 1–4 source moments inside the fixture.');
    if(hash(await fs.readFile(file.path))!==file.sha256)throw Error('Owned fixture bytes changed.');
    const scope={projectId,runId,snapshotHash:request.baseHash,sourceId,sourceHash:file.sha256,moments,consent:'user-authorized-qualification-fixtures'},scopeHash=hash(completionCanonical(scope)),id='inspection:'+scopeHash.slice(0,40);
    if(records.has(id))return{kind:'observation' as const,value:{visualInput:records.get(id)!.ref}};
    await fs.mkdir(directory,{recursive:true,mode:0o700});
    const pts=video?(JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',file.path],{encoding:'utf8',maxBuffer:8*1024*1024})).frames.map((f:any)=>Number(f.best_effort_timestamp_time)*1000) as number[]):[0];
    const frames:ResolvedVisualFrame[]=[],metadata:any[]=[];
    for(const [index,requestedMs]of moments.entries()){
     let frame=0;for(let i=0;i<pts.length;i++)if(pts[i]<=requestedMs)frame=i;const actualMs=pts[frame];
     const output=path.join(directory,scopeHash+'-'+index+'.jpg');const filter=(video?`select=eq(n\\,${frame}),`:'')+"scale=w='min(768,iw)':h='min(768,ih)':force_original_aspect_ratio=decrease";
     execFileSync('ffmpeg',['-v','error','-i',file.path,'-vf',filter,'-frames:v','1','-q:v','3','-y',output],{timeout:30000});const bytes=await fs.readFile(output);if(bytes.length>128*1024)throw Error('Source JPEG exceeds the fixture allowance.');
     const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',output],{encoding:'utf8'})).streams[0],sha256=hash(bytes);
     metadata.push({sha256,byteLength:bytes.length,mimeType:'image/jpeg',width:info.width,height:info.height,sourceId,sourceRevision:source.revision,requestedMs,actualMs});
     frames.push({dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64'),sha256,byteLength:bytes.length,label:{kind:'source-inspection',sourceId,sourceRevision:source.revision,sourceHash:file.sha256,requestedMs,actualMs,coverage:'requested-frames-only',audio:'not-inspected',originalWidth:asset.width,originalHeight:asset.height,consent:'task-owned fixture grant'}});
    }
    const ref:EditorVisualInputRef={version:1,requestRef:{kind:'source-inspection',id,hash:scopeHash},receiptHash:hash(completionCanonical({scope,metadata})),frames:metadata};records.set(id,{ref,frames});await fs.writeFile(path.join(directory,scopeHash+'.json'),JSON.stringify({scope,ref},null,2));return{kind:'observation' as const,value:{visualInput:ref}};
   };
   return createEditorHostTools<NativeAgentResult>({profile:'local-editor-v14',ports:{inspect_image:input=>inspect(input,false),sample_video_frames:input=>inspect(input,true)}}).map(tool=>({...tool,replaySafe:true,compactionSafe:false}));
  },
  model(_projectId,_runId,model){return withLocalVisualInputs(model,async(ref,signal)=>{signal.throwIfAborted();const saved=records.get(ref.requestRef.id);if(!saved||completionCanonical(ref)!==completionCanonical(saved.ref))throw Error('Inspection receipt is not owned by this fixture host.');return saved.frames})},
  previewEvidence:async()=>{throw Error('This source-inspection fixture does not claim candidate-preview evidence.')},
  cancel:async()=>{},
 };
}
