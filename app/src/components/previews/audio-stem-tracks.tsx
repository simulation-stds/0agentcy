import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { AudioTimeRuler } from "@/components/previews/audio-time-ruler";
import { SecondaryButton } from "@/components/app-controls";
import { PreviewControls } from "@/components/previews/video-player-shell";
import { Switch } from "@/components/ui/switch";
import type { AudioModelOutput } from "@/hooks/use-audio-tools";
import { createAudioContext, decodeAudioBuffer, drawWaveform, getWaveformPeaks } from "@/lib/audio-waveform";
import { formatTime, localAssetSrc } from "@/lib/media-utils";

const stemColors: Readonly<Record<string, string>> = {
  Dialogue: "#a7f06b",
  Music: "#77c5ff",
  Effects: "#f1bb70",
  Original: "#77c5ff",
  Cleaned: "#a7f06b",
};

type DecodedStem = {
  output: AudioModelOutput;
  buffer: AudioBuffer;
  gain: GainNode;
  peaks: number[][];
};

type StemPlayback = {
  context: AudioContext;
  output: GainNode;
  stems: DecodedStem[];
  sources: AudioBufferSourceNode[];
  duration: number;
  offset: number;
  startedAt: number;
  rate: number;
};

function position(playback: StemPlayback) {
  const elapsed = playback.sources.length ? Math.max(0, playback.context.currentTime - playback.startedAt) : 0;
  return Math.min(playback.duration, playback.offset + elapsed * playback.rate);
}

function stop(playback: StemPlayback, offset: number) {
  for (const source of playback.sources) {
    source.stop();
    source.disconnect();
  }
  playback.sources = [];
  playback.offset = offset;
}

function start(playback: StemPlayback, offset: number, rate: number) {
  stop(playback, offset);
  playback.rate = rate;
  playback.startedAt = playback.context.currentTime + 0.02;
  for (const { buffer, gain } of playback.stems) {
    if (offset >= buffer.duration) continue;
    const source = playback.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(gain);
    source.start(playback.startedAt, offset);
    playback.sources.push(source);
  }
}

export function AudioStemTracks({ outputs, onCleanDialogue, speed, onSpeedChange, renderSettings }: {
  outputs: AudioModelOutput[];
  onCleanDialogue: (path: string) => Promise<void>;
  speed: number;
  onSpeedChange: (speed: number) => void;
  renderSettings: (onChange: (speed: number) => void) => ReactNode;
}) {
  const transport = useRef<StemPlayback | null>(null);
  const requestId = useRef(0);
  const [decoded, setDecoded] = useState<DecodedStem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(true);
  const comparison = outputs.some(({ label }) => label === "Original");
  const [mutedStems, setMutedStems] = useState<string[]>(() =>
    outputs.filter(({ label }) => label === "Original").map(({ path }) => path),
  );
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const duration = Math.max(0, ...decoded.map(({ buffer }) => buffer.duration));

  useEffect(() => {
    const abort = new AbortController();
    let context: AudioContext;
    try {
      context = createAudioContext();
    } catch (error) {
      setError(`Audio preview unavailable: ${String(error)}`);
      setLoading(false);
      return;
    }
    const outputGain = context.createGain();
    outputGain.connect(context.destination);
    const playback: StemPlayback = { context, output: outputGain, stems: [], sources: [], duration: 0, offset: 0, startedAt: 0, rate: 1 };
    transport.current = playback;

    void Promise.allSettled(outputs.map(async (output) => {
      const buffer = await decodeAudioBuffer(context, localAssetSrc(output.path), abort.signal);
      const gain = context.createGain();
      gain.gain.value = output.label === "Original" ? 0 : 1;
      gain.connect(outputGain);
      return { output, buffer, gain, peaks: getWaveformPeaks(buffer) };
    })).then((results) => {
      if (abort.signal.aborted) return;
      const stems = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      playback.stems = stems;
      playback.duration = Math.max(0, ...stems.map(({ buffer }) => buffer.duration));
      setDecoded(stems);
      setLoading(false);
    });

    return () => {
      abort.abort();
      stop(playback, 0);
      transport.current = null;
      void context.close().catch(() => {});
    };
  }, [outputs]);

  useEffect(() => {
    if (!playing) return;
    let frame: number;
    const update = () => {
      const playback = transport.current;
      if (!playback) return;
      const next = position(playback);
      setTime(next);
      if (next >= playback.duration) {
        stop(playback, next);
        setPlaying(false);
      } else {
        frame = requestAnimationFrame(update);
      }
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  async function togglePlayback() {
    const playback = transport.current;
    if (!playback?.duration) return;
    const request = ++requestId.current;
    if (playback.sources.length) {
      const offset = position(playback);
      stop(playback, offset);
      setTime(offset);
      setPlaying(false);
      return;
    }
    try {
      await playback.context.resume();
      if (request !== requestId.current || transport.current !== playback) return;
      start(playback, playback.offset >= playback.duration ? 0 : playback.offset, speed);
      setPlaying(true);
      setError("");
    } catch (error) {
      if (transport.current === playback) setError(`Playback failed: ${String(error)}`);
    }
  }

  function changeSpeed(rate: number) {
    const playback = transport.current;
    if (playback?.sources.length) start(playback, position(playback), rate);
    onSpeedChange(rate);
  }

  function timeFromPointer(event: PointerEvent<HTMLElement>) {
    const { left, width } = event.currentTarget.getBoundingClientRect();
    if (!duration || !width) return null;
    return Math.max(0, Math.min(1, (event.clientX - left) / width)) * duration;
  }

  function hover(event: PointerEvent<HTMLElement>) {
    setHoverTime(timeFromPointer(event));
  }

  function clearHover() {
    setHoverTime(null);
  }

  function seek(event: PointerEvent<HTMLElement>) {
    const playback = transport.current;
    const offset = timeFromPointer(event);
    if (!playback || offset === null) return;
    setHoverTime(offset);
    if (playback.sources.length && offset < playback.duration) {
      start(playback, offset, speed);
    } else {
      stop(playback, offset);
      setPlaying(false);
    }
    setTime(offset);
  }

  function toggleStem(stem: DecodedStem, on: boolean) {
    const { path } = stem.output;
    if (comparison && on) {
      for (const candidate of decoded) candidate.gain.gain.value = candidate === stem ? 1 : 0;
      setMutedStems(outputs.filter((output) => output.path !== path).map((output) => output.path));
      return;
    }
    stem.gain.gain.value = on ? 1 : 0;
    setMutedStems((current) => on ? current.filter((item) => item !== path) : [...current, path]);
  }

  function setOutputEnabled(on: boolean) {
    if (transport.current) transport.current.output.gain.value = on ? 1 : 0;
    setEnabled(on);
  }

  return (
    <section className="audio-stem-mixer" aria-label="Audio results">
      <div className="audio-stem-tracks">
        <AudioTimeRuler start={0} end={duration} hoverTime={hoverTime}
          onPointerMove={hover} onPointerLeave={clearHover} onPointerDown={seek} />
        {outputs.map((output) => {
          const stem = decoded.find(({ output: item }) => item.path === output.path);
          return (
            <article className="audio-waveform audio-stem-track" key={output.path} aria-label={output.label}
              onPointerMove={hover} onPointerLeave={clearHover} onPointerDown={seek}>
              {stem ? (
                <StemWaveform peaks={stem.peaks} color={stemColors[output.label]} />
              ) : (
                <span className="audio-stem-status">{loading ? "Loading waveform…" : "Preview unavailable"}</span>
              )}
              {duration > 0 && <div className="audio-playhead" style={{ left: `${time / duration * 100}%` }} />}
              <header className="audio-stem-header">
                <strong title={output.path}>{output.label}</strong>
                <div className="audio-stem-actions" onPointerDown={(event) => event.stopPropagation()}>
                  <Switch aria-label={`Enable ${output.label}`} disabled={!stem}
                    checked={!mutedStems.includes(output.path)} onCheckedChange={(on) => stem && toggleStem(stem, on)} />
                  {output.label === "Dialogue" && (
                    <SecondaryButton className="audio-clean-dialogue" type="button" onClick={() => void onCleanDialogue(output.path)}>
                      Clean Dialogue
                    </SecondaryButton>
                  )}
                </div>
              </header>
            </article>
          );
        })}
      </div>
      {error && <p role="status">{error}</p>}
      <PreviewControls
        ready={duration > 0} playing={playing} muted={!enabled} currentTime={time} duration={duration}
        formatTime={formatTime} onTogglePlayback={() => void togglePlayback()} onToggleMute={() => setOutputEnabled(!enabled)}
        previewSettings={renderSettings(changeSpeed)} />
    </section>
  );
}

function StemWaveform({ peaks, color }: { peaks: number[][]; color?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      drawWaveform(context, width, height, peaks, false, 0, 0, 0, color);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [color, peaks]);
  return <canvas ref={canvasRef} aria-hidden="true" />;
}
