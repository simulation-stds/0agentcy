import type { Transcription } from "@/hooks/use-transcription";
import { SubtitleTimeline } from "@/components/transcription-tools";
import { LogPanel } from "@/components/log-panel";
import { AudioPreview } from "@/components/previews/audio-preview";
import { AudioSidebar } from "@/components/sidebars/audio-sidebar";
import type { useAudioTools } from "@/hooks/use-audio-tools";
import { isAudioModel } from "@/hooks/use-audio-models";
import { estimateAudioEta } from "@/lib/eta";

export function AudioWorkspace({
  transcription,
  audioTools,
  modelReady,
  onOpenAudioSettings,
  log,
  onRetryToolChecks,
  jobProgress,
  jobStep,
}: {
  transcription: Transcription;
  audioTools: ReturnType<typeof useAudioTools>;
  modelReady: boolean;
  onOpenAudioSettings: () => void;
  log: string[];
  onRetryToolChecks?: () => void;
  jobProgress: number;
  jobStep: string;
}) {
  const eta = isAudioModel(audioTools.action) ? undefined : estimateAudioEta({
    action: audioTools.action,
    metadata: audioTools.metadata,
    selectedDuration: Math.max(0, audioTools.trimEnd - audioTools.trimStart),
    outputFormat: audioTools.outputFormat,
    saveSelection: audioTools.saveSelection,
  });

  return (
    <section className="workspace">
      <AudioSidebar transcription={transcription} audioTools={audioTools} modelReady={modelReady} onOpenAudioSettings={onOpenAudioSettings} />
      <div className="preview-stack"><AudioPreview transcription={transcription} audioTools={audioTools} /><SubtitleTimeline tools={transcription} /></div>
      <LogPanel transcription={transcription} lines={log} onRetryToolChecks={onRetryToolChecks} eta={eta} progress={jobProgress} step={jobStep} />
    </section>
  );
}
