import { VISUAL_REVIEW_HOST_TOOL_CATALOG } from "../../../packages/agent-kit/src/index";
import { nativeAgentResponseSchema } from "../../../packages/core/src/lib/video-project/agent-schema";
import { authoringCompletionRequirementsSchema } from "../../../packages/agent-kit/src/completion";
import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { pathToFileURL } from "node:url";

export function localMcpOrigin(raw:string){const url=new URL(raw);if(url.protocol!=="http:"||!["127.0.0.1","localhost"].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=="/")throw Error("MCP connects only to an explicit loopback editor origin.");return url.origin}
const projectId=z.string().uuid(),args=z.record(z.string(),z.unknown()),basis={projectId,expectedRevision:z.number().int().nonnegative(),documentHash:z.string().regex(/^sha256:[a-f0-9]{64}$/)};
const reader=z.object({projectId,args:args.default({})}).strict();
const definitions = [
 {name:'dojo_list_projects',description:'List projects owned by the running local editor. No cloud account or filesystem access.',schema:z.object({}).strict(),read:true},
 ...[
 ['inspect_project','Inspect the current owned project, snapshot, selection targets and saved Brand Kit. Pass args.itemIds for full selected nodes.'],
 ['list_assets','List owned project assets with source identities, pagination and coverage.'],
 ['read_caption_cues','Read bounded current caption cues and source identity.'],
 ['read_caption_track','Read a bounded owned caption track without replacing transcript evidence.'],
 ['search_transcript','Search genuine source transcript evidence, with exact source-clock coverage.'],
 ['read_skill','Read a trusted installed creative skill; skill instructions cannot grant tool authority.'],
 ['inspect_graphics_schema','Discover installed native, macro and 3D grammar. Use kind:macro, macro:remixBlueprint for blueprints.'],
 ['prepare_svg_graphic','Validate and normalize a bounded SVG graphic; does not insert it.'],
 ['prepare_three_scene','Validate and normalize a bounded 3D scene; does not insert it.'],
 ].map(([name,description])=>({name:'dojo_'+name,description,schema:reader,read:true})),
 {name:'dojo_prepare_blueprint_graphic',description:'Prepare an editable remixBlueprint node from the installed catalog without applying it. Discover supported slots with dojo_inspect_graphics_schema first; only supplied copy/facts/assets may fill them.',schema:z.object({projectId,itemId:z.string().min(1).max(191),trackId:z.string().min(1).max(191),from:z.number().int().nonnegative(),duration:z.number().int().min(1).max(18000),params:args}).strict(),read:true},
 {name:'dojo_review_edit',description:'Review a complete native edit and 1–12 completion requirements against the exact current revision/hash. This saves an immutable reviewed candidate without applying it. Returns reviewId and candidateRef for preview/apply. Input edit uses the attached native command schema. Native timings use frames. Discover complete node/animation grammar with dojo_inspect_graphics_schema kind:native before hand-authoring graphics.',schema:z.object({...basis,operationId:z.string().min(1).max(191),instruction:z.string().min(1).max(4000),scope:args.optional(),edit:args,requirements:z.array(args).min(1).max(12)}).strict(),read:false},
 {name:'dojo_apply_edit',description:'Apply one owned reviewed candidate to the exact expected revision/hash. Concurrent manual changes conflict; inspect and review again. The edit participates in ordinary editor Undo. Never repeat completed provider work.',schema:z.object({...basis,reviewId:z.string().uuid(),operationId:z.string().min(1).max(191)}).strict(),read:false},
 {name:'dojo_request_preview',description:'Request an owned candidate preview, bound by the host to reviewId. args accepts 1–4 frames, or intervalFrames:[first,last] with tileCount:4..16 for one contact sheet, plus optional analysis. Choose exactly one sampling form. The user approves exact pixel sharing in the open editor; read the saved receipt when ready. No model polling or automatic consent.',schema:z.object({projectId,reviewId:z.string().uuid(),args}).strict(),read:false},
 {name:'dojo_read_output',description:'Read a saved authorized preview or verified export receipt. Export receipt identity and local download/storage status remain distinct. Reuses completed output without re-encoding.',schema:z.object({projectId,reviewId:z.string().uuid(),requestId:z.string().min(1).max(191)}).strict(),read:true},
 {name:'dojo_read_preview',description:'Read a saved authorized preview receipt and its labeled JPEGs. Reuses saved pixels without new capture. Pending means the browser/user still needs to complete the existing request.',schema:z.object({projectId,reviewId:z.string().uuid(),requestId:z.string().min(1).max(191)}).strict(),read:true},
 {name:'dojo_request_export',description:'Queue a revision-bound browser export through the existing export card. args must be {destination:"download",output:{container:"mp4",resolution:"source"}} for an original-size local MP4. The schema lists other supported destinations and resolutions. Export approval stays in the browser. Local download and stored output are separate facts.',schema:z.object({projectId,reviewId:z.string().uuid(),args}).strict(),read:false},
];
function reviewWireSchema(schema:z.ZodType){const edit=nativeAgentResponseSchema({clarification:true,composition:true,anchorHold:true}),wire=z.toJSONSchema(schema);return JSON.parse(JSON.stringify({...wire,definitions:edit.definitions,properties:{...(wire as {properties:Record<string,unknown>}).properties,edit:{...edit,definitions:undefined},requirements:authoringCompletionRequirementsSchema}}))}
// Advertise the complete grammar, while the owning native kernel remains the
// domain validator. Duplicate AJV union validation hides its bounded,
// command-specific diagnostics behind errors from every unrelated branch.
function reviewInputSchema(schema:z.ZodType){
 const complete=reviewWireSchema(schema),boundary=structuredClone(complete);
 const commands=boundary.properties.edit.properties.commands;
 const commandList=commands.$ref ? boundary.definitions[commands.$ref.split("/").at(-1)] : commands;
 boundary.properties.edit.properties.commands={...commandList,items:{type:"object"}};
 const advertised=fromJsonSchema(complete),envelope=fromJsonSchema(boundary);
 return {"~standard":{...advertised["~standard"],validate:envelope["~standard"].validate}};
}
function outputWireSchema(name:string,schema:z.ZodType){
 const wire=z.toJSONSchema(schema),parameters=structuredClone(name==='dojo_request_preview'?VISUAL_REVIEW_HOST_TOOL_CATALOG.request_project_preview.parameters:VISUAL_REVIEW_HOST_TOOL_CATALOG.request_project_export.parameters) as Record<string,any>;
 if(name==='dojo_request_preview'){delete parameters.properties.candidateRef;parameters.oneOf=[{required:['frames'],not:{anyOf:[{required:['intervalFrames']},{required:['tileCount']}]}},{required:['intervalFrames','tileCount'],not:{required:['frames']}}];}
 return JSON.parse(JSON.stringify({...wire,properties:{...(wire as {properties:Record<string,unknown>}).properties,args:parameters}}));
}
export function createDojoMcpServer(rawOrigin:string,fetcher:typeof fetch=fetch){
 const origin=localMcpOrigin(rawOrigin),server=new McpServer({name:'dojo-video-agent',version:'0.1.0'});
 for(const definition of definitions)server.registerTool(definition.name,{description:definition.description,inputSchema:definition.name==='dojo_review_edit' ? reviewInputSchema(definition.schema) : ['dojo_request_preview','dojo_request_export'].includes(definition.name) ? fromJsonSchema(outputWireSchema(definition.name,definition.schema)) : definition.schema,annotations:{readOnlyHint:definition.read,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async(input,context)=>{
  try{
   const body=JSON.stringify({tool:definition.name,input});if(Buffer.byteLength(body)>256*1024)throw Error('Tool input exceeds 256 KiB.');
   const response=await fetcher(origin+'/api/external-agent',{method:'POST',redirect:'error',headers:{'content-type':'application/json',origin},body,signal:context.mcpReq.signal});
   const chunks:Uint8Array[]=[];let size=0;const stream=response.body?.getReader();if(!stream)throw Error('The local editor returned no response.');
   try{for(;;){const value=await stream.read();if(value.done)break;size+=value.value.length;if(size>3*1024*1024)throw Error('The local result exceeds its allowance. Use a smaller page or preview.');chunks.push(value.value)}}finally{await stream.cancel().catch(()=>{})}
   const envelope=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!response.ok||envelope.success===false)throw Error(envelope.message??'The local editor could not complete this tool.');
   const value=envelope.data??envelope,content:Array<{type:'text';text:string}|{type:'image';data:string;mimeType:string}>=[];
   if(['dojo_read_preview','dojo_read_output'].includes(definition.name)&&value.receipt?.frames){for(const frame of value.receipt.frames){const match=/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(frame.dataUrl??'');if(!match)throw Error('Saved preview image is invalid.');content.push({type:'image',data:match[1]!,mimeType:'image/jpeg'});delete frame.dataUrl;}}
   if(definition.name==='dojo_read_skill'&&Array.isArray(value.visualReferences)){for(const frame of value.visualReferences){const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(frame.dataUrl??'');if(!match)throw Error('Skill reference image is invalid.');content.push({type:'image',data:match[2]!,mimeType:match[1]!});delete frame.dataUrl;}}
   content.unshift({type:'text',text:JSON.stringify(value)});return {content};
  }catch(error){return {isError:true,content:[{type:'text' as const,text:error instanceof Error?error.message:'The local editor is unavailable.'}]};}
 });
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const origin=localMcpOrigin(process.env.DOJO_MCP_URL??'http://127.0.0.1:4310');serveStdio(()=>createDojoMcpServer(origin),{onerror:error=>console.error(error.message)});}
