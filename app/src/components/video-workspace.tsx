import { VideoEffectsComparison } from "@/components/previews/video-effects-comparison";
import { SubtitleCaption, SubtitleTimeline } from "@/components/transcription-tools";
import type { Transcription } from "@/hooks/use-transcription";
import { LogPanel } from "@/components/log-panel";
import { SwitchRow } from "@/components/app-controls";
import { GenerativePromptBox } from "@/components/generative-controls";
import { PreviewRangeActions } from "@/components/previews/video-player-shell";
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
import { formatTime, imageSource } from "@/lib/media-utils";

type VideoWorkspaceProps = {
  transcription: Transcription;
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
  onRetryToolChecks?: () => void;
  jobProgress: number;
  jobStep: string;
  appendLog: (message: string) => void;
};

export function VideoWorkspace({
  transcription,
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
  onRetryToolChecks,
  jobProgress,
  jobStep,
  appendLog,
}: VideoWorkspaceProps) {
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
        transcription={transcription}
        videoInteraction={videoInteraction}
        videoMetrics={videoMetrics}
        videoMedia={videoMedia}
        videoForm={videoForm}
        videoJobs={videoJobs}
        toolState={toolState}
        filePickers={filePickers}
        modelCompare={modelCompare}
        derivedState={derivedState}
        preferredModelDevice={preferredModelDevice} />
      <div className="preview-stack">
        <VideoPreview
          caption={<><SubtitleCaption tools={transcription} /><VideoEffectsComparison tools={transcription} videoRef={videoInteraction.videoRef} /></>}
          videoRef={videoInteraction.videoRef}
          timelineRef={videoInteraction.timelineRef}
          thumbnailGridRef={videoInteraction.thumbnailGridRef}
          videoSrc={videoMedia.previewSrc}
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
          waveformUrl={videoMedia.waveformUrl}
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
          previewSettings={
            <>
              <PreviewRangeActions
                medium="Video" isFitted={videoTimeline.isPreviewFitted} canFit={videoTimeline.canFitSelection}
                isLoading={videoMedia.isLoading} ready={Boolean(videoMedia.metadata)}
                onFit={() => void videoMedia.loadPreviewRange(videoInteraction.trimStart, videoInteraction.trimEnd)}
                onShowFull={() => void videoMedia.loadPreviewRange(0, videoMetrics.duration)} />
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
            </>
          }
          onUpdateTimelineHover={videoPlayback.updateTimelineHover}
          onClearTimelineHover={() => videoInteraction.setTimelineHoverTime(null)}
          onScrubTimeline={videoPlayback.scrubTimeline}
          onStartTrimDrag={videoPlayback.startTrimDrag}
          onUpdateTrimDrag={videoPlayback.updateTrimDrag}
          onStopTrimDrag={videoPlayback.stopTrimDrag}
          formatTime={formatTime}
          imageSource={imageSource} />
        <SubtitleTimeline tools={transcription} />
        {videoForm.action === "wan22_generate" && (
          <GenerativePromptBox
            prompt={videoForm.wan22Prompt}
            placeholder="Describe the video you want Wan2.2 to generate..."
            submitTitle="Generate video"
            isRunning={videoForm.isRunning}
            onPromptChange={videoForm.setWan22Prompt}
            onSubmit={videoJobs.runJob}
            onCancel={videoJobs.cancelWan22} />
        )}
        {videoForm.action === "wan21_generate" && (
          <GenerativePromptBox
            prompt={videoForm.wan21Prompt}
            placeholder="Describe the video you want Wan2.1 to generate..."
            submitTitle="Generate video"
            isRunning={videoForm.isRunning}
            onPromptChange={videoForm.setWan21Prompt}
            onSubmit={videoJobs.runJob}
            onCancel={videoJobs.cancelWan21} />
        )}
      </div>
      <LogPanel transcription={transcription} lines={log} onRetryToolChecks={onRetryToolChecks} eta={eta} progress={jobProgress} step={jobStep} />
    </section>
  );
}
