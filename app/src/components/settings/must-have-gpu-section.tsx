import { PathButton, PrimaryButton, SettingsSection, StatusBadge, ToolAccordionItem } from "@/components/app-controls";
import { Accordion } from "@/components/ui/accordion";

type MustHaveGpuSectionProps = {
  expandedTool: string;
  cudaStatusClass: "installed" | "update" | "missing";
  cudaStatusLabel: string;
  hasUsableCuda: boolean;
  hasCudaWarning: boolean;
  cudaFolderLabel: string;
  cudnnStatusClass: "installed" | "update" | "missing";
  cudnnStatusLabel: string;
  hasCudnn: boolean;
  cudnnFolderLabel: string;
  cudaDownloadUrl: string;
  cudnnDownloadUrl: string;
  onSetExpandedTool: (value: string) => void;
  onChooseRuntimeFolder: (key: "cudaBinFolder" | "cudnnBinFolder") => void;
  onOpenExternalDownload: (url: string) => void;
};

export function MustHaveGpuSection({
  expandedTool,
  cudaStatusClass,
  cudaStatusLabel,
  hasUsableCuda,
  hasCudaWarning,
  cudaFolderLabel,
  cudnnStatusClass,
  cudnnStatusLabel,
  hasCudnn,
  cudnnFolderLabel,
  cudaDownloadUrl,
  cudnnDownloadUrl,
  onSetExpandedTool,
  onChooseRuntimeFolder,
  onOpenExternalDownload,
}: MustHaveGpuSectionProps) {
  return (
    <SettingsSection title="GPU Processing" description="NVIDIA-only runtime libraries for FaceFusion CUDA acceleration. DirectML remains the simpler Windows fallback when these are not configured.">
      <Accordion type="single" collapsible value={expandedTool} onValueChange={(value) => onSetExpandedTool(value || "")} className="settings-accordion">
        <ToolAccordionItem
          value="cuda"
          title="CUDA Runtime"
          badge={<StatusBadge tone={cudaStatusClass}>{cudaStatusLabel}</StatusBadge>}
          summary={hasUsableCuda ? "Available to ONNX Runtime" : "External NVIDIA install"}
        >
          <p>CUDA 12.x supplies NVIDIA GPU runtime DLLs such as cublasLt64_12.dll. It must be visible on PATH for FaceFusion's CUDA provider.</p>
          <div className="tool-component-row">
            <div>
              <strong>NVIDIA CUDA Toolkit 12.x</strong>
              <span>{hasCudaWarning ? "CUDA provider was detected, but required CUDA 12.x DLLs are missing from the app environment." : "Required only when choosing CUDA instead of DirectML."}</span>
            </div>
            <code>{hasUsableCuda ? "CUDAExecutionProvider available" : "External install recommended"}</code>
          </div>
          <PathButton type="button" onClick={() => onChooseRuntimeFolder("cudaBinFolder")}>
            <span className="material-symbols-rounded" aria-hidden="true">folder</span>
            <span>{cudaFolderLabel}</span>
          </PathButton>
          <div className="tool-dropdown-actions external-only">
            <PrimaryButton onClick={() => onOpenExternalDownload(cudaDownloadUrl)}><span className="material-symbols-rounded" aria-hidden="true">public</span>Download</PrimaryButton>
          </div>
        </ToolAccordionItem>

        <ToolAccordionItem
          value="cudnn"
          title="cuDNN Runtime"
          badge={<StatusBadge tone={cudnnStatusClass}>{cudnnStatusLabel}</StatusBadge>}
          summary={hasCudnn ? "Detected for CUDA provider" : "External NVIDIA install"}
        >
          <p>cuDNN 9 supplies neural-network kernels used by ONNX Runtime GPU. FaceFusion CUDA needs cudnn64_9.dll visible to the app process.</p>
          <div className="tool-component-row">
            <div>
              <strong>NVIDIA cuDNN 9 for CUDA 12.x</strong>
              <span>Install it alongside CUDA 12.x and add its bin folder to PATH.</span>
            </div>
            <code>{hasCudnn ? "cudnn64_9.dll detected" : "External install recommended"}</code>
          </div>
          <PathButton type="button" onClick={() => onChooseRuntimeFolder("cudnnBinFolder")}>
            <span className="material-symbols-rounded" aria-hidden="true">folder</span>
            <span>{cudnnFolderLabel}</span>
          </PathButton>
          <div className="tool-dropdown-actions external-only">
            <PrimaryButton onClick={() => onOpenExternalDownload(cudnnDownloadUrl)}><span className="material-symbols-rounded" aria-hidden="true">public</span>Download</PrimaryButton>
          </div>
        </ToolAccordionItem>
      </Accordion>
    </SettingsSection>
  );
}
