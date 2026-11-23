import { useEffect, useState } from "react";
import { FormRow, PrimaryButton, SecondaryButton, SelectControl } from "@/components/app-controls";
import { audioModelNames, type AudioModel, type BanditDevice, type useAudioModels } from "@/hooks/use-audio-models";

const models = ["bandit", "deepfilter"] as const satisfies readonly AudioModel[];

export function AudioModelSettings({ audioModels }: { audioModels: ReturnType<typeof useAudioModels> }) {
  const { statuses, errors, busy, progress, refresh, manage } = audioModels;
  const [selectedDevice, setSelectedDevice] = useState<BanditDevice>();
  const device = selectedDevice ?? statuses.bandit?.banditDevice ?? "cpu";

  useEffect(() => {
    for (const model of models) void refresh(model);
  }, [refresh]);

  return models.map((model) => {
    const status = statuses[model];
    const working = busy === model;
    const ready = status?.installed;
    const changingDevice = model === "bandit" && device !== status?.banditDevice;
    const deviceLabel = device === "cuda" ? "NVIDIA CUDA" : "CPU";
    const state = working ? "Working…" : ready ? "Ready" : status?.hasFiles ? "Needs setup" : status ? "Missing" : errors[model] ? "Unavailable" : "Checking…";

    return (
      <section className="tool-dropdown-body" key={model} aria-label={audioModelNames[model]}>
        <div className="model-title-row">
          <strong>{audioModelNames[model]}</strong>
          <span className={`status-chip ${ready && !working ? "installed" : "missing"}`}>{state}</span>
        </div>
        {model === "bandit" ? (
          <>
            <p>Separate dialogue, music, and effects. CPU and NVIDIA CUDA use separate runtimes and share a 447 MB checkpoint. Setup uses uv on Linux or Miniforge on Windows.</p>
            <FormRow label="Runtime">
              <SelectControl
                value={device}
                disabled={Boolean(busy)}
                onChange={(value) => setSelectedDevice(value as BanditDevice)}
                options={[
                  { value: "cpu", label: "CPU" },
                  { value: "cuda", label: "NVIDIA GPU (CUDA 12.6)" },
                ]}
              />
            </FormRow>
            <p>Active runtime {ready ? (status?.banditDevice === "cuda" ? "NVIDIA CUDA" : "CPU") : "unavailable"} · Model {status?.modelReady ? "downloaded" : "missing"}</p>
            <p className="settings-note">Weights by Karn N. Watcharasupat, Chih-Wei Wu, and Iroro Orife. Zenodo DOI 10.5281/zenodo.12701995 · CC BY-SA 4.0.</p>
          </>
        ) : (
          <p>Reduce background noise in speech. CPU executable with a built-in model.</p>
        )}
        {status && <code title={status.path}>{status.path}</code>}
        {working && <p role="status">{progress?.message ?? "Preparing…"}</p>}
        {errors[model] && <p role="alert">{errors[model]}</p>}
        <div className="tool-dropdown-actions">
          {!status && errors[model] && <SecondaryButton type="button" onClick={() => void refresh(model)}>Retry check</SecondaryButton>}
          <PrimaryButton type="button" disabled={Boolean(busy) || !status} onClick={() => void manage(model, false, model === "bandit" ? device : undefined)}>
            {changingDevice ? `Set up ${deviceLabel}` : status?.hasFiles ? "Repair" : "Install"}
          </PrimaryButton>
          {status?.hasFiles && (
            <SecondaryButton type="button" disabled={Boolean(busy)} onClick={() => void manage(model, true)}>
              Uninstall
            </SecondaryButton>
          )}
        </div>
      </section>
    );
  });
}
