import { useCallback, type RefObject } from "react";
import { getPreviewRangeState } from "@/lib/media-utils";

type UseVideoTimelineArgs = {
  duration: number;
  previewStart: number;
  previewEnd: number;
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
  const { isPreviewFitted, canFitSelection } = getPreviewRangeState(duration, visibleStart, visibleEnd, trimStart, trimEnd);
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
