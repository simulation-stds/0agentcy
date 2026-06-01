import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { useAudioTools } from "@/hooks/use-audio-tools";
import { formatTime } from "@/lib/media-utils";

type AudioPreviewProps = {
  audioTools: ReturnType<typeof useAudioTools>;
};

export function AudioPreview({ audioTools }: AudioPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [dragKind, setDragKind] = useState<"start" | "end" | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const duration = audioTools.metadata?.duration ?? 0;
  const visibleStart = Math.max(0, Math.min(audioTools.visibleStart, duration));
  const visibleEnd = Math.max(visibleStart, Math.min(audioTools.visibleEnd || duration, duration));
  const visibleDuration = Math.max(0.001, visibleEnd - visibleStart);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * scale));
    canvas.height = Math.max(1, Math.floor(rect.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    drawWaveform(context, rect.width, rect.height, audioTools.peaks, audioTools.showSeparateChannels, visibleStart, visibleEnd, duration);
  }, [audioTools.peaks, audioTools.showSeparateChannels, visibleStart, visibleEnd, duration]);

  const trimStartPercent = visiblePercent(audioTools.trimStart, visibleStart, visibleDuration);
  const trimEndPercent = visiblePercent(audioTools.trimEnd || duration, visibleStart, visibleDuration);
  const playheadPercent = visiblePercent(audioTools.currentTime, visibleStart, visibleDuration);
  const hoverPercent = hoverTime !== null ? visiblePercent(hoverTime, visibleStart, visibleDuration) : null;

  function timeFromPointer(event: PointerEvent<HTMLElement>) {
    if (!duration) return;
    const rect = (timelineRef.current ?? event.currentTarget).getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    return visibleStart + percent * visibleDuration;
  }

  function updateTrimFromPointer(event: PointerEvent<HTMLElement>, target: "start" | "end") {
    const time = timeFromPointer(event);
    if (time === undefined) return;
    setHoverTime(time);
    if (target === "start") {
      audioTools.updateTrimStart(time);
    } else {
      audioTools.updateTrimEnd(time);
    }
  }

  function startTrimDrag(kind: "start" | "end", event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragKind(kind);
    updateTrimFromPointer(event, kind);
  }

  function updateTrimDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!dragKind) return;
    updateTrimFromPointer(event, dragKind);
  }

  function stopTrimDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragKind(null);
  }

  function updateWaveformHover(event: PointerEvent<HTMLDivElement>) {
    const time = timeFromPointer(event);
    if (time !== undefined) {
      setHoverTime(time);
    }
  }

  function clearWaveformHover() {
    if (!dragKind) {
      setHoverTime(null);
    }
  }

  function scrubWaveform(event: PointerEvent<HTMLDivElement>) {
    const time = timeFromPointer(event);
    if (time === undefined) return;
    audioTools.seekTo(time);
  }

  const selectedDuration = Math.max(0, (audioTools.trimEnd || duration) - audioTools.trimStart);

  return (
    <section className="preview">
      <h2>Preview</h2>
      {audioTools.audioSrc ? (
        <>
          <div className="audio-preview-shell">
            <div
              ref={timelineRef}
              className="audio-waveform"
              onPointerMove={updateWaveformHover}
              onPointerLeave={clearWaveformHover}
              onPointerDown={scrubWaveform}
            >
              <canvas ref={canvasRef} />
              <div className="audio-selection" style={{ left: `${trimStartPercent}%`, width: `${Math.max(0, trimEndPercent - trimStartPercent)}%` }} />
              {hoverPercent !== null && (
                <>
                  <div className="hover-line" style={{ left: `${hoverPercent}%` }} />
                  <div className="timeline-hover" style={{ left: `${hoverPercent}%` }}>
                    {formatTime(hoverTime ?? 0)}
                  </div>
                </>
              )}
              <button
                className="trim-handle trim-handle-start"
                style={{ left: `${trimStartPercent}%` }}
                onPointerDown={(event) => startTrimDrag("start", event)}
                onPointerMove={updateTrimDrag}
                onPointerUp={stopTrimDrag}
                onPointerCancel={stopTrimDrag}
                aria-label="Drag trim start"
              />
              <button
                className="trim-handle trim-handle-end"
                style={{ left: `${trimEndPercent}%` }}
                onPointerDown={(event) => startTrimDrag("end", event)}
                onPointerMove={updateTrimDrag}
                onPointerUp={stopTrimDrag}
                onPointerCancel={stopTrimDrag}
                aria-label="Drag trim end"
              />
              <div className="audio-playhead" style={{ left: `${playheadPercent}%` }} />
            </div>
            <div className="selection-summary">
              <span>Selection: {formatTime(audioTools.trimStart)} - {formatTime(audioTools.trimEnd || duration)} ({formatTime(selectedDuration)})</span>
              <span>{audioTools.showSeparateChannels ? "Separate channels" : "Combined waveform"}</span>
            </div>
            <div className="audio-controls">
              <div className="video-control-left">
                <button disabled={!audioTools.metadata} onClick={audioTools.togglePlayback} title={audioTools.isPlaying ? "Pause" : "Play"}>
                  <span className="material-symbols-rounded" aria-hidden="true">
                    {audioTools.isPlaying ? "pause" : "play_arrow"}
                  </span>
                </button>
                <span className="video-timecode">{formatTime(audioTools.currentTime)} / {formatTime(duration)}</span>
              </div>
              <button disabled={!audioTools.metadata} onClick={audioTools.toggleMute} title={audioTools.isMuted ? "Unmute" : "Mute"}>
                <span className="material-symbols-rounded" aria-hidden="true">
                  {audioTools.isMuted ? "volume_off" : "volume_up"}
                </span>
              </button>
            </div>
            <audio
              ref={audioTools.audioRef}
              src={audioTools.audioSrc}
              muted={audioTools.isMuted}
              loop={audioTools.loopPlayback && !audioTools.playSelectionOnly}
              onTimeUpdate={(event) => audioTools.handleTimeUpdate(event.currentTarget.currentTime)}
              onPlay={() => audioTools.setIsPlaying(true)}
              onPause={() => audioTools.setIsPlaying(false)}
              onEnded={audioTools.handleEnded}
              onLoadedMetadata={(event) => {
                if (!audioTools.metadata) {
                  audioTools.updateTrimEnd(event.currentTarget.duration || 0);
                }
              }}
            />
          </div>
        </>
      ) : (
        <div className="empty-state">
          <strong>No audio loaded</strong>
          <p>Choose an audio file to preview waveform, trim, and convert formats.</p>
        </div>
      )}
    </section>
  );
}

function visiblePercent(time: number, visibleStart: number, visibleDuration: number) {
  return Math.max(0, Math.min(100, ((time - visibleStart) / visibleDuration) * 100));
}

function drawWaveform(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  peaks: number[][],
  separateChannels: boolean,
  visibleStart: number,
  visibleEnd: number,
  duration: number,
) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#101312";
  context.fillRect(0, 0, width, height);

  if (!peaks.length) {
    context.fillStyle = "#5d6a62";
    context.font = "14px sans-serif";
    context.fillText("Waveform unavailable", 16, height / 2);
    return;
  }

  const channels = separateChannels ? peaks : [combinePeaks(peaks)];
  const visibleChannels = channels.map((channel) => sliceVisiblePeaks(channel, visibleStart, visibleEnd, duration));
  const gap = separateChannels && visibleChannels.length > 1 ? 8 : 0;
  const laneHeight = (height - gap * (visibleChannels.length - 1)) / visibleChannels.length;
  visibleChannels.forEach((channel, channelIndex) => {
    const top = channelIndex * (laneHeight + gap);
    const middle = top + laneHeight / 2;
    const barWidth = Math.max(1, width / channel.length);
    context.fillStyle = channelIndex % 2 === 0 ? "#a7f06b" : "#7fd7c5";
    for (let index = 0; index < channel.length; index += 1) {
      const peak = channel[index];
      const barHeight = Math.max(1, peak * laneHeight * 0.82);
      const x = index * barWidth;
      context.fillRect(x, middle - barHeight / 2, Math.max(1, barWidth * 0.72), barHeight);
    }
    if (separateChannels && channels.length > 1) {
      context.fillStyle = "#5d6a62";
      context.font = "12px sans-serif";
      context.fillText(`Ch ${channelIndex + 1}`, 10, top + 18);
    }
  });
}

function sliceVisiblePeaks(channel: number[], visibleStart: number, visibleEnd: number, duration: number) {
  if (!duration || (visibleStart <= 0 && visibleEnd >= duration)) return channel;
  const startIndex = Math.max(0, Math.floor((visibleStart / duration) * channel.length));
  const endIndex = Math.min(channel.length, Math.ceil((visibleEnd / duration) * channel.length));
  return channel.slice(startIndex, Math.max(startIndex + 1, endIndex));
}

function combinePeaks(peaks: number[][]) {
  const length = Math.max(...peaks.map((channel) => channel.length), 0);
  const combined: number[] = [];
  for (let index = 0; index < length; index += 1) {
    let value = 0;
    for (const channel of peaks) {
      value = Math.max(value, channel[index] ?? 0);
    }
    combined.push(value);
  }
  return combined;
}
