import type { ReactNode } from "react";
import { PrimaryButton, SecondaryButton, StatusBadge, ToolAccordionItem } from "@/components/app-controls";
import type { SelectOption } from "@/components/app-controls";
import { FaceFusionToolSection, Flux2ToolSection, RealEsrganToolSection, RifeToolSection, Wan21ToolSection, Wan22ToolSection } from "@/components/settings/video-tool-sections";
import { Accordion } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FaceFusionStatus, Flux2Status, ToolStatus, ToolStorage, Wan21Status, Wan22Status } from "@/hooks/use-tool-state";
import { imageCodecToolCatalog, type ImageCodecTool, type ModelSettingsRow, type ModelTool } from "@/lib/app-options";
import { Brush, Download, Folder, RefreshCw, Sparkles, Trash2 } from "lucide-react";

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
  isUpdatingWan21: boolean;
  isUpdatingWan22: boolean;
  hasRealEsrganUpdate: boolean;
  hasRifeUpdate: boolean;
  hasFaceFusionUpdate: boolean;
  hasWan21Update: boolean;
  hasWan22Update: boolean;
  faceFusionStatus: FaceFusionStatus | null;
  wan21Status: Wan21Status | null;
  wan22Status: Wan22Status | null;
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
  onUpdateWan21: () => void;
  onDeleteWan21: () => void;
  onUpdateWan22: () => void;
  onDeleteWan22: () => void;
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
  isUpdatingWan21,
  isUpdatingWan22,
  hasRealEsrganUpdate,
  hasRifeUpdate,
  hasFaceFusionUpdate,
  hasWan21Update,
  hasWan22Update,
  faceFusionStatus,
  wan21Status,
  wan22Status,
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
  onUpdateWan21,
  onDeleteWan21,
  onUpdateWan22,
  onDeleteWan22,
  onSetFaceFusionRuntime,
}: VideoSettingsProps) {
  return (
    <>
      <h2>Video</h2>
      <Tabs value={tab} onValueChange={(value) => onSelectTab(value as "editing" | "generative")} className="settings-inner-tabs-wrap">
        <TabsList variant="line" className="settings-inner-tabs" aria-label="Video model sections">
          <TabsTrigger value="editing">
            <Brush className="app-icon" />
            Editing
          </TabsTrigger>
          <TabsTrigger value="generative">
            <Sparkles className="app-icon" />
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
              onOpenModelInstall={onOpenModelInstall} />
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
              onOpenModelInstall={onOpenModelInstall} />
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
              onSetFaceFusionRuntime={onSetFaceFusionRuntime} />
            <Wan21ToolSection
              wan21Status={wan21Status}
              isUpdatingWan21={isUpdatingWan21}
              hasWan21Update={hasWan21Update}
              storageFor={storageFor}
              onUpdateWan21={onUpdateWan21}
              onDeleteWan21={onDeleteWan21} />
            <Wan22ToolSection
              wan22Status={wan22Status}
              isUpdatingWan22={isUpdatingWan22}
              hasWan22Update={hasWan22Update}
              storageFor={storageFor}
              onUpdateWan22={onUpdateWan22}
              onDeleteWan22={onDeleteWan22} />
          </Accordion>
        </TabsContent>
      </Tabs>
    </>
  );
}

export function ModelPlaceholderSettings({
  editing,
  title,
  tab,
  onSelectTab,
}: {
  editing: import("react").ReactNode;
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
            <Brush className="app-icon" />
            Editing
          </TabsTrigger>
          <TabsTrigger value="generative">
            <Sparkles className="app-icon" />
            Generative
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editing" className="settings-tab-content">
          {editing}
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
  vosrSettings,
  tools,
  tab,
  expandedTool,
  flux2Status,
  isUpdatingFlux2,
  hasFlux2Update,
  updatingImageCodecTool,
  imageCodecUpdates,
  storageFor,
  onSelectTab,
  onSetExpandedTool,
  onUpdateFlux2,
  onUpdateImageCodecTool,
  onDeleteImageCodecTool,
}: {
  vosrSettings: ReactNode;
  tools: ToolStatus | null;
  tab: "editing" | "generative";
  expandedTool: string;
  flux2Status: Flux2Status | null;
  isUpdatingFlux2: boolean;
  hasFlux2Update: boolean;
  updatingImageCodecTool: ImageCodecTool | "";
  imageCodecUpdates: Record<ImageCodecTool, boolean>;
  storageFor: (key: string) => ToolStorage | undefined;
  onSelectTab: (tab: "editing" | "generative") => void;
  onSetExpandedTool: (value: string) => void;
  onUpdateFlux2: () => void;
  onUpdateImageCodecTool: (tool: ImageCodecTool) => void;
  onDeleteImageCodecTool: (tool: ImageCodecTool) => void;
}) {
  return (
    <>
      <h2>Image</h2>
      <Tabs value={tab} onValueChange={(value) => onSelectTab(value as "editing" | "generative")} className="settings-inner-tabs-wrap">
        <TabsList variant="line" className="settings-inner-tabs" aria-label="Image model sections">
          <TabsTrigger value="editing">
            <Brush className="app-icon" />
            Editing
          </TabsTrigger>
          <TabsTrigger value="generative">
            <Sparkles className="app-icon" />
            Generative
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editing" className="settings-tab-content">
          {vosrSettings}
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
                onDelete={() => onDeleteImageCodecTool(tool.key)} />
            ))}
          </Accordion>
        </TabsContent>

        <TabsContent value="generative" className="settings-tab-content">
          <Accordion type="single" collapsible value={expandedTool} onValueChange={(value) => onSetExpandedTool(value || "")} className="settings-accordion">
            <Flux2ToolSection
              flux2Status={flux2Status}
              isUpdatingFlux2={isUpdatingFlux2}
              hasFlux2Update={hasFlux2Update}
              storageFor={storageFor}
              onUpdateFlux2={onUpdateFlux2} />
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
          <Folder className="app-icon" />
          {installedPath || `D:/W2DS/Tools/videomaxxxing/tools/${tool.key}`}
        </code>
      </div>
      <div className="tool-dropdown-actions">
        {installed && hasUpdate && (
          <SecondaryButton disabled={isUpdating} onClick={onUpdate}>
            <RefreshCw className="app-icon" />
            Update
          </SecondaryButton>
        )}
        {installed ? (
          <SecondaryButton disabled={isUpdating} onClick={onDelete}>
            <Trash2 className="app-icon" />
            Uninstall
          </SecondaryButton>
        ) : (
          <PrimaryButton disabled={isUpdating} onClick={onUpdate}>
            <Download className="app-icon" />
            Download
          </PrimaryButton>
        )}
      </div>
    </ToolAccordionItem>
  );
}
