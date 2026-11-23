import type { Transcription } from "@/hooks/use-transcription";
import { SubtitleEditor } from "@/components/transcription-tools";
import { formatEtaDuration, type EtaEstimate } from "@/lib/eta";
import { Timer } from "lucide-react";
import { SecondaryButton } from "@/components/app-controls";

type LogPanelProps = {
  transcription?: Transcription;
  lines: string[];
  onRetryToolChecks?: () => void;
  eta?: EtaEstimate;
  progress?: number;
  step?: string;
};

export function LogPanel({ transcription, lines, onRetryToolChecks, eta, progress = 0, step = "Idle" }: LogPanelProps) {
  const safeProgress = Math.max(0, Math.min(100, progress));

  return (
    <aside className="log-panel">
      {transcription?.busy ? <div className="eta-panel" role="status"><strong>WhisperX</strong><span>{transcription.step}</span></div> : <div className="eta-panel" title={eta?.detail || "Choose an AI model action to estimate runtime."}>
        <div className="eta-strip">
          <Timer className="app-icon" />
          <strong>ETA:</strong>
          <code>{formatEtaDuration(eta?.milliseconds ?? null)}</code>
        </div>
        <div className="eta-progress" aria-label={`Current progress ${safeProgress.toFixed(1)}%`}>
          <span style={{ width: `${safeProgress}%` }} />
        </div>
        <div className="job-step" title={step}>{step}</div>
      </div>
      }
      {transcription && <div className="subtitle-tabs" role="tablist" aria-label="Results panel">
        <button type="button" role="tab" aria-selected={transcription.tab === "subtitles"} onClick={() => transcription.setTab("subtitles")}>Subtitles</button>
        <button type="button" role="tab" aria-selected={transcription.tab === "log"} onClick={() => transcription.setTab("log")}>Log</button>
      </div>}
      {transcription?.tab === "subtitles" ? <SubtitleEditor tools={transcription} /> : <div className="log-scroll">
        <div className="log-heading">
          <h2>Log</h2>
          {onRetryToolChecks && <SecondaryButton type="button" size="sm" onClick={onRetryToolChecks}>Retry checks</SecondaryButton>}
        </div>
        <pre>{lines.join("\n")}</pre>
      </div>}
    </aside>
  );
}
