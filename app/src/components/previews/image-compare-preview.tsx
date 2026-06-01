import { SecondaryButton } from "@/components/app-controls";
import { useModelCompareInteraction } from "@/hooks/use-model-compare-interaction";

type ImageComparePreviewProps = {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
};

export function ImageComparePreview({
  beforeSrc,
  afterSrc,
  beforeLabel = "Original",
  afterLabel = "Edited",
  className = "",
}: ImageComparePreviewProps) {
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
          <span className="material-symbols-rounded" aria-hidden="true">zoom_out</span>
        </SecondaryButton>
        <SecondaryButton type="button" title="Reset zoom" onClick={resetCompareInteraction}>
          {Math.round(compareZoom * 100)}%
        </SecondaryButton>
        <SecondaryButton type="button" title="Zoom in" onClick={() => setCompareZoom((value) => Math.min(10, Number((value + 0.25).toFixed(2))))}>
          <span className="material-symbols-rounded" aria-hidden="true">zoom_in</span>
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
        <img className="compare-image compare-base" src={beforeSrc} alt={beforeLabel} draggable={false} onDragStart={(event) => event.preventDefault()} style={{ transform: compareTransform }} />
        <div className="compare-overlay" style={{ clipPath: `inset(0 0 0 ${compareSplit}%)` }}>
          <img className="compare-image" src={afterSrc} alt={afterLabel} draggable={false} onDragStart={(event) => event.preventDefault()} style={{ transform: compareTransform }} />
        </div>
        <div className="compare-divider" style={{ left: `${compareSplit}%` }}>
          <span className="material-symbols-rounded" aria-hidden="true">compare_arrows</span>
        </div>
        <span className="compare-label compare-label-left">{beforeLabel}</span>
        <span className="compare-label compare-label-right">{afterLabel}</span>
      </div>
    </div>
  );
}
