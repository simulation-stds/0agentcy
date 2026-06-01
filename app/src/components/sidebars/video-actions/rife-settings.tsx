import { FormRow, SelectControl, SwitchRow } from "@/components/app-controls";
import type { RealEsrganDevice, RifeModel, SelectOption, VideoMetadata } from "@/components/sidebars/video-actions/types";
import { modelDeviceOptions } from "@/lib/model-devices";

type RifeSettingsProps = {
  rifeModels: RifeModel[];
  selectedRifeModel: string;
  rifeMultiplier: string;
  devices: RealEsrganDevice[];
  selectedDevice: string;
  preferredModelDevice: string;
  crf: string;
  encoderPreset: string;
  threads: string;
  rifeTtaSpatial: boolean;
  rifeTtaTemporal: boolean;
  rifeUhd: boolean;
  metadata: VideoMetadata | null;
  roughRifeEta: string;
  crfOptions: string[];
  threadOptions: string[];
  onSetSelectedRifeModel: (value: string) => void;
  onSetRifeMultiplier: (value: string) => void;
  onSetSelectedDevice: (value: string) => void;
  onSetCrf: (value: string) => void;
  onSetEncoderPreset: (value: string) => void;
  onSetThreads: (value: string) => void;
  onSetRifeTtaSpatial: (value: boolean) => void;
  onSetRifeTtaTemporal: (value: boolean) => void;
  onSetRifeUhd: (value: boolean) => void;
};

export function RifeSettings({
  rifeModels,
  selectedRifeModel,
  rifeMultiplier,
  devices,
  selectedDevice,
  preferredModelDevice,
  crf,
  encoderPreset,
  threads,
  rifeTtaSpatial,
  rifeTtaTemporal,
  rifeUhd,
  metadata,
  roughRifeEta,
  crfOptions,
  threadOptions,
  onSetSelectedRifeModel,
  onSetRifeMultiplier,
  onSetSelectedDevice,
  onSetCrf,
  onSetEncoderPreset,
  onSetThreads,
  onSetRifeTtaSpatial,
  onSetRifeTtaTemporal,
  onSetRifeUhd,
}: RifeSettingsProps) {
  const deviceOptions: SelectOption[] = modelDeviceOptions(devices, preferredModelDevice, true);

  return (
    <div className="settings-grid">
      <FormRow label="Model">
        <SelectControl value={selectedRifeModel} onChange={onSetSelectedRifeModel} options={rifeModels.length ? rifeModels.map((item) => ({ value: item.name, label: item.name })) : [{ value: "", label: "No models found", disabled: true }]} />
      </FormRow>
      <FormRow label="Multiplier">
        <SelectControl value={rifeMultiplier} onChange={onSetRifeMultiplier} options={[{ value: "2", label: "2x FPS" }, { value: "4", label: "4x FPS" }, { value: "8", label: "8x FPS" }]} />
      </FormRow>
      <FormRow label="Device">
        <SelectControl value={selectedDevice} onChange={onSetSelectedDevice} options={deviceOptions} />
      </FormRow>
      <FormRow label="CRF" help="Constant Rate Factor for the reassembled interpolated video. Lower is larger and cleaner; 18 is high quality.">
        <SelectControl value={crf} onChange={onSetCrf} options={crfOptions.map((value) => ({ value, label: value }))} />
      </FormRow>
      <FormRow label="Encoder Preset">
        <SelectControl value={encoderPreset} onChange={onSetEncoderPreset} options={[{ value: "slow", label: "slow" }, { value: "medium", label: "medium" }, { value: "fast", label: "fast" }]} />
      </FormRow>
      <FormRow label="Threads" help="Pipeline threads as load:process:save. 1:2:2 is balanced; 1:1:1 is safest; 2:4:2 is more aggressive.">
        <SelectControl value={threads} onChange={onSetThreads} options={threadOptions.map((value) => ({ value, label: value }))} />
      </FormRow>
      <SwitchRow checked={rifeTtaSpatial} onCheckedChange={onSetRifeTtaSpatial} help="Spatial test-time augmentation. RIFE runs extra spatial passes and blends them for possible quality gains at slower speed.">
        Spatial TTA
      </SwitchRow>
      <SwitchRow checked={rifeTtaTemporal} onCheckedChange={onSetRifeTtaTemporal} help="Temporal test-time augmentation. Uses reversed/alternate temporal passes to reduce interpolation artifacts, usually slower.">
        Temporal TTA
      </SwitchRow>
      <SwitchRow checked={rifeUhd} onCheckedChange={onSetRifeUhd} help="UHD mode for large frames. It can reduce memory pressure on high-resolution inputs, but may change speed and detail behavior.">
        UHD mode
      </SwitchRow>
      <p>Output FPS: {metadata ? `${(metadata.fps * Number(rifeMultiplier)).toFixed(3)} fps` : "Load video first"}</p>
      <p>Rough ETA: {roughRifeEta}</p>
    </div>
  );
}
