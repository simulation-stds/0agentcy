import { useState } from "react";
import { SecondaryButton } from "@/components/app-controls";
import { useModelCompareInteraction } from "@/hooks/use-model-compare-interaction";
import { Columns2, ZoomIn, ZoomOut } from "lucide-react";

type ImageComparePreviewProps = {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  afterOpacity?: number;
  crossfade?: boolean;
  className?: string;
};

export function ImageComparePreview({
  beforeSrc,
  afterSrc,
  beforeLabel = "Original",
  afterLabel = "Edited",
  afterOpacity = 1,
  crossfade = false,
  className = "",
}: ImageComparePreviewProps) {
  const [failedAfterSrc, setFailedAfterSrc] = useState<string | null>(null);
  const {
    compareViewRef,
    compareSplit,
    compareZoom,
    compareTransform,
    compareDragMode,
    setCompareZoom,
    resetCompareInteraction,
    startCompareInteraction,
    updateCompareInteraction,
    stopCompareInteraction,
    scrollCompare,
  } = useModelCompareInteraction();

  return (
    <div className="image-compare-wrap">
      <div className="supir-compare-controls">
        <SecondaryButton type="button" title="Zoom out" onClick={() => setCompareZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))}>
          <ZoomOut className="app-icon" />
        </SecondaryButton>
        <SecondaryButton type="button" title="Reset zoom" onClick={resetCompareInteraction}>
          {Math.round(compareZoom * 100)}%
        </SecondaryButton>
        <SecondaryButton type="button" title="Zoom in" onClick={() => setCompareZoom((value) => Math.min(10, Number((value + 0.25).toFixed(2))))}>
          <ZoomIn className="app-icon" />
        </SecondaryButton>
      </div>
      <div
        ref={compareViewRef}
        className={`compare-view image-compare-preview ${className} ${compareDragMode === "pan" ? "is-panning" : ""}`}
        onPointerDown={startCompareInteraction}
        onPointerMove={updateCompareInteraction}
        onPointerUp={stopCompareInteraction}
        onPointerCancel={stopCompareInteraction}
        onWheel={scrollCompare}
      >
        <div className="compare-underlay" style={{ clipPath: crossfade ? `inset(0 ${100 - compareSplit}% 0 0)` : undefined }}>
          <img className="compare-image compare-base" src={beforeSrc} alt={beforeLabel} draggable={false}
            onDragStart={(event) => event.preventDefault()} style={{ transform: compareTransform }} />
        </div>
        <div className="compare-overlay" style={{ clipPath: `inset(0 0 0 ${compareSplit}%)`, isolation: crossfade ? "isolate" : undefined }}>
          {crossfade && <img className="compare-image" src={beforeSrc} alt="" draggable={false}
            style={{ transform: compareTransform, opacity: 1 - afterOpacity }} />}
          <img className="compare-image" src={afterSrc} alt={afterLabel} draggable={false}
            onError={() => setFailedAfterSrc(afterSrc)}
            onLoad={() => setFailedAfterSrc(current => current === afterSrc ? null : current)}
            onDragStart={(event) => event.preventDefault()} style={{ transform: compareTransform, opacity: afterOpacity, mixBlendMode: crossfade ? "plus-lighter" : undefined }} />
        </div>
        {failedAfterSrc === afterSrc && (
          <p className="compare-right-empty" role="alert">The result preview could not be loaded. Your saved image is still available.</p>
        )}
        <div className="compare-divider" style={{ left: `${compareSplit}%` }}>
          <Columns2 className="app-icon" />
        </div>
        <span className="compare-label compare-label-left">{beforeLabel}</span>
        <span className="compare-label compare-label-right">{afterLabel}</span>
      </div>
    </div>
  );
}
