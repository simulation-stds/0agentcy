import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type ToolStatus = {
  ffmpeg: string | null;
  ffprobe: string | null;
  realesrgan: string | null;
  rife: string | null;
  supir: string | null;
  facefusion: string | null;
  git: string | null;
  conda: string | null;
  cudnn: string | null;
  imagemagick: string | null;
  oxipng: string | null;
  libavif: string | null;
  libwebp: string | null;
  mozjpeg: string | null;
};

export type RealEsrganModel = {
  name: string;
  scale: string;
  description: string;
  sizeBytes: number;
  sizeLabel: string;
  estimatedSizeLabel: string;
};

export type RealEsrganDevice = {
  id: string;
  name: string;
};

export type RifeModel = {
  name: string;
  description: string;
  sizeBytes: number;
  sizeLabel: string;
  estimatedSizeLabel: string;
};

export type SupirModel = {
  name: string;
  label: string;
  fileName: string;
  description: string;
  required: boolean;
  installed: boolean;
  installedPath: string;
  directDownload: boolean;
  sizeBytes: number;
  sizeLabel: string;
  estimatedSizeLabel: string;
  sourceLabel: string;
  downloadUrl: string;
};

export type ToolStorage = {
  key: string;
  label: string;
  currentBytes: number;
  currentLabel: string;
  estimatedInstallLabel: string;
};

export type FaceFusionStatus = {
  state: "missing" | "needs_setup" | "installed";
  repoPath: string;
  envName: string;
  currentSizeLabel: string;
  estimatedInstallLabel: string;
  availableProviders: string[];
  runtimeLabel: string;
  providerWarning: string;
  message: string;
};

export type SupirStatus = {
  state: "missing" | "needs_setup" | "installed";
  repoPath: string;
  envName: string;
  checkpointPath: string;
  currentSizeLabel: string;
  estimatedInstallLabel: string;
  cudaReady: boolean;
  checkpointsReady: boolean;
  xformersReady: boolean;
  xformersVersion: string;
  xformersMessage: string;
  message: string;
};

type UseToolStateArgs = {
  appendLog: (message: string) => void;
};

export function useToolState({ appendLog }: UseToolStateArgs) {
  const [tools, setTools] = useState<ToolStatus | null>(null);
  const [models, setModels] = useState<RealEsrganModel[]>([]);
  const [rifeModels, setRifeModels] = useState<RifeModel[]>([]);
  const [supirModels, setSupirModels] = useState<SupirModel[]>([]);
  const [faceFusionStatus, setFaceFusionStatus] = useState<FaceFusionStatus | null>(null);
  const [supirStatus, setSupirStatus] = useState<SupirStatus | null>(null);
  const [toolStorage, setToolStorage] = useState<ToolStorage[]>([]);
  const [devices, setDevices] = useState<RealEsrganDevice[]>([]);

  async function refreshToolState() {
    try {
      setTools(await invoke<ToolStatus>("detect_tools"));
    } catch (error) {
      appendLog(`Tool detection failed: ${String(error)}`);
    }

    try {
      const items = await invoke<RealEsrganModel[]>("list_realesrgan_models");
      setModels(items);
    } catch (error) {
      appendLog(`Real-ESRGAN model scan failed: ${String(error)}`);
    }

    try {
      const items = await invoke<RifeModel[]>("list_rife_models");
      setRifeModels(items);
    } catch (error) {
      appendLog(`RIFE model scan failed: ${String(error)}`);
    }

    try {
      const items = await invoke<SupirModel[]>("list_supir_models");
      setSupirModels(items);
    } catch (error) {
      appendLog(`SUPIR model scan failed: ${String(error)}`);
    }

    try {
      setFaceFusionStatus(await invoke<FaceFusionStatus>("detect_facefusion"));
    } catch (error) {
      appendLog(`FaceFusion scan failed: ${String(error)}`);
    }

    try {
      setSupirStatus(await invoke<SupirStatus>("detect_supir"));
    } catch (error) {
      appendLog(`SUPIR scan failed: ${String(error)}`);
    }

    try {
      setDevices(await invoke<RealEsrganDevice[]>("detect_realesrgan_devices"));
    } catch (error) {
      appendLog(`GPU detection failed: ${String(error)}`);
    }

    try {
      setToolStorage(await invoke<ToolStorage[]>("get_tool_storage"));
    } catch (error) {
      appendLog(`Tool storage scan failed: ${String(error)}`);
    }
  }

  return {
    tools,
    models,
    rifeModels,
    supirModels,
    faceFusionStatus,
    supirStatus,
    toolStorage,
    devices,
    refreshToolState,
  };
}
