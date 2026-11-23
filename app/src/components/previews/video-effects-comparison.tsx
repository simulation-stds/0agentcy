import { useEffect, useRef, useState, type RefObject, type PointerEvent } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Columns2 } from 'lucide-react';
import type { Transcription } from '@/hooks/use-transcription';
import { drawCaption } from '@/lib/caption-renderer';
import { resolvedSubtitleStyle } from '@/lib/subtitles';
import { formatTime } from '@/lib/media-utils';
type Frame = {original:string;effected:string;time:number;key:string};
export function VideoEffectsComparison({tools:t,videoRef}:{tools:Transcription;videoRef:RefObject<HTMLVideoElement|null>}) {
 const fx=t.videoEffects,view=useRef<HTMLDivElement>(null),request=useRef(0);
 const [split,setSplit]=useState(50),[playing,setPlaying]=useState(false),[frame,setFrame]=useState<Frame>(),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const latest=useRef(t);latest.current=t;
 const enabled=fx.settings.enabled;
 const playhead=videoRef.current?.currentTime??t.currentTime;
 const key=JSON.stringify([t.source,t.frame,fx.settings,fx.includeCaptions,t.displayProject?.cues,t.displayProject?.subtitleStyle,t.fontLibrary.revision]);
 useEffect(()=>{
  const media=videoRef.current;if(!media)return;
  const update=()=>setPlaying(!media.paused);update();media.addEventListener('play',update);media.addEventListener('pause',update);media.addEventListener('ended',update);
  return()=>{media.removeEventListener('play',update);media.removeEventListener('pause',update);media.removeEventListener('ended',update);};
 },[videoRef,t.source]);
 useEffect(()=>{
  const id=++request.current;setLoading(false);setError('');
  if(!isTauri())return;
  void invoke('cancel_video_effect_preview').catch(()=>{});
  if(!enabled||playing||!t.frame||!t.duration||t.busy||t.blocked)return;
  const timer=setTimeout(()=>{void(async()=>{
   const current=latest.current;const time=Math.max(0,Math.min(videoRef.current?.currentTime??current.currentTime,current.duration-.05));
   setLoading(true);
   try {
    let caption:string|undefined;
    if(current.videoEffects.includeCaptions&&current.displayProject){
     const style=resolvedSubtitleStyle(current.displayProject.subtitleStyle);await current.fontLibrary.ensureFont(style.font);
     if(id!==request.current)return;
     const canvas=document.createElement('canvas');canvas.width=current.frame!.width;canvas.height=current.frame!.height;
     drawCaption(canvas,current.displayProject.cues.find(c=>time>=c.start&&time<c.end),time,style,current.displayProject.language);caption=canvas.toDataURL('image/png').split(',')[1];
    }
    if(id!==request.current)return;
    const result=await invoke<Omit<Frame,'key'>>('preview_video_effects',{options:{source:current.source,time,...current.frame,effects:current.videoEffects.settings,caption}});
    if(id===request.current)setFrame({...result,key});
   }catch(failure){if(id===request.current)setError(String(failure));}finally{if(id===request.current)setLoading(false);}
  })();},350);
  return()=>{clearTimeout(timer);++request.current;void invoke('cancel_video_effect_preview').catch(()=>{});};
 },[enabled,playing,key,playhead,t.busy,t.blocked,t.duration]);
 function move(event:PointerEvent<HTMLDivElement>){const bounds=view.current?.getBoundingClientRect();if(bounds&&bounds.width)setSplit(Math.max(0,Math.min(100,(event.clientX-bounds.left)/bounds.width*100)));}
 const valid=frame?.key===key&&Math.abs(frame.time-Math.max(0,Math.min(playhead,t.duration-.05)))<.002;
 if(!enabled||playing||!t.frame||!t.duration)return null;
 if(!valid)return <div className="video-effect-preview-status" role={error?'alert':'status'}>{error?`Effect preview failed: ${error}`:loading?(fx.settings.palette==='custom'?'Analyzing source colors / rendering effects…':'Rendering effects…'):'Preparing paused-frame preview…'}</div>;
 return <div ref={view} className="video-rendered-compare" aria-label="Rendered video effects preview" onPointerDown={event=>{if(!fx.showComparison)return;event.currentTarget.setPointerCapture(event.pointerId);move(event);}} onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))move(event);}} onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}} onPointerCancel={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}>
  <img src={`data:image/png;base64,${fx.showComparison?frame.original:frame.effected}`} alt={fx.showComparison?'Original frame':'Effected frame'} draggable={false}/>
  {fx.showComparison&&<><div className="compare-overlay" style={{clipPath:`inset(0 0 0 ${split}%)`}}><img src={`data:image/png;base64,${frame.effected}`} alt="Effected frame" draggable={false}/></div><div className="compare-divider" style={{left:`${split}%`}} role="slider" aria-label="Comparison divider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split)} tabIndex={0} onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setSplit(value=>Math.max(0,Math.min(100,value+(event.key==='ArrowLeft'?-1:1))));}}}><Columns2 className="app-icon"/></div><span className="compare-label compare-label-left">Original</span><span className="compare-label compare-label-right">Effects</span></>}
  <span className="video-effect-frame-time">Paused frame · {formatTime(frame.time)}</span>
 </div>;
}
