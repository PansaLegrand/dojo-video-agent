import { expect, it } from 'vitest';
import { applyCampaignAmendment, authorization, IndependentTrialBudget } from '../evals/creative-r36/campaign-continuation';
import { workflowAuthorization } from '../evals/workflow-reliability/authorization';

it('amends the total without resetting original authorization, requests, or unknown reservations', () => {
 const admissions = [{ordinal:1,status:'completed' as const,reservedUsd:2,actualUsd:1}, {ordinal:2,status:'unknown' as const,reservedUsd:2,actualUsd:null}];
 const records = [{ordinal:1,host:'local',scenario:'chart',repetition:1}, {ordinal:2,host:'local',scenario:'speech',repetition:1}];
 const ledger:any = {authorization:structuredClone(authorization),admissions,requests:records};
 const before=structuredClone(ledger);
 const ceiling=applyCampaignAmendment(ledger,workflowAuthorization);
 expect(ledger.authorization).toEqual(before.authorization);expect(ledger.admissions).toEqual(before.admissions);expect(ledger.requests).toEqual(before.requests);
 expect(ledger.authorizationAmendments).toEqual([{...workflowAuthorization,beforeRequest:3}]);
 expect(applyCampaignAmendment(ledger,workflowAuthorization)).toEqual(ceiling);expect(ledger.authorizationAmendments).toHaveLength(1);
 expect(()=>applyCampaignAmendment(ledger)).toThrow(/explicit amended/);
 expect(()=>applyCampaignAmendment(ledger,{...workflowAuthorization,maximumUsd:60})).toThrow(/amendment changed/);
 let context=records[1];const budget=new IndependentTrialBudget(records,()=>context,ceiling);budget.requests.push(...admissions);
 expect(budget.accountedUsd).toBe(3);expect(()=>budget.admit(1,1)).toThrow(/unknown result/);
 context={ordinal:3,host:'web',scenario:'chart',repetition:1};expect(budget.admit(1,1).ordinal).toBe(3);
});
it('enforces both amended ceilings and retains the original default for other campaigns', () => {
 const spend=new IndependentTrialBudget([],()=>({}),workflowAuthorization);spend.requests.push({ordinal:1,status:'completed',reservedUsd:50,actualUsd:50});
 expect(()=>spend.admit(100,1)).toThrow(/budget exhausted/);
 const count=new IndependentTrialBudget([],()=>({}),workflowAuthorization);for(let i=1;i<=420;i++)count.requests.push({ordinal:i,status:'completed',reservedUsd:0,actualUsd:0});
 expect(()=>count.admit(1,1)).toThrow(/budget exhausted/);
 const old=new IndependentTrialBudget([],()=>({}));expect(old.maximumUsd).toBe(30);expect(old.maximumRequests).toBe(320);
});
