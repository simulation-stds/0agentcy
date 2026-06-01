import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { actions } from "@/lib/app-options";
import type { RealEsrganDevice } from "@/hooks/use-tool-state";
import type { useVideoForm } from "@/hooks/use-video-form";
import type { useVideoInteractionState } from "@/hooks/use-video-interaction-state";
import { recordVideoEtaRuntime, type VideoEtaInput } from "@/lib/eta";
import { resolveModelDevice } from "@/lib/model-devices";

type JobResult = {
  outputPath: string;
  log: string;
};

type VideoJobMetadata = {
  duration: number;
  fps: number;
  width: number;
  height: number;
};

type UseVideoJobsArgs = {
  metadata: VideoJobMetadata | null;
  inputPath: string;
  currentTime: number;
  videoForm: ReturnType<typeof useVideoForm>;
  videoInteraction: ReturnType<typeof useVideoInteractionState>;
  preferredModelDevice: string;
  devices: RealEsrganDevice[];
  faceFusionSourcePath: string;
  appendLog: (message: string) => void;
  resetJobProgress: () => void;
};

function lastLogLines(log: string) {
  return log.trim().split(/\r?\n/).slice(-8).join("\n");
}

export function useVideoJobs({
  metadata,
  inputPath,
  currentTime,
  videoForm,
  videoInteraction,
  preferredModelDevice,
  devices,
  faceFusionSourcePath,
  appendLog,
  resetJobProgress,
}: UseVideoJobsArgs) {
  const runJob = useCallback(async () => {
    if (!metadata) {
      appendLog("Load a video before running a job.");
      return;
    }

    videoForm.setIsRunning(true);
    resetJobProgress();
    appendLog(`Running ${actions.find((item) => item.id === videoForm.action)?.label ?? videoForm.action}...`);
    const startedAt = performance.now();
    const etaInput = buildVideoEtaInput({
      metadata,
      videoForm,
      videoInteraction,
      preferredModelDevice,
      devices,
    });
    try {
      const effectiveSocialFps = videoForm.socialFps === "auto" ? String(metadata.fps || 24) : videoForm.socialFps;
      const effectiveDevice = resolveModelDevice(videoForm.selectedDevice, preferredModelDevice);
      const result =
        videoForm.action === "realesrgan_upscale"
          ? await invoke<JobResult>("run_upscale_job", {
              options: {
                inputPath: inputPath.trim(),
                outputName: videoForm.outputName,
                model: videoForm.selectedModel,
                device: effectiveDevice,
                fps: metadata.fps || 24,
                crf: videoForm.crf,
                encoderPreset: videoForm.encoderPreset,
                tileSize: videoForm.tileSize,
                threads: videoForm.threads,
                trimStart: videoInteraction.trimStart,
                trimEnd: videoInteraction.trimEnd,
              },
            })
          : videoForm.action === "social_export"
            ? await invoke<JobResult>("run_social_export_job", {
                options: {
                  inputPath: inputPath.trim(),
                  outputName: videoForm.outputName,
                  format: videoForm.socialFormat,
                  trimStart: videoInteraction.trimStart,
                  trimEnd: videoInteraction.trimEnd,
                  fps: effectiveSocialFps,
                  width: videoForm.socialWidth,
                  loopOutput: videoForm.socialLoop,
                  scaleFilter: videoForm.socialScaleFilter,
                  crf: videoForm.socialCrf,
                  quality: videoForm.socialQuality,
                  preset: videoForm.socialPreset,
                  includeAudio: videoForm.socialIncludeAudio,
                },
              })
            : videoForm.action === "rife_interpolate"
              ? await invoke<JobResult>("run_rife_job", {
                  options: {
                    inputPath: inputPath.trim(),
                    outputName: videoForm.outputName,
                    model: videoForm.selectedRifeModel,
                    device: effectiveDevice,
                    multiplier: Number(videoForm.rifeMultiplier),
                    fps: metadata.fps || 24,
                    crf: videoForm.crf,
                    encoderPreset: videoForm.encoderPreset,
                    threads: videoForm.threads,
                    ttaSpatial: videoForm.rifeTtaSpatial,
                    ttaTemporal: videoForm.rifeTtaTemporal,
                    uhd: videoForm.rifeUhd,
                    trimStart: videoInteraction.trimStart,
                    trimEnd: videoInteraction.trimEnd,
                  },
                })
              : videoForm.action === "facefusion"
                ? await invoke<JobResult>("run_facefusion_job", {
                    options: {
                      inputPath: inputPath.trim(),
                      sourcePath: faceFusionSourcePath.trim(),
                      outputName: videoForm.outputName,
                      processorPreset: videoForm.faceFusionProcessor,
                      executionProvider: videoForm.faceFusionProvider,
                      trimStart: videoInteraction.trimStart,
                      trimEnd: videoInteraction.trimEnd,
                    },
                  })
                : await invoke<JobResult>("run_ffmpeg_job", {
                      options: {
                        inputPath: inputPath.trim(),
                        outputName: videoForm.outputName,
                        action: videoForm.action,
                        trimStart: videoInteraction.trimStart,
                        trimEnd: videoInteraction.trimEnd,
                        currentTime,
                        audioFormat: videoForm.audioFormat,
                      },
                    });
      if (result.log.trim()) {
        appendLog(lastLogLines(result.log));
      }
      recordVideoEtaRuntime(etaInput, performance.now() - startedAt);
      appendLog(`Done: ${result.outputPath}`);
    } catch (error) {
      appendLog(`Job failed: ${String(error).trim()}`);
    } finally {
      videoForm.setIsRunning(false);
    }
  }, [
    appendLog,
    currentTime,
    faceFusionSourcePath,
    inputPath,
    metadata,
    preferredModelDevice,
    devices,
    videoForm,
    videoInteraction,
    resetJobProgress,
  ]);

  const cancelUpscale = useCallback(async () => {
    await invoke("cancel_upscale_job");
    appendLog("Cancel requested.");
  }, [appendLog]);

  const cancelFaceFusion = useCallback(async () => {
    await invoke("cancel_facefusion_job");
    appendLog("FaceFusion cancel requested.");
  }, [appendLog]);

  return { runJob, cancelUpscale, cancelFaceFusion };
}

function buildVideoEtaInput({
  metadata,
  videoForm,
  videoInteraction,
  preferredModelDevice,
  devices,
}: {
  metadata: VideoJobMetadata;
  videoForm: ReturnType<typeof useVideoForm>;
  videoInteraction: ReturnType<typeof useVideoInteractionState>;
  preferredModelDevice: string;
  devices: RealEsrganDevice[];
}): VideoEtaInput {
  return {
    action: videoForm.action,
    metadata,
    selectedDuration: Math.max(0, videoInteraction.trimEnd - videoInteraction.trimStart),
    selectedModel: videoForm.selectedModel,
    selectedRifeModel: videoForm.selectedRifeModel,
    selectedDevice: videoForm.selectedDevice,
    tileSize: videoForm.tileSize,
    threads: videoForm.threads,
    preferredModelDevice,
    devices,
    rifeMultiplier: videoForm.rifeMultiplier,
    rifeTtaSpatial: videoForm.rifeTtaSpatial,
    rifeTtaTemporal: videoForm.rifeTtaTemporal,
    rifeUhd: videoForm.rifeUhd,
    faceFusionProcessor: videoForm.faceFusionProcessor,
    faceFusionProvider: videoForm.faceFusionProvider,
  };
}
