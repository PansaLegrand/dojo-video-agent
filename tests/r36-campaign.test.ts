import {it,expect} from 'vitest';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {openCampaign} from '../evals/creative-r36/campaign';
it('retains admissions across restarts, blocks concurrent owners and refuses altered fixtures',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dojo-r36-ledger-')),fixture=path.join(root,'fixture');await fs.writeFile(fixture,'frozen');
 try{const a=await openCampaign(path.join(root,'run'),[fixture],false);const r=a.budget.admit(100,50);a.budget.settle(r,{inputTokens:100,outputTokens:30});await a.persist();await expect(openCampaign(path.join(root,'run'),[fixture],false)).rejects.toThrow();await a.close();
 const b=await openCampaign(path.join(root,'run'),[fixture],false);expect(b.budget.requests).toHaveLength(1);b.budget.admit(100,50);await b.close();
 const c=await openCampaign(path.join(root,'run'),[fixture],false);expect(()=>c.budget.admit(1,1)).toThrow(/Uncertain/);await c.close();
 await fs.writeFile(fixture,'changed');await expect(openCampaign(path.join(root,'run'),[fixture],false)).rejects.toThrow();
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
