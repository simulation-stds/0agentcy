import type { DitherSettings } from "@/lib/app-options";

export type DitherViewport = {
  zoom: number;
  panX: number;
  panY: number;
};

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

function quantizeLuma(luma: number, levels: number) {
  const steps = Math.max(2, Math.round(levels));
  return Math.round(clamp(luma) * (steps - 1)) / (steps - 1);
}

function stableNoise(x: number, y: number, salt = 0) {
  const value = Math.sin((x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453);
  return value - Math.floor(value);
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function halftoneThreshold(x: number, y: number, settings: DitherSettings) {
  const cell = Math.max(4, settings.bayerSize * 2);
  const angle = ((settings.halftoneAngle ?? 45) * Math.PI) / 180;
  const shape = settings.halftoneShape ?? "round";
  const rotatedX = x * Math.cos(angle) + y * Math.sin(angle);
  const rotatedY = -x * Math.sin(angle) + y * Math.cos(angle);
  const cx = (positiveModulo(rotatedX, cell) + 0.5) / cell - 0.5;
  const cy = (positiveModulo(rotatedY, cell) + 0.5) / cell - 0.5;
  if (shape === "diamond") {
    return clamp(1 - (Math.abs(cx) + Math.abs(cy)) / 0.72);
  }
  if (shape === "line") {
    return clamp(1 - Math.abs(cy) / 0.5);
  }
  return clamp(1 - Math.hypot(cx, cy) / 0.72);
}

function noiseThreshold(x: number, y: number, settings: DitherSettings, blueNoise: boolean) {
  const scale = Math.max(1, Math.round(settings.noiseScale ?? 1));
  const nx = Math.floor(x / scale);
  const ny = Math.floor(y / scale);
  const seed = settings.noiseSeed ?? 23;
  if (!blueNoise) {
    return stableNoise(nx, ny, seed);
  }
  return clamp((stableNoise(nx * 5, ny * 5, seed) + stableNoise(nx * 13, ny * 13, seed + 17) * 0.5) / 1.5);
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
        threshold = noiseThreshold(x, y, settings, true);
      } else if (settings.algorithm === "halftone") {
        threshold = halftoneThreshold(x, y, settings);
      } else {
        threshold = noiseThreshold(x, y, settings, false);
      }
      output[index] = quantizeLuma(values[index] + (threshold - 0.5) * strength, settings.posterizeLevels);
    }
  }
  return output;
}

function computeDrawRect(
  image: HTMLImageElement,
  width: number,
  height: number,
  fitMode: DitherSettings["fitMode"],
  viewport?: DitherViewport,
  sourceScale = 1,
) {
  const zoom = Math.max(0.25, viewport?.zoom ?? 1);
  const panX = viewport?.panX ?? 0;
  const panY = viewport?.panY ?? 0;
  let base;
  const safeSourceScale = Math.max(1, sourceScale);
  if (fitMode === "original") {
    const sourceWidth = image.naturalWidth / safeSourceScale;
    const sourceHeight = image.naturalHeight / safeSourceScale;
    base = {
      x: Math.round((width - sourceWidth) / 2),
      y: Math.round((height - sourceHeight) / 2),
      w: sourceWidth,
      h: sourceHeight,
    };
  } else {
    const scale = fitMode === "cover"
      ? Math.max(width / image.naturalWidth, height / image.naturalHeight)
      : Math.min(width / image.naturalWidth, height / image.naturalHeight);
    base = {
      x: Math.round((width - image.naturalWidth * scale) / 2),
      y: Math.round((height - image.naturalHeight * scale) / 2),
      w: Math.round(image.naturalWidth * scale),
      h: Math.round(image.naturalHeight * scale),
    };
  }

  if (zoom <= 1 && !panX && !panY) return base;

  const centerX = base.x + base.w / 2;
  const centerY = base.y + base.h / 2;
  const w = base.w * zoom;
  const h = base.h * zoom;
  return {
    x: Math.round(centerX - w / 2 + panX),
    y: Math.round(centerY - h / 2 + panY),
    w: Math.round(w),
    h: Math.round(h),
  };
}

function toneLuma(r: number, g: number, b: number, settings: DitherSettings) {
  let luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const range = Math.max(0.001, settings.whitePoint - settings.blackPoint);
  luma = clamp((luma - settings.blackPoint) / range);
  luma = clamp((luma - 0.5) * (1 + settings.contrast) + 0.5 + settings.brightness);
  return Math.pow(luma, 1 / Math.max(0.001, settings.gamma));
}

function loadImage(imageSrc: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load that image."));
    image.crossOrigin = imageSrc.startsWith("blob:") || imageSrc.startsWith("data:") ? "" : "anonymous";
    image.src = imageSrc;
  });
}

function isGpuDitherAlgorithm(settings: DitherSettings) {
  return settings.algorithm !== "floyd_steinberg" && settings.algorithm !== "atkinson";
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "Unknown shader compile error.";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Could not create WebGL program.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || "Unknown WebGL link error.";
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

function algorithmId(algorithm: DitherSettings["algorithm"]) {
  if (algorithm === "bayer") return 0;
  if (algorithm === "blue_noise") return 3;
  if (algorithm === "halftone") return 4;
  if (algorithm === "random_noise") return 5;
  return 0;
}

function uploadTextureFromCanvas(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Could not create source texture.");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  return texture;
}

function uploadBayerTexture(gl: WebGL2RenderingContext, size: number) {
  const matrix = makeBayer(size);
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      data[y * size + x] = Math.max(0, Math.min(255, Math.round(matrix[y][x] * 255)));
    }
  }
  const texture = gl.createTexture();
  if (!texture) throw new Error("Could not create Bayer texture.");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, size, size, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  return texture;
}

const ditherVertexShader = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const ditherFragmentShader = `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform sampler2D u_bayer;
uniform vec2 u_outputSize;
uniform vec2 u_sampleSize;
uniform int u_algorithm;
uniform float u_bayerSize;
uniform float u_pixelScale;
uniform float u_ditherStrength;
uniform float u_posterizeLevels;
uniform float u_blackPoint;
uniform float u_whitePoint;
uniform float u_gamma;
uniform float u_contrast;
uniform float u_brightness;
uniform float u_halftoneAngle;
uniform int u_halftoneShape;
uniform float u_noiseScale;
uniform float u_noiseSeed;
uniform int u_usePalette;
uniform int u_invertPalette;
uniform vec3 u_shadowColor;
uniform vec3 u_midColor;
uniform vec3 u_highlightColor;
in vec2 v_uv;
out vec4 outColor;

float clamp01(float value) {
  return clamp(value, 0.0, 1.0);
}

float rand(vec2 point, float salt) {
  return fract(sin((point.x * 127.1 + point.y * 311.7 + salt * 74.7) * 43758.5453));
}

float positiveMod(float value, float divisor) {
  return mod(mod(value, divisor) + divisor, divisor);
}

float toneLuma(vec3 color) {
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float rangeValue = max(0.001, u_whitePoint - u_blackPoint);
  luma = clamp01((luma - u_blackPoint) / rangeValue);
  luma = clamp01((luma - 0.5) * (1.0 + u_contrast) + 0.5 + u_brightness);
  return pow(luma, 1.0 / max(0.001, u_gamma));
}

float quantizeLuma(float luma) {
  float steps = max(2.0, floor(u_posterizeLevels + 0.5));
  return floor(clamp01(luma) * (steps - 1.0) + 0.5) / (steps - 1.0);
}

float noiseThreshold(vec2 point, bool blueNoise) {
  float scaleValue = max(1.0, floor(u_noiseScale + 0.5));
  vec2 noisePoint = floor(point / scaleValue);
  if (!blueNoise) {
    return rand(noisePoint, u_noiseSeed);
  }
  return clamp01((rand(noisePoint * 5.0, u_noiseSeed) + rand(noisePoint * 13.0, u_noiseSeed + 17.0) * 0.5) / 1.5);
}

float halftoneThreshold(vec2 point) {
  float cell = max(4.0, u_bayerSize * 2.0);
  float angle = radians(u_halftoneAngle);
  float rotatedX = point.x * cos(angle) + point.y * sin(angle);
  float rotatedY = -point.x * sin(angle) + point.y * cos(angle);
  float cx = (positiveMod(rotatedX, cell) + 0.5) / cell - 0.5;
  float cy = (positiveMod(rotatedY, cell) + 0.5) / cell - 0.5;
  if (u_halftoneShape == 1) {
    return clamp01(1.0 - (abs(cx) + abs(cy)) / 0.72);
  }
  if (u_halftoneShape == 2) {
    return clamp01(1.0 - abs(cy) / 0.5);
  }
  return clamp01(1.0 - length(vec2(cx, cy)) / 0.72);
}

vec3 mapPalette(float luma) {
  float value = u_invertPalette == 1 ? 1.0 - luma : luma;
  if (value <= 0.5) {
    return mix(u_shadowColor, u_midColor, value / 0.5);
  }
  return mix(u_midColor, u_highlightColor, (value - 0.5) / 0.5);
}

void main() {
  vec2 outputPixel = floor(v_uv * u_outputSize);
  vec2 samplePixel = floor(outputPixel / u_pixelScale);
  vec2 sourceUv = (samplePixel + 0.5) / u_sampleSize;
  vec4 sourceColor = texture(u_source, sourceUv);
  float toned = toneLuma(sourceColor.rgb);
  float threshold = 0.5;

  if (u_algorithm == 0) {
    vec2 bayerUv = (mod(samplePixel, vec2(u_bayerSize)) + 0.5) / u_bayerSize;
    threshold = texture(u_bayer, bayerUv).r;
  } else if (u_algorithm == 3) {
    threshold = noiseThreshold(samplePixel, true);
  } else if (u_algorithm == 4) {
    threshold = halftoneThreshold(samplePixel);
  } else {
    threshold = noiseThreshold(samplePixel, false);
  }

  float stepped = quantizeLuma(toned + (threshold - 0.5) * u_ditherStrength);
  vec3 color = u_usePalette == 1
    ? mapPalette(stepped)
    : sourceColor.rgb * (stepped / max(0.001, toned));
  outColor = vec4(color, sourceColor.a);
}
`;

function halftoneShapeId(shape: DitherSettings["halftoneShape"]) {
  if (shape === "diamond") return 1;
  if (shape === "line") return 2;
  return 0;
}

function renderDitherImageGpu({
  canvas,
  sourceCanvas,
  settings,
  finalWidth,
  finalHeight,
  sampleWidth,
  sampleHeight,
  pixelScale,
}: {
  canvas: HTMLCanvasElement;
  sourceCanvas: HTMLCanvasElement;
  settings: DitherSettings;
  finalWidth: number;
  finalHeight: number;
  sampleWidth: number;
  sampleHeight: number;
  pixelScale: number;
}) {
  const webglCanvas = document.createElement("canvas");
  webglCanvas.width = finalWidth;
  webglCanvas.height = finalHeight;
  const gl = webglCanvas.getContext("webgl2", { premultipliedAlpha: false });
  if (!gl) throw new Error("WebGL2 is not available.");

  const program = createProgram(gl, ditherVertexShader, ditherFragmentShader);
  gl.useProgram(program);

  const vertices = new Float32Array([
    -1, -1, 0, 0,
    1, -1, 1, 0,
    -1, 1, 0, 1,
    1, 1, 1, 1,
  ]);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
  const positionLocation = gl.getAttribLocation(program, "a_position");
  const uvLocation = gl.getAttribLocation(program, "a_uv");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(uvLocation);
  gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

  const sourceTexture = uploadTextureFromCanvas(gl, sourceCanvas);
  const bayerSize = Math.max(2, Math.round(settings.bayerSize));
  const bayerTexture = uploadBayerTexture(gl, bayerSize);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  gl.uniform1i(gl.getUniformLocation(program, "u_source"), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, bayerTexture);
  gl.uniform1i(gl.getUniformLocation(program, "u_bayer"), 1);

  const shadow = hexToRgb(settings.shadowColor);
  const mid = hexToRgb(settings.midColor);
  const highlight = hexToRgb(settings.highlightColor);
  gl.uniform2f(gl.getUniformLocation(program, "u_outputSize"), finalWidth, finalHeight);
  gl.uniform2f(gl.getUniformLocation(program, "u_sampleSize"), sampleWidth, sampleHeight);
  gl.uniform1i(gl.getUniformLocation(program, "u_algorithm"), algorithmId(settings.algorithm));
  gl.uniform1f(gl.getUniformLocation(program, "u_bayerSize"), bayerSize);
  gl.uniform1f(gl.getUniformLocation(program, "u_pixelScale"), pixelScale);
  gl.uniform1f(gl.getUniformLocation(program, "u_ditherStrength"), settings.ditherStrength);
  gl.uniform1f(gl.getUniformLocation(program, "u_posterizeLevels"), settings.posterizeLevels);
  gl.uniform1f(gl.getUniformLocation(program, "u_blackPoint"), settings.blackPoint);
  gl.uniform1f(gl.getUniformLocation(program, "u_whitePoint"), settings.whitePoint);
  gl.uniform1f(gl.getUniformLocation(program, "u_gamma"), settings.gamma);
  gl.uniform1f(gl.getUniformLocation(program, "u_contrast"), settings.contrast);
  gl.uniform1f(gl.getUniformLocation(program, "u_brightness"), settings.brightness);
  gl.uniform1f(gl.getUniformLocation(program, "u_halftoneAngle"), settings.halftoneAngle ?? 45);
  gl.uniform1i(gl.getUniformLocation(program, "u_halftoneShape"), halftoneShapeId(settings.halftoneShape ?? "round"));
  gl.uniform1f(gl.getUniformLocation(program, "u_noiseScale"), settings.noiseScale ?? 1);
  gl.uniform1f(gl.getUniformLocation(program, "u_noiseSeed"), settings.noiseSeed ?? 23);
  gl.uniform1i(gl.getUniformLocation(program, "u_usePalette"), settings.usePalette ? 1 : 0);
  gl.uniform1i(gl.getUniformLocation(program, "u_invertPalette"), settings.invertPalette ? 1 : 0);
  gl.uniform3f(gl.getUniformLocation(program, "u_shadowColor"), shadow.r / 255, shadow.g / 255, shadow.b / 255);
  gl.uniform3f(gl.getUniformLocation(program, "u_midColor"), mid.r / 255, mid.g / 255, mid.b / 255);
  gl.uniform3f(gl.getUniformLocation(program, "u_highlightColor"), highlight.r / 255, highlight.g / 255, highlight.b / 255);

  gl.viewport(0, 0, finalWidth, finalHeight);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  canvas.width = finalWidth;
  canvas.height = finalHeight;
  const previewCtx = canvas.getContext("2d");
  if (!previewCtx) throw new Error("Could not create canvas context.");
  previewCtx.imageSmoothingEnabled = false;
  previewCtx.clearRect(0, 0, finalWidth, finalHeight);
  previewCtx.drawImage(webglCanvas, 0, 0);

  gl.deleteTexture(sourceTexture);
  gl.deleteTexture(bayerTexture);
  gl.deleteBuffer(buffer);
  gl.deleteProgram(program);
}

type RenderDitherImageArgs = {
  imageSrc: string;
  settings: DitherSettings;
  canvas: HTMLCanvasElement;
  sourceCanvas: HTMLCanvasElement;
  viewport?: DitherViewport;
};

export async function renderDitherImage({ imageSrc, settings, canvas, sourceCanvas, viewport }: RenderDitherImageArgs) {
  const image = await loadImage(imageSrc);
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceCtx) {
    throw new Error("Could not create canvas context.");
  }

  const finalWidth = Math.round(clamp(settings.outputWidth, 8, 4096));
  const finalHeight = Math.round(clamp(settings.outputHeight, 8, 4096));
  const pixelScale = Math.max(1, Math.round(settings.pixelScale));
  const sampleWidth = Math.ceil(finalWidth / pixelScale);
  const sampleHeight = Math.ceil(finalHeight / pixelScale);

  sourceCanvas.width = sampleWidth;
  sourceCanvas.height = sampleHeight;
  sourceCtx.clearRect(0, 0, sampleWidth, sampleHeight);
  sourceCtx.fillStyle = "#000";
  sourceCtx.fillRect(0, 0, sampleWidth, sampleHeight);
  sourceCtx.imageSmoothingEnabled = true;
  sourceCtx.imageSmoothingQuality = "high";
  const sampleViewport = viewport
    ? {
        zoom: viewport.zoom,
        panX: viewport.panX / pixelScale,
        panY: viewport.panY / pixelScale,
      }
    : undefined;
  const rect = computeDrawRect(image, sampleWidth, sampleHeight, settings.fitMode, sampleViewport, pixelScale);
  sourceCtx.drawImage(image, rect.x, rect.y, rect.w, rect.h);

  if (isGpuDitherAlgorithm(settings)) {
    try {
      renderDitherImageGpu({
        canvas,
        sourceCanvas,
        settings,
        finalWidth,
        finalHeight,
        sampleWidth,
        sampleHeight,
        pixelScale,
      });
      return `${image.naturalWidth}x${image.naturalHeight} source | ${finalWidth}x${finalHeight} PNG | ${pixelScale}x pixels | GPU`;
    } catch {
      // Fall back to the CPU renderer when WebGL is unavailable or blocked.
    }
  }

  const previewCtx = canvas.getContext("2d");
  if (!previewCtx) {
    throw new Error("Could not create canvas context.");
  }
  const src = sourceCtx.getImageData(0, 0, sampleWidth, sampleHeight);
  const tonedValues = new Float32Array(sampleWidth * sampleHeight);
  for (let index = 0; index < tonedValues.length; index += 1) {
    const sourceIndex = index * 4;
    tonedValues[index] = toneLuma(src.data[sourceIndex], src.data[sourceIndex + 1], src.data[sourceIndex + 2], settings);
  }
  const ditheredValues = ditherLuma(tonedValues, sampleWidth, sampleHeight, settings);
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
          const color = settings.usePalette
            ? mapDitherPalette(stepped, settings)
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
  return `${image.naturalWidth}x${image.naturalHeight} source | ${finalWidth}x${finalHeight} PNG | ${pixelScale}x pixels | CPU`;
}
