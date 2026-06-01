import { useCallback, type RefObject } from "react";

type UseVideoTimelineArgs = {
  duration: number;
  previewStart: number;
  previewEnd: number;
  selectedDuration: number;
  trimStart: number;
  trimEnd: number;
  currentTime: number;
  timelineHoverTime: number | null;
  timelineRef: RefObject<HTMLDivElement | null>;
  thumbnailGridRef: RefObject<HTMLDivElement | null>;
};

export function useVideoTimeline({
  duration,
  previewStart,
  previewEnd,
  selectedDuration,
  trimStart,
  trimEnd,
  currentTime,
  timelineHoverTime,
  timelineRef,
  thumbnailGridRef,
}: UseVideoTimelineArgs) {
  const visibleStart = Math.max(0, Math.min(previewStart, duration));
  const visibleEnd = Math.max(visibleStart, Math.min(previewEnd || duration, duration));
  const visibleDuration = Math.max(0, visibleEnd - visibleStart);
  const isPreviewFitted = duration > 0 && (Math.abs(visibleStart) > 0.001 || Math.abs(visibleEnd - duration) > 0.001);
  const canFitSelection =
    duration > 0 &&
    selectedDuration > 0.05 &&
    (!isPreviewFitted || Math.abs(visibleStart - trimStart) > 0.001 || Math.abs(visibleEnd - trimEnd) > 0.001);
  const currentPercent = visibleDuration ? Math.min(100, Math.max(0, ((currentTime - visibleStart) / visibleDuration) * 100)) : 0;
  const trimStartPercent = visibleDuration ? Math.min(100, Math.max(0, ((trimStart - visibleStart) / visibleDuration) * 100)) : 0;
  const trimEndPercent = visibleDuration ? Math.min(100, Math.max(0, ((trimEnd - visibleStart) / visibleDuration) * 100)) : 100;
  const hoverPercent = visibleDuration && timelineHoverTime !== null ? Math.min(100, Math.max(0, ((timelineHoverTime - visibleStart) / visibleDuration) * 100)) : null;

  const timelineTimeFromClientX = useCallback(
    (clientX: number) => {
      const bounds = thumbnailGridRef.current?.getBoundingClientRect() ?? timelineRef.current?.getBoundingClientRect();
      if (!bounds) return 0;
      const ratio = bounds.width ? (clientX - bounds.left) / bounds.width : 0;
      return Math.max(visibleStart, Math.min(visibleEnd, visibleStart + ratio * visibleDuration));
    },
    [thumbnailGridRef, timelineRef, visibleDuration, visibleEnd, visibleStart],
  );

  return {
    visibleStart,
    visibleEnd,
    visibleDuration,
    isPreviewFitted,
    canFitSelection,
    currentPercent,
    trimStartPercent,
    trimEndPercent,
    hoverPercent,
    timelineTimeFromClientX,
  };
}
