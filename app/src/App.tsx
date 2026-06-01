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

function App() {
  const { log, appendLog, jobProgress, jobStep, resetJobProgress, setJobProgress, setJobStep } = useLog();
  const toolState = useToolState({ appendLog });
  const settingsState = useSettingsState();
  const appSettingsState = useAppSettings(appendLog);
  const { toolCategory, setToolCategory } = useToolCategory();
  const audioTools = useAudioTools({
    appendLog,
    resetJobProgress,
  });
  const imageTools = useImageTools({
    toolCategory,
    preferredModelDevice: appSettingsState.appSettings.preferredModelDevice,
    devices: toolState.devices,
    appendLog,
    resetJobProgress,
  });
  const videoController = useVideoWorkspaceController({
    appendLog,
    resetJobProgress,
    appSettingsState,
    toolState,
  });

  useAppLifecycle({ appendLog, setJobProgress, setJobStep });

  const { toolManagement, modelInstall } = useToolSetupController({
    appendLog,
    faceFusionRuntime: videoController.videoForm.faceFusionRuntime,
    toolState,
  });
  const { derivedState, filePickers, modelCompare, videoForm } = videoController;
  const lastNotificationLineRef = useRef("");

  useEffect(() => {
    if (!appSettingsState.appSettings.playNotifications || !log.length) return;
    const latest = log[log.length - 1] || "";
    if (!latest || latest === lastNotificationLineRef.current) return;
    lastNotificationLineRef.current = latest;

    const isFailure = /^(Job failed:|Audio failed:|SUPIR failed:)/i.test(latest);
    const isSuccess = /^(Done:|Audio complete:|SUPIR complete:)/i.test(latest);
    const soundUrl = isFailure ? failSoundUrl : isSuccess ? successSoundUrl : "";
    if (!soundUrl) return;

    const audio = new Audio(soundUrl);
    audio.volume = 0.85;
    void audio.play().catch(() => {
      // Browsers can block audio until the user interacts with the app.
    });
  }, [appSettingsState.appSettings.playNotifications, log]);

  return (
    <TooltipProvider>
      <main className={`app-shell ${appSettingsState.appSettings.showInfoIcons ? "" : "hide-info-icons"}`}>
        <AppHeader
          appVersion={appVersion}
          toolCategory={toolCategory}
          allServicesAvailable={derivedState.allServicesAvailable}
          onSetToolCategory={setToolCategory}
          onOpenSettings={() => settingsState.setIsSettingsOpen(true)}
        />

        {toolCategory === "video" && (
          <VideoWorkspace
            videoInteraction={videoController.videoInteraction}
            videoMetrics={videoController.videoMetrics}
            videoMedia={videoController.videoMedia}
            videoForm={videoController.videoForm}
            videoTimeline={videoController.videoTimeline}
            videoPlayback={videoController.videoPlayback}
            videoJobs={videoController.videoJobs}
            toolState={toolState}
            filePickers={filePickers}
            modelCompare={modelCompare}
            derivedState={derivedState}
            preferredModelDevice={appSettingsState.appSettings.preferredModelDevice}
            log={log}
            jobProgress={jobProgress}
            jobStep={jobStep}
            appendLog={appendLog}
          />
        )}
        {toolCategory === "image" && (
          <ImageWorkspace
            imageTools={imageTools}
            aspectRatios={aspectRatios}
            ditherAlgorithms={ditherAlgorithms}
            ditherAlgorithmHelp={ditherAlgorithmHelp(imageTools.ditherSettings.algorithm)}
            devices={toolState.devices}
            preferredModelDevice={appSettingsState.appSettings.preferredModelDevice}
            log={log}
            jobProgress={jobProgress}
            jobStep={jobStep}
          />
        )}

        {toolCategory === "audio" && (
          <AudioWorkspace
            audioTools={audioTools}
            log={log}
            jobProgress={jobProgress}
            jobStep={jobStep}
          />
        )}

        {modelCompare.isCompareOpen && (
          <ModelCompareDialog
            modelCompare={modelCompare}
            formatTime={formatTime}
            imageSource={imageSource}
          />
        )}

        {modelInstall.isModelInstallOpen && (
          <ModelInstallDialog
            modelInstall={modelInstall}
            isInstalling={toolManagement.isUpdatingEsrgan || toolManagement.isUpdatingRife}
          />
        )}

        <SettingsDialog
          settingsState={settingsState}
          appSettingsState={appSettingsState}
          filePickers={filePickers}
          toolManagement={toolManagement}
          modelInstall={modelInstall}
          derivedState={derivedState}
          toolState={toolState}
          videoForm={videoForm}
        />
      </main>
    </TooltipProvider>
  );
}

export default App;
