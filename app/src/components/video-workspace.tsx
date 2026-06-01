import { LogPanel } from "@/components/log-panel";
import { VideoPreview } from "@/components/previews/video-preview";
import { VideoSidebar } from "@/components/sidebars/video-sidebar";
import type { useDerivedUiState } from "@/hooks/use-derived-ui-state";
import type { useFilePickers } from "@/hooks/use-file-pickers";
import type { useModelCompare } from "@/hooks/use-model-compare";
import type { useToolState } from "@/hooks/use-tool-state";
import type { useVideoForm } from "@/hooks/use-video-form";
import type { getVideoSelectionMetrics, useVideoInteractionState } from "@/hooks/use-video-interaction-state";
import type { useVideoJobs } from "@/hooks/use-video-jobs";
import type { useVideoMedia } from "@/hooks/use-video-media";
import type { useVideoPlayback } from "@/hooks/use-video-playback";
import type { useVideoTimeline } from "@/hooks/use-video-timeline";
import { estimateVideoEta } from "@/lib/eta";
import { formatTime, imageSource, localAssetSrc } from "@/lib/media-utils";

type VideoWorkspaceProps = {
  videoInteraction: ReturnType<typeof useVideoInteractionState>;
  videoMetrics: ReturnType<typeof getVideoSelectionMetrics>;
  videoMedia: ReturnType<typeof useVideoMedia>;
  videoForm: ReturnType<typeof useVideoForm>;
  videoTimeline: ReturnType<typeof useVideoTimeline>;
  videoPlayback: ReturnType<typeof useVideoPlayback>;
  videoJobs: ReturnType<typeof useVideoJobs>;
  toolState: ReturnType<typeof useToolState>;
  filePickers: ReturnType<typeof useFilePickers>;
  modelCompare: ReturnType<typeof useModelCompare>;
  derivedState: ReturnType<typeof useDerivedUiState>;
  preferredModelDevice: string;
  log: string[];
  jobProgress: number;
  jobStep: string;
  appendLog: (message: string) => void;
};

export function VideoWorkspace({
  videoInteraction,
  videoMetrics,
  videoMedia,
  videoForm,
  videoTimeline,
  videoPlayback,
  videoJobs,
  toolState,
  filePickers,
  modelCompare,
  derivedState,
  preferredModelDevice,
  log,
  jobProgress,
  jobStep,
  appendLog,
}: VideoWorkspaceProps) {
  const videoSrc = localAssetSrc(videoMedia.inputPath);
  const eta = estimateVideoEta({
    action: videoForm.action,
    metadata: videoMedia.metadata,
    selectedDuration: videoMetrics.selectedDuration,
    selectedModel: videoForm.selectedModel,
    selectedRifeModel: videoForm.selectedRifeModel,
    selectedDevice: videoForm.selectedDevice,
    tileSize: videoForm.tileSize,
    threads: videoForm.threads,
    preferredModelDevice,
    devices: toolState.devices,
    rifeMultiplier: videoForm.rifeMultiplier,
    rifeTtaSpatial: videoForm.rifeTtaSpatial,
    rifeTtaTemporal: videoForm.rifeTtaTemporal,
    rifeUhd: videoForm.rifeUhd,
    faceFusionProcessor: videoForm.faceFusionProcessor,
    faceFusionProvider: videoForm.faceFusionProvider,
  });

  return (
    <section className="workspace">
      <VideoSidebar
        videoInteraction={videoInteraction}
        videoMetrics={videoMetrics}
        videoMedia={videoMedia}
        videoForm={videoForm}
        videoJobs={videoJobs}
        videoTimeline={videoTimeline}
        toolState={toolState}
        filePickers={filePickers}
        modelCompare={modelCompare}
        derivedState={derivedState}
        preferredModelDevice={preferredModelDevice}
      />
      <VideoPreview
        videoRef={videoInteraction.videoRef}
        timelineRef={videoInteraction.timelineRef}
        thumbnailGridRef={videoInteraction.thumbnailGridRef}
        videoSrc={videoSrc}
        isVideoMuted={videoInteraction.isVideoMuted}
        loopPlayback={videoInteraction.loopPlayback && !videoMetrics.shouldPlaySelection}
        metadata={videoMedia.metadata}
        isVideoPlaying={videoInteraction.isVideoPlaying}
        currentTime={videoMedia.currentTime}
        duration={videoMetrics.duration}
        visibleStart={videoTimeline.visibleStart}
        visibleDuration={videoTimeline.visibleDuration}
        visibleEnd={videoTimeline.visibleEnd}
        hoverPercent={videoTimeline.hoverPercent}
        timelineHoverTime={videoInteraction.timelineHoverTime}
        currentPercent={videoTimeline.currentPercent}
        trimStartPercent={videoTimeline.trimStartPercent}
        trimEndPercent={videoTimeline.trimEndPercent}
        thumbnails={videoMedia.thumbnails}
        trimStart={videoInteraction.trimStart}
        trimEnd={videoInteraction.trimEnd}
        selectedDuration={videoMetrics.selectedDuration}
        selectedFrames={videoMetrics.selectedFrames}
        onCanPlay={() => {
          if (videoInteraction.previewCanPlayLoggedRef.current) return;
          videoInteraction.previewCanPlayLoggedRef.current = true;
          appendLog("Preview video can play.");
        }}
        onError={videoPlayback.reportVideoError}
        onTimeUpdate={videoPlayback.handleVideoTimeUpdate}
        onPlay={() => videoInteraction.setIsVideoPlaying(true)}
        onPause={() => videoInteraction.setIsVideoPlaying(false)}
        onEnded={() => videoInteraction.setIsVideoPlaying(false)}
        onTogglePlayback={videoPlayback.togglePlayback}
        onToggleMute={videoPlayback.toggleMute}
        onUpdateTimelineHover={videoPlayback.updateTimelineHover}
        onClearTimelineHover={() => videoInteraction.setTimelineHoverTime(null)}
        onScrubTimeline={videoPlayback.scrubTimeline}
        onStartTrimDrag={videoPlayback.startTrimDrag}
        onUpdateTrimDrag={videoPlayback.updateTrimDrag}
        onStopTrimDrag={videoPlayback.stopTrimDrag}
        formatTime={formatTime}
        imageSource={imageSource}
      />
      <LogPanel lines={log} eta={eta} progress={jobProgress} step={jobStep} />
    </section>
  );
}
