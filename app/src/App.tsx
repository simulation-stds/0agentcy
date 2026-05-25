import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import logoGreen from "./assets/logo_green.svg";
import "./App.css";

type ToolStatus = {
  ffmpeg: string | null;
  ffprobe: string | null;
  realesrgan: string | null;
  rife: string | null;
  cloudflared: string | null;
  docker: string | null;
};

type VideoMetadata = {
  duration: number;
  fps: number;
  width: number;
  height: number;
  codec: string;
};

type Thumbnail = {
  time: number;
  data_url?: string;
  dataUrl?: string;
};

type JobResult = {
  outputPath: string;
  log: string;
};

type TunnelResult = {
  publicUrl: string;
  log: string;
};

type RealEsrganModel = {
  name: string;
  scale: string;
  description: string;
  sizeBytes: number;
  sizeLabel: string;
  estimatedSizeLabel: string;
};

type RealEsrganDevice = {
  id: string;
  name: string;
};

type RifeModel = {
  name: string;
  description: string;
  sizeBytes: number;
  sizeLabel: string;
  estimatedSizeLabel: string;
};

type ToolStorage = {
  key: string;
  label: string;
  currentBytes: number;
  currentLabel: string;
  estimatedInstallLabel: string;
};

type ProgressEvent = {
  stage: string;
  message: string;
};

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

type ToolCategory = "video" | "image" | "audio";
type DitherAlgorithm = "bayer" | "floyd_steinberg" | "atkinson" | "blue_noise" | "halftone" | "random_noise";

type DitherSettings = {
  fitMode: "contain" | "cover" | "original";
  outputWidth: number;
  outputHeight: number;
  pixelScale: number;
  algorithm: DitherAlgorithm;
  bayerSize: number;
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

type ColorFormat = "hex" | "rgb" | "hsl";

type PaletteSettings = {
  primaryCount: number;
  secondaryCount: number;
  tertiaryCount: number;
  showOpposites: boolean;
  colorFormat: ColorFormat;
};

type PaletteSwatch = {
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  label: string;
};

type PaletteGradient = {
  name: string;
  colors: [PaletteSwatch, PaletteSwatch];
};

type PaletteResult = {
  primary: PaletteSwatch[];
  secondary: PaletteSwatch[];
  tertiary: PaletteSwatch[];
  gradients: PaletteGradient[];
  css: string;
  meta: string;
};

type PingvinSettings = {
  localUrl: string;
  publicUrl: string;
  cloudflaredPath: string;
  baseUrl: string;
  token: string;
  expiration: string;
  password: string;
  visitorLimit: string;
};

type AppSettings = {
  defaultDownloadFolder: string;
  segmindApiKey: string;
  segmindTargetFps: string;
  segmindTargetResolution: string;
  segmindInputMode: string;
  segmindVideoUrl: string;
  pingvin: PingvinSettings;
};

const defaultPath = "D:/W2DS/PELAGOS/content/260520_weekContent/oh_my_god.mp4";
const actions = [
  { id: "trim_mp4", label: "Trim / Export MP4" },
  { id: "extract_frame", label: "Extract Current Frame" },
  { id: "video_audio", label: "Video to Audio" },
  { id: "social_export", label: "Social Export" },
  { id: "realesrgan_upscale", label: "AI Upscale with Real-ESRGAN" },
  { id: "rife_interpolate", label: "Frame Interpolation with RIFE" },
];

const defaultAppSettings: AppSettings = {
  defaultDownloadFolder: "",
  segmindApiKey: "",
  segmindTargetFps: "60",
  segmindTargetResolution: "1080p",
  segmindInputMode: "local_bridge",
  segmindVideoUrl: "",
  pingvin: {
    localUrl: "http://localhost:3000",
    publicUrl: "",
    cloudflaredPath: "",
    baseUrl: "",
    token: "",
    expiration: "",
    password: "",
    visitorLimit: "",
  },
};

const defaultDitherSettings: DitherSettings = {
  fitMode: "contain",
  outputWidth: 640,
  outputHeight: 400,
  pixelScale: 2,
  algorithm: "bayer",
  bayerSize: 4,
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

const defaultPaletteSettings: PaletteSettings = {
  primaryCount: 5,
  secondaryCount: 5,
  tertiaryCount: 5,
  showOpposites: false,
  colorFormat: "hex",
};

const fpsOptions = ["Auto from source", "12", "15", "20", "24", "25", "30", "48", "50", "60", "90", "120"];
const crfOptions = ["16", "18", "20", "23", "28"];
const tileSizeOptions = [
  { value: "0", label: "Auto" },
  { value: "64", label: "64" },
  { value: "128", label: "128" },
  { value: "256", label: "256" },
  { value: "512", label: "512" },
];
const threadOptions = ["1:1:1", "1:2:2", "2:2:2", "2:4:2"];

type ModelTool = "realesrgan" | "rife";
type InstallModelCatalogItem = {
  name: string;
  label: string;
  estimate: string;
  description: string;
};
type InstalledModelLike = {
  name: string;
  description: string;
  sizeLabel: string;
};
type ModelSettingsRow = InstallModelCatalogItem & {
  installed?: InstalledModelLike;
  known: boolean;
};

const installModelCatalog: Record<ModelTool, InstallModelCatalogItem[]> = {
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
const basicModelByTool = {
  realesrgan: "realesr-animevideov3-x2",
  rife: "rife-v4.6",
};

function mergeModelRows<T extends InstalledModelLike>(
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

const ditherAlgorithms: Array<{ value: DitherAlgorithm; label: string; help: string }> = [
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
const aspectRatios = [
  { value: "free", label: "Free", icon: "crop_free", ratio: null },
  { value: "1:1", label: "1:1", icon: "crop_square", ratio: 1 },
  { value: "4:3", label: "4:3", icon: "aspect_ratio", ratio: 4 / 3 },
  { value: "3:4", label: "3:4", icon: "crop_portrait", ratio: 3 / 4 },
  { value: "16:9", label: "16:9", icon: "crop_16_9", ratio: 16 / 9 },
  { value: "9:16", label: "9:16", icon: "crop_portrait", ratio: 9 / 16 },
  { value: "21:9", label: "21:9", icon: "panorama_wide_angle", ratio: 21 / 9 },
];

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function baseName(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const file = normalized.split("/").pop() || "output";
  return file.replace(/\.[^.]+$/, "") || "output";
}

function outputExtension(action: string, audioFormat: string) {
  if (action === "extract_frame") return ".png";
  if (action === "video_audio") return audioFormat === "wav" ? ".wav" : ".mp3";
  return ".mp4";
}

function outputSuffix(action: string, audioFormat: string) {
  if (action === "extract_frame") return "frame";
  if (action === "video_audio") return audioFormat;
  if (action === "social_export") return "social";
  if (action === "segmind_topaz") return "segmind";
  if (action === "rife_interpolate") return "rife_2x";
  return "trimmed";
}

function socialExtension(format: string) {
  if (format === "gif") return ".gif";
  if (format === "webp") return ".webp";
  if (format === "apng") return ".apng";
  return ".mp4";
}

function progressBar(percent: number) {
  const filled = Math.max(0, Math.min(10, Math.round(percent / 10)));
  return `${"▓".repeat(filled)}${"▒".repeat(10 - filled)}`;
}

function formatProgressEvent(event: ProgressEvent) {
  const percent = event.message.trim().match(/^(\d+(?:\.\d+)?)%$/);
  if (percent) {
    const value = Number(percent[1]);
    return `${event.stage}: ${progressBar(value)} ${value.toFixed(1)}%`;
  }
  return `${event.stage}: ${event.message}`;
}

function imageSource(item: Thumbnail | ModelPreview) {
  return item.dataUrl || item.data_url || "";
}

function localAssetSrc(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return "";
  try {
    return convertFileSrc(trimmed);
  } catch {
    return "";
  }
}

function clamp(value: number, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "").padEnd(6, "0");
  const value = Number.parseInt(clean, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function rgbToHsl(r: number, g: number, b: number) {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === nr) h = 60 * (((ng - nb) / delta) % 6);
    if (max === ng) h = 60 * ((nb - nr) / delta + 2);
    if (max === nb) h = 60 * ((nr - ng) / delta + 4);
  }

  return {
    h: Math.round((h + 360) % 360),
    s: clamp(s),
    l: clamp(l),
  };
}

function hslToRgb(h: number, s: number, l: number) {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s);
  const lightness = clamp(l);
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function swatchFromRgb(r: number, g: number, b: number, label: string): PaletteSwatch {
  const rgb = { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
  return {
    hex: rgbToHex(rgb.r, rgb.g, rgb.b),
    rgb,
    hsl: rgbToHsl(rgb.r, rgb.g, rgb.b),
    label,
  };
}

function formatColorValue(color: PaletteSwatch, format: ColorFormat) {
  if (format === "rgb") return `rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b})`;
  if (format === "hsl") {
    return `hsl(${color.hsl.h} ${Math.round(color.hsl.s * 100)}% ${Math.round(color.hsl.l * 100)}%)`;
  }
  return color.hex;
}

function colorDistance(a: PaletteSwatch, b: PaletteSwatch) {
  const dr = a.rgb.r - b.rgb.r;
  const dg = a.rgb.g - b.rgb.g;
  const db = a.rgb.b - b.rgb.b;
  const hueDelta = Math.abs(a.hsl.h - b.hsl.h);
  const hueDistance = Math.min(hueDelta, 360 - hueDelta) / 360;
  return Math.sqrt(dr * dr + dg * dg + db * db) + hueDistance * 80;
}

function pickDistinctColors(
  candidates: Array<PaletteSwatch & { count: number; score: number }>,
  count: number,
  existing: PaletteSwatch[] = [],
) {
  const selected: PaletteSwatch[] = [];
  for (const candidate of candidates) {
    const all = [...existing, ...selected];
    const nearest = all.length ? Math.min(...all.map((color) => colorDistance(candidate, color))) : Infinity;
    if (nearest > 54 || selected.length === 0) {
      selected.push(candidate);
    }
    if (selected.length >= count) break;
  }
  return selected;
}

function generateCss(result: Omit<PaletteResult, "css">, format: ColorFormat) {
  const lines = [":root {"];
  result.primary.forEach((color, index) => {
    lines.push(`  --primary-${index + 1}: ${formatColorValue(color, format)};`);
  });
  result.secondary.forEach((color, index) => {
    lines.push(`  --secondary-${index + 1}: ${formatColorValue(color, format)};`);
  });
  result.tertiary.forEach((color, index) => {
    lines.push(`  --tertiary-${index + 1}: ${formatColorValue(color, format)};`);
  });
  result.gradients.forEach((gradient, index) => {
    lines.push(
      `  --gradient-${index + 1}: linear-gradient(135deg, ${formatColorValue(gradient.colors[0], format)}, ${formatColorValue(gradient.colors[1], format)});`,
    );
  });
  lines.push("}");
  return lines.join("\n");
}

function extractPaletteFromImageData(imageData: ImageData, settings: PaletteSettings): PaletteResult {
  const bins = new Map<string, { r: number; g: number; b: number; count: number }>();
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 16) {
    const alpha = data[index + 3];
    if (alpha < 48) continue;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const current = bins.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    current.r += r;
    current.g += g;
    current.b += b;
    current.count += 1;
    bins.set(key, current);
  }

  const candidates = [...bins.values()]
    .filter((bin) => bin.count >= 2)
    .map((bin) => {
      const swatch = swatchFromRgb(bin.r / bin.count, bin.g / bin.count, bin.b / bin.count, "");
      const saturationBoost = 0.45 + swatch.hsl.s;
      const balanceBoost = 0.72 + (1 - Math.abs(swatch.hsl.l - 0.5));
      return {
        ...swatch,
        count: bin.count,
        score: bin.count * saturationBoost * balanceBoost,
      };
    });

  const popular = [...candidates].sort((a, b) => b.count - a.count);
  const vivid = [...candidates].sort((a, b) => b.score - a.score);
  const basePrimary = pickDistinctColors(popular, settings.primaryCount).map((color, index) => ({ ...color, label: `Primary ${index + 1}` }));
  const baseSecondary = pickDistinctColors(vivid, settings.secondaryCount, basePrimary).map((color, index) => ({ ...color, label: `Secondary ${index + 1}` }));
  const tertiaryCandidates = [...candidates].sort((a, b) => {
    const aWarmth = Math.abs(a.hsl.h - 45) < 75 ? 1.18 : 1;
    const bWarmth = Math.abs(b.hsl.h - 45) < 75 ? 1.18 : 1;
    return b.score * bWarmth - a.score * aWarmth;
  });
  const baseTertiary = pickDistinctColors(tertiaryCandidates, settings.tertiaryCount, [...basePrimary, ...baseSecondary]).map((color, index) => ({
    ...color,
    label: `Tertiary ${index + 1}`,
  }));
  const makeOpposite = (color: PaletteSwatch, label: string) => {
    const rgb = hslToRgb(color.hsl.h + 180, Math.max(0.32, color.hsl.s), clamp(color.hsl.l, 0.22, 0.78));
    return swatchFromRgb(rgb.r, rgb.g, rgb.b, label);
  };
  const primary = settings.showOpposites
    ? basePrimary.map((color, index) => makeOpposite(color, `Primary ${index + 1}`))
    : basePrimary;
  const secondary = settings.showOpposites
    ? baseSecondary.map((color, index) => makeOpposite(color, `Secondary ${index + 1}`))
    : baseSecondary;
  const tertiary = settings.showOpposites
    ? baseTertiary.map((color, index) => makeOpposite(color, `Tertiary ${index + 1}`))
    : baseTertiary;
  const allPaletteColors = [...primary, ...secondary, ...tertiary];
  const fallback = allPaletteColors[0] ?? swatchFromRgb(146, 212, 85, "Fallback");
  const gradients: PaletteGradient[] = [
    { name: "Dominant Blend", colors: [primary[0] ?? fallback, secondary[0] ?? primary[1] ?? fallback] },
    { name: "Spectrum Accent", colors: [secondary[1] ?? primary[1] ?? fallback, tertiary[0] ?? secondary[0] ?? fallback] },
    { name: "Deep Contrast", colors: [primary[primary.length - 1] ?? fallback, tertiary[tertiary.length - 1] ?? secondary[0] ?? fallback] },
    { name: "Tertiary Wash", colors: [tertiary[1] ?? secondary[0] ?? fallback, primary[2] ?? tertiary[0] ?? fallback] },
  ];
  const resultWithoutCss = {
    primary,
    secondary,
    tertiary,
    gradients,
    meta: `${settings.showOpposites ? "Opposite spectrum | " : ""}${primary.length} primary | ${secondary.length} secondary | ${tertiary.length} tertiary`,
  };
  return {
    ...resultWithoutCss,
    css: generateCss(resultWithoutCss, settings.colorFormat),
  };
}

function drawPaletteSheet(canvas: HTMLCanvasElement, result: PaletteResult, format: ColorFormat) {
  const rows = [
    { title: "Primary", colors: result.primary },
    { title: "Secondary", colors: result.secondary },
    { title: "Tertiary", colors: result.tertiary },
  ];
  const width = 960;
  const rowHeight = 108;
  const gradientHeight = 84;
  const height = 92 + rows.length * rowHeight + 36 + result.gradients.length * gradientHeight;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#101312";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#eef6e8";
  ctx.font = "700 30px Hanken Grotesk, sans-serif";
  ctx.fillText("Palette Extractor", 32, 48);
  ctx.fillStyle = "#aab8ad";
  ctx.font = "18px IBM Plex Mono, Consolas, monospace";
  ctx.fillText(result.meta, 32, 76);

  let y = 106;
  rows.forEach((row) => {
    ctx.fillStyle = "#dcebd9";
    ctx.font = "700 18px Hanken Grotesk, sans-serif";
    ctx.fillText(row.title, 32, y);
    const swatchWidth = Math.floor((width - 64 - 12 * 4) / 5);
    row.colors.forEach((color, index) => {
      const x = 32 + index * (swatchWidth + 12);
      ctx.fillStyle = color.hex;
      ctx.fillRect(x, y + 14, swatchWidth, 48);
      ctx.strokeStyle = "rgba(238, 246, 232, 0.28)";
      ctx.strokeRect(x, y + 14, swatchWidth, 48);
      ctx.fillStyle = "#eef6e8";
      ctx.font = "700 15px IBM Plex Mono, Consolas, monospace";
      ctx.fillText(formatColorValue(color, format), x, y + 84);
    });
    y += rowHeight;
  });

  y += 12;
  result.gradients.forEach((gradient, index) => {
    const gradientPaint = ctx.createLinearGradient(32, y, width - 32, y);
    gradientPaint.addColorStop(0, gradient.colors[0].hex);
    gradientPaint.addColorStop(1, gradient.colors[1].hex);
    ctx.fillStyle = gradientPaint;
    ctx.fillRect(32, y, width - 64, 44);
    ctx.strokeStyle = "rgba(238, 246, 232, 0.28)";
    ctx.strokeRect(32, y, width - 64, 44);
    ctx.fillStyle = "#eef6e8";
    ctx.font = "700 16px Hanken Grotesk, sans-serif";
    ctx.fillText(`${index + 1}. ${gradient.name}`, 32, y + 68);
    y += gradientHeight;
  });
}

function mixRgb(a: ReturnType<typeof hexToRgb>, b: ReturnType<typeof hexToRgb>, t: number) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function mapDitherPalette(luma: number, settings: DitherSettings) {
  const shadow = hexToRgb(settings.shadowColor);
  const mid = hexToRgb(settings.midColor);
  const highlight = hexToRgb(settings.highlightColor);
  const value = settings.invertPalette ? 1 - luma : luma;
  if (value <= 0.5) return mixRgb(shadow, mid, value / 0.5);
  return mixRgb(mid, highlight, (value - 0.5) / 0.5);
}

function makeBayer(size: number) {
  let matrix = [
    [0, 2],
    [3, 1],
  ];
  while (matrix.length < size) {
    const n = matrix.length;
    const next = Array.from({ length: n * 2 }, () => Array(n * 2).fill(0));
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const value = matrix[y][x] * 4;
        next[y][x] = value;
        next[y][x + n] = value + 2;
        next[y + n][x] = value + 3;
        next[y + n][x + n] = value + 1;
      }
    }
    matrix = next;
  }
  const divisor = size * size;
  return matrix.map((row) => row.map((value) => (value + 0.5) / divisor));
}

function ditherAlgorithmHelp(algorithm: DitherAlgorithm) {
  return ditherAlgorithms.find((item) => item.value === algorithm)?.help ?? ditherAlgorithms[0].help;
}

function quantizeLuma(luma: number, levels: number) {
  const steps = Math.max(2, Math.round(levels));
  return Math.round(clamp(luma) * (steps - 1)) / (steps - 1);
}

function stableNoise(x: number, y: number, salt = 0) {
  const value = Math.sin((x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453);
  return value - Math.floor(value);
}

function diffuse(work: Float32Array, width: number, height: number, x: number, y: number, error: number, offsets: Array<[number, number, number]>) {
  for (const [dx, dy, weight] of offsets) {
    const nextX = x + dx;
    const nextY = y + dy;
    if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
    const index = nextY * width + nextX;
    work[index] = clamp(work[index] + error * weight);
  }
}

function ditherLuma(values: Float32Array, width: number, height: number, settings: DitherSettings) {
  const output = new Float32Array(values.length);
  const strength = settings.ditherStrength;

  if (settings.algorithm === "floyd_steinberg" || settings.algorithm === "atkinson") {
    const work = new Float32Array(values);
    const floyd: Array<[number, number, number]> = [
      [1, 0, 7 / 16],
      [-1, 1, 3 / 16],
      [0, 1, 5 / 16],
      [1, 1, 1 / 16],
    ];
    const atkinson: Array<[number, number, number]> = [
      [1, 0, 1 / 8],
      [2, 0, 1 / 8],
      [-1, 1, 1 / 8],
      [0, 1, 1 / 8],
      [1, 1, 1 / 8],
      [0, 2, 1 / 8],
    ];
    const offsets = settings.algorithm === "floyd_steinberg" ? floyd : atkinson;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const oldValue = clamp(work[index]);
        const nextValue = quantizeLuma(oldValue, settings.posterizeLevels);
        output[index] = nextValue;
        diffuse(work, width, height, x, y, (oldValue - nextValue) * strength, offsets);
      }
    }
    return output;
  }

  const bayer = settings.algorithm === "bayer" ? makeBayer(settings.bayerSize) : null;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      let threshold = 0.5;
      if (settings.algorithm === "bayer" && bayer) {
        threshold = bayer[y % settings.bayerSize][x % settings.bayerSize];
      } else if (settings.algorithm === "blue_noise") {
        threshold = clamp((stableNoise(x * 5, y * 5, 3) + stableNoise(x * 13, y * 13, 11) * 0.5) / 1.5);
      } else if (settings.algorithm === "halftone") {
        const cell = Math.max(4, settings.bayerSize * 2);
        const cx = ((x % cell) + 0.5) / cell - 0.5;
        const cy = ((y % cell) + 0.5) / cell - 0.5;
        threshold = clamp(1 - Math.hypot(cx, cy) / 0.72);
      } else {
        threshold = stableNoise(x, y, 23);
      }
      output[index] = quantizeLuma(values[index] + (threshold - 0.5) * strength, settings.posterizeLevels);
    }
  }
  return output;
}

function computeDrawRect(image: HTMLImageElement, width: number, height: number, fitMode: DitherSettings["fitMode"]) {
  if (fitMode === "original") {
    return {
      x: Math.round((width - image.naturalWidth) / 2),
      y: Math.round((height - image.naturalHeight) / 2),
      w: image.naturalWidth,
      h: image.naturalHeight,
    };
  }
  const scale = fitMode === "cover"
    ? Math.max(width / image.naturalWidth, height / image.naturalHeight)
    : Math.min(width / image.naturalWidth, height / image.naturalHeight);
  return {
    x: Math.round((width - image.naturalWidth * scale) / 2),
    y: Math.round((height - image.naturalHeight * scale) / 2),
    w: Math.round(image.naturalWidth * scale),
    h: Math.round(image.naturalHeight * scale),
  };
}

function toneLuma(r: number, g: number, b: number, settings: DitherSettings) {
  let luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const range = Math.max(0.001, settings.whitePoint - settings.blackPoint);
  luma = clamp((luma - settings.blackPoint) / range);
  luma = clamp((luma - 0.5) * (1 + settings.contrast) + 0.5 + settings.brightness);
  return Math.pow(luma, 1 / Math.max(0.001, settings.gamma));
}

function HelpIcon({ text }: { text: string }) {
  return (
    <span className="help-icon material-symbols-rounded" title={text} aria-label={text}>
      help
    </span>
  );
}

function FieldLabel({ children, help }: { children: React.ReactNode; help: string }) {
  return (
    <span className="setting-label">
      {children}
      <HelpIcon text={help} />
    </span>
  );
}

function FpsSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
      {fpsOptions.map((fps) => (
        <option key={fps} value={fps === "Auto from source" ? "auto" : fps}>
          {fps === "Auto from source" ? fps : `${fps} fps`}
        </option>
      ))}
    </select>
  );
}

function PaletteSection({ title, colors, format }: { title: string; colors: PaletteSwatch[]; format: ColorFormat }) {
  return (
    <div className="palette-section">
      <h3>{title}</h3>
      <div className="swatch-grid">
        {colors.map((color) => (
          <div className="swatch-card" key={`${title}-${color.hex}`}>
            <span style={{ backgroundColor: color.hex }} />
            <code>{formatColorValue(color, format)}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeSettings(settings: AppSettings): AppSettings {
  const pingvin = { ...defaultAppSettings.pingvin, ...settings.pingvin };
  const segmindInputMode = settings.segmindInputMode === "pingvin" ? "local_bridge" : settings.segmindInputMode;
  if (!pingvin.localUrl.trim()) {
    pingvin.localUrl = "http://localhost:3000";
  }
  if (!pingvin.publicUrl.trim() && pingvin.baseUrl.trim()) {
    pingvin.publicUrl = pingvin.baseUrl;
  }
  return { ...defaultAppSettings, ...settings, segmindInputMode, pingvin };
}

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanPlayLoggedRef = useRef(false);
  const selectionSeekInProgressRef = useRef(false);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const thumbnailGridRef = useRef<HTMLDivElement | null>(null);
  const compareViewRef = useRef<HTMLDivElement | null>(null);
  const ditherCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ditherSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paletteCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paletteSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tools, setTools] = useState<ToolStatus | null>(null);
  const [models, setModels] = useState<RealEsrganModel[]>([]);
  const [rifeModels, setRifeModels] = useState<RifeModel[]>([]);
  const [toolStorage, setToolStorage] = useState<ToolStorage[]>([]);
  const [devices, setDevices] = useState<RealEsrganDevice[]>([]);
  const [inputPath, setInputPath] = useState(defaultPath);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  const [previewStart, setPreviewStart] = useState(0);
  const [previewEnd, setPreviewEnd] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [timelineHoverTime, setTimelineHoverTime] = useState<number | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [trimDrag, setTrimDrag] = useState<"start" | "end" | null>(null);
  const [playSelectionOnly, setPlaySelectionOnly] = useState(true);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [action, setAction] = useState("trim_mp4");
  const [audioFormat, setAudioFormat] = useState("mp3");
  const [socialFormat, setSocialFormat] = useState("h264_mp4");
  const [socialFps, setSocialFps] = useState("24");
  const [socialWidth, setSocialWidth] = useState("1280");
  const [socialLoop, setSocialLoop] = useState(true);
  const [socialScaleFilter, setSocialScaleFilter] = useState("lanczos");
  const [socialCrf, setSocialCrf] = useState("18");
  const [socialQuality, setSocialQuality] = useState("90");
  const [socialPreset, setSocialPreset] = useState("veryslow");
  const [socialIncludeAudio, setSocialIncludeAudio] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedRifeModel, setSelectedRifeModel] = useState("");
  const [selectedDevice, setSelectedDevice] = useState("");
  const [rifeMultiplier, setRifeMultiplier] = useState("2");
  const [crf, setCrf] = useState("18");
  const [encoderPreset, setEncoderPreset] = useState("medium");
  const [tileSize, setTileSize] = useState("0");
  const [threads, setThreads] = useState("1:2:2");
  const [rifeTtaSpatial, setRifeTtaSpatial] = useState(false);
  const [rifeTtaTemporal, setRifeTtaTemporal] = useState(false);
  const [rifeUhd, setRifeUhd] = useState(false);
  const [outputFolder, setOutputFolder] = useState("");
  const [outputName, setOutputName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isComparingModels, setIsComparingModels] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isUpdatingEsrgan, setIsUpdatingEsrgan] = useState(false);
  const [isUpdatingRife, setIsUpdatingRife] = useState(false);
  const [isUpdatingFfmpeg, setIsUpdatingFfmpeg] = useState(false);
  const [isUpdatingCloudflared, setIsUpdatingCloudflared] = useState(false);
  const [isInstallingPingvin, setIsInstallingPingvin] = useState(false);
  const [isStartingPingvin, setIsStartingPingvin] = useState(false);
  const [isStoppingPingvin, setIsStoppingPingvin] = useState(false);
  const [isStartingTunnel, setIsStartingTunnel] = useState(false);
  const [isTunnelRunning, setIsTunnelRunning] = useState(false);
  const [settingsTab, setSettingsTab] = useState("general");
  const [expandedTool, setExpandedTool] = useState("ffmpeg");
  const [isModelInstallOpen, setIsModelInstallOpen] = useState(false);
  const [modelInstallTool, setModelInstallTool] = useState<"realesrgan" | "rife">("realesrgan");
  const [selectedInstallModels, setSelectedInstallModels] = useState<string[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings);
  const [modelPreviews, setModelPreviews] = useState<ModelPreview[]>([]);
  const [compareOriginal, setCompareOriginal] = useState("");
  const [compareInputPath, setCompareInputPath] = useState("");
  const [selectedCompareModel, setSelectedCompareModel] = useState("");
  const [compareFrameTime, setCompareFrameTime] = useState(0);
  const [compareSplit, setCompareSplit] = useState(50);
  const [compareZoom, setCompareZoom] = useState(1);
  const [comparePan, setComparePan] = useState({ x: 0, y: 0 });
  const [compareDragMode, setCompareDragMode] = useState<"split" | "pan" | null>(null);
  const [comparePanStart, setComparePanStart] = useState({ x: 0, y: 0, panX: 0, panY: 0 });
  const [log, setLog] = useState<string[]>(["Tauri rebuild ready. Paste a video path and load it."]);
  const [toolCategory, setToolCategory] = useState<ToolCategory>("video");
  const [imagePath, setImagePath] = useState("");
  const [imageObjectUrl, setImageObjectUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageAction, setImageAction] = useState("dither");
  const [ditherAspectRatio, setDitherAspectRatio] = useState("free");
  const [imageMeta, setImageMeta] = useState("");
  const [ditherSettings, setDitherSettings] = useState<DitherSettings>(defaultDitherSettings);
  const [ditherStatus, setDitherStatus] = useState("Choose an image to render.");
  const [isDitherReady, setIsDitherReady] = useState(false);
  const [paletteSettings, setPaletteSettings] = useState<PaletteSettings>(defaultPaletteSettings);
  const [paletteResult, setPaletteResult] = useState<PaletteResult | null>(null);
  const [paletteStatus, setPaletteStatus] = useState("Choose an image to extract colors.");

  useEffect(() => {
    refreshToolState();
    invoke<AppSettings>("get_app_settings")
      .then((settings) => setAppSettings(normalizeSettings(settings)))
      .catch((error) => appendLog(`Settings load failed: ${String(error)}`));
    invoke<string>("default_output_dir")
      .then(setOutputFolder)
      .catch((error) => appendLog(`Output folder setup failed: ${String(error)}`));
  }, []);

  async function refreshToolState() {
    try {
      setTools(await invoke<ToolStatus>("detect_tools"));
    } catch (error) {
      appendLog(`Tool detection failed: ${String(error)}`);
    }

    try {
      const items = await invoke<RealEsrganModel[]>("list_realesrgan_models");
      setModels(items);
      setSelectedModel((current) => current || items[0]?.name || "");
    } catch (error) {
      appendLog(`Real-ESRGAN model scan failed: ${String(error)}`);
    }

    try {
      const items = await invoke<RifeModel[]>("list_rife_models");
      setRifeModels(items);
      setSelectedRifeModel((current) => current || items.find((item) => item.name === "rife-v4.6")?.name || items[0]?.name || "");
    } catch (error) {
      appendLog(`RIFE model scan failed: ${String(error)}`);
    }

    try {
      setDevices(await invoke<RealEsrganDevice[]>("detect_realesrgan_devices"));
    } catch (error) {
      appendLog(`GPU detection failed: ${String(error)}`);
    }

    try {
      setToolStorage(await invoke<ToolStorage[]>("get_tool_storage"));
    } catch (error) {
      appendLog(`Tool storage scan failed: ${String(error)}`);
    }
  }

  useEffect(() => {
    if (!(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
      return;
    }
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    listen<ProgressEvent>("upscale-progress", (event) => {
      appendLog(formatProgressEvent(event.payload));
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
        return;
      }
      cleanup = unlisten;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    const selectedScale = models.find((item) => item.name === selectedModel)?.scale || "4";
    const suffix =
      action === "realesrgan_upscale"
        ? `upscaled_${selectedScale}x`
        : action === "social_export"
          ? `social_${socialFormat.replace("h264_", "")}`
          : action === "segmind_topaz"
            ? "segmind_topaz"
        : action === "rife_interpolate"
          ? `rife_${rifeMultiplier}x`
          : outputSuffix(action, audioFormat);
    const extension =
      action === "social_export"
        ? socialExtension(socialFormat)
        : action === "realesrgan_upscale" || action === "segmind_topaz"
          ? ".mp4"
          : outputExtension(action, audioFormat);
    setOutputName(`${baseName(inputPath)}_${suffix}${extension}`);
  }, [inputPath, action, audioFormat, selectedModel, models, rifeMultiplier, socialFormat]);

  const videoSrc = useMemo(() => {
    return localAssetSrc(inputPath);
  }, [inputPath]);

  const imageSrc = useMemo(() => {
    if (imageObjectUrl) return imageObjectUrl;
    return localAssetSrc(imagePath);
  }, [imageObjectUrl, imagePath]);

  const duration = metadata?.duration ?? 0;
  const selectedDuration = Math.max(0, trimEnd - trimStart);
  const selectedFrames = metadata?.fps ? Math.round(selectedDuration * metadata.fps) : 0;
  const shouldPlaySelection = playSelectionOnly && duration > 0 && selectedDuration > 0.05 && selectedDuration < duration - 0.001;
  const visibleStart = Math.max(0, Math.min(previewStart, duration));
  const visibleEnd = Math.max(visibleStart, Math.min(previewEnd || duration, duration));
  const visibleDuration = Math.max(0, visibleEnd - visibleStart);
  const isPreviewFitted = duration > 0 && (Math.abs(visibleStart) > 0.001 || Math.abs(visibleEnd - duration) > 0.001);
  const canFitSelection = duration > 0 && selectedDuration > 0.05 && (!isPreviewFitted || Math.abs(visibleStart - trimStart) > 0.001 || Math.abs(visibleEnd - trimEnd) > 0.001);
  const activeModel = models.find((item) => item.name === selectedModel);
  const roughUpscaleEta = selectedFrames ? `${Math.ceil(selectedFrames / 3)}s+` : "Load video first";
  const roughRifeEta = selectedFrames ? `${Math.ceil(selectedFrames * Number(rifeMultiplier || 2) / 12)}s+` : "Load video first";
  const selectedComparePreview = modelPreviews.find((item) => item.model === selectedCompareModel) || modelPreviews[0];
  const currentInputKey = inputPath.trim();
  const hasCurrentVideoComparison = Boolean(compareOriginal && compareInputPath === currentInputKey);
  const currentPercent = visibleDuration ? Math.min(100, Math.max(0, ((currentTime - visibleStart) / visibleDuration) * 100)) : 0;
  const trimStartPercent = visibleDuration ? Math.min(100, Math.max(0, ((trimStart - visibleStart) / visibleDuration) * 100)) : 0;
  const trimEndPercent = visibleDuration ? Math.min(100, Math.max(0, ((trimEnd - visibleStart) / visibleDuration) * 100)) : 100;
  const hoverPercent = visibleDuration && timelineHoverTime !== null ? Math.min(100, Math.max(0, ((timelineHoverTime - visibleStart) / visibleDuration) * 100)) : null;
  const allServicesAvailable = Boolean(tools?.ffmpeg && tools?.ffprobe && tools?.realesrgan && tools?.rife);
  const cloudStatusClass = !appSettings.pingvin.localUrl.trim()
    ? "service-card bad"
    : appSettings.pingvin.publicUrl.trim()
      ? "service-card ok"
      : "service-card warn";
  const storageFor = (key: string) => toolStorage.find((item) => item.key === key);
  const activeInstallCatalog = installModelCatalog[modelInstallTool];
  const realEsrganModelRows = useMemo(
    () => mergeModelRows(installModelCatalog.realesrgan, models, "Installed Real-ESRGAN model detected locally."),
    [models],
  );
  const rifeModelRows = useMemo(
    () => mergeModelRows(installModelCatalog.rife, rifeModels, "Installed RIFE model detected locally."),
    [rifeModels],
  );
  const modelCountLabel = (installed: number, catalogTotal: number) =>
    installed > catalogTotal ? `${installed} installed` : `${installed}/${catalogTotal} models`;

  useEffect(() => {
    if (!imageSrc || toolCategory !== "image" || imageAction !== "dither") {
      return;
    }
    const canvas = ditherCanvasRef.current;
    const sourceCanvas = ditherSourceCanvasRef.current;
    if (!canvas || !sourceCanvas) {
      return;
    }
    const previewCtx = canvas.getContext("2d");
    const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
    if (!previewCtx || !sourceCtx) {
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      try {
        const finalWidth = Math.round(clamp(ditherSettings.outputWidth, 8, 4096));
        const finalHeight = Math.round(clamp(ditherSettings.outputHeight, 8, 4096));
        const pixelScale = Math.max(1, Math.round(ditherSettings.pixelScale));
        const sampleWidth = Math.ceil(finalWidth / pixelScale);
        const sampleHeight = Math.ceil(finalHeight / pixelScale);

        sourceCanvas.width = sampleWidth;
        sourceCanvas.height = sampleHeight;
        sourceCtx.clearRect(0, 0, sampleWidth, sampleHeight);
        sourceCtx.fillStyle = "#000";
        sourceCtx.fillRect(0, 0, sampleWidth, sampleHeight);
        sourceCtx.imageSmoothingEnabled = true;
        sourceCtx.imageSmoothingQuality = "high";
        const rect = computeDrawRect(image, sampleWidth, sampleHeight, ditherSettings.fitMode);
        sourceCtx.drawImage(image, rect.x, rect.y, rect.w, rect.h);

        const src = sourceCtx.getImageData(0, 0, sampleWidth, sampleHeight);
        const tonedValues = new Float32Array(sampleWidth * sampleHeight);
        for (let index = 0; index < tonedValues.length; index += 1) {
          const sourceIndex = index * 4;
          tonedValues[index] = toneLuma(src.data[sourceIndex], src.data[sourceIndex + 1], src.data[sourceIndex + 2], ditherSettings);
        }
        const ditheredValues = ditherLuma(tonedValues, sampleWidth, sampleHeight, ditherSettings);
        const output = previewCtx.createImageData(finalWidth, finalHeight);
        for (let y = 0; y < sampleHeight; y += 1) {
          for (let x = 0; x < sampleWidth; x += 1) {
            const sourceIndex = (y * sampleWidth + x) * 4;
            const alpha = src.data[sourceIndex + 3];
            const toned = tonedValues[y * sampleWidth + x];
            const stepped = ditheredValues[y * sampleWidth + x];
            for (let sy = 0; sy < pixelScale; sy += 1) {
              const outY = y * pixelScale + sy;
              if (outY >= finalHeight) continue;
              for (let sx = 0; sx < pixelScale; sx += 1) {
                const outX = x * pixelScale + sx;
                if (outX >= finalWidth) continue;
                const sourceR = src.data[sourceIndex];
                const sourceG = src.data[sourceIndex + 1];
                const sourceB = src.data[sourceIndex + 2];
                const color = ditherSettings.usePalette
                  ? mapDitherPalette(stepped, ditherSettings)
                  : {
                      r: Math.round(sourceR * (stepped / Math.max(0.001, toned))),
                      g: Math.round(sourceG * (stepped / Math.max(0.001, toned))),
                      b: Math.round(sourceB * (stepped / Math.max(0.001, toned))),
                    };
                const outIndex = (outY * finalWidth + outX) * 4;
                output.data[outIndex] = color.r;
                output.data[outIndex + 1] = color.g;
                output.data[outIndex + 2] = color.b;
                output.data[outIndex + 3] = alpha;
              }
            }
          }
        }

        canvas.width = finalWidth;
        canvas.height = finalHeight;
        previewCtx.putImageData(output, 0, 0);
        setImageMeta(`${image.naturalWidth}x${image.naturalHeight} source | ${finalWidth}x${finalHeight} PNG | ${pixelScale}x pixels`);
        setDitherStatus("Rendered.");
        setIsDitherReady(true);
      } catch (error) {
        setDitherStatus(`Render failed: ${String(error)}`);
        setIsDitherReady(false);
      }
    };
    image.onerror = () => {
      if (cancelled) return;
      setDitherStatus("Could not load that image.");
      setIsDitherReady(false);
    };
    image.crossOrigin = imageSrc.startsWith("blob:") || imageSrc.startsWith("data:") ? "" : "anonymous";
    image.src = imageSrc;
    return () => {
      cancelled = true;
    };
  }, [imageSrc, ditherSettings, toolCategory, imageAction]);

  useEffect(() => {
    if (!imageSrc || toolCategory !== "image" || imageAction !== "palette") {
      return;
    }
    const sourceCanvas = paletteSourceCanvasRef.current;
    const sheetCanvas = paletteCanvasRef.current;
    if (!sourceCanvas || !sheetCanvas) return;
    const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
    if (!sourceCtx) return;

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      try {
        const maxSide = 180;
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        sourceCanvas.width = width;
        sourceCanvas.height = height;
        sourceCtx.clearRect(0, 0, width, height);
        sourceCtx.drawImage(image, 0, 0, width, height);
        const imageData = sourceCtx.getImageData(0, 0, width, height);
        const result = extractPaletteFromImageData(imageData, paletteSettings);
        drawPaletteSheet(sheetCanvas, result, paletteSettings.colorFormat);
        setPaletteResult(result);
        setPaletteStatus("Palette extracted.");
        setImageMeta(`${image.naturalWidth}x${image.naturalHeight} source | sampled ${width}x${height}`);
      } catch (error) {
        setPaletteResult(null);
        setPaletteStatus(`Palette extraction failed: ${String(error)}`);
      }
    };
    image.onerror = () => {
      if (cancelled) return;
      setPaletteResult(null);
      setPaletteStatus("Could not load that image.");
    };
    image.crossOrigin = imageSrc.startsWith("blob:") || imageSrc.startsWith("data:") ? "" : "anonymous";
    image.src = imageSrc;
    return () => {
      cancelled = true;
    };
  }, [imageSrc, paletteSettings, toolCategory, imageAction]);

  useEffect(() => {
    return () => {
      if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
    };
  }, [imageObjectUrl]);
  const compareTransform = `translate(${comparePan.x}px, ${comparePan.y}px) scale(${compareZoom})`;

  function appendLog(message: string) {
    setLog((items) => [...items.slice(-80), message]);
  }

  async function loadVideo(pathOverride?: string) {
    const path = (pathOverride ?? inputPath).trim();
    if (!path) return;

    setInputPath(path);
    setIsLoading(true);
    setThumbnails([]);
    setCurrentTime(0);
    setTimelineHoverTime(null);
    setIsVideoPlaying(false);
    previewCanPlayLoggedRef.current = false;
    appendLog(`Loading ${path}`);

    try {
      const info = await invoke<VideoMetadata>("probe_video", { path });
      setMetadata(info);
      setTrimStart(0);
      setTrimEnd(info.duration);
      setPreviewStart(0);
      setPreviewEnd(info.duration);
      appendLog(`Detected ${info.width}x${info.height}, ${info.codec}, ${info.fps.toFixed(3)} fps.`);

      const thumbs = await invoke<Thumbnail[]>("generate_thumbnails", {
        path,
        duration: info.duration,
        count: 12,
        start: 0,
        end: info.duration,
      });
      setThumbnails(thumbs);
      appendLog(
        thumbs.length ? `Generated ${thumbs.length} thumbnails.` : "No thumbnails were generated for this file."
      );
      videoRef.current?.load();
    } catch (error) {
      appendLog(`Load failed: ${String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPreviewRange(start: number, end: number) {
    const path = inputPath.trim();
    if (!metadata || !path) return;

    const nextStart = Math.max(0, Math.min(start, metadata.duration));
    const nextEnd = Math.max(nextStart, Math.min(end, metadata.duration));
    setIsLoading(true);
    setThumbnails([]);
    appendLog(
      nextStart > 0 || nextEnd < metadata.duration
        ? `Fitting preview to ${formatTime(nextStart)} - ${formatTime(nextEnd)}.`
        : "Restoring full preview."
    );

    try {
      const thumbs = await invoke<Thumbnail[]>("generate_thumbnails", {
        path,
        duration: metadata.duration,
        count: 12,
        start: nextStart,
        end: nextEnd,
      });
      setPreviewStart(nextStart);
      setPreviewEnd(nextEnd);
      setThumbnails(thumbs);
      appendLog(
        thumbs.length ? `Generated ${thumbs.length} preview thumbnails.` : "No thumbnails were generated for this range."
      );
      seek(nextStart);
    } catch (error) {
      appendLog(`Preview fit failed: ${String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function chooseInputVideo() {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Video",
          extensions: ["mp4", "mov", "mkv", "webm", "avi", "m4v"],
        },
      ],
    });

    if (typeof selected === "string") {
      await loadVideo(selected);
    }
  }

  async function chooseInputImage() {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Image",
          extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp"],
        },
      ],
    });

    if (typeof selected === "string") {
      setImagePath(selected);
      setImageObjectUrl("");
      setImageName(baseName(selected));
      setDitherStatus(`Loaded ${selected}`);
      setPaletteStatus(`Loaded ${selected}`);
      appendLog(`Image: loaded ${selected}`);
    }
  }

  async function chooseOutputFolder() {
    const selected = await openDialog({
      multiple: false,
      directory: true,
    });

    if (typeof selected === "string") {
      setOutputFolder(selected);
    }
  }

  async function chooseDefaultDownloadFolder() {
    const selected = await openDialog({
      multiple: false,
      directory: true,
    });

    if (typeof selected === "string") {
      const nextSettings = { ...appSettings, defaultDownloadFolder: selected };
      setAppSettings(nextSettings);
      setOutputFolder(selected);
      await saveSettings(nextSettings);
    }
  }

  async function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0] as (File & { path?: string }) | undefined;
    if (!file) return;

    if (file.path) {
      await loadVideo(file.path);
    } else {
      appendLog("Dropped file path was not available. Use Browse Video instead.");
    }
  }

  async function handleImageDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0] as (File & { path?: string }) | undefined;
    if (!file) return;

    if (!file.type.startsWith("image/") && !/\.(png|jpe?g|gif|bmp|webp)$/i.test(file.name)) {
      appendLog("Dropped file is not an image.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setImageObjectUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return objectUrl;
    });
    setImagePath(file.path || "");
    setImageName(baseName(file.path || file.name));
    setDitherStatus(`Loaded ${file.name}`);
    setPaletteStatus(`Loaded ${file.name}`);
    appendLog(`Image: loaded ${file.name}`);
  }

  function updateDitherSettings(patch: Partial<DitherSettings>) {
    setDitherSettings((current) => ({ ...current, ...patch }));
  }

  function updateDitherWidth(width: number) {
    const ratio = aspectRatios.find((item) => item.value === ditherAspectRatio)?.ratio;
    updateDitherSettings({
      outputWidth: width,
      ...(ratio ? { outputHeight: Math.max(8, Math.round(width / ratio)) } : {}),
    });
  }

  function updateDitherHeight(height: number) {
    const ratio = aspectRatios.find((item) => item.value === ditherAspectRatio)?.ratio;
    updateDitherSettings({
      outputHeight: height,
      ...(ratio ? { outputWidth: Math.max(8, Math.round(height * ratio)) } : {}),
    });
  }

  function updateDitherAspectRatio(value: string) {
    setDitherAspectRatio(value);
    const ratio = aspectRatios.find((item) => item.value === value)?.ratio;
    if (ratio) {
      updateDitherSettings({
        outputHeight: Math.max(8, Math.round(ditherSettings.outputWidth / ratio)),
      });
    }
  }

  function downloadDitherPng() {
    const canvas = ditherCanvasRef.current;
    if (!canvas || !isDitherReady) return;
    const outputName = `${imageName || "image"}_dither.png`;
    invoke<JobResult>("save_data_url_to_downloads", {
      outputName,
      dataUrl: canvas.toDataURL("image/png"),
    })
      .then((result) => {
        setDitherStatus(`Saved ${result.outputPath}`);
        appendLog(result.log);
      })
      .catch((error) => {
        setDitherStatus(`PNG save failed: ${String(error)}`);
      });
  }

  function updatePaletteSettings(patch: Partial<PaletteSettings>) {
    setPaletteSettings((current) => ({ ...current, ...patch }));
  }

  async function copyPaletteCss() {
    if (!paletteResult) return;
    try {
      await navigator.clipboard.writeText(paletteResult.css);
      setPaletteStatus("CSS copied.");
      appendLog("Palette: CSS copied.");
    } catch (error) {
      setPaletteStatus(`CSS copy failed: ${String(error)}`);
    }
  }

  function downloadPaletteCss() {
    if (!paletteResult) return;
    invoke<JobResult>("save_text_to_downloads", {
      outputName: `${imageName || "image"}_palette.css`,
      text: paletteResult.css,
    })
      .then((result) => {
        setPaletteStatus(`Saved ${result.outputPath}`);
        appendLog(result.log);
      })
      .catch((error) => {
        setPaletteStatus(`CSS save failed: ${String(error)}`);
      });
  }

  function downloadPaletteSheet() {
    const canvas = paletteCanvasRef.current;
    if (!canvas || !paletteResult) return;
    invoke<JobResult>("save_data_url_to_downloads", {
      outputName: `${imageName || "image"}_palette_sheet.png`,
      dataUrl: canvas.toDataURL("image/png"),
    })
      .then((result) => {
        setPaletteStatus(`Saved ${result.outputPath}`);
        appendLog(result.log);
      })
      .catch((error) => {
        setPaletteStatus(`Palette sheet save failed: ${String(error)}`);
      });
  }

  function seek(seconds: number) {
    const clamped = Math.max(0, Math.min(seconds, duration));
    setCurrentTime(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
  }

  async function seekAndWait(seconds: number) {
    const video = videoRef.current;
    const clamped = Math.max(0, Math.min(seconds, duration));
    setCurrentTime(clamped);
    if (!video) return;

    selectionSeekInProgressRef.current = true;
    await new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        video.removeEventListener("seeked", finish);
        resolve();
      };

      video.addEventListener("seeked", finish, { once: true });
      video.currentTime = clamped;
      window.setTimeout(finish, 350);
    });
    selectionSeekInProgressRef.current = false;
    setCurrentTime(video.currentTime);
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      if (shouldPlaySelection && (video.currentTime < trimStart || video.currentTime >= trimEnd - 0.05)) {
        await seekAndWait(trimStart);
      }
      try {
        await video.play();
      } catch (error) {
        appendLog(`Preview playback failed: ${String(error).trim()}`);
      }
      return;
    }

    video.pause();
  }

  function toggleMute() {
    setIsVideoMuted((value) => {
      const next = !value;
      if (videoRef.current) {
        videoRef.current.muted = next;
      }
      return next;
    });
  }

  function timelineTimeFromClientX(clientX: number) {
    const bounds = thumbnailGridRef.current?.getBoundingClientRect() ?? timelineRef.current?.getBoundingClientRect();
    if (!bounds) return 0;
    const ratio = bounds.width ? (clientX - bounds.left) / bounds.width : 0;
    return Math.max(visibleStart, Math.min(visibleEnd, visibleStart + ratio * visibleDuration));
  }

  function updateTimelineHover(event: React.PointerEvent<HTMLDivElement>) {
    if (!duration) return;
    setTimelineHoverTime(timelineTimeFromClientX(event.clientX));
  }

  function scrubTimeline(event: React.PointerEvent<HTMLDivElement>) {
    if (!duration) return;
    const target = event.target as HTMLElement;
    if (target.closest(".trim-handle")) return;
    seek(timelineTimeFromClientX(event.clientX));
  }

  function startTrimDrag(kind: "start" | "end", event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setTrimDrag(kind);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateTrimDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (!trimDrag || !duration) return;
    const value = timelineTimeFromClientX(event.clientX);
    if (trimDrag === "start") {
      setStart(value);
    } else {
      setEnd(value);
    }
  }

  function stopTrimDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (!trimDrag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setTrimDrag(null);
  }

  function handleVideoTimeUpdate(event: React.SyntheticEvent<HTMLVideoElement>) {
    const nextTime = event.currentTarget.currentTime;
    if (selectionSeekInProgressRef.current) {
      setCurrentTime(nextTime);
      return;
    }
    if (shouldPlaySelection && nextTime >= trimEnd - 0.03) {
      event.currentTarget.pause();
      event.currentTarget.currentTime = trimEnd;
      setCurrentTime(trimEnd);
      setIsVideoPlaying(false);
      return;
    }
    setCurrentTime(nextTime);
  }

  function setStart(value: number) {
    const start = Math.min(value, trimEnd);
    setTrimStart(start);
    if (currentTime < start) seek(start);
    if (previewEnd && start < previewStart) setPreviewStart(start);
  }

  function setEnd(value: number) {
    const end = Math.max(value, trimStart);
    setTrimEnd(end);
    if (currentTime > end) seek(end);
    if (end > previewEnd) setPreviewEnd(end);
  }

  function reportVideoError() {
    const error = videoRef.current?.error;
    const messages: Record<number, string> = {
      1: "loading aborted",
      2: "network or local asset access failed",
      3: "decode failed",
      4: "format or source not supported",
    };
    appendLog(`Preview video failed: ${messages[error?.code ?? 0] ?? "unknown media error"}.`);
  }

  async function runJob() {
    if (!metadata) {
      appendLog("Load a video before running a job.");
      return;
    }

    setIsRunning(true);
    appendLog(`Running ${actions.find((item) => item.id === action)?.label ?? action}...`);
    try {
      const effectiveSocialFps = socialFps === "auto" ? String(metadata.fps || 24) : socialFps;
      const result =
        action === "realesrgan_upscale"
          ? await invoke<JobResult>("run_upscale_job", {
              options: {
                inputPath: inputPath.trim(),
                outputFolder,
                outputName,
                model: selectedModel,
                device: selectedDevice,
                fps: metadata.fps || 24,
                crf,
                encoderPreset,
                tileSize,
                threads,
                trimStart,
                trimEnd,
              },
            })
          : action === "social_export"
            ? await invoke<JobResult>("run_social_export_job", {
                options: {
                  inputPath: inputPath.trim(),
                  outputFolder,
                  outputName,
                  format: socialFormat,
                  trimStart,
                  trimEnd,
                  fps: effectiveSocialFps,
                  width: socialWidth,
                  loopOutput: socialLoop,
                  scaleFilter: socialScaleFilter,
                  crf: socialCrf,
                  quality: socialQuality,
                  preset: socialPreset,
                  includeAudio: socialIncludeAudio,
                },
              })
          : action === "rife_interpolate"
            ? await invoke<JobResult>("run_rife_job", {
                options: {
                  inputPath: inputPath.trim(),
                  outputFolder,
                  outputName,
                  model: selectedRifeModel,
                  device: selectedDevice,
                  multiplier: Number(rifeMultiplier),
                  fps: metadata.fps || 24,
                  crf,
                  encoderPreset,
                  threads,
                  ttaSpatial: rifeTtaSpatial,
                  ttaTemporal: rifeTtaTemporal,
                  uhd: rifeUhd,
                  trimStart,
                  trimEnd,
                },
              })
            : action === "segmind_topaz"
              ? await invoke<JobResult>("run_segmind_topaz_job", {
                  options: {
                    inputPath: inputPath.trim(),
                    outputFolder,
                    outputName,
                    settings: appSettings,
                  },
                })
          : await invoke<JobResult>("run_ffmpeg_job", {
              options: {
                inputPath: inputPath.trim(),
                outputFolder,
                outputName,
                action,
                trimStart,
                trimEnd,
                currentTime,
                audioFormat,
              },
            });
      if (result.log.trim()) {
        appendLog(result.log.trim().split(/\r?\n/).slice(-8).join("\n"));
      }
      appendLog(`Done: ${result.outputPath}`);
    } catch (error) {
      appendLog(`Job failed: ${String(error).trim()}`);
    } finally {
      setIsRunning(false);
    }
  }

  async function cancelUpscale() {
    await invoke("cancel_upscale_job");
    appendLog("Cancel requested.");
  }

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
    setCompareSplit(50);
    setCompareZoom(1);
    setComparePan({ x: 0, y: 0 });
    appendLog(`Testing Real-ESRGAN models at ${formatTime(currentTime)}...`);
    try {
      const result = await invoke<ModelCompareResult>("compare_realesrgan_models", {
        path: inputPath.trim(),
        currentTime,
        device: selectedDevice,
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

  function setCompareSplitFromClient(clientX: number) {
    const bounds = compareViewRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const value = ((clientX - bounds.left) / bounds.width) * 100;
    setCompareSplit(Math.max(0, Math.min(100, value)));
  }

  function startCompareInteraction(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button, select")) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const splitX = bounds.left + (bounds.width * compareSplit) / 100;
    const nearDivider = Math.abs(event.clientX - splitX) <= 28;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (!nearDivider) {
      setCompareDragMode("pan");
      setComparePanStart({
        x: event.clientX,
        y: event.clientY,
        panX: comparePan.x,
        panY: comparePan.y,
      });
      return;
    }

    setCompareDragMode("split");
    setCompareSplitFromClient(event.clientX);
  }

  function updateCompareInteraction(event: React.PointerEvent<HTMLDivElement>) {
    if (!compareDragMode) return;
    if (compareDragMode === "pan") {
      setComparePan({
        x: comparePanStart.panX + event.clientX - comparePanStart.x,
        y: comparePanStart.panY + event.clientY - comparePanStart.y,
      });
      return;
    }
    setCompareSplitFromClient(event.clientX);
  }

  function stopCompareInteraction(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setCompareDragMode(null);
  }

  function scrollCompare(event: React.WheelEvent<HTMLDivElement>) {
    if (compareZoom <= 1) return;
    event.preventDefault();
    setComparePan((value) => ({
      x: value.x - event.deltaX,
      y: value.y - event.deltaY,
    }));
  }

  async function updateRealEsrgan(selectedModels: string[] = []) {
    setIsUpdatingEsrgan(true);
    appendLog("Starting Real-ESRGAN update...");
    try {
      const result = await invoke<JobResult>("update_realesrgan", { selectedModels });
      if (result.log.trim()) {
        appendLog(result.log.trim().split(/\r?\n/).slice(-8).join("\n"));
      }
      appendLog(`Real-ESRGAN ready: ${result.outputPath}`);
      await refreshToolState();
    } catch (error) {
      appendLog(`Real-ESRGAN update failed: ${String(error).trim()}`);
    } finally {
      setIsUpdatingEsrgan(false);
    }
  }

  async function updateRife(selectedModels: string[] = []) {
    setIsUpdatingRife(true);
    appendLog("Starting RIFE update...");
    try {
      const result = await invoke<JobResult>("update_rife", { selectedModels });
      if (result.log.trim()) {
        appendLog(result.log.trim().split(/\r?\n/).slice(-8).join("\n"));
      }
      appendLog(`RIFE ready: ${result.outputPath}`);
      await refreshToolState();
    } catch (error) {
      appendLog(`RIFE update failed: ${String(error).trim()}`);
    } finally {
      setIsUpdatingRife(false);
    }
  }

  async function updateFfmpeg() {
    setIsUpdatingFfmpeg(true);
    appendLog("Starting FFmpeg update...");
    try {
      const result = await invoke<JobResult>("update_ffmpeg");
      if (result.log.trim()) {
        appendLog(result.log.trim().split(/\r?\n/).slice(-8).join("\n"));
      }
      appendLog(`FFmpeg ready: ${result.outputPath}`);
      await refreshToolState();
    } catch (error) {
      appendLog(`FFmpeg update failed: ${String(error).trim()}`);
    } finally {
      setIsUpdatingFfmpeg(false);
    }
  }

  function openModelInstall(tool: "realesrgan" | "rife") {
    setModelInstallTool(tool);
    const installed = tool === "realesrgan" ? models.map((item) => item.name) : rifeModels.map((item) => item.name);
    const fallback = tool === "realesrgan"
      ? ["realesr-animevideov3-x2"]
      : ["rife-v4.6"];
    setSelectedInstallModels(installed.length ? installed : fallback);
    setIsModelInstallOpen(true);
  }

  function toggleInstallModel(name: string) {
    setSelectedInstallModels((items) =>
      items.includes(name) ? items.filter((item) => item !== name) : [...items, name]
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

  async function deleteModel(tool: "realesrgan" | "rife", model: string) {
    appendLog(`Removing ${model}...`);
    try {
      const result = await invoke<JobResult>("delete_tool_model", { tool, model });
      appendLog(result.log);
      await refreshToolState();
    } catch (error) {
      appendLog(`Model remove failed: ${String(error).trim()}`);
    }
  }

  async function deleteAllModels(tool: "realesrgan" | "rife") {
    const items = tool === "realesrgan" ? models : rifeModels;
    for (const model of items) {
      await deleteModel(tool, model.name);
    }
  }

  function toggleExpandedTool(tool: string) {
    setExpandedTool((current) => current === tool ? "" : tool);
  }

  async function updateCloudflared() {
    setIsUpdatingCloudflared(true);
    appendLog("Starting cloudflared update...");
    try {
      const result = await invoke<JobResult>("update_cloudflared");
      if (result.log.trim()) {
        appendLog(result.log.trim().split(/\r?\n/).slice(-8).join("\n"));
      }
      const nextSettings = {
        ...appSettings,
        pingvin: { ...appSettings.pingvin, cloudflaredPath: result.outputPath },
      };
      setAppSettings(nextSettings);
      await saveSettings(nextSettings);
      appendLog(`cloudflared ready: ${result.outputPath}`);
      await refreshToolState();
    } catch (error) {
      appendLog(`cloudflared update failed: ${String(error).trim()}`);
    } finally {
      setIsUpdatingCloudflared(false);
    }
  }

  async function chooseCloudflaredPath() {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: "cloudflared", extensions: ["exe"] }],
    });

    if (typeof selected === "string") {
      updatePingvinSettings({ cloudflaredPath: selected });
    }
  }

  async function installPingvin() {
    setIsInstallingPingvin(true);
    appendLog("Installing Pingvin Share X with Docker...");
    try {
      const result = await invoke<JobResult>("install_pingvin");
      if (result.log.trim()) {
        appendLog(result.log.trim().split(/\r?\n/).slice(-8).join("\n"));
      }
      appendLog(`Pingvin files ready: ${result.outputPath}`);
      await refreshToolState();
    } catch (error) {
      appendLog(`Pingvin install failed: ${String(error).trim()}`);
    } finally {
      setIsInstallingPingvin(false);
    }
  }

  async function startPingvin() {
    setIsStartingPingvin(true);
    appendLog("Starting Pingvin...");
    try {
      const result = await invoke<JobResult>("start_pingvin");
      if (result.log.trim()) {
        appendLog(result.log.trim().split(/\r?\n/).slice(-8).join("\n"));
      }
      appendLog(`Pingvin should be available at ${result.outputPath}`);
    } catch (error) {
      appendLog(`Pingvin start failed: ${String(error).trim()}`);
    } finally {
      setIsStartingPingvin(false);
    }
  }

  async function stopPingvin() {
    setIsStoppingPingvin(true);
    appendLog("Stopping Pingvin...");
    try {
      const result = await invoke<JobResult>("stop_pingvin");
      if (result.log.trim()) {
        appendLog(result.log.trim().split(/\r?\n/).slice(-8).join("\n"));
      }
      appendLog("Pingvin stopped.");
    } catch (error) {
      appendLog(`Pingvin stop failed: ${String(error).trim()}`);
    } finally {
      setIsStoppingPingvin(false);
    }
  }

  async function checkPingvinStatus() {
    appendLog("Checking Pingvin status...");
    try {
      const result = await invoke<JobResult>("pingvin_status");
      appendLog(result.log.trim() || "Pingvin status returned no output.");
    } catch (error) {
      appendLog(`Pingvin status failed: ${String(error).trim()}`);
    }
  }

  async function startTunnel() {
    setIsStartingTunnel(true);
    appendLog("Starting Cloudflare tunnel...");
    try {
      const result = await invoke<TunnelResult>("start_cloudflare_tunnel", {
        localUrl: appSettings.pingvin.localUrl || "http://localhost:3000",
        cloudflaredPath: appSettings.pingvin.cloudflaredPath,
      });
      const nextSettings = {
        ...appSettings,
        pingvin: { ...appSettings.pingvin, publicUrl: result.publicUrl },
      };
      setIsTunnelRunning(true);
      setAppSettings(nextSettings);
      await saveSettings(nextSettings);
      if (result.log.trim()) {
        appendLog(result.log.trim().split(/\r?\n/).slice(-8).join("\n"));
      }
      appendLog(`Cloudflare tunnel ready: ${result.publicUrl}`);
    } catch (error) {
      setIsTunnelRunning(false);
      appendLog(`Cloudflare tunnel failed: ${String(error).trim()}`);
    } finally {
      setIsStartingTunnel(false);
    }
  }

  async function stopTunnel() {
    try {
      await invoke("stop_cloudflare_tunnel");
      setIsTunnelRunning(false);
      appendLog("Cloudflare tunnel stopped.");
    } catch (error) {
      appendLog(`Cloudflare tunnel stop failed: ${String(error).trim()}`);
    }
  }

  async function saveSettings(nextSettings = appSettings) {
    try {
      const saved = await invoke<AppSettings>("save_app_settings", { settings: nextSettings });
      const normalized = normalizeSettings(saved);
      setAppSettings(normalized);
      if (normalized.defaultDownloadFolder) {
        setOutputFolder(normalized.defaultDownloadFolder);
      }
      appendLog("Settings saved.");
    } catch (error) {
      appendLog(`Settings save failed: ${String(error).trim()}`);
    }
  }

  function updateAppSettings(patch: Partial<AppSettings>) {
    setAppSettings((current) => ({ ...current, ...patch }));
  }

  function updatePingvinSettings(patch: Partial<PingvinSettings>) {
    setAppSettings((current) => ({ ...current, pingvin: { ...current.pingvin, ...patch } }));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img src={logoGreen} alt="Simulation Studios" />
        </div>
        <nav className="tool-switcher" aria-label="Tool type">
          <button className={toolCategory === "video" ? "active" : ""} type="button" onClick={() => setToolCategory("video")}>
            <span className="material-symbols-rounded" aria-hidden="true">movie</span>
            Video
          </button>
          <button className={toolCategory === "image" ? "active" : ""} type="button" onClick={() => setToolCategory("image")}>
            <span className="material-symbols-rounded" aria-hidden="true">image</span>
            Image
          </button>
          <button className={toolCategory === "audio" ? "active" : ""} type="button" onClick={() => setToolCategory("audio")}>
            <span className="material-symbols-rounded" aria-hidden="true">music_note</span>
            Audio
          </button>
        </nav>
        <div className="status-row">
          <span className={allServicesAvailable ? "pill ok" : "pill bad"}>
            {allServicesAvailable ? "All services available" : "Setup needed"}
          </span>
          <button className="icon-button" title="App settings" onClick={() => setIsSettingsOpen(true)}>
            <span className="material-symbols-rounded" aria-hidden="true">
              settings
            </span>
          </button>
        </div>
      </header>

      {toolCategory === "video" && <section className="workspace">
        <aside className="sidebar">
          <section className="drop-zone" onDrop={handleDrop} onDragOver={(event) => event.preventDefault()}>
            <span className="material-symbols-rounded" aria-hidden="true">
              upload_file
            </span>
            <strong>{inputPath ? baseName(inputPath) : "Choose a video"}</strong>
            <p>{inputPath || "Drop a video here or browse from Explorer."}</p>
            <button className="primary" disabled={isLoading} onClick={chooseInputVideo}>
              <span className="material-symbols-rounded" aria-hidden="true">
                folder_open
              </span>
              Browse Video
            </button>
          </section>

          <div className="panel">
            <h2>Action</h2>
            <select value={action} onChange={(event) => setAction(event.currentTarget.value)}>
              {actions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            {action === "video_audio" && (
              <select value={audioFormat} onChange={(event) => setAudioFormat(event.currentTarget.value)}>
                <option value="mp3">MP3</option>
                <option value="wav">WAV</option>
              </select>
            )}
            {action === "social_export" && (
              <div className="settings-grid">
                <label>
                  Format
                  <select value={socialFormat} onChange={(event) => setSocialFormat(event.currentTarget.value)}>
                    <option value="h264_mp4">H.264 MP4</option>
                    <option value="gif">GIF</option>
                    <option value="webp">Animated WebP</option>
                    <option value="apng">Animated PNG</option>
                  </select>
                </label>
                <label>
                  <FieldLabel help="Frames per second for the exported social file. Auto uses the source video FPS.">FPS</FieldLabel>
                  <FpsSelect value={socialFps === "auto" ? "auto" : socialFps} onChange={setSocialFps} />
                </label>
                <label>
                  <FieldLabel help="Output width in pixels. Height is calculated from the source aspect ratio.">Width</FieldLabel>
                  <input value={socialWidth} onChange={(event) => setSocialWidth(event.currentTarget.value)} />
                </label>
                <label>
                  <FieldLabel help="FFmpeg scaling algorithm. Lanczos is sharp, bicubic is softer, bilinear is fastest.">Scale Filter</FieldLabel>
                  <select value={socialScaleFilter} onChange={(event) => setSocialScaleFilter(event.currentTarget.value)}>
                    <option value="lanczos">lanczos</option>
                    <option value="bicubic">bicubic</option>
                    <option value="bilinear">bilinear</option>
                  </select>
                </label>
                {socialFormat === "h264_mp4" ? (
                  <>
                    <label>
                      <FieldLabel help="Constant Rate Factor for H.264. Lower values are larger and cleaner; 18 is high quality.">CRF</FieldLabel>
                      <select value={socialCrf} onChange={(event) => setSocialCrf(event.currentTarget.value)}>
                        {crfOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                    <label>
                      Preset
                      <select value={socialPreset} onChange={(event) => setSocialPreset(event.currentTarget.value)}>
                        <option value="veryslow">veryslow</option>
                        <option value="slow">slow</option>
                        <option value="medium">medium</option>
                        <option value="fast">fast</option>
                      </select>
                    </label>
                    <label className="check-row">
                      <input type="checkbox" checked={socialIncludeAudio} onChange={(event) => setSocialIncludeAudio(event.currentTarget.checked)} />
                      Include audio
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      <FieldLabel help="Animation quality. Higher is cleaner and usually larger; lower is smaller.">Quality <span>{socialQuality}</span></FieldLabel>
                      <input type="range" min="1" max="100" step="1" value={socialQuality} onChange={(event) => setSocialQuality(event.currentTarget.value)} />
                    </label>
                    <label className="check-row">
                      <input type="checkbox" checked={socialLoop} onChange={(event) => setSocialLoop(event.currentTarget.checked)} />
                      Loop animation
                    </label>
                    {socialFormat === "apng" && <p>Animated PNG can get large quickly.</p>}
                  </>
                )}
              </div>
            )}
            {action === "segmind_topaz" && (
              <div className="settings-grid">
                <label>
                  Input Mode
                  <select value={appSettings.segmindInputMode} onChange={(event) => updateAppSettings({ segmindInputMode: event.currentTarget.value })}>
                    <option value="local_bridge">Local Bridge + Cloudflare Tunnel</option>
                    <option value="video_url">Video URL</option>
                  </select>
                </label>
                {appSettings.segmindInputMode === "video_url" && (
                  <label>
                    Video URL
                    <input value={appSettings.segmindVideoUrl} onChange={(event) => updateAppSettings({ segmindVideoUrl: event.currentTarget.value })} />
                  </label>
                )}
                <label>
                  Target FPS
                  <select value={appSettings.segmindTargetFps} onChange={(event) => updateAppSettings({ segmindTargetFps: event.currentTarget.value })}>
                    {["15", "24", "30", "48", "60", "90", "120"].map((fps) => (
                      <option key={fps} value={fps}>
                        {fps} fps
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Target Resolution
                  <select value={appSettings.segmindTargetResolution} onChange={(event) => updateAppSettings({ segmindTargetResolution: event.currentTarget.value })}>
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                    <option value="4k">4k</option>
                  </select>
                </label>
                <p>Local Bridge serves the selected video temporarily and exposes it through Cloudflare. Configure Segmind in Must haves and cloudflared in Cloud settings.</p>
              </div>
            )}
            {action === "realesrgan_upscale" && (
              <div className="settings-grid">
                <label>
                  Model
                  <select value={selectedModel} onChange={(event) => setSelectedModel(event.currentTarget.value)}>
                    {models.length ? (
                      models.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name} ({item.scale}x)
                        </option>
                      ))
                    ) : (
                      <option value="">No models found</option>
                    )}
                  </select>
                </label>
                <label>
                  Device
                  <select value={selectedDevice} onChange={(event) => setSelectedDevice(event.currentTarget.value)}>
                    <option value="">Auto GPU</option>
                    {devices.map((item) => (
                      <option key={item.id} value={item.id}>
                        GPU {item.id} - {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="setting-label">
                    CRF
                    <HelpIcon text="Constant Rate Factor for final H.264 encoding. Lower is larger and cleaner; 18 is high quality, 23 is common, 28 is smaller." />
                  </span>
                  <select value={crf} onChange={(event) => setCrf(event.currentTarget.value)}>
                    {crfOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  Encoder Preset
                  <select value={encoderPreset} onChange={(event) => setEncoderPreset(event.currentTarget.value)}>
                    <option value="slow">slow</option>
                    <option value="medium">medium</option>
                    <option value="fast">fast</option>
                  </select>
                </label>
                <label>
                  <span className="setting-label">
                    Tile Size
                    <HelpIcon text="Real-ESRGAN tile size. Auto lets the tool decide. Smaller tiles use less VRAM but can be slower; larger tiles are faster if memory allows." />
                  </span>
                  <select value={tileSize} onChange={(event) => setTileSize(event.currentTarget.value)}>
                    {tileSizeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label>
                  <span className="setting-label">
                    Threads
                    <HelpIcon text="Pipeline threads as load:process:save. 1:2:2 is balanced; 1:1:1 is safest; 2:4:2 is for stronger machines." />
                  </span>
                  <select value={threads} onChange={(event) => setThreads(event.currentTarget.value)}>
                    {threadOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <p>Scale: {activeModel ? `${activeModel.scale}x from model` : "No model selected"}</p>
                <p>Rough ETA: {roughUpscaleEta}</p>
              </div>
            )}
            {action === "rife_interpolate" && (
              <div className="settings-grid">
                <label>
                  Model
                  <select value={selectedRifeModel} onChange={(event) => setSelectedRifeModel(event.currentTarget.value)}>
                    {rifeModels.length ? (
                      rifeModels.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name}
                        </option>
                      ))
                    ) : (
                      <option value="">No models found</option>
                    )}
                  </select>
                </label>
                <label>
                  Multiplier
                  <select value={rifeMultiplier} onChange={(event) => setRifeMultiplier(event.currentTarget.value)}>
                    <option value="2">2x FPS</option>
                    <option value="4">4x FPS</option>
                    <option value="8">8x FPS</option>
                  </select>
                </label>
                <label>
                  Device
                  <select value={selectedDevice} onChange={(event) => setSelectedDevice(event.currentTarget.value)}>
                    <option value="">Auto GPU</option>
                    <option value="-1">CPU</option>
                    {devices.map((item) => (
                      <option key={item.id} value={item.id}>
                        GPU {item.id} - {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="setting-label">
                    CRF
                    <HelpIcon text="Constant Rate Factor for the reassembled interpolated video. Lower is larger and cleaner; 18 is high quality." />
                  </span>
                  <select value={crf} onChange={(event) => setCrf(event.currentTarget.value)}>
                    {crfOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  Encoder Preset
                  <select value={encoderPreset} onChange={(event) => setEncoderPreset(event.currentTarget.value)}>
                    <option value="slow">slow</option>
                    <option value="medium">medium</option>
                    <option value="fast">fast</option>
                  </select>
                </label>
                <label>
                  <span className="setting-label">
                    Threads
                    <HelpIcon text="Pipeline threads as load:process:save. 1:2:2 is balanced; 1:1:1 is safest; 2:4:2 is more aggressive." />
                  </span>
                  <select value={threads} onChange={(event) => setThreads(event.currentTarget.value)}>
                    {threadOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={rifeTtaSpatial} onChange={(event) => setRifeTtaSpatial(event.currentTarget.checked)} />
                  <FieldLabel help="Spatial test-time augmentation. RIFE runs extra spatial passes and blends them for possible quality gains at slower speed.">Spatial TTA</FieldLabel>
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={rifeTtaTemporal} onChange={(event) => setRifeTtaTemporal(event.currentTarget.checked)} />
                  <FieldLabel help="Temporal test-time augmentation. Uses reversed/alternate temporal passes to reduce interpolation artifacts, usually slower.">Temporal TTA</FieldLabel>
                </label>
                <label className="check-row">
                  <input type="checkbox" checked={rifeUhd} onChange={(event) => setRifeUhd(event.currentTarget.checked)} />
                  <FieldLabel help="UHD mode for large frames. It can reduce memory pressure on high-resolution inputs, but may change speed and detail behavior.">UHD mode</FieldLabel>
                </label>
                <p>Output FPS: {metadata ? `${(metadata.fps * Number(rifeMultiplier)).toFixed(3)} fps` : "Load video first"}</p>
                <p>Rough ETA: {roughRifeEta}</p>
              </div>
            )}
          </div>

          <div className="panel">
            <h2>Output</h2>
            <button className="path-button" onClick={chooseOutputFolder}>
              <span className="material-symbols-rounded" aria-hidden="true">
                drive_folder_upload
              </span>
              <span>{outputFolder || "Choose output folder"}</span>
            </button>
            <label>
              Name
              <input value={outputName} onChange={(event) => setOutputName(event.currentTarget.value)} />
            </label>
            <button className="primary" disabled={isRunning || !metadata} onClick={runJob}>
              {isRunning ? "Running..." : "Run Action"}
            </button>
            {action === "realesrgan_upscale" && (
              <button disabled={!isRunning} onClick={cancelUpscale}>
                Cancel Upscale
              </button>
            )}
            {action === "rife_interpolate" && (
              <button disabled={!isRunning} onClick={cancelUpscale}>
                Cancel Interpolation
              </button>
            )}
          </div>

          <div className="panel">
            <h2>Selection</h2>
            <p>{formatTime(trimStart)} - {formatTime(trimEnd)}</p>
            <p>{selectedFrames ? `${selectedFrames.toLocaleString()} frames` : "No frames yet"}</p>
          </div>

          <div className="panel">
            <h2>Metadata</h2>
            {metadata ? (
              <>
                <p>{metadata.width}x{metadata.height}</p>
                <p>{metadata.fps.toFixed(3)} fps</p>
                <p>{metadata.codec}</p>
                <label className="check-row">
                  <input type="checkbox" checked={playSelectionOnly} onChange={(event) => setPlaySelectionOnly(event.currentTarget.checked)} />
                  <FieldLabel help="When enabled, playback starts at the trim start and stops at the trim end unless the full video is selected.">Play selection only</FieldLabel>
                </label>
              </>
            ) : (
              <p>No video loaded</p>
            )}
          </div>
        </aside>

        <section className="preview video-preview">
          <div className="video-shell">
            <video
              ref={videoRef}
              src={videoSrc || undefined}
              muted={isVideoMuted}
              onCanPlay={() => {
                if (previewCanPlayLoggedRef.current) return;
                previewCanPlayLoggedRef.current = true;
                appendLog("Preview video can play.");
              }}
              onError={reportVideoError}
              onTimeUpdate={handleVideoTimeUpdate}
              onPlay={() => setIsVideoPlaying(true)}
              onPause={() => setIsVideoPlaying(false)}
              onEnded={() => setIsVideoPlaying(false)}
            />
            <div className="video-controls-overlay">
              <div className="video-control-left">
                <button disabled={!metadata} onClick={togglePlayback} title={isVideoPlaying ? "Pause" : "Play"}>
                  <span className="material-symbols-rounded" aria-hidden="true">
                    {isVideoPlaying ? "pause" : "play_arrow"}
                  </span>
                </button>
                <span className="video-timecode">{formatTime(currentTime)} / {formatTime(duration)}</span>
              </div>
              <button disabled={!metadata} onClick={toggleMute} title={isVideoMuted ? "Unmute" : "Mute"}>
                <span className="material-symbols-rounded" aria-hidden="true">
                  {isVideoMuted ? "volume_off" : "volume_up"}
                </span>
              </button>
            </div>
          </div>

          <div className="timeline">
            <div className="timeline-ruler" onPointerMove={updateTimelineHover} onPointerLeave={() => setTimelineHoverTime(null)} onPointerDown={scrubTimeline}>
              <span>{formatTime(visibleStart)}</span>
              <span>{formatTime(visibleStart + visibleDuration / 4)}</span>
              <span>{formatTime(visibleStart + visibleDuration / 2)}</span>
              <span>{formatTime(visibleStart + (visibleDuration / 4) * 3)}</span>
              <span>{formatTime(visibleEnd)}</span>
              {hoverPercent !== null && (
                <div className="timeline-hover" style={{ left: `${hoverPercent}%` }}>
                  {formatTime(timelineHoverTime ?? 0)}
                </div>
              )}
            </div>
            <div ref={timelineRef} className="thumbnail-strip" onPointerMove={updateTimelineHover} onPointerLeave={() => setTimelineHoverTime(null)} onPointerDown={scrubTimeline}>
              {duration > 0 && (
                <>
                  <div className="selection-fill" style={{ left: `${trimStartPercent}%`, width: `${Math.max(0, trimEndPercent - trimStartPercent)}%` }} />
                  <div className="playhead" style={{ left: `${currentPercent}%` }} />
                  {hoverPercent !== null && <div className="hover-line" style={{ left: `${hoverPercent}%` }} />}
                  <button
                    className="trim-handle trim-handle-start"
                    style={{ left: `${trimStartPercent}%` }}
                    onPointerDown={(event) => startTrimDrag("start", event)}
                    onPointerMove={updateTrimDrag}
                    onPointerUp={stopTrimDrag}
                    onPointerCancel={stopTrimDrag}
                    aria-label="Drag trim start"
                  />
                  <button
                    className="trim-handle trim-handle-end"
                    style={{ left: `${trimEndPercent}%` }}
                    onPointerDown={(event) => startTrimDrag("end", event)}
                    onPointerMove={updateTrimDrag}
                    onPointerUp={stopTrimDrag}
                    onPointerCancel={stopTrimDrag}
                    aria-label="Drag trim end"
                  />
                </>
              )}
              <div ref={thumbnailGridRef} className="thumbnail-grid">
                {thumbnails.length ? (
                  thumbnails.map((thumbnail, index) => (
                    <div className="thumbnail-cell" key={`${thumbnail.time}-${index}`}>
                      <img src={imageSource(thumbnail)} alt={`Thumbnail ${index + 1}`} />
                    </div>
                  ))
                ) : (
                  <span>No thumbnails generated yet</span>
                )}
              </div>
            </div>
            <div className="selection-summary">
              <span>Selection: {formatTime(trimStart)} - {formatTime(trimEnd)} ({formatTime(selectedDuration)})</span>
              <span>{selectedFrames ? `${selectedFrames.toLocaleString()} frames` : "No frames yet"}</span>
            </div>
            <div className="timeline-actions">
              <button
                className="preview-load"
                disabled={isLoading || !inputPath.trim()}
                onClick={() => (metadata && canFitSelection ? loadPreviewRange(trimStart, trimEnd) : loadVideo())}
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  {metadata && canFitSelection ? "fit_screen" : "movie"}
                </span>
                {isLoading ? "Loading preview..." : metadata && canFitSelection ? "Fit To Selection" : "Load Preview"}
              </button>
              {isPreviewFitted && (
                <button className="preview-load" disabled={isLoading} onClick={() => loadPreviewRange(0, duration)}>
                  <span className="material-symbols-rounded" aria-hidden="true">
                    fullscreen
                  </span>
                  Full Preview
                </button>
              )}
              {action === "realesrgan_upscale" && (
                <>
                  <button disabled={!metadata} onClick={compareModels}>
                    <span className="material-symbols-rounded" aria-hidden="true">
                      compare
                    </span>
                    {isComparingModels ? "Show Running Compare" : "Generate Comparison"}
                  </button>
                  <button disabled={!hasCurrentVideoComparison} onClick={viewLastComparison}>
                    <span className="material-symbols-rounded" aria-hidden="true">
                      visibility
                    </span>
                    View Last Comparison
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        <aside className="log-panel">
          <h2>Log</h2>
          <pre>{log.join("\n")}</pre>
        </aside>
      </section>}

      {toolCategory === "image" && (
        <section className="workspace">
          <aside className="sidebar">
            <section className="drop-zone" onDrop={handleImageDrop} onDragOver={(event) => event.preventDefault()}>
              {imageSrc ? (
                <img className="drop-preview" src={imageSrc} alt="" />
              ) : (
                <span className="material-symbols-rounded" aria-hidden="true">image</span>
              )}
              <strong>{imageName || "Choose an image"}</strong>
              <p>{imagePath || (imageObjectUrl ? "Dropped image ready." : "Drop an image here or browse from Explorer.")}</p>
              <button className="primary" onClick={chooseInputImage}>
                <span className="material-symbols-rounded" aria-hidden="true">folder_open</span>
                Browse Image
              </button>
            </section>

            <div className="panel">
              <h2>Action</h2>
              <select value={imageAction} onChange={(event) => setImageAction(event.currentTarget.value)}>
                <option value="dither">Dither</option>
                <option value="palette">Palette Extractor</option>
              </select>
            </div>

            {imageAction === "dither" && (
              <>
            <div className="panel">
              <h2>Image</h2>
              <div className="settings-grid">
                <label><FieldLabel help="How the source image is fitted into the output canvas before dithering.">Fit mode</FieldLabel><select value={ditherSettings.fitMode} onChange={(event) => updateDitherSettings({ fitMode: event.currentTarget.value as DitherSettings["fitMode"] })}>
                  <option value="contain">Contain</option>
                  <option value="cover">Cover</option>
                  <option value="original">Original</option>
                </select></label>
                <label>
                  <FieldLabel help="Locks width and height to a common output shape. Free lets width and height move independently.">Aspect ratio</FieldLabel>
                  <div className="ratio-options" role="radiogroup" aria-label="Aspect ratio">
                    {aspectRatios.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        className={ditherAspectRatio === item.value ? "active" : ""}
                        onClick={() => updateDitherAspectRatio(item.value)}
                        title={item.label}
                        aria-pressed={ditherAspectRatio === item.value}
                      >
                        <span className="material-symbols-rounded" aria-hidden="true">{item.icon}</span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </label>
                <label><FieldLabel help="Output PNG width in pixels. If an aspect ratio is selected, height updates automatically.">Output width</FieldLabel><input type="number" min="8" max="4096" value={ditherSettings.outputWidth} onChange={(event) => updateDitherWidth(Number(event.currentTarget.value))} /></label>
                {ditherAspectRatio === "free" ? (
                  <label><FieldLabel help="Output PNG height in pixels. If an aspect ratio is selected, width updates automatically.">Output height</FieldLabel><input type="number" min="8" max="4096" value={ditherSettings.outputHeight} onChange={(event) => updateDitherHeight(Number(event.currentTarget.value))} /></label>
                ) : (
                  <p className="settings-note">Height auto: {ditherSettings.outputHeight}px</p>
                )}
                <label><FieldLabel help="Size of each rendered pixel block. Larger values create a chunkier pixel-art look.">Pixel size <span>{ditherSettings.pixelScale}x</span></FieldLabel><input type="range" min="1" max="32" step="1" value={ditherSettings.pixelScale} onChange={(event) => updateDitherSettings({ pixelScale: Number(event.currentTarget.value) })} /></label>
              </div>
            </div>

            <div className="dither-mode-switch" role="radiogroup" aria-label="Dither color mode">
              <button
                type="button"
                className={!ditherSettings.usePalette ? "active" : ""}
                onClick={() => updateDitherSettings({ usePalette: false })}
                aria-pressed={!ditherSettings.usePalette}
              >
                <span className="material-symbols-rounded" aria-hidden="true">palette</span>
                Source Colors
              </button>
              <button
                type="button"
                className={ditherSettings.usePalette ? "active" : ""}
                onClick={() => updateDitherSettings({ usePalette: true })}
                aria-pressed={ditherSettings.usePalette}
              >
                <span className="material-symbols-rounded" aria-hidden="true">format_color_fill</span>
                Palette
              </button>
            </div>

            {ditherSettings.usePalette && (
              <div className="panel palette-panel">
                <h2>Palette</h2>
                <div className="settings-grid">
                  <label><FieldLabel help="Darkest color used by the dither palette.">Shadow</FieldLabel><div className="color-row"><input type="color" value={ditherSettings.shadowColor} onChange={(event) => updateDitherSettings({ shadowColor: event.currentTarget.value })} /><input value={ditherSettings.shadowColor} onChange={(event) => updateDitherSettings({ shadowColor: event.currentTarget.value })} /></div></label>
                  <label><FieldLabel help="Middle color used by the dither palette.">Mid</FieldLabel><div className="color-row"><input type="color" value={ditherSettings.midColor} onChange={(event) => updateDitherSettings({ midColor: event.currentTarget.value })} /><input value={ditherSettings.midColor} onChange={(event) => updateDitherSettings({ midColor: event.currentTarget.value })} /></div></label>
                  <label><FieldLabel help="Lightest color used by the dither palette.">Highlight</FieldLabel><div className="color-row"><input type="color" value={ditherSettings.highlightColor} onChange={(event) => updateDitherSettings({ highlightColor: event.currentTarget.value })} /><input value={ditherSettings.highlightColor} onChange={(event) => updateDitherSettings({ highlightColor: event.currentTarget.value })} /></div></label>
                  <label className="check-row"><input type="checkbox" checked={ditherSettings.invertPalette} onChange={(event) => updateDitherSettings({ invertPalette: event.currentTarget.checked })} /><FieldLabel help="Swaps the luminance mapping so shadows use highlight colors and highlights use shadow colors.">Invert palette</FieldLabel></label>
                </div>
              </div>
            )}

            <div className="panel">
              <h2>Look</h2>
              <div className="settings-grid">
                <label>
                  <FieldLabel help={ditherAlgorithmHelp(ditherSettings.algorithm)}>Algorithm</FieldLabel>
                  <select value={ditherSettings.algorithm} onChange={(event) => updateDitherSettings({ algorithm: event.currentTarget.value as DitherAlgorithm })}>
                    {ditherAlgorithms.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                {(ditherSettings.algorithm === "bayer" || ditherSettings.algorithm === "halftone") && (
                  <label><FieldLabel help={ditherSettings.algorithm === "halftone" ? "Controls the dot screen cell size. Larger values make bigger, more visible halftone dots." : "Ordered dithering matrix size. 4x4 is balanced; larger sizes make the pattern finer."}>{ditherSettings.algorithm === "halftone" ? "Dot size" : "Bayer size"}</FieldLabel><select value={ditherSettings.bayerSize} onChange={(event) => updateDitherSettings({ bayerSize: Number(event.currentTarget.value) })}>
                    <option value="2">2x2</option>
                    <option value="4">4x4</option>
                    <option value="8">8x8</option>
                    <option value="16">16x16</option>
                  </select></label>
                )}
                <label><FieldLabel help="How strongly the chosen dithering algorithm affects luminance before palette or source-color mapping.">Dither strength <span>{ditherSettings.ditherStrength.toFixed(2)}</span></FieldLabel><input type="range" min="0" max="1" step="0.01" value={ditherSettings.ditherStrength} onChange={(event) => updateDitherSettings({ ditherStrength: Number(event.currentTarget.value) })} /></label>
                <label><FieldLabel help="Number of luminance steps before palette mapping. Lower creates flatter posterized bands.">Posterize levels <span>{ditherSettings.posterizeLevels}</span></FieldLabel><input type="range" min="2" max="16" step="1" value={ditherSettings.posterizeLevels} onChange={(event) => updateDitherSettings({ posterizeLevels: Number(event.currentTarget.value) })} /></label>
                <label><FieldLabel help="Input luminance value that maps to the darkest palette color.">Black point <span>{ditherSettings.blackPoint.toFixed(2)}</span></FieldLabel><input type="range" min="0" max="0.95" step="0.01" value={ditherSettings.blackPoint} onChange={(event) => updateDitherSettings({ blackPoint: Number(event.currentTarget.value) })} /></label>
                <label><FieldLabel help="Input luminance value that maps to the lightest palette color.">White point <span>{ditherSettings.whitePoint.toFixed(2)}</span></FieldLabel><input type="range" min="0.05" max="1" step="0.01" value={ditherSettings.whitePoint} onChange={(event) => updateDitherSettings({ whitePoint: Number(event.currentTarget.value) })} /></label>
                <label><FieldLabel help="Midtone curve. Lower brightens midtones; higher darkens midtones.">Gamma <span>{ditherSettings.gamma.toFixed(2)}</span></FieldLabel><input type="range" min="0.2" max="3" step="0.01" value={ditherSettings.gamma} onChange={(event) => updateDitherSettings({ gamma: Number(event.currentTarget.value) })} /></label>
                <label><FieldLabel help="Pushes values away from or toward middle gray before dithering.">Contrast <span>{ditherSettings.contrast.toFixed(2)}</span></FieldLabel><input type="range" min="-1" max="1" step="0.01" value={ditherSettings.contrast} onChange={(event) => updateDitherSettings({ contrast: Number(event.currentTarget.value) })} /></label>
                <label><FieldLabel help="Adds or subtracts brightness before palette mapping.">Brightness <span>{ditherSettings.brightness.toFixed(2)}</span></FieldLabel><input type="range" min="-1" max="1" step="0.01" value={ditherSettings.brightness} onChange={(event) => updateDitherSettings({ brightness: Number(event.currentTarget.value) })} /></label>
              </div>
            </div>
              </>
            )}

            {imageAction === "palette" && (
              <>
                <div className="panel">
                  <h2>Palette</h2>
                  <div className="settings-grid">
                    <label>
                      <FieldLabel help="Maximum number of dominant colors to extract from the image.">Primary colors</FieldLabel>
                      <select value={paletteSettings.primaryCount} onChange={(event) => updatePaletteSettings({ primaryCount: Number(event.currentTarget.value) })}>
                        {[1, 2, 3, 4, 5].map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <FieldLabel help="Maximum number of accent colors with extra hue separation from the primary palette.">Secondary colors</FieldLabel>
                      <select value={paletteSettings.secondaryCount} onChange={(event) => updatePaletteSettings({ secondaryCount: Number(event.currentTarget.value) })}>
                        {[1, 2, 3, 4, 5].map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <FieldLabel help="Maximum number of supporting colors selected after primary and secondary colors.">Tertiary colors</FieldLabel>
                      <select value={paletteSettings.tertiaryCount} onChange={(event) => updatePaletteSettings({ tertiaryCount: Number(event.currentTarget.value) })}>
                        {[1, 2, 3, 4, 5].map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <FieldLabel help="Color syntax used when copying or downloading CSS variables.">CSS format</FieldLabel>
                      <select value={paletteSettings.colorFormat} onChange={(event) => updatePaletteSettings({ colorFormat: event.currentTarget.value as ColorFormat })}>
                        <option value="hex">HEX</option>
                        <option value="rgb">RGB</option>
                        <option value="hsl">HSL</option>
                      </select>
                    </label>
                    <label className="check-row">
                      <input type="checkbox" checked={paletteSettings.showOpposites} onChange={(event) => updatePaletteSettings({ showOpposites: event.currentTarget.checked })} />
                      <FieldLabel help="Replaces the displayed palette with complementary colors by rotating each selected hue 180 degrees.">Opposite spectrum</FieldLabel>
                    </label>
                  </div>
                </div>

                <div className="panel">
                  <h2>Export</h2>
                  <div className="settings-grid">
                    <button disabled={!paletteResult} onClick={copyPaletteCss}>
                      <span className="material-symbols-rounded" aria-hidden="true">content_copy</span>
                      Copy CSS
                    </button>
                    <button disabled={!paletteResult} onClick={downloadPaletteCss}>
                      <span className="material-symbols-rounded" aria-hidden="true">css</span>
                      Download CSS
                    </button>
                    <button className="primary" disabled={!paletteResult} onClick={downloadPaletteSheet}>
                      <span className="material-symbols-rounded" aria-hidden="true">download</span>
                      Download Sheet
                    </button>
                  </div>
                </div>
              </>
            )}
          </aside>

          <section className="preview">
            <h2>Preview</h2>
            {imageAction === "dither" && (
              <>
                <div className="dither-preview-shell">
                  {!isDitherReady && <div className="empty-state"><strong>Ready for an image</strong><p>Choose an image to render ordered dithering.</p></div>}
                  <canvas ref={ditherCanvasRef} className={isDitherReady ? "" : "hidden-canvas"} />
                </div>
                <canvas ref={ditherSourceCanvasRef} className="source-canvas" />
                <div className="export-row">
                  <span className="pill">{imageMeta || "No image loaded"}</span>
                  <span className="pill">{ditherStatus}</span>
                  <button className="primary" disabled={!isDitherReady} onClick={downloadDitherPng}>
                    <span className="material-symbols-rounded" aria-hidden="true">download</span>
                    Download PNG
                  </button>
                </div>
              </>
            )}

            {imageAction === "palette" && (
              <>
                <canvas ref={paletteCanvasRef} className="source-canvas" />
                <canvas ref={paletteSourceCanvasRef} className="source-canvas" />
                <div className="palette-results-shell">
                  {!paletteResult ? (
                    <div className="empty-state"><strong>Ready for an image</strong><p>Choose an image to extract brand-ready colors.</p></div>
                  ) : (
                    <div className="palette-results">
                      <PaletteSection title="Primary" colors={paletteResult.primary} format={paletteSettings.colorFormat} />
                      <PaletteSection title="Secondary" colors={paletteResult.secondary} format={paletteSettings.colorFormat} />
                      <PaletteSection title="Tertiary" colors={paletteResult.tertiary} format={paletteSettings.colorFormat} />
                      <div className="palette-section">
                        <h3>Gradients</h3>
                        <div className="gradient-list">
                          {paletteResult.gradients.map((gradient) => (
                            <div className="gradient-card" key={gradient.name}>
                              <span style={{ background: `linear-gradient(135deg, ${gradient.colors[0].hex}, ${gradient.colors[1].hex})` }} />
                              <code>{gradient.name}</code>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="export-row">
                  <span className="pill">{imageMeta || "No image loaded"}</span>
                  <span className="pill">{paletteStatus}</span>
                  <button className="primary" disabled={!paletteResult} onClick={copyPaletteCss}>
                    <span className="material-symbols-rounded" aria-hidden="true">content_copy</span>
                    Copy CSS
                  </button>
                </div>
              </>
            )}
          </section>

          <aside className="log-panel">
            <h2>Log</h2>
            <pre>{log.join("\n")}</pre>
          </aside>
        </section>
      )}

      {toolCategory === "audio" && (
        <section className="workspace">
          <aside className="sidebar">
            <div className="panel">
              <h2>Audio</h2>
              <p>Audio tools are next. Video to MP3/WAV remains available under Video for now.</p>
            </div>
          </aside>
          <section className="preview">
            <h2>Preview</h2>
            <div className="empty-state"><strong>No audio tool selected</strong><p>Dedicated audio tools will use this same settings / preview / log layout.</p></div>
          </section>
          <aside className="log-panel">
            <h2>Log</h2>
            <pre>{log.join("\n")}</pre>
          </aside>
        </section>
      )}

      {isCompareOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsCompareOpen(false)}>
          <section className="compare-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>ESRGAN Model Compare</h2>
                <p>Frame {formatTime(compareFrameTime)}</p>
              </div>
              <div className="modal-head-actions">
                <button title="Zoom out" onClick={() => setCompareZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))}>
                  <span className="material-symbols-rounded" aria-hidden="true">
                    zoom_out
                  </span>
                </button>
                <button title="Reset zoom" onClick={() => { setCompareZoom(1); setComparePan({ x: 0, y: 0 }); }}>
                  {Math.round(compareZoom * 100)}%
                </button>
                <button title="Zoom in" onClick={() => setCompareZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))))}>
                  <span className="material-symbols-rounded" aria-hidden="true">
                    zoom_in
                  </span>
                </button>
                <select
                  value={selectedCompareModel}
                  onChange={(event) => setSelectedCompareModel(event.currentTarget.value)}
                  disabled={!modelPreviews.length}
                >
                  {modelPreviews.length ? (
                    modelPreviews.map((preview) => (
                      <option key={preview.model} value={preview.model}>
                        {preview.model} ({preview.scale}x)
                      </option>
                    ))
                  ) : (
                    <option value="">No preview yet</option>
                  )}
                </select>
                <button className="icon-button" title="Close compare" onClick={() => setIsCompareOpen(false)}>
                  <span className="material-symbols-rounded" aria-hidden="true">
                    close
                  </span>
                </button>
              </div>
            </header>

            <div
              ref={compareViewRef}
              className={`compare-view ${compareDragMode === "pan" ? "is-panning" : ""}`}
              onPointerDown={startCompareInteraction}
              onPointerMove={updateCompareInteraction}
              onPointerUp={stopCompareInteraction}
              onPointerCancel={stopCompareInteraction}
              onWheel={scrollCompare}
            >
              {compareOriginal ? (
                <img
                  className="compare-image compare-base"
                  src={compareOriginal}
                  alt="Original frame"
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  style={{ transform: compareTransform }}
                />
              ) : (
                <span>Preparing original...</span>
              )}
              {selectedComparePreview ? (
                <div className="compare-overlay" style={{ clipPath: `inset(0 0 0 ${compareSplit}%)` }}>
                  <img
                    className="compare-image"
                    src={imageSource(selectedComparePreview)}
                    alt={`${selectedComparePreview.model} preview`}
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                    style={{ transform: compareTransform }}
                  />
                </div>
              ) : (
                <span className="compare-right-empty">{isComparingModels ? "Testing models..." : "No model preview"}</span>
              )}
              <div className="compare-divider" style={{ left: `${compareSplit}%` }}>
                <span className="material-symbols-rounded" aria-hidden="true">
                  compare_arrows
                </span>
              </div>
              <span className="compare-label compare-label-left">Original</span>
              <span className="compare-label compare-label-right">
                {selectedComparePreview ? `${selectedComparePreview.model} (${selectedComparePreview.scale}x)` : "Model"}
              </span>
            </div>
          </section>
        </div>
      )}

      {isModelInstallOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsModelInstallOpen(false)}>
          <section className="settings-modal model-install-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>{modelInstallTool === "realesrgan" ? "Install Real-ESRGAN Models" : "Install RIFE Models"}</h2>
                <p>Select the bundled models to keep after install/update.</p>
              </div>
              <button className="icon-button" title="Close model install" onClick={() => setIsModelInstallOpen(false)}>
                <span className="material-symbols-rounded" aria-hidden="true">close</span>
              </button>
            </header>
            <div className="install-model-list">
              {activeInstallCatalog.map((model) => (
                <label className="install-model-card" key={model.name}>
                  <input type="checkbox" checked={selectedInstallModels.includes(model.name)} onChange={() => toggleInstallModel(model.name)} />
                  <div>
                    <strong>{model.label}</strong>
                    <code>{model.name} | {model.estimate}</code>
                    <p>{model.description}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button onClick={() => setIsModelInstallOpen(false)}>Cancel</button>
              <button className="primary" disabled={!selectedInstallModels.length || isUpdatingEsrgan || isUpdatingRife} onClick={confirmModelInstall}>
                <span className="material-symbols-rounded" aria-hidden="true">download</span>
                Install Selected
              </button>
            </div>
          </section>
        </div>
      )}

      {isSettingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsSettingsOpen(false)}>
          <section className="settings-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>App Settings</h2>
                <p>Tools and setup</p>
              </div>
              <button className="icon-button" title="Close settings" onClick={() => setIsSettingsOpen(false)}>
                <span className="material-symbols-rounded" aria-hidden="true">
                  close
                </span>
              </button>
            </header>

            <div className="settings-layout">
              <nav className="settings-tabs" aria-label="Settings sections">
                <button className={settingsTab === "general" ? "active" : ""} onClick={() => setSettingsTab("general")}>
                  <span className="material-symbols-rounded" aria-hidden="true">tune</span>
                  General
                </button>
                <button className={settingsTab === "must" ? "active" : ""} onClick={() => setSettingsTab("must")}>
                  <span className="material-symbols-rounded" aria-hidden="true">inventory_2</span>
                  Must haves
                </button>
                <button className={settingsTab === "video" ? "active" : ""} onClick={() => setSettingsTab("video")}>
                  <span className="material-symbols-rounded" aria-hidden="true">movie</span>
                  Video
                </button>
                <button className={settingsTab === "image" ? "active" : ""} onClick={() => setSettingsTab("image")}>
                  <span className="material-symbols-rounded" aria-hidden="true">image</span>
                  Image
                </button>
                <button className={settingsTab === "audio" ? "active" : ""} onClick={() => setSettingsTab("audio")}>
                  <span className="material-symbols-rounded" aria-hidden="true">music_note</span>
                  Audio
                </button>
              </nav>

              <div className="settings-content">
                {settingsTab === "general" && (
                  <>
                    <h2>General</h2>
                    <div className="service-card info">
                      <span>Downloads</span>
                      <strong>Default folder</strong>
                      <code title={appSettings.defaultDownloadFolder || outputFolder}>{appSettings.defaultDownloadFolder || outputFolder || "Not set"}</code>
                    </div>
                    <div className="settings-form single-column">
                      <button className="path-button" onClick={chooseDefaultDownloadFolder}>
                        <span className="material-symbols-rounded" aria-hidden="true">drive_folder_upload</span>
                        <span>{appSettings.defaultDownloadFolder || outputFolder || "Choose default download folder"}</span>
                      </button>
                      <button className="primary" onClick={() => saveSettings()}>
                        <span className="material-symbols-rounded" aria-hidden="true">save</span>
                        Save General
                      </button>
                    </div>
                  </>
                )}

                {settingsTab === "must" && (
                  <>
                    <h2>Must haves</h2>
                    <section className={`tool-dropdown ${expandedTool === "ffmpeg" ? "open" : ""}`}>
                      <button className="tool-dropdown-head no-models" onClick={() => toggleExpandedTool("ffmpeg")}>
                        <span className="tool-title-line">
                          <strong>FFmpeg</strong>
                          <span className={`status-chip ${tools?.ffmpeg && tools?.ffprobe ? "installed" : "missing"}`}>{tools?.ffmpeg && tools?.ffprobe ? "Installed" : "Missing"}</span>
                        </span>
                        <span>{tools?.ffmpeg && tools?.ffprobe ? `Tool folder: ${storageFor("ffmpeg")?.currentLabel || "0 B"}` : `Estimated: ${storageFor("ffmpeg")?.estimatedInstallLabel || "~250-450 MB"}`}</span>
                        <span className="material-symbols-rounded" aria-hidden="true">{expandedTool === "ffmpeg" ? "keyboard_arrow_up" : "keyboard_arrow_down"}</span>
                      </button>
                      {expandedTool === "ffmpeg" && (
                        <div className="tool-dropdown-body">
                          <p>FFmpeg includes ffmpeg.exe and ffprobe.exe. The app uses FFmpeg for processing and FFprobe for metadata.</p>
                          <div className="tool-component-row">
                            <div>
                              <strong>FFmpeg Suite</strong>
                              <span>Required video/audio processing tools.</span>
                            </div>
                            <code>{tools?.ffmpeg && tools?.ffprobe ? `Tool folder: ${storageFor("ffmpeg")?.currentLabel || "0 B"}` : `Estimated: ${storageFor("ffmpeg")?.estimatedInstallLabel || "~250-450 MB"}`}</code>
                            <button className="icon-button" disabled={isUpdatingFfmpeg} onClick={updateFfmpeg} title={tools?.ffmpeg ? "Update FFmpeg" : "Download FFmpeg"}>
                              <span className="material-symbols-rounded" aria-hidden="true">{tools?.ffmpeg ? "sync" : "download"}</span>
                            </button>
                          </div>
                          <div className="tool-dropdown-info">
                            <code title={tools?.ffmpeg || "D:/W2DS/Tools/videomaxxxing/tools/ffmpeg"}><span className="material-symbols-rounded" aria-hidden="true">folder</span>{tools?.ffmpeg || "D:/W2DS/Tools/videomaxxxing/tools/ffmpeg"}</code>
                            <code><span className="material-symbols-rounded" aria-hidden="true">storage</span>{tools?.ffmpeg ? `Tool folder: ${storageFor("ffmpeg")?.currentLabel || "0 B"}` : `Estimated: ${storageFor("ffmpeg")?.estimatedInstallLabel || "~250-450 MB"}`}</code>
                          </div>
                          <div className="tool-dropdown-actions">
                            <button disabled={isUpdatingFfmpeg} onClick={updateFfmpeg}><span className="material-symbols-rounded" aria-hidden="true">sync</span>Update All</button>
                            <button disabled><span className="material-symbols-rounded" aria-hidden="true">delete</span>Uninstall All</button>
                            <button className="primary" disabled={isUpdatingFfmpeg} onClick={updateFfmpeg}><span className="material-symbols-rounded" aria-hidden="true">download</span>Download All</button>
                          </div>
                        </div>
                      )}
                    </section>
                  </>
                )}

                {settingsTab === "video" && (
                  <>
                    <h2>Local</h2>
                    <section className={`tool-dropdown ${expandedTool === "realesrgan" ? "open" : ""}`}>
                      <button className="tool-dropdown-head has-models" onClick={() => toggleExpandedTool("realesrgan")}>
                        <strong>Real-ESRGAN</strong>
                        <span>{modelCountLabel(models.length, installModelCatalog.realesrgan.length)}</span>
                        <span className="material-symbols-rounded" aria-hidden="true">{expandedTool === "realesrgan" ? "keyboard_arrow_up" : "keyboard_arrow_down"}</span>
                      </button>
                      {expandedTool === "realesrgan" && (
                        <div className="tool-dropdown-body">
                          <p>Installed models can be removed independently. First-time install keeps the light x2 model by default.</p>
                          <div className="model-list">
                            {realEsrganModelRows.map((candidate) => {
                              const installed = candidate.installed;
                              return (
                                <div className="tool-component-row" key={candidate.name}>
                                  <div>
                                    <span className="model-title-row">
                                      <strong>{candidate.name}</strong>
                                      <span className={`status-chip ${installed ? "installed" : "missing"}`}>{installed ? "Installed" : "Missing"}</span>
                                      {candidate.name === basicModelByTool.realesrgan && <span className="status-chip suggested">Suggested</span>}
                                      {!candidate.known && <span className="status-chip local">Local</span>}
                                    </span>
                                    <span>{installed?.description || candidate.description}</span>
                                  </div>
                                  <code>{installed ? `Installed: ${installed.sizeLabel}` : `Estimated: ${candidate.estimate}`}</code>
                                  <button className={`icon-button ${installed ? "danger" : ""}`} disabled={!installed && !candidate.known} title={installed ? `Remove ${candidate.name}` : candidate.known ? `Download ${candidate.name}` : "Local model cannot be downloaded by this installer"} onClick={() => installed ? deleteModel("realesrgan", candidate.name) : updateRealEsrgan([candidate.name])}>
                                    <span className="material-symbols-rounded" aria-hidden="true">{installed ? "delete" : "download"}</span>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          <div className="tool-dropdown-info">
                            <code title={tools?.realesrgan || "D:/W2DS/Tools/videomaxxxing/tools/realesrgan-ncnn-vulkan"}><span className="material-symbols-rounded" aria-hidden="true">folder</span>{tools?.realesrgan || "D:/W2DS/Tools/videomaxxxing/tools/realesrgan-ncnn-vulkan"}</code>
                            <code><span className="material-symbols-rounded" aria-hidden="true">storage</span>{tools?.realesrgan ? `Tool folder: ${storageFor("realesrgan")?.currentLabel || "0 B"}` : `Estimated: ${storageFor("realesrgan")?.estimatedInstallLabel || "~120-350 MB"}`}</code>
                          </div>
                          <div className="tool-dropdown-actions">
                            <button disabled={isUpdatingEsrgan} onClick={() => openModelInstall("realesrgan")}><span className="material-symbols-rounded" aria-hidden="true">sync</span>Update All</button>
                            <button disabled={!models.length || isUpdatingEsrgan} onClick={() => deleteAllModels("realesrgan")}><span className="material-symbols-rounded" aria-hidden="true">delete</span>Uninstall All</button>
                            <button className="primary" disabled={isUpdatingEsrgan} onClick={() => updateRealEsrgan(installModelCatalog.realesrgan.map((model) => model.name))}><span className="material-symbols-rounded" aria-hidden="true">download</span>Download All</button>
                          </div>
                        </div>
                      )}
                    </section>

                    <section className={`tool-dropdown ${expandedTool === "rife" ? "open" : ""}`}>
                      <button className="tool-dropdown-head has-models" onClick={() => toggleExpandedTool("rife")}>
                        <strong>RIFE</strong>
                        <span>{modelCountLabel(rifeModels.length, installModelCatalog.rife.length)}</span>
                        <span className="material-symbols-rounded" aria-hidden="true">{expandedTool === "rife" ? "keyboard_arrow_up" : "keyboard_arrow_down"}</span>
                      </button>
                      {expandedTool === "rife" && (
                        <div className="tool-dropdown-body">
                          <p>Frame interpolation models can be removed independently. First-time install keeps RIFE v4.6 by default.</p>
                          <div className="model-list">
                            {rifeModelRows.map((candidate) => {
                              const installed = candidate.installed;
                              return (
                                <div className="tool-component-row" key={candidate.name}>
                                  <div>
                                    <span className="model-title-row">
                                      <strong>{candidate.name}</strong>
                                      <span className={`status-chip ${installed ? "installed" : "missing"}`}>{installed ? "Installed" : "Missing"}</span>
                                      {candidate.name === basicModelByTool.rife && <span className="status-chip suggested">Suggested</span>}
                                      {!candidate.known && <span className="status-chip local">Local</span>}
                                    </span>
                                    <span>{installed?.description || candidate.description}</span>
                                  </div>
                                  <code>{installed ? `Installed: ${installed.sizeLabel}` : `Estimated: ${candidate.estimate}`}</code>
                                  <button className={`icon-button ${installed ? "danger" : ""}`} disabled={!installed && !candidate.known} title={installed ? `Remove ${candidate.name}` : candidate.known ? `Download ${candidate.name}` : "Local model cannot be downloaded by this installer"} onClick={() => installed ? deleteModel("rife", candidate.name) : updateRife([candidate.name])}>
                                    <span className="material-symbols-rounded" aria-hidden="true">{installed ? "delete" : "download"}</span>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          <div className="tool-dropdown-info">
                            <code title={tools?.rife || "D:/W2DS/Tools/videomaxxxing/tools/rife-ncnn-vulkan"}><span className="material-symbols-rounded" aria-hidden="true">folder</span>{tools?.rife || "D:/W2DS/Tools/videomaxxxing/tools/rife-ncnn-vulkan"}</code>
                            <code><span className="material-symbols-rounded" aria-hidden="true">storage</span>{tools?.rife ? `Tool folder: ${storageFor("rife")?.currentLabel || "0 B"}` : `Estimated: ${storageFor("rife")?.estimatedInstallLabel || "~180-800 MB"}`}</code>
                          </div>
                          <div className="tool-dropdown-actions">
                            <button disabled={isUpdatingRife} onClick={() => openModelInstall("rife")}><span className="material-symbols-rounded" aria-hidden="true">sync</span>Update All</button>
                            <button disabled={!rifeModels.length || isUpdatingRife} onClick={() => deleteAllModels("rife")}><span className="material-symbols-rounded" aria-hidden="true">delete</span>Uninstall All</button>
                            <button className="primary" disabled={isUpdatingRife} onClick={() => updateRife(installModelCatalog.rife.map((model) => model.name))}><span className="material-symbols-rounded" aria-hidden="true">download</span>Download All</button>
                          </div>
                        </div>
                      )}
                    </section>
                  </>
                )}

                {settingsTab === "cloud" && (
                  <>
                    <h2>Cloud</h2>
                    <p className="settings-note">Segmind local-file mode now uses a temporary in-app file bridge plus Cloudflare Tunnel. Pingvin remains available as an optional legacy helper.</p>
                    <div className="settings-subsection">
                      <h3>Local Bridge</h3>
                    </div>
                    <div className={tools?.cloudflared || appSettings.pingvin.cloudflaredPath ? "service-card ok" : "service-card warn"}>
                      <span>Bridge Upload</span>
                      <strong>{tools?.cloudflared || appSettings.pingvin.cloudflaredPath ? "Ready" : "Needs cloudflared"}</strong>
                      <code>Serves only the selected video during a Segmind job.</code>
                    </div>
                    <div className="settings-subsection">
                      <h3>Pingvin Legacy</h3>
                    </div>
                    <div className={tools?.docker ? "service-card ok" : "service-card bad"}>
                      <span>Docker</span>
                      <strong>{tools?.docker ? "Available" : "Missing"}</strong>
                      <code>{tools?.docker || "Install Docker Desktop before using the Pingvin helper"}</code>
                    </div>
                    <div className={cloudStatusClass}>
                      <span>Pingvin</span>
                      <strong>{!appSettings.pingvin.localUrl.trim() ? "Missing" : appSettings.pingvin.publicUrl.trim() ? "Ready" : "Needs tunnel"}</strong>
                      <code>{appSettings.pingvin.publicUrl || appSettings.pingvin.localUrl || "Local Pingvin URL required"}</code>
                    </div>
                    <div className="settings-form">
                      <label>Local Pingvin URL<input value={appSettings.pingvin.localUrl} onChange={(event) => updatePingvinSettings({ localUrl: event.currentTarget.value })} /></label>
                      <label>Public Tunnel URL<input value={appSettings.pingvin.publicUrl} onChange={(event) => updatePingvinSettings({ publicUrl: event.currentTarget.value })} /></label>
                      <label>Pingvin Token<input type="password" value={appSettings.pingvin.token} onChange={(event) => updatePingvinSettings({ token: event.currentTarget.value })} /></label>
                      <label>Expiration<input placeholder="Optional" value={appSettings.pingvin.expiration} onChange={(event) => updatePingvinSettings({ expiration: event.currentTarget.value })} /></label>
                      <label>Password<input placeholder="Optional" value={appSettings.pingvin.password} onChange={(event) => updatePingvinSettings({ password: event.currentTarget.value })} /></label>
                      <label>Visitor / Download Limit<input placeholder="Optional" value={appSettings.pingvin.visitorLimit} onChange={(event) => updatePingvinSettings({ visitorLimit: event.currentTarget.value })} /></label>
                    </div>
                    <div className="modal-actions compact-actions">
                      <button disabled={isInstallingPingvin || !tools?.docker} onClick={installPingvin}>
                        <span className="material-symbols-rounded" aria-hidden="true">download</span>
                        {isInstallingPingvin ? "Installing..." : "Install / Update Pingvin"}
                      </button>
                      <button className="primary" disabled={isStartingPingvin || !tools?.docker} onClick={startPingvin}>
                        <span className="material-symbols-rounded" aria-hidden="true">play_arrow</span>
                        {isStartingPingvin ? "Starting..." : "Start Pingvin"}
                      </button>
                      <button disabled={isStoppingPingvin || !tools?.docker} onClick={stopPingvin}>
                        <span className="material-symbols-rounded" aria-hidden="true">stop_circle</span>
                        {isStoppingPingvin ? "Stopping..." : "Stop Pingvin"}
                      </button>
                      <button disabled={!tools?.docker} onClick={checkPingvinStatus}>
                        <span className="material-symbols-rounded" aria-hidden="true">fact_check</span>
                        Check Pingvin
                      </button>
                      <button className="primary" onClick={() => saveSettings()}>
                        <span className="material-symbols-rounded" aria-hidden="true">save</span>
                        Save Pingvin
                      </button>
                    </div>

                    <div className="settings-subsection">
                      <h3>Cloudflare</h3>
                    </div>
                    <div className={tools?.cloudflared || appSettings.pingvin.cloudflaredPath ? "service-card ok" : "service-card warn"}>
                      <span>Cloudflared</span>
                      <strong>{tools?.cloudflared || appSettings.pingvin.cloudflaredPath ? "Available" : "Needs install"}</strong>
                      <code>{appSettings.pingvin.cloudflaredPath || tools?.cloudflared || "Missing"}</code>
                    </div>
                    <div className="settings-form">
                      <label>cloudflared.exe<input value={appSettings.pingvin.cloudflaredPath} onChange={(event) => updatePingvinSettings({ cloudflaredPath: event.currentTarget.value })} /></label>
                    </div>
                    <div className="modal-actions compact-actions">
                      <button disabled={isUpdatingCloudflared} onClick={updateCloudflared}>
                        <span className="material-symbols-rounded" aria-hidden="true">download</span>
                        {isUpdatingCloudflared ? "Installing..." : "Install / Update Cloudflared"}
                      </button>
                      <button onClick={chooseCloudflaredPath}>
                        <span className="material-symbols-rounded" aria-hidden="true">folder_open</span>
                        Choose cloudflared
                      </button>
                      <button className="primary" disabled={isStartingTunnel || isTunnelRunning} onClick={startTunnel}>
                        <span className="material-symbols-rounded" aria-hidden="true">cloud_upload</span>
                        {isStartingTunnel ? "Starting..." : "Start Tunnel"}
                      </button>
                      <button disabled={!isTunnelRunning} onClick={stopTunnel}>
                        <span className="material-symbols-rounded" aria-hidden="true">stop_circle</span>
                        Stop Tunnel
                      </button>
                      <button className="primary" onClick={() => saveSettings()}>
                        <span className="material-symbols-rounded" aria-hidden="true">save</span>
                        Save Cloudflare
                      </button>
                    </div>
                  </>
                )}

                {settingsTab === "image" && (
                  <>
                    <h2>Image</h2>
                    <div className="service-card info">
                      <span>Image tools</span>
                      <strong>Local</strong>
                      <code>Dither and Palette Extractor run in-app without external tools.</code>
                    </div>
                  </>
                )}

                {settingsTab === "audio" && (
                  <>
                    <h2>Audio</h2>
                    <div className="service-card info">
                      <span>Audio tools</span>
                      <strong>Planned</strong>
                      <code>Placeholders for future audio utilities.</code>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="modal-actions">
              <div className="service-card info gpu-summary">
                <span>GPU Devices</span>
                <strong>{devices.length ? "Detected" : "Auto"}</strong>
                <code>{devices.length ? devices.map((item) => `GPU ${item.id}`).join(", ") : "Auto / not detected"}</code>
              </div>
              <button onClick={refreshToolState}>
                <span className="material-symbols-rounded" aria-hidden="true">refresh</span>
                Check Updates
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
