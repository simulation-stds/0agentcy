import { useEffect, useRef } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppHeader } from "@/components/app-header";
import { AudioWorkspace } from "@/components/audio-workspace";
import { ImageWorkspace } from "@/components/image-workspace";
import { ModelCompareDialog } from "@/components/previews/model-compare-dialog";
import { ModelInstallDialog } from "@/components/settings/model-install-dialog";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { VideoWorkspace } from "@/components/video-workspace";
import { useAppLifecycle } from "@/hooks/use-app-lifecycle";
import { useAppSettings } from "@/hooks/use-app-settings";
import { isAudioModel, useAudioModels } from "@/hooks/use-audio-models";
import { useAudioTools } from "@/hooks/use-audio-tools";
import { useImageTools } from "@/hooks/use-image-tools";
import { useLog } from "@/hooks/use-log";
import { useSettingsState } from "@/hooks/use-settings-state";
import { useToolCategory } from "@/hooks/use-tool-category";
import { useToolSetupController } from "@/hooks/use-tool-setup-controller";
import { useToolState } from "@/hooks/use-tool-state";
import { useVideoWorkspaceController } from "@/hooks/use-video-workspace-controller";
import { appVersion, aspectRatios, ditherAlgorithmHelp, ditherAlgorithms } from "@/lib/app-options";
import { formatTime, imageSource } from "@/lib/media-utils";
import failSoundUrl from "@/assets/sounds/fail.wav";
import successSoundUrl from "@/assets/sounds/success.wav";
import "./App.css";
import { useTranscription } from "@/hooks/use-transcription";
import { actionTools } from "@/lib/tool-loading";

function App() {
  const { log, notification, appendLog, jobProgress, jobStep, resetJobProgress, setJobProgress, setJobStep } = useLog();
  const toolState = useToolState({ appendLog });
  const settingsState = useSettingsState();
  const appSettingsState = useAppSettings(appendLog);
  const { toolCategory, setToolCategory } = useToolCategory();
  const audioModels = useAudioModels();
  const audioTools = useAudioTools({
    appendLog,
    resetJobProgress,
  });
  const { refresh: refreshAudioModel } = audioModels;
  const audioAction = audioTools.action;
  useEffect(() => {
    if (toolCategory === "audio" && isAudioModel(audioAction)) void refreshAudioModel(audioAction);
  }, [audioAction, refreshAudioModel, toolCategory]);
  const imageTools = useImageTools({
    toolCategory,
    preferredModelDevice: appSettingsState.appSettings.preferredModelDevice,
    appendLog,
    resetJobProgress,
  });
  const videoController = useVideoWorkspaceController({
    appendLog,
    resetJobProgress,
    appSettingsState,
    toolState,
  });

  const transcription = useTranscription({
    enabled: (toolCategory === "audio" && audioTools.action === "transcribe") || (toolCategory === "video" && videoController.videoForm.action === "transcribe") || (settingsState.isSettingsOpen && settingsState.settingsTab === "audio"),
    frame: toolCategory === "video" && videoController.videoMedia.metadata ? {
      width: Math.abs(videoController.videoMedia.metadata.rotation ?? 0) % 180 === 90 ? videoController.videoMedia.metadata.height : videoController.videoMedia.metadata.width,
      height: Math.abs(videoController.videoMedia.metadata.rotation ?? 0) % 180 === 90 ? videoController.videoMedia.metadata.width : videoController.videoMedia.metadata.height,
    } : undefined,
    source: toolCategory === "audio" ? audioTools.audioPath : videoController.videoMedia.inputPath,
    duration: toolCategory === "audio" ? audioTools.metadata?.duration ?? 0 : videoController.videoMetrics.duration,
    start: toolCategory === "audio" ? audioTools.trimStart : videoController.videoInteraction.trimStart,
    end: toolCategory === "audio" ? audioTools.trimEnd : videoController.videoInteraction.trimEnd,
    currentTime: toolCategory === "audio" ? audioTools.currentTime : videoController.videoMedia.currentTime,
    seek: toolCategory === "audio" ? audioTools.seekTo : videoController.videoPlayback.seek,
    blocked: audioTools.isRunning || videoController.videoForm.isRunning || audioTools.isLoading || videoController.videoMedia.isLoading,
  }, appendLog);

  useAppLifecycle({ appendLog, setJobProgress, setJobStep });

  const { toolManagement, modelInstall } = useToolSetupController({
    appendLog,
    faceFusionRuntime: videoController.videoForm.faceFusionRuntime,
    toolState,
  });
  const { derivedState, filePickers, modelCompare, videoForm } = videoController;
  const lastNotificationIdRef = useRef(0);
  const { ensureTool } = toolState;
  const requiredTools = actionTools(toolCategory, toolCategory === "video" ? videoForm.action : imageTools.imageAction, (videoController.videoMedia.isLoading || Boolean(videoController.videoMedia.metadata)), imageTools.compressorSettings.format);
  const pendingTools = requiredTools.filter(tool => toolState.checks[tool] !== "checked");
  const failedTools = pendingTools.filter(tool => toolState.checks[tool] === "failed");
  const retryToolChecks = failedTools.length ? () => { void toolState.refreshToolState(failedTools); } : undefined;
  const runtimeSettingsKey = JSON.stringify([appSettingsState.savedAppSettings.cudaBinFolder, appSettingsState.savedAppSettings.cudnnBinFolder]);
  const previousRuntimeSettings = useRef(runtimeSettingsKey);
  useEffect(() => {
    if (previousRuntimeSettings.current === runtimeSettingsKey) return;
    previousRuntimeSettings.current = runtimeSettingsKey;
    void toolState.refreshToolState();
  }, [runtimeSettingsKey, toolState.refreshToolState]);

  useEffect(() => {
    const action = toolCategory === "video" ? videoForm.action : imageTools.imageAction;
    for (const tool of actionTools(toolCategory, action, (videoController.videoMedia.isLoading || Boolean(videoController.videoMedia.metadata)), imageTools.compressorSettings.format)) {
      void ensureTool(tool);
    }
  }, [toolCategory, videoForm.action, imageTools.imageAction, videoController.videoMedia.isLoading, videoController.videoMedia.metadata, imageTools.compressorSettings.format, ensureTool]);


  useEffect(() => {
    if (!notification || notification.id === lastNotificationIdRef.current) return;
    lastNotificationIdRef.current = notification.id;
    if (!appSettingsState.appSettings.playNotifications) return;
    const soundUrl = notification.outcome === "failure" ? failSoundUrl : successSoundUrl;

    const audio = new Audio(soundUrl);
    audio.volume = 0.85;
    void audio.play().catch(() => {
      // Browsers can block audio until the user interacts with the app.
    });
  }, [appSettingsState.appSettings.playNotifications, notification]);

  return (
    <TooltipProvider>
      <main className={`app-shell ${appSettingsState.appSettings.showInfoIcons ? "" : "hide-info-icons"}`}>
        <AppHeader
          appVersion={appVersion}
          toolCategory={toolCategory}
          allServicesAvailable={derivedState.allServicesAvailable}
          toolsChecked={["ffmpeg", "ffprobe", "git", "conda", "realesrgan", "rife"].every(key => toolState.checks[key] === "checked")}
          onSetToolCategory={setToolCategory}
          onOpenSettings={() => settingsState.setIsSettingsOpen(true)} />

        {toolCategory === "video" && (
          <VideoWorkspace
            transcription={transcription}
            videoInteraction={videoController.videoInteraction}
            videoMetrics={videoController.videoMetrics}
            videoMedia={videoController.videoMedia}
            videoForm={videoController.videoForm}
            videoTimeline={videoController.videoTimeline}
            videoPlayback={videoController.videoPlayback}
            videoJobs={{ ...videoController.videoJobs, runJob: async () => {
              if (pendingTools.some(tool => tool !== "devices")) {
                appendLog("Wait for the selected tool check to finish, or retry it if it failed.");
                return;
              }
              await videoController.videoJobs.runJob();
            } }}
            toolState={toolState}
            filePickers={filePickers}
            modelCompare={modelCompare}
            derivedState={derivedState}
            preferredModelDevice={appSettingsState.appSettings.preferredModelDevice}
            log={log}
            onRetryToolChecks={retryToolChecks}
            jobProgress={jobProgress}
            jobStep={jobStep}
            appendLog={appendLog} />
        )}
        {toolCategory === "image" && (
          <ImageWorkspace
            imageTools={imageTools}
            vosrReady={Boolean(toolState.vosrStatus?.runtimeReady && toolState.vosrStatus.cudaReady)}
            vosrDevices={toolState.vosrStatus?.cudaDevices ?? []}
            vosrMessage={toolState.vosrStatus?.message}
            vosrInstalling={toolManagement.isInstallingVosr}
            aspectRatios={aspectRatios}
            ditherAlgorithms={ditherAlgorithms}
            ditherAlgorithmHelp={ditherAlgorithmHelp(imageTools.ditherSettings.algorithm)}
            devices={toolState.devices}
            preferredModelDevice={appSettingsState.appSettings.preferredModelDevice}
            log={log}
            onRetryToolChecks={retryToolChecks}
            jobProgress={jobProgress}
            jobStep={jobStep} />
        )}

        {toolCategory === "audio" && (
          <AudioWorkspace
            transcription={transcription}
            audioTools={audioTools}
            modelReady={isAudioModel(audioAction) && Boolean(audioModels.statuses[audioAction]?.installed) && !audioModels.busy}
            onOpenAudioSettings={() => {
              settingsState.setSettingsTab("audio");
              settingsState.selectModelTab("editing");
              settingsState.setIsSettingsOpen(true);
            }}
            log={log}
            onRetryToolChecks={retryToolChecks}
            jobProgress={jobProgress}
            jobStep={jobStep} />
        )}

        {modelCompare.isCompareOpen && (
          <ModelCompareDialog
            modelCompare={modelCompare}
            formatTime={formatTime}
            imageSource={imageSource} />
        )}

        {modelInstall.isModelInstallOpen && (
          <ModelInstallDialog
            modelInstall={modelInstall}
            isInstalling={toolManagement.isUpdatingEsrgan || toolManagement.isUpdatingRife} />
        )}

        <SettingsDialog
          transcription={transcription}
          audioModels={audioModels}
          settingsState={settingsState}
          appSettingsState={appSettingsState}
          filePickers={filePickers}
          toolManagement={toolManagement}
          modelInstall={modelInstall}
          derivedState={derivedState}
          toolState={toolState}
          videoForm={videoForm} />
      </main>
    </TooltipProvider>
  );
}

export default App;
