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
  refreshToolState: () => Promise<void>;
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
  const [isUpdatingSupir, setIsUpdatingSupir] = useState(false);
  const [isUpdatingSupirXformers, setIsUpdatingSupirXformers] = useState(false);
  const [activeSupirCheckpoint, setActiveSupirCheckpoint] = useState("");
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
        await refreshToolState();
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
        await refreshToolState();
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
      await refreshToolState();
    } catch (error) {
      appendLog(`FaceFusion update failed: ${String(error).trim()}`);
    } finally {
      setIsUpdatingFaceFusion(false);
    }
  }, [appendLog, faceFusionRuntime, refreshToolState]);

  const updateSupir = useCallback(async () => {
    setIsUpdatingSupir(true);
    appendLog("Starting SUPIR install/update...");
    try {
      const result = await invoke<JobResult>("install_or_update_supir");
      appendTailLog(appendLog, result.log);
      appendLog(`SUPIR ready: ${result.outputPath}`);
      await refreshToolState();
    } catch (error) {
      appendLog(`SUPIR update failed: ${String(error).trim()}`);
    } finally {
      setIsUpdatingSupir(false);
    }
  }, [appendLog, refreshToolState]);

  const updateSupirXformers = useCallback(async () => {
    setIsUpdatingSupirXformers(true);
    appendLog("Starting SUPIR xFormers install/repair...");
    try {
      const result = await invoke<JobResult>("install_or_update_supir_xformers");
      appendTailLog(appendLog, result.log);
      appendLog(`SUPIR xFormers ready: ${result.outputPath}`);
      await refreshToolState();
    } catch (error) {
      appendLog(`SUPIR xFormers install failed: ${String(error).trim()}`);
    } finally {
      setIsUpdatingSupirXformers(false);
    }
  }, [appendLog, refreshToolState]);

  const deleteSupirXformers = useCallback(async () => {
    appendLog("Removing SUPIR xFormers...");
    try {
      const result = await invoke<JobResult>("delete_supir_xformers");
      appendTailLog(appendLog, result.log);
      appendLog(`SUPIR xFormers removed: ${result.outputPath}`);
      await refreshToolState();
    } catch (error) {
      appendLog(`SUPIR xFormers remove failed: ${String(error).trim()}`);
    }
  }, [appendLog, refreshToolState]);

  const importSupirCheckpoint = useCallback(
    async (sourcePath: string, checkpointName: string) => {
      appendLog(`Importing ${checkpointName}...`);
      try {
        const result = await invoke<JobResult>("import_supir_checkpoint", { sourcePath, checkpointName });
        appendLog(result.log);
        await refreshToolState();
      } catch (error) {
        appendLog(`SUPIR checkpoint import failed: ${String(error).trim()}`);
      }
    },
    [appendLog, refreshToolState],
  );

  const importSupirCheckpointFromDownloads = useCallback(
    async (checkpointName: string) => {
      appendLog(`Looking for ${checkpointName} in Downloads...`);
      try {
        const result = await invoke<JobResult>("import_supir_checkpoint_from_downloads", { checkpointName });
        appendLog(result.log);
        await refreshToolState();
      } catch (error) {
        appendLog(`SUPIR checkpoint auto-import failed: ${String(error).trim()}`);
      }
    },
    [appendLog, refreshToolState],
  );

  const downloadSupirCheckpoint = useCallback(
    async (checkpointName: string) => {
      setActiveSupirCheckpoint(checkpointName);
      appendLog(`Downloading ${checkpointName}...`);
      try {
        const result = await invoke<JobResult>("download_supir_checkpoint", { checkpointName });
        appendTailLog(appendLog, result.log);
        appendLog(`SUPIR checkpoint ready: ${result.outputPath}`);
        await refreshToolState();
      } catch (error) {
        appendLog(`SUPIR checkpoint download failed: ${String(error).trim()}`);
      } finally {
        setActiveSupirCheckpoint("");
      }
    },
    [appendLog, refreshToolState],
  );

  const deleteSupirCheckpoint = useCallback(
    async (checkpointName: string) => {
      appendLog(`Removing ${checkpointName}...`);
      try {
        const result = await invoke<JobResult>("delete_supir_checkpoint", { checkpointName });
        appendLog(result.log);
        await refreshToolState();
      } catch (error) {
        appendLog(`SUPIR checkpoint remove failed: ${String(error).trim()}`);
      }
    },
    [appendLog, refreshToolState],
  );

  const updateFfmpeg = useCallback(async () => {
    setIsUpdatingFfmpeg(true);
    appendLog("Starting FFmpeg update...");
    try {
      const result = await invoke<JobResult>("update_ffmpeg");
      appendTailLog(appendLog, result.log);
      appendLog(`FFmpeg ready: ${result.outputPath}`);
      await refreshToolState();
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
      await refreshToolState();
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
      await refreshToolState();
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
        await refreshToolState();
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
        await refreshToolState();
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
        await refreshToolState();
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
    isUpdatingSupir,
    isUpdatingSupirXformers,
    activeSupirCheckpoint,
    isUpdatingFfmpeg,
    isUpdatingImageMagick,
    isUpdatingMiniforge,
    updatingImageCodecTool,
    updateRealEsrgan,
    updateRife,
    updateFaceFusion,
    updateSupir,
    updateSupirXformers,
    deleteSupirXformers,
    importSupirCheckpoint,
    importSupirCheckpointFromDownloads,
    downloadSupirCheckpoint,
    deleteSupirCheckpoint,
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
