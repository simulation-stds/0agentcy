import { useCallback, type Dispatch, type MutableRefObject, type PointerEvent, type RefObject, type SetStateAction, type SyntheticEvent } from "react";
import { useVideoTrimInteraction } from "@/hooks/use-video-trim-interaction";

type UseVideoPlaybackArgs = {
  videoRef: RefObject<HTMLVideoElement | null>;
  selectionSeekInProgressRef: MutableRefObject<boolean>;
  duration: number;
  shouldPlaySelection: boolean;
  loopPlayback: boolean;
  trimStart: number;
  trimEnd: number;
  currentTime: number;
  previewStart: number;
  previewEnd: number;
  timelineTimeFromClientX: (clientX: number) => number;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  setIsVideoMuted: Dispatch<SetStateAction<boolean>>;
  setTimelineHoverTime: Dispatch<SetStateAction<number | null>>;
  setIsVideoPlaying: Dispatch<SetStateAction<boolean>>;
  setTrimStart: Dispatch<SetStateAction<number>>;
  setTrimEnd: Dispatch<SetStateAction<number>>;
  setPreviewStart: Dispatch<SetStateAction<number>>;
  setPreviewEnd: Dispatch<SetStateAction<number>>;
  appendLog: (message: string) => void;
};

export function useVideoPlayback({
  videoRef,
  selectionSeekInProgressRef,
  duration,
  shouldPlaySelection,
  loopPlayback,
  trimStart,
  trimEnd,
  currentTime,
  previewStart,
  previewEnd,
  timelineTimeFromClientX,
  setCurrentTime,
  setIsVideoMuted,
  setTimelineHoverTime,
  setIsVideoPlaying,
  setTrimStart,
  setTrimEnd,
  setPreviewStart,
  setPreviewEnd,
  appendLog,
}: UseVideoPlaybackArgs) {
  const seek = useCallback(
    (seconds: number) => {
      const clamped = Math.max(0, Math.min(seconds, duration));
      setCurrentTime(clamped);
      if (videoRef.current) {
        videoRef.current.currentTime = clamped;
      }
    },
    [duration, setCurrentTime, videoRef],
  );

  const seekAndWait = useCallback(
    async (seconds: number) => {
      const video = videoRef.current;
      const clamped = Math.max(0, Math.min(seconds, duration));
      setCurrentTime(clamped);
      if (!video) return;

      selectionSeekInProgressRef.current = true;
      await new Promise<void>((resolve) => {
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          video.removeEventListener("seeked", finish);
          resolve();
        };

        video.addEventListener("seeked", finish, { once: true });
        video.currentTime = clamped;
        window.setTimeout(finish, 350);
      });
      selectionSeekInProgressRef.current = false;
      setCurrentTime(video.currentTime);
    },
    [duration, selectionSeekInProgressRef, setCurrentTime, videoRef],
  );

  const togglePlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      if (shouldPlaySelection && (video.currentTime < trimStart || video.currentTime >= trimEnd - 0.05)) {
        await seekAndWait(trimStart);
      }
      try {
        await video.play();
      } catch (error) {
        appendLog(`Preview playback failed: ${String(error).trim()}`);
      }
      return;
    }

    video.pause();
  }, [appendLog, seekAndWait, shouldPlaySelection, trimEnd, trimStart, videoRef]);

  const toggleMute = useCallback(() => {
    setIsVideoMuted((value) => {
      const next = !value;
      if (videoRef.current) {
        videoRef.current.muted = next;
      }
      return next;
    });
  }, [setIsVideoMuted, videoRef]);

  const {
    setStart,
    setEnd,
    startTrimDrag,
    updateTrimDrag,
    stopTrimDrag,
  } = useVideoTrimInteraction({
    duration,
    trimStart,
    trimEnd,
    currentTime,
    previewStart,
    previewEnd,
    timelineTimeFromClientX,
    seek,
    setTrimStart,
    setTrimEnd,
    setPreviewStart,
    setPreviewEnd,
  });

  const updateTimelineHover = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!duration) return;
      setTimelineHoverTime(timelineTimeFromClientX(event.clientX));
    },
    [duration, setTimelineHoverTime, timelineTimeFromClientX],
  );

  const scrubTimeline = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!duration) return;
      const target = event.target as HTMLElement;
      if (target.closest(".trim-handle")) return;
      seek(timelineTimeFromClientX(event.clientX));
    },
    [duration, seek, timelineTimeFromClientX],
  );

  const handleVideoTimeUpdate = useCallback(
    (event: SyntheticEvent<HTMLVideoElement>) => {
      const nextTime = event.currentTarget.currentTime;
      if (selectionSeekInProgressRef.current) {
        setCurrentTime(nextTime);
        return;
      }
      if (shouldPlaySelection && nextTime >= trimEnd - 0.03) {
        if (loopPlayback) {
          event.currentTarget.currentTime = trimStart;
          setCurrentTime(trimStart);
          void event.currentTarget.play().catch((error) => {
            appendLog(`Preview playback failed: ${String(error).trim()}`);
          });
        } else {
          event.currentTarget.pause();
          event.currentTarget.currentTime = trimEnd;
          setCurrentTime(trimEnd);
          setIsVideoPlaying(false);
        }
        return;
      }
      setCurrentTime(nextTime);
    },
    [appendLog, loopPlayback, selectionSeekInProgressRef, setCurrentTime, setIsVideoPlaying, shouldPlaySelection, trimEnd, trimStart],
  );

  const reportVideoError = useCallback(() => {
    const error = videoRef.current?.error;
    const messages: Record<number, string> = {
      1: "loading aborted",
      2: "network or local asset access failed",
      3: "decode failed",
      4: "format or source not supported",
    };
    appendLog(`Preview video failed: ${messages[error?.code ?? 0] ?? "unknown media error"}.`);
  }, [appendLog, videoRef]);

  return {
    seek,
    togglePlayback,
    toggleMute,
    updateTimelineHover,
    scrubTimeline,
    startTrimDrag,
    updateTrimDrag,
    stopTrimDrag,
    handleVideoTimeUpdate,
    reportVideoError,
    setStart,
    setEnd,
  };
}
