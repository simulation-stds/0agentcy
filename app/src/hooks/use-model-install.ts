import { useState } from "react";
import { installModelCatalog, type InstalledModelLike, type ModelTool } from "@/lib/app-options";

type UseModelInstallArgs = {
  models: InstalledModelLike[];
  rifeModels: InstalledModelLike[];
  updateRealEsrgan: (selectedModels?: string[]) => Promise<void>;
  updateRife: (selectedModels?: string[]) => Promise<void>;
};

export function useModelInstall({ models, rifeModels, updateRealEsrgan, updateRife }: UseModelInstallArgs) {
  const [isModelInstallOpen, setIsModelInstallOpen] = useState(false);
  const [modelInstallTool, setModelInstallTool] = useState<ModelTool>("realesrgan");
  const [selectedInstallModels, setSelectedInstallModels] = useState<string[]>([]);
  const activeInstallCatalog = installModelCatalog[modelInstallTool];

  function openModelInstall(tool: ModelTool) {
    setModelInstallTool(tool);
    const installed = tool === "realesrgan"
      ? models.map((item) => item.name)
      : rifeModels.map((item) => item.name);
    const fallback = tool === "realesrgan"
      ? ["realesr-animevideov3-x2"]
      : ["rife-v4.6"];
    setSelectedInstallModels(installed.length ? installed : fallback);
    setIsModelInstallOpen(true);
  }

  function toggleInstallModel(name: string) {
    setSelectedInstallModels((items) =>
      items.includes(name) ? items.filter((item) => item !== name) : [...items, name],
    );
  }

  async function confirmModelInstall() {
    setIsModelInstallOpen(false);
    if (modelInstallTool === "realesrgan") {
      await updateRealEsrgan(selectedInstallModels);
    } else {
      await updateRife(selectedInstallModels);
    }
  }

  return {
    isModelInstallOpen,
    modelInstallTool,
    selectedInstallModels,
    activeInstallCatalog,
    setIsModelInstallOpen,
    openModelInstall,
    toggleInstallModel,
    confirmModelInstall,
  };
}
