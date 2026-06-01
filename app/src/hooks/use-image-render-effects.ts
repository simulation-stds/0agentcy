import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { DitherSettings, PaletteResult, PaletteSettings, ToolCategory } from "@/lib/app-options";
import { renderDitherImage } from "@/lib/dither";
import type { DitherViewport } from "@/lib/dither";
import { drawPaletteSheet, extractPaletteFromImageData } from "@/lib/palette";

export type AnimatedImageFrame = {
  index: number;
  delayMs: number;
  dataUrl: string;
};

export function useDitherRenderEffect({
  imageSrc,
  isAnimatedGif,
  animatedGifFrames,
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
}: {
  imageSrc: string;
  isAnimatedGif: boolean;
  animatedGifFrames: AnimatedImageFrame[];
  toolCategory: ToolCategory;
  imageAction: string;
  ditherSettings: DitherSettings;
  ditherCanvasRef: RefObject<HTMLCanvasElement | null>;
  ditherSourceCanvasRef: RefObject<HTMLCanvasElement | null>;
  ditherViewport: DitherViewport;
  setDitherGifFrames: Dispatch<SetStateAction<AnimatedImageFrame[]>>;
  setImageMeta: Dispatch<SetStateAction<string>>;
  setDitherStatus: Dispatch<SetStateAction<string>>;
  setIsDitherReady: Dispatch<SetStateAction<boolean>>;
  appendLog: (message: string) => void;
}) {
  const lastLoggedDitherMetaRef = useRef("");

  useEffect(() => {
    if (!imageSrc || toolCategory !== "image" || imageAction !== "dither") {
      return;
    }
    const canvas = ditherCanvasRef.current;
    const sourceCanvas = ditherSourceCanvasRef.current;
    if (!canvas || !sourceCanvas) {
      return;
    }

    let cancelled = false;
    if (isAnimatedGif && animatedGifFrames.length === 0) {
      setIsDitherReady(false);
      return;
    }

    if (animatedGifFrames.length > 0) {
      setIsDitherReady(false);
      setDitherStatus("Rendering GIF frames.");
      setDitherGifFrames([]);
      const renderedFrames: AnimatedImageFrame[] = [];
      (async () => {
        let meta = "";
        for (const frame of animatedGifFrames) {
          if (cancelled) return;
          meta = await renderDitherImage({ imageSrc: frame.dataUrl, settings: ditherSettings, canvas, sourceCanvas, viewport: ditherViewport });
          renderedFrames.push({
            index: frame.index,
            delayMs: frame.delayMs,
            dataUrl: canvas.toDataURL("image/png"),
          });
        }
        if (cancelled) return;
        const totalDuration = renderedFrames.reduce((total, frame) => total + frame.delayMs, 0);
        const gifMeta = `${renderedFrames.length} GIF frames | ${(totalDuration / 1000).toFixed(2)}s | ${meta}`;
        setDitherGifFrames(renderedFrames);
        setImageMeta(gifMeta);
        setDitherStatus("Rendered animated GIF.");
        setIsDitherReady(true);
        if (lastLoggedDitherMetaRef.current !== gifMeta) {
          lastLoggedDitherMetaRef.current = gifMeta;
          appendLog(`Dither GIF rendered: ${gifMeta}`);
        }
      })().catch((error) => {
        if (cancelled) return;
        const message = `Dither GIF render failed: ${String(error)}`;
        setDitherStatus(message);
        setIsDitherReady(false);
        setDitherGifFrames([]);
        appendLog(message);
      });
      return () => {
        cancelled = true;
      };
    }

    setDitherGifFrames([]);
    renderDitherImage({ imageSrc, settings: ditherSettings, canvas, sourceCanvas, viewport: ditherViewport })
      .then((meta) => {
        if (cancelled) return;
        setImageMeta(meta);
        setDitherStatus("Rendered.");
        setIsDitherReady(true);
        if (lastLoggedDitherMetaRef.current !== meta) {
          lastLoggedDitherMetaRef.current = meta;
          appendLog(`Dither rendered: ${meta}`);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        const message = `Dither render failed: ${String(error)}`;
        setDitherStatus(message);
        setIsDitherReady(false);
        appendLog(message);
      });
    return () => {
      cancelled = true;
    };
  }, [animatedGifFrames, appendLog, ditherCanvasRef, ditherSettings, ditherSourceCanvasRef, ditherViewport, imageAction, imageSrc, isAnimatedGif, setDitherGifFrames, setDitherStatus, setImageMeta, setIsDitherReady, toolCategory]);
}

export function usePaletteExtractionEffect({
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
}: {
  imageSrc: string;
  toolCategory: ToolCategory;
  imageAction: string;
  paletteSettings: PaletteSettings;
  paletteCanvasRef: RefObject<HTMLCanvasElement | null>;
  paletteSourceCanvasRef: RefObject<HTMLCanvasElement | null>;
  setImageMeta: Dispatch<SetStateAction<string>>;
  setPaletteResult: Dispatch<SetStateAction<PaletteResult | null>>;
  setPaletteStatus: Dispatch<SetStateAction<string>>;
  appendLog: (message: string) => void;
}) {
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
        const meta = `${image.naturalWidth}x${image.naturalHeight} source | sampled ${width}x${height}`;
        setImageMeta(meta);
        appendLog(`Palette extracted: ${meta}`);
      } catch (error) {
        const message = `Palette extraction failed: ${String(error)}`;
        setPaletteResult(null);
        setPaletteStatus(message);
        appendLog(message);
      }
    };
    image.onerror = () => {
      if (cancelled) return;
      setPaletteResult(null);
      setPaletteStatus("Could not load that image.");
      appendLog("Palette extraction failed: could not load that image.");
    };
    image.crossOrigin = imageSrc.startsWith("blob:") || imageSrc.startsWith("data:") ? "" : "anonymous";
    image.src = imageSrc;
    return () => {
      cancelled = true;
    };
  }, [appendLog, imageAction, imageSrc, paletteCanvasRef, paletteSettings, paletteSourceCanvasRef, setImageMeta, setPaletteResult, setPaletteStatus, toolCategory]);
}
