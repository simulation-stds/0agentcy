import { FieldLabel, FormRow, PrimaryButton, SecondaryButton, SelectControl, SwitchRow } from "@/components/app-controls";
import { VideoActionSettings } from "@/components/sidebars/video-action-settings";
import { Input } from "@/components/ui/input";
import type { useDerivedUiState } from "@/hooks/use-derived-ui-state";
import type { useFilePickers } from "@/hooks/use-file-pickers";
import type { useModelCompare } from "@/hooks/use-model-compare";
import type { useToolState } from "@/hooks/use-tool-state";
import type { useVideoForm } from "@/hooks/use-video-form";
import type { getVideoSelectionMetrics, useVideoInteractionState } from "@/hooks/use-video-interaction-state";
import type { useVideoJobs } from "@/hooks/use-video-jobs";
import type { useVideoMedia } from "@/hooks/use-video-media";
import type { useVideoTimeline } from "@/hooks/use-video-timeline";
import { actions } from "@/lib/app-options";
import { baseName, fileName, formatTime, localAssetSrc } from "@/lib/media-utils";

type VideoSidebarProps = {
  videoInteraction: ReturnType<typeof useVideoInteractionState>;
  videoMetrics: ReturnType<typeof getVideoSelectionMetrics>;
  videoMedia: ReturnType<typeof useVideoMedia>;
  videoForm: ReturnType<typeof useVideoForm>;
  videoJobs: ReturnType<typeof useVideoJobs>;
  videoTimeline: ReturnType<typeof useVideoTimeline>;
  toolState: ReturnType<typeof useToolState>;
  filePickers: ReturnType<typeof useFilePickers>;
  modelCompare: ReturnType<typeof useModelCompare>;
  derivedState: ReturnType<typeof useDerivedUiState>;
  preferredModelDevice: string;
};

export function VideoSidebar({
  videoInteraction,
  videoMetrics,
  videoMedia,
  videoForm,
  videoJobs,
  videoTimeline,
  toolState,
  filePickers,
  modelCompare,
  derivedState,
  preferredModelDevice,
}: VideoSidebarProps) {
  const inputName = baseName(videoMedia.inputPath);
  const faceFusionSourceSrc = localAssetSrc(filePickers.faceFusionSourcePath);
  const faceFusionSourceName = fileName(filePickers.faceFusionSourcePath);
  const selectedFramesLabel = videoMetrics.selectedFrames ? `${videoMetrics.selectedFrames.toLocaleString()} frames` : "No frames yet";
  const hasSetup = !["trim_mp4", "extract_frame"].includes(videoForm.action);
  const previewRangeLabel = videoTimeline.isPreviewFitted ? "Show Full" : "Fit To Selection";

  function togglePreviewRange() {
    if (!videoMedia.metadata) return;
    if (videoTimeline.isPreviewFitted) {
      void videoMedia.loadPreviewRange(0, videoMetrics.duration);
      return;
    }
    void videoMedia.loadPreviewRange(videoInteraction.trimStart, videoInteraction.trimEnd);
  }

  return (
    <aside className="sidebar">
      <section className="drop-zone" onDrop={videoMedia.handleDrop} onDragOver={(event) => event.preventDefault()}>
        <span className="material-symbols-rounded" aria-hidden="true">upload_file</span>
        <strong>{videoMedia.inputPath ? inputName : "Choose a video"}</strong>
        {!videoMedia.inputPath && <p>Drop a video here or browse from Explorer.</p>}
        <PrimaryButton type="button" disabled={videoMedia.isLoading} onClick={videoMedia.chooseInputVideo}>
          <span className="material-symbols-rounded" aria-hidden="true">folder_open</span>
          Browse Video
        </PrimaryButton>
      </section>

      <div className="panel">
        <h2>Action</h2>
        <SelectControl
          value={videoForm.action}
          onChange={videoForm.setAction}
          options={actions.map((item) => ({ value: item.id, label: item.label }))}
        />
      </div>

      <div className="panel">
        <h2>Preview</h2>
        <FieldLabel help="Fit the timeline thumbnails to the selected range, or return the preview to the full video.">
          Range
        </FieldLabel>
        <SecondaryButton
          type="button"
          disabled={videoMedia.isLoading || !videoMedia.metadata || (!videoTimeline.isPreviewFitted && !videoTimeline.canFitSelection)}
          onClick={togglePreviewRange}
        >
          {videoMedia.isLoading ? "Loading Preview" : previewRangeLabel}
        </SecondaryButton>
        <SwitchRow
          checked={videoInteraction.playSelectionOnly}
          onCheckedChange={videoInteraction.setPlaySelectionOnly}
          help="When enabled, playback starts at the trim start and stops at the trim end unless the full video is selected."
        >
          Play selection only
        </SwitchRow>
        <SwitchRow
          checked={videoInteraction.loopPlayback}
          onCheckedChange={videoInteraction.setLoopPlayback}
          help="When enabled, playback restarts automatically when the preview reaches the end of the selected range or full video."
        >
          Play on loop
        </SwitchRow>
      </div>

      {hasSetup && (
        <div className="panel">
          <h2>Setup</h2>
          <VideoActionSettings
            videoForm={videoForm}
            videoMedia={videoMedia}
            toolState={toolState}
            filePickers={filePickers}
            derivedState={derivedState}
            faceFusionSourceSrc={faceFusionSourceSrc}
            faceFusionSourceName={faceFusionSourceName}
            preferredModelDevice={preferredModelDevice}
            isComparingModels={modelCompare.isComparingModels}
            hasCurrentVideoComparison={modelCompare.hasCurrentVideoComparison}
            onCompareModels={modelCompare.compareModels}
            onViewLastComparison={modelCompare.viewLastComparison}
          />
        </div>
      )}

      <div className="panel">
        <h2>Output</h2>
        <FormRow label="Name">
          <Input value={videoForm.outputName} onChange={(event) => videoForm.setOutputName(event.currentTarget.value)} />
        </FormRow>
        <PrimaryButton
          type="button"
          disabled={videoForm.isRunning || !videoMedia.metadata || (videoForm.action === "facefusion" && !filePickers.faceFusionSourcePath.trim())}
          onClick={videoJobs.runJob}
        >
          Run Action
        </PrimaryButton>
        {videoForm.action === "realesrgan_upscale" && (
          <SecondaryButton type="button" className="danger-action" disabled={!videoForm.isRunning} onClick={videoJobs.cancelUpscale}>Cancel</SecondaryButton>
        )}
        {videoForm.action === "rife_interpolate" && (
          <SecondaryButton type="button" className="danger-action" disabled={!videoForm.isRunning} onClick={videoJobs.cancelUpscale}>Cancel</SecondaryButton>
        )}
        {videoForm.action === "facefusion" && (
          <SecondaryButton type="button" className="danger-action" disabled={!videoForm.isRunning} onClick={videoJobs.cancelFaceFusion}>Cancel</SecondaryButton>
        )}
      </div>

      <div className="panel">
        <h2>Selection</h2>
        <p>{formatTime(videoInteraction.trimStart)} - {formatTime(videoInteraction.trimEnd)}</p>
        <p>{selectedFramesLabel}</p>
      </div>

      <div className="panel">
        <h2>Metadata</h2>
        {videoMedia.metadata ? (
          <>
            <p>{videoMedia.metadata.width}x{videoMedia.metadata.height}</p>
            <p>{videoMedia.metadata.fps.toFixed(3)} fps</p>
            <p>{videoMedia.metadata.codec}</p>
          </>
        ) : (
          <p>No video loaded</p>
        )}
      </div>
    </aside>
  );
}
