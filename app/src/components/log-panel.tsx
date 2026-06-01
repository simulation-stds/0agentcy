import { formatEtaDuration, type EtaEstimate } from "@/lib/eta";

type LogPanelProps = {
  lines: string[];
  eta?: EtaEstimate;
  progress?: number;
  step?: string;
};

export function LogPanel({ lines, eta, progress = 0, step = "Idle" }: LogPanelProps) {
  const safeProgress = Math.max(0, Math.min(100, progress));

  return (
    <aside className="log-panel">
      <div className="eta-panel" title={eta?.detail || "Choose an AI model action to estimate runtime."}>
        <div className="eta-strip">
          <span className="material-symbols-rounded" aria-hidden="true">timer</span>
          <strong>ETA:</strong>
          <code>{formatEtaDuration(eta?.milliseconds ?? null)}</code>
        </div>
        <div className="eta-progress" aria-label={`Current progress ${safeProgress.toFixed(1)}%`}>
          <span style={{ width: `${safeProgress}%` }} />
        </div>
        <div className="job-step" title={step}>{step}</div>
      </div>
      <div className="log-scroll">
        <h2>Log</h2>
        <pre>{lines.join("\n")}</pre>
      </div>
    </aside>
  );
}
