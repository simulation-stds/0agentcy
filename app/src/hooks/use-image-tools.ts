import { useEffect, useRef, useState, type DragEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { GenerativeReferenceItem } from "@/components/generative-controls";
import { useDitherActions } from "@/hooks/use-dither-actions";
import { useImageFileInput } from "@/hooks/use-image-file-input";
import { useDitherRenderEffect, usePaletteExtractionEffect, type AnimatedImageFrame } from "@/hooks/use-image-render-effects";
import { usePaletteActions } from "@/hooks/use-palette-actions";
import { defaultDitherSettings, defaultImageCompressorSettings, defaultPaletteSettings, type DitherSettings, type ImageCompressorSettings, type PaletteResult, type PaletteSettings, type ToolCategory } from "@/lib/app-options";
import type { DitherViewport } from "@/lib/dither";
import { computeGenerativeHeight, type GenerativeAspectOrientation } from "@/lib/generative-sizing";
import { appendTailLog } from "@/lib/job-log";
import { fileName, localAssetSrc } from "@/lib/media-utils";
import { defaultModelDevice, resolveModelDevice } from "@/lib/model-devices";
import type { DetectedSkinMask, SkinCrop, SkinDetectionMode, SkinStroke } from "@/lib/skin-mask";
import { encodeSkinBlend, encodeVosrBlend, loadSkinBlendImages, loadVosrBlendSource } from "@/lib/vosr-blend";

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
  appendLog: (message: string) => void;
  resetJobProgress: () => void;
};

const FLUX2_MAX_REFERENCES = 4;

export function useImageTools({ toolCategory, preferredModelDevice, appendLog, resetJobProgress }: UseImageToolsArgs) {
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
  const [vosrUpscale, setVosrUpscale] = useState("2");
  const [vosrTileSize, setVosrTileSize] = useState("512");
  const [vosrBackend, setVosrBackend] = useState("auto");
  const [vosrColorCorrection, setVosrColorCorrection] = useState("wavelet");
  const [vosrTileOverlap, setVosrTileOverlap] = useState("64");
  const [vosrVaeTileSize, setVosrVaeTileSize] = useState("1024");
  const [vosrVaeTileOverlap, setVosrVaeTileOverlap] = useState("128");
  const [vosrSeed, setVosrSeed] = useState("42");
  const [vosrDevice, setVosrDevice] = useState("");
  const [vosrStatus, setVosrStatus] = useState("Choose a photo to upscale with VOSR 2.0.");
  const [vosrResult, setVosrResult] = useState<{ path: string; blendSource: string; detailPath?: string } | null>(null);
  const vosrOutputPath = vosrResult?.path ?? "";
  const vosrBlendSource = vosrResult?.blendSource ?? "";
  const vosrDetailPath = vosrResult?.detailPath ?? "";
  const [vosrCompareDetail, setVosrCompareDetail] = useState(false);
  const [vosrJob, setVosrJob] = useState<"upscale" | "enhance" | "detect" | null>(null);
  const isRunningVosr = vosrJob === "upscale";
  const isEnhancingVosr = vosrJob === "enhance";
  const isDetectingSkin = vosrJob === "detect";
  const vosrRunningRef = useRef(false);
  const vosrResultRevision = useRef(0);
  const [vosrStrength, setVosrStrength] = useState(100);
  const [skinStrength, setSkinStrength] = useState(70);
  const [skinMaskEditing, setSkinMaskEditing] = useState(false);
  const [skinStrokes, setSkinStrokes] = useState<SkinStroke[]>([]);
  const [detectedSkinMask, setDetectedSkinMask] = useState<DetectedSkinMask | null>(null);
  const [skinDetectionMode, setSkinDetectionMode] = useState<SkinDetectionMode>("detail");
  const [skinCrop, setSkinCrop] = useState<SkinCrop | null>(null);
  const [skinMaskCoverage, setSkinMaskCoverage] = useState(50);
  const [isSavingVosrBlend, setIsSavingVosrBlend] = useState(false);
  const [flux2Prompt, setFlux2Prompt] = useState("");
  const [flux2AspectOrientation, setFlux2AspectOrientation] = useState<GenerativeAspectOrientation>("horizontal");
  const [flux2AspectRatio, setFlux2AspectRatio] = useState("1:1");
  const [flux2Width, setFlux2Width] = useState("1024");
  const [flux2Height, setFlux2Height] = useState("1024");
  const [flux2Steps, setFlux2Steps] = useState(4);
  const [flux2Guidance, setFlux2Guidance] = useState(1);
  const [flux2Seed, setFlux2Seed] = useState("");
  const [flux2Device, setFlux2Device] = useState(defaultModelDevice(preferredModelDevice));
  const [flux2CpuOffload, setFlux2CpuOffload] = useState(true);
  const [flux2References, setFlux2References] = useState<GenerativeReferenceItem[]>([]);
  const [flux2Status, setFlux2Status] = useState("Enter a prompt to generate with Flux.2.");
  const [flux2OutputPath, setFlux2OutputPath] = useState("");
  const [isRunningFlux2, setIsRunningFlux2] = useState(false);

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
      vosrResultRevision.current++;
      setVosrResult(null);
      setVosrCompareDetail(false);
      setSkinMaskEditing(false);
      resetSkinMask();
      setVosrStrength(100);
      setVosrStatus("Choose a photo to upscale with VOSR 2.0.");
      setDitherStatus(`Loaded ${loadedLabel}`);
      setPaletteStatus(`Loaded ${loadedLabel}`);
      setCompressorStatus(`Loaded ${loadedLabel}`);
      setFlux2Status("Enter a prompt to generate with Flux.2.");
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
    setFlux2Device(defaultModelDevice(preferredModelDevice));
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
    if (imageAction === "flux2" && !imageName) {
      setImageOutputName("flux2_generate");
    }
  }, [imageAction, imageName]);

  useEffect(() => {
    setFlux2Height(String(computeGenerativeHeight(flux2Width, flux2AspectRatio)));
  }, [flux2AspectRatio, flux2Width]);

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

  async function runVosr() {
    if (vosrRunningRef.current || isSavingVosrBlend) return;
    if (!imagePath || isAnimatedGif) {
      setVosrStatus("Choose a still image from disk before running VOSR.");
      return;
    }
    const seed = Number(vosrSeed);
    if (!/^\d+$/.test(vosrSeed) || !Number.isInteger(seed) || seed > 4294967295) {
      setVosrStatus("Enter a whole-number seed between 0 and 4294967295.");
      return;
    }
    const revision = ++vosrResultRevision.current;
    vosrRunningRef.current = true;
    setVosrJob("upscale");
    setVosrResult(null);
    setVosrCompareDetail(false);
    setSkinMaskEditing(false);
    resetSkinMask();
    setVosrStatus("VOSR 2.0 is upscaling the image.");
    resetJobProgress();
    appendLog("Starting VOSR 2.0 upscale...");
    try {
      const result = await invoke<JobResult>("run_vosr_image_job", { options: {
        inputPath: imagePath, outputName: imageOutputName,
        upscale: Number(vosrUpscale), tileSize: Number(vosrTileSize), seed,
        device: vosrDevice, backend: vosrBackend, colorCorrection: vosrColorCorrection,
        tileOverlap: Number(vosrTileOverlap), vaeTileSize: Number(vosrVaeTileSize),
        vaeTileOverlap: Number(vosrVaeTileOverlap),
      }});
      appendTailLog(appendLog, result.log);
      if (revision === vosrResultRevision.current) {
        setVosrResult({ path: result.outputPath, blendSource: imageSrc });
        setVosrStrength(100);
        setVosrStatus(`Saved: ${result.outputPath}`);
      }
      appendLog(`VOSR complete: ${result.outputPath}`);
    } catch (error) {
      if (revision === vosrResultRevision.current) setVosrStatus(String(error));
      appendLog(`VOSR failed: ${String(error)}`);
    } finally {
      vosrRunningRef.current = false;
      setVosrJob(null);
    }
  }

  async function openVosrResult() {
    if (vosrRunningRef.current || isSavingVosrBlend) return;
    const revision = ++vosrResultRevision.current;
    try {
      const path = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "VOSR result", extensions: ["png"] }],
      });
      if (typeof path !== "string" || revision !== vosrResultRevision.current) return;
      const blendSource = await loadVosrBlendSource(isAnimatedGif ? "" : imageSrc, localAssetSrc(path));
      if (revision !== vosrResultRevision.current) return;
      setVosrResult({ path, blendSource });
      setVosrCompareDetail(false);
      setSkinMaskEditing(false);
      resetSkinMask();
      setVosrStrength(100);
      setVosrStatus(`Opened: ${path}`);
    } catch (error) {
      if (revision === vosrResultRevision.current) setVosrStatus(String(error));
    }
  }

  async function openSkinResult() {
    if (!vosrResult || vosrRunningRef.current || isSavingVosrBlend) return;
    const revision = ++vosrResultRevision.current;
    try {
      const path = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "Skin Enhance result", extensions: ["png"] }],
      });
      if (typeof path !== "string" || revision !== vosrResultRevision.current) return;
      await loadSkinBlendImages(localAssetSrc(vosrResult.path), localAssetSrc(path));
      if (revision !== vosrResultRevision.current) return;
      setVosrResult({ ...vosrResult, detailPath: path });
      setSkinStrength(100);
      setSkinMaskEditing(false);
      setVosrCompareDetail(true);
      setVosrStatus(`Opened Skin Enhance result: ${path}`);
    } catch (error) {
      if (revision === vosrResultRevision.current) setVosrStatus(String(error));
    }
  }

  async function saveVosrBlend(kind: "vosr" | "skin") {
    if (isSavingVosrBlend || vosrRunningRef.current) return;
    const detail = kind === "skin";
    const baseSrc = detail ? localAssetSrc(vosrOutputPath) : vosrBlendSource;
    const resultPath = detail ? vosrDetailPath : vosrOutputPath;
    if (!baseSrc || !resultPath) return;
    const revision = vosrResultRevision.current;
    const strength = detail ? skinStrength : vosrStrength;
    const model = detail ? "Skin Enhance" : "VOSR";
    const encode = detail ? encodeSkinBlend : encodeVosrBlend;
    const outputName = `${fileName(resultPath).replace(/\.png$/i, "")}_blend-${strength}.png`;
    setIsSavingVosrBlend(true);
    try {
      const dataUrl = await encode(baseSrc, localAssetSrc(resultPath), strength);
      const result = await invoke<JobResult>("save_data_url_to_downloads", {
        outputName, dataUrl, preserveExisting: true,
      });
      if (revision === vosrResultRevision.current) setVosrStatus(`Saved ${strength}% ${model} blend: ${result.outputPath}`);
      appendLog(`Saved ${model} blend (${strength}%): ${result.outputPath}`);
    } catch (error) {
      const message = `Could not save ${model} blend: ${String(error)}`;
      if (revision === vosrResultRevision.current) setVosrStatus(message);
      appendLog(message);
    } finally {
      setIsSavingVosrBlend(false);
    }
  }

  function clearSkinMask() {
    setDetectedSkinMask(null);
    setSkinStrokes([]);
  }

  function resetSkinMask() {
    clearSkinMask();
    setSkinCrop(null);
    setSkinMaskCoverage(50);
  }

  async function detectSkinMask() {
    if (!vosrResult || vosrRunningRef.current || isSavingVosrBlend) return;
    const revision = ++vosrResultRevision.current;
    vosrRunningRef.current = true;
    setVosrJob("detect");
    setVosrStatus("Detecting skin with Stars Speck on CPU.");
    resetJobProgress();
    try {
      const mask = await invoke<DetectedSkinMask>("detect_vosr_skin_mask", {
        inputPath: vosrResult.path,
        mode: skinDetectionMode,
        crop: skinCrop,
      });
      if (revision === vosrResultRevision.current) {
        setDetectedSkinMask(mask);
        setVosrStatus("Skin detected. Refine the selection with the brush or eraser.");
      }
      appendLog("Skin mask ready.");
    } catch (error) {
      const message = String(error);
      if (revision === vosrResultRevision.current) setVosrStatus(message);
      appendLog(`Skin detection failed: ${message}`);
    } finally {
      vosrRunningRef.current = false;
      setVosrJob(null);
    }
  }

  async function enhanceVosrSkin() {
    if (!vosrResult || vosrRunningRef.current || isSavingVosrBlend) return;
    if (!detectedSkinMask && !skinStrokes.some(stroke => !stroke.erase)) return;
    const revision = ++vosrResultRevision.current;
    vosrRunningRef.current = true;
    setVosrJob("enhance");
    setVosrStatus("Enhancing skin texture.");
    resetJobProgress();
    appendLog(`Skin Enhance: ${vosrResult.path}`);
    try {
      const result = await invoke<JobResult>("run_vosr_skin_job", {
        inputPath: vosrResult.path,
        device: vosrDevice,
        strokes: skinStrokes,
        autoMask: detectedSkinMask?.dataUrl ?? null,
        maskBounds: detectedSkinMask?.bounds ?? null,
        maskCoverage: skinMaskCoverage,
      });
      appendTailLog(appendLog, result.log);
      if (revision === vosrResultRevision.current) {
        setVosrResult({ ...vosrResult, detailPath: result.outputPath });
        setSkinStrength(70);
        setSkinMaskEditing(false);
        setVosrCompareDetail(true);
        setVosrStatus(`Skin enhancement saved: ${result.outputPath}`);
      }
      appendLog(`Skin Enhance complete: ${result.outputPath}`);
    } catch (error) {
      const message = String(error);
      if (revision === vosrResultRevision.current) setVosrStatus(message);
      appendLog(`Skin Enhance failed: ${message}`);
    } finally {
      vosrRunningRef.current = false;
      setVosrJob(null);
    }
  }

  async function cancelVosr() {
    try {
      await invoke("cancel_vosr");
      setVosrStatus("Cancellation requested.");
    } catch (error) { appendLog(`VOSR cancel failed: ${String(error)}`); }
  }

  async function runFlux2() {
    if (!flux2Prompt.trim()) {
      setFlux2Status("Enter a prompt before running Flux.2.");
      appendLog("Flux.2 needs a prompt.");
      return;
    }
    setIsRunningFlux2(true);
    setFlux2OutputPath("");
    setFlux2Status("Flux.2 is running.");
    resetJobProgress();
    appendLog("Starting Flux.2 generation...");
    try {
      const result = await invoke<JobResult>("run_flux2_image_job", {
        options: {
          prompt: flux2Prompt,
          outputName: imageOutputName || "flux2_generate",
          width: Number(flux2Width),
          height: Number(flux2Height),
          steps: flux2Steps,
          guidance: flux2Guidance,
          seed: flux2Seed,
          referencePaths: flux2References.map((reference) => reference.path),
          device: resolveModelDevice(flux2Device, preferredModelDevice),
          cpuOffload: flux2CpuOffload,
        },
      });
      appendTailLog(appendLog, result.log);
      setFlux2OutputPath(result.outputPath);
      setFlux2Status(`Flux.2 output: ${result.outputPath}`);
      appendLog(`Flux.2 complete: ${result.outputPath}`);
    } catch (error) {
      const message = String(error).trim();
      setFlux2Status(`Flux.2 failed: ${message}`);
      appendLog(`Flux.2 failed: ${message}`);
    } finally {
      setIsRunningFlux2(false);
    }
  }

  async function addFlux2References() {
    const selected = await openDialog({
      multiple: true,
      directory: false,
      filters: [
        {
          name: "Image",
          extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp", "avif", "apng"],
        },
      ],
    });
    const paths = Array.isArray(selected) ? selected : typeof selected === "string" ? [selected] : [];
    addFlux2ReferencePaths(paths);
  }

  function handleFlux2ReferenceDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files) as Array<File & { path?: string }>;
    if (!files.length) return;

    const imageFiles = files.filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|gif|bmp|webp|avif|apng)$/i.test(file.name));
    if (!imageFiles.length) {
      setFlux2Status("Dropped files are not images.");
      appendLog("Flux.2 references need image files.");
      return;
    }

    const paths = imageFiles.map((file) => file.path || "").filter(Boolean);
    if (!paths.length) {
      setFlux2Status("Drop needs local image files. Use Browse image(s) if needed.");
      appendLog("Flux.2 reference drop did not provide local file paths.");
      return;
    }

    addFlux2ReferencePaths(paths);
  }

  function useCurrentImageAsFlux2Reference() {
    if (!imagePath) {
      setFlux2Status("Choose a local image before using it as a reference.");
      appendLog("Flux.2 reference needs a local image path.");
      return;
    }
    addFlux2ReferencePaths([imagePath]);
  }

  function addFlux2ReferencePaths(paths: string[]) {
    if (!paths.length) return;

    const existing = new Set(flux2References.map((reference) => normalizeReferencePath(reference.path)));
    const nextReferences: GenerativeReferenceItem[] = [];
    for (const path of paths) {
      const trimmed = path.trim();
      if (!trimmed) continue;
      const normalized = normalizeReferencePath(trimmed);
      if (existing.has(normalized)) continue;
      existing.add(normalized);
      nextReferences.push({
        id: `${Date.now()}_${nextReferences.length}_${Math.random().toString(36).slice(2)}`,
        path: trimmed,
        name: fileName(trimmed),
        src: localAssetSrc(trimmed),
      });
    }

    if (!nextReferences.length) {
      setFlux2Status("Reference image is already added.");
      appendLog("Flux.2 reference already added.");
      return;
    }

    const availableSlots = Math.max(0, FLUX2_MAX_REFERENCES - flux2References.length);
    if (!availableSlots) {
      setFlux2Status(`Flux.2 supports up to ${FLUX2_MAX_REFERENCES} reference images.`);
      appendLog(`Flux.2 reference limit reached: ${FLUX2_MAX_REFERENCES}.`);
      return;
    }

    const accepted = nextReferences.slice(0, availableSlots);
    setFlux2References([...flux2References, ...accepted]);
    setFlux2Status(`${accepted.length} reference image${accepted.length === 1 ? "" : "s"} added.`);
    appendLog(`Flux.2 references added: ${accepted.map((reference) => reference.name).join(", ")}`);
    if (nextReferences.length > availableSlots) {
      setFlux2Status(`Flux.2 kept the first ${FLUX2_MAX_REFERENCES} reference images.`);
      appendLog(`Flux.2 supports up to ${FLUX2_MAX_REFERENCES} references; extra images were skipped.`);
    }
  }

  function removeFlux2Reference(id: string) {
    setFlux2References((current) => current.filter((reference) => reference.id !== id));
    setFlux2Status("Reference image removed.");
  }

  function clearFlux2References() {
    setFlux2References([]);
    setFlux2Status("Reference images cleared.");
  }

  async function cancelFlux2() {
    try {
      await invoke("cancel_flux2_image_job");
      setFlux2Status("Flux.2 cancellation requested.");
      appendLog("Flux.2 cancellation requested.");
    } catch (error) {
      appendLog(`Flux.2 cancel failed: ${String(error).trim()}`);
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
    vosrUpscale, setVosrUpscale, vosrTileSize, setVosrTileSize,
    vosrSeed, setVosrSeed, vosrDevice, setVosrDevice,
    vosrBackend, setVosrBackend, vosrColorCorrection, setVosrColorCorrection,
    vosrTileOverlap, setVosrTileOverlap, vosrVaeTileSize, setVosrVaeTileSize,
    vosrVaeTileOverlap, setVosrVaeTileOverlap,
    vosrStatus, vosrOutputPath, isRunningVosr, runVosr, cancelVosr,
    vosrStrength, setVosrStrength, openVosrResult, vosrBlendSource, isSavingVosrBlend, saveVosrBlend,
    vosrDetailPath, vosrCompareDetail, setVosrCompareDetail, isEnhancingVosr, enhanceVosrSkin,
    skinStrength, setSkinStrength, openSkinResult,
    skinMaskEditing, setSkinMaskEditing, skinStrokes, setSkinStrokes,
    detectedSkinMask, detectSkinMask, clearSkinMask, isDetectingSkin,
    skinDetectionMode, setSkinDetectionMode, skinCrop, setSkinCrop, skinMaskCoverage, setSkinMaskCoverage,
    flux2Prompt,
    flux2AspectOrientation,
    flux2AspectRatio,
    flux2Width,
    flux2Height,
    flux2Steps,
    flux2Guidance,
    flux2Seed,
    flux2Device,
    flux2CpuOffload,
    flux2References,
    flux2Status,
    flux2OutputPath,
    isRunningFlux2,
    setImageAction,
    setImageOutputName,
    setDitherComparePreview,
    updateCompressorSettings,
    setDitherViewport,
    setFlux2Prompt,
    setFlux2AspectOrientation,
    setFlux2AspectRatio,
    setFlux2Width,
    setFlux2Steps,
    setFlux2Guidance,
    setFlux2Seed,
    setFlux2Device,
    setFlux2CpuOffload,
    addFlux2References,
    handleFlux2ReferenceDrop,
    useCurrentImageAsFlux2Reference,
    removeFlux2Reference,
    clearFlux2References,
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
    runFlux2,
    cancelFlux2,
  };
}

function normalizeReferencePath(path: string) {
  return path.trim().replace(/\\/g, "/").toLowerCase();
}
