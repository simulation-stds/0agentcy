import type { CSSProperties, PointerEventHandler } from "react";
import { formatTime } from "@/lib/media-utils";

export function AudioTimeRuler({ start, end, hoverTime, onPointerMove, onPointerLeave, onPointerDown }: {
  start: number;
  end: number;
  hoverTime: number | null;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerLeave: PointerEventHandler<HTMLDivElement>;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
}) {
  const span = end - start;
  const hoverPercent = hoverTime === null || span <= 0
    ? null
    : 100 * Math.max(0, Math.min(1, (hoverTime - start) / span));

  return (
    <div className="timeline-ruler" onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave} onPointerDown={onPointerDown}>
      {[0, 1, 2, 3, 4].map((tick) => (
        <span key={tick}>{formatTime(start + span * tick / 4)}</span>
      ))}
      {hoverPercent !== null && (
        <div className="timeline-hover" style={{ "--hover-position": `${hoverPercent}%` } as CSSProperties}>
          {formatTime(hoverTime ?? 0)}
        </div>
      )}
    </div>
  );
}
