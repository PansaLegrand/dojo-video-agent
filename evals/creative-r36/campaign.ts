import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {GptResponsesModel} from '../../packages/adapters/src/gpt-responses';
import {EvaluationBudget} from '../agent/request-budget';
import {createCreativeCampaignModel, atomicReport} from '../agent/creative-runner';
import {assertKieEvaluationEndpoint} from '../agent/reliability';

export const authorization = {maximumUsd:30,maximumRequests:320,rates:{inputUsdPerMillion:3.5,outputUsdPerMillion:14},model:'gpt-6-astra',endpoint:'https://api.kie.ai/codex/v1/responses'} as const;
export const hash = (bytes: string|Buffer) => createHash('sha256').update(bytes).digest('hex');
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
  const budget=new EvaluationBudget(320,30,authorization.rates);
  assert(Array.isArray(ledger.admissions)&&ledger.admissions.length<=320);
  for(const [i,r] of ledger.admissions.entries()){assert.equal(r.ordinal,i+1);assert(['completed','pending','unknown'].includes(r.status));assert(Number.isFinite(r.reservedUsd)&&r.reservedUsd>=0);assert(r.actualUsd===null||(Number.isFinite(r.actualUsd)&&r.actualUsd>=0));budget.requests.push(r)}
  let context:any={host:'setup',scenario:'setup',repetition:1,turn:1};
  const persist=async()=>{ledger.admissions=budget.requests;ledger.accountedUsd=budget.accountedUsd;ledger.updatedAt=new Date().toISOString();await atomicReport(file,ledger)};
  await persist();
  const unchanged=async()=>{for(const [f,digest]of Object.entries(ledger.frozen))if(hash(await fs.readFile(f))!==digest)return false;return true};
  let model:any;
  if(live){
   assert(process.argv.includes('--live'),'Paid qualification requires explicit --live');
   const key=process.env.LLM_API_KEY;assert(key,'The campaign host requires its authorized Kie key');
   const endpoint=assertKieEvaluationEndpoint(authorization.endpoint);
   const transport=new GptResponsesModel({baseUrl:endpoint.replace('/responses',''),model:authorization.model,apiKey:key});
   // Scope the network guard to this model, leaving local MCP/browser traffic alone.
   const guarded={identity:transport.identity,requestBytes:transport.requestBytes.bind(transport),complete:async(...args:Parameters<typeof transport.complete>)=>{assertKieEvaluationEndpoint(endpoint);return transport.complete(...args)}};
   model=createCreativeCampaignModel({transport:guarded,budget,requests:ledger.requests,directory,context:()=>context,sourceUnchanged:unchanged,persist,secrets:[key]}).model;
  }
  return {model,budget,ledger,persist,setContext:(value:any)=>{context=value},close:async()=>{await persist();await handle.close();await fs.unlink(lock)}};
 }catch(e){await handle.close();await fs.unlink(lock);throw e}
}
