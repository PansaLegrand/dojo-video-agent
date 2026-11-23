/** New host runs get an inactivity window plus a fixed active-work ceiling.
 * This changes no model/tool/token allowance and never retries a provider call. */
export function createAgentDeadline(controller:AbortController,policy?:"progress-v1") {
 const started=Date.now();let timer:ReturnType<typeof setTimeout>|undefined;
 const dispose=()=>{if(timer)clearTimeout(timer);timer=undefined};
 const progress=()=>{if(controller.signal.aborted)return;dispose();const remaining=policy==="progress-v1"?15*60_000-(Date.now()-started):180_000;const delay=Math.max(0,Math.min(180_000,remaining));timer=setTimeout(()=>controller.abort(new Error(policy!=="progress-v1"?"Agent deadline reached.":remaining<=180_000?"Agent active-work limit reached (15 minutes).":"Agent made no progress for three minutes.")),delay)};
 progress();return{progress,dispose,policy};
}
