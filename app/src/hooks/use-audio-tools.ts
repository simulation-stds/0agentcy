import { buildWaveformPeaks } from "@/lib/audio-waveform";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { baseName, localAssetSrc } from "@/lib/media-utils";
import { isAudioModel } from "@/hooks/use-audio-models";
import { appendTailLog } from "@/lib/job-log";

export type AudioModelOutput = { label: string; path: string };

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

const videoExtensions = ["mp4", "mkv", "mov", "webm", "avi", "m4v", "mts", "m2ts"];
const audioExtensions = ["mp3", "wav", "flac", "m4a", "aac", "ogg", "opus", "webm"];

export function useAudioTools({ appendLog, resetJobProgress }: UseAudioToolsArgs) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioPath, setAudioPath] = useState("");
  const [audioName, setAudioName] = useState("");
  const [audioObjectUrl, setAudioObjectUrl] = useState("");
  const [playbackUrl, setPlaybackUrl] = useState("");
  const [waveformUrl, setWaveformUrl] = useState("");
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
  const [modelOutputs, setModelOutputs] = useState<AudioModelOutput[]>([]);
  const runningModel = useRef(false);

  const duration = metadata?.duration ?? 0;
  const selectionDuration = trimEnd - trimStart;
  const shouldPlaySelection = playSelectionOnly && duration > 0 &&
    selectionDuration > 0.05 && selectionDuration < duration - 0.001;

  const audioSrc = audioObjectUrl || playbackUrl;
  const waveformSrc = audioObjectUrl || waveformUrl;

  useEffect(() => {
    return () => {
      if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
    };
  }, [audioObjectUrl]);

  useEffect(() => {
    if (!waveformSrc) {
      setPeaks([]);
      return;
    }

    let cancelled = false;
    setWaveformStatus("Building waveform...");
    buildWaveformPeaks(waveformSrc)
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
  }, [appendLog, waveformSrc]);

  const loadAudio = useCallback(async (path: string, displayName?: string, alreadyPcm = false) => {
    const trimmed = path.trim();
    if (!trimmed) return;

    resetJobProgress();
    setIsLoading(true);
    setOutputPath("");
    setModelOutputs([]);
    setCurrentTime(0);
    setPeaks([]);
    setMetadata(null);
    setPlaybackUrl("");
    setWaveformUrl("");
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
      const previewPath = /Linux/i.test(navigator.userAgent) && !alreadyPcm
        ? await invoke<string>("prepare_video_audio", { path: trimmed, preserveChannels: true })
        : trimmed;
      const url = await invoke<string | null>("audio_playback_url", { path: previewPath });
      const asset = localAssetSrc(previewPath);
      setWaveformUrl(asset);
      setPlaybackUrl(url ?? asset);
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

  async function chooseInputVideo() {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: "Video", extensions: videoExtensions }],
    });
    if (typeof selected === "string") await loadVideoAudio(selected);
  }

  async function loadVideoAudio(path: string) {
    setIsLoading(true);
    appendLog("Audio: extracting the first audio track from video...");
    try {
      const preview = await invoke<string>("prepare_video_audio", { path, preserveChannels: true });
      setAudioObjectUrl("");
      await loadAudio(preview, baseName(path), true);
    } catch (error) {
      appendLog(`Audio load failed: ${String(error).trim()}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDroppedMedia(paths: string[]) {
    if (isLoading || isRunning) return;
    const path = paths.find((file) => hasExtension(file, videoExtensions) || hasExtension(file, audioExtensions));
    if (!path) {
      appendLog("Drop a supported audio or video file.");
      return;
    }
    if (hasExtension(path, videoExtensions)) {
      await loadVideoAudio(path);
    } else {
      setAudioObjectUrl("");
      await loadAudio(path);
    }
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (isLoading || isRunning) return;
    const file = event.dataTransfer.files[0] as (File & { path?: string }) | undefined;
    if (!file) return;

    if (file.type.startsWith("video/") || (!file.type.startsWith("audio/") && hasExtension(file.name, videoExtensions))) {
      if (file.path) {
        await loadVideoAudio(file.path);
      } else {
        appendLog("The dropped video has no local path. Open it with Browse Video.");
      }
      return;
    }
    if (!file.type.startsWith("audio/") && !hasExtension(file.name, audioExtensions)) {
      appendLog("Drop a supported audio or video file.");
      return;
    }

    resetJobProgress();
    if (file.path) {
      setAudioObjectUrl("");
      await loadAudio(file.path, file.name);
    } else {
      setPlaybackUrl("");
      setWaveformUrl("");
      setAudioObjectUrl(URL.createObjectURL(file));
      setAudioPath("");
      setModelOutputs([]);
      setAudioName(baseName(file.name));
      setOutputName(baseName(file.name));
      setMetadata(null);
      setCurrentTime(0);
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

  function playAudio(audio: HTMLAudioElement) {
    void audio.play().catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      appendLog(`Audio playback failed: ${String(error)}`);
    });
  }

  function handlePlaybackError() {
    const message = audioRef.current?.error?.message;
    appendLog(`Audio playback failed: ${message || "The audio source could not be played."}`);
  }

  function loadPlaybackMetadata(audio: HTMLAudioElement) {
    if (audioPath || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    setMetadata({ duration: audio.duration, codec: "", sampleRate: 0, channels: 0, bitRate: 0 });
    setTrimEnd(audio.duration);
    setVisibleEnd(audio.duration);
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !metadata) return;
    if (audio.paused) {
      if (shouldPlaySelection && (audio.currentTime < trimStart || audio.currentTime >= trimEnd - 0.05)) {
        audio.currentTime = trimStart;
      }
      playAudio(audio);
    } else {
      audio.pause();
    }
  }

  function setPreviewRange(start: number, end: number) {
    setVisibleStart(start);
    setVisibleEnd(end);
    seekTo(start);
  }

  function toggleMute() {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
    }
  }

  function handleTimeUpdate(value: number) {
    const audio = audioRef.current;
    if (!audio || audio.paused || !shouldPlaySelection || value < trimEnd) {
      setCurrentTime(value);
      return;
    }
    if (loopPlayback) {
      seekTo(trimStart);
    } else {
      audio.pause();
      seekTo(trimEnd);
    }
  }

  function handleEnded() {
    if (!loopPlayback) {
      setIsPlaying(false);
      return;
    }
    seekTo(shouldPlaySelection ? trimStart : 0);
    if (audioRef.current) playAudio(audioRef.current);
  }

  async function runAudioJob() {
    if (!audioPath || !metadata) {
      appendLog("Choose an audio file before running an audio job.");
      return;
    }

    setIsRunning(true);
    setOutputPath("");
    setModelOutputs([]);
    resetJobProgress();
    appendLog("Running audio action...");
    const options = {
      inputPath: audioPath,
      outputName,
      action: action === "convert" && saveSelection ? "trim_convert" : action,
      outputFormat,
      trimStart,
      trimEnd,
      bitrate,
      sampleRate,
      channels,
    };
    try {
      if (isAudioModel(action)) {
        runningModel.current = true;
        const { outputs, projectPath } = await invoke<{
          outputs: AudioModelOutput[]; projectPath: string;
        }>("run_audio_model", {
          model: action,
          options,
          selection: saveSelection,
        });
        audioRef.current?.pause();
        setIsPlaying(false);
        setModelOutputs(outputs);
        setOutputPath(outputs.find(({ label }) => label !== "Original")?.path ?? "");
        for (const output of outputs) appendLog(`Audio complete: ${output.path}`);
        appendLog(`Audio project saved: ${projectPath}`);
        return;
      }
      const result = await invoke<JobResult>("run_audio_job", { options });
      appendTailLog(appendLog, result.log);
      setOutputPath(result.outputPath);
      appendLog(`Audio complete: ${result.outputPath}`);
    } catch (error) {
      appendLog(`Audio failed: ${String(error).trim()}`);
    } finally {
      runningModel.current = false;
      setIsRunning(false);
    }
  }

  async function openAudioProject() {
    try {
      const path = await openDialog({
        multiple: false,
        filters: [{ name: "Audio project", extensions: ["json"] }],
      });
      if (typeof path !== "string") return;
      setIsLoading(true);
      const project = await invoke<{ name: string; outputs: AudioModelOutput[] }>("open_audio_project", { path });
      audioRef.current?.pause();
      setIsPlaying(false);
      setAudioObjectUrl("");
      setPlaybackUrl("");
      setWaveformUrl("");
      setAudioPath("");
      setMetadata(null);
      setCurrentTime(0);
      setTrimStart(0);
      setTrimEnd(0);
      setVisibleStart(0);
      setVisibleEnd(0);
      setAudioName(project.name);
      setOutputName(project.name);
      setOutputPath(project.outputs.find(({ label }) => label !== "Original")?.path ?? "");
      setModelOutputs(project.outputs);
      resetJobProgress();
      appendLog(`Opened audio project: ${path}`);
    } catch (error) {
      appendLog(`Could not open audio project: ${String(error).trim()}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function prepareVoiceCleanup(path: string) {
    setAudioObjectUrl("");
    setAction("deepfilter");
    setSaveSelection(false);
    await loadAudio(path);
  }

  async function cancelAudioJob() {
    try {
      await invoke(runningModel.current ? "cancel_audio_model" : "cancel_audio_job");
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
    shouldPlaySelection,
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
    modelOutputs,
    chooseInputAudio,
    chooseInputVideo,
    loadDroppedMedia,
    handleDrop,
    setCurrentTime,
    seekTo,
    updateTrimStart,
    updateTrimEnd,
    togglePlayback,
    handlePlaybackError,
    loadPlaybackMetadata,
    toggleMute,
    setPreviewRange,
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
    prepareVoiceCleanup,
    openAudioProject,
    cancelAudioJob,
  };
}

function hasExtension(path: string, extensions: string[]) {
  return extensions.includes(path.split(".").pop()?.toLowerCase() ?? "");
}
