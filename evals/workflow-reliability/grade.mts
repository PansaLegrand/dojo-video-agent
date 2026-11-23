import {compileDisplayList,evaluateScene,layoutScene,transformLayoutRect,parseColor} from '@dojo-video-engine/core';
import {compileVideoProjectDocument} from '../../packages/core/src/lib/video-project/compilation';
import {canonicalSerialize} from '../../packages/core/src/lib/video-project/document';
import {rubric,technicalChecks} from '../creative-r36/grade.mjs';
export {rubric,technicalChecks};
export const allNodes=(document:any)=>{const rows:any[]=[];const visit=(node:any,item:any)=>{rows.push({node,item});for(const child of node.children??[])visit(child,item)};for(const item of document.items)visit(item.node,item);return rows};
const copy=(node:any)=>node.text??node.runs?.map((run:any)=>run.text).join('')??'';
const same=(a:any,b:any)=>canonicalSerialize(a)===canonicalSerialize(b);
const intersection=(a:any,b:any)=>{const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);return{x,y,width:Math.max(0,Math.min(a.x+a.width,b.x+b.width)-x),height:Math.max(0,Math.min(a.y+a.height,b.y+b.height)-y)}};
const rectArea=(r:any)=>Math.max(0,r.width)*Math.max(0,r.height);
function display(scene:any,frame:number){const rows:any[]=[];const visit=(g:any,opacity=1,clip={x:0,y:0,width:scene.width,height:scene.height})=>{const effectiveOpacity=opacity*g.composite.opacity;let effectiveClip=clip;for(const c of[g.clip,g.overflowClip])if(c?.rect)effectiveClip=intersection(effectiveClip,transformLayoutRect(g.worldTransform,c.rect));rows.push({...g,effectiveOpacity,effectiveClip});g.children.forEach((child:any)=>visit(child,effectiveOpacity,effectiveClip))};compileDisplayList(layoutScene(evaluateScene(scene,frame))).groups.forEach(g=>visit(g));return rows}
const world=(m:any,p:any)=>({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f});
/** Frozen independent geometry oracle: observed bar heights/line vertices,
 * never macro parameter strings or a model's claim of correct numbers. */
export function chartGeometry(document:any,labels:string[]){
 const scene=compileVideoProjectDocument(document,Object.fromEntries(Object.values(document.assets).filter((asset:any)=>asset.source!=="static").map((asset:any)=>[asset.id,`asset:${asset.id}`]))).scene,groups=display(scene,document.format.durationInFrames-1).filter(g=>g.effectiveOpacity>.15),data=[12,18,31,24];
 const labelRows=labels.map(text=>groups.filter(g=>g.content?.kind==='text'&&g.content.value.trim()===text));
 if(labelRows.some(rows=>rows.length!==1))return{passed:false,reason:'Category labels not uniquely measurable'};
 const xs=labelRows.map(rows=>rows[0].transformedBounds.x+rows[0].transformedBounds.width/2),spacing=Math.min(...xs.slice(1).map((x,i)=>x-xs[i]));
 const bars=xs.map((x,i)=>groups.filter(g=>g.worldTransform.b===0&&g.worldTransform.c===0&&(g.background?.paint?.kind==='color'||g.content?.kind==='shape')&&g.transformedBounds.width>5&&g.transformedBounds.width<spacing*.85&&g.transformedBounds.height>10&&Math.abs(g.transformedBounds.x+g.transformedBounds.width/2-x)<spacing*.12&&g.transformedBounds.y+g.transformedBounds.height<=labelRows[i][0].transformedBounds.y+5).sort((a,b)=>b.transformedBounds.height-a.transformedBounds.height)[0]);
 if(bars.some(b=>!b))return{passed:false,reason:'Four bars not measurable'};
 const heights=bars.map(g=>g.transformedBounds.height),baseline=bars.map(g=>g.transformedBounds.y+g.transformedBounds.height),scale=heights[2]/31;
 const correctBars=Math.max(...baseline)-Math.min(...baseline)<2&&heights.every((height,i)=>Math.abs(height-data[i]*scale)<=Math.max(2,height*.03));
 const lineGroups=groups.filter(g=>g.content?.kind==='shape'&&g.content.geometry?.kind==='polyline'&&g.content.geometry.points.length===4);const lines=lineGroups.map(g=>g.content.geometry.points.map((p:any)=>world(g.worldTransform,p)));
 const line=lines.find(points=>points.every((p:any,i:number)=>Math.abs(p.x-xs[i])<spacing*.2&&Math.abs(p.y-bars[i].transformedBounds.y)<4));
 const ids=bars.map(g=>g.nodeId);let settle=document.format.durationInFrames;
 for(let frame=0;frame<document.format.durationInFrames;frame++){const at=display(scene,frame);if(ids.every((id,i)=>{const g=at.find(g=>g.nodeId===id);return g&&g.effectiveOpacity>.9&&g.transformedBounds.height>=heights[i]*.9&&Math.abs(g.transformedBounds.y-bars[i].transformedBounds.y)<2&&rectArea(intersection(g.transformedBounds,g.effectiveClip))>=rectArea(g.transformedBounds)*.9})){settle=frame;break}}
 return{passed:correctBars&&!!line,heights,baseline,line:line??null,barIds:ids,settleFrame:settle};
}
export function gradeWorkflow(input:{workflow:string;turn:number;before:any;after:any;initial:any;manual?:any}){
 const {workflow,turn,before,after,initial,manual}=input,checks:any[]=[];const check=(id:string,passed:boolean,detail:unknown)=>checks.push({id,passed,detail});
 const nodes=allNodes(after),text=nodes.map(({node})=>copy(node)).join('\n');
 check('brand-preserved',same(initial.creativeContext.brandKit,after.creativeContext.brandKit),'Saved identity and approved facts stay exact');
 check('owned-originals-preserved',Object.entries(initial.assets).every(([id,a])=>same(a,after.assets[id])),'Original asset metadata retained');
 check('genuine-evidence-preserved',same(initial.evidence,after.evidence),'No transcript evidence rewriting');
 check('fps',after.format.fps===30,after.format.fps);
 if(workflow==='chart'){
  check('format-duration',after.format.width===960&&after.format.height===540&&after.format.durationInFrames===240,after.format);
  const geometry=chartGeometry(after,[turn===1?'W1':'Week one','W2','W3','W4']);check('bar-line-geometry',geometry.passed,geometry);
  check('units',/thousand|\(k\)|\b000s\b|\b(?:signups|users)\s*[/·–-]\s*k\b/i.test(text)||[12,18,31,24].every(v=>new RegExp(`\\b${v}\\s*[kK]\\b`).test(text)),text);
  if(turn>1){const found=nodes.find(({node,item})=>node.id===manual.nodeId&&item.id===manual.itemId);check('manual-label',!!found&&copy(found.node)==='Week one'&&same(parseColor(found.node.style?.color??''),parseColor('#86DAD6')),found?.node);const previous=chartGeometry(before,['Week one','W2','W3','W4']);check('slower-reveal',geometry.passed&&previous.passed&&geometry.settleFrame>previous.settleFrame+2,{before:previous.settleFrame,after:geometry.settleFrame});}
 }else if(workflow==='walkthrough'){
  check('format-duration',after.format.width===(turn===3?540:960)&&after.format.height===(turn===3?960:540)&&after.format.durationInFrames===360,after.format);
  const wanted=['Capture the spark',turn===1?'Organize your next move':'Bring the right ideas together','Share a clear direction','Concept demo'];for(const value of wanted)check('copy:'+value,text.toLowerCase().includes(value.toLowerCase()),value);
  const three=nodes.filter(({node})=>node.extension?.name==='dojo.three-scene');
  const screenIds=Object.entries(initial.assets).filter(([,asset]:any)=>['capture.png','organize.png','share.png'].includes(asset.name)).map(([id])=>id);
  const planeScreens=three.flatMap(({node})=>{const p=node.extension.params;if(p.camera?.kind!=='perspective')return[];return Object.values(p.objects??{}).filter((o:any)=>o.geometry?.kind==='plane').map((o:any)=>p.materials?.[o.materialId]?.mapAssetId).filter(Boolean)});
  check('true-perspective',screenIds.some(id=>planeScreens.includes(id)),{nodes:three.map(({node})=>node.id),planeScreens});
  for(const [id,asset]of Object.entries(initial.assets)as any[])if(['capture.png','organize.png','share.png'].includes(asset.name)){
   const referenced=nodes.some(({node})=>node.type==='img'&&node.assetId===id)||three.some(({node})=>Object.values(node.extension.params.objects??{}).some((object:any)=>object.kind==='mesh'&&object.geometry?.kind==='plane'&&node.extension.params.materials?.[object.materialId]?.mapAssetId===id));
   check('screen:'+asset.name,referenced,'Referenced by an actual image node or textured plane, not an unused material string');
  }
  if(turn===2){const normalized=structuredClone(after);for(const {node}of allNodes(normalized))if(copy(node)==='Bring the right ideas together')node.text='Organize your next move';check('copy-only-followup',same(before,normalized),'Only second-stage text changes');}
  if(turn===3){const prior=allNodes(before).filter(({node})=>copy(node).trim());check('portrait-preserves-text-identity',prior.every(({node,item})=>nodes.some(row=>row.item.id===item.id&&row.node.id===node.id&&copy(row.node)===copy(node))),prior.map(({node})=>node.id));}
 }else{
  const videos=after.items.filter((i:any)=>i.node.type==='video').sort((a:any,b:any)=>a.node.from-b.node.from);const windows=videos.map((i:any)=>({id:i.node.assetId,from:i.node.from,duration:i.node.duration,start:(i.node.videoStartTime??0)*1000,end:((i.node.videoStartTime??0)+i.node.duration/after.format.fps*(i.node.playbackRate??1))*1000,rate:i.node.playbackRate??1,volume:i.node.volume??1}));
  check('source-picture-audio',windows.length>0&&windows.every((w:any)=>w.rate===1&&w.volume===1&&initial.assets[w.id]?.type==='video'),windows);
  const sourceOrder=windows.map((w:any)=>w.id).filter((id:string,i:number,all:string[])=>i===0||id!==all[i-1]);
  check('source-order',same(sourceOrder,initial.items.filter((i:any)=>i.node.type==='video').map((i:any)=>i.node.assetId)),sourceOrder);
  check('source-appearance-and-audio-preserved',videos.every((item:any)=>{const old=initial.items.find((i:any)=>i.node.assetId===item.node.assetId);if(!old)return false;const clean=(n:any)=>Object.fromEntries(Object.entries(n).filter(([key])=>!['id','from','duration','videoStartTime'].includes(key)));return same(clean(old.node),clean(item.node))}),'Only source windows and timeline positions may change');
  check('closed-timeline',windows[0]?.from===0&&windows.every((w:any,i:number)=>i===0||w.from===windows[i-1].from+windows[i-1].duration)&&after.format.durationInFrames===windows.at(-1)?.from+windows.at(-1)?.duration,windows);
  check('speech-duration',after.format.durationInFrames>450&&after.format.durationInFrames<initial.format.durationInFrames,after.format.durationInFrames);
  const tolerance=1000/30+1;
  for(const evidence of Object.values(initial.evidence)as any[]){const initialItem=initial.items.find((i:any)=>i.node.assetId===evidence.sourceAssetId);const start=(initialItem.node.videoStartTime??0)*1000,end=start+initialItem.node.duration/30*1000;
   const sourceWindows=windows.filter((w:any)=>w.id===evidence.sourceAssetId),words=evidence.words.filter((w:any)=>w.startMs>=start&&w.endMs<=end);
   check('source-range:'+evidence.id,sourceWindows.every((w:any,i:number)=>w.start>=start-tolerance&&w.end<=end+tolerance&&(i===0||w.start>=sourceWindows[i-1].end-tolerance)),sourceWindows);
   const fillers=words.filter((w:any)=>/^uh[,\.]?$/i.test(w.text));check('remove-fillers:'+evidence.id,fillers.every((w:any)=>sourceWindows.every((s:any)=>Math.min(s.end,w.endMs)-Math.max(s.start,w.startMs)<=tolerance)),fillers);
   check('retain-spoken-words:'+evidence.id,words.filter((w:any)=>!fillers.includes(w)).every((w:any)=>sourceWindows.some((s:any)=>s.start<=w.startMs+tolerance&&s.end>=w.endMs-tolerance)),words.length);
  }
  const captions=after.items.filter((i:any)=>i.caption);check('caption-languages',captions.some((i:any)=>/^en(?:-|$)/i.test(i.caption.language??''))&&captions.some((i:any)=>/^es(?:-|$)/i.test(i.caption.language??''))&&captions.every((i:any)=>i.caption.role==='original'?/^en(?:-|$)/i.test(i.caption.language??''):/^es(?:-|$)/i.test(i.caption.language??'')),captions.map((i:any)=>({language:i.caption.language,role:i.caption.role})));check('bilingual-pairs',captions.length>=4&&captions.every((i:any)=>i.caption.pairedItemId&&captions.some((p:any)=>p.id===i.caption.pairedItemId&&p.caption.pairedItemId===i.id)),captions.map((i:any)=>({id:i.id,language:i.caption.language,pair:i.caption.pairedItemId})));
  const callouts=nodes.filter(({node})=>copy(node).trim()==='Andrew Ng');check('phrase-callout',callouts.length>0&&Object.values(after.bindings).some((b:any)=>callouts.some(({item})=>item.id===b.itemId&&item.node.duration>=27)&&b.wordIds?.length>=2&&Object.values(initial.evidence).some((e:any)=>e.words.filter((w:any)=>b.wordIds.includes(w.id)).map((w:any)=>w.text).join(' ').toLowerCase()==='andrew ng')),callouts.map(({node})=>node.id));
 }
 return{version:'workflow-v2',passed:checks.every(c=>c.passed),checks,visualReviewRequired:true,semanticTranslationReviewRequired:workflow==='speech',rubric};
}
