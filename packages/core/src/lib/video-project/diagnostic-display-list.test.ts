import {it,expect} from "vitest";
import {compileDisplayList,evaluateScene,layoutScene} from "@dojo-video-engine/core";
import {parseScene} from "@dojo-video-engine/schema";
import {diagnosticDisplayList} from "./diagnostic-display-list";
const scene=(width:number)=>parseScene({schemaVersion:1,width:640,height:360,fps:30,duration:90,assets:{},nodes:[{id:"tight-label",type:"text",text:"This label needs enough room",from:0,duration:90,style:{position:"absolute",left:20,top:20,width,height:40,fontSize:32,textFit:"shrink",minFontSize:12,maxLines:1}}]});
it("identifies the exact failing text node and frame without copying an engine renderer",()=>{expect(()=>diagnosticDisplayList(scene(10),15)).toThrow(/tight-label.*frame 15.*fit bounds/)});
it("preserves the engine's existing bounds and text lines for successful layouts",()=>{const s=scene(600),plain=compileDisplayList(layoutScene(evaluateScene(s,15))),diagnostic=diagnosticDisplayList(s,15);const pick=(value:typeof plain)=>value.groups.map(g=>({id:g.nodeId,box:g.box,content:g.content}));expect(pick(diagnostic)).toEqual(pick(plain))});

it("explains a pixel-valued lineHeight mistake from the retained paid draft",()=>{const s=scene(620);s.nodes[0].style={...s.nodes[0].style,height:56,fontSize:42,lineHeight:48};expect(()=>diagnosticDisplayList(s,10)).toThrow(/lineHeight=48.*multiplier, not pixels/)});
