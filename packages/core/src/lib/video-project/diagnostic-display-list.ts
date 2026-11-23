import {compileDisplayList,evaluateScene,layoutScene,resolveTextLineMetrics,type TextMetricsProvider} from "@dojo-video-engine/core";
import type {Scene} from "@dojo-video-engine/schema";
/** Use the engine's unchanged estimated metrics while retaining the node identity
 * that was last measured. A thrown fit error otherwise loses that useful context. */
export function diagnosticDisplayList(scene:Scene,frame:number){
 let nodeId="unknown", lineHeight: unknown;
 const textMetrics:TextMetricsProvider={measureLine(input){nodeId=input.nodeId;lineHeight=input.style.lineHeight;return resolveTextLineMetrics(input)}};
 try{return compileDisplayList(layoutScene(evaluateScene(scene,frame),{textMetrics}),{textMetrics})}
 catch(error){if(error instanceof Error&&"code"in error&&error.code==="TEXT_DOES_NOT_FIT"){
  const constraints="constraints"in error?JSON.stringify(error.constraints):"unknown";
  throw Error(`Text node ${JSON.stringify(nodeId)}, frame ${frame}, fit bounds ${constraints}: ${error.message}${typeof lineHeight === "number" && lineHeight > 4 ? ` lineHeight=${lineHeight} is a font-size multiplier, not pixels; use a ratio such as 1.1 or enlarge the box for deliberately wide leading.` : ""}`);
 }throw error}
}
