import { PrimaryButton, SecondaryButton } from "@/components/app-controls";
import type { VosrStatus } from "@/hooks/use-tool-state";

export function VosrSettings({ status, installing, onInstall, onCancel }: {
  status: VosrStatus | null;
  installing: boolean;
  onInstall: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="panel">
      <h3>VOSR 2.0</h3>
      <p>Upscale realistic photos locally. Setup downloads a dedicated environment and several GB of models, reused across all checkouts.</p>
      <p role="status">{installing ? "Installing VOSR 2.0… Progress appears in the activity log." : status?.message || "Checking installation…"}</p>
      <div className="tool-dropdown-actions">
        <PrimaryButton disabled={installing} onClick={onInstall}>
          {installing ? "Installing…" : status?.state === "installed" ? "Repair installation" : "Install VOSR 2.0"}
        </PrimaryButton>
        {installing && <SecondaryButton onClick={onCancel}>Cancel installation</SecondaryButton>}
      </div>
      {status && (
        <details>
          <summary>Storage locations</summary>
          <p>Environment: <code className="file-path-text">{status.environmentPath}</code></p>
          <p>Shared models: <code className="file-path-text">{status.modelPath}</code></p>
        </details>
      )}
    </section>
  );
}
