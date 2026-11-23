export type VideoEffects = {
  enabled: boolean; dither: 'none'|'bayer'|'floyd_steinberg'|'sierra2_4a'|'blue_noise'; palette: 'mono'|'gray'|'gameboy'|'cga'|'rgb8'|'rgb64'|'rgb256'|'custom'; colorCount: number; customColors: string[]; noiseStrength: number; patternScale: number;
  brightness: number; contrast: number; saturation: number; monochrome: boolean; posterize: number;
  pixelSize: number; grain: number; scanlines: number; vignette: number; affectSubtitles: boolean;
};
export const defaultVideoEffects: VideoEffects = {enabled:false,colorCount:16,customColors:['#000000','#ffffff'],noiseStrength:1,dither:'none',palette:'rgb64',patternScale:2,brightness:0,contrast:1,saturation:1,monochrome:false,posterize:256,pixelSize:1,grain:0,scanlines:0,vignette:0,affectSubtitles:false};
export function validVideoEffects(value: unknown): value is VideoEffects {
  if(!value||typeof value!=='object')return false;const v=value as VideoEffects;
  const range=(n:number,min:number,max:number)=>Number.isFinite(n)&&n>=min&&n<=max;
  return [v.enabled,v.monochrome,v.affectSubtitles].every(x=>typeof x==='boolean')&&['none','bayer','floyd_steinberg','sierra2_4a','blue_noise'].includes(v.dither)&&['mono','gray','gameboy','cga','rgb8','rgb64','rgb256','custom'].includes(v.palette)&&Number.isInteger(v.colorCount)&&range(v.colorCount,2,256)&&Array.isArray(v.customColors)&&v.customColors.length>=2&&v.customColors.length<=32&&v.customColors.every(c=>/^#[0-9a-f]{6}$/i.test(c))&&range(v.noiseStrength,0,2)&&Number.isInteger(v.patternScale)&&range(v.patternScale,0,5)&&range(v.brightness,-1,1)&&range(v.contrast,0,3)&&range(v.saturation,0,3)&&Number.isInteger(v.posterize)&&range(v.posterize,2,256)&&Number.isInteger(v.pixelSize)&&range(v.pixelSize,1,32)&&range(v.grain,0,50)&&range(v.scanlines,0,1)&&range(v.vignette,0,1);
}
