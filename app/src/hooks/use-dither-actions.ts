import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { aspectRatios, type DitherSettings } from "@/lib/app-options";
import type { ImageDimensions } from "@/hooks/use-image-file-input";
import type { AnimatedImageFrame } from "@/hooks/use-image-render-effects";

type JobResult = {
  outputPath: string;
  log: string;
};

type UseDitherActionsArgs = {
  ditherAspectRatio: string;
  ditherSettings: DitherSettings;
  ditherCanvasRef: RefObject<HTMLCanvasElement | null>;
  ditherGifFrames: AnimatedImageFrame[];
  isAnimatedGif: boolean;
  imageDimensions: ImageDimensions | null;
  imageName: string;
  outputName: string;
  isDitherReady: boolean;
  appendLog: (message: string) => void;
  setDitherAspectRatio: Dispatch<SetStateAction<string>>;
  setDitherSettings: Dispatch<SetStateAction<DitherSettings>>;
  setDitherStatus: Dispatch<SetStateAction<string>>;
};

export function useDitherActions({
  ditherAspectRatio,
  ditherSettings,
  ditherCanvasRef,
  ditherGifFrames,
  isAnimatedGif,
  imageDimensions,
  imageName,
  outputName,
  isDitherReady,
  appendLog,
  setDitherAspectRatio,
  setDitherSettings,
  setDitherStatus,
}: UseDitherActionsArgs) {
  function updateDitherSettings(patch: Partial<DitherSettings>) {
    setDitherSettings((current) => ({ ...current, ...patch }));
  }

  function selectedAspectRatio() {
    if (ditherAspectRatio === "original" && imageDimensions?.width && imageDimensions.height) {
      return imageDimensions.width / imageDimensions.height;
    }
    return aspectRatios.find((item) => item.value === ditherAspectRatio)?.ratio;
  }

  function updateDitherWidth(width: number) {
    const ratio = selectedAspectRatio();
    updateDitherSettings({
      outputWidth: width,
      ...(ratio ? { outputHeight: Math.max(8, Math.round(width / ratio)) } : {}),
    });
  }

  function updateDitherHeight(height: number) {
    const ratio = selectedAspectRatio();
    updateDitherSettings({
      outputHeight: height,
      ...(ratio ? { outputWidth: Math.max(8, Math.round(height * ratio)) } : {}),
    });
  }

  function updateDitherAspectRatio(value: string) {
    setDitherAspectRatio(value);
    const ratio = value === "original" && imageDimensions?.width && imageDimensions.height
      ? imageDimensions.width / imageDimensions.height
      : aspectRatios.find((item) => item.value === value)?.ratio;
    if (ratio) {
      updateDitherSettings({
        outputHeight: Math.max(8, Math.round(ditherSettings.outputWidth / ratio)),
      });
    }
  }

  function downloadDitherPng() {
    if (isAnimatedGif) {
      if (!isDitherReady || ditherGifFrames.length === 0) return;
      invoke<JobResult>("save_gif_frames_to_downloads", {
        outputName: imageOutputName(outputName, imageName, "dither", "gif"),
        frames: ditherGifFrames,
      })
        .then((result) => {
          setDitherStatus(`Saved ${result.outputPath}`);
          appendLog(result.log);
        })
        .catch((error) => {
          const message = `GIF save failed: ${String(error)}`;
          setDitherStatus(message);
          appendLog(message);
        });
      return;
    }

    const canvas = ditherCanvasRef.current;
    if (!canvas || !isDitherReady) return;
    invoke<JobResult>("save_data_url_to_downloads", {
      outputName: imageOutputName(outputName, imageName, "dither", "png"),
      dataUrl: canvas.toDataURL("image/png"),
    })
      .then((result) => {
        setDitherStatus(`Saved ${result.outputPath}`);
        appendLog(result.log);
      })
      .catch((error) => {
        const message = `PNG save failed: ${String(error)}`;
        setDitherStatus(message);
        appendLog(message);
      });
  }

  return {
    updateDitherSettings,
    updateDitherWidth,
    updateDitherHeight,
    updateDitherAspectRatio,
    downloadDitherPng,
  };
}

function imageOutputName(name: string, imageName: string, suffix: string, extension: string) {
  const base = (name || `${imageName || "image"}_${suffix}`).trim() || `image_${suffix}`;
  return base.toLowerCase().endsWith(`.${extension}`) ? base : `${base}.${extension}`;
}
