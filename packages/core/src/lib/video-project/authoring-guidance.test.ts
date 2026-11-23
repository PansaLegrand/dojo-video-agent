import {describe,expect,it} from "vitest";
import Ajv from "ajv";
import {nativeAgentResponseSchema} from "./agent-schema";
import {compactAuthoringFeedback} from "./authoring-feedback";

describe("complete authoring guide",()=>{
 it("advertises exact targets and capability-specific parameter schemas without changing the saved default",()=>{
  const old=JSON.stringify(nativeAgentResponseSchema({clarification:true,composition:true,anchorHold:true}));
  const schema=nativeAgentResponseSchema({clarification:true,composition:true,anchorHold:true,completeCapabilities:true});
  const validate=new Ajv({strict:false,validateFormats:false}).compile(schema);
  const make=(action:unknown)=>({outcome:"proposal",summary:"Change title color",commands:[{type:"applyCapability",action}]});
  const valid={version:1,capability:"text.color",target:{itemId:"title",nodeId:"title"},parameters:{color:"#ff0000"}};
  expect(validate(make(valid)),JSON.stringify(validate.errors)).toBe(true);
  for(const action of [{...valid,target:{id:"title"}},{...valid,parameters:{percent:50}},{...valid,capability:"audio.volume",parameters:{percent:101}}])expect(validate(make(action))).toBe(false);
  expect(JSON.stringify(nativeAgentResponseSchema({clarification:true,composition:true,anchorHold:true}))).toBe(old);
  expect(JSON.stringify(schema).length).toBeLessThanOrEqual(24000);
 });
 it("bounds model-facing failure feedback while retaining full stored evidence and success payloads",()=>{
  const checks=Array.from({length:12},(_,i)=>({id:`check-${i}`,passed:i===0,message:"Failure ".repeat(500)}));
  const original=structuredClone(checks),value={checks,receipt:undefined,nextAction:"verbose"};
  const compact=compactAuthoringFeedback(value) as Record<string,unknown>;
  expect(compact).toMatchObject({checkCoverage:"failed-checks-only",omittedFailures:8,omittedPassingChecks:1});
  expect(JSON.stringify(compact).length).toBeLessThan(2600);expect(checks).toEqual(original);
  const success={checks:[{id:"ok",passed:true,message:"Passed"}],receipt:{hash:"same"}};expect(compactAuthoringFeedback(success)).toBe(success);
 });
});

it("compacts the real nested preflight envelope without changing frozen requirements or repair claims",()=>{
 const requirements=[{id:"title",kind:"item_present",itemId:"title"}],checks=[{id:"title",passed:true,message:"Present"},{id:"layout",passed:false,message:"Bad fit"}];
 const original={nextAction:"old",completionPreflight:{status:"failed",requirements,checks,snapshotHash:"same"}};
 const result=compactAuthoringFeedback(original)as any;expect(result.completionPreflight.checks).toEqual([checks[1]]);expect(result.completionPreflight.omittedPassingChecks).toBe(1);expect(result.completionPreflight.requirements).toBe(requirements);expect(original.completionPreflight.checks).toHaveLength(2);
 const claimed={...original,nextAction:"The single repair is consumed",completionPreflight:{...original.completionPreflight,previewRepair:{id:"claim"}}};expect((compactAuthoringFeedback(claimed)as any).nextAction).toBe(claimed.nextAction);
});
