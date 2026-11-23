import { useCallback, useContext, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SecondaryButton } from "@/components/app-controls";
import { ToolCheckContext } from "@/components/settings/tool-check-context";

type Status = { path: string; installed: boolean; version: string | null; ready: boolean | null; error: string | null };
export function RealEsrganRuntimeSettings({ installing, onRepair }: { installing: boolean; onRepair: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const checks = useContext(ToolCheckContext);
  const refresh = useCallback(() => {
    void invoke<Status>("realesrgan_status").then(setStatus).catch(e => setError(String(e)));
  }, []);
  useEffect(refresh, [refresh, installing, checks?.checks.realesrgan]);
  async function action(command: "check_realesrgan" | "uninstall_realesrgan") {
    setBusy(true); setError("");
    try {
      setStatus(await invoke<Status>(command));
      checks?.retry("realesrgan"); checks?.retry("devices");
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  return <div className="settings-grid">
    <p>The runtime and models are shared by all projects for your user account. No administrator access or Python environment is needed. Your GPU needs a working Vulkan driver.</p>
    <code style={{overflowWrap:"anywhere"}}>{status?.path || "Loading shared installation location…"}</code>
    <p role="status">{busy ? "Working…" : status?.installed ? `${status.version || "Runtime installed"} · ${status.ready === true ? "GPU check passed" : status.ready === false ? "GPU needs attention" : "GPU not checked this session"}` : "Runtime not installed"}</p>
    {(error || status?.error) && <p role="alert" style={{whiteSpace:"pre-wrap"}}>{error || status?.error}</p>}
    <div className="tool-dropdown-actions">
      <SecondaryButton disabled={busy || installing || !status?.installed} onClick={() => void action("check_realesrgan")}>Check installation</SecondaryButton>
      <SecondaryButton disabled={busy || installing} onClick={onRepair}>{status?.installed ? "Repair installation" : "Install runtime + suggested model"}</SecondaryButton>
      <SecondaryButton className="danger-action" disabled={busy || installing || !status?.installed} onClick={() => void action("uninstall_realesrgan")}>Uninstall runtime and models</SecondaryButton>
    </div>
  </div>;
}
