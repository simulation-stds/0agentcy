import { FormRow, PathButton, SelectControl } from "@/components/app-controls";
import type { FaceFusionStatus, SelectOption } from "@/components/sidebars/video-actions/types";
import { ScanFace } from "lucide-react";

type FaceFusionSettingsProps = {
  faceFusionSourcePath: string;
  faceFusionSourceSrc: string;
  faceFusionSourceName: string;
  faceFusionProcessor: string;
  faceFusionProvider: string;
  faceFusionProviders: SelectOption[];
  faceFusionStatus: FaceFusionStatus | null;
  onChooseFaceFusionSource: () => void;
  onSetFaceFusionProcessor: (value: string) => void;
  onSetFaceFusionProvider: (value: string) => void;
};

export function FaceFusionSettings({
  faceFusionSourcePath,
  faceFusionSourceSrc,
  faceFusionSourceName,
  faceFusionProcessor,
  faceFusionProvider,
  faceFusionProviders,
  faceFusionStatus,
  onChooseFaceFusionSource,
  onSetFaceFusionProcessor,
  onSetFaceFusionProvider,
}: FaceFusionSettingsProps) {
  return (
    <div className="settings-grid">
      <FormRow label="Source face image" help="FaceFusion uses this still image as the source identity for face swap, or as the reference face for enhance-only workflows.">
        <PathButton className="source-preview-button" type="button" onClick={onChooseFaceFusionSource} aria-label={faceFusionSourcePath || "Choose source face image"}>
          {faceFusionSourcePath ? <img className="source-preview-thumb" src={faceFusionSourceSrc} alt="" /> : <ScanFace className="app-icon" />}
          <span>{faceFusionSourcePath ? faceFusionSourceName : "Choose source face image"}</span>
        </PathButton>
      </FormRow>
      <FormRow label="Processor preset">
        <SelectControl
          value={faceFusionProcessor}
          onChange={onSetFaceFusionProcessor}
          options={[
            { value: "face_swap", label: "Face Swap" },
            { value: "swap_enhance", label: "Face Swap + Enhance" },
            { value: "face_enhance", label: "Face Enhance Only" },
          ]} />
      </FormRow>
      <FormRow label="Execution provider" help="Only providers detected inside the FaceFusion Conda environment are shown after install. CUDA only appears when ONNX Runtime can actually load the CUDA DLLs.">
        <SelectControl value={faceFusionProvider} onChange={onSetFaceFusionProvider} options={faceFusionProviders} />
      </FormRow>
      <p>{faceFusionStatus?.message || "FaceFusion status has not been scanned yet."}</p>
      <p>Target: current video selection.</p>
    </div>
  );
}
