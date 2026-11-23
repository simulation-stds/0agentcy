import type { VideoEffects } from "@/lib/video-effects";
import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { captionIntervals } from '@/lib/caption-words';
import { drawCaption } from '@/lib/caption-renderer';
import { resolvedSubtitleStyle, type TranscriptProject } from '@/lib/subtitles';
export function useCaptionExport() {
  const [running,setRunning]=useState(false);const [progress,setProgress]=useState(0);const [message,setMessage]=useState('');
  const active=useRef(false),cancelled=useRef(false),session=useRef<string | undefined>(undefined);
  useEffect(()=>{if(!isTauri())return;const off=listen<{progress:number;message:string}>('caption-export-progress',({payload})=>{if(active.current){setProgress(.35+payload.progress*.65);setMessage(payload.message);}});return()=>{void off.then(f=>f()).catch(()=>{});};},[]);
  async function cancel(){cancelled.current=true;if(session.current)await invoke('cancel_caption_export',{id:session.current});}
  async function run(project:TranscriptProject,frame:{width:number;height:number},duration:number,path:string,ensureFont:(font:string)=>Promise<void>,sidecar?:{extension:string;text:string}, options?:{effects:VideoEffects;start:number;end:number}){
    if(active.current)throw new Error('A caption export is already running.');active.current=true;cancelled.current=false;setRunning(true);setProgress(0);setMessage('Preparing captions');
    try{
      const style=resolvedSubtitleStyle(project.subtitleStyle);if(project.cues.length)await ensureFont(style.font);if(cancelled.current)throw new Error('Caption export cancelled.');
      const id=await invoke<string>('begin_caption_export',{options:{source:project.source,path,width:frame.width,height:frame.height,duration:options ? options.end-options.start : duration,sidecar,effects:options?.effects,start:options?.start??0}});session.current=id;
      const canvas=document.createElement('canvas');canvas.width=frame.width;canvas.height=frame.height;
      const intervals=captionIntervals(project,duration,style.backgroundMode==='active-word').map(range=>({start:Math.max(range.start,options?.start??0),end:Math.min(range.end,options?.end??duration)})).filter(range=>range.end>range.start);
      for(let i=0;i<intervals.length;i++){
        if(cancelled.current)throw new Error('Caption export cancelled.');
        const range=intervals[i],time=(range.start+range.end)/2,cue=project.cues.find(c=>time>=c.start&&time<c.end);
        drawCaption(canvas,cue,time,style,project.language);
        const png=canvas.toDataURL('image/png').split(',')[1];if(!png)throw new Error('Could not draw caption frame.');
        await invoke('append_caption_frame',{id,png,duration:range.end-range.start});
        setProgress(.35*(i+1)/intervals.length);setMessage(`Preparing captions · ${i+1} / ${intervals.length}`);
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(cancelled.current)throw new Error('Caption export cancelled.');setMessage('Encoding MP4');await invoke('finish_caption_export',{id});session.current=undefined;setProgress(1);setMessage('MP4 saved');
    }finally{if(session.current){await invoke('cancel_caption_export',{id:session.current}).catch(()=>{});session.current=undefined;}active.current=false;setRunning(false);}
  }
  return {running,progress,message,run,cancel,isRunning:()=>active.current};
}
