import { useEffect, useMemo } from "react";
import {
  cudaBinPath,
  faceFusionProviderOptions,
  installModelCatalog,
  mergeModelRows,
  type AppSettings,
} from "@/lib/app-options";
import type {
  FaceFusionStatus,
  RealEsrganDevice,
  RealEsrganModel,
  RifeModel,
  ToolStatus,
  ToolStorage,
} from "@/hooks/use-tool-state";

function recommendedRuntimeForDevice(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("nvidia") || lower.includes("geforce") || lower.includes("rtx") || lower.includes("gtx") || lower.includes("quadro")) {
    return "CUDA";
  }
  if (lower.includes("intel") || lower.includes("arc") || lower.includes("iris") || lower.includes("uhd")) {
    return "OpenVINO";
  }
  if (lower.includes("amd") || lower.includes("radeon")) {
    return "DirectML";
  }
  if (lower.includes("cpu")) {
    return "CPU";
  }
  return "DirectML";
}

type UseDerivedUiStateArgs = {
  appSettings: AppSettings;
  selectedModel: string;
  selectedFrames: number;
  rifeMultiplier: string;
  models: RealEsrganModel[];
  rifeModels: RifeModel[];
  devices: RealEsrganDevice[];
  faceFusionStatus: FaceFusionStatus | null;
  faceFusionProvider: string;
  setFaceFusionProvider: (value: string) => void;
  tools: ToolStatus | null;
  toolStorage: ToolStorage[];
};

export function useDerivedUiState({
  appSettings,
  selectedModel,
  selectedFrames,
  rifeMultiplier,
  models,
  rifeModels,
  devices,
  faceFusionStatus,
  faceFusionProvider,
  setFaceFusionProvider,
  tools,
  toolStorage,
}: UseDerivedUiStateArgs) {
  const activeModel = models.find((item) => item.name === selectedModel);
  const roughUpscaleEta = selectedFrames ? `${Math.ceil(selectedFrames / 3)}s+` : "Load video first";
  const roughRifeEta = selectedFrames ? `${Math.ceil(selectedFrames * Number(rifeMultiplier || 2) / 12)}s+` : "Load video first";
  const detectedDeviceRows = [
    ...devices.map((item, index) => ({
      index: index + 1,
      id: item.id,
      name: `GPU ${item.id} - ${item.name}`,
      runtime: recommendedRuntimeForDevice(item.name),
    })),
    { index: devices.length + 1, id: "", name: "CPU", runtime: "CPU" },
  ];
  const availableFaceFusionProviders = faceFusionStatus?.availableProviders?.length
    ? faceFusionProviderOptions.filter((item) => faceFusionStatus.availableProviders.includes(item.provider))
    : faceFusionProviderOptions;
  const hasNvidiaGpu = devices.some((item) => recommendedRuntimeForDevice(item.name) === "CUDA");
  const hasUsableCuda = Boolean(faceFusionStatus?.availableProviders?.includes("CUDAExecutionProvider"));
  const hasCudaWarning = Boolean(faceFusionStatus?.providerWarning?.toLowerCase().includes("cuda"));
  const cudaStatusClass = hasUsableCuda ? "installed" : hasNvidiaGpu || hasCudaWarning ? "update" : "missing";
  const cudaStatusLabel = hasUsableCuda ? "Runtime ready" : hasNvidiaGpu || hasCudaWarning ? "Needs CUDA 12.x DLLs" : "External";
  const hasCudnn = Boolean(tools?.cudnn);
  const cudnnStatusClass = hasCudnn ? "installed" : hasNvidiaGpu || hasCudaWarning ? "update" : "missing";
  const cudnnStatusLabel = hasCudnn ? "Installed" : hasNvidiaGpu || hasCudaWarning ? "Needs cuDNN 9" : "External";
  const cudaFolderLabel = appSettings.cudaBinFolder || (hasUsableCuda ? cudaBinPath : "CUDA v12.x bin folder");
  const cudnnFolderLabel = appSettings.cudnnBinFolder || tools?.cudnn || "cuDNN 9 bin folder";
  const allServicesAvailable = Boolean(tools?.ffmpeg && tools?.ffprobe && tools?.git && tools?.conda && tools?.realesrgan && tools?.rife);
  const storageFor = (key: string) => toolStorage.find((item) => item.key === key);
  const realEsrganModelRows = useMemo(
    () => mergeModelRows(installModelCatalog.realesrgan, models, "Installed Real-ESRGAN model detected locally."),
    [models],
  );
  const rifeModelRows = useMemo(
    () => mergeModelRows(installModelCatalog.rife, rifeModels, "Installed RIFE model detected locally."),
    [rifeModels],
  );
  const modelCountLabel = (installed: number, catalogTotal: number) =>
    installed > catalogTotal ? `${installed} installed` : `${installed}/${catalogTotal} models`;

  useEffect(() => {
    if (!availableFaceFusionProviders.length) return;
    if (!availableFaceFusionProviders.some((item) => item.value === faceFusionProvider)) {
      setFaceFusionProvider(availableFaceFusionProviders[0].value);
    }
  }, [availableFaceFusionProviders, faceFusionProvider, setFaceFusionProvider]);

  return {
    activeModel,
    roughUpscaleEta,
    roughRifeEta,
    detectedDeviceRows,
    availableFaceFusionProviders,
    hasUsableCuda,
    hasCudaWarning,
    cudaStatusClass,
    cudaStatusLabel,
    hasCudnn,
    cudnnStatusClass,
    cudnnStatusLabel,
    cudaFolderLabel,
    cudnnFolderLabel,
    allServicesAvailable,
    storageFor,
    realEsrganModelRows,
    rifeModelRows,
    modelCountLabel,
  };
}
