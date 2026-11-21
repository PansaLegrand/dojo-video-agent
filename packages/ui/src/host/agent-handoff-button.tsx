"use client";
import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import type { VideoWorkspaceController } from "../../../core/src/lib/video-project/client-controller";
import { buildAgentHandoff } from "./agent-handoff";
export function AgentHandoffButton({projectId,controller}:{projectId:string;controller:VideoWorkspaceController}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[fallback,setFallback]=useState('');
 useEffect(()=>{let stopped=false,timer:ReturnType<typeof setInterval>|undefined,busy=false,last:string|undefined;
  const poll=async()=>{if(stopped||document.visibilityState!=='visible'||busy)return;busy=true;try{const response=await fetch('/api/external-agent?projectId='+encodeURIComponent(projectId));const value=response.ok?(await response.json()).data:null;if(stopped||!value?.enabled)return;if(value.stateKey!==last){last=value.stateKey;await controller.refresh();if(!stopped)window.dispatchEvent(new Event('focus'));}}catch{}finally{busy=false}};
  void fetch('/api/external-agent').then(r=>r.ok?r.json():null).then(value=>{if(stopped||!value?.data?.enabled)return;void poll();timer=setInterval(()=>void poll(),2500)}).catch(()=>{});
  return()=>{stopped=true;if(timer)clearInterval(timer)};
 },[controller,projectId]);
 const copy=async()=>{if(busy)return;setBusy(true);setMessage('Saving your current edit…');setFallback('');try{
  const snapshot=await controller.flush(),state=controller.getState();
  const text=buildAgentHandoff({projectId,snapshot,selectedItemIds:state.selectedItemIds,selectedNodeId:state.selectedNodeId,url:window.location.href});
  try{await navigator.clipboard.writeText(text);setMessage('Project context copied. Paste it into your agent.')}catch{setFallback(text);setMessage('Select and copy the handoff below.')}
 }catch(error){setMessage(error instanceof Error?error.message:'Save the project before copying its context.')}finally{setBusy(false)}};
 return <div className="relative"><button type="button" className="inline-flex items-center gap-1.5 rounded border border-[var(--editor-border)] px-2.5 py-2 text-xs" aria-label="Copy for Agent" disabled={busy} onClick={()=>void copy()}><Copy size={15}/><span className="hidden sm:inline">Copy for Agent</span></button>
 {!!message&&<div role="status" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-[var(--editor-border)] bg-[var(--editor-panel)] p-3 text-xs shadow-lg"><p>{message}</p>{fallback&&<textarea aria-label="Agent handoff" readOnly value={fallback} onFocus={e=>e.currentTarget.select()} rows={7} className="mt-2 w-full bg-[var(--editor-surface)] p-2"/>}<button className="mt-2 underline" onClick={()=>{setMessage('');setFallback('')}}>Close</button></div>}</div>;
}
