import { useCallback, useState, type Dispatch, type PointerEvent, type SetStateAction } from "react";

type UseVideoTrimInteractionArgs = {
  duration: number;
  trimStart: number;
  trimEnd: number;
  currentTime: number;
  previewStart: number;
  previewEnd: number;
  timelineTimeFromClientX: (clientX: number) => number;
  seek: (seconds: number) => void;
  setTrimStart: Dispatch<SetStateAction<number>>;
  setTrimEnd: Dispatch<SetStateAction<number>>;
  setPreviewStart: Dispatch<SetStateAction<number>>;
  setPreviewEnd: Dispatch<SetStateAction<number>>;
};

export function useVideoTrimInteraction({
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
}: UseVideoTrimInteractionArgs) {
  const [trimDrag, setTrimDrag] = useState<"start" | "end" | null>(null);

  const setStart = useCallback(
    (value: number) => {
      const start = Math.min(value, trimEnd);
      setTrimStart(start);
      if (currentTime < start) seek(start);
      if (previewEnd && start < previewStart) setPreviewStart(start);
    },
    [currentTime, previewEnd, previewStart, seek, setPreviewStart, setTrimStart, trimEnd],
  );

  const setEnd = useCallback(
    (value: number) => {
      const end = Math.max(value, trimStart);
      setTrimEnd(end);
      if (currentTime > end) seek(end);
      if (end > previewEnd) setPreviewEnd(end);
    },
    [currentTime, previewEnd, seek, setPreviewEnd, setTrimEnd, trimStart],
  );

  const startTrimDrag = useCallback((kind: "start" | "end", event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setTrimDrag(kind);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const updateTrimDrag = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (!trimDrag || !duration) return;
      const value = timelineTimeFromClientX(event.clientX);
      if (trimDrag === "start") {
        setStart(value);
      } else {
        setEnd(value);
      }
    },
    [duration, setEnd, setStart, timelineTimeFromClientX, trimDrag],
  );

  const stopTrimDrag = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (!trimDrag) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setTrimDrag(null);
    },
    [trimDrag],
  );

  return {
    setStart,
    setEnd,
    startTrimDrag,
    updateTrimDrag,
    stopTrimDrag,
  };
}
