import type { ReactEventHandler, RefObject } from "react";

type VideoMetadata = {
  duration: number;
  fps: number;
  width: number;
  height: number;
  codec: string;
};

export function VideoPlayerShell({
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
  formatTime,
}: {
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
        onEnded={onEnded}
      />
      <div className="video-controls-overlay">
        <div className="video-control-left">
          <button disabled={!metadata} onClick={onTogglePlayback} title={isVideoPlaying ? "Pause" : "Play"}>
            <span className="material-symbols-rounded" aria-hidden="true">
              {isVideoPlaying ? "pause" : "play_arrow"}
            </span>
          </button>
          <span className="video-timecode">{formatTime(currentTime)} / {formatTime(duration)}</span>
        </div>
        <button disabled={!metadata} onClick={onToggleMute} title={isVideoMuted ? "Unmute" : "Mute"}>
          <span className="material-symbols-rounded" aria-hidden="true">
            {isVideoMuted ? "volume_off" : "volume_up"}
          </span>
        </button>
      </div>
    </div>
  );
}
