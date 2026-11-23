import type { ToolKey } from "@/hooks/use-tool-state";

export function actionTools(category: string, action: string, hasVideo: boolean, format = ""): ToolKey[] {
  if (category === "audio") return ["ffmpeg", "ffprobe"];
  if (category === "video") {
    const selected: Record<string, ToolKey[]> = {
      realesrgan_upscale: ["realesrgan", "devices"], rife_interpolate: ["rife", "devices"],
      facefusion: ["facefusion"], wan21_generate: ["wan21"], wan22_generate: ["wan22"],
    };
    return [...(hasVideo ? ["ffmpeg", "ffprobe"] as ToolKey[] : []), ...(selected[action] || [])];
  }
  if (action === "vosr") return ["vosr"];
  if (action === "flux2") return ["flux2"];
  if (action === "compress") {
    const codecs: Record<string, ToolKey> = { png: "oxipng", avif: "libavif", webp: "libwebp", jpg: "mozjpeg", jpeg: "mozjpeg" };
    return ["imagemagick", ...(codecs[format] ? [codecs[format]] : [])];
  }
  return [];
}

export function settingsTools(tab: string, subtab: string): ToolKey[] {
  if (tab === "general") return subtab === "devices" ? ["devices"] : [];
  if (tab === "must") {
    if (subtab === "environments") return ["git", "conda", "windowsDeveloperMode"];
    if (subtab === "gpu") return ["devices", "cudnn", "facefusion"];
    return ["ffmpeg", "ffprobe", "imagemagick"];
  }
  if (tab === "video") return subtab === "generative" ? ["facefusion", "wan21", "wan22"] : ["realesrgan", "rife"];
  if (tab === "image") return subtab === "generative" ? ["flux2"] : ["vosr", "oxipng", "libavif", "libwebp", "mozjpeg"];
  return [];
}
