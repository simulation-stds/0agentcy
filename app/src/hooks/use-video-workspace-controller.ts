import { useEffect } from "react";
import type { useAppSettings } from "@/hooks/use-app-settings";
import type { useToolState } from "@/hooks/use-tool-state";
import { useDerivedUiState } from "@/hooks/use-derived-ui-state";
import { useFilePickers } from "@/hooks/use-file-pickers";
import { useModelCompare } from "@/hooks/use-model-compare";
import { useVideoForm } from "@/hooks/use-video-form";
import { getVideoSelectionMetrics, useVideoInteractionState } from "@/hooks/use-video-interaction-state";
import { useVideoJobs } from "@/hooks/use-video-jobs";
import { useVideoMedia } from "@/hooks/use-video-media";
import { useVideoPlayback } from "@/hooks/use-video-playback";
import { useVideoTimeline } from "@/hooks/use-video-timeline";
import { defaultModelDevice } from "@/lib/model-devices";

type UseVideoWorkspaceControllerArgs = {
  appendLog: (message: string) => void;
  resetJobProgress: () => void;
  appSettingsState: ReturnType<typeof useAppSettings>;
  toolState: ReturnType<typeof useToolState>;
};

export function useVideoWorkspaceController({
  appendLog,
  resetJobProgress,
  appSettingsState,
  toolState,
}: UseVideoWorkspaceControllerArgs) {
  const videoInteraction = useVideoInteractionState();
  const { models, rifeModels } = toolState;
  const { appSettings } = appSettingsState;
  const videoMedia = useVideoMedia({
    videoRef: videoInteraction.videoRef,
    previewCanPlayLoggedRef: videoInteraction.previewCanPlayLoggedRef,
    appendLog,
    resetJobProgress,
    setTimelineHoverTime: videoInteraction.setTimelineHoverTime,
    setIsVideoPlaying: videoInteraction.setIsVideoPlaying,
    setTrimStart: videoInteraction.setTrimStart,
    setTrimEnd: videoInteraction.setTrimEnd,
  });
  const videoForm = useVideoForm({
    inputPath: videoMedia.inputPath,
    models,
    rifeModels,
  });
  const filePickers = useFilePickers({
    appSettings,
    setAppSettings: appSettingsState.setAppSettings,
    saveSettings: appSettingsState.saveSettings,
    appendLog,
  });

  useEffect(() => {
    videoForm.setSelectedDevice(defaultModelDevice(appSettings.preferredModelDevice));
  }, [appSettings.preferredModelDevice, videoForm.setSelectedDevice]);

  const videoMetrics = getVideoSelectionMetrics(
    videoMedia.metadata,
    videoInteraction.trimStart,
    videoInteraction.trimEnd,
    videoInteraction.playSelectionOnly,
  );
  const videoTimeline = useVideoTimeline({
    duration: videoMetrics.duration,
    previewStart: videoMedia.previewStart,
    previewEnd: videoMedia.previewEnd,
    selectedDuration: videoMetrics.selectedDuration,
    trimStart: videoInteraction.trimStart,
    trimEnd: videoInteraction.trimEnd,
    currentTime: videoMedia.currentTime,
    timelineHoverTime: videoInteraction.timelineHoverTime,
    timelineRef: videoInteraction.timelineRef,
    thumbnailGridRef: videoInteraction.thumbnailGridRef,
  });
  const videoPlayback = useVideoPlayback({
    videoRef: videoInteraction.videoRef,
    selectionSeekInProgressRef: videoInteraction.selectionSeekInProgressRef,
    duration: videoMetrics.duration,
    shouldPlaySelection: videoMetrics.shouldPlaySelection,
    loopPlayback: videoInteraction.loopPlayback,
    trimStart: videoInteraction.trimStart,
    trimEnd: videoInteraction.trimEnd,
    currentTime: videoMedia.currentTime,
    previewStart: videoMedia.previewStart,
    previewEnd: videoMedia.previewEnd,
    timelineTimeFromClientX: videoTimeline.timelineTimeFromClientX,
    setCurrentTime: videoMedia.setCurrentTime,
    setIsVideoMuted: videoInteraction.setIsVideoMuted,
    setTimelineHoverTime: videoInteraction.setTimelineHoverTime,
    setIsVideoPlaying: videoInteraction.setIsVideoPlaying,
    setTrimStart: videoInteraction.setTrimStart,
    setTrimEnd: videoInteraction.setTrimEnd,
    setPreviewStart: videoMedia.setPreviewStart,
    setPreviewEnd: videoMedia.setPreviewEnd,
    appendLog,
  });
  const videoJobs = useVideoJobs({
    metadata: videoMedia.metadata,
    inputPath: videoMedia.inputPath,
    currentTime: videoMedia.currentTime,
    videoForm,
    videoInteraction,
    preferredModelDevice: appSettings.preferredModelDevice,
    devices: toolState.devices,
    faceFusionSourcePath: filePickers.faceFusionSourcePath,
    appendLog,
    resetJobProgress,
  });
  const modelCompare = useModelCompare({
    metadata: videoMedia.metadata,
    inputPath: videoMedia.inputPath,
    currentTime: videoMedia.currentTime,
    selectedDevice: videoForm.selectedDevice,
    preferredModelDevice: appSettings.preferredModelDevice,
    tileSize: videoForm.tileSize,
    threads: videoForm.threads,
    appendLog,
  });
  const derivedState = useDerivedUiState({
    appSettings,
    selectedModel: videoForm.selectedModel,
    selectedFrames: videoMetrics.selectedFrames,
    rifeMultiplier: videoForm.rifeMultiplier,
    models,
    rifeModels,
    devices: toolState.devices,
    faceFusionStatus: toolState.faceFusionStatus,
    faceFusionProvider: videoForm.faceFusionProvider,
    setFaceFusionProvider: videoForm.setFaceFusionProvider,
    tools: toolState.tools,
    toolStorage: toolState.toolStorage,
  });

  return {
    videoInteraction,
    videoMetrics,
    videoMedia,
    videoForm,
    filePickers,
    videoTimeline,
    videoPlayback,
    videoJobs,
    modelCompare,
    derivedState,
  };
}
