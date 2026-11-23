import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import type { Transcription } from '@/hooks/use-transcription';
import { FormRow, SecondaryButton, SelectControl, SwitchRow } from '@/components/app-controls';
function EffectRange({label,value,min,max,step=1,onChange}:{label:string;value:number;min:number;max:number;step?:number;onChange:(value:number)=>void}) {
  return <label className="video-effect-range"><span>{label}<output>{Math.round(value*100)/100}</output></span><input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={event=>onChange(Number(event.target.value))}/></label>;
}
function ColorCount({value,onChange}:{value:number;onChange:(value:number)=>void}) {
  const [draft,setDraft]=useState(String(value));useEffect(()=>setDraft(String(value)),[value]);
  const count=Number(draft),valid=draft.trim()!==''&&Number.isInteger(count)&&count>=2&&count<=256;
  return <Input type="number" aria-label="Number of colors" min={2} max={256} step={1} value={draft} aria-invalid={!valid} onChange={event=>{const text=event.target.value;setDraft(text);const count=Number(text);if(text.trim()&&Number.isInteger(count)&&count>=2&&count<=256)onChange(count);}} onBlur={()=>setDraft(String(value))}/>;
}
export function VideoEffectsControls({tools:t}:{tools:Transcription}) {
  const fx=t.videoEffects,s=fx.settings;
  return <section className="panel video-effects-controls"><h2>Video effects</h2>
    <fieldset disabled={t.busy||t.blocked} className="video-effect-fields">

      {s.enabled&&<>
        <details open><summary>Dithering</summary>
          <FormRow label="Algorithm"><SelectControl value={s.dither} onChange={dither=>fx.update({dither:dither as typeof s.dither})} options={[{value:'none',label:'Off'},{value:'bayer',label:'Ordered Bayer'},{value:'floyd_steinberg',label:'Floyd–Steinberg'},{value:'sierra2_4a',label:'Sierra Lite'},{value:'blue_noise',label:'Blue Noise Dithering'}]}/></FormRow>
          {s.dither!=='none'&&<><FormRow label="Palette"><SelectControl value={s.palette} onChange={palette=>fx.update({palette:palette as typeof s.palette})} options={[{value:'mono',label:'Black & white'},{value:'gray',label:'16 grayscale colors'},{value:'gameboy',label:'Game Boy · 4 colors'},{value:'cga',label:'CGA · 16 colors'},{value:'rgb8',label:'RGB · 8 colors'},{value:'rgb64',label:'RGB · 64 colors'},{value:'rgb256',label:'RGB · 256 colors'},{value:'custom',label:'Custom color count (source colors)'}]}/></FormRow>
          {s.palette==='custom'&&<FormRow label="Number of colors" help="Uses up to this many colors extracted from the full video. One shared palette is used for preview and export."><ColorCount value={s.colorCount} onChange={colorCount=>fx.update({colorCount})}/></FormRow>}
          {s.dither==='blue_noise'&&<EffectRange label="Blue-noise strength" value={s.noiseStrength} min={0} max={2} step={.05} onChange={noiseStrength=>fx.update({noiseStrength})}/>}
          {s.dither==='bayer' &&<EffectRange label="Dither pattern strength" value={s.patternScale} min={0} max={5} onChange={patternScale=>fx.update({patternScale})}/>}</>}
        </details>
        <details><summary>Color</summary>
          <EffectRange label="Brightness" value={s.brightness} min={-1} max={1} step={.01} onChange={brightness=>fx.update({brightness})}/>
          <EffectRange label="Contrast" value={s.contrast} min={0} max={3} step={.01} onChange={contrast=>fx.update({contrast})}/>
          <EffectRange label="Saturation" value={s.saturation} min={0} max={3} step={.01} onChange={saturation=>fx.update({saturation})}/>
          <SwitchRow checked={s.monochrome} onCheckedChange={monochrome=>fx.update({monochrome})}>Monochrome</SwitchRow>
          <FormRow label="Posterization"><SelectControl value={String(s.posterize)} onChange={value=>fx.update({posterize:Number(value)})} options={[256,64,32,16,8,4,2].map(value=>({value:String(value),label:value===256?'Off':`${value} levels per channel`}))}/></FormRow>
        </details>
        <details><summary>Texture</summary>
          <EffectRange label="Pixel size" value={s.pixelSize} min={1} max={32} onChange={pixelSize=>fx.update({pixelSize})}/>
          <EffectRange label="Grain" value={s.grain} min={0} max={50} onChange={grain=>fx.update({grain})}/>
          <EffectRange label="Scanline strength" value={s.scanlines} min={0} max={1} step={.01} onChange={scanlines=>fx.update({scanlines})}/>
          <EffectRange label="Vignette" value={s.vignette} min={0} max={1} step={.01} onChange={vignette=>fx.update({vignette})}/>
        </details>
        <SwitchRow checked={s.affectSubtitles} onCheckedChange={affectSubtitles=>fx.update({affectSubtitles})}>Apply effects to subtitles too</SwitchRow>
        <small>{s.affectSubtitles?'Effects are applied to the complete composition.':'Effects are applied before subtitles, keeping captions clear.'}</small>
        {t.project&&<SwitchRow checked={fx.includeCaptions} onCheckedChange={fx.setIncludeCaptions}>Include subtitles in comparison and MP4</SwitchRow>}
        <SwitchRow checked={fx.showComparison} onCheckedChange={fx.setShowComparison}>Compare original</SwitchRow>
        <SwitchRow checked={fx.selectionOnly} onCheckedChange={fx.setSelectionOnly}>Export selection only</SwitchRow>
        <SecondaryButton disabled={!t.frame||!t.duration||t.isGroupingPreview} onClick={()=>void t.exportVideo(undefined,false,fx.includeCaptions,fx.selectionOnly)}>Export effects MP4</SecondaryButton>
        <small>Pause or seek to preview effects on the current frame. Playback shows the original video; MP4 export includes the effects.</small>
      </>}
      <SecondaryButton onClick={fx.reset}>Reset video effects</SecondaryButton>
    </fieldset>
    {!t.frame&&<small>Load a video to compare or export effects.</small>}
    {!t.captionExport.running&&t.captionExport.progress===1&&<small role="status">{t.captionExport.message}</small>}
    {t.captionExport.running&&<div role="status"><progress aria-label="Video effects export progress" max={1} value={t.captionExport.progress}/><p>{t.captionExport.message}</p><SecondaryButton onClick={()=>void t.cancel()}>Cancel effects export</SecondaryButton></div>}
    {t.error&&s.enabled&&<p className="transcription-error" role="alert">{t.error}</p>}
  </section>;
}
