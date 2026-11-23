import type { ToolKey } from "@/hooks/use-tool-state";
import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ImageCodecTool, InstalledModelLike, ModelTool } from "@/lib/app-options";
import { appendTailLog } from "@/lib/job-log";

type JobResult = {
  outputPath: string;
  log: string;
};

type UseToolManagementArgs = {
  faceFusionRuntime: string;
  models: InstalledModelLike[];
  rifeModels: InstalledModelLike[];
  appendLog: (message: string) => void;
  refreshToolState: (affected?: ToolKey[]) => Promise<void>;
};

export function useToolManagement({
  faceFusionRuntime,
  models,
  rifeModels,
  appendLog,
  refreshToolState,
}: UseToolManagementArgs) {
  const [isUpdatingEsrgan, setIsUpdatingEsrgan] = useState(false);
  const [isUpdatingRife, setIsUpdatingRife] = useState(false);
  const [isUpdatingFaceFusion, setIsUpdatingFaceFusion] = useState(false);
  const [isInstallingVosr, setIsInstallingVosr] = useState(false);
  const [isUpdatingFlux2, setIsUpdatingFlux2] = useState(false);
  const [isUpdatingWan21, setIsUpdatingWan21] = useState(false);
  const [isUpdatingWan22, setIsUpdatingWan22] = useState(false);
  const [isUpdatingFfmpeg, setIsUpdatingFfmpeg] = useState(false);
  const [isUpdatingImageMagick, setIsUpdatingImageMagick] = useState(false);
  const [isUpdatingMiniforge, setIsUpdatingMiniforge] = useState(false);
  const [updatingImageCodecTool, setUpdatingImageCodecTool] = useState<ImageCodecTool | "">("");

  const updateRealEsrgan = useCallback(
    async (selectedModels: string[] = []) => {
      setIsUpdatingEsrgan(true);
      appendLog("Starting Real-ESRGAN update...");
      try {
        const result = await invoke<JobResult>("update_realesrgan", { selectedModels });
        appendTailLog(appendLog, result.log);
        appendLog(`Real-ESRGAN ready: ${result.outputPath}`);
        await refreshToolState(["realesrgan", "devices"]);
      } catch (error) {
        appendLog(`Real-ESRGAN update failed: ${String(error).trim()}`);
      } finally {
        setIsUpdatingEsrgan(false);
      }
    },
    [appendLog, refreshToolState],
  );

  const updateRife = useCallback(
    async (selectedModels: string[] = []) => {
      setIsUpdatingRife(true);
      appendLog("Starting RIFE update...");
      try {
        const result = await invoke<JobResult>("update_rife", { selectedModels });
        appendTailLog(appendLog, result.log);
        appendLog(`RIFE ready: ${result.outputPath}`);
        await refreshToolState(["rife"]);
      } catch (error) {
        appendLog(`RIFE update failed: ${String(error).trim()}`);
      } finally {
        setIsUpdatingRife(false);
      }
    },
    [appendLog, refreshToolState],
  );

  const updateFaceFusion = useCallback(async () => {
    setIsUpdatingFaceFusion(true);
    appendLog(`Starting FaceFusion install/update (${faceFusionRuntime})...`);
    try {
      const result = await invoke<JobResult>("install_or_update_facefusion", { onnxruntime: faceFusionRuntime });
      appendTailLog(appendLog, result.log);
      appendLog(`FaceFusion ready: ${result.outputPath}`);
      await refreshToolState(["facefusion"]);
    } catch (error) {
      appendLog(`FaceFusion update failed: ${String(error).trim()}`);
    } finally {
      setIsUpdatingFaceFusion(false);
    }
  }, [appendLog, faceFusionRuntime, refreshToolState]);

  const installVosr = useCallback(async () => {
    setIsInstallingVosr(true);
    appendLog("Starting VOSR 2.0 installation...");
    try {
      const result = await invoke<{ message: string }>("install_vosr");
      appendLog(result.message);
    } catch (error) {
      appendLog(`VOSR installation failed: ${String(error).trim()}`);
    } finally {
      await refreshToolState(["vosr"]);
      setIsInstallingVosr(false);
    }
  }, [appendLog, refreshToolState]);

  const updateFlux2 = useCallback(async () => {
    setIsUpdatingFlux2(true);
    appendLog("Starting Flux.2 install/update...");
    try {
      const result = await invoke<JobResult>("install_or_update_flux2");
      appendTailLog(appendLog, result.log);
      appendLog(`Flux.2 ready: ${result.outputPath}`);
      await refreshToolState(["flux2"]);
    } catch (error) {
      appendLog(`Flux.2 update failed: ${String(error).trim()}`);
    } finally {
      setIsUpdatingFlux2(false);
    }
  }, [appendLog, refreshToolState]);

  const updateWan22 = useCallback(async () => {
    setIsUpdatingWan22(true);
    appendLog("Starting Wan2.2 install/update...");
    try {
      const result = await invoke<JobResult>("install_or_update_wan22");
      appendTailLog(appendLog, result.log);
      appendLog(`Wan2.2 ready: ${result.outputPath}`);
      await refreshToolState(["wan22"]);
    } catch (error) {
      appendLog(`Wan2.2 update failed: ${String(error).trim()}`);
    } finally {
      setIsUpdatingWan22(false);
    }
  }, [appendLog, refreshToolState]);

  const updateWan21 = useCallback(async () => {
    setIsUpdatingWan21(true);
    appendLog("Starting Wan2.1 install/update...");
    try {
      const result = await invoke<JobResult>("install_or_update_wan21");
      appendTailLog(appendLog, result.log);
      appendLog(`Wan2.1 ready: ${result.outputPath}`);
      await refreshToolState(["wan21"]);
    } catch (error) {
      appendLog(`Wan2.1 update failed: ${String(error).trim()}`);
    } finally {
      setIsUpdatingWan21(false);
    }
  }, [appendLog, refreshToolState]);

  const deleteWan22 = useCallback(async () => {
    setIsUpdatingWan22(true);
    appendLog("Removing Wan2.2...");
    try {
      const result = await invoke<JobResult>("delete_wan22");
      appendLog(result.log);
      appendLog(`Wan2.2 removed: ${result.outputPath}`);
      await refreshToolState(["wan22"]);
    } catch (error) {
      appendLog(`Wan2.2 remove failed: ${String(error).trim()}`);
    } finally {
      setIsUpdatingWan22(false);
    }
  }, [appendLog, refreshToolState]);

  const deleteWan21 = useCallback(async () => {
    setIsUpdatingWan21(true);
    appendLog("Removing Wan2.1...");
    try {
      const result = await invoke<JobResult>("delete_wan21");
      appendLog(result.log);
      appendLog(`Wan2.1 removed: ${result.outputPath}`);
      await refreshToolState(["wan21"]);
    } catch (error) {
      appendLog(`Wan2.1 remove failed: ${String(error).trim()}`);
    } finally {
      setIsUpdatingWan21(false);
    }
  }, [appendLog, refreshToolState]);

  const updateFfmpeg = useCallback(async () => {
    setIsUpdatingFfmpeg(true);
    appendLog("Starting FFmpeg update...");
    try {
      const result = await invoke<JobResult>("update_ffmpeg");
      appendTailLog(appendLog, result.log);
      appendLog(`FFmpeg ready: ${result.outputPath}`);
      await refreshToolState(["ffmpeg", "ffprobe"]);
    } catch (error) {
      appendLog(`FFmpeg update failed: ${String(error).trim()}`);
    } finally {
      setIsUpdatingFfmpeg(false);
    }
  }, [appendLog, refreshToolState]);

  const updateMiniforge = useCallback(async () => {
    setIsUpdatingMiniforge(true);
    appendLog("Starting Miniforge install/update...");
    try {
      const result = await invoke<JobResult>("update_miniforge");
      appendTailLog(appendLog, result.log);
      appendLog(`Miniforge ready: ${result.outputPath}`);
      await refreshToolState();
    } catch (error) {
      appendLog(`Miniforge update failed: ${String(error).trim()}`);
    } finally {
      setIsUpdatingMiniforge(false);
    }
  }, [appendLog, refreshToolState]);

  const updateImageMagick = useCallback(async () => {
    setIsUpdatingImageMagick(true);
    appendLog("Starting ImageMagick install/update...");
    try {
      const result = await invoke<JobResult>("update_imagemagick");
      appendTailLog(appendLog, result.log);
      appendLog(`ImageMagick ready: ${result.outputPath}`);
      await refreshToolState(["imagemagick"]);
    } catch (error) {
      appendLog(`ImageMagick update failed: ${String(error).trim()}`);
    } finally {
      setIsUpdatingImageMagick(false);
    }
  }, [appendLog, refreshToolState]);

  const deleteImageMagick = useCallback(async () => {
    setIsUpdatingImageMagick(true);
    appendLog("Removing ImageMagick...");
    try {
      const result = await invoke<JobResult>("delete_imagemagick");
      appendLog(result.log);
      await refreshToolState(["imagemagick"]);
    } catch (error) {
      appendLog(`ImageMagick remove failed: ${String(error).trim()}`);
    } finally {
      setIsUpdatingImageMagick(false);
    }
  }, [appendLog, refreshToolState]);

  const updateImageCodecTool = useCallback(
    async (tool: ImageCodecTool) => {
      setUpdatingImageCodecTool(tool);
      appendLog(`Starting ${tool} install/update...`);
      try {
        const result = await invoke<JobResult>("update_image_codec_tool", { tool });
        appendTailLog(appendLog, result.log);
        appendLog(`${tool} ready: ${result.outputPath}`);
        await refreshToolState([tool]);
      } catch (error) {
        appendLog(`${tool} update failed: ${String(error).trim()}`);
      } finally {
        setUpdatingImageCodecTool("");
      }
    },
    [appendLog, refreshToolState],
  );

  const deleteImageCodecTool = useCallback(
    async (tool: ImageCodecTool) => {
      setUpdatingImageCodecTool(tool);
      appendLog(`Removing ${tool}...`);
      try {
        const result = await invoke<JobResult>("delete_image_codec_tool", { tool });
        appendLog(result.log);
        await refreshToolState([tool]);
      } catch (error) {
        appendLog(`${tool} remove failed: ${String(error).trim()}`);
      } finally {
        setUpdatingImageCodecTool("");
      }
    },
    [appendLog, refreshToolState],
  );

  const deleteModel = useCallback(
    async (tool: ModelTool, model: string) => {
      appendLog(`Removing ${model}...`);
      try {
        const result = await invoke<JobResult>("delete_tool_model", { tool, model });
        appendLog(result.log);
        await refreshToolState([tool]);
      } catch (error) {
        appendLog(`Model remove failed: ${String(error).trim()}`);
      }
    },
    [appendLog, refreshToolState],
  );

  const deleteAllModels = useCallback(
    async (tool: ModelTool) => {
      const items = tool === "realesrgan" ? models : rifeModels;
      for (const model of items) {
        await deleteModel(tool, model.name);
      }
    },
    [deleteModel, models, rifeModels],
  );

  return {
    isUpdatingEsrgan,
    isUpdatingRife,
    isUpdatingFaceFusion,
    isInstallingVosr,
    installVosr,
    isUpdatingFlux2,
    isUpdatingWan21,
    isUpdatingWan22,
    isUpdatingFfmpeg,
    isUpdatingImageMagick,
    isUpdatingMiniforge,
    updatingImageCodecTool,
    updateRealEsrgan,
    updateRife,
    updateFaceFusion,
    updateFlux2,
    updateWan21,
    updateWan22,
    deleteWan21,
    deleteWan22,
    updateFfmpeg,
    updateImageMagick,
    deleteImageMagick,
    updateMiniforge,
    updateImageCodecTool,
    deleteImageCodecTool,
    deleteModel,
    deleteAllModels,
  };
}
