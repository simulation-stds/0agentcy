import type { PaletteGradient, PaletteResult, PaletteSettings } from "@/lib/app-options";

export type ColorFormat = "hex" | "rgb" | "hsl";

export type PaletteSwatch = {
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  label: string;
};

export function formatColorValue(color: PaletteSwatch, format: ColorFormat) {
  if (format === "rgb") return `rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b})`;
  if (format === "hsl") {
    return `hsl(${color.hsl.h} ${Math.round(color.hsl.s * 100)}% ${Math.round(color.hsl.l * 100)}%)`;
  }
  return color.hex;
}

function clamp(value: number, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
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

export function extractPaletteFromImageData(imageData: ImageData, settings: PaletteSettings): PaletteResult {
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

export function drawPaletteSheet(canvas: HTMLCanvasElement, result: PaletteResult, format: ColorFormat) {
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
