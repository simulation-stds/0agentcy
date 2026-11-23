import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { subtitleFonts } from '@/lib/subtitles';
export type LocalSubtitleFont = {id:string;family:string;license:string;systemInstalled?:boolean;files:{file:string;weight:number;unicodeRange?:string}[]};
export type CatalogueFont = {id:string;family:string;category:string;subsets:string[]};
export function useSubtitleFonts() {
  const [fonts,setFonts]=useState<LocalSubtitleFont[]>([]);
  const latest=useRef(fonts);latest.current=fonts;
  const [error,setError]=useState('');const [working,setWorking]=useState(false);const [revision,setRevision]=useState(0);
  const faces=useRef(new Map<string,FontFace[]>());const loading=useRef(new Map<string,Promise<void>>());
  const load=useCallback(async(font:LocalSubtitleFont)=>{
    if(faces.current.has(font.id))return;
    let pending=loading.current.get(font.id);if(!pending){pending=(async()=>{
      const loaded=await Promise.all(font.files.map(async file=>{
        const encoded=await invoke<string>('read_subtitle_font',{id:font.id,file:file.file});
        const face=new FontFace(font.family,`url(data:font/woff2;base64,${encoded})`,{weight:String(file.weight),...(file.unicodeRange?{unicodeRange:file.unicodeRange}:{})});
        await face.load();return face;
      }));loaded.forEach(face=>document.fonts.add(face));faces.current.set(font.id,loaded);setRevision(n=>n+1);
    })().finally(()=>loading.current.delete(font.id));loading.current.set(font.id,pending);}await pending;
  },[]);
  const refresh=useCallback(async()=>{if(!isTauri())return;try{const result=await invoke<LocalSubtitleFont[]>('list_subtitle_fonts');setFonts(result);latest.current=result;await Promise.all(result.map(load));setError('');}catch(e){setError(String(e));}},[load]);
  useEffect(()=>{void refresh();},[refresh]);
  const ensureFont=useCallback(async(family:string)=>{const font=latest.current.find(f=>f.family===family);if(font)await load(font);else if(!(subtitleFonts as readonly string[]).includes(family))throw new Error(`Download or import “${family}” in Settings → Fonts before exporting.`);await document.fonts.ready;},[load]);
  async function action(task:()=>Promise<void>){setWorking(true);setError('');try{await task();await refresh();}catch(e){await refresh();setError(String(e));}finally{setWorking(false);}}
  return {fonts,error,working,revision,refresh,ensureFont,
    install:async(id:string)=>action(async()=>{if(latest.current.some(font=>font.id===id))await invoke('install_subtitle_font_system',{id});else await invoke('install_subtitle_font',{id});}),
    installSystem:async(id:string)=>action(async()=>{await invoke('install_subtitle_font_system',{id});}),
    remove:async(id:string)=>action(async()=>{await invoke('remove_subtitle_font',{id});faces.current.get(id)?.forEach(face=>document.fonts.delete(face));faces.current.delete(id);setRevision(n=>n+1);}),
    importFont:async(family:string)=>action(async()=>{const path=await open({multiple:false,filters:[{name:'Font',extensions:['ttf','otf']}]});if(typeof path==='string')await invoke('import_subtitle_font',{path,family:family.trim()});}),
  };
}
