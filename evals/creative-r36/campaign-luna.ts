import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {GptResponsesModel} from '../../packages/adapters/src/gpt-responses';
import {EvaluationBudget,EvaluationAdmissionError} from '../agent/request-budget';
import {createCreativeCampaignModel, atomicReport} from '../agent/creative-runner';
import {assertKieEvaluationEndpoint} from '../agent/reliability';

export const authorization = {maximumUsd:30,maximumRequests:320,rates:{inputUsdPerMillion:3.5,outputUsdPerMillion:14},model:'gpt-6-astra',endpoint:'https://api.kie.ai/codex/v1/responses'} as const;
export const hash = (bytes: string|Buffer) => createHash('sha256').update(bytes).digest('hex');
export const fallbackPolicy={id:'gpt-6-luna-fallback-v1',model:'gpt-6-luna',rates:{inputUsdPerMillion:0.05,outputUsdPerMillion:0.20},pricingSource:'https://kie.ai/gpt-6-sol-and-luna%20',note:'Luna is the selected model on the quoted pricing card. These forward-only accounting rates exceed its published input/cache-write/output prices. Earlier Astra charges and reservations are unchanged.'} as const;
export const caseKey=(c:any)=>JSON.stringify([c.host,c.scenario,c.repetition]);
/** An unknown LLM reply never authorizes replay. Its full reservation remains charged;
 * the user's explicit failed/unknown allowance permits OTHER preplanned journeys. */
export class IndependentTrialBudget extends EvaluationBudget {
 constructor(private records:any[],private context:()=>any){super(320,30,fallbackPolicy.rates)}
 override admit(inputBytes:number,maximumOutputTokens:number){
  if(this.requests.some(r=>r.status==='pending'))throw new EvaluationAdmissionError('An in-flight request must settle before another dispatch.');
  const unknown=this.requests.filter(r=>r.status==='unknown');
  if(unknown.some(r=>caseKey(this.records.find(record=>record.ordinal===r.ordinal))===caseKey(this.context())))throw new EvaluationAdmissionError('This journey has an unknown result; no retry or dependent turn is admitted.');
  if(this.requests.length>=3&&this.requests.slice(-3).every(r=>r.status==='unknown'))throw new EvaluationAdmissionError('Three independent provider failures: stop for provider recovery.');
  const reservedUsd=((inputBytes+4096)*this.rates.inputUsdPerMillion+maximumOutputTokens*this.rates.outputUsdPerMillion)/1_000_000;
  if(!Number.isSafeInteger(inputBytes)||inputBytes<0||!Number.isSafeInteger(maximumOutputTokens)||maximumOutputTokens<1||this.requests.length>=this.maximumRequests||this.accountedUsd+reservedUsd>this.maximumUsd)throw new EvaluationAdmissionError('Evaluation request budget exhausted; no dispatch.');
  const request={ordinal:this.requests.length+1,status:'pending' as const,reservedUsd,actualUsd:null,model:fallbackPolicy.model,rates:fallbackPolicy.rates};this.requests.push(request);return request;
 }
}
export async function openCampaign(directory:string, frozenFiles:string[], live:boolean) {
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 const lock=path.join(directory,'campaign.lock');
 const handle=await fs.open(lock,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}));
 try {
  const file=path.join(directory,'ledger.json');
  const frozen=Object.fromEntries(await Promise.all(frozenFiles.map(async f=>[f,hash(await fs.readFile(f))])));
  let ledger:any;
  try {ledger=JSON.parse(await fs.readFile(file,'utf8'));assert.deepEqual(ledger.authorization,authorization);for(const [f,digest] of Object.entries(ledger.frozen))assert.equal(hash(await fs.readFile(f)),digest,"Previously frozen input changed");
   ledger.freezeHistory??=[];for(const [f,digest]of Object.entries(frozen)){if(ledger.frozen[f])assert.equal(ledger.frozen[f],digest);else{ledger.frozen[f]=digest;ledger.freezeHistory.push({file:f,sha256:digest,beforeRequest:ledger.admissions.length+1})}}
   assert.equal(ledger.dryRun,!live)}
  catch(error:any){if(error.code!=='ENOENT')throw error;ledger={version:1,authorization,dryRun:!live,frozen,createdAt:new Date().toISOString(),requests:[],admissions:[],trials:[]};}
  let context:any={host:'setup',scenario:'setup',repetition:1,turn:1};
  const budget=new IndependentTrialBudget(ledger.requests,()=>context);
  assert(Array.isArray(ledger.admissions)&&ledger.admissions.length<=320);
  for(const [i,r] of ledger.admissions.entries()){assert.equal(r.ordinal,i+1);assert(['completed','pending','unknown'].includes(r.status));assert(Number.isFinite(r.reservedUsd)&&r.reservedUsd>=0);assert(r.actualUsd===null||(Number.isFinite(r.actualUsd)&&r.actualUsd>=0));budget.requests.push(r)}
  ledger.policyDecisions??=[];if(!ledger.policyDecisions.some((d:any)=>d.id==='independent-reserved-v1'))ledger.policyDecisions.push({id:'independent-reserved-v1',at:new Date().toISOString(),beforeRequest:budget.requests.length+1,authorization:'User approved US$30 / 320 requests including failed/unknown reservations.',effect:'Unknown reservations stay charged and affected journeys cannot retry. Other preplanned journeys may proceed. Three consecutive unknown provider outcomes stop the campaign.'});
  const persist=async()=>{ledger.admissions=budget.requests;ledger.accountedUsd=budget.accountedUsd;ledger.updatedAt=new Date().toISOString();await atomicReport(file,ledger)};
  ledger.modelPolicies??=[];if(!ledger.modelPolicies.some((p:any)=>p.id===fallbackPolicy.id))ledger.modelPolicies.push({...fallbackPolicy,beforeRequest:budget.requests.length+1,reason:'Four long Astra requests lost their connection, and the next long-context admission no longer fit the remaining ceiling. Repository instructions authorize GPT fallback within the existing US$30 / 320 request limit. Future paired results remain a separate model cohort.'});
  await persist();
  const unchanged=async()=>{for(const [f,digest]of Object.entries(ledger.frozen))if(hash(await fs.readFile(f))!==digest)return false;return true};
  let model:any,makeModel:(()=>any)|undefined;
  if(live){
   assert(process.argv.includes('--live'),'Paid qualification requires explicit --live');
   const key=process.env.LLM_API_KEY;assert(key,'The campaign host requires its authorized Kie key');
   const endpoint=assertKieEvaluationEndpoint(authorization.endpoint);
   const transport=new GptResponsesModel({baseUrl:endpoint.replace('/responses',''),model:fallbackPolicy.model,apiKey:key});
   // Scope the network guard to this model, leaving local MCP/browser traffic alone.
   const guarded={identity:transport.identity,requestBytes:transport.requestBytes.bind(transport),complete:async(...args:Parameters<typeof transport.complete>)=>{assertKieEvaluationEndpoint(endpoint);return transport.complete(...args)}};
   makeModel=()=>createCreativeCampaignModel({transport:guarded,budget,requests:ledger.requests,directory,context:()=>context,sourceUnchanged:unchanged,persist,secrets:[key]}).model;model=makeModel();
  }
  return {get model(){return model},budget,ledger,persist,setContext:(value:any)=>{if(caseKey(context)!==caseKey(value)&&makeModel)model=makeModel();context={...value,model:fallbackPolicy.model}},close:async()=>{await persist();await handle.close();await fs.unlink(lock)}};
 }catch(e){await handle.close();await fs.unlink(lock);throw e}
}
