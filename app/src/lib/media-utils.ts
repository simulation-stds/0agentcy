import { convertFileSrc } from "@tauri-apps/api/core";

type ProgressLike = {
  stage: string;
  message: string;
};

type ImageSourceLike = {
  dataUrl?: string;
  data_url?: string;
};

export function formatTime(seconds: number) {
  const totalMilliseconds = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds * 1000)) : 0;
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const remainder = Math.floor(totalMilliseconds / 1000) % 60;
  const milliseconds = totalMilliseconds % 1000;
  return `${minutes}:${String(remainder).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

export function baseName(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const file = normalized.split("/").pop() || "output";
  return file.replace(/\.[^.]+$/, "") || "output";
}

export function fileName(path: string) {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() || path || "";
}

export function outputExtension(action: string, audioFormat: string) {
  if (action === "extract_frame" || action === "contact_sheet") return ".png";
  if (action === "video_audio") return audioFormat === "wav" ? ".wav" : ".mp3";
  return ".mp4";
}

export function outputSuffix(action: string, audioFormat: string) {
  if (action === "extract_frame") return "frame";
  if (action === "contact_sheet") return "contact_sheet";
  if (action === "video_audio") return audioFormat;
  if (action === "social_export") return "social";
  if (action === "rife_interpolate") return "rife_2x";
  if (action === "facefusion") return "facefusion";
  return "trimmed";
}

export function socialExtension(format: string) {
  if (format === "gif") return ".gif";
  if (format === "webp") return ".webp";
  if (format === "apng") return ".apng";
  return ".mp4";
}

export function formatProgressEvent(event: ProgressLike) {
  if (event.stage === "Upscale frames" && /^Upscaling frame: \d+$/.test(event.message)) {
    return event.message;
  }
  return `${event.stage}: ${event.message}`;
}

export function imageSource(item: ImageSourceLike) {
  return item.dataUrl || item.data_url || "";
}

export function localAssetSrc(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return "";
  try {
    return convertFileSrc(trimmed);
  } catch {
    return "";
  }
}

export function getPreviewRangeState(duration: number, visibleStart: number, visibleEnd: number, trimStart: number, trimEnd: number) {
  const isPreviewFitted = duration > 0 && (Math.abs(visibleStart) > 0.001 || Math.abs(visibleEnd - duration) > 0.001);
  const canFitSelection = duration > 0 && trimEnd - trimStart > 0.05 &&
    (!isPreviewFitted || Math.abs(visibleStart - trimStart) > 0.001 || Math.abs(visibleEnd - trimEnd) > 0.001);
  return { isPreviewFitted, canFitSelection };
}
