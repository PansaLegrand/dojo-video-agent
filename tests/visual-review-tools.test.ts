import { expect, it } from 'vitest';
import { createEditorHostTools, parseEditorHostToolInput } from '../packages/agent-kit/src/host-tools';
import { selectAgentKit } from '../packages/agent/src/runtime-build';

it('keeps saved host contracts exact while admitting bounded intervals only for the candidate', () => {
  const signal = new AbortController().signal;
  const ports = { sample_video_frames: async (value: unknown) => ({kind:'observation' as const,value}), compare_preview_frames: async (value: unknown) => ({kind:'observation' as const,value}) };
  const legacy=createEditorHostTools({profile:'local-editor-v14',ports});
  const retained=selectAgentKit('local-editor-v14','0.2.10').createEditorHostTools({profile:'local-editor-v14',ports});
  expect(legacy.map(({execute,...tool})=>tool)).toEqual(retained.map(({execute,...tool})=>tool));
  expect(legacy.map(t=>t.name)).not.toContain('compare_preview_frames');
  expect(()=>parseEditorHostToolInput('sample_video_frames',{sourceId:'v',intervalMs:[0,500],tileCount:16})).toThrow();
  const candidate=createEditorHostTools({profile:'local-editor-v14',ports,visualReview:true});
  expect(candidate.map(t=>t.name)).toContain('compare_preview_frames');
  return expect(candidate[0]!.execute({sourceId:'v',intervalMs:[0,500],tileCount:16,analysis:{background:[0,0,0]}},signal)).resolves.toMatchObject({kind:'observation',value:{contactSheet:true,momentsMs:Array.from({length:16},(_,i)=>500*i/15)}});
});
it('rejects ambiguous, unordered and excessive sampling before any host work',()=>{
  for (const value of [
    {sourceId:'v',intervalMs:[500,0],tileCount:8},
    {sourceId:'v',intervalMs:[0,500],tileCount:17},
    {sourceId:'v',intervalMs:[0,500]},
    {sourceId:'v',intervalMs:[0,500],tileCount:4,momentsMs:[0]},
    {sourceId:'v',momentsMs:[0],tileCount:4},
    {sourceId:'v',momentsMs:[0],analysis:{region:{x:.9,y:0,width:.2,height:1}}},
  ]) expect(()=>parseEditorHostToolInput('sample_video_frames',value,true)).toThrow();
  expect(()=>parseEditorHostToolInput('request_project_preview',{intervalFrames:[0,2],tileCount:4},true)).toThrow(/longer/);
  expect(parseEditorHostToolInput('request_project_preview',{intervalFrames:[0,15],tileCount:16},true)).toEqual({frames:Array.from({length:16},(_,i)=>i),contactSheet:true});
});
it('comparison is read-only, bounded and requires owned receipt selectors',()=>{
  const valid={reference:{kind:'source-inspection',requestId:'reference',tileIndex:3},candidate:{kind:'project-preview',requestId:'preview',frameIndex:0}};
  expect(parseEditorHostToolInput('compare_preview_frames',valid,true)).toEqual(valid);
  expect(()=>parseEditorHostToolInput('compare_preview_frames',valid)).toThrow(/unavailable/);
  expect(()=>parseEditorHostToolInput('compare_preview_frames',{...valid,candidate:{...valid.candidate,tileIndex:16}},true)).toThrow();
});
