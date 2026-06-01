import { LogPanel } from "@/components/log-panel";
import { AudioPreview } from "@/components/previews/audio-preview";
import { AudioSidebar } from "@/components/sidebars/audio-sidebar";
import type { useAudioTools } from "@/hooks/use-audio-tools";
import { estimateAudioEta } from "@/lib/eta";

export function AudioWorkspace({
  audioTools,
  log,
  jobProgress,
  jobStep,
}: {
  audioTools: ReturnType<typeof useAudioTools>;
  log: string[];
  jobProgress: number;
  jobStep: string;
}) {
  const eta = estimateAudioEta({
    action: audioTools.action,
    metadata: audioTools.metadata,
    selectedDuration: Math.max(0, audioTools.trimEnd - audioTools.trimStart),
    outputFormat: audioTools.outputFormat,
    saveSelection: audioTools.saveSelection,
  });

  return (
    <section className="workspace">
      <AudioSidebar audioTools={audioTools} />
      <AudioPreview audioTools={audioTools} />
      <LogPanel lines={log} eta={eta} progress={jobProgress} step={jobStep} />
    </section>
  );
}
