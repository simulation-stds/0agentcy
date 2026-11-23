import type { PointerEvent, PointerEventHandler, ReactEventHandler, ReactNode, RefObject } from "react";
import { VideoPlayerShell, VideoTimeline } from "@/components/previews/video-preview-sections";

type VideoMetadata = {
  duration: number;
  fps: number;
  width: number;
  height: number;
  codec: string;
};

type Thumbnail = {
  time: number;
  data_url?: string;
  dataUrl?: string;
};

type VideoPreviewProps = {
  caption?: ReactNode;
  videoRef: RefObject<HTMLVideoElement | null>;
  timelineRef: RefObject<HTMLDivElement | null>;
  thumbnailGridRef: RefObject<HTMLDivElement | null>;
  videoSrc: string;
  isVideoMuted: boolean;
  loopPlayback: boolean;
  metadata: VideoMetadata | null;
  isVideoPlaying: boolean;
  currentTime: number;
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
  onCanPlay: () => void;
  onError: ReactEventHandler<HTMLVideoElement>;
  onTimeUpdate: ReactEventHandler<HTMLVideoElement>;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onTogglePlayback: () => void;
  onToggleMute: () => void;
  previewSettings: ReactNode;
  onUpdateTimelineHover: PointerEventHandler<HTMLDivElement>;
  onClearTimelineHover: () => void;
  onScrubTimeline: PointerEventHandler<HTMLDivElement>;
  onStartTrimDrag: (kind: "start" | "end", event: PointerEvent<HTMLButtonElement>) => void;
  onUpdateTrimDrag: PointerEventHandler<HTMLButtonElement>;
  onStopTrimDrag: PointerEventHandler<HTMLButtonElement>;
  formatTime: (seconds: number) => string;
  imageSource: (item: Thumbnail) => string;
};

export function VideoPreview({
  caption,
  videoRef,
  timelineRef,
  thumbnailGridRef,
  videoSrc,
  isVideoMuted,
  loopPlayback,
  metadata,
  isVideoPlaying,
  currentTime,
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
  onCanPlay,
  onError,
  onTimeUpdate,
  onPlay,
  onPause,
  onEnded,
  onTogglePlayback,
  onToggleMute,
  previewSettings,
  onUpdateTimelineHover,
  onClearTimelineHover,
  onScrubTimeline,
  onStartTrimDrag,
  onUpdateTrimDrag,
  onStopTrimDrag,
  formatTime,
  imageSource,
}: VideoPreviewProps) {
  return (
    <section className="preview video-preview">
      <VideoPlayerShell
        caption={caption}
        videoRef={videoRef}
        videoSrc={videoSrc}
        isVideoMuted={isVideoMuted}
        loopPlayback={loopPlayback}
        metadata={metadata}
        isVideoPlaying={isVideoPlaying}
        currentTime={currentTime}
        duration={duration}
        onCanPlay={onCanPlay}
        onError={onError}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        onTogglePlayback={onTogglePlayback}
        onToggleMute={onToggleMute}
        previewSettings={previewSettings}
        formatTime={formatTime} />
      <VideoTimeline
        timelineRef={timelineRef}
        thumbnailGridRef={thumbnailGridRef}
        duration={duration}
        visibleStart={visibleStart}
        visibleDuration={visibleDuration}
        visibleEnd={visibleEnd}
        hoverPercent={hoverPercent}
        timelineHoverTime={timelineHoverTime}
        currentPercent={currentPercent}
        trimStartPercent={trimStartPercent}
        trimEndPercent={trimEndPercent}
        thumbnails={thumbnails}
        waveformUrl={waveformUrl}
        trimStart={trimStart}
        trimEnd={trimEnd}
        selectedDuration={selectedDuration}
        selectedFrames={selectedFrames}
        onUpdateTimelineHover={onUpdateTimelineHover}
        onClearTimelineHover={onClearTimelineHover}
        onScrubTimeline={onScrubTimeline}
        onStartTrimDrag={onStartTrimDrag}
        onUpdateTrimDrag={onUpdateTrimDrag}
        onStopTrimDrag={onStopTrimDrag}
        formatTime={formatTime}
        imageSource={imageSource} />
    </section>
  );
}
