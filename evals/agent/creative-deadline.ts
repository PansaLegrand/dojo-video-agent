/** An evaluation wait must outlive the selected runtime's own active deadline.
 * Legacy campaigns retain 210s. Reliability trials explicitly allow 900s plus
 * 15s for the host to persist terminal state; this grants no retries or calls. */
export async function waitForCreativeRun<T extends {status:string}>(readRun:()=>Promise<T|undefined>,signal:AbortSignal,timeoutMs=210_000):Promise<T>{
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>915_000)throw Error('Invalid bounded creative-session wait.');
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){signal.throwIfAborted();const run=await readRun();if(!run)throw Error('Creative run disappeared.');if(!['queued','running'].includes(run.status))return run;await new Promise(resolve=>setTimeout(resolve,100))}
 throw Error('Creative agent turn exceeded its bounded deadline.');
}
