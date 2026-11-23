import type { SubtitleCue, SubtitleStyle } from './subtitles';
import { captionWords } from './caption-words';
export type ResolvedCaptionStyle = SubtitleStyle & {outlineColor:string;backgroundColor:string;bold:boolean;uppercase:boolean;padding:number;radius:number;backgroundMode:'caption'|'words'|'active-word';highlightColor:string;highlightTextColor:string};
export function drawCaption(canvas: HTMLCanvasElement, cue: SubtitleCue | undefined, time: number, style: ResolvedCaptionStyle, language='en') {
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Caption canvas is unavailable.');
  ctx.clearRect(0,0,canvas.width,canvas.height);if(!cue?.text.trim())return;
  const h=1080,w=canvas.width/canvas.height*h;
  ctx.save();ctx.scale(canvas.width/w,canvas.height/h);
  const words=captionWords(cue,language).words;
  const text=(v:string)=>style.uppercase?v.toLocaleUpperCase(language):v;
  let size=style.size;
  type Placed={text:string;index:number;width:number;x:number;y:number};
  let lines:Placed[][]=[];
  const layout=()=>{
    ctx.font=`${style.bold?'700':'400'} ${size}px "${style.font}"`;
    const gap=ctx.measureText(' ').width;
    lines=[[]];let width=0;
    words.forEach((word,index)=>{
      const wordText=text(word.text), wordWidth=ctx.measureText(wordText).width;
      const space=lines[lines.length-1].length && word.before && !word.before.includes('\n')?gap:0;
      if(lines[lines.length-1].length && (word.before.includes('\n')||width+space+wordWidth>w*.9-style.padding*2)){lines.push([]);width=0;}
      const line=lines[lines.length-1];const x=width+(line.length&&word.before?gap:0);
      line.push({text:wordText,index,width:wordWidth,x,y:0});width=x+wordWidth;
    });
  };
  for(let i=0;i<8;i++){layout();const widest=Math.max(...lines.map(l=>{const end=l[l.length-1];return end?end.x+end.width:0;}));const height=lines.length*size*1.35+style.padding*2;if(widest<=w*.9&&height<=h*.8)break;size*=Math.min(.9,w*.88/widest,h*.78/height);}
  const lineHeight=size*1.35;const blockHeight=lines.length*lineHeight;
  const top=style.position==='top'?100:style.position==='center'?(h-blockHeight)/2:h-100-blockHeight;
  const widths=lines.map(l=>{const end=l[l.length-1];return end?end.x+end.width:0;});
  const box=(x:number,y:number,width:number,height:number,color:string,opacity:number)=>{if(opacity<=0)return;ctx.save();ctx.globalAlpha=opacity/100;ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,width,height,Math.min(style.radius,width/2,height/2));ctx.fill();ctx.restore();};
  if(style.backgroundMode==='caption') {const width=Math.max(...widths);box((w-width)/2-style.padding,top-style.padding,width+style.padding*2,blockHeight+style.padding*2,style.backgroundColor,style.backgroundOpacity);}
  ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=style.outline*2;
  lines.forEach((line,row)=>line.forEach(word=>{
    const x=(w-widths[row])/2+word.x,y=top+row*lineHeight;
    const active=time>=words[word.index].start&&time<words[word.index].end;
    if(style.backgroundMode==='words')box(x-style.padding/2,y-style.padding/2,word.width+style.padding,lineHeight+style.padding,style.backgroundColor,style.backgroundOpacity);
    if(style.backgroundMode==='active-word'&&active)box(x-style.padding/2,y-style.padding/2,word.width+style.padding,lineHeight+style.padding,style.highlightColor,style.backgroundOpacity);
    const baseline=y+lineHeight/2;
    if(style.outline>0){ctx.strokeStyle=style.outlineColor;ctx.strokeText(word.text,x,baseline);}
    ctx.fillStyle=style.backgroundMode==='active-word'&&active?style.highlightTextColor:style.color;ctx.fillText(word.text,x,baseline);
  }));ctx.restore();
}
