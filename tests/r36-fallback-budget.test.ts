import {it,expect} from 'vitest';import {IndependentTrialBudget,fallbackPolicy} from '../evals/creative-r36/campaign-luna';
it('keeps old rates and unknown reservations intact while charging new fallback requests at their explicit policy',()=>{
 const records=[{ordinal:1,host:'dojo',scenario:'J1',repetition:1}],budget=new IndependentTrialBudget(records,()=>({host:'dojo',scenario:'portrait',repetition:1}));
 const original={ordinal:1,status:'unknown' as const,reservedUsd:1.2,actualUsd:null};budget.requests.push(original);const next=budget.admit(100000,1000);expect(next.model).toBe('gpt-6-luna');expect(next.rates).toEqual(fallbackPolicy.rates);expect(budget.accountedUsd).toBeGreaterThan(1.2);budget.settle(next,{inputTokens:10000,outputTokens:1000});expect(budget.accountedUsd).toBeCloseTo(1.2007);expect(original).toEqual({ordinal:1,status:'unknown',reservedUsd:1.2,actualUsd:null});
 original.reservedUsd=29.9999;expect(()=>budget.admit(100000,8192)).toThrow(/budget exhausted/);
});
it('counts free provider discovery calls against the same total request ceiling',()=>{const b=new IndependentTrialBudget([],()=>({host:'dojo',scenario:'x',repetition:1}));for(let i=1;i<=320;i++)b.requests.push({ordinal:i,status:'completed',reservedUsd:0,actualUsd:0});expect(()=>b.admit(1,1)).toThrow(/budget exhausted/);expect(b.maximumUsd).toBe(30)});
