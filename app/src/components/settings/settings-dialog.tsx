import { VosrSettings } from "@/components/settings/vosr-settings";
import { SubtitleFontSettings } from "@/components/settings/subtitle-font-settings";
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { Transcription } from "@/hooks/use-transcription";
import { TranscriptionTools } from "@/components/transcription-tools";
import { AudioModelSettings } from "@/components/settings/audio-model-settings";
import type { useAudioModels } from "@/hooks/use-audio-models";
import { GeneralSettings } from "@/components/settings/general-settings";
import { MustHaveSettings } from "@/components/settings/must-have-settings";
import { SettingsSidebar } from "@/components/settings/settings-sidebar";
import { ImageModelSettings, ModelPlaceholderSettings, VideoSettings } from "@/components/settings/video-settings";
import type { useAppSettings } from "@/hooks/use-app-settings";
import type { useDerivedUiState } from "@/hooks/use-derived-ui-state";
import type { useFilePickers } from "@/hooks/use-file-pickers";
import type { useModelInstall } from "@/hooks/use-model-install";
import type { useSettingsState } from "@/hooks/use-settings-state";
import type { useToolManagement } from "@/hooks/use-tool-management";
import type { useToolState } from "@/hooks/use-tool-state";
import type { useVideoForm } from "@/hooks/use-video-form";
import {
  basicModelByTool,
  cudaDownloadUrl,
  cudnnDownloadUrl,
  gitDownloadUrl,
  installModelCatalog,
} from "@/lib/app-options";
import { createEmptyUpdateAvailability, type UpdateAvailability } from "@/lib/update-availability";

import { ToolCheckContext } from "@/components/settings/tool-check-context";
import { settingsTools } from "@/lib/tool-loading";

type SettingsDialogProps = {
  transcription: Transcription;
  audioModels: ReturnType<typeof useAudioModels>;
  settingsState: ReturnType<typeof useSettingsState>;
  appSettingsState: ReturnType<typeof useAppSettings>;
  filePickers: ReturnType<typeof useFilePickers>;
  toolManagement: ReturnType<typeof useToolManagement>;
  modelInstall: ReturnType<typeof useModelInstall>;
  derivedState: ReturnType<typeof useDerivedUiState>;
  toolState: ReturnType<typeof useToolState>;
  videoForm: ReturnType<typeof useVideoForm>;
};

export function SettingsDialog({
  transcription,
  audioModels,
  settingsState,
  appSettingsState,
  filePickers,
  toolManagement,
  modelInstall,
  derivedState,
  toolState,
  videoForm,
}: SettingsDialogProps) {
  const { tools, models, rifeModels, faceFusionStatus, flux2Status, wan21Status, wan22Status } = toolState;
  const [updateAvailability, setUpdateAvailability] = useState(createEmptyUpdateAvailability);
  const { ensureTool, ensureStorage } = toolState;
  const subtab = settingsState.settingsTab === "general" ? settingsState.generalTab : settingsState.settingsTab === "must" ? settingsState.mustHaveTab : settingsState.modelTab;
  const requested = settingsTools(settingsState.settingsTab, subtab);
  useEffect(() => {
    if (!settingsState.isSettingsOpen) return;
    for (const tool of settingsTools(settingsState.settingsTab, subtab)) void ensureTool(tool);
  }, [settingsState.isSettingsOpen, settingsState.settingsTab, subtab, ensureTool]);
  useEffect(() => {
    if (settingsState.isSettingsOpen && settingsState.expandedTool) void ensureStorage(settingsState.expandedTool);
  }, [settingsState.isSettingsOpen, settingsState.expandedTool, ensureStorage]);

  const failedTools = requested.filter(tool => toolState.checks[tool] === "failed");


  const checkUpdates = useCallback(async () => {
    await toolState.refreshToolState();
    try {
      setUpdateAvailability(await invoke<UpdateAvailability>("check_tool_updates"));
    } catch {
      setUpdateAvailability(createEmptyUpdateAvailability());
    }
  }, [toolState]);

  return (
    <Dialog open={settingsState.isSettingsOpen} onOpenChange={settingsState.setIsSettingsOpen}>
      <DialogContent className="settings-modal" showCloseButton>
        <DialogHeader className="settings-modal-header">
          <DialogTitle>App Settings</DialogTitle>
          <DialogDescription>Tools and setup</DialogDescription>
        </DialogHeader>

        <Tabs value={settingsState.settingsTab} onValueChange={settingsState.setSettingsTab} orientation="vertical" className="settings-layout">
          <SettingsSidebar onCheckUpdates={checkUpdates} />

          <ScrollArea className="settings-content-scroll">
            <ToolCheckContext.Provider value={{ checks: toolState.checks, retry: tool => { void toolState.refreshToolState([tool]); } }}>
            <div className="settings-content">
              {failedTools.length > 0 && (
                <button type="button" onClick={() => void toolState.refreshToolState(failedTools)}>Retry checks</button>
              )}
              <TabsContent value="general" className="settings-tab-content">

                <GeneralSettings
                  defaultDownloadFolder={appSettingsState.appSettings.defaultDownloadFolder}
                  tempFolder={appSettingsState.appSettings.tempFolder}
                  detectedDeviceRows={derivedState.detectedDeviceRows}
                  tab={settingsState.generalTab}
                  hasUnsavedChanges={appSettingsState.hasUnsavedSettings}
                  preferredModelDevice={appSettingsState.appSettings.preferredModelDevice}
                  playNotifications={appSettingsState.appSettings.playNotifications}
                  showInfoIcons={appSettingsState.appSettings.showInfoIcons}
                  onSelectTab={settingsState.selectGeneralTab}
                  onSetPreferredModelDevice={(device) => appSettingsState.updateAppSettings({ preferredModelDevice: device })}
                  onSetPlayNotifications={(checked) => appSettingsState.updateAppSettings({ playNotifications: checked })}
                  onSetShowInfoIcons={(checked) => appSettingsState.updateAppSettings({ showInfoIcons: checked })}
                  onChooseDefaultDownloadFolder={filePickers.chooseDefaultDownloadFolder}
                  onChooseTempFolder={filePickers.chooseTempFolder}
                  onFlushTempFolder={appSettingsState.flushTempFolder}
                  onSaveSettings={() => appSettingsState.saveSettings()} />

              </TabsContent>

              <TabsContent value="must" className="settings-tab-content">

                <MustHaveSettings
                  tools={tools}
                  tab={settingsState.mustHaveTab}
                  expandedTool={settingsState.expandedTool}
                  isUpdatingFfmpeg={toolManagement.isUpdatingFfmpeg}
                  isUpdatingImageMagick={toolManagement.isUpdatingImageMagick}
                  isUpdatingMiniforge={toolManagement.isUpdatingMiniforge}
                  hasFfmpegUpdate={updateAvailability.ffmpeg}
                  hasImageMagickUpdate={updateAvailability.imagemagick}
                  hasMiniforgeUpdate={updateAvailability.miniforge}
                  faceFusionStatus={faceFusionStatus}
                  cudaStatusClass={derivedState.cudaStatusClass as "installed" | "update" | "missing"}
                  cudaStatusLabel={derivedState.cudaStatusLabel}
                  hasUsableCuda={derivedState.hasUsableCuda}
                  hasCudaWarning={derivedState.hasCudaWarning}
                  cudaFolderLabel={derivedState.cudaFolderLabel}
                  cudnnStatusClass={derivedState.cudnnStatusClass as "installed" | "update" | "missing"}
                  cudnnStatusLabel={derivedState.cudnnStatusLabel}
                  hasCudnn={derivedState.hasCudnn}
                  cudnnFolderLabel={derivedState.cudnnFolderLabel}
                  gitDownloadUrl={gitDownloadUrl}
                  cudaDownloadUrl={cudaDownloadUrl}
                  cudnnDownloadUrl={cudnnDownloadUrl}
                  storageFor={derivedState.storageFor}
                  onSelectTab={settingsState.selectMustHaveTab}
                  onSetExpandedTool={settingsState.setExpandedTool}
                  onUpdateFfmpeg={toolManagement.updateFfmpeg}
                  onUpdateImageMagick={toolManagement.updateImageMagick}
                  onDeleteImageMagick={toolManagement.deleteImageMagick}
                  onUpdateMiniforge={toolManagement.updateMiniforge}
                  onChooseRuntimeFolder={filePickers.chooseRuntimeFolder}
                  onOpenExternalDownload={appSettingsState.openExternalDownload} />

              </TabsContent>

              <TabsContent value="video" className="settings-tab-content">

                <VideoSettings
                  tools={tools}
                  tab={settingsState.modelTab}
                  expandedTool={settingsState.expandedTool}
                  realEsrganModelRows={derivedState.realEsrganModelRows}
                  rifeModelRows={derivedState.rifeModelRows}
                  realEsrganSummary={derivedState.modelCountLabel(models.length, installModelCatalog.realesrgan.length)}
                  rifeSummary={derivedState.modelCountLabel(rifeModels.length, installModelCatalog.rife.length)}
                  basicRealEsrganModel={basicModelByTool.realesrgan}
                  basicRifeModel={basicModelByTool.rife}
                  hasRealEsrganModels={models.length > 0}
                  hasRifeModels={rifeModels.length > 0}
                  isUpdatingEsrgan={toolManagement.isUpdatingEsrgan}
                  isUpdatingRife={toolManagement.isUpdatingRife}
                  isUpdatingFaceFusion={toolManagement.isUpdatingFaceFusion}
                  isUpdatingWan21={toolManagement.isUpdatingWan21}
                  isUpdatingWan22={toolManagement.isUpdatingWan22}
                  hasRealEsrganUpdate={updateAvailability.realesrgan}
                  hasRifeUpdate={updateAvailability.rife}
                  hasFaceFusionUpdate={updateAvailability.facefusion}
                  hasWan21Update={updateAvailability.wan21}
                  hasWan22Update={updateAvailability.wan22}
                  faceFusionStatus={faceFusionStatus}
                  wan21Status={wan21Status}
                  wan22Status={wan22Status}
                  availableFaceFusionProviders={derivedState.availableFaceFusionProviders}
                  faceFusionRuntime={videoForm.faceFusionRuntime}
                  storageFor={derivedState.storageFor}
                  onSelectTab={settingsState.selectModelTab}
                  onSetExpandedTool={settingsState.setExpandedTool}
                  onDeleteModel={toolManagement.deleteModel}
                  onDeleteAllModels={toolManagement.deleteAllModels}
                  onUpdateRealEsrgan={toolManagement.updateRealEsrgan}
                  onUpdateRife={toolManagement.updateRife}
                  onOpenModelInstall={modelInstall.openModelInstall}
                  onUpdateFaceFusion={toolManagement.updateFaceFusion}
                  onUpdateWan21={toolManagement.updateWan21}
                  onDeleteWan21={toolManagement.deleteWan21}
                  onUpdateWan22={toolManagement.updateWan22}
                  onDeleteWan22={toolManagement.deleteWan22}
                  onSetFaceFusionRuntime={videoForm.setFaceFusionRuntime} />

              </TabsContent>

              <TabsContent value="image" className="settings-tab-content">

                <ImageModelSettings
                  vosrSettings={<VosrSettings status={toolState.vosrStatus}
                    installing={toolManagement.isInstallingVosr}
                    onInstall={toolManagement.installVosr}
                    onCancel={() => { void invoke("cancel_vosr").catch(() => {}); }} />}
                  tools={tools}
                  tab={settingsState.modelTab}
                  expandedTool={settingsState.expandedTool}
                  flux2Status={flux2Status}
                  isUpdatingFlux2={toolManagement.isUpdatingFlux2}
                  hasFlux2Update={updateAvailability.flux2}
                  updatingImageCodecTool={toolManagement.updatingImageCodecTool}
                  imageCodecUpdates={{
                    oxipng: updateAvailability.oxipng,
                    libavif: updateAvailability.libavif,
                    libwebp: updateAvailability.libwebp,
                    mozjpeg: updateAvailability.mozjpeg,
                  }}
                  storageFor={derivedState.storageFor}
                  onSelectTab={settingsState.selectModelTab}
                  onSetExpandedTool={settingsState.setExpandedTool}
                  onUpdateFlux2={toolManagement.updateFlux2}
                  onUpdateImageCodecTool={toolManagement.updateImageCodecTool}
                  onDeleteImageCodecTool={toolManagement.deleteImageCodecTool} />

              </TabsContent>

              <TabsContent value="fonts" className="settings-tab-content"><SubtitleFontSettings tools={transcription} /></TabsContent>
              <TabsContent value="audio" className="settings-tab-content">

                <ModelPlaceholderSettings title="Audio" tab={settingsState.modelTab} onSelectTab={settingsState.selectModelTab}
                  editing={<><AudioModelSettings audioModels={audioModels} /><TranscriptionTools tools={transcription} installationOnly /></>} />

              </TabsContent>
            </div>
            </ToolCheckContext.Provider>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
