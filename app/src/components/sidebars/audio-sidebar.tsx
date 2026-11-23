import type { Transcription } from "@/hooks/use-transcription";
import { SubtitleOptions, TranscriptionTools } from "@/components/transcription-tools";
import { useEffect, useRef } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { FieldLabel, FormRow, PrimaryButton, SecondaryButton, SelectControl, SwitchRow } from "@/components/app-controls";
import { Input } from "@/components/ui/input";
import type { useAudioTools } from "@/hooks/use-audio-tools";
import { isAudioModel } from "@/hooks/use-audio-models";
import { formatTime } from "@/lib/media-utils";
import { FileAudio, FolderOpen } from "lucide-react";

type AudioSidebarProps = {
  transcription: Transcription;
  audioTools: ReturnType<typeof useAudioTools>;
  modelReady: boolean;
  onOpenAudioSettings: () => void;
};

const actionOptions = [
  { value: "transcribe", label: "Transcribe / Subtitles (WhisperX)" },
  { value: "trim", label: "Trim" },
  { value: "convert", label: "Convert" },
  { value: "bandit", label: "Separate Dialogue (Bandit v2)" },
  { value: "deepfilter", label: "Clean Voice (DeepFilterNet)" },
];

const formatOptions = [
  { value: "mp3", label: "MP3" },
  { value: "wav", label: "WAV" },
  { value: "flac", label: "FLAC" },
  { value: "m4a", label: "M4A / AAC" },
  { value: "ogg", label: "OGG Vorbis" },
];

const bitrateOptions = ["96k", "128k", "160k", "192k", "256k", "320k"].map((value) => ({
  value,
  label: value,
}));

const sampleRateOptions = [
  { value: "source", label: "Source" },
  { value: "22050", label: "22.05 kHz" },
  { value: "32000", label: "32 kHz" },
  { value: "44100", label: "44.1 kHz" },
  { value: "48000", label: "48 kHz" },
  { value: "96000", label: "96 kHz" },
];

const channelOptions = [
  { value: "source", label: "Source" },
  { value: "1", label: "Mono" },
  { value: "2", label: "Stereo" },
];

export function AudioSidebar({ transcription, audioTools, modelReady, onOpenAudioSettings }: AudioSidebarProps) {
  const dropZoneRef = useRef<HTMLElement>(null);
  const toolsRef = useRef(audioTools);
  toolsRef.current = audioTools;

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const listener = getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (disposed || payload.type !== "drop") return;
      const { x, y } = payload.position.toLogical(window.devicePixelRatio);
      const target = document.elementFromPoint(x, y);
      if (target && dropZoneRef.current?.contains(target)) {
        void toolsRef.current.loadDroppedMedia(payload.paths);
      }
    });
    void listener.catch((error) => console.error("Audio drop listener failed:", error));
    return () => {
      disposed = true;
      void listener.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);

  const openedProject = audioTools.modelOutputs.length > 0 && !audioTools.audioPath;
  const usesModel = isAudioModel(audioTools.action);
  const lossyFormat = audioTools.outputFormat === "mp3" || audioTools.outputFormat === "m4a" || audioTools.outputFormat === "ogg";

  return (
    <aside className="sidebar">
      <section ref={dropZoneRef} className="drop-zone" aria-label="Audio or video file drop zone" onDrop={audioTools.handleDrop} onDragOver={(event) => event.preventDefault()}>
        <FileAudio className="app-icon" />
        <strong>{audioTools.audioName || "Choose audio or video"}</strong>
        {!audioTools.audioName && <p>Drop an audio or video file here.</p>}
        <PrimaryButton type="button" disabled={audioTools.isLoading || audioTools.isRunning} onClick={audioTools.chooseInputAudio}>
          <FolderOpen className="app-icon" />
          Browse Audio
        </PrimaryButton>
        <SecondaryButton type="button" disabled={audioTools.isLoading || audioTools.isRunning} onClick={audioTools.chooseInputVideo}>
          Browse Video
        </SecondaryButton>
        <SecondaryButton type="button" disabled={audioTools.isLoading || audioTools.isRunning} onClick={audioTools.openAudioProject}>
          Open Project
        </SecondaryButton>
        <SecondaryButton type="button" disabled={transcription.busy || transcription.blocked || transcription.isGroupingPreview || !transcription.source} onClick={() => void transcription.importProject()}>
          Open subtitle project
        </SecondaryButton>
      </section>

      {!openedProject && (
        <>
          <div className="panel">
            <h2>Action</h2>
            <SelectControl value={audioTools.action} onChange={audioTools.setAction} options={actionOptions} />
            {(audioTools.action === "convert" || usesModel) && (
              <SwitchRow
                checked={audioTools.saveSelection}
                onCheckedChange={audioTools.setSaveSelection}
                help="Process only the selected waveform range."
              >
                {usesModel ? "Process selection only" : "Save selection"}
              </SwitchRow>
            )}
            {usesModel && !modelReady && (
              <SecondaryButton type="button" onClick={onOpenAudioSettings}>Audio model settings</SecondaryButton>
            )}
          </div>

          {audioTools.action === "transcribe" && <TranscriptionTools tools={transcription} />}
      <SubtitleOptions tools={transcription} />
          {!usesModel && audioTools.action !== "transcribe" && <div className="panel">
            <h2>Format</h2>
            <FormRow label="Output" help="Choose the file format for the exported audio. WAV and FLAC are lossless; MP3, M4A, and OGG are compressed.">
              <SelectControl value={audioTools.outputFormat} onChange={audioTools.setOutputFormat} options={formatOptions} />
            </FormRow>
            {lossyFormat && (
              <FormRow label="Bitrate" help="Higher bitrates usually sound cleaner and create larger files.">
                <SelectControl value={audioTools.bitrate} onChange={audioTools.setBitrate} options={bitrateOptions} />
              </FormRow>
            )}
            <FormRow label="Sample rate" help="Keep Source unless you need a specific delivery rate such as 44.1 kHz or 48 kHz.">
              <SelectControl value={audioTools.sampleRate} onChange={audioTools.setSampleRate} options={sampleRateOptions} />
            </FormRow>
            <FormRow label="Channels" help="Keep Source to preserve the original channel layout, or force mono/stereo when exporting.">
              <SelectControl value={audioTools.channels} onChange={audioTools.setChannels} options={channelOptions} />
            </FormRow>
          </div>}

          {audioTools.action !== "transcribe" && <div className="panel">
            <h2>Output</h2>
            {usesModel && <p>48 kHz WAV</p>}
            <FormRow label="Name" help="Output files are saved in the Audio folder inside the general output folder.">
              <Input value={audioTools.outputName} onChange={(event) => audioTools.setOutputName(event.currentTarget.value)} />
            </FormRow>
            <PrimaryButton type="button" disabled={transcription.busy || audioTools.isRunning || audioTools.isLoading || !audioTools.metadata || !audioTools.audioPath || (usesModel && !modelReady)} onClick={audioTools.runAudioJob}>
              Run Action
            </PrimaryButton>
            <SecondaryButton type="button" className="danger-action" disabled={!audioTools.isRunning} onClick={audioTools.cancelAudioJob}>
              Cancel
            </SecondaryButton>
          </div>

          }
          <div className="panel">
            <h2>Metadata</h2>
            {audioTools.metadata ? (
              <>
                <p><FieldLabel help="Detected audio codec from FFprobe.">Codec</FieldLabel> {audioTools.metadata.codec || "Unknown"}</p>
                <p><FieldLabel help="Detected sample rate from FFprobe.">Sample rate</FieldLabel> {audioTools.metadata.sampleRate || 0} Hz</p>
                <p><FieldLabel help="Detected channel count from FFprobe.">Channels</FieldLabel> {audioTools.metadata.channels || 0}</p>
                <p><FieldLabel help="Detected total duration.">Duration</FieldLabel> {formatTime(audioTools.metadata.duration)}</p>
              </>
            ) : (
              <p>No audio loaded</p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
