import { FormRow, SecondaryButton, SelectControl } from "@/components/app-controls";
import type { RealEsrganDevice, RealEsrganModel, SelectOption } from "@/components/sidebars/video-actions/types";
import { modelDeviceOptions } from "@/lib/model-devices";

type RealEsrganSettingsProps = {
  models: RealEsrganModel[];
  selectedModel: string;
  devices: RealEsrganDevice[];
  selectedDevice: string;
  preferredModelDevice: string;
  crf: string;
  encoderPreset: string;
  tileSize: string;
  threads: string;
  activeModelScale: string;
  roughUpscaleEta: string;
  crfOptions: string[];
  tileSizeOptions: SelectOption[];
  threadOptions: string[];
  onSetSelectedModel: (value: string) => void;
  onSetSelectedDevice: (value: string) => void;
  onSetCrf: (value: string) => void;
  onSetEncoderPreset: (value: string) => void;
  onSetTileSize: (value: string) => void;
  onSetThreads: (value: string) => void;
  canCompareModels: boolean;
  isComparingModels: boolean;
  hasCurrentVideoComparison: boolean;
  onCompareModels: () => void;
  onViewLastComparison: () => void;
};

export function RealEsrganSettings({
  models,
  selectedModel,
  devices,
  selectedDevice,
  preferredModelDevice,
  crf,
  encoderPreset,
  tileSize,
  threads,
  activeModelScale,
  roughUpscaleEta,
  crfOptions,
  tileSizeOptions,
  threadOptions,
  onSetSelectedModel,
  onSetSelectedDevice,
  onSetCrf,
  onSetEncoderPreset,
  onSetTileSize,
  onSetThreads,
  canCompareModels,
  isComparingModels,
  hasCurrentVideoComparison,
  onCompareModels,
  onViewLastComparison,
}: RealEsrganSettingsProps) {
  return (
    <div className="settings-grid">
      {!models.length && <p role="status">Install the runtime and a model in Settings → Video → Real-ESRGAN to enable upscaling.</p>}
      <SecondaryButton type="button" disabled={!canCompareModels} onClick={onCompareModels}>
        {isComparingModels ? "Show Running Compare" : "Generate Comparison"}
      </SecondaryButton>
      <SecondaryButton type="button" disabled={!hasCurrentVideoComparison} onClick={onViewLastComparison}>
        View Last Comparison
      </SecondaryButton>
      <FormRow label="Model">
        <SelectControl value={selectedModel} onChange={onSetSelectedModel} options={models.length ? models.map((item) => ({ value: item.name, label: `${item.name} (${item.scale}x)` })) : [{ value: "", label: "No models found", disabled: true }]} />
      </FormRow>
      <FormRow label="Device">
        <SelectControl value={selectedDevice} onChange={onSetSelectedDevice} options={modelDeviceOptions(devices, preferredModelDevice)} />
      </FormRow>
      <FormRow label="CRF" help="Constant Rate Factor for final H.264 encoding. Lower is larger and cleaner; 18 is high quality, 23 is common, 28 is smaller.">
        <SelectControl value={crf} onChange={onSetCrf} options={crfOptions.map((value) => ({ value, label: value }))} />
      </FormRow>
      <FormRow label="Encoder Preset">
        <SelectControl value={encoderPreset} onChange={onSetEncoderPreset} options={[{ value: "slow", label: "slow" }, { value: "medium", label: "medium" }, { value: "fast", label: "fast" }]} />
      </FormRow>
      <FormRow label="Tile Size" help="Real-ESRGAN tile size. Auto lets the tool decide. Smaller tiles use less VRAM but can be slower; larger tiles are faster if memory allows.">
        <SelectControl value={tileSize} onChange={onSetTileSize} options={tileSizeOptions} />
      </FormRow>
      <FormRow label="Threads" help="Pipeline threads as load:process:save. 1:2:2 is balanced; 1:1:1 is safest; 2:4:2 is for stronger machines.">
        <SelectControl value={threads} onChange={onSetThreads} options={threadOptions.map((value) => ({ value, label: value }))} />
      </FormRow>
      <p>Scale: {activeModelScale ? `${activeModelScale}x from model` : "No model selected"}</p>
      <p>Rough ETA: {roughUpscaleEta}</p>
    </div>
  );
}
