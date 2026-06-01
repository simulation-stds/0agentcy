import type { ColorFormat, PaletteSwatch } from "@/lib/palette";

export type ToolCategory = "video" | "image" | "audio";
export type DitherAlgorithm = "bayer" | "floyd_steinberg" | "atkinson" | "blue_noise" | "halftone" | "random_noise";

export type DitherSettings = {
  fitMode: "contain" | "cover" | "original";
  outputWidth: number;
  outputHeight: number;
  pixelScale: number;
  algorithm: DitherAlgorithm;
  bayerSize: number;
  halftoneAngle: number;
  halftoneShape: "round" | "diamond" | "line";
  noiseScale: number;
  noiseSeed: number;
  ditherStrength: number;
  posterizeLevels: number;
  blackPoint: number;
  whitePoint: number;
  gamma: number;
  contrast: number;
  brightness: number;
  shadowColor: string;
  midColor: string;
  highlightColor: string;
  usePalette: boolean;
  invertPalette: boolean;
};

export type PaletteSettings = {
  primaryCount: number;
  secondaryCount: number;
  tertiaryCount: number;
  showOpposites: boolean;
  colorFormat: ColorFormat;
};

export type ImageCompressFormat = "png" | "jpg" | "webp" | "avif" | "gif" | "apng";
export type ImageCompressEffort = "fast" | "balanced" | "smallest";

export type ImageCompressorSettings = {
  format: ImageCompressFormat;
  quality: number;
  lossless: boolean;
  effort: ImageCompressEffort;
  keepMetadata: boolean;
  preserveAnimation: boolean;
  reducePalette: boolean;
  paletteColors: number;
  paletteDither: boolean;
  compareOriginal: boolean;
};

export type PaletteGradient = {
  name: string;
  colors: [PaletteSwatch, PaletteSwatch];
};

export type PaletteResult = {
  primary: PaletteSwatch[];
  secondary: PaletteSwatch[];
  tertiary: PaletteSwatch[];
  gradients: PaletteGradient[];
  css: string;
  meta: string;
};

export type AppSettings = {
  defaultDownloadFolder: string;
  tempFolder: string;
  cudaBinFolder: string;
  cudnnBinFolder: string;
  preferredModelDevice: string;
  playNotifications: boolean;
  showInfoIcons: boolean;
};

export type ModelTool = "realesrgan" | "rife";
export type ImageCodecTool = "oxipng" | "libavif" | "libwebp" | "mozjpeg";

export type InstallModelCatalogItem = {
  name: string;
  label: string;
  estimate: string;
  description: string;
};

export type InstalledModelLike = {
  name: string;
  description: string;
  sizeLabel: string;
};

export type ModelSettingsRow = InstallModelCatalogItem & {
  installed?: InstalledModelLike;
  known: boolean;
};

export const defaultPath = "D:/W2DS/PELAGOS/content/260520_weekContent/oh_my_god.mp4";
export const appVersion = "0.1.0";
export const gitDownloadUrl = "https://git-scm.com/download/win";
export const cudaDownloadUrl = "https://developer.nvidia.com/cuda-downloads";
export const cudnnDownloadUrl = "https://developer.nvidia.com/cudnn-downloads";
export const cudaBinPath = "C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA";

export const actions = [
  { id: "trim_mp4", label: "Trim / Export MP4" },
  { id: "extract_frame", label: "Extract Current Frame" },
  { id: "video_audio", label: "Video to Audio" },
  { id: "social_export", label: "Social Export" },
  { id: "realesrgan_upscale", label: "AI Upscale with Real-ESRGAN" },
  { id: "rife_interpolate", label: "Frame Interpolation with RIFE" },
  { id: "facefusion", label: "Face Swap / Enhance" },
];

export const defaultAppSettings: AppSettings = {
  defaultDownloadFolder: "",
  tempFolder: "",
  cudaBinFolder: "",
  cudnnBinFolder: "",
  preferredModelDevice: "",
  playNotifications: true,
  showInfoIcons: true,
};

export const defaultDitherSettings: DitherSettings = {
  fitMode: "contain",
  outputWidth: 640,
  outputHeight: 400,
  pixelScale: 2,
  algorithm: "bayer",
  bayerSize: 4,
  halftoneAngle: 45,
  halftoneShape: "round",
  noiseScale: 1,
  noiseSeed: 23,
  ditherStrength: 0.34,
  posterizeLevels: 6,
  blackPoint: 0.03,
  whitePoint: 0.92,
  gamma: 1,
  contrast: 0.18,
  brightness: 0,
  shadowColor: "#101312",
  midColor: "#92d455",
  highlightColor: "#eef6e8",
  usePalette: true,
  invertPalette: false,
};

export const defaultImageCompressorSettings: ImageCompressorSettings = {
  format: "webp",
  quality: 82,
  lossless: false,
  effort: "balanced",
  keepMetadata: false,
  preserveAnimation: true,
  reducePalette: false,
  paletteColors: 128,
  paletteDither: true,
  compareOriginal: false,
};

export const defaultPaletteSettings: PaletteSettings = {
  primaryCount: 5,
  secondaryCount: 5,
  tertiaryCount: 5,
  showOpposites: false,
  colorFormat: "hex",
};

export const crfOptions = ["16", "18", "20", "23", "28"];
export const tileSizeOptions = [
  { value: "0", label: "Auto" },
  { value: "64", label: "64" },
  { value: "128", label: "128" },
  { value: "256", label: "256" },
  { value: "512", label: "512" },
];
export const threadOptions = ["1:1:1", "1:2:2", "2:2:2", "2:4:2"];

export const installModelCatalog: Record<ModelTool, InstallModelCatalogItem[]> = {
  realesrgan: [
    { name: "realesr-animevideov3-x2", label: "Anime Video x2", estimate: "~15-35 MB", description: "Fast 2x anime/cartoon video upscaling." },
    { name: "realesr-animevideov3-x3", label: "Anime Video x3", estimate: "~15-35 MB", description: "3x anime/cartoon video upscaling." },
    { name: "realesr-animevideov3-x4", label: "Anime Video x4", estimate: "~15-35 MB", description: "4x anime/cartoon video upscaling." },
    { name: "realesrgan-x4plus", label: "Real-ESRGAN x4 Plus", estimate: "~60-180 MB", description: "General-purpose natural image and video-frame upscaling." },
    { name: "realesrgan-x4plus-anime", label: "Real-ESRGAN x4 Anime", estimate: "~15-50 MB", description: "Anime and illustration-focused 4x upscaling." },
  ],
  rife: [
    { name: "rife-v4.6", label: "RIFE v4.6", estimate: "~40-160 MB", description: "Recommended general frame interpolation model." },
    { name: "rife-v4.0", label: "RIFE v4.0", estimate: "~40-160 MB", description: "RIFE v4 family model with broad ncnn compatibility." },
    { name: "rife-v3.1", label: "RIFE v3.1", estimate: "~50-250 MB", description: "Older interpolation model kept for compatibility testing." },
    { name: "rife-anime", label: "RIFE Anime", estimate: "~50-250 MB", description: "Animation/anime-oriented interpolation when bundled by the release." },
  ],
};

export const basicModelByTool: Record<ModelTool, string> = {
  realesrgan: "realesr-animevideov3-x2",
  rife: "rife-v4.6",
};

export const imageCodecToolCatalog: Array<{
  key: ImageCodecTool;
  label: string;
  executableLabel: string;
  description: string;
  sourceLabel: string;
  estimate: string;
}> = [
  {
    key: "oxipng",
    label: "OxiPNG",
    executableLabel: "oxipng.exe",
    description: "Lossless PNG and APNG optimizer used for smaller files without changing pixels.",
    sourceLabel: "oxipng/oxipng",
    estimate: "~5-20 MB installed",
  },
  {
    key: "libavif",
    label: "libavif",
    executableLabel: "avifenc.exe + avifdec.exe",
    description: "AVIF encoder/decoder tools for high-compression still image conversion.",
    sourceLabel: "AOMediaCodec/libavif",
    estimate: "~10-40 MB installed",
  },
  {
    key: "libwebp",
    label: "libwebp",
    executableLabel: "cwebp.exe + dwebp.exe",
    description: "WebP still and animated image tools, including GIF/WebP helpers when available.",
    sourceLabel: "Google WebP downloads",
    estimate: "~10-50 MB installed",
  },
  {
    key: "mozjpeg",
    label: "MozJPEG",
    executableLabel: "cjpeg.exe + jpegtran.exe",
    description: "JPEG encoder utilities for smaller progressive JPEG output at comparable quality.",
    sourceLabel: "mozilla/mozjpeg",
    estimate: "~10-50 MB installed",
  },
];

export function mergeModelRows<T extends InstalledModelLike>(
  catalog: InstallModelCatalogItem[],
  installedModels: T[],
  fallbackDescription: string,
): ModelSettingsRow[] {
  const installedByName = new Map(installedModels.map((model) => [model.name, model]));
  const catalogNames = new Set(catalog.map((model) => model.name));
  const catalogRows = catalog.map((model) => ({
    ...model,
    installed: installedByName.get(model.name),
    known: true,
  }));
  const localRows = installedModels
    .filter((model) => !catalogNames.has(model.name))
    .map((model) => ({
      name: model.name,
      label: model.name,
      estimate: "Unknown",
      description: model.description || fallbackDescription,
      installed: model,
      known: false,
    }));
  return [...catalogRows, ...localRows];
}

export const ditherAlgorithms: Array<{ value: DitherAlgorithm; label: string; help: string }> = [
  {
    value: "bayer",
    label: "Bayer Ordered Dithering",
    help: "Ordered matrix dithering. Fast, crisp, and patterned; good for intentional retro pixel textures.",
  },
  {
    value: "floyd_steinberg",
    label: "Floyd-Steinberg Error Diffusion",
    help: "Diffuses quantization error to neighboring pixels. Produces organic detail with less obvious patterning, but can look grainy.",
  },
  {
    value: "atkinson",
    label: "Atkinson Dithering",
    help: "Classic Macintosh-style error diffusion. Softer than Floyd-Steinberg and tends to preserve bright areas.",
  },
  {
    value: "blue_noise",
    label: "Blue Noise Dithering",
    help: "Uses stable high-frequency noise as the threshold. Reduces regular patterns while keeping texture fine and even.",
  },
  {
    value: "halftone",
    label: "Halftone Dithering",
    help: "Applies a dot-like screen threshold. Good for print/comic-style dot textures rather than pixel-grid noise.",
  },
  {
    value: "random_noise",
    label: "Random / Noise Dithering",
    help: "Uses stable random thresholds. Simple and rough, useful for gritty texture but less structured than blue noise.",
  },
];

export function ditherAlgorithmHelp(algorithm: DitherAlgorithm) {
  return ditherAlgorithms.find((item) => item.value === algorithm)?.help ?? ditherAlgorithms[0].help;
}

export const aspectRatios = [
  { value: "original", label: "Original", icon: "image_aspect_ratio", ratio: null },
  { value: "1:1", label: "1:1", icon: "crop_square", ratio: 1 },
  { value: "4:3", label: "4:3", icon: "aspect_ratio", ratio: 4 / 3 },
  { value: "3:4", label: "3:4", icon: "crop_portrait", ratio: 3 / 4 },
  { value: "16:9", label: "16:9", icon: "crop_16_9", ratio: 16 / 9 },
  { value: "9:16", label: "9:16", icon: "crop_portrait", ratio: 9 / 16 },
  { value: "21:9", label: "21:9", icon: "panorama_wide_angle", ratio: 21 / 9 },
];

export const faceFusionProviderOptions = [
  { value: "directml", label: "DirectML", provider: "DmlExecutionProvider" },
  { value: "cuda", label: "CUDA", provider: "CUDAExecutionProvider" },
  { value: "openvino", label: "OpenVINO", provider: "OpenVINOExecutionProvider" },
  { value: "cpu", label: "CPU", provider: "CPUExecutionProvider" },
];
