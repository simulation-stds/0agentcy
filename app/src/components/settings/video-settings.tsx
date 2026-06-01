import { PrimaryButton, SecondaryButton, StatusBadge, ToolAccordionItem } from "@/components/app-controls";
import type { SelectOption } from "@/components/app-controls";
import { FaceFusionToolSection, RealEsrganToolSection, RifeToolSection, SupirToolSection } from "@/components/settings/video-tool-sections";
import { Accordion } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FaceFusionStatus, SupirModel, SupirStatus, ToolStatus, ToolStorage } from "@/hooks/use-tool-state";
import { imageCodecToolCatalog, type ImageCodecTool, type ModelSettingsRow, type ModelTool } from "@/lib/app-options";

type RuntimeProviderOption = SelectOption & {
  provider: string;
};

type VideoSettingsProps = {
  tools: ToolStatus | null;
  tab: "editing" | "generative";
  expandedTool: string;
  realEsrganModelRows: ModelSettingsRow[];
  rifeModelRows: ModelSettingsRow[];
  realEsrganSummary: string;
  rifeSummary: string;
  basicRealEsrganModel: string;
  basicRifeModel: string;
  hasRealEsrganModels: boolean;
  hasRifeModels: boolean;
  isUpdatingEsrgan: boolean;
  isUpdatingRife: boolean;
  isUpdatingFaceFusion: boolean;
  hasRealEsrganUpdate: boolean;
  hasRifeUpdate: boolean;
  hasFaceFusionUpdate: boolean;
  faceFusionStatus: FaceFusionStatus | null;
  availableFaceFusionProviders: RuntimeProviderOption[];
  faceFusionRuntime: string;
  storageFor: (key: string) => ToolStorage | undefined;
  onSelectTab: (tab: "editing" | "generative") => void;
  onSetExpandedTool: (value: string) => void;
  onDeleteModel: (tool: ModelTool, model: string) => void;
  onDeleteAllModels: (tool: ModelTool) => void;
  onUpdateRealEsrgan: (models: string[]) => void;
  onUpdateRife: (models: string[]) => void;
  onOpenModelInstall: (tool: ModelTool) => void;
  onUpdateFaceFusion: () => void;
  onSetFaceFusionRuntime: (runtime: string) => void;
};

export function VideoSettings({
  tools,
  tab,
  expandedTool,
  realEsrganModelRows,
  rifeModelRows,
  realEsrganSummary,
  rifeSummary,
  basicRealEsrganModel,
  basicRifeModel,
  hasRealEsrganModels,
  hasRifeModels,
  isUpdatingEsrgan,
  isUpdatingRife,
  isUpdatingFaceFusion,
  hasRealEsrganUpdate,
  hasRifeUpdate,
  hasFaceFusionUpdate,
  faceFusionStatus,
  availableFaceFusionProviders,
  faceFusionRuntime,
  storageFor,
  onSelectTab,
  onSetExpandedTool,
  onDeleteModel,
  onDeleteAllModels,
  onUpdateRealEsrgan,
  onUpdateRife,
  onOpenModelInstall,
  onUpdateFaceFusion,
  onSetFaceFusionRuntime,
}: VideoSettingsProps) {
  return (
    <>
      <h2>Video</h2>
      <Tabs value={tab} onValueChange={(value) => onSelectTab(value as "editing" | "generative")} className="settings-inner-tabs-wrap">
        <TabsList variant="line" className="settings-inner-tabs" aria-label="Video model sections">
          <TabsTrigger value="editing">
            <span className="material-symbols-rounded" aria-hidden="true">edit</span>
            Editing
          </TabsTrigger>
          <TabsTrigger value="generative">
            <span className="material-symbols-rounded" aria-hidden="true">auto_awesome</span>
            Generative
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editing" className="settings-tab-content">
          <Accordion type="single" collapsible value={expandedTool} onValueChange={(value) => onSetExpandedTool(value || "")} className="settings-accordion">
            <RealEsrganToolSection
              tools={tools}
              rows={realEsrganModelRows}
              summary={realEsrganSummary}
              basicModel={basicRealEsrganModel}
              hasModels={hasRealEsrganModels}
              isUpdating={isUpdatingEsrgan}
              hasUpdate={hasRealEsrganUpdate}
              storageFor={storageFor}
              onDeleteModel={onDeleteModel}
              onDeleteAllModels={onDeleteAllModels}
              onUpdateModels={onUpdateRealEsrgan}
              onOpenModelInstall={onOpenModelInstall}
            />
            <RifeToolSection
              tools={tools}
              rows={rifeModelRows}
              summary={rifeSummary}
              basicModel={basicRifeModel}
              hasModels={hasRifeModels}
              isUpdating={isUpdatingRife}
              hasUpdate={hasRifeUpdate}
              storageFor={storageFor}
              onDeleteModel={onDeleteModel}
              onDeleteAllModels={onDeleteAllModels}
              onUpdateModels={onUpdateRife}
              onOpenModelInstall={onOpenModelInstall}
            />
          </Accordion>
        </TabsContent>

        <TabsContent value="generative" className="settings-tab-content">
          <Accordion type="single" collapsible value={expandedTool} onValueChange={(value) => onSetExpandedTool(value || "")} className="settings-accordion">
            <FaceFusionToolSection
              faceFusionStatus={faceFusionStatus}
              availableFaceFusionProviders={availableFaceFusionProviders}
              faceFusionRuntime={faceFusionRuntime}
              isUpdatingFaceFusion={isUpdatingFaceFusion}
              hasUpdate={hasFaceFusionUpdate}
              storageFor={storageFor}
              onUpdateFaceFusion={onUpdateFaceFusion}
              onSetFaceFusionRuntime={onSetFaceFusionRuntime}
            />
          </Accordion>
        </TabsContent>
      </Tabs>
    </>
  );
}

export function ModelPlaceholderSettings({
  title,
  tab,
  onSelectTab,
}: {
  title: string;
  tab: "editing" | "generative";
  onSelectTab: (tab: "editing" | "generative") => void;
}) {
  return (
    <>
      <h2>{title}</h2>
      <Tabs value={tab} onValueChange={(value) => onSelectTab(value as "editing" | "generative")} className="settings-inner-tabs-wrap">
        <TabsList variant="line" className="settings-inner-tabs" aria-label={`${title} model sections`}>
          <TabsTrigger value="editing">
            <span className="material-symbols-rounded" aria-hidden="true">edit</span>
            Editing
          </TabsTrigger>
          <TabsTrigger value="generative">
            <span className="material-symbols-rounded" aria-hidden="true">auto_awesome</span>
            Generative
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editing" className="settings-tab-content">
          <div className="service-card info">
            <span>{title}</span>
            <strong>Planned</strong>
            <code>Placeholder for editing tools.</code>
          </div>
        </TabsContent>

        <TabsContent value="generative" className="settings-tab-content">
          <div className="service-card info">
            <span>{title}</span>
            <strong>Planned</strong>
            <code>Placeholder for generative tools.</code>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

export function ImageModelSettings({
  tools,
  tab,
  expandedTool,
  supirStatus,
  supirModels,
  isUpdatingSupir,
  isUpdatingSupirXformers,
  hasSupirUpdate,
  hasSupirXformersUpdate,
  updatingImageCodecTool,
  imageCodecUpdates,
  activeSupirCheckpoint,
  storageFor,
  onSelectTab,
  onSetExpandedTool,
  onUpdateSupir,
  onUpdateSupirXformers,
  onUpdateImageCodecTool,
  onDeleteImageCodecTool,
  onDeleteSupirXformers,
  onImportSupirCheckpoint,
  onImportSupirCheckpointFromDownloads,
  onDownloadSupirCheckpoint,
  onDeleteSupirCheckpoint,
}: {
  tools: ToolStatus | null;
  tab: "editing" | "generative";
  expandedTool: string;
  supirStatus: SupirStatus | null;
  supirModels: SupirModel[];
  isUpdatingSupir: boolean;
  isUpdatingSupirXformers: boolean;
  hasSupirUpdate: boolean;
  hasSupirXformersUpdate: boolean;
  updatingImageCodecTool: ImageCodecTool | "";
  imageCodecUpdates: Record<ImageCodecTool, boolean>;
  activeSupirCheckpoint: string;
  storageFor: (key: string) => ToolStorage | undefined;
  onSelectTab: (tab: "editing" | "generative") => void;
  onSetExpandedTool: (value: string) => void;
  onUpdateSupir: () => void;
  onUpdateSupirXformers: () => void;
  onUpdateImageCodecTool: (tool: ImageCodecTool) => void;
  onDeleteImageCodecTool: (tool: ImageCodecTool) => void;
  onDeleteSupirXformers: () => void;
  onImportSupirCheckpoint: (sourcePath: string, checkpointName: string) => void;
  onImportSupirCheckpointFromDownloads: (checkpointName: string) => void;
  onDownloadSupirCheckpoint: (checkpointName: string) => void;
  onDeleteSupirCheckpoint: (checkpointName: string) => void;
}) {
  return (
    <>
      <h2>Image</h2>
      <Tabs value={tab} onValueChange={(value) => onSelectTab(value as "editing" | "generative")} className="settings-inner-tabs-wrap">
        <TabsList variant="line" className="settings-inner-tabs" aria-label="Image model sections">
          <TabsTrigger value="editing">
            <span className="material-symbols-rounded" aria-hidden="true">edit</span>
            Editing
          </TabsTrigger>
          <TabsTrigger value="generative">
            <span className="material-symbols-rounded" aria-hidden="true">auto_awesome</span>
            Generative
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editing" className="settings-tab-content">
          <Accordion type="single" collapsible value={expandedTool} onValueChange={(value) => onSetExpandedTool(value || "")} className="settings-accordion">
            {imageCodecToolCatalog.map((tool) => (
              <ImageCodecToolSection
                key={tool.key}
                tool={tool}
                tools={tools}
                storage={storageFor(tool.key)}
                isUpdating={updatingImageCodecTool === tool.key}
                hasUpdate={imageCodecUpdates[tool.key]}
                onUpdate={() => onUpdateImageCodecTool(tool.key)}
                onDelete={() => onDeleteImageCodecTool(tool.key)}
              />
            ))}
          </Accordion>
        </TabsContent>

        <TabsContent value="generative" className="settings-tab-content">
          <Accordion type="single" collapsible value={expandedTool} onValueChange={(value) => onSetExpandedTool(value || "")} className="settings-accordion">
            <SupirToolSection
              supirStatus={supirStatus}
              supirModels={supirModels}
              isUpdatingSupir={isUpdatingSupir}
              isUpdatingSupirXformers={isUpdatingSupirXformers}
              hasSupirUpdate={hasSupirUpdate}
              hasSupirXformersUpdate={hasSupirXformersUpdate}
              activeSupirCheckpoint={activeSupirCheckpoint}
              storageFor={storageFor}
              onUpdateSupir={onUpdateSupir}
              onUpdateSupirXformers={onUpdateSupirXformers}
              onDeleteSupirXformers={onDeleteSupirXformers}
              onImportSupirCheckpoint={onImportSupirCheckpoint}
              onImportSupirCheckpointFromDownloads={onImportSupirCheckpointFromDownloads}
              onDownloadSupirCheckpoint={onDownloadSupirCheckpoint}
              onDeleteSupirCheckpoint={onDeleteSupirCheckpoint}
            />
          </Accordion>
        </TabsContent>
      </Tabs>
    </>
  );
}

function ImageCodecToolSection({
  tool,
  tools,
  storage,
  isUpdating,
  hasUpdate,
  onUpdate,
  onDelete,
}: {
  tool: (typeof imageCodecToolCatalog)[number];
  tools: ToolStatus | null;
  storage: ToolStorage | undefined;
  isUpdating: boolean;
  hasUpdate: boolean;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const installedPath = tools?.[tool.key] || "";
  const installed = Boolean(installedPath);
  const summary = installed
    ? `Tool folder: ${storage?.currentLabel || "0 B"}`
    : `Estimated: ${storage?.estimatedInstallLabel || tool.estimate}`;

  return (
    <ToolAccordionItem
      value={tool.key}
      title={tool.label}
      badge={<StatusBadge tone={installed ? "installed" : "missing"}>{installed ? "Installed" : "Missing"}</StatusBadge>}
      summary={summary}
    >
      <p>{tool.description}</p>
      <p>Source: {tool.sourceLabel}. The app will use {tool.executableLabel} for image conversion and optimization workflows.</p>
      <div className="tool-dropdown-info">
        <code title={installedPath || `D:/W2DS/Tools/videomaxxxing/tools/${tool.key}`}>
          <span className="material-symbols-rounded" aria-hidden="true">folder</span>
          {installedPath || `D:/W2DS/Tools/videomaxxxing/tools/${tool.key}`}
        </code>
      </div>
      <div className="tool-dropdown-actions">
        {installed && hasUpdate && (
          <SecondaryButton disabled={isUpdating} onClick={onUpdate}>
            <span className="material-symbols-rounded" aria-hidden="true">sync</span>
            Update
          </SecondaryButton>
        )}
        {installed ? (
          <SecondaryButton disabled={isUpdating} onClick={onDelete}>
            <span className="material-symbols-rounded" aria-hidden="true">delete</span>
            Uninstall
          </SecondaryButton>
        ) : (
          <PrimaryButton disabled={isUpdating} onClick={onUpdate}>
            <span className="material-symbols-rounded" aria-hidden="true">download</span>
            Download
          </PrimaryButton>
        )}
      </div>
    </ToolAccordionItem>
  );
}
