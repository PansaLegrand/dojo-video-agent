// Reproducible contact sheets from our MIT showcase exports, not generated artwork.
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
const source = path.resolve(process.argv[2] ?? "../dojo-video-engine/docs/assets/showcase");
const sets = {
  "festival-motion": [["kinetic",[45,165,315],"TYPE AS STAGE"],["festival",[45,175,325],"SCULPTURAL CELEBRATION"],["bloom",[35,155,315],"ORGANIC REVEAL"]],
  "branded-ending": [["precision",[65,185,325],"ASSEMBLE TO A LOCKUP"],["cinema",[45,175,325],"DEPTH THEN RESOLVE"],["type-motion",[55,175,325],"TYPE TRANSFORMS"]],
  "chart-storytelling": [["data-story",[30,90,150],"EDITORIAL DATA REVEAL"],["data-story",[190,250,325],"RELATIONSHIPS OVER TIME"],["software",[35,165,315],"EXPLAIN A PROCESS"]],
};
const tmp = await mkdtemp(path.join(os.tmpdir(), "dojo-reference-atlas-"));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
try {
  for (const [name, rows] of Object.entries(sets)) {
    const inputs = [], provenance = [];
    for (let r=0;r<rows.length;r++) {
      const [scene,frames,label] = rows[r], video = path.join(source, `${scene}.mp4`);
      provenance.push({scene,frames,sourceVideoSha256:sha(await readFile(video)),source:`https://github.com/PansaLegrand/dojo-video-engine/blob/main/examples/creative-showcase/${scene}.mjs`});
      for(let c=0;c<frames.length;c++) {
        const out=path.join(tmp,`${name}-${r}-${c}.jpg`);
        execFileSync("ffmpeg",["-v","error","-i",video,"-vf",`select=eq(n\\,${frames[c]}),scale=432:243:force_original_aspect_ratio=decrease,pad=432:270:(ow-iw)/2:0:color=0x101820,drawtext=text='${label}  ${(frames[c]/30).toFixed(1)}s':font=Arial:fontsize=13:fontcolor=white:x=12:y=249`,"-frames:v","1","-q:v","4",out],{stdio:"pipe"});
        inputs.push(out);
      }
    }
    const folder=path.resolve("skills",name), output=path.join(folder,"references/atlas.jpg");
    await mkdir(path.dirname(output),{recursive:true});
    const args=inputs.flatMap(file=>["-i",file]);
    execFileSync("ffmpeg",["-v","error",...args,"-filter_complex","xstack=inputs=9:layout=0_0|432_0|864_0|0_270|432_270|864_270|0_540|432_540|864_540", "-frames:v","1","-q:v","7","-y",output],{stdio:"pipe"});
    const bytes=await readFile(output);if(bytes.length>131072)throw Error(`Atlas too large: ${name}`);
    await writeFile(path.join(folder,"references.json"),JSON.stringify([{id:"motion-atlas",title:`${name} — three visual sequences`,markdown:"references/atlas.md",image:"references/atlas.jpg",sha256:sha(bytes),width:1296,height:810}],null,2)+"\n");
    await writeFile(path.join(folder,"references/provenance.json"),JSON.stringify({license:"MIT",purpose:"Visual study only; no sample branding, numbers or media are inserted into user projects.",width:1296,height:810,sha256:sha(bytes),sources:provenance},null,2)+"\n");
    console.log(`${name}: ${bytes.length} JPEG bytes`);
  }
} finally { await rm(tmp,{recursive:true,force:true}); }
