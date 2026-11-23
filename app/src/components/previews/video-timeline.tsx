import type { CSSProperties, PointerEvent, PointerEventHandler, RefObject } from "react";

type Thumbnail = {
  time: number;
  data_url?: string;
  dataUrl?: string;
};

export function VideoTimeline({
  timelineRef,
  thumbnailGridRef,
  duration,
  visibleStart,
  visibleDuration,
  visibleEnd,
  hoverPercent,
  timelineHoverTime,
  currentPercent,
  trimStartPercent,
  trimEndPercent,
  thumbnails,
  waveformUrl,
  trimStart,
  trimEnd,
  selectedDuration,
  selectedFrames,
  onUpdateTimelineHover,
  onClearTimelineHover,
  onScrubTimeline,
  onStartTrimDrag,
  onUpdateTrimDrag,
  onStopTrimDrag,
  formatTime,
  imageSource,
}: {
  timelineRef: RefObject<HTMLDivElement | null>;
  thumbnailGridRef: RefObject<HTMLDivElement | null>;
  duration: number;
  visibleStart: number;
  visibleDuration: number;
  visibleEnd: number;
  hoverPercent: number | null;
  timelineHoverTime: number | null;
  currentPercent: number;
  trimStartPercent: number;
  trimEndPercent: number;
  thumbnails: Thumbnail[];
  waveformUrl: string | null;
  trimStart: number;
  trimEnd: number;
  selectedDuration: number;
  selectedFrames: number;
  onUpdateTimelineHover: PointerEventHandler<HTMLDivElement>;
  onClearTimelineHover: () => void;
  onScrubTimeline: PointerEventHandler<HTMLDivElement>;
  onStartTrimDrag: (kind: "start" | "end", event: PointerEvent<HTMLButtonElement>) => void;
  onUpdateTrimDrag: PointerEventHandler<HTMLButtonElement>;
  onStopTrimDrag: PointerEventHandler<HTMLButtonElement>;
  formatTime: (seconds: number) => string;
  imageSource: (item: Thumbnail) => string;
}) {
  return (
    <div className="timeline">
      <div className="timeline-ruler" onPointerMove={onUpdateTimelineHover} onPointerLeave={onClearTimelineHover} onPointerDown={onScrubTimeline}>
        <span>{formatTime(visibleStart)}</span>
        <span>{formatTime(visibleStart + visibleDuration / 4)}</span>
        <span>{formatTime(visibleStart + visibleDuration / 2)}</span>
        <span>{formatTime(visibleStart + (visibleDuration / 4) * 3)}</span>
        <span>{formatTime(visibleEnd)}</span>
        {hoverPercent !== null && (
          <div
            className="timeline-hover"
            style={{ "--hover-position": `${hoverPercent}%` } as CSSProperties}
          >
            {formatTime(timelineHoverTime ?? 0)}
          </div>
        )}
      </div>
      <div ref={timelineRef} className="thumbnail-strip" onPointerMove={onUpdateTimelineHover} onPointerLeave={onClearTimelineHover} onPointerDown={onScrubTimeline}>
        {duration > 0 && (
          <>
            <div className="selection-fill" style={{ left: `${trimStartPercent}%`, width: `${Math.max(0, trimEndPercent - trimStartPercent)}%` }} />
            <div className="playhead" style={{ left: `${currentPercent}%` }} />
            {hoverPercent !== null && <div className="hover-line" style={{ left: `${hoverPercent}%` }} />}
            <button
              className="trim-handle trim-handle-start"
              style={{ left: `${trimStartPercent}%` }}
              onPointerDown={(event) => onStartTrimDrag("start", event)}
              onPointerMove={onUpdateTrimDrag}
              onPointerUp={onStopTrimDrag}
              onPointerCancel={onStopTrimDrag}
              aria-label="Drag trim start" />
            <button
              className="trim-handle trim-handle-end"
              style={{ left: `${trimEndPercent}%` }}
              onPointerDown={(event) => onStartTrimDrag("end", event)}
              onPointerMove={onUpdateTrimDrag}
              onPointerUp={onStopTrimDrag}
              onPointerCancel={onStopTrimDrag}
              aria-label="Drag trim end" />
          </>
        )}
        <div ref={thumbnailGridRef} className="thumbnail-grid">
          {thumbnails.length ? (
            thumbnails.map((thumbnail, index) => (
              <div className="thumbnail-cell" key={`${thumbnail.time}-${index}`}>
                <img src={imageSource(thumbnail)} alt={`Thumbnail ${index + 1}`} />
              </div>
            ))
          ) : (
            <span>No thumbnails generated yet</span>
          )}
        </div>
        {waveformUrl && duration > 0 && visibleDuration > 0 && (
          <svg
            className="video-waveform-overlay"
            viewBox={`${(visibleStart / duration) * 1800} 0 ${(visibleDuration / duration) * 1800} 32`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Video audio waveform"
          >
            <image href={waveformUrl} width="1800" height="64" />
          </svg>
        )}
      </div>
      <div className="selection-summary">
        <span>Selection: {formatTime(trimStart)} - {formatTime(trimEnd)} ({formatTime(selectedDuration)})</span>
        <span>{selectedFrames ? `${selectedFrames.toLocaleString()} frames` : "No frames yet"}</span>
      </div>
    </div>
  );
}
