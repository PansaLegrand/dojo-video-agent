import {fixtureSourceHost} from './source-host.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {workflowFixtures,hash} from './fixtures.mjs';import {allNodes,gradeWorkflow} from './grade.mjs';
import {openCampaign} from '../creative-r36/campaign-continuation';
import {createOpenSourceCreativeSession,captureCreativeSource,creativeSourceUnchanged,atomicReport} from '../agent/creative-runner';
import {executeVideoProjectCommands} from '../../packages/core/src/lib/video-project/commands';
import {compileVideoProjectDocument} from '../../packages/core/src/lib/video-project/compilation';
const agent=process.cwd(),web=path.resolve('../dojo-video-web'),live=process.argv.includes('--live');
const option=(name:string,fallback:string)=>{const at=process.argv.indexOf(name);return at<0?fallback:process.argv[at+1]};
const root=path.resolve(option('--output',live?'test-results/workflow-reliability-2026-11-24/live':'test-results/workflow-reliability-2026-11-24/reference')),cohort=option('--cohort','initial');
if(!/^[a-z0-9-]{1,50}$/.test(cohort))throw Error('Invalid cohort');await fs.mkdir(root,{recursive:true,mode:0o700});
const fixture=await workflowFixtures();const fixtureFile=path.join(root,cohort==='initial'?'fixtures.json':'fixtures-'+cohort+'.json'),fixtureBytes=JSON.stringify(fixture,null,2)+'\n';
try{assert.equal(await fs.readFile(fixtureFile,'utf8'),fixtureBytes,'Frozen fixtures changed')}catch(error:any){if(error.code!=='ENOENT')throw error;await fs.writeFile(fixtureFile,fixtureBytes,{flag:'wx',mode:0o600})}
const sources=[await captureCreativeSource(agent,'open-source'),await captureCreativeSource(web,'commercial-web')];if(live)assert(sources.every(s=>!s.dirty),'Commit the tested candidate before paid dispatch');
const runtimePaths=['packages/video-project-runtime/dist/index.js','packages/video-project-runtime/dist/manifest.json','test-results/creative-skills/adapter.mjs'].map(file=>path.join(web,file));
const runtimeHashes=Object.fromEntries(await Promise.all(runtimePaths.map(async file=>[file,hash(await fs.readFile(file))])));
const frozenSource={sources,runtimeHashes};
const sourceFile=path.join(root,'source-'+hash(JSON.stringify(frozenSource)).slice(0,16)+'.json');try{await fs.writeFile(sourceFile,JSON.stringify(frozenSource,null,2),{flag:'wx',mode:0o600})}catch(e:any){if(e.code!=='EEXIST')throw e}
const unchanged=async()=> (await Promise.all(sources.map(creativeSourceUnchanged))).every(Boolean)&&(await Promise.all(Object.entries(runtimeHashes).map(async([file,digest])=>hash(await fs.readFile(file))===digest))).every(Boolean);
const adapter=await import(pathToFileURL(path.join(web,'test-results/creative-skills/adapter.mjs')).href);await adapter.assertCreativeWebReady();
const campaign=await openCampaign(root,[fixtureFile,sourceFile],live),signal=new AbortController();process.once('SIGINT',()=>signal.abort(Error('Qualification cancelled')));process.once('SIGTERM',()=>signal.abort(Error('Qualification cancelled')));
campaign.ledger.taskAuthorization={approvedLocalDate:'2026-11-23',maximumUsd:30,maximumRequests:320,scope:'Three Dojo workflows in both hosts; no media generation or new ASR',pricingSource:'https://kie.ai/gpt-6-astra',conservativeRates:'US$3.50/M input including cache writes; US$14/M output'};
campaign.ledger.acceptance??={version:'workflow-v1',workflows:['speech','chart','walkthrough'],repetitions:2,hosts:['open-source','commercial-web'],requirements:'All requested edits and follow-ups, original/manual preservation, independent semantics/geometry, exact candidate export, full decode and normal-speed playback; independent visual/translation review remains explicit',originalR36Grader:'unchanged; reused rubric and baseline technical checks; portrait walkthrough adds a separately versioned check'};
const unknown=(host:string,scenario:string,repetition:number)=>campaign.ledger.requests.some((r:any)=>r.phase==='unknown'&&r.host===host&&r.scenario===scenario&&r.repetition===repetition);
const slots=fixture.workflows.flatMap((workflow:any)=>['open-source','commercial-web'].flatMap(host=>[1,2,3].filter(repetition=>!unknown(host,workflow.id,repetition)).slice(0,2).map(repetition=>({workflow:workflow.id,host,repetition}))));
campaign.ledger.cohorts??=[];const priorCohort=campaign.ledger.cohorts.find((c:any)=>c.id===cohort);
if(priorCohort)assert.deepEqual(priorCohort.sourceCommits,sources.map(s=>s.commit),'Cohort source changed; choose a new cohort without resetting the budget');
else campaign.ledger.cohorts.push({id:cohort,sourceCommits:sources.map(s=>s.commit),fixtureFile:path.basename(fixtureFile),graderVersion:'workflow-v3',sourceInspection:'owned-fixture-pixels-v1',driverWaitMs:915000,slots,expected:12,reservePolicy:'Use two preplanned independent wording variants per host/workflow; original unknown journeys never retry. At most three distinct variants are available.'});
const activeSlots=priorCohort?.slots??slots;
await campaign.persist();
const save=async(file:string,value:unknown)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
try{
 if(!live){await save(path.join(root,`ready-${Date.now()}.json`),{ready:true,source:sources,fixtures:fixture.workflows.map((w:any)=>({id:w.id,turns:w.variants[0].length})),providerRequests:0});console.log(JSON.stringify({mode:'reference-preparation',ready:true,providerRequests:0,root}));}
 else workflowCases: for(let repetition=1;repetition<=3;repetition++)for(const workflow of fixture.workflows)for(const host of(repetition%2?['open-source','commercial-web']:['commercial-web','open-source'])){
  if(!activeSlots.some((s:any)=>s.workflow===workflow.id&&s.host===host&&s.repetition===repetition))continue;
  if(option('--case',workflow.id)!==workflow.id||option('--host',host)!==host||option('--repetition',String(repetition))!==String(repetition))continue;
  if(signal.signal.aborted)throw signal.signal.reason;
  const caseId=`${cohort}-${workflow.id}-${host}-${repetition}`;if(campaign.ledger.trials.some((t:any)=>t.caseId===caseId))continue;
  if(campaign.ledger.requests.some((r:any)=>r.phase==='unknown'&&r.host===host&&r.scenario===workflow.id&&r.repetition===repetition)){campaign.ledger.trials.push({caseId,status:'blocked-by-original-unknown',workflow:workflow.id,host,repetition});await campaign.persist();continue;}
  assert(await unchanged(),'Frozen candidate changed');
  const directory=path.join(root,caseId);await fs.mkdir(directory,{mode:0o700});
  const trial:any={caseId,workflow:workflow.id,host,repetition,cohort,sourceCommits:sources.map(s=>s.commit),fixtureFile:path.basename(fixtureFile),status:'running',startedAt:new Date().toISOString(),turns:[]};campaign.ledger.trials.push(trial);await campaign.persist();
  const sourceHost=fixtureSourceHost(fixture.files,path.join(directory,'source-inspections'))!;
  let local:any,document=structuredClone(workflow.document),history:any[]=[],manual:any;
  const guarded={get identity(){return campaign.model.identity},complete:async(...args:any[])=>{assert(await unchanged(),'Frozen candidate changed');return campaign.model.complete(...args)}};
  try{
   campaign.setContext({host,scenario:workflow.id,repetition,turn:1});
   if(host==='open-source')local=await createOpenSourceCreativeSession({scenario:{id:caseId,document},directory:path.join(directory,'store'),model:guarded,skillsDirectory:path.join(agent,'skills'),useCurrentLocalCatalog:true,settleTimeoutMs:915_000,browser:sourceHost,signal:signal.signal});
   for(const [index,instruction]of workflow.variants[repetition-1].entries()){
    const turn=index+1;campaign.setContext({host,scenario:workflow.id,repetition,turn});
    if(workflow.id==='chart'&&turn===2){const labels=allNodes(document).filter(({node}:any)=>(node.text??'').trim()==='W1');assert.equal(labels.length,1,'Manual edit needs one actual authored W1 label');manual={itemId:labels[0].item.id,nodeId:labels[0].node.id};const commands:any[]=[{type:'set',target:{kind:'node',...manual},path:['text'],value:'Week one'},{type:'set',target:{kind:'node',...manual},path:['style','color'],value:'#86DAD6'}];document=local?(await local.manualEdit(commands)).document:executeVideoProjectCommands(document,commands).document;await save(path.join(directory,'manual-edit.json'),{manual,commands,document});}
    const td=path.join(directory,'turn-'+turn);await fs.mkdir(td);const before=structuredClone(document),entry:any={turn,instruction,status:'running',requestStart:campaign.budget.requests.length};trial.turns.push(entry);await campaign.persist();await save(path.join(td,'before.json'),before);console.log(JSON.stringify({caseId,turn,status:'authoring',requests:campaign.budget.requests.length,accountedUsd:campaign.budget.accountedUsd}));
    assert(await unchanged(),'Frozen candidate changed');
    const result=local?await local.run(instruction,turn):await adapter.runCreativeWebTurn({document,instruction,history,model:guarded,signal:signal.signal,qualificationPolicy:'workflow-v1',sourceInspection:sourceHost});
    await save(path.join(td,'result.json'),result);document=result.document;history=result.history;await save(path.join(td,'document.json'),document);await save(path.join(td,'scene.json'),result.scene);entry.status='authored';entry.requests=campaign.budget.requests.length-entry.requestStart;entry.outcome=result.result.outcome;entry.reviewed=result.result.reviewed;await campaign.persist();
    assert.equal(result.result.outcome,'edit','A requested edit did not finish');assert(result.result.reviewed,'Edit has no successful native review');
    assert(await unchanged(),'Frozen candidate changed');
    const grade=gradeWorkflow({workflow:workflow.id,turn,before,after:document,initial:workflow.document,manual});await save(path.join(td,'grade.json'),grade);entry.grade=grade;entry.status=grade.passed?'semantics-passed':'semantic-failure';await campaign.persist();
    // Export saved paid candidates even when semantic grading fails. Never repair
    // them in the harness or relabel failure as autonomous success.
    const render=path.join(td,'render');assert(await unchanged(),'Frozen candidate changed');try{execFileSync(process.execPath,[path.join(web,'scripts/render-workflow-qualification.mjs'),path.join(td,'document.json'),fixtureFile,render,path.join(td,'scene.json')],{cwd:web,stdio:['ignore','pipe','pipe'],timeout:300000,maxBuffer:8*1024*1024});entry.export=JSON.parse(await fs.readFile(path.join(render,'report.json'),'utf8'));entry.status=grade.passed?'exported-awaiting-independent-review':'exported-semantic-failure';}catch(e:any){entry.renderError=String(e.message).slice(0,2000);entry.status='render-failure';}
    await campaign.persist();console.log(JSON.stringify({caseId,turn,status:entry.status,requests:campaign.budget.requests.length,accountedUsd:campaign.budget.accountedUsd}));
    if(!grade.passed||!entry.export)break;
   }
   trial.status=trial.turns.length===workflow.variants[repetition-1].length&&trial.turns.every((t:any)=>t.status==='exported-awaiting-independent-review')?'exported-awaiting-independent-review':'incomplete';
  }catch(error:any){trial.status='failed';trial.error=String(error.message).slice(0,2000);const unfinished=trial.turns.at(-1);if(unfinished?.status==='running'){unfinished.status='failed';unfinished.error=trial.error;}console.log(JSON.stringify({caseId,status:trial.status,error:trial.error}));if(/budget exhausted|Three independent provider failures|Frozen candidate changed/.test(trial.error))throw error}
  finally{await local?.close();trial.finishedAt=new Date().toISOString();await campaign.persist()}
  if(process.argv.includes('--stop-on-failure')&&trial.status!=='exported-awaiting-independent-review')break workflowCases;
 }
}finally{await campaign.close()}
