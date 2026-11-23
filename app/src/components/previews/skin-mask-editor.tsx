import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { FormRow, PrimaryButton, RangeControl, SecondaryButton, SelectControl } from "@/components/app-controls";
import type { DetectedSkinMask, SkinCrop, SkinDetectionMode, SkinPoint, SkinStroke } from "@/lib/skin-mask";

type SkinMaskEditorProps = {
  src: string;
  autoMask: DetectedSkinMask | null;
  mode: SkinDetectionMode;
  onModeChange: (mode: SkinDetectionMode) => void;
  crop: SkinCrop | null;
  onCropChange: (crop: SkinCrop | null) => void;
  coverage: number;
  onCoverageChange: (coverage: number) => void;
  onDetect: () => void;
  onClear: () => void;
  detecting: boolean;
  strokes: SkinStroke[];
  onStrokesChange: (strokes: SkinStroke[]) => void;
  onApply: () => void;
  onClose: () => void;
  busy: boolean;
};

const MASK_PREVIEW_LIMIT = 1600;

type MaskGesture =
  | { kind: "crop"; pointerId: number; start: SkinPoint }
  | { kind: "stroke"; pointerId: number; stroke: SkinStroke };

function cropBetween([x0, y0]: SkinPoint, [x1, y1]: SkinPoint): SkinCrop {
  return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
}

function drawStroke(context: CanvasRenderingContext2D, stroke: SkinStroke, points = stroke.points) {
  const { width, height } = context.canvas;
  context.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
  context.fillStyle = context.strokeStyle = "#78ef9b";
  context.lineWidth = stroke.width * Math.min(width, height);
  context.lineCap = context.lineJoin = "round";
  const [first, ...rest] = points;
  context.beginPath();
  if (rest.length) {
    context.moveTo(first[0] * width, first[1] * height);
    for (const [x, y] of rest) context.lineTo(x * width, y * height);
    context.stroke();
  } else {
    context.arc(first[0] * width, first[1] * height, context.lineWidth / 2, 0, 2 * Math.PI);
    context.fill();
  }
}

function maskPoint(event: PointerEvent<HTMLCanvasElement>): SkinPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  return [
    Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  ];
}

export function SkinMaskEditor({
  src, autoMask, mode, onModeChange, crop, onCropChange, coverage, onCoverageChange,
  onDetect, onClear, detecting, strokes, onStrokesChange, onApply, onClose, busy,
}: SkinMaskEditorProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<MaskGesture | null>(null);
  const [drawingCrop, setDrawingCrop] = useState(false);
  const [draftCrop, setDraftCrop] = useState<SkinCrop | null>(null);
  const cropOutline = draftCrop ?? crop;
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [brushSize, setBrushSize] = useState(5);
  const [erase, setErase] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [maskImage, setMaskImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!autoMask) {
      setMaskImage(null);
      return;
    }
    let current = true;
    const image = new Image();
    image.onload = () => { if (current) setMaskImage(image); };
    image.onerror = () => { if (current) setMaskImage(null); };
    image.src = autoMask.dataUrl;
    return () => { current = false; };
  }, [autoMask]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setViewportSize({ width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  const previewScale = Math.min(1, MASK_PREVIEW_LIMIT / Math.max(imageSize.width, imageSize.height));
  const maskWidth = Math.round(imageSize.width * previewScale);
  const maskHeight = Math.round(imageSize.height * previewScale);
  const fit = imageSize.width
    ? Math.min(viewportSize.width / imageSize.width, viewportSize.height / imageSize.height)
    : 0;

  // Resample the probability map once. Coverage and paint edits only redraw the overlay.
  const preview = useMemo(() => {
    if (!autoMask || maskImage?.src !== autoMask.dataUrl || !maskWidth || !maskHeight) return null;
    const probabilityCanvas = document.createElement("canvas");
    probabilityCanvas.width = maskWidth;
    probabilityCanvas.height = maskHeight;
    const context = probabilityCanvas.getContext("2d");
    if (!context) return null;

    const [left, top, right, bottom] = autoMask.bounds;
    const x0 = Math.round(left * maskWidth);
    const y0 = Math.round(top * maskHeight);
    const width = Math.max(1, Math.round(right * maskWidth) - x0);
    const height = Math.max(1, Math.round(bottom * maskHeight) - y0);
    context.drawImage(maskImage, x0, y0, width, height);
    const probabilities = context.getImageData(0, 0, maskWidth, maskHeight).data;
    const overlay = context.createImageData(maskWidth, maskHeight);
    for (let i = 0; i < overlay.data.length; i += 4) {
      overlay.data[i] = 120;
      overlay.data[i + 1] = 239;
      overlay.data[i + 2] = 155;
    }
    return { probabilities, overlay };
  }, [autoMask, maskImage, maskWidth, maskHeight]);

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    if (preview) {
      const cutoff = Math.ceil((100 - coverage) * 255 / 100);
      for (let alpha = 3; alpha < preview.overlay.data.length; alpha += 4) {
        preview.overlay.data[alpha] = preview.probabilities[alpha] >= cutoff ? 255 : 0;
      }
      context.putImageData(preview.overlay, 0, 0);
    } else {
      context.clearRect(0, 0, maskWidth, maskHeight);
    }
    for (const stroke of strokes) drawStroke(context, stroke);
    if (gesture.current?.kind === "stroke") drawStroke(context, gesture.current.stroke);
  }, [strokes, maskWidth, maskHeight, preview, coverage]);

  function startGesture(event: PointerEvent<HTMLCanvasElement>) {
    if (busy || event.button !== 0 || gesture.current) return;
    const point = maskPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (drawingCrop) {
      gesture.current = { kind: "crop", pointerId: event.pointerId, start: point };
      setDraftCrop(cropBetween(point, point));
      return;
    }
    const stroke = { width: brushSize / 100, erase, points: [point] };
    gesture.current = { kind: "stroke", pointerId: event.pointerId, stroke };
    const context = event.currentTarget.getContext("2d");
    if (context) drawStroke(context, stroke);
  }

  function continueGesture(event: PointerEvent<HTMLCanvasElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const point = maskPoint(event);
    if (active.kind === "crop") {
      setDraftCrop(cropBetween(active.start, point));
      return;
    }
    const previous = active.stroke.points[active.stroke.points.length - 1];
    if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 0.0005) return;
    active.stroke.points.push(point);
    const context = event.currentTarget.getContext("2d");
    if (context) drawStroke(context, active.stroke, [previous, point]);
  }

  function finishGesture(event: PointerEvent<HTMLCanvasElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (active.kind === "stroke") {
      onStrokesChange([...strokes, active.stroke]);
      return;
    }
    setDraftCrop(null);
    if (event.type !== "pointerup") return;
    const bounds = cropBetween(active.start, maskPoint(event));
    const rect = event.currentTarget.getBoundingClientRect();
    if ((bounds[2] - bounds[0]) * rect.width < 6 || (bounds[3] - bounds[1]) * rect.height < 6) return;
    onCropChange(bounds);
    setDrawingCrop(false);
  }

  return (
    <section className="panel min-w-0" aria-labelledby="skin-mask-heading">
      <h2 id="skin-mask-heading">Skin mask</h2>
      <fieldset disabled={busy} className="flex flex-wrap items-end gap-2">
        <FormRow label="Detection mode" help="Stars Speck runs locally on CPU. Detail helps with small skin regions.">
          <SelectControl value={mode} disabled={busy} onChange={value => onModeChange(value as SkinDetectionMode)}
            options={[{ value: "fast", label: "Fast · 512 px" }, { value: "detail", label: "Detail · 1024 px" }]} />
        </FormRow>
        <SecondaryButton type="button" disabled={busy || imageFailed || !imageSize.width} aria-pressed={drawingCrop}
          onClick={() => setDrawingCrop(!drawingCrop)}>
          {drawingCrop ? "Cancel crop" : crop ? "Redraw crop" : "Draw crop"}
        </SecondaryButton>
        {crop && <SecondaryButton type="button" onClick={() => { onCropChange(null); setDrawingCrop(false); }}>Use full image</SecondaryButton>}
        <SecondaryButton type="button" disabled={busy || drawingCrop || imageFailed || !imageSize.width} onClick={onDetect}>
          {detecting ? "Detecting skin…" : "Detect skin"}
        </SecondaryButton>
      </fieldset>
      {drawingCrop && <p role="status">Drag around the area to detect. Stars Speck adds padding around the crop.</p>}
      {autoMask && (
        <fieldset disabled={busy}>
          <RangeControl label="Mask Coverage" help="Slide up to include more pixels from the existing detection."
            min={1} max={99} step={1} value={coverage} displayValue={`${coverage}%`}
            onChange={value => onCoverageChange(Number(value))} />
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <SecondaryButton type="button" aria-pressed={!drawingCrop && !erase} disabled={busy}
          onClick={() => { setDrawingCrop(false); setErase(false); }}>Brush</SecondaryButton>
        <SecondaryButton type="button" aria-pressed={!drawingCrop && erase} disabled={busy}
          onClick={() => { setDrawingCrop(false); setErase(true); }}>Eraser</SecondaryButton>
        <SecondaryButton type="button" disabled={busy || !strokes.length} onClick={() => onStrokesChange(strokes.slice(0, -1))}>Undo</SecondaryButton>
        <SecondaryButton type="button" disabled={busy || (!autoMask && !strokes.length)} onClick={onClear}>Clear mask</SecondaryButton>
        <SecondaryButton type="button" disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - 0.5))}>Zoom out</SecondaryButton>
        <SecondaryButton type="button" disabled={zoom === 1} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</SecondaryButton>
        <SecondaryButton type="button" disabled={zoom >= 4} onClick={() => setZoom(Math.min(4, zoom + 0.5))}>Zoom in</SecondaryButton>
      </div>
      <RangeControl label="Brush size" help="Diameter as a percentage of the shorter image edge."
        min={0.5} max={25} step={0.5} value={brushSize} displayValue={`${brushSize}%`}
        onChange={value => setBrushSize(Number(value))} />
      {imageFailed && <p role="alert">Could not open the saved VOSR image.</p>}
      <div ref={viewport} className="skin-mask-viewport">
        <div className="skin-mask-surface" style={{ width: imageSize.width * fit * zoom, height: imageSize.height * fit * zoom }}>
          <img src={src} alt="Saved VOSR result" draggable={false}
            onLoad={event => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            onError={() => setImageFailed(true)} />
          {maskWidth > 0 && maskHeight > 0 && (
            <canvas ref={canvas} width={maskWidth} height={maskHeight} aria-label="Skin mask overlay"
              onPointerDown={startGesture} onPointerMove={continueGesture} onPointerUp={finishGesture}
              onPointerCancel={finishGesture} onLostPointerCapture={finishGesture} />
          )}
          {cropOutline && (
            <div className="skin-mask-crop" aria-hidden="true" style={{
              left: `${cropOutline[0] * 100}%`, top: `${cropOutline[1] * 100}%`,
              width: `${(cropOutline[2] - cropOutline[0]) * 100}%`,
              height: `${(cropOutline[3] - cropOutline[1]) * 100}%`,
            }} />
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PrimaryButton type="button" disabled={busy || (!autoMask && !strokes.some(stroke => !stroke.erase))} onClick={onApply}>
          {busy && !detecting ? "Enhancing skin…" : "Apply Skin Enhance"}
        </PrimaryButton>
        <SecondaryButton type="button" disabled={busy} onClick={onClose}>Close mask</SecondaryButton>
      </div>
    </section>
  );
}
