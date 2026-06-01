import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RealEsrganDevice } from "@/hooks/use-tool-state";
import { useDitherActions } from "@/hooks/use-dither-actions";
import { useImageFileInput } from "@/hooks/use-image-file-input";
import { useDitherRenderEffect, usePaletteExtractionEffect, type AnimatedImageFrame } from "@/hooks/use-image-render-effects";
import { usePaletteActions } from "@/hooks/use-palette-actions";
import { defaultDitherSettings, defaultImageCompressorSettings, defaultPaletteSettings, type DitherSettings, type ImageCompressorSettings, type PaletteResult, type PaletteSettings, type ToolCategory } from "@/lib/app-options";
import type { DitherViewport } from "@/lib/dither";
import { recordImageEtaRuntime, type ImageEtaInput } from "@/lib/eta";
import { appendTailLog } from "@/lib/job-log";
import { defaultModelDevice, resolveModelDevice } from "@/lib/model-devices";

type JobResult = {
  outputPath: string;
  log: string;
};

type ImageCompressResult = JobResult & {
  inputSizeLabel: string;
  outputSizeLabel: string;
  savedLabel: string;
};

export type CompressorSizeSummary = {
  before: string;
  after: string;
  saved: string;
};

type GifFrameSet = {
  width: number;
  height: number;
  totalDurationMs: number;
  frames: AnimatedImageFrame[];
  log: string;
};

type UseImageToolsArgs = {
  toolCategory: ToolCategory;
  preferredModelDevice: string;
  devices: RealEsrganDevice[];
  appendLog: (message: string) => void;
  resetJobProgress: () => void;
};

export function useImageTools({ toolCategory, preferredModelDevice, devices, appendLog, resetJobProgress }: UseImageToolsArgs) {
  const ditherCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ditherSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paletteCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paletteSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageAction, setImageAction] = useState("dither");
  const [ditherAspectRatio, setDitherAspectRatio] = useState("original");
  const [imageMeta, setImageMeta] = useState("");
  const [imageOutputName, setImageOutputName] = useState("");
  const [ditherComparePreview, setDitherComparePreview] = useState(false);
  const [compressorSettings, setCompressorSettings] = useState<ImageCompressorSettings>(defaultImageCompressorSettings);
  const [compressorStatus, setCompressorStatus] = useState("Choose an image to compress.");
  const [compressorOutputPath, setCompressorOutputPath] = useState("");
  const [compressorSizeSummary, setCompressorSizeSummary] = useState<CompressorSizeSummary | null>(null);
  const [isRunningCompressor, setIsRunningCompressor] = useState(false);
  const compressorPreviewRequestRef = useRef(0);
  const [ditherSettings, setDitherSettings] = useState<DitherSettings>(defaultDitherSettings);
  const [ditherViewport, setDitherViewport] = useState<DitherViewport>({ zoom: 1, panX: 0, panY: 0 });
  const [gifFrames, setGifFrames] = useState<AnimatedImageFrame[]>([]);
  const [ditherGifFrames, setDitherGifFrames] = useState<AnimatedImageFrame[]>([]);
  const [ditherStatus, setDitherStatus] = useState("Choose an image to render.");
  const [isDitherReady, setIsDitherReady] = useState(false);
  const [paletteSettings, setPaletteSettings] = useState<PaletteSettings>(defaultPaletteSettings);
  const [paletteResult, setPaletteResult] = useState<PaletteResult | null>(null);
  const [paletteStatus, setPaletteStatus] = useState("Choose an image to extract colors.");
  const [supirModel, setSupirModel] = useState("SUPIR-v0Q");
  const [supirPreset, setSupirPreset] = useState("quality");
  const [supirDevice, setSupirDevice] = useState(defaultModelDevice(preferredModelDevice));
  const [supirUpscale, setSupirUpscale] = useState("2");
  const [supirUseLlava, setSupirUseLlava] = useState(false);
  const [supirStatus, setSupirStatus] = useState("Choose an image to restore with SUPIR.");
  const [supirOutputPath, setSupirOutputPath] = useState("");
  const [isRunningSupir, setIsRunningSupir] = useState(false);

  const {
    imagePath,
    imageSrc,
    imageObjectUrl,
    imageName,
    imageDimensions,
    isAnimatedGif,
    chooseInputImage,
    handleImageDrop,
  } = useImageFileInput({
    appendLog,
    resetJobProgress,
    onImageLoaded: (loadedLabel) => {
      setDitherStatus(`Loaded ${loadedLabel}`);
      setPaletteStatus(`Loaded ${loadedLabel}`);
      setCompressorStatus(`Loaded ${loadedLabel}`);
      setCompressorOutputPath("");
      setCompressorSizeSummary(null);
      appendLog(`Image ready: ${loadedLabel}`);
    },
  });

  useDitherRenderEffect({
    imageSrc,
    isAnimatedGif,
    animatedGifFrames: gifFrames,
    toolCategory,
    imageAction,
    ditherSettings,
    ditherCanvasRef,
    ditherSourceCanvasRef,
    ditherViewport,
    setDitherGifFrames,
    setImageMeta,
    setDitherStatus,
    setIsDitherReady,
    appendLog,
  });

  usePaletteExtractionEffect({
    imageSrc,
    toolCategory,
    imageAction,
    paletteSettings,
    paletteCanvasRef,
    paletteSourceCanvasRef,
    setImageMeta,
    setPaletteResult,
    setPaletteStatus,
    appendLog,
  });

  useEffect(() => {
    setDitherViewport({ zoom: 1, panX: 0, panY: 0 });
  }, [ditherSettings.fitMode, imageAction, imageSrc]);

  useEffect(() => {
    setGifFrames([]);
    setDitherGifFrames([]);
    if (!isAnimatedGif) return;
    if (!imagePath) {
      setDitherStatus("GIF drag/drop needs a local file path. Use Browse Image for animated GIFs.");
      appendLog("GIF: drag/drop did not provide a local file path.");
      return;
    }
    let cancelled = false;
    setIsDitherReady(false);
    setDitherStatus("Decoding GIF frames.");
    appendLog("GIF: decoding frames...");
    invoke<GifFrameSet>("extract_gif_frames", { inputPath: imagePath })
      .then((result) => {
        if (cancelled) return;
        setGifFrames(result.frames);
        setImageMeta(`${result.frames.length} GIF frames | ${(result.totalDurationMs / 1000).toFixed(2)}s | ${result.width}x${result.height}`);
        setDitherStatus("GIF frames ready.");
        appendLog(result.log);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = `GIF decode failed: ${String(error)}`;
        setDitherStatus(message);
        appendLog(message);
      });
    return () => {
      cancelled = true;
    };
  }, [appendLog, imagePath, isAnimatedGif, setImageMeta]);

  useEffect(() => {
    if (ditherAspectRatio !== "original" || !imageDimensions?.width || !imageDimensions.height) {
      return;
    }
    const ratio = imageDimensions.width / imageDimensions.height;
    setDitherSettings((current) => ({
      ...current,
      outputHeight: Math.max(8, Math.round(current.outputWidth / ratio)),
    }));
  }, [ditherAspectRatio, imageDimensions]);

  useEffect(() => {
    setSupirDevice(defaultModelDevice(preferredModelDevice));
  }, [preferredModelDevice]);

  useEffect(() => {
    if (!imageName) {
      setImageOutputName("");
      return;
    }
    const suffix = imageAction === "palette" ? "palette" : imageAction === "compress" ? "compress" : imageAction;
    setImageOutputName(`${imageName}_${suffix}`);
  }, [imageAction, imageName]);

  useEffect(() => {
    setCompressorOutputPath("");
    setCompressorSizeSummary(null);
    if (imageAction === "compress" && imageName) {
      setCompressorStatus("Ready to compress.");
    }
  }, [
    compressorSettings.format,
    compressorSettings.quality,
    compressorSettings.lossless,
    compressorSettings.effort,
    compressorSettings.keepMetadata,
    compressorSettings.preserveAnimation,
    imageAction,
    imageName,
  ]);

  const {
    updateDitherSettings,
    updateDitherWidth,
    updateDitherHeight,
    updateDitherAspectRatio,
    downloadDitherPng,
  } = useDitherActions({
    ditherAspectRatio,
    ditherSettings,
    ditherCanvasRef,
    ditherGifFrames,
    isAnimatedGif,
    imageDimensions,
    imageName,
    outputName: imageOutputName,
    isDitherReady,
    appendLog,
    setDitherAspectRatio,
    setDitherSettings,
    setDitherStatus,
  });

  const {
    updatePaletteSettings,
    copyPaletteCss,
    downloadPaletteCss,
    downloadPaletteSheet,
  } = usePaletteActions({
    paletteResult,
    paletteCanvasRef,
    imageName,
    outputName: imageOutputName,
    appendLog,
    setPaletteSettings,
    setPaletteStatus,
  });

  async function runSupir() {
    if (!imagePath) {
      setSupirStatus("Choose an image before running SUPIR.");
      appendLog("SUPIR needs an image file path.");
      return;
    }
    setIsRunningSupir(true);
    setSupirOutputPath("");
    setSupirStatus("SUPIR is running.");
    resetJobProgress();
    appendLog("Starting SUPIR restore...");
    const startedAt = performance.now();
    const etaInput = buildImageEtaInput({
      imageAction,
      imageDimensions,
      supirModel,
      supirPreset,
      supirDevice,
      supirUpscale,
      supirUseLlava,
      preferredModelDevice,
      devices,
    });
    try {
      const result = await invoke<JobResult>("run_supir_image_job", {
        options: {
          inputPath: imagePath,
          outputName: imageOutputName,
          model: supirModel,
          preset: supirPreset,
          device: resolveModelDevice(supirDevice, preferredModelDevice),
          upscale: supirUpscale,
          useLlava: supirUseLlava,
        },
      });
      appendTailLog(appendLog, result.log);
      recordImageEtaRuntime(etaInput, performance.now() - startedAt);
      setSupirOutputPath(result.outputPath);
      setSupirStatus(`SUPIR output: ${result.outputPath}`);
      appendLog(`SUPIR complete: ${result.outputPath}`);
    } catch (error) {
      const message = String(error).trim();
      setSupirStatus(`SUPIR failed: ${message}`);
      appendLog(`SUPIR failed: ${message}`);
    } finally {
      setIsRunningSupir(false);
    }
  }

  async function cancelSupir() {
    try {
      await invoke("cancel_supir_image_job");
      setSupirStatus("SUPIR cancellation requested.");
      appendLog("SUPIR cancellation requested.");
    } catch (error) {
      appendLog(`SUPIR cancel failed: ${String(error).trim()}`);
    }
  }

  function updateCompressorSettings(patch: Partial<ImageCompressorSettings>) {
    setCompressorSettings((current) => {
      const next = { ...current, ...patch };
      if (patch.format && patch.format !== "webp" && patch.format !== "avif") {
        next.lossless = false;
      }
      if (patch.paletteColors !== undefined) {
        next.paletteColors = Math.max(2, Math.min(256, Math.round(Number(patch.paletteColors) || 128)));
      }
      return next;
    });
  }

  useEffect(() => {
    if (!isAnimatedGif || imageAction !== "compress") return;
    if (compressorSettings.format === "gif" || compressorSettings.format === "webp" || compressorSettings.format === "apng") {
      return;
    }
    updateCompressorSettings({ format: "gif" });
  }, [compressorSettings.format, imageAction, isAnimatedGif]);

  async function runCompressorPreview(mode: "manual" | "live") {
    if (!imagePath) {
      setCompressorStatus("Choose an image from disk before compressing.");
      if (mode === "manual") {
        appendLog("Image compressor needs a local image file path.");
      }
      return;
    }
    const requestId = compressorPreviewRequestRef.current + 1;
    compressorPreviewRequestRef.current = requestId;
    setIsRunningCompressor(true);
    if (mode === "manual" || !compressorSettings.compareOriginal) {
      setCompressorOutputPath("");
    }
    setCompressorStatus(mode === "live" ? "Building live compressor preview." : "Compressing image.");
    if (mode === "manual") {
      resetJobProgress();
      appendLog("Starting image compressor...");
    }
    try {
      const result = await invoke<ImageCompressResult>("run_image_compress_job", {
        options: {
          inputPath: imagePath,
          outputName: imageOutputName,
          format: compressorSettings.format,
          quality: compressorSettings.quality,
          lossless: compressorSettings.lossless,
          effort: compressorSettings.effort,
          keepMetadata: compressorSettings.keepMetadata,
          preserveAnimation: compressorSettings.preserveAnimation,
          reducePalette: compressorSettings.reducePalette,
          paletteColors: compressorSettings.paletteColors,
          paletteDither: compressorSettings.paletteDither,
          previewOnly: true,
        },
      });
      if (requestId !== compressorPreviewRequestRef.current) return;
      if (mode === "manual") {
        appendTailLog(appendLog, result.log);
      }
      setCompressorOutputPath(result.outputPath);
      setCompressorSizeSummary({
        before: result.inputSizeLabel,
        after: result.outputSizeLabel,
        saved: result.savedLabel,
      });
      setCompressorStatus(`Compressor preview: ${result.outputPath}`);
      if (mode === "manual") {
        appendLog(`Image compressor preview ready: ${result.outputPath}`);
      }
    } catch (error) {
      if (requestId !== compressorPreviewRequestRef.current) return;
      const message = String(error).trim();
      setCompressorStatus(`Compressor failed: ${message}`);
      appendLog(`Image compressor failed: ${message}`);
    } finally {
      if (requestId === compressorPreviewRequestRef.current) {
        setIsRunningCompressor(false);
      }
    }
  }

  function previewCompressor() {
    void runCompressorPreview("manual");
  }

  useEffect(() => {
    if (imageAction !== "compress" || !imagePath || isAnimatedGif) {
      return;
    }
    const timer = window.setTimeout(() => {
      void runCompressorPreview("live");
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    imageAction,
    imagePath,
    isAnimatedGif,
    compressorSettings.format,
    compressorSettings.quality,
    compressorSettings.lossless,
    compressorSettings.effort,
    compressorSettings.keepMetadata,
    compressorSettings.preserveAnimation,
    compressorSettings.reducePalette,
    compressorSettings.paletteColors,
    compressorSettings.paletteDither,
  ]);

  async function saveCompressorPreview() {
    if (!compressorOutputPath) {
      setCompressorStatus("Generate a compressor preview before saving.");
      appendLog("Image compressor save needs a preview first.");
      return;
    }
    setIsRunningCompressor(true);
    resetJobProgress();
    appendLog("Saving image compressor preview...");
    try {
      const result = await invoke<JobResult>("save_image_compress_preview", {
        options: {
          previewPath: compressorOutputPath,
          outputName: imageOutputName,
          format: compressorSettings.format,
        },
      });
      appendLog(result.log);
      setCompressorOutputPath(result.outputPath);
      setCompressorStatus(`Compressor output: ${result.outputPath}`);
      appendLog(`Image compressor saved: ${result.outputPath}`);
    } catch (error) {
      const message = String(error).trim();
      setCompressorStatus(`Compressor save failed: ${message}`);
      appendLog(`Image compressor save failed: ${message}`);
    } finally {
      setIsRunningCompressor(false);
    }
  }

  return {
    ditherCanvasRef,
    ditherSourceCanvasRef,
    paletteCanvasRef,
    paletteSourceCanvasRef,
    imagePath,
    imageSrc,
    imageObjectUrl,
    imageName,
    isAnimatedGif,
    imageDimensions,
    imageAction,
    ditherAspectRatio,
    imageMeta,
    imageOutputName,
    ditherComparePreview,
    compressorSettings,
    compressorStatus,
    compressorOutputPath,
    compressorSizeSummary,
    isRunningCompressor,
    gifFrames,
    ditherGifFrames,
    ditherSettings,
    ditherViewport,
    ditherStatus,
    isDitherReady,
    paletteSettings,
    paletteResult,
    paletteStatus,
    supirModel,
    supirPreset,
    supirDevice,
    supirUpscale,
    supirUseLlava,
    supirStatus,
    supirOutputPath,
    isRunningSupir,
    setImageAction,
    setImageOutputName,
    setDitherComparePreview,
    updateCompressorSettings,
    setDitherViewport,
    setSupirModel,
    setSupirPreset,
    setSupirDevice,
    setSupirUpscale,
    setSupirUseLlava,
    chooseInputImage,
    handleImageDrop,
    updateDitherSettings,
    updateDitherWidth,
    updateDitherHeight,
    updateDitherAspectRatio,
    downloadDitherPng,
    previewCompressor,
    saveCompressorPreview,
    updatePaletteSettings,
    copyPaletteCss,
    downloadPaletteCss,
    downloadPaletteSheet,
    runSupir,
    cancelSupir,
  };
}

function buildImageEtaInput({
  imageAction,
  imageDimensions,
  supirModel,
  supirPreset,
  supirDevice,
  supirUpscale,
  supirUseLlava,
  preferredModelDevice,
  devices,
}: {
  imageAction: string;
  imageDimensions: ImageEtaInput["dimensions"];
  supirModel: string;
  supirPreset: string;
  supirDevice: string;
  supirUpscale: string;
  supirUseLlava: boolean;
  preferredModelDevice: string;
  devices: RealEsrganDevice[];
}): ImageEtaInput {
  return {
    imageAction,
    dimensions: imageDimensions,
    supirModel,
    supirPreset,
    supirDevice,
    supirUpscale,
    supirUseLlava,
    preferredModelDevice,
    devices,
  };
}
