import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent } from "@/components/ui/tabs";
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

type SettingsDialogProps = {
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
  settingsState,
  appSettingsState,
  filePickers,
  toolManagement,
  modelInstall,
  derivedState,
  toolState,
  videoForm,
}: SettingsDialogProps) {
  const { tools, models, rifeModels, faceFusionStatus, supirStatus, supirModels } = toolState;
  const [updateAvailability, setUpdateAvailability] = useState(createEmptyUpdateAvailability);

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
            <div className="settings-content">
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
                  onSaveSettings={() => appSettingsState.saveSettings()}
                />
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
                  onOpenExternalDownload={appSettingsState.openExternalDownload}
                />
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
                  hasRealEsrganUpdate={updateAvailability.realesrgan}
                  hasRifeUpdate={updateAvailability.rife}
                  hasFaceFusionUpdate={updateAvailability.facefusion}
                  faceFusionStatus={faceFusionStatus}
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
                  onSetFaceFusionRuntime={videoForm.setFaceFusionRuntime}
                />
              </TabsContent>

              <TabsContent value="image" className="settings-tab-content">
                <ImageModelSettings
                  tools={tools}
                  tab={settingsState.modelTab}
                  expandedTool={settingsState.expandedTool}
                  supirStatus={supirStatus}
                  supirModels={supirModels}
                  isUpdatingSupir={toolManagement.isUpdatingSupir}
                  isUpdatingSupirXformers={toolManagement.isUpdatingSupirXformers}
                  hasSupirUpdate={updateAvailability.supir}
                  hasSupirXformersUpdate={updateAvailability.supirXformers}
                  updatingImageCodecTool={toolManagement.updatingImageCodecTool}
                  imageCodecUpdates={{
                    oxipng: updateAvailability.oxipng,
                    libavif: updateAvailability.libavif,
                    libwebp: updateAvailability.libwebp,
                    mozjpeg: updateAvailability.mozjpeg,
                  }}
                  activeSupirCheckpoint={toolManagement.activeSupirCheckpoint}
                  storageFor={derivedState.storageFor}
                  onSelectTab={settingsState.selectModelTab}
                  onSetExpandedTool={settingsState.setExpandedTool}
                  onUpdateSupir={toolManagement.updateSupir}
                  onUpdateSupirXformers={toolManagement.updateSupirXformers}
                  onUpdateImageCodecTool={toolManagement.updateImageCodecTool}
                  onDeleteImageCodecTool={toolManagement.deleteImageCodecTool}
                  onDeleteSupirXformers={toolManagement.deleteSupirXformers}
                  onImportSupirCheckpoint={toolManagement.importSupirCheckpoint}
                  onImportSupirCheckpointFromDownloads={toolManagement.importSupirCheckpointFromDownloads}
                  onDownloadSupirCheckpoint={toolManagement.downloadSupirCheckpoint}
                  onDeleteSupirCheckpoint={toolManagement.deleteSupirCheckpoint}
                />
              </TabsContent>

              <TabsContent value="audio" className="settings-tab-content">
                <ModelPlaceholderSettings title="Audio" tab={settingsState.modelTab} onSelectTab={settingsState.selectModelTab} />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
