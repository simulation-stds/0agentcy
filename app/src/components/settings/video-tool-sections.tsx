import { FieldLabel, IconButton, PathButton, PrimaryButton, SecondaryButton, StatusBadge, ToolAccordionItem, type SelectOption } from "@/components/app-controls";
import { ModelRows } from "@/components/settings/model-rows";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { FaceFusionStatus, SupirModel, SupirStatus, ToolStatus, ToolStorage } from "@/hooks/use-tool-state";
import type { ModelSettingsRow, ModelTool } from "@/lib/app-options";

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
      <p>Real-ESRGAN upscales and restores video frames with local NCNN Vulkan models. Installed models can be removed independently.</p>
      <ModelRows tool="realesrgan" rows={rows} basicModel={basicModel} onDeleteModel={onDeleteModel} onDownloadModel={onUpdateModels} />
      <div className="tool-dropdown-info">
        <code title={tools?.realesrgan || "D:/W2DS/Tools/videomaxxxing/tools/realesrgan-ncnn-vulkan"}><span className="material-symbols-rounded" aria-hidden="true">folder</span>{tools?.realesrgan || "D:/W2DS/Tools/videomaxxxing/tools/realesrgan-ncnn-vulkan"}</code>
        <code><span className="material-symbols-rounded" aria-hidden="true">storage</span>{tools?.realesrgan ? `Tool folder: ${storageFor("realesrgan")?.currentLabel || "0 B"}` : `Estimated: ${storageFor("realesrgan")?.estimatedInstallLabel || "~120-350 MB"}`}</code>
      </div>
      <div className="tool-dropdown-actions">
        {hasModels && hasUpdate && (
          <SecondaryButton disabled={isUpdating} onClick={() => onOpenModelInstall("realesrgan")}><span className="material-symbols-rounded" aria-hidden="true">sync</span>Update All</SecondaryButton>
        )}
        {hasModels && (
          <SecondaryButton disabled={isUpdating} onClick={() => onDeleteAllModels("realesrgan")}><span className="material-symbols-rounded" aria-hidden="true">delete</span>Uninstall All</SecondaryButton>
        )}
        {missingModelNames.length > 0 && (
          <PrimaryButton disabled={isUpdating} onClick={() => onUpdateModels(missingModelNames)}><span className="material-symbols-rounded" aria-hidden="true">download</span>{hasModels ? "Download Missing" : "Download"}</PrimaryButton>
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
        <code title={tools?.rife || "D:/W2DS/Tools/videomaxxxing/tools/rife-ncnn-vulkan"}><span className="material-symbols-rounded" aria-hidden="true">folder</span>{tools?.rife || "D:/W2DS/Tools/videomaxxxing/tools/rife-ncnn-vulkan"}</code>
        <code><span className="material-symbols-rounded" aria-hidden="true">storage</span>{tools?.rife ? `Tool folder: ${storageFor("rife")?.currentLabel || "0 B"}` : `Estimated: ${storageFor("rife")?.estimatedInstallLabel || "~180-800 MB"}`}</code>
      </div>
      <div className="tool-dropdown-actions">
        {hasModels && hasUpdate && (
          <SecondaryButton disabled={isUpdating} onClick={() => onOpenModelInstall("rife")}><span className="material-symbols-rounded" aria-hidden="true">sync</span>Update All</SecondaryButton>
        )}
        {hasModels && (
          <SecondaryButton disabled={isUpdating} onClick={() => onDeleteAllModels("rife")}><span className="material-symbols-rounded" aria-hidden="true">delete</span>Uninstall All</SecondaryButton>
        )}
        {missingModelNames.length > 0 && (
          <PrimaryButton disabled={isUpdating} onClick={() => onUpdateModels(missingModelNames)}><span className="material-symbols-rounded" aria-hidden="true">download</span>{hasModels ? "Download Missing" : "Download"}</PrimaryButton>
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
        <code title={faceFusionStatus?.repoPath || "D:/W2DS/Tools/videomaxxxing/tools/facefusion/repo"}><span className="material-symbols-rounded" aria-hidden="true">folder</span>{faceFusionStatus?.repoPath || "D:/W2DS/Tools/videomaxxxing/tools/facefusion/repo"}</code>
      </div>
      <div className="tool-dropdown-actions">
        {faceFusionInstalled && hasUpdate && (
          <SecondaryButton disabled={isUpdatingFaceFusion} onClick={onUpdateFaceFusion}><span className="material-symbols-rounded" aria-hidden="true">sync</span>Update</SecondaryButton>
        )}
        {faceFusionInstalled ? (
          <SecondaryButton disabled><span className="material-symbols-rounded" aria-hidden="true">delete</span>Uninstall</SecondaryButton>
        ) : (
          <PrimaryButton disabled={isUpdatingFaceFusion} onClick={onUpdateFaceFusion}><span className="material-symbols-rounded" aria-hidden="true">download</span>{setupLabel}</PrimaryButton>
        )}
      </div>
    </ToolAccordionItem>
  );
}

export function SupirToolSection({
  supirStatus,
  supirModels,
  isUpdatingSupir,
  isUpdatingSupirXformers,
  hasSupirUpdate,
  hasSupirXformersUpdate,
  activeSupirCheckpoint,
  storageFor,
  onUpdateSupir,
  onUpdateSupirXformers,
  onDeleteSupirXformers,
  onImportSupirCheckpoint,
  onImportSupirCheckpointFromDownloads,
  onDownloadSupirCheckpoint,
  onDeleteSupirCheckpoint,
}: {
  supirStatus: SupirStatus | null;
  supirModels: SupirModel[];
  isUpdatingSupir: boolean;
  isUpdatingSupirXformers: boolean;
  hasSupirUpdate: boolean;
  hasSupirXformersUpdate: boolean;
  activeSupirCheckpoint: string;
  storageFor: (key: string) => ToolStorage | undefined;
  onUpdateSupir: () => void;
  onUpdateSupirXformers: () => void;
  onDeleteSupirXformers: () => void;
  onImportSupirCheckpoint: (sourcePath: string, checkpointName: string) => void;
  onImportSupirCheckpointFromDownloads: (checkpointName: string) => void;
  onDownloadSupirCheckpoint: (checkpointName: string) => void;
  onDeleteSupirCheckpoint: (checkpointName: string) => void;
}) {
  const state = supirStatus?.state || "missing";
  const summary = state === "installed"
    ? `Tool folder: ${storageFor("supir")?.currentLabel || supirStatus?.currentSizeLabel || "0 B"}`
    : `Estimated: ${storageFor("supir")?.estimatedInstallLabel || supirStatus?.estimatedInstallLabel || "~20-80 GB"}`;
  const supirInstalled = state === "installed";
  const setupLabel = state === "needs_setup" ? "Set Up" : "Download";
  const requiredModels = supirModels.filter((model) => model.required);
  const optionalModels = supirModels.filter((model) => !model.required);
  const checkpointPath = supirStatus?.checkpointPath || "D:/W2DS/Tools/videomaxxxing/tools/supir/checkpoints";
  const xformersReady = Boolean(supirStatus?.xformersReady);
  const xformersVersion = supirStatus?.xformersVersion ? ` ${supirStatus.xformersVersion}` : "";
  const xformersMessage = supirStatus?.xformersMessage || "";
  const xformersShortMessage = xformersMessage.length > 180 ? `${xformersMessage.slice(0, 180)}...` : xformersMessage;

  async function chooseCheckpoint(model: SupirModel) {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [
        {
          name: model.fileName,
          extensions: model.fileName.endsWith(".safetensors") ? ["safetensors"] : ["ckpt"],
        },
      ],
    });

    if (typeof selected === "string") {
      onImportSupirCheckpoint(selected, model.name);
    }
  }

  async function openDownloadPage(model: SupirModel) {
    await openUrl(model.downloadUrl);
  }

  return (
    <ToolAccordionItem
      value="supir"
      title="SUPIR"
      badge={(
        <StatusBadge tone={state === "installed" ? "installed" : state === "needs_setup" ? "update" : "missing"}>
          {state === "installed" ? "Installed" : state === "needs_setup" ? "Needs setup" : "Missing"}
        </StatusBadge>
      )}
      summary={summary}
    >
      <p>SUPIR (Fanghua-Yu/SUPIR) is a CUDA-only generative image restoration and upscaling model. The installer vendors the GitHub repo and Python environment, but checkpoints must be placed manually because upstream hosts them outside GitHub releases.</p>
      <p className="settings-note">Use only where the SUPIR license and non-commercial upstream model terms fit your workflow.</p>
      <p className="settings-note">{supirStatus?.message || "Status unavailable."}</p>
      <div className="tool-component-row">
        <div>
          <span className="model-title-row">
            <strong>xFormers acceleration</strong>
            <span className={`status-chip ${xformersReady ? "installed" : "missing"}`}>
              {xformersReady ? "Ready" : "Needs setup"}
            </span>
            {xformersVersion && <span className="status-chip local">{xformersVersion.trim()}</span>}
          </span>
          <span title={xformersMessage || "xFormers is installed into the SUPIR Conda environment."}>
            xFormers provides memory-efficient CUDA attention for SUPIR, reducing VRAM use and enabling the upstream attention layers.
            {xformersShortMessage && ` ${xformersShortMessage}`}
          </span>
        </div>
        <div className="supir-checkpoint-actions">
          {xformersReady ? (
            <>
              {hasSupirXformersUpdate && (
                <IconButton type="button" disabled={isUpdatingSupir || isUpdatingSupirXformers} title="Update xFormers" onClick={onUpdateSupirXformers}>
                  <span className="material-symbols-rounded" aria-hidden="true">sync</span>
                </IconButton>
              )}
              <IconButton type="button" className="danger" disabled={isUpdatingSupir || isUpdatingSupirXformers} title="Remove xFormers" onClick={onDeleteSupirXformers}>
                <span className="material-symbols-rounded" aria-hidden="true">delete</span>
              </IconButton>
            </>
          ) : (
            <IconButton type="button" disabled={isUpdatingSupir || isUpdatingSupirXformers} title="Install xFormers" onClick={onUpdateSupirXformers}>
              <span className="material-symbols-rounded" aria-hidden="true">{isUpdatingSupirXformers ? "sync" : "download"}</span>
            </IconButton>
          )}
        </div>
      </div>
      <SupirCheckpointRows
        title="Required checkpoints"
        models={requiredModels}
        checkpointPath={checkpointPath}
        activeCheckpoint={activeSupirCheckpoint}
        onChooseCheckpoint={chooseCheckpoint}
        onImportFromDownloads={onImportSupirCheckpointFromDownloads}
        onDownloadCheckpoint={onDownloadSupirCheckpoint}
        onOpenDownloadPage={openDownloadPage}
        onDeleteCheckpoint={onDeleteSupirCheckpoint}
      />
      <SupirCheckpointRows
        title="Optional checkpoints"
        models={optionalModels}
        checkpointPath={checkpointPath}
        activeCheckpoint={activeSupirCheckpoint}
        onChooseCheckpoint={chooseCheckpoint}
        onImportFromDownloads={onImportSupirCheckpointFromDownloads}
        onDownloadCheckpoint={onDownloadSupirCheckpoint}
        onOpenDownloadPage={openDownloadPage}
        onDeleteCheckpoint={onDeleteSupirCheckpoint}
      />
      <SupirAdvancedDependencies onOpenDownloadPage={openUrl} />
      <div className="tool-dropdown-info">
        <code title={supirStatus?.repoPath || "D:/W2DS/Tools/videomaxxxing/tools/supir/repo"}><span className="material-symbols-rounded" aria-hidden="true">folder</span>{supirStatus?.repoPath || "D:/W2DS/Tools/videomaxxxing/tools/supir/repo"}</code>
        <code title={supirStatus?.checkpointPath || "D:/W2DS/Tools/videomaxxxing/tools/supir/checkpoints"}><span className="material-symbols-rounded" aria-hidden="true">deployed_code</span>{supirStatus?.checkpointPath || "D:/W2DS/Tools/videomaxxxing/tools/supir/checkpoints"}</code>
      </div>
      <div className="tool-dropdown-actions">
        {supirInstalled && hasSupirUpdate && (
          <SecondaryButton disabled={isUpdatingSupir} onClick={onUpdateSupir}><span className="material-symbols-rounded" aria-hidden="true">sync</span>Update</SecondaryButton>
        )}
        {supirInstalled ? (
          <SecondaryButton disabled><span className="material-symbols-rounded" aria-hidden="true">delete</span>Uninstall</SecondaryButton>
        ) : (
          <PrimaryButton disabled={isUpdatingSupir} onClick={onUpdateSupir}><span className="material-symbols-rounded" aria-hidden="true">download</span>{setupLabel}</PrimaryButton>
        )}
      </div>
    </ToolAccordionItem>
  );
}

function SupirCheckpointRows({
  title,
  models,
  checkpointPath,
  activeCheckpoint,
  onChooseCheckpoint,
  onImportFromDownloads,
  onDownloadCheckpoint,
  onOpenDownloadPage,
  onDeleteCheckpoint,
}: {
  title: string;
  models: SupirModel[];
  checkpointPath: string;
  activeCheckpoint: string;
  onChooseCheckpoint: (model: SupirModel) => void;
  onImportFromDownloads: (checkpointName: string) => void;
  onDownloadCheckpoint: (checkpointName: string) => void;
  onOpenDownloadPage: (model: SupirModel) => void;
  onDeleteCheckpoint: (checkpointName: string) => void;
}) {
  if (!models.length) return null;

  return (
    <div className="model-list supir-checkpoint-list">
      <h3>{title}</h3>
      {models.map((model) => (
        <SupirCheckpointRow
          key={model.name}
          model={model}
          checkpointPath={checkpointPath}
          activeCheckpoint={activeCheckpoint}
          onChooseCheckpoint={onChooseCheckpoint}
          onImportFromDownloads={onImportFromDownloads}
          onDownloadCheckpoint={onDownloadCheckpoint}
          onOpenDownloadPage={onOpenDownloadPage}
          onDeleteCheckpoint={onDeleteCheckpoint}
        />
      ))}
    </div>
  );
}

function SupirCheckpointRow({
  model,
  checkpointPath,
  activeCheckpoint,
  onChooseCheckpoint,
  onImportFromDownloads,
  onDownloadCheckpoint,
  onOpenDownloadPage,
  onDeleteCheckpoint,
}: {
  model: SupirModel;
  checkpointPath: string;
  activeCheckpoint: string;
  onChooseCheckpoint: (model: SupirModel) => void;
  onImportFromDownloads: (checkpointName: string) => void;
  onDownloadCheckpoint: (checkpointName: string) => void;
  onOpenDownloadPage: (model: SupirModel) => void;
  onDeleteCheckpoint: (checkpointName: string) => void;
}) {
  const isActive = activeCheckpoint === model.name;
  const installedPath = model.installedPath || `${checkpointPath}\\${model.fileName}`;
  const primaryLabel = model.installed
    ? installedPath
    : model.directDownload
      ? `Download ${model.label}`
      : `Find ${model.fileName} in Downloads`;
  const primaryIcon = model.installed ? "folder" : model.directDownload ? "download" : "download_done";
  const primaryTitle = model.installed
    ? installedPath
    : model.directDownload
      ? `Download ${model.fileName}`
      : `Import ${model.fileName} from Downloads`;
  const onPrimaryAction = () => {
    if (model.installed) {
      onChooseCheckpoint(model);
      return;
    }
    if (model.directDownload) {
      onDownloadCheckpoint(model.name);
      return;
    }
    onImportFromDownloads(model.name);
  };

  return (
    <div className="tool-component-row supir-checkpoint-row">
      <div>
        <span className="model-title-row">
          <strong>{model.label}</strong>
          <span className={`status-chip ${model.installed ? "installed" : "missing"}`}>{model.installed ? "Installed" : "Missing"}</span>
          {model.name === "SUPIR-v0Q" && <span className="status-chip suggested">Suggested</span>}
          <span className="status-chip local">{model.sourceLabel}</span>
        </span>
        <span>{model.description}</span>
        <PathButton type="button" className="supir-checkpoint-path-button" title={primaryTitle} disabled={isActive} onClick={onPrimaryAction}>
          <span className="material-symbols-rounded" aria-hidden="true">{isActive ? "sync" : primaryIcon}</span>
          <span>{isActive ? "Downloading..." : primaryLabel}</span>
        </PathButton>
        {!model.installed && !model.directDownload && (
          <SecondaryButton type="button" className="supir-choose-file-button" onClick={() => onChooseCheckpoint(model)}>
            <span className="material-symbols-rounded" aria-hidden="true">upload_file</span>
            Choose file manually
          </SecondaryButton>
        )}
      </div>
      <code>{model.installed ? `Installed: ${model.sizeLabel}` : `Estimated: ${model.estimatedSizeLabel}`}</code>
      <div className="supir-checkpoint-actions">
        <SecondaryButton type="button" title={`Open ${model.sourceLabel} page`} onClick={() => onOpenDownloadPage(model)}>
          <span className="material-symbols-rounded" aria-hidden="true">open_in_new</span>
        </SecondaryButton>
        {model.installed && (
          <SecondaryButton
            type="button"
            className="danger"
            title={`Remove ${model.label}`}
            onClick={() => onDeleteCheckpoint(model.name)}
          >
            <span className="material-symbols-rounded" aria-hidden="true">delete</span>
          </SecondaryButton>
        )}
      </div>
    </div>
  );
}

const supirAdvancedDependencies = [
  {
    name: "OpenAI CLIP",
    sourceLabel: "Hugging Face",
    estimate: "Downloaded by Python when needed",
    description: "Shared image/text encoder used by SUPIR dependencies.",
    url: "https://huggingface.co/openai/clip-vit-large-patch14",
  },
  {
    name: "OpenAI CLIP 336",
    sourceLabel: "Hugging Face",
    estimate: "Downloaded only if LLaVA needs it",
    description: "Higher-resolution CLIP encoder used by LLaVA guidance.",
    url: "https://huggingface.co/openai/clip-vit-large-patch14-336",
  },
  {
    name: "LAION bigG CLIP",
    sourceLabel: "Hugging Face",
    estimate: "Large",
    description: "Advanced encoder dependency used by the upstream SUPIR stack.",
    url: "https://huggingface.co/laion/CLIP-ViT-bigG-14-laion2B-39B-b160k",
  },
  {
    name: "LLaVA 1.5 13B",
    sourceLabel: "Hugging Face",
    estimate: "~26 GB",
    description: "Optional prompt guidance model. Leave LLaVA off to avoid this large download.",
    url: "https://huggingface.co/liuhaotian/llava-v1.5-13b",
  },
];

function SupirAdvancedDependencies({
  onOpenDownloadPage,
}: {
  onOpenDownloadPage: (url: string) => void;
}) {
  return (
    <div className="model-list supir-checkpoint-list">
      <h3>Advanced downloads</h3>
      <p className="settings-note">These are optional runtime downloads. They are only relevant if LLaVA guidance is enabled or if the Python libraries need to populate their Hugging Face cache.</p>
      {supirAdvancedDependencies.map((item) => (
        <div className="tool-component-row supir-checkpoint-row" key={item.name}>
          <div>
            <span className="model-title-row">
              <strong>{item.name}</strong>
              <span className="status-chip local">{item.sourceLabel}</span>
            </span>
            <span>{item.description}</span>
          </div>
          <code>{item.estimate}</code>
          <div className="supir-checkpoint-actions">
            <SecondaryButton type="button" title={`Open ${item.sourceLabel} page`} onClick={() => onOpenDownloadPage(item.url)}>
              <span className="material-symbols-rounded" aria-hidden="true">open_in_new</span>
            </SecondaryButton>
          </div>
        </div>
      ))}
    </div>
  );
}
