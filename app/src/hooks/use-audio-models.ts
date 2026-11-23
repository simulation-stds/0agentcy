import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const audioModelNames = { bandit: "Bandit v2", deepfilter: "DeepFilterNet" } as const;
export type AudioModel = keyof typeof audioModelNames;

export type BanditDevice = "cpu" | "cuda";

type AudioModelStatus = {
  installed: boolean;
  banditDevice: BanditDevice | null;
  runtimeReady: boolean;
  modelReady: boolean;
  hasFiles: boolean;
  path: string;
};

type InstallProgress = {
  stage: string;
  message: string;
  progress?: number;
};

export function isAudioModel(action: string): action is AudioModel {
  return action === "bandit" || action === "deepfilter";
}

export function useAudioModels() {
  const [statuses, setStatuses] = useState<Partial<Record<AudioModel, AudioModelStatus>>>({});
  const [errors, setErrors] = useState<Partial<Record<AudioModel, string>>>({});
  const [busy, setBusy] = useState<AudioModel>();
  const [progress, setProgress] = useState<InstallProgress>();

  useEffect(() => {
    if (!busy) return;
    let active = true;
    const unlisten = listen<InstallProgress>("upscale-progress", ({ payload }) => {
      if (active && payload.stage === audioModelNames[busy]) setProgress(payload);
    });
    return () => {
      active = false;
      void unlisten.then((cleanup) => cleanup()).catch(() => {});
    };
  }, [busy]);

  const refresh = useCallback(async (model: AudioModel) => {
    try {
      const status = await invoke<AudioModelStatus>("audio_model_status", { model });
      setStatuses((previous) => ({ ...previous, [model]: status }));
      setErrors((previous) => ({ ...previous, [model]: undefined }));
    } catch (error) {
      setErrors((previous) => ({ ...previous, [model]: String(error) }));
    }
  }, []);

  async function manage(model: AudioModel, uninstall: boolean, banditDevice?: BanditDevice) {
    setBusy(model);
    setProgress(undefined);
    setErrors((previous) => ({ ...previous, [model]: undefined }));
    try {
      const status = await invoke<AudioModelStatus>("manage_audio_model", { model, uninstall, banditDevice });
      setStatuses((previous) => ({ ...previous, [model]: status }));
    } catch (error) {
      await refresh(model);
      setErrors((previous) => ({ ...previous, [model]: String(error) }));
    } finally {
      setBusy(undefined);
    }
  }

  return { statuses, errors, busy, progress, refresh, manage };
}
