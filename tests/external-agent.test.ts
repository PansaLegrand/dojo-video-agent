import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {ProjectStore} from '../apps/server/src/store';import {AgentService} from '../apps/server/src/agent-service';import {LocalBrowserRequests} from '../apps/server/src/local-browser-requests';import {ExternalAgentService} from '../apps/server/src/external-agent';
import {hashVideoProjectDocument} from '../packages/core/src/lib/video-project/document';
const roots:string[]=[];afterEach(async()=>{await Promise.all(roots.splice(0).map(p=>rm(p,{recursive:true,force:true})))});
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),'dojo-external-'));roots.push(root);const store=new ProjectStore(root);await store.init();const created=await store.create();await store.transaction(created.id,async project=>{project.document.format={...project.document.format,width:640,height:360,durationInFrames:90};project.document.items.push({id:'title',trackId:'visual',name:'Title',node:{id:'title',type:'text',from:0,duration:90,text:'Stay editable',style:{left:40,top:120,width:560,height:80,fontSize:38,fontFamily:'system-ui',color:'#ffffff'}}});project.documentHash=await hashVideoProjectDocument(project.document);project.versions={'0':structuredClone(project.document)}});const project=await store.read(created.id),complete=vi.fn(async():Promise<never>=>{throw Error('MCP must not call a provider')}),agent=new AgentService(store,{identity:'test:no-provider',complete},[],undefined,'review'),browser=new LocalBrowserRequests(store),service=new ExternalAgentService(store,agent,browser);
 const input={projectId:project.id,expectedRevision:project.revision,documentHash:project.documentHash,operationId:'external-review',instruction:'Make the title coral',edit:{outcome:'proposal',summary:'Coral title',commands:[{type:'set',target:{kind:'node',itemId:'title',nodeId:'title'},path:['style','color'],value:'#F18F6D'}]},requirements:[{id:'title',kind:'item_present',itemId:'title'}]};return{store,project,agent,browser,service,complete,input};}
it('reviews without mutation, binds preview to the immutable candidate, and applies one ordinary Undo entry',async()=>{
 const f=await fixture(),review=await f.service.review(f.input);if(!('reviewId'in review)||!review.reviewId)throw Error('Expected review');
 expect((await f.store.read(f.project.id)).documentHash).toBe(f.project.documentHash);
 expect(await f.service.review(f.input)).toMatchObject({reviewId:review.reviewId,replayed:true});
 await expect(f.service.preview({projectId:f.project.id,reviewId:review.reviewId,args:{frames:[0,30]}},new AbortController().signal)).resolves.toMatchObject({kind:'waiting'});
 const row=(await f.browser.list(f.project.id,review.reviewId,'project-preview')).requests[0]!;expect(row.request).toMatchObject({candidateRef:review.candidateRef});
 const applied=await f.service.apply({projectId:f.project.id,reviewId:review.reviewId,expectedRevision:f.project.revision,documentHash:f.project.documentHash,operationId:'external-apply'});
 expect(applied.replayed).toBe(false);const after=await f.store.read(f.project.id);expect(after.document.items[0]!.node.style!.color).toBe('#F18F6D');expect(after.past).toHaveLength(1);
 expect((await f.service.apply({projectId:f.project.id,reviewId:review.reviewId,expectedRevision:f.project.revision,documentHash:f.project.documentHash,operationId:'external-apply'})).replayed).toBe(true);expect((await f.store.read(f.project.id)).past).toHaveLength(1);expect(f.complete).not.toHaveBeenCalled();
});
it('rejects stale apply and invalid/off-canvas edits while allowing a corrected new review',async()=>{
 const f=await fixture();const invalid:any=structuredClone(f.input);invalid.edit.commands[0]!.path=['style','left'];invalid.edit.commands[0]!.value=900;
 const failed=await f.service.review(invalid);expect(failed).toMatchObject({status:'failed',saved:false});expect((await f.store.read(f.project.id)).runs).toHaveLength(0);
 const review=await f.service.review(f.input);if(!('reviewId'in review)||!review.reviewId)throw Error('Expected review');
 await f.store.commit(f.project.id,{operationId:'manual-edit',baseRevision:0,baseHash:f.project.documentHash,commands:[{type:'set',target:{kind:'node',itemId:'title',nodeId:'title'},path:['text'],value:'Manual edit stays'}]});
 await expect(f.service.apply({projectId:f.project.id,reviewId:review.reviewId,expectedRevision:0,documentHash:f.project.documentHash,operationId:'stale-apply'})).rejects.toMatchObject({code:'NATIVE_REVIEW_STALE'});
 const latest=await f.store.read(f.project.id);await expect(f.service.apply({projectId:f.project.id,reviewId:review.reviewId,expectedRevision:latest.revision,documentHash:latest.documentHash,operationId:'relabel-old-review'})).rejects.toMatchObject({code:'NATIVE_REVIEW_STALE'});
 expect((await f.store.read(f.project.id)).document.items[0]!.node.text).toBe('Manual edit stays');expect(f.complete).not.toHaveBeenCalled();
});
it('keeps external reviews across restart without creating an internal model job and rejects foreign review IDs',async()=>{
 const f=await fixture(),review=await f.service.review(f.input);if(!('reviewId'in review)||!review.reviewId)throw Error('Expected review');
 await expect(f.agent.resume(f.project.id,review.reviewId,{operationId:'wrong-host',baseRevision:0,baseHash:f.project.documentHash})).rejects.toMatchObject({code:'EXTERNAL_AGENT_OWNED'});
 await f.store.recoverInterrupted();expect((await f.store.read(f.project.id)).runs[0]!.status).toBe('needs_evidence');
 const other=await f.store.create();await expect(f.service.apply({projectId:other.id,reviewId:review.reviewId,expectedRevision:other.revision,documentHash:other.documentHash,operationId:'foreign'})).rejects.toThrow();
 const reader=await f.service.read('inspect_project',{projectId:f.project.id,args:{itemIds:['title']}},new AbortController().signal);expect(reader).toMatchObject({revision:0,documentHash:f.project.documentHash});expect(f.complete).not.toHaveBeenCalled();
});
it('prepares an installed blueprint as an editable native node without committing it',async()=>{
 const f=await fixture(),before=(await f.store.read(f.project.id)).documentHash;
 const result:any=await f.service.call('dojo_prepare_blueprint_graphic',{projectId:f.project.id,itemId:'ending',trackId:'visual',from:0,duration:90,params:{blueprint:'orbit',headline:'North Studio',subheadline:'A place to begin.'}},new AbortController().signal);
 expect(result.applied).toBe(false);expect(result.node.id).toBe('ending');expect(result.node.children.length).toBeGreaterThan(0);expect((await f.store.read(f.project.id)).documentHash).toBe(before);expect(f.complete).not.toHaveBeenCalled();
});

it('returns precise nested field diagnostics for a malformed native candidate without saving a review',async()=>{
 const f=await fixture(),input:any=structuredClone(f.input);input.edit.commands=[{type:'addItem',item:{id:'new',name:'New',trackId:'visual',node:{id:'new',type:'div',from:0,duration:90,children:[{id:'child',type:'shape',shape:{kind:'circle'}}]}}}];
 const result:any=await f.service.review(input);expect(result.status).toBe('failed');expect(result.saved).toBe(false);expect(result.diagnostic.issues.some((issue:any)=>issue.path.includes('shape') && issue.path.includes('kind'))).toBe(true);expect((await f.store.read(f.project.id)).runs).toHaveLength(0);
});

it('returns the covered-title diagnostic through MCP review without saving or applying a run',async()=>{
 const f=await fixture(),input:any=structuredClone(f.input);
 input.edit.commands.push({type:'insertGraphic',itemId:'card',name:'Card',trackId:'visual',node:{id:'card',type:'div',from:0,duration:90,style:{position:'absolute',left:20,top:100,width:600,height:120,backgroundColor:'#101010',zIndex:40}}});
 const failed:any=await f.service.review(input);
 expect(failed).toMatchObject({status:'failed',saved:false});
 expect(failed.checks).toContainEqual(expect.objectContaining({id:'text-occluded',message:expect.stringMatching(/title.*card/)}));
 expect((await f.store.read(f.project.id)).runs).toHaveLength(0);
 input.edit.commands.push({type:'set',target:{kind:'node',itemId:'title',nodeId:'title'},path:['style','zIndex'],value:50});
 const repaired:any=await f.service.review(input);expect(repaired.status).toBe('reviewed');
 expect((await f.store.read(f.project.id)).runs[0].request.authoring?.requiredTextLayout).toBe('sampled-v2');
 expect((await f.store.read(f.project.id)).documentHash).toBe(f.project.documentHash);
 expect(f.complete).not.toHaveBeenCalled();
});
