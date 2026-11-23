import { MustHaveEnvironmentsSection, MustHaveGpuSection, MustHaveToolsSection } from "@/components/settings/must-have-sections";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FaceFusionStatus, ToolStatus, ToolStorage } from "@/hooks/use-tool-state";
import { Box, MonitorCog, RefreshCw } from "lucide-react";

type MustHaveSettingsProps = {
  tools: ToolStatus | null;
  tab: "tools" | "environments" | "gpu";
  expandedTool: string;
  isUpdatingFfmpeg: boolean;
  isUpdatingImageMagick: boolean;
  isUpdatingMiniforge: boolean;
  hasFfmpegUpdate: boolean;
  hasImageMagickUpdate: boolean;
  hasMiniforgeUpdate: boolean;
  faceFusionStatus: FaceFusionStatus | null;
  cudaStatusClass: "installed" | "update" | "missing";
  cudaStatusLabel: string;
  hasUsableCuda: boolean;
  hasCudaWarning: boolean;
  cudaFolderLabel: string;
  cudnnStatusClass: "installed" | "update" | "missing";
  cudnnStatusLabel: string;
  hasCudnn: boolean;
  cudnnFolderLabel: string;
  gitDownloadUrl: string;
  cudaDownloadUrl: string;
  cudnnDownloadUrl: string;
  storageFor: (key: string) => ToolStorage | undefined;
  onSelectTab: (tab: "tools" | "environments" | "gpu") => void;
  onSetExpandedTool: (value: string) => void;
  onUpdateFfmpeg: () => void;
  onUpdateImageMagick: () => void;
  onDeleteImageMagick: () => void;
  onUpdateMiniforge: () => void;
  onChooseRuntimeFolder: (key: "cudaBinFolder" | "cudnnBinFolder") => void;
  onOpenExternalDownload: (url: string) => void;
};

export function MustHaveSettings({
  tools,
  tab,
  expandedTool,
  isUpdatingFfmpeg,
  isUpdatingImageMagick,
  isUpdatingMiniforge,
  hasFfmpegUpdate,
  hasImageMagickUpdate,
  hasMiniforgeUpdate,
  faceFusionStatus,
  cudaStatusClass,
  cudaStatusLabel,
  hasUsableCuda,
  hasCudaWarning,
  cudaFolderLabel,
  cudnnStatusClass,
  cudnnStatusLabel,
  hasCudnn,
  cudnnFolderLabel,
  gitDownloadUrl,
  cudaDownloadUrl,
  cudnnDownloadUrl,
  storageFor,
  onSelectTab,
  onSetExpandedTool,
  onUpdateFfmpeg,
  onUpdateImageMagick,
  onDeleteImageMagick,
  onUpdateMiniforge,
  onChooseRuntimeFolder,
  onOpenExternalDownload,
}: MustHaveSettingsProps) {
  return (
    <>
      <h2>Must haves</h2>
      <Tabs value={tab} onValueChange={(value) => onSelectTab(value as "tools" | "environments" | "gpu")} className="settings-inner-tabs-wrap">
        <TabsList variant="line" className="settings-inner-tabs" aria-label="Must haves sections">
          <TabsTrigger value="tools">
            <Box className="app-icon" />
            Tools
          </TabsTrigger>
          <TabsTrigger value="environments">
            <RefreshCw className="app-icon" />
            Environments
          </TabsTrigger>
          <TabsTrigger value="gpu">
            <MonitorCog className="app-icon" />
            GPU Processing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tools" className="settings-tab-content">
          <MustHaveToolsSection
            tools={tools}
            expandedTool={expandedTool}
            isUpdatingFfmpeg={isUpdatingFfmpeg}
            isUpdatingImageMagick={isUpdatingImageMagick}
            hasFfmpegUpdate={hasFfmpegUpdate}
            hasImageMagickUpdate={hasImageMagickUpdate}
            storageFor={storageFor}
            onSetExpandedTool={onSetExpandedTool}
            onUpdateFfmpeg={onUpdateFfmpeg}
            onUpdateImageMagick={onUpdateImageMagick}
            onDeleteImageMagick={onDeleteImageMagick} />
        </TabsContent>

        <TabsContent value="environments" className="settings-tab-content">
          <MustHaveEnvironmentsSection
            tools={tools}
            expandedTool={expandedTool}
            isUpdatingMiniforge={isUpdatingMiniforge}
            hasMiniforgeUpdate={hasMiniforgeUpdate}
            faceFusionStatus={faceFusionStatus}
            gitDownloadUrl={gitDownloadUrl}
            storageFor={storageFor}
            onSetExpandedTool={onSetExpandedTool}
            onUpdateMiniforge={onUpdateMiniforge}
            onOpenExternalDownload={onOpenExternalDownload} />
        </TabsContent>

        <TabsContent value="gpu" className="settings-tab-content">
          <MustHaveGpuSection
            expandedTool={expandedTool}
            cudaStatusClass={cudaStatusClass}
            cudaStatusLabel={cudaStatusLabel}
            hasUsableCuda={hasUsableCuda}
            hasCudaWarning={hasCudaWarning}
            cudaFolderLabel={cudaFolderLabel}
            cudnnStatusClass={cudnnStatusClass}
            cudnnStatusLabel={cudnnStatusLabel}
            hasCudnn={hasCudnn}
            cudnnFolderLabel={cudnnFolderLabel}
            cudaDownloadUrl={cudaDownloadUrl}
            cudnnDownloadUrl={cudnnDownloadUrl}
            onSetExpandedTool={onSetExpandedTool}
            onChooseRuntimeFolder={onChooseRuntimeFolder}
            onOpenExternalDownload={onOpenExternalDownload} />
        </TabsContent>
      </Tabs>
    </>
  );
}
