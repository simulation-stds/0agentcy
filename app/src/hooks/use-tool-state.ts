import { ToolCheckCache } from "@/lib/tool-check-cache";
import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type ToolStatus = {
  ffmpeg: string | null;
  ffprobe: string | null;
  realesrgan: string | null;
  rife: string | null;
  supir: string | null;
  vosr: string | null;
  flux2: string | null;
  wan21: string | null;
  wan22: string | null;
  facefusion: string | null;
  git: string | null;
  conda: string | null;
  cudnn: string | null;
  windowsDeveloperMode: string | null;
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

export type VosrDevice = { id: string; name: string };

export type VosrStatus = {
  cudaDevices: VosrDevice[];
  state: "missing" | "needs_setup" | "installed";
  path: string;
  environmentPath: string;
  modelPath: string;
  runtimeReady: boolean;
  modelsReady: boolean;
  cudaReady: boolean;
  message: string;
};

export type SupirStatus = {
  cudaDevices: VosrDevice[] | null;
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

export type Flux2Status = {
  state: "missing" | "needs_setup" | "installed";
  toolPath: string;
  envName: string;
  cachePath: string;
  currentSizeLabel: string;
  estimatedInstallLabel: string;
  runtimeReady: boolean;
  cudaReady: boolean;
  cudaLabel: string;
  torchVersion: string;
  diffusersVersion: string;
  transformersVersion: string;
  accelerateVersion: string;
  message: string;
};

export type Wan22Status = {
  state: "missing" | "needs_setup" | "installed";
  toolPath: string;
  repoPath: string;
  modelPath: string;
  cachePath: string;
  envName: string;
  currentSizeLabel: string;
  estimatedInstallLabel: string;
  runtimeReady: boolean;
  modelReady: boolean;
  cudaReady: boolean;
  cudaLabel: string;
  torchVersion: string;
  transformersVersion: string;
  diffusersVersion: string;
  accelerateVersion: string;
  flashAttnReady: boolean;
  flashAttnMessage: string;
  message: string;
};

export type Wan21Status = {
  state: "missing" | "needs_setup" | "installed";
  toolPath: string;
  repoPath: string;
  modelPath: string;
  cachePath: string;
  envName: string;
  currentSizeLabel: string;
  estimatedInstallLabel: string;
  runtimeReady: boolean;
  modelReady: boolean;
  cudaReady: boolean;
  cudaLabel: string;
  torchVersion: string;
  transformersVersion: string;
  diffusersVersion: string;
  accelerateVersion: string;
  flashAttnReady: boolean;
  flashAttnMessage: string;
  message: string;
};

export type ToolKey = keyof ToolStatus | "devices";
export type CheckState = "checking" | "checked" | "failed";

type UseToolStateArgs = {
  appendLog: (message: string) => void;
};

export function useToolState({ appendLog }: UseToolStateArgs) {
  const [tools, setTools] = useState<ToolStatus | null>(null);
  const [models, setModels] = useState<RealEsrganModel[]>([]);
  const [rifeModels, setRifeModels] = useState<RifeModel[]>([]);
  const [supirModels, setSupirModels] = useState<SupirModel[]>([]);
  const [faceFusionStatus, setFaceFusionStatus] = useState<FaceFusionStatus | null>(null);
  const [vosrStatus, setVosrStatus] = useState<VosrStatus | null>(null);
  const [supirStatus, setSupirStatus] = useState<SupirStatus | null>(null);
  const [flux2Status, setFlux2Status] = useState<Flux2Status | null>(null);
  const [wan21Status, setWan21Status] = useState<Wan21Status | null>(null);
  const [wan22Status, setWan22Status] = useState<Wan22Status | null>(null);
  const [toolStorage, setToolStorage] = useState<ToolStorage[]>([]);
  const [devices, setDevices] = useState<RealEsrganDevice[]>([]);

  const cache = useRef(new ToolCheckCache());
  const logRef = useRef(appendLog);
  logRef.current = appendLog;
  const [checks, setChecks] = useState<Record<string, CheckState>>({});

  const ensureTool = useCallback(async (tool: ToolKey, force = false) => {
    try {
      await cache.current.run(tool, async () => {
        setChecks(previous => ({ ...previous, [tool]: "checking" }));
        logRef.current(`Checking ${tool}...`);
        try {
          const result = await invoke<{ path: string | null; models?: unknown; status?: unknown; devices?: RealEsrganDevice[] }>("probe_tool", { tool });
          if (tool === "devices") setDevices(result.devices || []);
          else setTools(previous => ({ ...previous, [tool]: result.path ?? null } as ToolStatus));
          if (tool === "realesrgan") setModels(result.models as RealEsrganModel[]);
          if (tool === "rife") setRifeModels(result.models as RifeModel[]);
          if (tool === "supir") { setSupirModels(result.models as SupirModel[]); setSupirStatus(result.status as SupirStatus); }
          if (tool === "facefusion") setFaceFusionStatus(result.status as FaceFusionStatus);
          if (tool === "vosr") setVosrStatus(result.status as VosrStatus);
          if (tool === "flux2") setFlux2Status(result.status as Flux2Status);
          if (tool === "wan21") setWan21Status(result.status as Wan21Status);
          if (tool === "wan22") setWan22Status(result.status as Wan22Status);
          setChecks(previous => ({ ...previous, [tool]: "checked" }));
        } catch (error) {
          setChecks(previous => ({ ...previous, [tool]: "failed" }));
          logRef.current(`${tool} check failed: ${String(error)}`);
          throw error;
        }
      }, force);
    } catch {
      // The probe records its own failure even when several callers share it.
    }
  }, []);

  const ensureStorage = useCallback(async (tool: string, force = false) => {
    try {
      await cache.current.run(`storage:${tool}`, async () => {
        const items = await invoke<ToolStorage[]>("probe_tool_storage", { tool });
        setToolStorage(previous => [...previous.filter(item => item.key !== tool), ...items]);
      }, force);
    } catch (error) { logRef.current(`Storage check failed: ${String(error)}`); }
  }, []);

  // No argument refreshes only previously requested checks, never every installed runtime.
  const refreshToolState = useCallback(async (affected?: ToolKey[]) => {
    const keys = affected || cache.current.keys().filter(key => !key.startsWith("storage:")) as ToolKey[];
    await Promise.all(keys.map(key => ensureTool(key, true)));
    const storageKeys = affected ? affected.map(key => key === "conda" ? "miniforge" : key) : cache.current.keys().filter(key => key.startsWith("storage:")).map(key => key.slice(8));
    await Promise.all(storageKeys.filter(key => cache.current.keys().includes(`storage:${key}`)).map(key => ensureStorage(key, true)));
  }, [ensureTool, ensureStorage]);

  return {
    tools,
    models,
    rifeModels,
    supirModels,
    faceFusionStatus,
    supirStatus,
    vosrStatus,
    flux2Status,
    wan21Status,
    wan22Status,
    toolStorage,
    devices,
    refreshToolState,
    ensureTool,
    ensureStorage,
    checks,
  };
}
