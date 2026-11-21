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
