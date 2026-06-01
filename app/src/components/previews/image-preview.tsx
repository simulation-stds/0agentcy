import { useEffect, useRef, useState, type CSSProperties, type Dispatch, type PointerEvent, type RefObject, type SetStateAction, type WheelEvent } from "react";
import { SecondaryButton } from "@/components/app-controls";
import { ImageComparePreview } from "@/components/previews/image-compare-preview";
import { PaletteSection } from "@/components/palette-section";
import type { PaletteResult } from "@/lib/app-options";
import type { DitherViewport } from "@/lib/dither";
import type { AnimatedImageFrame } from "@/hooks/use-image-render-effects";
import type { CompressorSizeSummary } from "@/hooks/use-image-tools";
import { localAssetSrc } from "@/lib/media-utils";
import type { ColorFormat } from "@/lib/palette";

type ImagePreviewProps = {
  imageAction: string;
  imageSrc: string;
  gifFrames: AnimatedImageFrame[];
  ditherGifFrames: AnimatedImageFrame[];
  isDitherReady: boolean;
  ditherFitMode: "contain" | "cover" | "original";
  ditherComparePreview: boolean;
  compressorComparePreview: boolean;
  compressorOutputPath: string;
  compressorSizeSummary: CompressorSizeSummary | null;
  ditherViewport: DitherViewport;
  onSetDitherViewport: Dispatch<SetStateAction<DitherViewport>>;
  supirOutputPath: string;
  paletteResult: PaletteResult | null;
  paletteColorFormat: ColorFormat;
  ditherCanvasRef: RefObject<HTMLCanvasElement | null>;
  ditherSourceCanvasRef: RefObject<HTMLCanvasElement | null>;
  paletteCanvasRef: RefObject<HTMLCanvasElement | null>;
  paletteSourceCanvasRef: RefObject<HTMLCanvasElement | null>;
};

export function ImagePreview({
  imageAction,
  imageSrc,
  gifFrames,
  ditherGifFrames,
  isDitherReady,
  ditherFitMode,
  ditherComparePreview,
  compressorComparePreview,
  compressorOutputPath,
  compressorSizeSummary,
  ditherViewport,
  onSetDitherViewport,
  supirOutputPath,
  paletteResult,
  paletteColorFormat,
  ditherCanvasRef,
  ditherSourceCanvasRef,
  paletteCanvasRef,
  paletteSourceCanvasRef,
}: ImagePreviewProps) {
  const supirSrc = localAssetSrc(supirOutputPath);
  const compressorSrc = localAssetSrc(compressorOutputPath);
  const [ditherDataUrl, setDitherDataUrl] = useState("");
  const [ditherOriginalDataUrl, setDitherOriginalDataUrl] = useState("");
  const [gifFrameIndex, setGifFrameIndex] = useState(0);
  const [ditherDisplaySize, setDitherDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [isDitherPanning, setIsDitherPanning] = useState(false);
  const ditherPanStartRef = useRef({ pointerX: 0, pointerY: 0, panX: 0, panY: 0 });
  const ditherShellRef = useRef<HTMLDivElement | null>(null);
  const isOriginalSizeDither = imageAction === "dither" && ditherFitMode === "original";
  const isAnimatedDither = imageAction === "dither" && ditherGifFrames.length > 0;
  const currentDitherGifFrame = ditherGifFrames[gifFrameIndex % Math.max(1, ditherGifFrames.length)];
  const currentSourceGifFrame = gifFrames[gifFrameIndex % Math.max(1, gifFrames.length)];
  const compressorInputSrc = gifFrames[0]?.dataUrl || imageSrc;

  useEffect(() => {
    if (isAnimatedDither || imageAction !== "dither" || !isDitherReady || !ditherCanvasRef.current) {
      setDitherDataUrl("");
      setDitherOriginalDataUrl("");
      return;
    }
    try {
      const nextUrl = ditherCanvasRef.current.toDataURL("image/png");
      setDitherDataUrl((current) => (current === nextUrl ? current : nextUrl));
    } catch {
      setDitherDataUrl("");
      setDitherOriginalDataUrl("");
    }
  });

  useEffect(() => {
    setGifFrameIndex(0);
  }, [gifFrames, ditherGifFrames, imageSrc]);

  useEffect(() => {
    if (!isAnimatedDither || !currentDitherGifFrame) return;
    const timer = window.setTimeout(() => {
      setGifFrameIndex((index) => (index + 1) % ditherGifFrames.length);
    }, Math.max(20, currentDitherGifFrame.delayMs));
    return () => window.clearTimeout(timer);
  }, [currentDitherGifFrame, ditherGifFrames.length, isAnimatedDither]);

  useEffect(() => {
    setDitherDataUrl("");
    setDitherOriginalDataUrl("");
  }, [ditherFitMode, imageAction, imageSrc]);

  useEffect(() => {
    const canvas = ditherCanvasRef.current;
    if (imageAction !== "dither" || !isDitherReady || !imageSrc || !ditherDataUrl || !canvas) {
      setDitherOriginalDataUrl("");
      return;
    }

    let cancelled = false;
    buildOriginalCompareDataUrl({
      imageSrc,
      width: canvas.width,
      height: canvas.height,
      fitMode: ditherFitMode,
      viewport: ditherViewport,
    })
      .then((nextUrl) => {
        if (!cancelled) {
          setDitherOriginalDataUrl((current) => (current === nextUrl ? current : nextUrl));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDitherOriginalDataUrl("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ditherCanvasRef, ditherDataUrl, ditherFitMode, ditherViewport, imageAction, imageSrc, isDitherReady]);

  useEffect(() => {
    const shell = ditherShellRef.current;
    if (imageAction !== "dither" || !shell) {
      setDitherDisplaySize(null);
      return;
    }

    const measure = () => {
      const canvas = ditherCanvasRef.current;
      if (!canvas || !canvas.width || !canvas.height) {
        setDitherDisplaySize(null);
        return;
      }

      const styles = window.getComputedStyle(shell);
      const paddingX = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
      const paddingY = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
      const availableWidth = Math.max(1, shell.clientWidth - paddingX);
      const availableHeight = Math.max(1, shell.clientHeight - paddingY);
      const scale = Math.min(1, availableWidth / canvas.width, availableHeight / canvas.height);
      setDitherDisplaySize({
        width: Math.max(1, Math.round(canvas.width * scale)),
        height: Math.max(1, Math.round(canvas.height * scale)),
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [ditherCanvasRef, ditherComparePreview, ditherDataUrl, imageAction, isDitherReady]);

  function updateDitherZoom(nextZoom: number, anchor?: { x: number; y: number }) {
    const canvas = ditherCanvasRef.current;
    onSetDitherViewport((current) => {
      const zoom = Math.max(0.25, Math.min(10, Number(nextZoom.toFixed(2))));
      if (!canvas || !anchor || current.zoom === zoom) {
        return { ...current, zoom };
      }

      const bounds = canvas.getBoundingClientRect();
      const canvasX = ((anchor.x - bounds.left) / Math.max(1, bounds.width)) * canvas.width;
      const canvasY = ((anchor.y - bounds.top) / Math.max(1, bounds.height)) * canvas.height;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const ratio = zoom / Math.max(0.001, current.zoom);
      return {
        zoom,
        panX: canvasX - centerX - ratio * (canvasX - centerX - current.panX),
        panY: canvasY - centerY - ratio * (canvasY - centerY - current.panY),
      };
    });
  }

  function scrollDitherPreview(event: WheelEvent<HTMLCanvasElement>) {
    if (!isOriginalSizeDither || ditherComparePreview) return;
    event.preventDefault();
    updateDitherZoom(ditherViewport.zoom + (event.deltaY < 0 ? 0.2 : -0.2), { x: event.clientX, y: event.clientY });
  }

  function startDitherPan(event: PointerEvent<HTMLCanvasElement>) {
    if (!isOriginalSizeDither || ditherComparePreview) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    ditherPanStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      panX: ditherViewport.panX,
      panY: ditherViewport.panY,
    };
    setIsDitherPanning(true);
  }

  function updateDitherPan(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDitherPanning) return;
    const start = ditherPanStartRef.current;
    const bounds = event.currentTarget.getBoundingClientRect();
    const scaleX = event.currentTarget.width / Math.max(1, bounds.width);
    const scaleY = event.currentTarget.height / Math.max(1, bounds.height);
    onSetDitherViewport((current) => ({
      ...current,
      panX: start.panX + (event.clientX - start.pointerX) * scaleX,
      panY: start.panY + (event.clientY - start.pointerY) * scaleY,
    }));
  }

  function resetDitherViewport() {
    onSetDitherViewport({
      zoom: 1,
      panX: 0,
      panY: 0,
    });
  }

  const ditherCanvasStyle: CSSProperties | undefined = ditherDisplaySize
    ? {
        width: `${ditherDisplaySize.width}px`,
        height: `${ditherDisplaySize.height}px`,
      }
    : undefined;

  function stopDitherPan(event: PointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDitherPanning(false);
  }

  return (
    <section className="preview">
      {imageAction === "dither" && (
        <>
          <div
            ref={ditherShellRef}
            className={`dither-preview-shell ${isOriginalSizeDither ? "is-original-size" : ""} ${ditherComparePreview && isDitherReady ? "is-compare" : ""} ${isDitherPanning ? "is-panning" : ""}`}
          >
            {!isDitherReady && <div className="empty-state"><strong>Ready for an image</strong><p>Choose an image to render ordered dithering.</p></div>}
            {ditherComparePreview && isAnimatedDither && currentSourceGifFrame && currentDitherGifFrame && (
              <ImageComparePreview
                beforeSrc={currentSourceGifFrame.dataUrl}
                afterSrc={currentDitherGifFrame.dataUrl}
                beforeLabel="Original"
                afterLabel="Dither"
                className="dither-inline-compare"
              />
            )}
            {ditherComparePreview && !isAnimatedDither && isDitherReady && ditherOriginalDataUrl && ditherDataUrl && (
              <ImageComparePreview
                beforeSrc={ditherOriginalDataUrl}
                afterSrc={ditherDataUrl}
                beforeLabel="Original"
                afterLabel="Dither"
                className="dither-inline-compare"
              />
            )}
            {!ditherComparePreview && isAnimatedDither && currentDitherGifFrame && (
              <img className="dither-gif-preview" src={currentDitherGifFrame.dataUrl} alt="Dithered GIF preview" />
            )}
            <canvas
              ref={ditherCanvasRef}
              className={`${isDitherReady && !ditherComparePreview && !isAnimatedDither ? "" : "hidden-canvas"} ${isOriginalSizeDither && isDitherReady && !ditherComparePreview ? "dither-pan-canvas" : ""}`}
              style={ditherCanvasStyle}
              onWheel={scrollDitherPreview}
              onPointerDown={startDitherPan}
              onPointerMove={updateDitherPan}
              onPointerUp={stopDitherPan}
              onPointerCancel={stopDitherPan}
            />
            {isOriginalSizeDither && !ditherComparePreview && isDitherReady && (
              <div className="dither-floating-controls">
                <SecondaryButton type="button" title="Zoom out" onClick={() => updateDitherZoom(ditherViewport.zoom - 0.25)}>
                  <span className="material-symbols-rounded" aria-hidden="true">zoom_out</span>
                </SecondaryButton>
                <SecondaryButton type="button" title="Reset zoom" onClick={resetDitherViewport}>
                  {Math.round(ditherViewport.zoom * 100)}%
                </SecondaryButton>
                <SecondaryButton type="button" title="Zoom in" onClick={() => updateDitherZoom(ditherViewport.zoom + 0.25)}>
                  <span className="material-symbols-rounded" aria-hidden="true">zoom_in</span>
                </SecondaryButton>
              </div>
            )}
          </div>
          <canvas ref={ditherSourceCanvasRef} className="source-canvas" />
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
                <PaletteSection title="Primary" colors={paletteResult.primary} format={paletteColorFormat} />
                <PaletteSection title="Secondary" colors={paletteResult.secondary} format={paletteColorFormat} />
                <PaletteSection title="Tertiary" colors={paletteResult.tertiary} format={paletteColorFormat} />
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
        </>
      )}

      {imageAction === "compress" && (
        <div className={`dither-preview-shell ${compressorComparePreview && compressorSrc ? "is-compare" : ""}`}>
          {!imageSrc ? (
            <div className="empty-state"><strong>Ready for an image</strong><p>Choose an image to compress.</p></div>
          ) : compressorComparePreview && compressorSrc ? (
            <ImageComparePreview
              beforeSrc={compressorInputSrc}
              afterSrc={compressorSrc}
              beforeLabel="Original"
              afterLabel="Compressed"
              className="dither-inline-compare"
            />
          ) : (
            <img className="ai-preview-image" src={compressorSrc || compressorInputSrc} alt={compressorSrc ? "Compressed image preview" : "Source image preview"} />
          )}
          {compressorSizeSummary && (
            <div className="compressor-size-badges" aria-label="Compression disk size">
              <span>Before <code>{compressorSizeSummary.before}</code></span>
              <span>After <code>{compressorSizeSummary.after}</code></span>
              <span>{compressorSizeSummary.saved}</span>
            </div>
          )}
        </div>
      )}

      {imageAction === "supir" && (
        <>
          <div className="dither-preview-shell">
            {imageSrc && supirSrc ? (
              <div className="supir-preview-wrap">
                <ImageComparePreview
                  beforeSrc={imageSrc}
                  afterSrc={supirSrc}
                  beforeLabel="Original"
                  afterLabel="SUPIR"
                  className="supir-inline-compare"
                />
              </div>
            ) : imageSrc ? (
              <img className="ai-preview-image" src={imageSrc} alt="" />
            ) : (
              <div className="empty-state"><strong>Ready for an image</strong><p>Choose an image to restore with SUPIR.</p></div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function buildOriginalCompareDataUrl({
  imageSrc,
  width,
  height,
  fitMode,
  viewport,
}: {
  imageSrc: string;
  width: number;
  height: number;
  fitMode: "contain" | "cover" | "original";
  viewport: DitherViewport;
}) {
  return new Promise<string>((resolve, reject) => {
    if (!width || !height) {
      reject(new Error("Dither preview is not ready."));
      return;
    }

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not create compare canvas."));
        return;
      }

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const rect = computeImageRect(image, width, height, fitMode, viewport);
      ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("Could not load original image."));
    image.crossOrigin = imageSrc.startsWith("blob:") || imageSrc.startsWith("data:") ? "" : "anonymous";
    image.src = imageSrc;
  });
}

function computeImageRect(image: HTMLImageElement, width: number, height: number, fitMode: "contain" | "cover" | "original", viewport: DitherViewport) {
  const zoom = Math.max(0.25, viewport.zoom || 1);
  const panX = viewport.panX || 0;
  const panY = viewport.panY || 0;
  let base;
  if (fitMode === "original") {
    base = {
      x: Math.round((width - image.naturalWidth) / 2),
      y: Math.round((height - image.naturalHeight) / 2),
      w: image.naturalWidth,
      h: image.naturalHeight,
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
