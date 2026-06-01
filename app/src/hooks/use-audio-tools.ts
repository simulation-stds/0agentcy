import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { baseName, localAssetSrc } from "@/lib/media-utils";
import { appendTailLog } from "@/lib/job-log";

type JobResult = {
  outputPath: string;
  log: string;
};

export type AudioMetadata = {
  duration: number;
  codec: string;
  sampleRate: number;
  channels: number;
  bitRate: number;
};

type UseAudioToolsArgs = {
  appendLog: (message: string) => void;
  resetJobProgress: () => void;
};

const audioExtensions = ["mp3", "wav", "flac", "m4a", "aac", "ogg", "opus", "webm"];

export function useAudioTools({ appendLog, resetJobProgress }: UseAudioToolsArgs) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioPath, setAudioPath] = useState("");
  const [audioName, setAudioName] = useState("");
  const [audioObjectUrl, setAudioObjectUrl] = useState("");
  const [metadata, setMetadata] = useState<AudioMetadata | null>(null);
  const [peaks, setPeaks] = useState<number[][]>([]);
  const [waveformStatus, setWaveformStatus] = useState("Choose an audio file to preview.");
  const [currentTime, setCurrentTime] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [visibleStart, setVisibleStart] = useState(0);
  const [visibleEnd, setVisibleEnd] = useState(0);
  const [action, setAction] = useState("trim");
  const [saveSelection, setSaveSelection] = useState(false);
  const [playSelectionOnly, setPlaySelectionOnly] = useState(false);
  const [loopPlayback, setLoopPlayback] = useState(false);
  const [showSeparateChannels, setShowSeparateChannels] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [outputFormat, setOutputFormat] = useState("mp3");
  const [bitrate, setBitrate] = useState("192k");
  const [sampleRate, setSampleRate] = useState("source");
  const [channels, setChannels] = useState("source");
  const [outputName, setOutputName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [outputPath, setOutputPath] = useState("");

  const audioSrc = useMemo(() => {
    if (audioObjectUrl) return audioObjectUrl;
    return localAssetSrc(audioPath);
  }, [audioObjectUrl, audioPath]);

  useEffect(() => {
    return () => {
      if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
    };
  }, [audioObjectUrl]);

  useEffect(() => {
    if (!audioSrc) {
      setPeaks([]);
      return;
    }

    let cancelled = false;
    setWaveformStatus("Building waveform...");
    buildWaveformPeaks(audioSrc)
      .then((nextPeaks) => {
        if (cancelled) return;
        setPeaks(nextPeaks);
        const status = nextPeaks.length ? "Waveform ready." : "Waveform unavailable for this file.";
        setWaveformStatus(status);
        appendLog(status);
      })
      .catch(() => {
        if (cancelled) return;
        setPeaks([]);
        const status = "Waveform unavailable for this file.";
        setWaveformStatus(status);
        appendLog(status);
      });

    return () => {
      cancelled = true;
    };
  }, [appendLog, audioSrc]);

  const loadAudio = useCallback(async (path: string, displayName?: string) => {
    const trimmed = path.trim();
    if (!trimmed) return;

    resetJobProgress();
    setIsLoading(true);
    setOutputPath("");
    setCurrentTime(0);
    setPeaks([]);
    setMetadata(null);
    setAudioPath(trimmed);
    setAudioName(baseName(displayName || trimmed));
    setOutputName(baseName(displayName || trimmed));
    appendLog(`Audio: loading ${displayName || trimmed}`);

    try {
      const info = await invoke<AudioMetadata>("probe_audio", { path: trimmed });
      setMetadata(info);
      setTrimStart(0);
      setTrimEnd(info.duration);
      setVisibleStart(0);
      setVisibleEnd(info.duration);
      appendLog(
        `Audio detected: ${info.codec || "unknown codec"}, ${info.sampleRate || 0} Hz, ${info.channels || 0} channels.`,
      );
      audioRef.current?.load();
    } catch (error) {
      appendLog(`Audio load failed: ${String(error).trim()}`);
    } finally {
      setIsLoading(false);
    }
  }, [appendLog, resetJobProgress]);

  async function chooseInputAudio() {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Audio",
          extensions: audioExtensions,
        },
      ],
    });

    if (typeof selected === "string") {
      setAudioObjectUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
      await loadAudio(selected);
    }
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0] as (File & { path?: string }) | undefined;
    if (!file) return;

    if (!isAudioFile(file)) {
      appendLog("Dropped file is not an audio file.");
      return;
    }

    resetJobProgress();
    const objectUrl = URL.createObjectURL(file);
    setAudioObjectUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return objectUrl;
    });

    if (file.path) {
      await loadAudio(file.path, file.name);
    } else {
      setAudioPath("");
      setAudioName(baseName(file.name));
      setOutputName(baseName(file.name));
      setMetadata(null);
      setTrimStart(0);
      setTrimEnd(0);
      setVisibleStart(0);
      setVisibleEnd(0);
      appendLog("Dropped audio can be previewed, but this platform did not expose a file path for export.");
    }
  }

  function updateTrimStart(value: number) {
    const duration = metadata?.duration ?? 0;
    setTrimStart(Math.max(0, Math.min(value, trimEnd || duration)));
  }

  function updateTrimEnd(value: number) {
    const duration = metadata?.duration ?? 0;
    setTrimEnd(Math.max(trimStart, Math.min(value, duration)));
  }

  function seekTo(time: number) {
    const duration = metadata?.duration ?? 0;
    const safeTime = Math.max(0, Math.min(time, duration));
    if (audioRef.current) {
      audioRef.current.currentTime = safeTime;
    }
    setCurrentTime(safeTime);
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !metadata) return;
    if (audio.paused) {
      if (playSelectionOnly && (audio.currentTime < trimStart || audio.currentTime >= trimEnd)) {
        audio.currentTime = trimStart;
      }
      void audio.play();
    } else {
      audio.pause();
    }
  }

  function toggleFitToSelection() {
    setPlaySelectionOnly((current) => {
      const nextValue = !current;
      if (nextValue && trimEnd > trimStart) {
        setVisibleStart(trimStart);
        setVisibleEnd(trimEnd);
        seekTo(trimStart);
      } else {
        setVisibleStart(0);
        setVisibleEnd(metadata?.duration ?? 0);
      }
      return nextValue;
    });
  }

  function toggleMute() {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
    }
  }

  function handleTimeUpdate(value: number) {
    setCurrentTime(value);
    if (playSelectionOnly && trimEnd > trimStart && value >= trimEnd) {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = trimStart;
        if (loopPlayback) {
          void audio.play();
        } else {
          audio.pause();
        }
      }
      setCurrentTime(trimStart);
    }
  }

  function handleEnded() {
    if (!loopPlayback || playSelectionOnly) {
      setIsPlaying(false);
      return;
    }
    seekTo(0);
    void audioRef.current?.play();
  }

  async function runAudioJob() {
    if (!audioPath || !metadata) {
      appendLog("Choose an audio file before running an audio job.");
      return;
    }

    setIsRunning(true);
    setOutputPath("");
    resetJobProgress();
    appendLog("Running audio action...");
    try {
      const result = await invoke<JobResult>("run_audio_job", {
        options: {
          inputPath: audioPath,
          outputName,
          action: action === "convert" && saveSelection ? "trim_convert" : action,
          outputFormat,
          trimStart,
          trimEnd,
          bitrate,
          sampleRate,
          channels,
        },
      });
      appendTailLog(appendLog, result.log);
      setOutputPath(result.outputPath);
      appendLog(`Audio complete: ${result.outputPath}`);
    } catch (error) {
      appendLog(`Audio failed: ${String(error).trim()}`);
    } finally {
      setIsRunning(false);
    }
  }

  async function cancelAudioJob() {
    try {
      await invoke("cancel_audio_job");
      appendLog("Audio cancel requested.");
    } catch (error) {
      appendLog(`Audio cancel failed: ${String(error).trim()}`);
    }
  }

  return {
    audioRef,
    audioPath,
    audioName,
    audioSrc,
    metadata,
    peaks,
    waveformStatus,
    currentTime,
    trimStart,
    trimEnd,
    visibleStart,
    visibleEnd,
    action,
    saveSelection,
    playSelectionOnly,
    loopPlayback,
    showSeparateChannels,
    isPlaying,
    isMuted,
    outputFormat,
    bitrate,
    sampleRate,
    channels,
    outputName,
    isLoading,
    isRunning,
    outputPath,
    chooseInputAudio,
    handleDrop,
    setCurrentTime,
    seekTo,
    updateTrimStart,
    updateTrimEnd,
    togglePlayback,
    toggleMute,
    toggleFitToSelection,
    handleTimeUpdate,
    handleEnded,
    setAction,
    setSaveSelection,
    setPlaySelectionOnly,
    setLoopPlayback,
    setShowSeparateChannels,
    setIsPlaying,
    setOutputFormat,
    setBitrate,
    setSampleRate,
    setChannels,
    setOutputName,
    runAudioJob,
    cancelAudioJob,
  };
}

async function buildWaveformPeaks(src: string) {
  const response = await fetch(src);
  const buffer = await response.arrayBuffer();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  try {
    const audioBuffer = await context.decodeAudioData(buffer.slice(0));
    const channelCount = Math.min(audioBuffer.numberOfChannels, 6);
    const bucketCount = 900;
    const channelPeaks: number[][] = [];
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const channel = audioBuffer.getChannelData(channelIndex);
      const bucketSize = Math.max(1, Math.floor(channel.length / bucketCount));
      const peaks: number[] = [];
      for (let bucket = 0; bucket < bucketCount; bucket += 1) {
        const start = bucket * bucketSize;
        const end = Math.min(channel.length, start + bucketSize);
        let peak = 0;
        for (let index = start; index < end; index += 1) {
          peak = Math.max(peak, Math.abs(channel[index]));
        }
        peaks.push(peak);
      }
      const max = Math.max(...peaks, 0.001);
      channelPeaks.push(peaks.map((peak) => peak / max));
    }
    return channelPeaks;
  } finally {
    await context.close();
  }
}

function isAudioFile(file: File) {
  return file.type.startsWith("audio/") || new RegExp(`\\.(${audioExtensions.join("|")})$`, "i").test(file.name);
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
