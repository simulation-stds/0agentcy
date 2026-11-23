import { captionWords, transcriptWords } from "@/lib/caption-words";
import { drawCaption } from "@/lib/caption-renderer";
import { useEffect, useRef, useState } from "react";
import { FormRow, PrimaryButton, SecondaryButton, SelectControl, SwitchRow } from "@/components/app-controls";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Input } from "@/components/ui/input";
import type { Transcription } from "@/hooks/use-transcription";
import { defaultGroupingOptions } from "@/lib/subtitle-grouping";
import { defaultSubtitleStyle, subtitleFonts, type SubtitleStyle, type SubtitleCue, validSubtitleStyle, resolvedSubtitleStyle, subtitleTimestamp } from "@/lib/subtitles";

const languages = [{ value: "en", label: "English" }, { value: "es", label: "Spanish" }, { value: "fr", label: "French" }, { value: "de", label: "German" }, { value: "it", label: "Italian" }, { value: "pt", label: "Portuguese" }, { value: "ja", label: "Japanese" }, { value: "zh", label: "Chinese" }];

export function TranscriptionTools({ tools: t, installationOnly = false }: { tools: Transcription; installationOnly?: boolean }) {
  return <div className="panel transcription-tools">
    <h2>WhisperX transcription</h2>
    <FormRow label="Processing"><SelectControl value={t.device} onChange={t.setDevice} disabled={t.busy} options={[{ value: "cpu", label: "CPU" }, { value: "cuda", label: "NVIDIA GPU" }]} /></FormRow>
    <FormRow label="Model"><SelectControl value={t.model} onChange={t.setModel} disabled={t.busy} options={[{ value: "tiny", label: "Tiny — smallest" }, { value: "base", label: "Base" }, { value: "small", label: "Small — balanced" }, { value: "medium", label: "Medium" }, { value: "turbo", label: "Turbo" }, { value: "large-v3", label: "Large v3" }]} /></FormRow>
    {!installationOnly && <><FormRow label="Language"><SelectControl value={t.language} onChange={next => { t.setLanguage(next); if (next !== "auto") t.setSetupLanguage(next); }} disabled={t.busy} options={[{ value: "auto", label: "Detect automatically" }, ...languages]} /></FormRow>
    <SwitchRow checked={t.selectionOnly} onCheckedChange={t.setSelectionOnly}>Transcribe selection only</SwitchRow></>}
    {installationOnly && <div className="transcription-setup">
      <p>Installed once for your user account. Downloads Python, WhisperX and the selected models; allow several GB of free space. Your media is processed locally.</p>
      <FormRow label="Initial alignment language"><SelectControl value={t.setupLanguage} onChange={t.setSetupLanguage} disabled={t.busy} options={languages} /></FormRow>
      <p>Other models and alignment languages download on first use. Complete their downloads before working offline.</p>
      <PrimaryButton type="button" disabled={t.busy || t.blocked || !t.status} onClick={() => void t.setup()}>{t.status?.installed ? "Repair / download selected model" : "Set up transcription"}</PrimaryButton>
      {t.status && <small className="transcription-path">Storage: {t.status.path}</small>}
      {t.device === "cuda" && t.status && !t.status.gpuAvailable && <p>No NVIDIA GPU detected. Use CPU or check your GPU driver.</p>}
      {t.status?.installed && <>
        <SecondaryButton type="button" disabled={t.busy || t.blocked} onClick={() => void t.remove(false)}>Remove runtime</SecondaryButton>
        <SecondaryButton type="button" disabled={t.busy || t.blocked} onClick={() => void t.remove(true)}>Remove runtime and model downloads</SecondaryButton>
      </>}
    </div>}
    {installationOnly && <SpeakerDetectionSettings tools={t} />}
    {!installationOnly && t.status?.installed && <PrimaryButton type="button" disabled={t.busy || t.blocked || t.isGroupingPreview || !t.source || !t.duration} onClick={() => void t.run()}>Transcribe{t.project ? " again" : ""}</PrimaryButton>}
    {t.busy && <SecondaryButton type="button" onClick={() => void t.cancel()}>Cancel</SecondaryButton>}
    <p role="status">{t.busy ? t.step : t.status?.installed ? "Ready" : t.status ? "Set up WhisperX in Settings → Audio → Editing." : "Checking transcription setup…"}</p>
    {t.error && <p className="transcription-error" role="alert">{t.error}</p>}
  </div>;
}

function SpeakerDetectionSettings({ tools: t }: { tools: Transcription }) {
  const [token, setToken] = useState("");
  const [remember, setRemember] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  async function credential(action: () => Promise<void>) {
    setWorking(true); setError("");
    try { await action(); setToken(""); }
    catch (failure) { setError(String(failure)); }
    finally { setWorking(false); }
  }
  return <section className="transcription-setup speaker-detection-settings" aria-label="Automatic speaker detection setup">
    <h3>Automatic speaker detection</h3>
    <p>WhisperX uses pyannote Community-1 to detect different voices locally. Accept the model conditions with your Hugging Face account, then add a token with read access.</p>
    <div className="subtitle-export">
      <SecondaryButton type="button" onClick={() => void openUrl("https://huggingface.co/pyannote/speaker-diarization-community-1").catch(() => setError("Could not open the model conditions."))}>Model conditions</SecondaryButton>
      <SecondaryButton type="button" onClick={() => void openUrl("https://huggingface.co/settings/tokens").catch(() => setError("Could not open Hugging Face token settings."))}>Get a read token</SecondaryButton>
    </div>
    <FormRow label="Hugging Face token">
      <Input type="password" autoComplete="off" spellCheck={false} aria-label="Hugging Face token" placeholder={t.status?.tokenConfigured ? "Token configured · enter to replace" : "hf_…"} value={token} disabled={working || t.busy} onChange={event => setToken(event.target.value)} />
    </FormRow>
    <SwitchRow checked={remember} onCheckedChange={setRemember}>Remember securely on this computer</SwitchRow>
    <small>Remembered tokens use the system credential store. Otherwise the token lasts for this app session. Tokens are excluded from subtitle projects and logs.</small>
    <div className="subtitle-export">
      <SecondaryButton type="button" disabled={working || t.busy || !token.trim()} onClick={() => void credential(() => t.saveHuggingFaceToken(token, remember))}>Save token</SecondaryButton>
      <SecondaryButton type="button" disabled={working || t.busy || !t.status?.tokenConfigured} onClick={() => void credential(t.clearHuggingFaceToken)}>Remove token</SecondaryButton>
    </div>
    <p role="status">{t.status?.tokenConfigured ? t.status.tokenPersistent ? "Token stored securely" : "Token available for this session" : "No token configured"} · {t.status?.speakerModelReady ? "Speaker model ready" : "Speaker model needs setup"}</p>
    {t.status?.credentialError && !t.status.tokenConfigured && <p role="status">{t.status.credentialError}</p>}
    {error && <p role="alert" className="transcription-error">{error}</p>}
    <PrimaryButton type="button" disabled={t.busy || t.blocked || working || !t.status?.installed || !t.status.tokenConfigured} onClick={() => void t.setupSpeakers()}>{t.status?.speakerModelReady ? "Verify / repair speaker model" : "Set up speaker detection"}</PrimaryButton>
    {!t.status?.installed && <small>Set up the selected WhisperX processing runtime first.</small>}
    {t.status?.speakerModelReady && <SecondaryButton type="button" disabled={t.busy || t.blocked || working} onClick={() => void t.removeSpeakers()}>Remove speaker model</SecondaryButton>}
    <small>Model: pyannote/speaker-diarization-community-1 · CC BY 4.0. Once set up, detection uses downloaded models without uploading your recording.</small>
  </section>;
}

export function SubtitleOptions({ tools: t }: { tools: Transcription }) {
  const [format, setFormat] = useState("srt");
  const [exportMode, setExportMode] = useState("file");
  const [zero, setZero] = useState(false);
  const [speakers, setSpeakers] = useState(false);
  const project = t.project;
  if (!project) return null;
  return <section className="panel subtitle-options" aria-label="Subtitle options">
    <h2>Subtitle preview</h2>
    <SubtitleGroupingControls tools={t} />
    <SwitchRow checked={t.follow} onCheckedChange={t.setFollow}>Follow playback</SwitchRow>
    <SwitchRow checked={t.captions} onCheckedChange={t.setCaptions}>Show captions</SwitchRow>
    <SubtitleStyleControls tools={t} />
    <FormRow label="Export"><SelectControl value={exportMode} disabled={t.busy} onChange={next => { setExportMode(next); if (next === "both" && !["srt", "vtt", "ass"].includes(format)) setFormat("srt"); }} options={[{value:"file",label:"Subtitle file"},{value:"video",label:"Captioned video (MP4)",disabled:!t.frame},{value:"both",label:"Video + subtitle file",disabled:!t.frame}]} /></FormRow>
    {exportMode !== "video" && <FormRow label="Export format">
      <SelectControl value={format} onChange={setFormat} options={[{ value: "srt", label: "SRT" }, { value: "vtt", label: "VTT" }, { value: "ass", label: "ASS (styled subtitles)" }, ...(exportMode === "file" ? [{ value: "txt", label: "Text" }, { value: "json", label: "Project (with edits)" }] : [])]} />
    </FormRow>}
    {exportMode === "file" && <SwitchRow checked={zero} onCheckedChange={setZero}>Start export at selection zero</SwitchRow>}
    {t.speakersEnabled && <SwitchRow checked={speakers} onCheckedChange={setSpeakers}>Include speaker names in export</SwitchRow>}
    <div className="subtitle-export">
      <SecondaryButton type="button" disabled={t.isGroupingPreview || t.busy || (exportMode !== "file" && !t.frame) || (exportMode === "both" && !["srt","vtt","ass"].includes(format))} onClick={() => void (exportMode === "file" ? t.exportProject(format as "srt" | "vtt" | "txt" | "ass" | "json", zero, speakers && t.speakersEnabled) : t.exportVideo(exportMode === "both" ? format as "srt" | "vtt" | "ass" : undefined, speakers && t.speakersEnabled))}>Export</SecondaryButton>
      <SecondaryButton type="button" disabled={t.isGroupingPreview} onClick={() => void t.saveAll().catch(() => {})}>Save project</SecondaryButton>
    </div>
    {exportMode !== "file" && t.frame && t.videoEffects.settings.enabled && <small>Enabled video effects are included in this export.</small>}
    {exportMode !== "file" && <small>Exports the full video with captions permanently visible. Subtitle files use source timing. Word effects and rounded boxes are preserved in the video; ASS uses basic styling.</small>}
    {t.captionExport.running && <div role="status"><progress aria-label="Captioned video export progress" value={t.captionExport.progress} max={1}/><p>{t.captionExport.message}</p></div>}
    {t.saveError ? <p role="alert" className="transcription-error">Could not save: {t.saveError}</p> : <small role="status">{t.saving ? "Saving edits…" : "Edits save automatically on this computer. Export a project to keep a portable copy."}</small>}
    <fieldset disabled={t.busy || t.isGroupingPreview} className="subtitle-edit-fields">
      <SwitchRow checked={t.speakersEnabled} onCheckedChange={t.setSpeakersEnabled}>Add speakers</SwitchRow>
      {t.speakersEnabled && <FormRow label="Number of speakers" help="Leave blank to detect the number automatically.">
        <Input type="number" min={1} max={50} step={1} placeholder="Automatic" aria-label="Number of speakers" value={t.speakerCount} onChange={event => t.setSpeakerCount(event.target.value)} />
      </FormRow>}
      <SecondaryButton type="button" disabled={t.busy || t.blocked || !t.status?.speakerModelReady || !project.cues.length} onClick={() => void t.detectSpeakers()}>Detect speakers{project.speakerDetection ? " again" : ""}</SecondaryButton>
      {!t.status?.speakerModelReady && <small>Set up automatic speaker detection in Settings → Audio → Editing.</small>}
      {project.speakerDetection && <small>Detected {project.speakerDetection.count} speakers. Rename them below.</small>}
      {t.speakersEnabled && <div className="subtitle-speakers">
        {Object.entries(project.speakers).map(([id, name]) => <FormRow key={id} label={id}><Input aria-label={`Name for ${id}`} value={name} onChange={e => t.updateProject(p => ({ ...p, speakers: { ...p.speakers, [id]: e.target.value } }))} /></FormRow>)}
        <SecondaryButton type="button" onClick={() => t.updateProject(p => {
          let n = 1; while (`speaker-${n}` in p.speakers) n++;
          return { ...p, speakers: { ...p.speakers, [`speaker-${n}`]: `Speaker ${n}` } };
        })}>Add another speaker</SecondaryButton>
      </div>}
    </fieldset>
    {t.busy && <SecondaryButton type="button" onClick={() => void t.cancel()}>Cancel</SecondaryButton>}
  </section>;
}

function SubtitleStyleNumber({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const valid = draft.trim() !== "" && Number(draft) >= min && Number(draft) <= max;
  return <Input aria-label={label} aria-invalid={!valid} type="number" min={min} max={max} step={step} value={draft}
    onChange={event => {
      const next = event.target.value; setDraft(next);
      if (next.trim() && Number(next) >= min && Number(next) <= max) onChange(Number(next));
    }} onBlur={() => setDraft(String(value))} />;
}

function SubtitleStyleControls({ tools: t }: { tools: Transcription }) {
  const style = resolvedSubtitleStyle(t.project?.subtitleStyle);
  const update = (patch: Partial<SubtitleStyle>) => t.updateProject(p => ({ ...p, subtitleStyle: { ...(p.subtitleStyle ?? defaultSubtitleStyle), ...patch } }));
  return <section className="subtitle-styling" aria-label="Subtitle styling">
    <h3>Subtitle style</h3>
    <fieldset disabled={t.busy || t.isGroupingPreview} className="subtitle-edit-fields">
      <FormRow label="Font"><SelectControl value={style.font} onChange={font => update({ font: font as SubtitleStyle["font"] })} options={[...new Set([...subtitleFonts, ...t.fontLibrary.fonts.map(f => f.family), style.font])].map(font => ({ value: font, label: font }))} /></FormRow>
      <FormRow label="Font size" help="Pixels on a 1080p frame. Scales with the preview and exported video."><SubtitleStyleNumber label="Subtitle font size" min={12} max={120} step={1} value={style.size} onChange={size => update({ size })} /></FormRow>
      <FormRow label="Text color"><Input aria-label="Subtitle text color" type="color" value={style.color} onChange={e => update({ color: e.target.value })} /></FormRow>
      <FormRow label="Outline width"><SubtitleStyleNumber label="Subtitle outline width" min={0} max={8} step={0.5} value={style.outline} onChange={outline => update({ outline })} /></FormRow>
      <FormRow label="Outline color"><Input aria-label="Subtitle outline color" type="color" value={style.outlineColor} onChange={e => update({outlineColor:e.target.value})}/></FormRow>
      <FormRow label="Background color"><Input aria-label="Subtitle background color" type="color" value={style.backgroundColor} onChange={e => update({backgroundColor:e.target.value})}/></FormRow>
      <FormRow label="Background mode"><SelectControl value={style.backgroundMode} onChange={backgroundMode=>update({backgroundMode:backgroundMode as SubtitleStyle["backgroundMode"]})} options={[{value:"caption",label:"Whole caption"},{value:"words",label:"Individual word boxes"},{value:"active-word",label:"Highlight spoken word"}]}/></FormRow>
      {style.backgroundMode === "active-word" && <><FormRow label="Highlight background"><Input aria-label="Word highlight background" type="color" value={style.highlightColor} onChange={e=>update({highlightColor:e.target.value})}/></FormRow><FormRow label="Highlight text"><Input aria-label="Word highlight text" type="color" value={style.highlightTextColor} onChange={e=>update({highlightTextColor:e.target.value})}/></FormRow></>}
      <SwitchRow checked={style.bold} onCheckedChange={bold=>update({bold})}>Bold</SwitchRow>
      <SwitchRow checked={style.uppercase} onCheckedChange={uppercase=>update({uppercase})}>Uppercase</SwitchRow>
      <FormRow label="Background padding"><SubtitleStyleNumber label="Subtitle background padding" min={0} max={40} step={1} value={style.padding} onChange={padding=>update({padding})}/></FormRow>
      <FormRow label="Rounded corners"><SubtitleStyleNumber label="Subtitle background corner radius" min={0} max={40} step={1} value={style.radius} onChange={radius=>update({radius})}/></FormRow>
      <FormRow label={`Background opacity · ${style.backgroundOpacity}%`}><input aria-label="Subtitle background opacity" type="range" min={0} max={100} step={1} value={style.backgroundOpacity} onChange={e => update({ backgroundOpacity: Number(e.target.value) })} /></FormRow>
      <FormRow label="Position"><SelectControl value={style.position} onChange={position => update({ position: position as SubtitleStyle["position"] })} options={[{ value: "top", label: "Top" }, { value: "center", label: "Center" }, { value: "bottom", label: "Bottom" }]} /></FormRow>
      <SubtitlePresets style={style} update={update}/>
      <SecondaryButton type="button" onClick={() => update(resolvedSubtitleStyle())}>Reset subtitle style</SecondaryButton>
    </fieldset>
    {t.fontLibrary.error && <small role="alert" className="transcription-error">{t.fontLibrary.error}</small>}
    {!(subtitleFonts as readonly string[]).includes(style.font) && !t.fontLibrary.fonts.some(font=>font.family===style.font) && <small role="alert">This project’s font is missing. Add it in Settings → Fonts before exporting video.</small>}
    <small>Add or remove fonts in Settings → Fonts. Word effects and rounded boxes are preserved in captioned video exports; ASS carries basic styling.</small>
  </section>;
}

function SubtitlePresets({style,update}:{style:SubtitleStyle;update:(style:Partial<SubtitleStyle>)=>void}) {
  const [name,setName]=useState("");
  const [saved,setSaved]=useState<{name:string;style:SubtitleStyle}[]>(()=>{try{const value=JSON.parse(localStorage.getItem("subtitle-style-presets")||"[]");return Array.isArray(value)?value.filter(v=>typeof v?.name==="string"&&validSubtitleStyle(v.style)):[];}catch{return [];}});
  const [error,setError]=useState("");
  const store=(next:typeof saved)=>{try{localStorage.setItem("subtitle-style-presets",JSON.stringify(next));setSaved(next);setError("");}catch{setError("Could not save style presets on this computer.");}};
  return <div className="subtitle-presets"><FormRow label="Style preset"><SelectControl value="choose" onChange={value=>{if(value==="clean")update(resolvedSubtitleStyle());else if(value==="bold")update({...resolvedSubtitleStyle(),bold:true,uppercase:true,outline:4,backgroundOpacity:0});else if(value==="highlight")update({...resolvedSubtitleStyle(),bold:true,backgroundMode:"active-word",backgroundOpacity:100});else if(value.startsWith("saved-")){const preset=saved[Number(value.slice(6))];if(preset)update(preset.style);}}} options={[{value:"choose",label:"Choose a preset"},{value:"clean",label:"Clean captions"},{value:"bold",label:"Bold outline"},{value:"highlight",label:"Word highlight"},...saved.map((p,i)=>({value:`saved-${i}`,label:p.name}))]}/></FormRow>
    <Input aria-label="Subtitle preset name" value={name} maxLength={60} placeholder="Name this style…" onChange={e=>setName(e.target.value)}/>
    <SecondaryButton disabled={!name.trim()} onClick={()=>{store([...saved.filter(p=>p.name!==name.trim()),{name:name.trim(),style:{...style}}]);setName("");}}>Save style preset</SecondaryButton>
    {saved.map((p,i)=><SecondaryButton key={p.name} onClick={()=>store(saved.filter((_,index)=>index!==i))}>Remove preset: {p.name}</SecondaryButton>)}
    {error&&<small role="alert">{error}</small>}
  </div>;
}

function WordTimingEditor({tools:t,cue}:{tools:Transcription;cue:SubtitleCue}) {
  const result=captionWords(cue,t.displayProject?.language);
  function change(index:number,patch:{start?:number;end?:number}){const words=transcriptWords(result.words, cue.words);words[index]={...words[index],...patch};t.updateCue(cue.id,{words,wordTimingEstimated:result.estimated});}
  return <details className="subtitle-word-timings"><summary>Word timings{result.estimated?" · estimated":""}</summary>
    {result.estimated&&<small>Text edits or missing alignment require timing review. Adjust the words, then confirm after listening.</small>}
    {result.words.map((word,index)=><div key={index} className="subtitle-word-time"><button type="button" onClick={()=>t.seek(word.start)}>{word.text}</button><div className="subtitle-timing">
      <SubtitleTimeInput label="Word start (s)" value={word.start} min={index?result.words[index-1].end:cue.start} max={word.end-.001} disabled={t.isGroupingPreview} onCommit={start=>change(index,{start})}/>
      <SubtitleTimeInput label="Word end (s)" value={word.end} min={word.start+.001} max={result.words[index+1]?.start??cue.end} disabled={t.isGroupingPreview} onCommit={end=>change(index,{end})}/>
    </div></div>)}
    {result.estimated&&!!result.words.length&&<SecondaryButton disabled={t.isGroupingPreview} onClick={()=>t.updateCue(cue.id,{words:transcriptWords(result.words, cue.words),wordTimingEstimated:false})}>Confirm reviewed word timings</SecondaryButton>}
  </details>;
}

function SubtitleGroupingControls({ tools: t }: { tools: Transcription }) {
  const options = t.project?.subtitleGrouping ?? defaultGroupingOptions;
  const [maxWords, setMaxWords] = useState(String(options.maxWords));
  const [preset, setPreset] = useState([3, 5, 8, 12].includes(options.maxWords) ? String(options.maxWords) : "custom");
  const [maxLines, setMaxLines] = useState(options.maxLines);
  const [punctuation, setPunctuation] = useState(options.breakOnPunctuation);
  useEffect(() => {
    setMaxWords(String(options.maxWords));
    setPreset([3, 5, 8, 12].includes(options.maxWords) ? String(options.maxWords) : "custom");
    setMaxLines(options.maxLines); setPunctuation(options.breakOnPunctuation);
  }, [t.project?.source, t.project?.subtitleGrouping]);
  const count = Number(maxWords);
  const valid = !!maxWords.trim() && Number.isInteger(count) && count >= 1 && count <= 50;
  return <section className="subtitle-grouping" aria-label="Subtitle grouping">
    <h3>Block grouping</h3>
    <fieldset disabled={t.busy || t.blocked} className="subtitle-edit-fields">
      <FormRow label="Maximum words per block">
        <SelectControl value={preset} onChange={value => {
          t.cancelGroupingPreview(); setPreset(value); if (value !== "custom") setMaxWords(value);
        }} options={[3, 5, 8, 12].map(value => ({ value: String(value), label: `${value} words` })).concat([{ value: "custom", label: "Custom" }])} />
      </FormRow>
      {preset === "custom" && <FormRow label="Custom word limit">
        <Input type="number" min={1} max={50} step={1} aria-label="Maximum words per block" value={maxWords} onChange={event => { t.cancelGroupingPreview(); setMaxWords(event.target.value); }} />
      </FormRow>}
      <FormRow label="Maximum text lines">
        <SelectControl value={String(maxLines)} onChange={value => { t.cancelGroupingPreview(); setMaxLines(Number(value)); }} options={[{ value: "1", label: "1 line" }, { value: "2", label: "2 lines" }]} />
      </FormRow>
      <SwitchRow checked={punctuation} onCheckedChange={value => { t.cancelGroupingPreview(); setPunctuation(value); }}>Break at sentence endings</SwitchRow>
      <small>Different speaker labels and long pauses stay separate. Shorter blocks are allowed.</small>
      <PrimaryButton type="button" disabled={!valid || !t.project?.cues.length} onClick={() => t.previewGrouping({ maxWords: count, maxLines, breakOnPunctuation: punctuation })}>Preview grouping</PrimaryButton>
      {t.groupingPreview && <div className="subtitle-grouping-notice" role="status">
        <strong>{t.project?.cues.length} → {t.groupingPreview.project.cues.length} blocks</strong>
        <span>Preview only. Nothing is saved until you apply.</span>
        {t.groupingPreview.estimatedBlocks > 0 && <span>Split timing is estimated for {t.groupingPreview.estimatedBlocks} edited or unaligned source {t.groupingPreview.estimatedBlocks === 1 ? "block" : "blocks"}. Text and speaker labels are kept.</span>}
      </div>}
      {t.isGroupingPreview && <div className="subtitle-export">
        <PrimaryButton type="button" onClick={t.applyGrouping}>Apply grouping</PrimaryButton>
        <SecondaryButton type="button" onClick={t.cancelGroupingPreview}>Cancel preview</SecondaryButton>
      </div>}
      <SecondaryButton type="button" disabled={!t.canUndoGrouping || t.isGroupingPreview} onClick={t.undoGrouping}>Undo grouping</SecondaryButton>
      {t.groupingUndoBlocked ? <small>Further subtitle edits were made. Undo is disabled to protect those edits.</small> : <small>Undo the last applied grouping during this session, before making further subtitle edits.</small>}
    </fieldset>
  </section>;
}

export function SubtitleCaption({ tools: t }: { tools: Transcription }) {
  const element = useRef<HTMLDivElement | null>(null), canvas = useRef<HTMLCanvasElement | null>(null);
  const [bounds, setBounds] = useState({width:960,height:540});
  const visible = t.captions && !!t.displayProject;
  useEffect(()=>{
    const parent=element.current?.parentElement;if(!parent)return;
    const measure=()=>setBounds({width:parent.clientWidth||960,height:parent.clientHeight||540});
    const observer=new ResizeObserver(measure);observer.observe(parent);measure();return()=>observer.disconnect();
  },[visible]);
  const ratio=t.frame&&t.frame.width>0&&t.frame.height>0?t.frame.width/t.frame.height:bounds.width/bounds.height;
  const height=Math.min(bounds.height,bounds.width/ratio),width=height*ratio;
  useEffect(()=>{
    if(!canvas.current||!visible)return;
    canvas.current.height=t.frame?.height||1080;canvas.current.width=t.frame?.width||Math.round(1080*ratio);
    const media=element.current?.closest(".video-shell, .audio-preview-shell")?.querySelector<HTMLMediaElement>("video, audio");
    let frame=0,lastKey="";
    const draw=()=>{
      const time=media&&!media.paused?media.currentTime:t.currentTime;
      const cue=t.displayProject?.cues.find(c=>time>=c.start&&time<c.end);
      const style=resolvedSubtitleStyle(t.displayProject?.subtitleStyle);
      const word=cue&&style.backgroundMode==="active-word"?captionWords(cue,t.displayProject?.language).words.findIndex(w=>time>=w.start&&time<w.end):-1;
      const key=`${cue?.id}:${word}`;
      if(key!==lastKey&&canvas.current){drawCaption(canvas.current,cue,time,style,t.displayProject?.language);lastKey=key;}
      frame=requestAnimationFrame(draw);
    };draw();return()=>cancelAnimationFrame(frame);
  },[visible,t.activeCue,t.currentTime,t.displayProject,t.displayProject?.subtitleStyle,t.displayProject?.language,t.frame?.width,t.frame?.height,ratio,t.fontLibrary.revision]);
  if(!visible)return null;
  return <div ref={element} className="subtitle-caption" aria-live="off"><canvas ref={canvas} aria-label={t.activeCue?.text || "Subtitle preview"} style={{position:"absolute",left:(bounds.width-width)/2,top:(bounds.height-height)/2,width,height}}/></div>;
}

export function SubtitleEditor({ tools: t }: { tools: Transcription }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const active = useRef<HTMLElement | null>(null);
  const editor = useRef<HTMLDivElement | null>(null);
  const project = t.displayProject;
  useEffect(() => {
    const focused = document.activeElement;
    const editing = focused instanceof HTMLElement && focused.matches("input, textarea, [role='combobox']") && editor.current?.contains(focused);
    if (t.follow && !editing) active.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [t.activeCue?.id, t.follow]);
  useEffect(() => { if (t.isGroupingPreview) setQuery(""); }, [t.isGroupingPreview]);
  if (!project) return <div className="subtitle-empty"><p>Transcribe audio or video to edit synchronized subtitles here.</p>{t.error && <p role="alert">{t.error}</p>}</div>;
  const cues = project.cues.filter(c => c.text.toLowerCase().includes(query.toLowerCase()));
  return <div className={`subtitle-editor${expanded ? " is-expanded" : ""}`}>
    <div className="subtitle-toolbar">
      {t.isGroupingPreview && <strong className="subtitle-grouping-notice" role="status">Grouping preview · not saved</strong>}
      <strong>Subtitles · {project.language.toUpperCase()}</strong>
      <SecondaryButton type="button" onClick={() => setExpanded(!expanded)}>{expanded ? "Close expanded editor" : "Expand"}</SecondaryButton>
      <Input aria-label="Search subtitles" placeholder="Search subtitles…" value={query} onChange={e => setQuery(e.target.value)} />
      {project.warnings?.map((warning, index) => <p key={index} role="status" className="transcription-error">{warning}</p>)}
      {t.error && <p role="alert" className="transcription-error">{t.error}</p>}
    </div>
    <fieldset disabled={t.busy} className="subtitle-edit-fields">
    <div className="subtitle-cues" ref={editor}>
      {!cues.length && <p>{project.cues.length ? "No matching subtitles." : "No speech was detected in this range."}</p>}
      {cues.map(cue => <article key={cue.id} ref={t.activeCue?.id === cue.id ? active : undefined} className={`subtitle-cue${t.activeCue?.id === cue.id ? " is-active" : ""}`}>
        <button type="button" className="subtitle-seek" onClick={() => t.seek(cue.start)}>{subtitleTimestamp(cue.start)} → {subtitleTimestamp(cue.end)}</button>
        <div className="subtitle-timing">
          <SubtitleTimeInput disabled={t.isGroupingPreview} label="Start (s)" value={cue.start} min={0} max={cue.end - 0.001} onCommit={start => t.updateCue(cue.id, { start })} />
          <SubtitleTimeInput disabled={t.isGroupingPreview} label="End (s)" value={cue.end} min={cue.start + 0.001} max={t.duration || undefined} onCommit={end => t.updateCue(cue.id, { end })} />
        </div>
        {t.speakersEnabled && <SelectControl disabled={t.isGroupingPreview} value={cue.speaker || ""} onChange={speaker => t.updateCue(cue.id, { speaker: speaker || undefined })} options={[{ value: "", label: "Unassigned speaker" }, ...Object.entries(project.speakers).map(([value, label]) => ({ value, label }))]} />}
        {cue.timingEstimated && <small className="subtitle-timing-note">Estimated split timing</small>}
        <textarea readOnly={t.isGroupingPreview} aria-label={`Subtitle ${cue.id}`} value={cue.text} onChange={e => t.updateCue(cue.id, { text: e.target.value })} />
        <WordTimingEditor tools={t} cue={cue}/>
      </article>)}
    </div></fieldset>
  </div>;
}

export function SubtitleTimeline({ tools: t }: { tools: Transcription }) {
  if (!t.displayProject || !t.duration) return null;
  return <div className="subtitle-track" aria-label="Subtitle timeline">
    {t.displayProject.cues.map(cue => <button key={cue.id} type="button"
      className={t.activeCue?.id === cue.id ? "is-active" : ""}
      style={{ left: `${Math.min(100, cue.start / t.duration * 100)}%`, width: `${Math.max(0.3, Math.min(t.duration, cue.end - cue.start) / t.duration * 100)}%` }}
      title={`${subtitleTimestamp(cue.start)}: ${cue.text}`}
      aria-label={`Seek to subtitle: ${cue.text}`} onClick={() => t.seek(cue.start)}>{cue.text}</button>)}
  </div>;
}

function SubtitleTimeInput({ label, value, min, max, onCommit, disabled = false }: {
  disabled?: boolean; label: string; value: number; min: number; max?: number; onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState("");
  useEffect(() => { setDraft(String(value)); }, [value]);
  function commit() {
    const next = Number(draft);
    if (!draft.trim() || !Number.isFinite(next) || next < min || (max !== undefined && next > max)) {
      setDraft(String(value)); setError("Enter a time within this cue's valid range."); return;
    }
    setError(""); onCommit(Math.round(next * 1000) / 1000);
  }
  return <label>{label}<Input disabled={disabled} type="number" min={min} max={max} step="0.001" value={draft}
    aria-invalid={!!error} onChange={e => { setDraft(e.target.value); setError(""); }} onBlur={commit}
    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setDraft(String(value)); setError(""); } }} />
    {error && <small role="alert">{error}</small>}
  </label>;
}
