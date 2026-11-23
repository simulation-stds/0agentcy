import { VideoEffectsControls } from "./video-effects-controls";
import type { Transcription } from "@/hooks/use-transcription";
import { SubtitleOptions, TranscriptionTools } from "@/components/transcription-tools";
import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { FormRow, PrimaryButton, SecondaryButton, SelectControl } from "@/components/app-controls";
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
import { actions } from "@/lib/app-options";
import { validContactSheetFrameCount } from "@/lib/contact-sheet";
import { baseName, fileName, formatTime, localAssetSrc } from "@/lib/media-utils";
import { FolderOpen, Upload } from "lucide-react";

type VideoSidebarProps = {
  transcription: Transcription;
  videoInteraction: ReturnType<typeof useVideoInteractionState>;
  videoMetrics: ReturnType<typeof getVideoSelectionMetrics>;
  videoMedia: ReturnType<typeof useVideoMedia>;
  videoForm: ReturnType<typeof useVideoForm>;
  videoJobs: ReturnType<typeof useVideoJobs>;
  toolState: ReturnType<typeof useToolState>;
  filePickers: ReturnType<typeof useFilePickers>;
  modelCompare: ReturnType<typeof useModelCompare>;
  derivedState: ReturnType<typeof useDerivedUiState>;
  preferredModelDevice: string;
};

export function VideoSidebar({
  transcription,
  videoInteraction,
  videoMetrics,
  videoMedia,
  videoForm,
  videoJobs,
  toolState,
  filePickers,
  modelCompare,
  derivedState,
  preferredModelDevice,
}: VideoSidebarProps) {
  const dropZoneRef = useRef<HTMLElement>(null);
  const mediaRef = useRef(videoMedia);
  mediaRef.current = videoMedia;
  const [isDraggingVideo, setIsDraggingVideo] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const listener = getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (disposed) return;
      if (payload.type === "leave") {
        setIsDraggingVideo(false);
        return;
      }

      // Native drop coordinates are physical pixels; DOM hit testing uses CSS pixels.
      const position = payload.position.toLogical(window.devicePixelRatio);
      const target = document.elementFromPoint(position.x, position.y);
      const inside = !!target && !!dropZoneRef.current?.contains(target);
      setIsDraggingVideo(inside && payload.type !== "drop" && !mediaRef.current.isLoading);
      if (payload.type === "drop" && inside && !mediaRef.current.isLoading) {
        void mediaRef.current.loadDroppedVideo(payload.paths);
      }
    });
    void listener.catch((error) => console.error("Video drop listener failed:", error));

    return () => {
      disposed = true;
      void listener.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);

  useEffect(() => { transcription.videoEffects.update({enabled:videoForm.action === "video_effects"}); }, [videoForm.action,videoMedia.inputPath]);
  const inputName = baseName(videoMedia.inputPath);
  const faceFusionSourceSrc = localAssetSrc(filePickers.faceFusionSourcePath);
  const faceFusionSourceName = fileName(filePickers.faceFusionSourcePath);
  const selectedFramesLabel = videoMetrics.selectedFrames ? `${videoMetrics.selectedFrames.toLocaleString()} frames` : "No frames yet";
  const hasSetup = !["trim_mp4", "extract_frame", "video_effects"].includes(videoForm.action);
  const isWan21 = videoForm.action === "wan21_generate";
  const isWan22 = videoForm.action === "wan22_generate";
  const isGenerativeVideo = isWan21 || isWan22;
  const runDisabled = videoForm.isRunning
    || (!isGenerativeVideo && !videoMedia.metadata)
    || (videoForm.action === "contact_sheet" && (
      !validContactSheetFrameCount(Number(videoForm.contactSheetFrameCount))
      || videoInteraction.trimEnd <= videoInteraction.trimStart
    ))
    || (videoForm.action === "realesrgan_upscale" && (!toolState.tools?.realesrgan || !toolState.models.some(model => model.name === videoForm.selectedModel)))
    || (videoForm.action === "facefusion" && !filePickers.faceFusionSourcePath.trim())
    || (isWan21 && !videoForm.wan21Prompt.trim())
    || (isWan22 && !videoForm.wan22Prompt.trim());

  return (
    <aside className="sidebar">
      <section
        ref={dropZoneRef}
        className={`drop-zone${isDraggingVideo ? " is-dragging" : ""}`}
        aria-label="Video file drop zone"
        aria-busy={videoMedia.isLoading}
        onDrop={videoMedia.handleDrop}
        onDragOver={(event) => event.preventDefault()}
      >
        <Upload className="app-icon" />
        <strong>{videoMedia.inputPath ? inputName : "Choose a video"}</strong>
        {!videoMedia.inputPath && <p>Drop a video here or browse from Explorer.</p>}
        <PrimaryButton type="button" disabled={videoMedia.isLoading} onClick={videoMedia.chooseInputVideo}>
          <FolderOpen className="app-icon" />
          Browse Video
        </PrimaryButton>
        <SecondaryButton type="button" disabled={transcription.busy || transcription.blocked || transcription.isGroupingPreview || !transcription.source} onClick={() => void transcription.importProject()}>
          Open subtitle project
        </SecondaryButton>
      </section>

      <div className="panel">
        <h2>Action</h2>
        <SelectControl
          value={videoForm.action}
          onChange={videoForm.setAction}
          options={actions.map((item) => ({ value: item.id, label: item.label }))} />
      </div>

      {videoForm.action === "transcribe" && <TranscriptionTools tools={transcription} />}
      {videoForm.action === "video_effects" && <VideoEffectsControls tools={transcription} />}
      <SubtitleOptions tools={transcription} />
      {videoForm.action !== "transcribe" && hasSetup && (
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
            onViewLastComparison={modelCompare.viewLastComparison} />
        </div>
      )}

      {videoForm.action !== "transcribe" && videoForm.action !== "video_effects" && <div className="panel">
        <h2>Output</h2>
        <FormRow label="Name">
          <Input value={videoForm.outputName} onChange={(event) => videoForm.setOutputName(event.currentTarget.value)} />
        </FormRow>
        <PrimaryButton
          type="button"
          disabled={runDisabled || transcription.busy}
          onClick={videoJobs.runJob}
        >
          {isGenerativeVideo ? "Generate Video" : "Run Action"}
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
        {isWan22 && (
          <SecondaryButton type="button" className="danger-action" disabled={!videoForm.isRunning} onClick={videoJobs.cancelWan22}>Cancel</SecondaryButton>
        )}
        {isWan21 && (
          <SecondaryButton type="button" className="danger-action" disabled={!videoForm.isRunning} onClick={videoJobs.cancelWan21}>Cancel</SecondaryButton>
        )}
      </div>

      }
      <div className="panel">
        <h2>Selection</h2>
        <p className="selection-time">{formatTime(videoInteraction.trimStart)} - {formatTime(videoInteraction.trimEnd)}</p>
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
