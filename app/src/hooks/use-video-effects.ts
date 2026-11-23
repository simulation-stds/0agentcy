import { useState } from 'react';
import { defaultVideoEffects, type VideoEffects } from '@/lib/video-effects';
export function useVideoEffects(source:string) {
 const [documents,setDocuments]=useState<Record<string,VideoEffects>>({});
 const [showComparison,setShowComparison]=useState(true),[includeCaptions,setIncludeCaptions]=useState(true),[selectionOnly,setSelectionOnly]=useState(false);
 return {settings:{...defaultVideoEffects,...documents[source]},showComparison,setShowComparison,includeCaptions,setIncludeCaptions,selectionOnly,setSelectionOnly,
  update:(patch:Partial<VideoEffects>)=>setDocuments(previous=>({...previous,[source]:{...(previous[source]??defaultVideoEffects),...patch}})),
  reset:()=>setDocuments(previous=>({...previous,[source]:{...defaultVideoEffects,enabled:true,customColors:[...defaultVideoEffects.customColors]}}))};
}
