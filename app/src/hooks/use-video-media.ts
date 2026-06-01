import { useState, type DragEvent, type MutableRefObject, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { defaultPath } from "@/lib/app-options";
import { formatTime } from "@/lib/media-utils";

export type VideoMetadata = {
  duration: number;
  fps: number;
  width: number;
  height: number;
  codec: string;
};

export type Thumbnail = {
  time: number;
  data_url?: string;
  dataUrl?: string;
};

type UseVideoMediaArgs = {
  videoRef: RefObject<HTMLVideoElement | null>;
  previewCanPlayLoggedRef: MutableRefObject<boolean>;
  appendLog: (message: string) => void;
  resetJobProgress: () => void;
  setTimelineHoverTime: (value: number | null) => void;
  setIsVideoPlaying: (value: boolean) => void;
  setTrimStart: (value: number) => void;
  setTrimEnd: (value: number) => void;
};

export function useVideoMedia({
  videoRef,
  previewCanPlayLoggedRef,
  appendLog,
  resetJobProgress,
  setTimelineHoverTime,
  setIsVideoPlaying,
  setTrimStart,
  setTrimEnd,
}: UseVideoMediaArgs) {
  const [inputPath, setInputPath] = useState(defaultPath);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  const [previewStart, setPreviewStart] = useState(0);
  const [previewEnd, setPreviewEnd] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  async function loadVideo(pathOverride?: string) {
    const path = (pathOverride ?? inputPath).trim();
    if (!path) return;

    setInputPath(path);
    setIsLoading(true);
    setThumbnails([]);
    setCurrentTime(0);
    setTimelineHoverTime(null);
    setIsVideoPlaying(false);
    resetJobProgress();
    previewCanPlayLoggedRef.current = false;
    appendLog(`Loading ${path}`);

    try {
      const info = await invoke<VideoMetadata>("probe_video", { path });
      setMetadata(info);
      setTrimStart(0);
      setTrimEnd(info.duration);
      setPreviewStart(0);
      setPreviewEnd(info.duration);
      appendLog(`Detected ${info.width}x${info.height}, ${info.codec}, ${info.fps.toFixed(3)} fps.`);

      const thumbs = await invoke<Thumbnail[]>("generate_thumbnails", {
        path,
        duration: info.duration,
        count: 12,
        start: 0,
        end: info.duration,
      });
      setThumbnails(thumbs);
      appendLog(thumbs.length ? `Generated ${thumbs.length} thumbnails.` : "No thumbnails were generated for this file.");
      videoRef.current?.load();
    } catch (error) {
      appendLog(`Load failed: ${String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPreviewRange(start: number, end: number) {
    const path = inputPath.trim();
    if (!metadata || !path) return;

    const nextStart = Math.max(0, Math.min(start, metadata.duration));
    const nextEnd = Math.max(nextStart, Math.min(end, metadata.duration));
    setIsLoading(true);
    setThumbnails([]);
    appendLog(
      nextStart > 0 || nextEnd < metadata.duration
        ? `Fitting preview to ${formatTime(nextStart)} - ${formatTime(nextEnd)}.`
        : "Restoring full preview.",
    );

    try {
      const thumbs = await invoke<Thumbnail[]>("generate_thumbnails", {
        path,
        duration: metadata.duration,
        count: 12,
        start: nextStart,
        end: nextEnd,
      });
      setPreviewStart(nextStart);
      setPreviewEnd(nextEnd);
      setThumbnails(thumbs);
      appendLog(thumbs.length ? `Generated ${thumbs.length} preview thumbnails.` : "No thumbnails were generated for this range.");
      setCurrentTime(nextStart);
      if (videoRef.current) {
        videoRef.current.currentTime = nextStart;
      }
    } catch (error) {
      appendLog(`Preview fit failed: ${String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function chooseInputVideo() {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Video",
          extensions: ["mp4", "mov", "mkv", "webm", "avi", "m4v"],
        },
      ],
    });

    if (typeof selected === "string") {
      await loadVideo(selected);
    }
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0] as (File & { path?: string }) | undefined;
    if (!file) return;

    if (file.path) {
      await loadVideo(file.path);
    } else {
      appendLog("Dropped file path was not available. Use Browse Video instead.");
    }
  }

  return {
    inputPath,
    metadata,
    thumbnails,
    previewStart,
    previewEnd,
    currentTime,
    isLoading,
    setInputPath,
    setPreviewStart,
    setPreviewEnd,
    setCurrentTime,
    setIsLoading,
    loadVideo,
    loadPreviewRange,
    chooseInputVideo,
    handleDrop,
  };
}
