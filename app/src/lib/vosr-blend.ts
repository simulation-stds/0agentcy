async function loadBlendImage(src: string, label: string) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = src;
  try {
    await image.decode();
  } catch {
    throw new Error(`Could not load the ${label} image.`);
  }
  return image;
}

function matchesVosrDimensions(original: HTMLImageElement, result: HTMLImageElement) {
  const scale = result.naturalWidth / original.naturalWidth;
  return [1, 2, 4].includes(scale) && result.naturalHeight === original.naturalHeight * scale;
}

export async function loadVosrBlendSource(originalSrc: string, resultSrc: string) {
  const result = await loadBlendImage(resultSrc, "VOSR result");
  if (!originalSrc) return "";
  const original = await loadBlendImage(originalSrc, "original").catch(() => null);
  return original && matchesVosrDimensions(original, result) ? originalSrc : "";
}

export async function loadSkinBlendImages(vosrSrc: string, skinSrc: string) {
  const [vosr, skin] = await Promise.all([
    loadBlendImage(vosrSrc, "VOSR result"),
    loadBlendImage(skinSrc, "Skin Enhance result"),
  ]);
  if (vosr.naturalWidth !== skin.naturalWidth || vosr.naturalHeight !== skin.naturalHeight) {
    throw new Error("Choose a Skin Enhance result with the same dimensions as the saved VOSR image.");
  }
  return [vosr, skin] as const;
}

export async function encodeVosrBlend(originalSrc: string, resultSrc: string, strength: number) {
  const [original, result] = await Promise.all([
    loadBlendImage(originalSrc, "original"),
    loadBlendImage(resultSrc, "VOSR result"),
  ]);
  if (!matchesVosrDimensions(original, result)) {
    throw new Error("Choose a VOSR result with the original image’s dimensions at 1×, 2× or 4×.");
  }
  return encodeBlend(original, result, strength / 100);
}

export async function encodeSkinBlend(vosrSrc: string, skinSrc: string, strength: number) {
  const [vosr, skin] = await loadSkinBlendImages(vosrSrc, skinSrc);
  const canvas = document.createElement("canvas");
  const strip = document.createElement("canvas");
  canvas.width = strip.width = skin.naturalWidth;
  canvas.height = skin.naturalHeight;
  strip.height = Math.min(256, canvas.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const stripContext = strip.getContext("2d", { willReadFrequently: true });
  if (!context || !stripContext) throw new Error("Could not create the full-size skin blend.");
  const opacity = strength / 100;
  const width = canvas.width;
  try {
    context.drawImage(vosr, 0, 0);
    for (let y = 0; y < canvas.height; y += strip.height) {
      const rows = Math.min(strip.height, canvas.height - y);
      const base = context.getImageData(0, y, width, rows);
      stripContext.clearRect(0, 0, width, rows);
      stripContext.drawImage(skin, 0, y, width, rows, 0, 0, width, rows);
      const detail = stripContext.getImageData(0, 0, width, rows).data;
      mixSkinPixels(base.data, detail, opacity);
      context.putImageData(base, 0, y);
    }
    return await pngDataUrl(canvas);
  } finally {
    canvas.width = canvas.height = 0;
    strip.width = strip.height = 0;
  }
}

function mixSkinPixels(base: Uint8ClampedArray, detail: Uint8ClampedArray, opacity: number) {
  for (let index = 0; index < base.length; index += 4) {
    const baseAlpha = base[index + 3];
    const detailAlpha = detail[index + 3];
    const alpha = baseAlpha + (detailAlpha - baseAlpha) * opacity;
    const weight = baseAlpha === detailAlpha ? opacity : alpha === 0 ? 0 : detailAlpha * opacity / alpha;
    for (let channel = index; channel < index + 3; channel++) {
      // Identical channels outside the mask stay identical at every strength.
      base[channel] += (detail[channel] - base[channel]) * weight;
    }
    base[index + 3] = alpha;
  }
}

async function encodeBlend(base: HTMLImageElement, result: HTMLImageElement, opacity: number) {
  const canvas = document.createElement("canvas");
  canvas.width = result.naturalWidth;
  canvas.height = result.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create the full-size blend.");
  try {
    context.imageSmoothingQuality = "high";
    context.drawImage(base, 0, 0, canvas.width, canvas.height);
    context.globalAlpha = opacity;
    context.drawImage(result, 0, 0);
    return await pngDataUrl(canvas);
  } finally {
    canvas.width = canvas.height = 0;
  }
}

async function pngDataUrl(canvas: HTMLCanvasElement) {
  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error("Could not encode the blend as PNG.")),
      "image/png",
    );
  });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the blend PNG."));
    reader.readAsDataURL(png);
  });
}
