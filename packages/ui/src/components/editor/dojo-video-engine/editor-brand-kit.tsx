"use client";
import { useEffect, useRef, useState } from "react";
import { Palette, X } from "lucide-react";
import { brandKitHasValues, brandKitPresets, videoBrandKitSchema, type VideoBrandKit } from "@/lib/video-project/brand-kit";
import type { VideoProjectDocument } from "@/lib/video-project/document";
import { editorFontFamilies } from "@/lib/editor/fonts";
import { loadEditorFontSpecimen, editorFontSpecimenFamily } from "./editor-font-picker";
import { useNativeEditorText } from "./native-editor-copy";
import "./editor-brand-kit.css";
const roles = ["background", "foreground", "primary", "onPrimary", "surface", "accent"] as const;
const colorLabels = ["Background", "Foreground", "Primary", "Text on primary", "Surface", "Accent"];
const fontRoles = ["headingFont", "bodyFont", "monoFont"] as const;
const fontLabels = ["Heading font", "Body font", "Mono font"];
export function EditorBrandKit({ document, disabled, onSave }: { document: VideoProjectDocument; disabled?: boolean; onSave:(kit:VideoBrandKit | undefined, expected:VideoBrandKit | undefined)=>Promise<void> }) {
 const t=useNativeEditorText(), dialog=useRef<HTMLDialogElement>(null), trigger=useRef<HTMLButtonElement>(null);
 const [open,setOpen]=useState(false),[draft,setDraft]=useState<VideoBrandKit>({}),[baseline,setBaseline]=useState<VideoBrandKit>(),[saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null),[fonts,setFonts]=useState(0);
 useEffect(()=>{if(!open)return;dialog.current?.showModal();let active=true;Promise.allSettled(brandKitPresets.flatMap(p=>Object.values(p.kit.typography??{})).map(loadEditorFontSpecimen)).then(()=>{if(active)setFonts(n=>n+1)});return()=>{active=false;dialog.current?.close();};},[open]);
 const close=()=>{if(saving)return;setOpen(false);trigger.current?.focus();};
 const begin=()=>{setBaseline(structuredClone(document.creativeContext.brandKit));setDraft(structuredClone(document.creativeContext.brandKit??{}));setError(null);setOpen(true)};
 const save=async(clear=false)=>{const parsed=videoBrandKitSchema.safeParse(JSON.parse(JSON.stringify({...draft, approvedFacts:draft.approvedFacts?.map(line=>line.trim()).filter(Boolean),rules:draft.rules?.map(line=>line.trim()).filter(Boolean)})));if(!clear&&!parsed.success){setError(t("Check color values, font names and text limits."));return;}setSaving(true);setError(null);try{await onSave(clear?undefined:parsed.success&&brandKitHasValues(parsed.data)?parsed.data:undefined,baseline);setOpen(false);trigger.current?.focus();}catch(e){setError(e instanceof Error?e.message:t("Brand kit could not be saved. Try again."));}finally{setSaving(false)}};
 const colors=draft.colors??{},family=draft.typography?.headingFont??"Inter";
 useEffect(()=>{if(open)void loadEditorFontSpecimen(family).then(()=>setFonts(n=>n+1),()=>{});},[open,family]);
 return <><button ref={trigger} type="button" className="editor-brand-trigger" aria-label={t("Brand kit")} disabled={disabled} onClick={begin}><Palette size={15}/><span>{t("Brand kit")}</span>{document.creativeContext.brandKit?.colors?.primary&&<i style={{background:document.creativeContext.brandKit.colors.primary}}/>}</button>
 {open&&<dialog ref={dialog} className="editor-brand-dialog" aria-labelledby="editor-brand-title" onCancel={e=>{e.preventDefault();close()}} onKeyDown={e=>e.stopPropagation()}>
 <header><div><p>{t("Visual identity")}</p><h2 id="editor-brand-title">{t("Brand kit")}</h2></div><button type="button" aria-label={t("Close")} disabled={saving} onClick={close}><X size={20}/></button></header>
 <p className="editor-brand-intro">{t("Save your visual identity once. The agent uses it across edits.")}</p>
 <form onSubmit={e=>{e.preventDefault();void save()}} aria-busy={saving}>
 <div className="editor-brand-scroll"><fieldset disabled={saving}><legend className="sr-only">{t("Brand identity")}</legend>
 <div className="editor-brand-presets" aria-label={t("Starting styles")}>{brandKitPresets.map(p=><button key={p.id} type="button" data-brand-preset={p.id} style={{background:p.kit.colors?.background,color:p.kit.colors?.foreground}} onClick={()=>setDraft(current=>({...current,name:current.name??p.name,colors:structuredClone(p.kit.colors),typography:structuredClone(p.kit.typography),cornerRadiusPx:p.kit.cornerRadiusPx,voice:current.voice??p.kit.voice,rules:current.rules??structuredClone(p.kit.rules)}))}><strong style={{fontFamily:JSON.stringify(editorFontSpecimenFamily(p.kit.typography!.headingFont!)),fontWeight:400}}>{p.name}</strong><span>{t(p.description)}</span><div>{Object.values(p.kit.colors!).map((color,i)=><i key={i} style={{background:color}}/>)}</div></button>)}</div>
 <div className="editor-brand-columns"><section className="editor-brand-fields">
 <label>{t("Brand name")}<input aria-label={t("Brand name")} value={draft.name??""} maxLength={100} onChange={e=>setDraft({...draft,name:e.target.value||undefined})}/></label>
 <div className="editor-brand-colors">{roles.map((role,i)=><label key={role}>{t(colorLabels[i])}<span><input type="color" aria-label={`${t(colorLabels[i])} ${t("picker")}`} value={/^#[a-f0-9]{6}$/i.test(colors[role]??"")?colors[role]:"#101820"} onChange={e=>setDraft({...draft,colors:{...colors,[role]:e.target.value}})}/><input aria-label={t(colorLabels[i])} value={colors[role]??""} placeholder="#101820" maxLength={120} onChange={e=>setDraft({...draft,colors:{...colors,[role]:e.target.value||undefined}})}/></span></label>)}</div>
 {fontRoles.map((role,i)=><label key={role}>{t(fontLabels[i])}<select aria-label={t(fontLabels[i])} value={draft.typography?.[role]??""} onChange={e=>setDraft({...draft,typography:{...draft.typography,[role]:e.target.value||undefined}})}><option value="">{t("Choose a font")}</option>{[...new Set([...editorFontFamilies,...Object.values(draft.typography??{})])].map(font=><option key={font}>{font}</option>)}</select></label>)}
 <div className="editor-brand-pair"><label>{t("Logo")}<select aria-label={t("Logo")} value={draft.logoAssetId??""} onChange={e=>setDraft({...draft,logoAssetId:e.target.value||undefined})}><option value="">{t("No logo")}</option>{draft.logoAssetId&&!document.assets[draft.logoAssetId]&&<option value={draft.logoAssetId}>{t("Logo unavailable")}</option>}{Object.values(document.assets).filter(a=>a.type==="image").map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>{t("Corner radius")}<input type="number" min={0} max={200} aria-label={t("Corner radius")} value={draft.cornerRadiusPx??""} onChange={e=>setDraft({...draft,cornerRadiusPx:e.target.value===""?undefined:Number(e.target.value)})}/></label></div>
 <label>{t("Gradient (optional)")}<input aria-label={t("Gradient (optional)")} value={draft.gradient??""} maxLength={500} placeholder="linear-gradient(135deg, #F18F6D, #86DAD6)" onChange={e=>setDraft({...draft,gradient:e.target.value||undefined})}/></label>
 </section><section className="editor-brand-notes"><div className="editor-brand-style-preview" data-font-revision={fonts} style={{background:colors.background??"#101820",color:colors.foreground??"#f4f1e8"}}><span>{t("Style preview")}</span><h3 style={{fontFamily:JSON.stringify(editorFontSpecimenFamily(family))}}>{draft.name||t("Your next story")}</h3><p style={{fontFamily:draft.typography?.bodyFont??"Inter"}}>{t("A clear idea, in your own voice.")}</p><div style={{background:draft.gradient??colors.primary??"#F18F6D",color:colors.onPrimary??"#101820",borderRadius:draft.cornerRadiusPx??18}}>{t("Make it yours")}</div></div>
 <label>{t("Brand voice")}<textarea aria-label={t("Brand voice")} rows={2} maxLength={500} value={draft.voice??""} onChange={e=>setDraft({...draft,voice:e.target.value||undefined})}/></label>
 {(["approvedFacts","rules"] as const).map(key=><label key={key}>{t(key==="approvedFacts"?"Approved facts":"Design rules")}<textarea aria-label={t(key==="approvedFacts"?"Approved facts":"Design rules")} rows={4} maxLength={10000} value={(draft[key]??[]).join("\n")} onChange={e=>setDraft({...draft,[key]:e.target.value.split("\n")})}/><small>{t("One per line. Up to 20 lines, 500 characters each.")}</small></label>)}
 </section></div></fieldset></div>
 {error&&<p role="alert" className="editor-brand-error">{error}</p>}
 <footer><button type="button" disabled={saving||!baseline} onClick={()=>void save(true)}>{t("Clear brand kit")}</button><div><button type="button" disabled={saving} onClick={close}>{t("Cancel")}</button><button type="submit" className="editor-brand-save" disabled={saving}>{t(saving?"Saving…":"Save brand kit")}</button></div></footer></form>
 </dialog>}</>;
}
