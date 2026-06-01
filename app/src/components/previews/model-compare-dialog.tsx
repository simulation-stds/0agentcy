import { IconButton, SecondaryButton, SelectControl } from "@/components/app-controls";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { useModelCompare } from "@/hooks/use-model-compare";

type ModelPreview = {
  model: string;
  scale: string;
  dataUrl?: string;
  data_url?: string;
};

type ModelCompareDialogProps = {
  modelCompare: ReturnType<typeof useModelCompare>;
  formatTime: (seconds: number) => string;
  imageSource: (item: ModelPreview) => string;
};

export function ModelCompareDialog({
  modelCompare,
  formatTime,
  imageSource,
}: ModelCompareDialogProps) {
  return (
    <Dialog open={modelCompare.isCompareOpen} onOpenChange={(open) => modelCompare.setIsCompareOpen(open)}>
      <DialogContent className="compare-modal" showCloseButton={false}>
        <header>
          <div>
            <DialogTitle>ESRGAN Model Compare</DialogTitle>
            <DialogDescription>Frame {formatTime(modelCompare.compareFrameTime)}</DialogDescription>
          </div>
          <div className="modal-head-actions">
            <SecondaryButton type="button" title="Zoom out" onClick={modelCompare.zoomOutCompare}>
              <span className="material-symbols-rounded" aria-hidden="true">
                zoom_out
              </span>
            </SecondaryButton>
            <SecondaryButton type="button" title="Reset zoom" onClick={modelCompare.resetCompareZoom}>
              {Math.round(modelCompare.compareZoom * 100)}%
            </SecondaryButton>
            <SecondaryButton type="button" title="Zoom in" onClick={modelCompare.zoomInCompare}>
              <span className="material-symbols-rounded" aria-hidden="true">
                zoom_in
              </span>
            </SecondaryButton>
            <SelectControl
              value={modelCompare.selectedCompareModel}
              onChange={modelCompare.setSelectedCompareModel}
              disabled={!modelCompare.modelPreviews.length}
              options={modelCompare.modelPreviews.length ? modelCompare.modelPreviews.map((preview) => ({ value: preview.model, label: `${preview.model} (${preview.scale}x)` })) : [{ value: "", label: "No preview yet", disabled: true }]}
            />
            <IconButton type="button" title="Close compare" onClick={() => modelCompare.setIsCompareOpen(false)}>
              <span className="material-symbols-rounded" aria-hidden="true">
                close
              </span>
            </IconButton>
          </div>
        </header>

        <div
          ref={modelCompare.compareViewRef}
          className={`compare-view ${modelCompare.compareDragMode === "pan" ? "is-panning" : ""}`}
          onPointerDown={modelCompare.startCompareInteraction}
          onPointerMove={modelCompare.updateCompareInteraction}
          onPointerUp={modelCompare.stopCompareInteraction}
          onPointerCancel={modelCompare.stopCompareInteraction}
          onWheel={modelCompare.scrollCompare}
        >
          {modelCompare.compareOriginal ? (
            <img
              className="compare-image compare-base"
              src={modelCompare.compareOriginal}
              alt="Original frame"
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              style={{ transform: modelCompare.compareTransform }}
            />
          ) : (
            <span>Preparing original...</span>
          )}
          {modelCompare.selectedComparePreview ? (
            <div className="compare-overlay" style={{ clipPath: `inset(0 0 0 ${modelCompare.compareSplit}%)` }}>
              <img
                className="compare-image"
                src={imageSource(modelCompare.selectedComparePreview)}
                alt={`${modelCompare.selectedComparePreview.model} preview`}
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                style={{ transform: modelCompare.compareTransform }}
              />
            </div>
          ) : (
            <span className="compare-right-empty">{modelCompare.isComparingModels ? "Testing models..." : "No model preview"}</span>
          )}
          <div className="compare-divider" style={{ left: `${modelCompare.compareSplit}%` }}>
            <span className="material-symbols-rounded" aria-hidden="true">
              compare_arrows
            </span>
          </div>
          <span className="compare-label compare-label-left">Original</span>
          <span className="compare-label compare-label-right">
            {modelCompare.selectedComparePreview ? `${modelCompare.selectedComparePreview.model} (${modelCompare.selectedComparePreview.scale}x)` : "Model"}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
