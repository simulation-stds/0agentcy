import { RealEsrganRuntimeSettings } from "@/components/settings/realesrgan-runtime-settings";
import { FieldLabel, PrimaryButton, SecondaryButton, StatusBadge, ToolAccordionItem, type SelectOption } from "@/components/app-controls";
import { ModelRows } from "@/components/settings/model-rows";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FaceFusionStatus, Flux2Status, ToolStatus, ToolStorage, Wan21Status, Wan22Status } from "@/hooks/use-tool-state";
import type { ModelSettingsRow, ModelTool } from "@/lib/app-options";
import { Box, Download, Folder, Gauge, RefreshCw, Trash2 } from "lucide-react";

type RuntimeProviderOption = SelectOption & {
  provider: string;
};

type ModelToolSectionProps = {
  tools: ToolStatus | null;
  rows: ModelSettingsRow[];
  summary: string;
  basicModel: string;
  hasModels: boolean;
  isUpdating: boolean;
  hasUpdate: boolean;
  storageFor: (key: string) => ToolStorage | undefined;
  onDeleteModel: (tool: ModelTool, model: string) => void;
  onDeleteAllModels: (tool: ModelTool) => void;
  onUpdateModels: (models: string[]) => void;
  onOpenModelInstall: (tool: ModelTool) => void;
};

export function RealEsrganToolSection({
  tools,
  rows,
  summary,
  basicModel,
  hasModels,
  isUpdating,
  hasUpdate,
  storageFor,
  onDeleteModel,
  onDeleteAllModels,
  onUpdateModels,
  onOpenModelInstall,
}: ModelToolSectionProps) {
  const missingModelNames = rows.filter((row) => row.known && !row.installed).map((row) => row.name);

  return (
    <ToolAccordionItem value="realesrgan" title="Real-ESRGAN" summary={summary} hasModels>
      <RealEsrganRuntimeSettings installing={isUpdating} onRepair={() => onUpdateModels([])} />
      <p>Install or remove models below. Adding a model keeps your other installed models.</p>
      <ModelRows tool="realesrgan" rows={rows} basicModel={basicModel} onDeleteModel={onDeleteModel} onDownloadModel={onUpdateModels} />
      <div className="tool-dropdown-info">
        <code><Gauge className="app-icon" />{tools?.realesrgan ? `Tool folder: ${storageFor("realesrgan")?.currentLabel || "0 B"}` : `Estimated: ${storageFor("realesrgan")?.estimatedInstallLabel || "~120-350 MB"}`}</code>
      </div>
      <div className="tool-dropdown-actions">
        {hasModels && hasUpdate && (
          <SecondaryButton disabled={isUpdating} onClick={() => onOpenModelInstall("realesrgan")}><RefreshCw className="app-icon" />Update All</SecondaryButton>
        )}
        {hasModels && (
          <SecondaryButton disabled={isUpdating} onClick={() => onDeleteAllModels("realesrgan")}><Trash2 className="app-icon" />Remove all models</SecondaryButton>
        )}
        {missingModelNames.length > 0 && (
          <PrimaryButton disabled={isUpdating} onClick={() => onUpdateModels(missingModelNames)}><Download className="app-icon" />{hasModels ? "Download Missing" : "Download"}</PrimaryButton>
        )}
      </div>
    </ToolAccordionItem>
  );
}

export function RifeToolSection({
  tools,
  rows,
  summary,
  basicModel,
  hasModels,
  isUpdating,
  hasUpdate,
  storageFor,
  onDeleteModel,
  onDeleteAllModels,
  onUpdateModels,
  onOpenModelInstall,
}: ModelToolSectionProps) {
  const missingModelNames = rows.filter((row) => row.known && !row.installed).map((row) => row.name);

  return (
    <ToolAccordionItem value="rife" title="RIFE" summary={summary} hasModels>
      <p>RIFE creates intermediate frames for smoother motion and higher frame-rate output. Installed interpolation models can be removed independently.</p>
      <ModelRows tool="rife" rows={rows} basicModel={basicModel} onDeleteModel={onDeleteModel} onDownloadModel={onUpdateModels} />
      <div className="tool-dropdown-info">
        <code title={tools?.rife || "D:/W2DS/Tools/videomaxxxing/tools/rife-ncnn-vulkan"}><Folder className="app-icon" />{tools?.rife || "D:/W2DS/Tools/videomaxxxing/tools/rife-ncnn-vulkan"}</code>
        <code><Gauge className="app-icon" />{tools?.rife ? `Tool folder: ${storageFor("rife")?.currentLabel || "0 B"}` : `Estimated: ${storageFor("rife")?.estimatedInstallLabel || "~180-800 MB"}`}</code>
      </div>
      <div className="tool-dropdown-actions">
        {hasModels && hasUpdate && (
          <SecondaryButton disabled={isUpdating} onClick={() => onOpenModelInstall("rife")}><RefreshCw className="app-icon" />Update All</SecondaryButton>
        )}
        {hasModels && (
          <SecondaryButton disabled={isUpdating} onClick={() => onDeleteAllModels("rife")}><Trash2 className="app-icon" />Uninstall All</SecondaryButton>
        )}
        {missingModelNames.length > 0 && (
          <PrimaryButton disabled={isUpdating} onClick={() => onUpdateModels(missingModelNames)}><Download className="app-icon" />{hasModels ? "Download Missing" : "Download"}</PrimaryButton>
        )}
      </div>
    </ToolAccordionItem>
  );
}

export function FaceFusionToolSection({
  faceFusionStatus,
  availableFaceFusionProviders,
  faceFusionRuntime,
  isUpdatingFaceFusion,
  hasUpdate,
  storageFor,
  onUpdateFaceFusion,
  onSetFaceFusionRuntime,
}: {
  faceFusionStatus: FaceFusionStatus | null;
  availableFaceFusionProviders: RuntimeProviderOption[];
  faceFusionRuntime: string;
  isUpdatingFaceFusion: boolean;
  hasUpdate: boolean;
  storageFor: (key: string) => ToolStorage | undefined;
  onUpdateFaceFusion: () => void;
  onSetFaceFusionRuntime: (runtime: string) => void;
}) {
  const faceFusionInstalled = faceFusionStatus?.state === "installed";
  const setupLabel = faceFusionStatus?.state === "needs_setup" ? "Set Up" : "Download";
  const faceFusionStorage = faceFusionStatus?.state === "installed"
    ? `Tool folder: ${storageFor("facefusion")?.currentLabel || faceFusionStatus.currentSizeLabel}`
    : `Estimated: ${storageFor("facefusion")?.estimatedInstallLabel || "~2-8 GB"}`;

  return (
    <ToolAccordionItem
      value="facefusion"
      title="FaceFusion"
      badge={(
        <>
          <StatusBadge tone={faceFusionStatus?.state === "installed" ? "installed" : faceFusionStatus?.state === "needs_setup" ? "update" : "missing"}>
            {faceFusionStatus?.state === "installed" ? "Installed" : faceFusionStatus?.state === "needs_setup" ? "Needs setup" : "Missing"}
          </StatusBadge>
          {faceFusionStatus?.state === "installed" && (
            <StatusBadge tone="local">{faceFusionStatus.runtimeLabel || "Runtime unknown"}</StatusBadge>
          )}
        </>
      )}
      summary={faceFusionStorage}
    >
      <p>FaceFusion applies face swapping and enhancement workflows through its local Python CLI. DirectML is the default Windows runtime because it works across AMD, NVIDIA, and Intel GPUs.</p>
      {faceFusionStatus?.availableProviders?.length ? (
        <div className="runtime-chip-row">
          {availableFaceFusionProviders.map((provider) => (
            <span key={provider.value} className={`runtime-chip ${provider.value}`}>{provider.label}</span>
          ))}
        </div>
      ) : null}
      {faceFusionStatus?.providerWarning && (
        <p className="settings-note">Provider warning: {faceFusionStatus.providerWarning}</p>
      )}
      <p className="settings-note">{faceFusionStatus?.message || "Status unavailable."}</p>
      <div className="settings-grid compact-settings">
        <label>
          <FieldLabel help="DirectML is the best Windows default and works broadly with AMD, NVIDIA, and Intel GPUs. CUDA is NVIDIA-only and usually fastest when CUDA is set up. OpenVINO is best for Intel hardware. CPU / Default is slow but the least hardware-specific fallback.">ONNX Runtime</FieldLabel>
          <Select value={faceFusionRuntime} onValueChange={onSetFaceFusionRuntime}>
            <SelectTrigger className="settings-select-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="settings-select-content" position="popper" side="bottom" align="start" sideOffset={4}>
              <SelectItem value="directml">DirectML</SelectItem>
              <SelectItem value="cuda">CUDA</SelectItem>
              <SelectItem value="openvino">OpenVINO</SelectItem>
              <SelectItem value="default">CPU / Default</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>
      <div className="tool-dropdown-info">
        <code title={faceFusionStatus?.repoPath || "D:/W2DS/Tools/videomaxxxing/tools/facefusion/repo"}><Folder className="app-icon" />{faceFusionStatus?.repoPath || "D:/W2DS/Tools/videomaxxxing/tools/facefusion/repo"}</code>
      </div>
      <div className="tool-dropdown-actions">
        {faceFusionInstalled && hasUpdate && (
          <SecondaryButton disabled={isUpdatingFaceFusion} onClick={onUpdateFaceFusion}><RefreshCw className="app-icon" />Update</SecondaryButton>
        )}
        {faceFusionInstalled ? (
          <SecondaryButton disabled><Trash2 className="app-icon" />Uninstall</SecondaryButton>
        ) : (
          <PrimaryButton disabled={isUpdatingFaceFusion} onClick={onUpdateFaceFusion}><Download className="app-icon" />{setupLabel}</PrimaryButton>
        )}
      </div>
    </ToolAccordionItem>
  );
}

export function Flux2ToolSection({
  flux2Status,
  isUpdatingFlux2,
  hasFlux2Update,
  storageFor,
  onUpdateFlux2,
}: {
  flux2Status: Flux2Status | null;
  isUpdatingFlux2: boolean;
  hasFlux2Update: boolean;
  storageFor: (key: string) => ToolStorage | undefined;
  onUpdateFlux2: () => void;
}) {
  const state = flux2Status?.state || "missing";
  const installed = state === "installed";
  const setupLabel = state === "needs_setup" ? "Set Up" : "Download";
  const summary = installed
    ? `Tool folder: ${storageFor("flux2")?.currentLabel || flux2Status?.currentSizeLabel || "0 B"}`
    : `Estimated: ${storageFor("flux2")?.estimatedInstallLabel || flux2Status?.estimatedInstallLabel || "~12-30 GB"}`;
  const runtimeVersions = [
    flux2Status?.torchVersion ? `torch ${flux2Status.torchVersion}` : "",
    flux2Status?.diffusersVersion ? `diffusers ${flux2Status.diffusersVersion}` : "",
    flux2Status?.transformersVersion ? `transformers ${flux2Status.transformersVersion}` : "",
    flux2Status?.accelerateVersion ? `accelerate ${flux2Status.accelerateVersion}` : "",
  ].filter(Boolean);

  return (
    <ToolAccordionItem
      value="flux2"
      title="Flux.2"
      badge={(
        <StatusBadge tone={installed ? "installed" : state === "needs_setup" ? "update" : "missing"}>
          {installed ? "Installed" : state === "needs_setup" ? "Needs setup" : "Missing"}
        </StatusBadge>
      )}
      summary={summary}
    >
      <p>Flux.2 Klein is a local text-to-image generation runtime using PyTorch, Diffusers, Transformers, and Accelerate in its own Conda environment.</p>
      <p className="settings-note">The model weights download on first run. Expect a large cache and about 13 GB VRAM for normal CUDA use.</p>
      <p className="settings-note">{flux2Status?.message || "Status unavailable."}</p>
      <div className="tool-component-row">
        <div>
          <span className="model-title-row">
            <strong>Python runtime</strong>
            <span className={`status-chip ${flux2Status?.runtimeReady ? "installed" : "missing"}`}>
              {flux2Status?.runtimeReady ? "Ready" : "Needs setup"}
            </span>
            <span className={`status-chip ${flux2Status?.cudaReady ? "installed" : "missing"}`}>
              {flux2Status?.cudaReady ? "CUDA" : "No CUDA"}
            </span>
          </span>
          <span>{runtimeVersions.length ? runtimeVersions.join(" | ") : "PyTorch, Diffusers, Transformers, and Accelerate will be installed into the Flux.2 environment."}</span>
        </div>
      </div>
      <div className="tool-dropdown-info">
        <code title={flux2Status?.toolPath || "D:/W2DS/Tools/videomaxxxing/tools/flux2"}><Folder className="app-icon" />{flux2Status?.toolPath || "D:/W2DS/Tools/videomaxxxing/tools/flux2"}</code>
        <code title={flux2Status?.cachePath || "D:/W2DS/Tools/videomaxxxing/tools/flux2/cache"}><Box className="app-icon" />{flux2Status?.cachePath || "D:/W2DS/Tools/videomaxxxing/tools/flux2/cache"}</code>
      </div>
      <div className="tool-dropdown-actions">
        {installed && hasFlux2Update && (
          <SecondaryButton disabled={isUpdatingFlux2} onClick={onUpdateFlux2}><RefreshCw className="app-icon" />Update</SecondaryButton>
        )}
        {installed ? (
          <SecondaryButton disabled><Trash2 className="app-icon" />Uninstall</SecondaryButton>
        ) : (
          <PrimaryButton disabled={isUpdatingFlux2} onClick={onUpdateFlux2}><Download className="app-icon" />{setupLabel}</PrimaryButton>
        )}
      </div>
    </ToolAccordionItem>
  );
}

export function Wan22ToolSection({
  wan22Status,
  isUpdatingWan22,
  hasWan22Update,
  storageFor,
  onUpdateWan22,
  onDeleteWan22,
}: {
  wan22Status: Wan22Status | null;
  isUpdatingWan22: boolean;
  hasWan22Update: boolean;
  storageFor: (key: string) => ToolStorage | undefined;
  onUpdateWan22: () => void;
  onDeleteWan22: () => void;
}) {
  const state = wan22Status?.state || "missing";
  const installed = state === "installed";
  const setupLabel = state === "needs_setup" ? "Set Up" : "Download";
  const summary = installed
    ? `Tool folder: ${storageFor("wan22")?.currentLabel || wan22Status?.currentSizeLabel || "0 B"}`
    : `Estimated: ${storageFor("wan22")?.estimatedInstallLabel || wan22Status?.estimatedInstallLabel || "~25-60 GB"}`;
  const runtimeVersions = [
    wan22Status?.torchVersion ? `torch ${wan22Status.torchVersion}` : "",
    wan22Status?.diffusersVersion ? `diffusers ${wan22Status.diffusersVersion}` : "",
    wan22Status?.transformersVersion ? `transformers ${wan22Status.transformersVersion}` : "",
    wan22Status?.accelerateVersion ? `accelerate ${wan22Status.accelerateVersion}` : "",
  ].filter(Boolean);

  return (
    <ToolAccordionItem
      value="wan22"
      title="Wan2.2"
      badge={(
        <StatusBadge tone={installed ? "installed" : state === "needs_setup" ? "update" : "missing"}>
          {installed ? "Installed" : state === "needs_setup" ? "Needs setup" : "Missing"}
        </StatusBadge>
      )}
      summary={summary}
    >
      <p>Wan2.2 TI2V-5B generates short local videos from a prompt, with an optional image reference for image-to-video. This v1 installer only targets the 5B TI2V model.</p>
      <p className="settings-note">Use an NVIDIA CUDA GPU for practical generation. Low-VRAM settings are enabled by default in the Video workspace.</p>
      <p className="settings-note">{wan22Status?.message || "Status unavailable."}</p>
      <div className="tool-component-row">
        <div>
          <span className="model-title-row">
            <strong>Python runtime</strong>
            <span className={`status-chip ${wan22Status?.runtimeReady ? "installed" : "missing"}`}>
              {wan22Status?.runtimeReady ? "Ready" : "Needs setup"}
            </span>
            <span className={`status-chip ${wan22Status?.modelReady ? "installed" : "missing"}`}>
              {wan22Status?.modelReady ? "Model" : "No model"}
            </span>
            <span className={`status-chip ${wan22Status?.cudaReady ? "installed" : "missing"}`}>
              {wan22Status?.cudaReady ? "CUDA" : "No CUDA"}
            </span>
            <span className={`status-chip ${wan22Status?.flashAttnReady ? "installed" : "update"}`}>
              {wan22Status?.flashAttnReady ? "Flash attention" : "No flash attention"}
            </span>
          </span>
          <span>{runtimeVersions.length ? runtimeVersions.join(" | ") : "PyTorch, Diffusers, Transformers, Accelerate, and Wan runtime packages will be installed into the Wan2.2 environment."}</span>
        </div>
      </div>
      {wan22Status?.flashAttnMessage && !wan22Status.flashAttnReady && (
        <p className="settings-note">Flash attention warning: {wan22Status.flashAttnMessage}</p>
      )}
      <div className="tool-dropdown-info">
        <code title={wan22Status?.repoPath || "D:/W2DS/Tools/videomaxxxing/tools/wan22/repo"}><Folder className="app-icon" />{wan22Status?.repoPath || "D:/W2DS/Tools/videomaxxxing/tools/wan22/repo"}</code>
        <code title={wan22Status?.modelPath || "D:/W2DS/Tools/videomaxxxing/tools/wan22/models/Wan2.2-TI2V-5B"}><Box className="app-icon" />{wan22Status?.modelPath || "D:/W2DS/Tools/videomaxxxing/tools/wan22/models/Wan2.2-TI2V-5B"}</code>
        <code title={wan22Status?.cachePath || "D:/W2DS/Tools/videomaxxxing/tools/wan22/cache"}><Box className="app-icon" />{wan22Status?.cachePath || "D:/W2DS/Tools/videomaxxxing/tools/wan22/cache"}</code>
      </div>
      <div className="tool-dropdown-actions">
        {installed ? (
          <>
            <SecondaryButton disabled={isUpdatingWan22} onClick={onUpdateWan22}><RefreshCw className="app-icon" />{hasWan22Update ? "Update" : "Repair / Update"}</SecondaryButton>
            <SecondaryButton disabled={isUpdatingWan22} onClick={onDeleteWan22}><Trash2 className="app-icon" />Uninstall</SecondaryButton>
          </>
        ) : (
          <PrimaryButton disabled={isUpdatingWan22} onClick={onUpdateWan22}><Download className="app-icon" />{setupLabel}</PrimaryButton>
        )}
      </div>
    </ToolAccordionItem>
  );
}

export function Wan21ToolSection({
  wan21Status,
  isUpdatingWan21,
  hasWan21Update,
  storageFor,
  onUpdateWan21,
  onDeleteWan21,
}: {
  wan21Status: Wan21Status | null;
  isUpdatingWan21: boolean;
  hasWan21Update: boolean;
  storageFor: (key: string) => ToolStorage | undefined;
  onUpdateWan21: () => void;
  onDeleteWan21: () => void;
}) {
  const state = wan21Status?.state || "missing";
  const installed = state === "installed";
  const setupLabel = state === "needs_setup" ? "Set Up" : "Download";
  const summary = installed
    ? `Tool folder: ${storageFor("wan21")?.currentLabel || wan21Status?.currentSizeLabel || "0 B"}`
    : `Estimated: ${storageFor("wan21")?.estimatedInstallLabel || wan21Status?.estimatedInstallLabel || "~10-25 GB"}`;
  const runtimeVersions = [
    wan21Status?.torchVersion ? `torch ${wan21Status.torchVersion}` : "",
    wan21Status?.diffusersVersion ? `diffusers ${wan21Status.diffusersVersion}` : "",
    wan21Status?.transformersVersion ? `transformers ${wan21Status.transformersVersion}` : "",
    wan21Status?.accelerateVersion ? `accelerate ${wan21Status.accelerateVersion}` : "",
  ].filter(Boolean);

  return (
    <ToolAccordionItem
      value="wan21"
      title="Wan2.1"
      badge={(
        <StatusBadge tone={installed ? "installed" : state === "needs_setup" ? "update" : "missing"}>
          {installed ? "Installed" : state === "needs_setup" ? "Needs setup" : "Missing"}
        </StatusBadge>
      )}
      summary={summary}
    >
      <p>Wan2.1 T2V-1.3B generates prompt-only local videos at 480p. It is kept separate from Wan2.2 because it uses its own runtime, model, and lower-memory generation path.</p>
      <p className="settings-note">Use an NVIDIA CUDA GPU for practical generation. Conservative offload settings are enabled by default in the Video workspace.</p>
      <p className="settings-note">{wan21Status?.message || "Status unavailable."}</p>
      <div className="tool-component-row">
        <div>
          <span className="model-title-row">
            <strong>Python runtime</strong>
            <span className={`status-chip ${wan21Status?.runtimeReady ? "installed" : "missing"}`}>
              {wan21Status?.runtimeReady ? "Ready" : "Needs setup"}
            </span>
            <span className={`status-chip ${wan21Status?.modelReady ? "installed" : "missing"}`}>
              {wan21Status?.modelReady ? "Model" : "No model"}
            </span>
            <span className={`status-chip ${wan21Status?.cudaReady ? "installed" : "missing"}`}>
              {wan21Status?.cudaReady ? "CUDA" : "No CUDA"}
            </span>
            <span className={`status-chip ${wan21Status?.flashAttnReady ? "installed" : "update"}`}>
              {wan21Status?.flashAttnReady ? "Flash attention" : "No flash attention"}
            </span>
          </span>
          <span>{runtimeVersions.length ? runtimeVersions.join(" | ") : "PyTorch, Diffusers, Transformers, Accelerate, and Wan runtime packages will be installed into the Wan2.1 environment."}</span>
        </div>
      </div>
      {wan21Status?.flashAttnMessage && !wan21Status.flashAttnReady && (
        <p className="settings-note">Flash attention warning: {wan21Status.flashAttnMessage}</p>
      )}
      <div className="tool-dropdown-info">
        <code title={wan21Status?.repoPath || "D:/W2DS/Tools/videomaxxxing/tools/wan21/repo"}><Folder className="app-icon" />{wan21Status?.repoPath || "D:/W2DS/Tools/videomaxxxing/tools/wan21/repo"}</code>
        <code title={wan21Status?.modelPath || "D:/W2DS/Tools/videomaxxxing/tools/wan21/models/Wan2.1-T2V-1.3B"}><Box className="app-icon" />{wan21Status?.modelPath || "D:/W2DS/Tools/videomaxxxing/tools/wan21/models/Wan2.1-T2V-1.3B"}</code>
        <code title={wan21Status?.cachePath || "D:/W2DS/Tools/videomaxxxing/tools/wan21/cache"}><Box className="app-icon" />{wan21Status?.cachePath || "D:/W2DS/Tools/videomaxxxing/tools/wan21/cache"}</code>
      </div>
      <div className="tool-dropdown-actions">
        {installed ? (
          <>
            <SecondaryButton disabled={isUpdatingWan21} onClick={onUpdateWan21}><RefreshCw className="app-icon" />{hasWan21Update ? "Update" : "Repair / Update"}</SecondaryButton>
            <SecondaryButton disabled={isUpdatingWan21} onClick={onDeleteWan21}><Trash2 className="app-icon" />Uninstall</SecondaryButton>
          </>
        ) : (
          <PrimaryButton disabled={isUpdatingWan21} onClick={onUpdateWan21}><Download className="app-icon" />{setupLabel}</PrimaryButton>
        )}
      </div>
    </ToolAccordionItem>
  );
}
