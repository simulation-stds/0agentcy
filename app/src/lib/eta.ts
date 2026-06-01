import type { RealEsrganDevice } from "@/hooks/use-tool-state";
import { resolveModelDevice } from "@/lib/model-devices";

type Dimensions = {
  width: number;
  height: number;
};

export type VideoEtaInput = {
  action: string;
  metadata: Dimensions & { duration: number; fps: number } | null;
  selectedDuration: number;
  selectedModel: string;
  selectedRifeModel: string;
  selectedDevice: string;
  tileSize?: string;
  threads?: string;
  preferredModelDevice: string;
  devices: RealEsrganDevice[];
  rifeMultiplier: string;
  rifeTtaSpatial: boolean;
  rifeTtaTemporal: boolean;
  rifeUhd: boolean;
  faceFusionProcessor: string;
  faceFusionProvider: string;
};

export type ImageEtaInput = {
  imageAction: string;
  dimensions: Dimensions | null;
  supirModel: string;
  supirPreset: string;
  supirDevice: string;
  supirUpscale: string;
  supirUseLlava: boolean;
  preferredModelDevice: string;
  devices: RealEsrganDevice[];
};

export type AudioEtaInput = {
  action: string;
  metadata: { duration: number } | null;
  selectedDuration: number;
  outputFormat: string;
  saveSelection: boolean;
};

export type EtaEstimate = {
  milliseconds: number | null;
  label: string;
  detail: string;
};

type CalibrationEntry = {
  rateMsPerUnit: number;
  samples: number;
  updatedAt: number;
};

type CalibrationStore = Record<string, CalibrationEntry>;

const CALIBRATION_STORAGE_KEY = "videomaxxxing.etaCalibration.v1";
const MAX_SAMPLE_WEIGHT = 12;

export function formatEtaDuration(milliseconds: number | null) {
  if (milliseconds === null || !Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "--:--:--:---";
  }

  const total = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const ms = total % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(ms).padStart(3, "0")}`;
}

export function estimateVideoEta(input: VideoEtaInput): EtaEstimate {
  if (!input.metadata) {
    return emptyEta("Video", "Load a video to estimate runtime.");
  }

  const duration = Math.max(0, input.selectedDuration || input.metadata.duration || 0);
  const fps = Math.max(1, input.metadata.fps || input.metadata.fps || 24);
  const frames = Math.max(1, Math.ceil(duration * fps));
  const megapixels = megapixelsFromDimensions(input.metadata);
  const deviceName = selectedDeviceName(input.devices, input.selectedDevice, input.preferredModelDevice);
  const gpuFactor = gpuSpeedFactor(deviceName);

  if (input.action === "realesrgan_upscale") {
    const scaleFactor = modelScaleFactor(input.selectedModel);
    const workUnits = videoWorkUnits(frames, megapixels, scaleFactor);
    const msPerFrame = 75 * megapixels * scaleFactor * gpuFactor;
    const eta = frames * msPerFrame + 20_000;
    return calibratedEstimate(videoCalibrationKey(input, deviceName), workUnits, {
      milliseconds: roundToNearestSecond(eta),
      label: "Real-ESRGAN",
      detail: `${frames} frames, ${formatMegapixels(megapixels)}, ${deviceName || "selected GPU"}`,
    });
  }

  if (input.action === "rife_interpolate") {
    const multiplier = Math.max(2, Number(input.rifeMultiplier) || 2);
    const ttaFactor = (input.rifeTtaSpatial ? 1.7 : 1) * (input.rifeTtaTemporal ? 1.7 : 1);
    const uhdFactor = input.rifeUhd ? 1.35 : 1;
    const modelFactor = input.selectedRifeModel.includes("v4.6") ? 1 : 1.15;
    const workUnits = videoWorkUnits(frames, megapixels, multiplier * ttaFactor * uhdFactor * modelFactor);
    const msPerFrame = 42 * megapixels * multiplier * ttaFactor * uhdFactor * modelFactor * gpuFactor;
    const eta = frames * msPerFrame + 15_000;
    return calibratedEstimate(videoCalibrationKey(input, deviceName), workUnits, {
      milliseconds: roundToNearestSecond(eta),
      label: "RIFE",
      detail: `${frames} source frames, ${multiplier}x, ${formatMegapixels(megapixels)}, ${deviceName || "selected GPU"}`,
    });
  }

  if (input.action === "facefusion") {
    const processorFactor = input.faceFusionProcessor === "swap_enhance" ? 1.6 : input.faceFusionProcessor === "enhance" ? 1.25 : 1;
    const providerFactor = input.faceFusionProvider === "cuda" ? 0.85 : input.faceFusionProvider === "directml" ? 1.25 : input.faceFusionProvider === "cpu" ? 7 : 1.4;
    const workUnits = videoWorkUnits(frames, megapixels, processorFactor * providerFactor);
    const msPerFrame = 210 * megapixels * processorFactor * providerFactor * gpuFactor;
    const eta = frames * msPerFrame + 30_000;
    return calibratedEstimate(videoCalibrationKey(input, deviceName), workUnits, {
      milliseconds: roundToNearestSecond(eta),
      label: "FaceFusion",
      detail: `${frames} frames, ${input.faceFusionProvider.toUpperCase()}, ${formatMegapixels(megapixels)}`,
    });
  }

  if (input.action === "trim_mp4") {
    const eta = 8_000 + duration * 550 + frames * megapixels * 8;
    return {
      milliseconds: roundToNearestSecond(eta),
      label: "Video trim",
      detail: `${formatDurationDetail(duration)}, ${formatMegapixels(megapixels)}`,
    };
  }

  if (input.action === "extract_frame") {
    return {
      milliseconds: 3_000,
      label: "Frame export",
      detail: `Single frame from ${input.metadata.width}x${input.metadata.height} video`,
    };
  }

  if (input.action === "video_audio") {
    const eta = 5_000 + duration * 180;
    return {
      milliseconds: roundToNearestSecond(eta),
      label: "Audio extract",
      detail: `${formatDurationDetail(duration)} selected`,
    };
  }

  if (input.action === "social_export") {
    const eta = 10_000 + frames * Math.max(0.25, megapixels) * 35;
    return {
      milliseconds: roundToNearestSecond(eta),
      label: "Social export",
      detail: `${frames} frames, ${formatMegapixels(megapixels)}`,
    };
  }

  return emptyEta("Video", "Choose an action to estimate runtime.");
}

export function estimateImageEta(input: ImageEtaInput): EtaEstimate {
  if (!input.dimensions) {
    return emptyEta("Image", "Choose an image to estimate runtime.");
  }

  if (input.imageAction === "dither") {
    const megapixels = megapixelsFromDimensions(input.dimensions);
    return {
      milliseconds: roundToNearestSecond(600 + megapixels * 1_500),
      label: "Dither",
      detail: `${input.dimensions.width}x${input.dimensions.height} source`,
    };
  }

  if (input.imageAction === "palette") {
    return {
      milliseconds: 1_000,
      label: "Palette",
      detail: `${input.dimensions.width}x${input.dimensions.height} source`,
    };
  }

  if (input.imageAction === "compress") {
    const megapixels = megapixelsFromDimensions(input.dimensions);
    return {
      milliseconds: roundToNearestSecond(1_000 + megapixels * 2_000),
      label: "Compressor",
      detail: `${input.dimensions.width}x${input.dimensions.height} source`,
    };
  }

  if (input.imageAction !== "supir") {
    return emptyEta("Image", "Choose an action to estimate runtime.");
  }

  const megapixels = megapixelsFromDimensions(input.dimensions);
  const upscale = Math.max(1, Number(input.supirUpscale) || 1);
  const lowVramFactor = input.supirPreset === "low_vram" ? 2.4 : 1;
  const modelFactor = input.supirModel.toLowerCase().includes("v0f") ? 1.15 : 1;
  const llavaFactor = input.supirUseLlava ? 1.3 : 1;
  const deviceName = selectedDeviceName(input.devices, input.supirDevice, input.preferredModelDevice);
  const gpuFactor = gpuSpeedFactor(deviceName);
  const vramFactor = lowVramLikely(deviceName) ? 1.35 : 1;
  const workUnits = imageWorkUnits(megapixels, upscale, lowVramFactor * modelFactor * llavaFactor * vramFactor);
  const eta = (420_000 * megapixels * Math.pow(upscale, 0.6) * lowVramFactor * modelFactor * llavaFactor * gpuFactor * vramFactor) + 90_000;

  return calibratedEstimate(imageCalibrationKey(input, deviceName), workUnits, {
    milliseconds: roundToNearestSecond(eta),
    label: "SUPIR",
    detail: `${input.supirModel}, ${input.supirPreset.replace("_", " ")}, ${input.dimensions.width}x${input.dimensions.height}, ${deviceName || "selected GPU"}`,
  });
}

export function estimateAudioEta(input: AudioEtaInput): EtaEstimate {
  if (!input.metadata) {
    return emptyEta("Audio", "Choose an audio file to estimate runtime.");
  }

  const duration = Math.max(0, input.selectedDuration || input.metadata.duration || 0);
  const formatFactor = input.outputFormat === "wav" ? 0.5 : input.outputFormat === "flac" ? 1.4 : 1;
  const trimFactor = input.action === "trim" || input.saveSelection ? 0.75 : 1;
  const eta = 2_500 + duration * 120 * formatFactor * trimFactor;
  return {
    milliseconds: roundToNearestSecond(eta),
    label: input.action === "trim" ? "Audio trim" : "Audio convert",
    detail: `${formatDurationDetail(duration)} selected, ${input.outputFormat.toUpperCase()} output`,
  };
}

export function recordVideoEtaRuntime(input: VideoEtaInput, actualMilliseconds: number) {
  if (!input.metadata || !isAiVideoAction(input.action)) return;

  const duration = Math.max(0, input.selectedDuration || input.metadata.duration || 0);
  const fps = Math.max(1, input.metadata.fps || 24);
  const frames = Math.max(1, Math.ceil(duration * fps));
  const megapixels = megapixelsFromDimensions(input.metadata);
  const deviceName = selectedDeviceName(input.devices, input.selectedDevice, input.preferredModelDevice);
  const multiplier = Math.max(2, Number(input.rifeMultiplier) || 2);
  const ttaFactor = (input.rifeTtaSpatial ? 1.7 : 1) * (input.rifeTtaTemporal ? 1.7 : 1);
  const uhdFactor = input.rifeUhd ? 1.35 : 1;
  const rifeModelFactor = input.selectedRifeModel.includes("v4.6") ? 1 : 1.15;
  const processorFactor = input.faceFusionProcessor === "swap_enhance" ? 1.6 : input.faceFusionProcessor === "enhance" ? 1.25 : 1;
  const providerFactor = input.faceFusionProvider === "cuda" ? 0.85 : input.faceFusionProvider === "directml" ? 1.25 : input.faceFusionProvider === "cpu" ? 7 : 1.4;
  const workUnits =
    input.action === "realesrgan_upscale"
      ? videoWorkUnits(frames, megapixels, modelScaleFactor(input.selectedModel))
      : input.action === "rife_interpolate"
        ? videoWorkUnits(frames, megapixels, multiplier * ttaFactor * uhdFactor * rifeModelFactor)
        : videoWorkUnits(frames, megapixels, processorFactor * providerFactor);

  recordCalibrationSample(videoCalibrationKey(input, deviceName), workUnits, actualMilliseconds);
}

export function recordImageEtaRuntime(input: ImageEtaInput, actualMilliseconds: number) {
  if (input.imageAction !== "supir" || !input.dimensions) return;

  const megapixels = megapixelsFromDimensions(input.dimensions);
  const upscale = Math.max(1, Number(input.supirUpscale) || 1);
  const lowVramFactor = input.supirPreset === "low_vram" ? 2.4 : 1;
  const modelFactor = input.supirModel.toLowerCase().includes("v0f") ? 1.15 : 1;
  const llavaFactor = input.supirUseLlava ? 1.3 : 1;
  const deviceName = selectedDeviceName(input.devices, input.supirDevice, input.preferredModelDevice);
  const vramFactor = lowVramLikely(deviceName) ? 1.35 : 1;
  const workUnits = imageWorkUnits(megapixels, upscale, lowVramFactor * modelFactor * llavaFactor * vramFactor);

  recordCalibrationSample(imageCalibrationKey(input, deviceName), workUnits, actualMilliseconds);
}

function emptyEta(label: string, detail: string): EtaEstimate {
  return {
    milliseconds: null,
    label,
    detail,
  };
}

function calibratedEstimate(key: string, workUnits: number, heuristic: EtaEstimate): EtaEstimate {
  const entry = loadCalibration()[key];
  if (!entry || !Number.isFinite(entry.rateMsPerUnit) || entry.rateMsPerUnit <= 0) {
    return heuristic;
  }

  const calibrated = entry.rateMsPerUnit * workUnits;
  const heuristicMs = heuristic.milliseconds ?? calibrated;
  const confidence = Math.min(0.9, 0.35 + entry.samples * 0.15);
  const blended = heuristicMs * (1 - confidence) + calibrated * confidence;
  return {
    ...heuristic,
    milliseconds: roundToNearestSecond(blended),
    detail: `${heuristic.detail}. Calibrated from ${entry.samples} local run${entry.samples === 1 ? "" : "s"}.`,
  };
}

function recordCalibrationSample(key: string, workUnits: number, actualMilliseconds: number) {
  if (!canUseLocalStorage() || !Number.isFinite(workUnits) || workUnits <= 0 || !Number.isFinite(actualMilliseconds) || actualMilliseconds < 1000) {
    return;
  }

  const store = loadCalibration();
  const previous = store[key];
  const sampleRate = actualMilliseconds / workUnits;
  const previousWeight = Math.min(previous?.samples ?? 0, MAX_SAMPLE_WEIGHT);
  const rateMsPerUnit = previous
    ? ((previous.rateMsPerUnit * previousWeight) + sampleRate) / (previousWeight + 1)
    : sampleRate;

  store[key] = {
    rateMsPerUnit,
    samples: Math.min(99, (previous?.samples ?? 0) + 1),
    updatedAt: Date.now(),
  };
  saveCalibration(store);
}

function videoCalibrationKey(input: VideoEtaInput, deviceName: string) {
  if (input.action === "realesrgan_upscale") {
    return calibrationKey(["video", input.action, deviceName, input.selectedModel, input.selectedDevice, input.tileSize ?? "", input.threads ?? ""]);
  }
  if (input.action === "rife_interpolate") {
    return calibrationKey([
      "video",
      input.action,
      deviceName,
      input.selectedRifeModel,
      input.selectedDevice,
      input.rifeMultiplier,
      input.rifeTtaSpatial ? "spatial" : "no-spatial",
      input.rifeTtaTemporal ? "temporal" : "no-temporal",
      input.rifeUhd ? "uhd" : "no-uhd",
      input.threads ?? "",
    ]);
  }
  return calibrationKey(["video", input.action, input.faceFusionProvider, input.faceFusionProcessor, deviceName]);
}

function imageCalibrationKey(input: ImageEtaInput, deviceName: string) {
  return calibrationKey([
    "image",
    input.imageAction,
    deviceName,
    input.supirModel,
    input.supirPreset,
    input.supirUpscale,
    input.supirUseLlava ? "llava" : "no-llava",
  ]);
}

function calibrationKey(parts: Array<string | number | boolean>) {
  return parts.map((part) => String(part).trim().toLowerCase().replace(/\s+/g, " ") || "default").join("|");
}

function videoWorkUnits(frames: number, megapixels: number, settingsFactor: number) {
  return Math.max(0.001, frames * megapixels * Math.max(0.1, settingsFactor));
}

function imageWorkUnits(megapixels: number, upscale: number, settingsFactor: number) {
  return Math.max(0.001, megapixels * Math.pow(upscale, 0.6) * Math.max(0.1, settingsFactor));
}

function isAiVideoAction(action: string) {
  return action === "realesrgan_upscale" || action === "rife_interpolate" || action === "facefusion";
}

function loadCalibration(): CalibrationStore {
  if (!canUseLocalStorage()) return {};
  try {
    const raw = window.localStorage.getItem(CALIBRATION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CalibrationStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveCalibration(store: CalibrationStore) {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Best-effort only: ETA should never block a job.
  }
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function selectedDeviceName(devices: RealEsrganDevice[], selectedDevice: string, preferredModelDevice: string) {
  const resolved = resolveModelDevice(selectedDevice, preferredModelDevice);
  if (!resolved || resolved === "auto") {
    return devices[0]?.name || "";
  }
  if (resolved === "cpu") {
    return "CPU";
  }
  return devices.find((device) => device.id === resolved)?.name || devices[0]?.name || "";
}

function megapixelsFromDimensions(dimensions: Dimensions) {
  return Math.max(0.05, (dimensions.width * dimensions.height) / 1_000_000);
}

function formatMegapixels(megapixels: number) {
  return `${megapixels.toFixed(megapixels >= 10 ? 0 : 1)} MP`;
}

function formatDurationDetail(seconds: number) {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

function roundToNearestSecond(milliseconds: number) {
  return Math.round(milliseconds / 1000) * 1000;
}

function modelScaleFactor(model: string) {
  const lower = model.toLowerCase();
  if (lower.includes("x4") || lower.includes("4x")) return 1.8;
  if (lower.includes("x3") || lower.includes("3x")) return 1.4;
  return 1;
}

function gpuSpeedFactor(name: string) {
  const lower = name.toLowerCase();
  if (lower === "cpu") return 12;
  if (lower.includes("4090")) return 0.42;
  if (lower.includes("4080")) return 0.55;
  if (lower.includes("4070")) return lower.includes("laptop") ? 0.95 : 0.75;
  if (lower.includes("4060")) return lower.includes("laptop") ? 1.25 : 1;
  if (lower.includes("3090")) return 0.65;
  if (lower.includes("3080")) return 0.8;
  if (lower.includes("3070")) return 1.05;
  if (lower.includes("3060")) return 1.35;
  if (lower.includes("3050")) return 2.1;
  if (lower.includes("nvidia")) return 1.4;
  if (lower.includes("amd") || lower.includes("radeon")) return 1.8;
  if (lower.includes("intel")) return 2.5;
  return 1.6;
}

function lowVramLikely(name: string) {
  const lower = name.toLowerCase();
  return lower.includes("3050") || lower.includes("3060") || lower.includes("4060") || lower.includes("4070 laptop");
}
