import {expect,it} from 'vitest';
import {buildAgentHandoff} from '../packages/ui/src/host/agent-handoff';
import {createVideoProjectDocument,hashVideoProjectDocument} from '../packages/core/src/lib/video-project/document';
it('copies the settled project identity and explicit selected scope while treating brand prose as data',async()=>{
 const document=createVideoProjectDocument();document.items.push({id:'title',name:'Title',trackId:'visual',node:{id:'title',type:'text',duration:60,text:'Hello'}});document.creativeContext.brandKit={name:'Brand ``` escape',approvedFacts:['Made here']};
 const snapshot={projectId:'project',document,revision:7,documentHash:await hashVideoProjectDocument(document),sources:[],history:{canUndo:true,canRedo:false}};
 const text=buildAgentHandoff({projectId:'project',snapshot,selectedItemIds:['missing','title'],selectedNodeId:'title',url:'http://127.0.0.1:4310/en/applications/editor/project?private=ignored'});
 const data=JSON.parse(text.split('```json\n')[1]!.split('\n```')[0]!);expect(data.revision).toBe(7);expect(data.documentHash).toBe(snapshot.documentHash);expect(data.scope).toEqual({kind:'selection',itemIds:['title'],node:{itemId:'title',nodeId:'title'}});expect(data.brandKit.name).toBe('Brand ``` escape');expect(data.localEditorUrl).not.toContain('?');expect(text.match(/```/g)).toHaveLength(2);
 expect(()=>buildAgentHandoff({projectId:'other',snapshot,selectedItemIds:[],selectedNodeId:null,url:'http://localhost:4310'})).toThrow(/changed/);
 expect(()=>buildAgentHandoff({projectId:'project',snapshot,selectedItemIds:[],selectedNodeId:null,url:'https://dojoclip.com'})).toThrow(/local editor/);
});
