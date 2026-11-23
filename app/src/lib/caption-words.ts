import type { SubtitleCue, TranscriptWord, TranscriptProject } from './subtitles';
export type CaptionWord = { text: string; before: string; start: number; end: number };
export function captionWords(cue: SubtitleCue, language = 'en'): { words: CaptionWord[]; estimated: boolean } {
  const tokens: {text:string;before:string}[] = [];
  type Segmenter = new (locale: string, options: {granularity: string}) => {segment(text:string): Iterable<{segment:string;isWordLike?:boolean}>};
  const Segment = (Intl as unknown as {Segmenter?: Segmenter}).Segmenter;
  if (/^(zh|ja|th)(-|$)/.test(language) && Segment) {
    let before='';for(const part of new Segment(language,{granularity:'word'}).segment(cue.text)) {
      if(part.isWordLike){tokens.push({text:part.segment,before});before='';}
      else if(part.segment.trim()&&tokens.length) tokens[tokens.length-1].text+=part.segment;
      else before+=part.segment;
    }
  } else {
    let end=0;for(const match of cue.text.matchAll(/\S+/gu)){tokens.push({text:match[0],before:cue.text.slice(end,match.index)});end=match.index!+match[0].length;}
  }
  const aligned=cue.words;
  const matches=aligned?.length===tokens.length && tokens.every((t,i)=>t.text===aligned[i].word.trim() &&
    Number.isFinite(aligned[i].start)&&Number.isFinite(aligned[i].end)&&aligned[i].end!>aligned[i].start!&&
    aligned[i].start!>=cue.start && aligned[i].end!<=cue.end && (i===0||aligned[i].start!>=aligned[i-1].end!));
  const total=tokens.reduce((n,t)=>n+Math.max(1,t.text.length),0);let elapsed=0;
  return {estimated:!matches || !!cue.wordTimingEstimated,words:tokens.map((t,i)=>{
    const start=matches?aligned![i].start!:cue.start+(cue.end-cue.start)*elapsed/total;
    elapsed+=Math.max(1,t.text.length);
    const end=matches?aligned![i].end!:cue.start+(cue.end-cue.start)*elapsed/total;
    return {...t,start,end};
  })};
}
export function transcriptWords(words: CaptionWord[], originals?: TranscriptWord[]): TranscriptWord[] {return words.map((w,i)=>({...(originals?.[i]?.word.trim()===w.text?originals[i]:{}),word:w.text,start:w.start,end:w.end}));}
export function captionIntervals(project: TranscriptProject, duration: number, wordMode: boolean) {
  const boundaries=new Set([0,duration]);
  for(const cue of project.cues){for(const time of [cue.start,cue.end,...(wordMode?captionWords(cue,project.language).words.flatMap(w=>[w.start,w.end]):[])]) if(time>0&&time<duration)boundaries.add(time);}
  const times=[...boundaries].sort((a,b)=>a-b);
  return times.slice(0,-1).map((start,i)=>({start,end:times[i+1]})).filter(s=>s.end>s.start);
}
