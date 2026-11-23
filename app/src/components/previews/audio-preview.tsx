import type { Transcription } from "@/hooks/use-transcription";
import { SubtitleCaption } from "@/components/transcription-tools";
import { AudioTimeRuler } from "@/components/previews/audio-time-ruler";
import { AudioStemTracks } from "@/components/previews/audio-stem-tracks";
import { drawWaveform } from "@/lib/audio-waveform";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { useAudioTools } from "@/hooks/use-audio-tools";
import { formatTime, getPreviewRangeState } from "@/lib/media-utils";
import { FormRow, SelectControl, SwitchRow } from "@/components/app-controls";
import { PreviewControls, PreviewRangeActions } from "@/components/previews/video-player-shell";

type AudioPreviewProps = {
  transcription: Transcription;
  audioTools: ReturnType<typeof useAudioTools>;
};

export function AudioPreview({ transcription, audioTools }: AudioPreviewProps) {
  const [speed, setSpeed] = useState(1);
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
  }, [audioTools.peaks, audioTools.showSeparateChannels, audioTools.modelOutputs.length, visibleStart, visibleEnd, duration]);

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

  useEffect(() => {
    if (audioTools.audioRef.current) audioTools.audioRef.current.playbackRate = speed;
  }, [audioTools.audioRef, audioTools.audioSrc, audioTools.modelOutputs.length, speed]);

  const selectedDuration = Math.max(0, (audioTools.trimEnd || duration) - audioTools.trimStart);

  return (
    <section className="preview">
      {audioTools.modelOutputs.length ? (
        <AudioStemTracks outputs={audioTools.modelOutputs} onCleanDialogue={audioTools.prepareVoiceCleanup}
          key={audioTools.modelOutputs[0].path} speed={speed} onSpeedChange={setSpeed}
          renderSettings={(onChange) => <AudioPlaybackSpeed value={speed} onChange={onChange} />} />
      ) : audioTools.audioSrc ? (
        <>
          <div className="audio-preview-shell">
            <AudioTimeRuler start={visibleStart} end={visibleEnd} hoverTime={hoverTime}
              onPointerMove={updateWaveformHover} onPointerLeave={clearWaveformHover} onPointerDown={scrubWaveform} />
            <div className="audio-player-shell">
              <div
                ref={timelineRef}
                className="audio-waveform"
                onPointerMove={updateWaveformHover}
                onPointerLeave={clearWaveformHover}
                onPointerDown={scrubWaveform}
              >
                <canvas ref={canvasRef} />
                <div className="audio-selection" style={{ left: `${trimStartPercent}%`, width: `${Math.max(0, trimEndPercent - trimStartPercent)}%` }} />
                {hoverPercent !== null && <div className="hover-line" style={{ left: `${hoverPercent}%` }} />}
                <button
                  className="trim-handle trim-handle-start"
                  style={{ left: `${trimStartPercent}%` }}
                  onPointerDown={(event) => startTrimDrag("start", event)}
                  onPointerMove={updateTrimDrag}
                  onPointerUp={stopTrimDrag}
                  onPointerCancel={stopTrimDrag}
                  aria-label="Drag trim start" />
                <button
                  className="trim-handle trim-handle-end"
                  style={{ left: `${trimEndPercent}%` }}
                  onPointerDown={(event) => startTrimDrag("end", event)}
                  onPointerMove={updateTrimDrag}
                  onPointerUp={stopTrimDrag}
                  onPointerCancel={stopTrimDrag}
                  aria-label="Drag trim end" />
                <div className="audio-playhead" style={{ left: `${playheadPercent}%` }} />
                <SubtitleCaption tools={transcription} />
              </div>
              <PreviewControls
                ready={duration > 0} playing={audioTools.isPlaying} muted={audioTools.isMuted}
                currentTime={audioTools.currentTime} duration={duration} formatTime={formatTime}
                onTogglePlayback={audioTools.togglePlayback} onToggleMute={audioTools.toggleMute}
                previewSettings={<AudioPreviewSettings audioTools={audioTools} speed={speed} onSpeedChange={setSpeed} />} />
            </div>
            <div className="selection-summary">
              <span>Selection: {formatTime(audioTools.trimStart)} - {formatTime(audioTools.trimEnd || duration)} ({formatTime(selectedDuration)})</span>
              <span>{audioTools.showSeparateChannels ? "Separate channels" : "Combined waveform"}</span>
            </div>
            <audio
              ref={audioTools.audioRef}
              src={audioTools.audioSrc}
              muted={audioTools.isMuted}
              loop={audioTools.loopPlayback && !audioTools.shouldPlaySelection}
              onError={audioTools.handlePlaybackError}
              onTimeUpdate={(event) => audioTools.handleTimeUpdate(event.currentTarget.currentTime)}
              onPlay={() => audioTools.setIsPlaying(true)}
              onPause={() => audioTools.setIsPlaying(false)}
              onEnded={audioTools.handleEnded}
              onLoadedMetadata={(event) => audioTools.loadPlaybackMetadata(event.currentTarget)} />
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

function AudioPlaybackSpeed({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <FormRow label="Playback speed">
      <SelectControl value={String(value)} onChange={(next) => onChange(Number(next))}
        options={[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => ({ value: String(rate), label: `${rate}×` }))} />
    </FormRow>
  );
}

function AudioPreviewSettings({ audioTools, speed, onSpeedChange }: Pick<AudioPreviewProps, "audioTools"> & {
  speed: number;
  onSpeedChange: (speed: number) => void;
}) {
  const duration = audioTools.metadata?.duration ?? 0;
  const { isPreviewFitted, canFitSelection } = getPreviewRangeState(
    duration, audioTools.visibleStart, audioTools.visibleEnd, audioTools.trimStart, audioTools.trimEnd,
  );
  return (
    <>
      <AudioPlaybackSpeed value={speed} onChange={onSpeedChange} />
      <PreviewRangeActions
        medium="Audio" isFitted={isPreviewFitted} canFit={canFitSelection}
        isLoading={audioTools.isLoading} ready={Boolean(audioTools.metadata)}
        onFit={() => audioTools.setPreviewRange(audioTools.trimStart, audioTools.trimEnd)}
        onShowFull={() => audioTools.setPreviewRange(0, duration)} />
      <SwitchRow
        checked={audioTools.playSelectionOnly}
        onCheckedChange={audioTools.setPlaySelectionOnly}
        help="Start playback within the selection and stop at the trim end."
      >
        Play selection only
      </SwitchRow>
      <SwitchRow
        checked={audioTools.loopPlayback}
        onCheckedChange={audioTools.setLoopPlayback}
        help="When enabled, playback restarts automatically when the preview reaches the end of the selected range or full file."
      >
        Play on loop
      </SwitchRow>
      <SwitchRow
        checked={audioTools.showSeparateChannels}
        onCheckedChange={audioTools.setShowSeparateChannels}
        help="Show each audio channel as its own stacked waveform instead of mixing them into one waveform."
      >
        Separate channels
      </SwitchRow>
    </>
  );
}

function visiblePercent(time: number, visibleStart: number, visibleDuration: number) {
  return Math.max(0, Math.min(100, ((time - visibleStart) / visibleDuration) * 100));
}
