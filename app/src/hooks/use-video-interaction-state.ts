import { useRef, useState } from "react";
import type { VideoMetadata } from "@/hooks/use-video-media";

export function useVideoInteractionState() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanPlayLoggedRef = useRef(false);
  const selectionSeekInProgressRef = useRef(false);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const thumbnailGridRef = useRef<HTMLDivElement | null>(null);
  const [timelineHoverTime, setTimelineHoverTime] = useState<number | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [playSelectionOnly, setPlaySelectionOnly] = useState(true);
  const [loopPlayback, setLoopPlayback] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  return {
    videoRef,
    previewCanPlayLoggedRef,
    selectionSeekInProgressRef,
    timelineRef,
    thumbnailGridRef,
    timelineHoverTime,
    isVideoPlaying,
    isVideoMuted,
    playSelectionOnly,
    loopPlayback,
    trimStart,
    trimEnd,
    setTimelineHoverTime,
    setIsVideoPlaying,
    setIsVideoMuted,
    setPlaySelectionOnly,
    setLoopPlayback,
    setTrimStart,
    setTrimEnd,
  };
}

export function getVideoSelectionMetrics(
  metadata: VideoMetadata | null,
  trimStart: number,
  trimEnd: number,
  playSelectionOnly: boolean,
) {
  const duration = metadata?.duration ?? 0;
  const selectedDuration = Math.max(0, trimEnd - trimStart);
  const selectedFrames = metadata?.fps ? Math.round(selectedDuration * metadata.fps) : 0;
  const shouldPlaySelection = playSelectionOnly && duration > 0 && selectedDuration > 0.05 && selectedDuration < duration - 0.001;

  return {
    duration,
    selectedDuration,
    selectedFrames,
    shouldPlaySelection,
  };
}
