import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useModelCompareInteraction } from "@/hooks/use-model-compare-interaction";
import { formatTime } from "@/lib/media-utils";
import { resolveModelDevice } from "@/lib/model-devices";

type ModelPreview = {
  model: string;
  scale: string;
  dataUrl?: string;
  data_url?: string;
};

type ModelCompareResult = {
  originalDataUrl?: string;
  original_data_url?: string;
  previews: ModelPreview[];
};

type UseModelCompareArgs = {
  metadata: unknown | null;
  inputPath: string;
  currentTime: number;
  selectedDevice: string;
  preferredModelDevice: string;
  tileSize: string;
  threads: string;
  appendLog: (message: string) => void;
};

export function useModelCompare({
  metadata,
  inputPath,
  currentTime,
  selectedDevice,
  preferredModelDevice,
  tileSize,
  threads,
  appendLog,
}: UseModelCompareArgs) {
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isComparingModels, setIsComparingModels] = useState(false);
  const [modelPreviews, setModelPreviews] = useState<ModelPreview[]>([]);
  const [compareOriginal, setCompareOriginal] = useState("");
  const [compareInputPath, setCompareInputPath] = useState("");
  const [selectedCompareModel, setSelectedCompareModel] = useState("");
  const [compareFrameTime, setCompareFrameTime] = useState(0);
  const {
    compareViewRef,
    compareSplit,
    compareZoom,
    compareTransform,
    compareDragMode,
    setCompareZoom,
    setComparePan,
    resetCompareInteraction,
    startCompareInteraction,
    updateCompareInteraction,
    stopCompareInteraction,
    scrollCompare,
  } = useModelCompareInteraction();

  const selectedComparePreview = modelPreviews.find((item) => item.model === selectedCompareModel) || modelPreviews[0];
  const currentInputKey = inputPath.trim();
  const hasCurrentVideoComparison = Boolean(compareOriginal && compareInputPath === currentInputKey);

  async function compareModels() {
    if (!metadata) {
      appendLog("Load a video before testing models.");
      return;
    }

    setIsCompareOpen(true);
    if (isComparingModels) {
      appendLog("Model comparison is already running.");
      return;
    }

    setIsComparingModels(true);
    setModelPreviews([]);
    setCompareOriginal("");
    setCompareInputPath(inputPath.trim());
    setSelectedCompareModel("");
    setCompareFrameTime(currentTime);
    resetCompareInteraction();
    appendLog(`Testing Real-ESRGAN models at ${formatTime(currentTime)}...`);
    try {
      const result = await invoke<ModelCompareResult>("compare_realesrgan_models", {
        path: inputPath.trim(),
        currentTime,
        device: resolveModelDevice(selectedDevice, preferredModelDevice),
        tileSize,
        threads,
      });
      setCompareOriginal(result.originalDataUrl || result.original_data_url || "");
      setCompareInputPath(inputPath.trim());
      setModelPreviews(result.previews);
      setSelectedCompareModel(result.previews[0]?.model || "");
      appendLog(`Generated ${result.previews.length} model previews.`);
    } catch (error) {
      appendLog(`Model test failed: ${String(error).trim()}`);
    } finally {
      setIsComparingModels(false);
    }
  }

  function viewLastComparison() {
    if (!hasCurrentVideoComparison) {
      appendLog("No comparison cached for the current video yet.");
      return;
    }
    setIsCompareOpen(true);
  }

  return {
    compareViewRef,
    isCompareOpen,
    isComparingModels,
    modelPreviews,
    compareOriginal,
    compareFrameTime,
    compareSplit,
    compareZoom,
    compareTransform,
    compareDragMode,
    selectedCompareModel,
    selectedComparePreview,
    hasCurrentVideoComparison,
    setIsCompareOpen,
    setSelectedCompareModel,
    compareModels,
    viewLastComparison,
    startCompareInteraction,
    updateCompareInteraction,
    stopCompareInteraction,
    scrollCompare,
    zoomOutCompare: () => setCompareZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2)))),
    resetCompareZoom: () => {
      setCompareZoom(1);
      setComparePan({ x: 0, y: 0 });
    },
    zoomInCompare: () => setCompareZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2)))),
  };
}
