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
  const safe = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
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
  if (action === "extract_frame") return ".png";
  if (action === "video_audio") return audioFormat === "wav" ? ".wav" : ".mp3";
  return ".mp4";
}

export function outputSuffix(action: string, audioFormat: string) {
  if (action === "extract_frame") return "frame";
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
