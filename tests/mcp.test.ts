import {expect,it,vi} from 'vitest';
import {Client} from '@modelcontextprotocol/client';
import {InMemoryTransport} from '@modelcontextprotocol/server';
import {createDojoMcpServer,localMcpOrigin} from '../apps/server/src/mcp';
it('admits only explicit loopback origins and never follows redirects',async()=>{
 for(const url of ['https://remote.invalid','http://127.0.0.1.evil.invalid','http://user:password@localhost:4310','http://localhost:4310/path','http://localhost:4310/?token=hidden'])expect(()=>localMcpOrigin(url)).toThrow();
 expect(localMcpOrigin('http://127.0.0.1:4310')).toBe('http://127.0.0.1:4310');
});
it('negotiates MCP, lists the bounded tool surface and invokes the existing local host endpoint',async()=>{
 const fetcher=vi.fn(async(url:any,options:any)=>{expect(url).toBe('http://127.0.0.1:4310/api/external-agent');expect(options.redirect).toBe('error');expect(options.headers.origin).toBe('http://127.0.0.1:4310');const body=JSON.parse(options.body);return new Response(JSON.stringify({success:true,data:body.tool==='dojo_list_projects'?{projects:[],coverage:'all-local-projects'}:{snapshot:{revision:1},replayed:false}}),{headers:{'content-type':'application/json'}})});
 const server=createDojoMcpServer('http://127.0.0.1:4310',fetcher as typeof fetch),client=new Client({name:'protocol-test',version:'1.0.0'}),[s,c]=InMemoryTransport.createLinkedPair();
 try{await server.connect(s);await client.connect(c);const listed=await client.listTools();expect(listed.tools.map(t=>t.name)).toEqual(expect.arrayContaining(['dojo_inspect_project','dojo_review_edit','dojo_apply_edit','dojo_request_preview','dojo_prepare_blueprint_graphic']));
  const reviewSchema=listed.tools.find(t=>t.name==='dojo_review_edit')!.inputSchema;expect(JSON.stringify(reviewSchema)).toContain('insertGraphic');expect(JSON.stringify(reviewSchema)).toContain('commands');
  const result=await client.callTool({name:'dojo_list_projects',arguments:{}});expect(result.isError).not.toBe(true);expect(JSON.stringify(result)).toContain('all-local-projects');
  const invalid=await client.callTool({name:'dojo_review_edit',arguments:{projectId:'foreign'}});expect(invalid.isError).toBe(true);expect(fetcher).toHaveBeenCalledTimes(1);
 }finally{await client.close();await server.close()}
});

it('serves a real stdio client without non-protocol stdout and forwards only to its configured local editor',async()=>{
 const {createServer}=await import('node:http');const {StdioClientTransport}=await import('@modelcontextprotocol/client/stdio');
 const server=createServer((req,res)=>{expect(req.url).toBe('/api/external-agent');expect(req.method).toBe('POST');res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({success:true,data:{projects:[],coverage:'all-local-projects'}}))});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('Expected port');
 const transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx',process.cwd()+'/apps/server/src/mcp.ts'],cwd:process.cwd(),env:{PATH:process.env.PATH??'',DOJO_MCP_URL:'http://127.0.0.1:'+address.port},stderr:'pipe'});
 const client=new Client({name:'stdio-proof',version:'1.0.0'});
 try{await client.connect(transport);expect((await client.listTools()).tools.some(t=>t.name==='dojo_apply_edit')).toBe(true);expect(JSON.stringify(await client.callTool({name:'dojo_list_projects',arguments:{}}))).toContain('all-local-projects');}
 finally{await client.close();await transport.close();await new Promise<void>(resolve=>server.close(()=>resolve()))}
});

it('advertises and enforces the real nested export and bounded preview contracts',async()=>{
 const bodies:any[]=[],fetcher=vi.fn(async(_url:any,options:any)=>{bodies.push(JSON.parse(options.body));return new Response(JSON.stringify({success:true,data:{accepted:true}}),{headers:{'content-type':'application/json'}})}),server=createDojoMcpServer('http://127.0.0.1:4310',fetcher as typeof fetch),client=new Client({name:'output-contract-proof',version:'1.0.0'}),[s,c]=InMemoryTransport.createLinkedPair();
 const ids={projectId:'a3321510-8c49-4a82-999c-d2cbdd4a2384',reviewId:'c9d7d389-574f-4e42-bdad-74caf9603c33'};
 try{await server.connect(s);await client.connect(c);
  expect((await client.callTool({name:'dojo_request_export',arguments:{...ids,args:{container:'mp4',resolution:'source',destination:'download'}}})).isError).toBe(true);
  for(const args of [{frames:[0,1,2,3,4]},{frames:[0],intervalFrames:[0,30],tileCount:4},{frames:[0],candidateRef:{}}])expect((await client.callTool({name:'dojo_request_preview',arguments:{...ids,args}})).isError).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
  const args={destination:'download',output:{container:'mp4',resolution:'source'}};expect((await client.callTool({name:'dojo_request_export',arguments:{...ids,args}})).isError).not.toBe(true);expect(bodies[0].input.args).toEqual(args);
  expect((await client.callTool({name:'dojo_request_preview',arguments:{...ids,args:{intervalFrames:[0,60],tileCount:16,analysis:{}}}})).isError).not.toBe(true);
 }finally{await client.close();await server.close()}
});

it('preserves native field diagnostics instead of dumping unrelated command-union branches',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path'),{ProjectStore}=await import('../apps/server/src/store'),{AgentService}=await import('../apps/server/src/agent-service'),{LocalBrowserRequests}=await import('../apps/server/src/local-browser-requests'),{ExternalAgentService}=await import('../apps/server/src/external-agent');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dojo-mcp-native-error-')),store=new ProjectStore(dir);await store.init();const project=await store.create(),model={identity:'no-provider',complete:async():Promise<never>=>{throw Error('No model call expected')}},host=new ExternalAgentService(store,new AgentService(store,model,[]),new LocalBrowserRequests(store));
 const fetcher=async(_url:any,options:any)=>{const body=JSON.parse(options.body),value=await host.call(body.tool,body.input,new AbortController().signal);return new Response(JSON.stringify({success:true,data:value}),{headers:{'content-type':'application/json'}})};
 const server=createDojoMcpServer('http://127.0.0.1:4310',fetcher as typeof fetch),client=new Client({name:'native-diagnostics',version:'1.0.0'}),[s,c]=InMemoryTransport.createLinkedPair();
 try{await server.connect(s);await client.connect(c);const result=await client.callTool({name:'dojo_review_edit',arguments:{projectId:project.id,expectedRevision:0,documentHash:project.documentHash,operationId:'bad-command',instruction:'Resize the canvas',edit:{outcome:'proposal',summary:'Resize',commands:[{op:'set',target:{kind:'format'},path:['width'],value:540}]},requirements:[{id:'width',kind:'property',target:{kind:'format'},path:['width'],equals:540}]}});expect(result.isError,JSON.stringify(result)).not.toBe(true);const value=JSON.parse((result.content![0] as {text:string}).text);expect(value.status).toBe('failed');expect(value.saved).toBe(false);expect(value.diagnostic.issues.length).toBeGreaterThan(0);expect(JSON.stringify(result).length).toBeLessThan(6000);expect(JSON.stringify(value.diagnostic)).toContain('type');const after=await store.read(project.id);expect(after.documentHash).toBe(project.documentHash);expect(after.runs).toHaveLength(0);
  const missingSummary=await client.callTool({name:'dojo_review_edit',arguments:{projectId:project.id,expectedRevision:0,documentHash:project.documentHash,operationId:'missing-summary',instruction:'Resize',edit:{outcome:'proposal',commands:[{type:'set',target:{kind:'format'},path:['width'],value:540}]},requirements:[{id:'width',kind:'property',target:{kind:'format'},path:['width'],equals:540}]}});expect(missingSummary.isError).toBe(true);expect((await store.read(project.id)).runs).toHaveLength(0);
 }finally{await client.close();await server.close();await fs.rm(dir,{recursive:true,force:true})}
});
