import type { ReactEventHandler, ReactNode, RefObject } from "react";
import { Pause, Play, Settings, Volume2, VolumeX } from "lucide-react";
import { Popover } from "radix-ui";
import { FieldLabel, SecondaryButton } from "@/components/app-controls";

type VideoMetadata = {
  duration: number;
  fps: number;
  width: number;
  height: number;
  codec: string;
};

export function VideoPlayerShell({
  caption,
  videoRef,
  videoSrc,
  isVideoMuted,
  loopPlayback,
  metadata,
  isVideoPlaying,
  currentTime,
  duration,
  onCanPlay,
  onError,
  onTimeUpdate,
  onPlay,
  onPause,
  onEnded,
  onTogglePlayback,
  onToggleMute,
  previewSettings,
  formatTime,
}: {
  caption?: ReactNode;
  videoRef: RefObject<HTMLVideoElement | null>;
  videoSrc: string;
  isVideoMuted: boolean;
  loopPlayback: boolean;
  metadata: VideoMetadata | null;
  isVideoPlaying: boolean;
  currentTime: number;
  duration: number;
  onCanPlay: () => void;
  onError: ReactEventHandler<HTMLVideoElement>;
  onTimeUpdate: ReactEventHandler<HTMLVideoElement>;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onTogglePlayback: () => void;
  onToggleMute: () => void;
  previewSettings: ReactNode;
  formatTime: (seconds: number) => string;
}) {
  return (
    <div className="video-shell">
      <video
        ref={videoRef}
        src={videoSrc || undefined}
        muted={isVideoMuted}
        loop={loopPlayback}
        onCanPlay={onCanPlay}
        onError={onError}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded} />
      {caption}
      <PreviewControls
        ready={Boolean(metadata)} playing={isVideoPlaying} muted={isVideoMuted}
        currentTime={currentTime} duration={duration} formatTime={formatTime}
        onTogglePlayback={onTogglePlayback} onToggleMute={onToggleMute}
        previewSettings={previewSettings} />
    </div>
  );
}

export function PreviewControls({
  ready, playing, muted, currentTime, duration, formatTime, onTogglePlayback,
  onToggleMute, previewSettings,
}: {
  ready: boolean;
  playing: boolean;
  muted: boolean;
  currentTime: number;
  duration: number;
  formatTime: (seconds: number) => string;
  onTogglePlayback: () => void;
  onToggleMute: () => void;
  previewSettings: ReactNode;
}) {
  return (
    <div className="video-controls-overlay">
      <button type="button" disabled={!ready} onClick={onTogglePlayback} title={playing ? "Pause" : "Play"}>
        {playing ? <Pause className="app-icon" /> : <Play className="app-icon" />}
      </button>
      <span className="video-timecode">{formatTime(currentTime)} / {formatTime(duration)}</span>
      <Popover.Root>
        <Popover.Trigger className="video-control-settings" aria-label="Preview settings" title="Preview settings">
          <Settings className="app-icon" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="video-preview-settings" side="top" align="end" sideOffset={8} aria-label="Preview settings">
            {previewSettings}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <button type="button" disabled={!ready} onClick={onToggleMute} title={muted ? "Unmute" : "Mute"}>
        {muted ? <VolumeX className="app-icon" /> : <Volume2 className="app-icon" />}
      </button>
    </div>
  );
}

export function PreviewRangeActions({
  medium, isFitted, canFit, isLoading, ready, onFit, onShowFull,
}: {
  medium: "Audio" | "Video";
  isFitted: boolean;
  canFit: boolean;
  isLoading: boolean;
  ready: boolean;
  onFit: () => void;
  onShowFull: () => void;
}) {
  const disabled = isLoading || !ready;
  return (
    <>
      <FieldLabel help="Fit the timeline to the selected range, or restore the full preview.">Range</FieldLabel>
      <div className="preview-range-actions" role="group" aria-label="Preview range" aria-busy={isLoading}>
        <SecondaryButton type="button" disabled={disabled || !canFit} onClick={onFit}>
          {isFitted ? "Fit" : "Fit To Selection"}
        </SecondaryButton>
        {isFitted && (
          <SecondaryButton type="button" disabled={disabled} onClick={onShowFull}>
            Show Full {medium}
          </SecondaryButton>
        )}
      </div>
    </>
  );
}
