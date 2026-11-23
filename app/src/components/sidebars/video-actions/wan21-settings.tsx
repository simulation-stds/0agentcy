import { FormRow, RangeControl, SelectControl, SwitchRow } from "@/components/app-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RealEsrganDevice } from "@/components/sidebars/video-actions/types";
import { RectangleHorizontal, RectangleVertical } from "lucide-react";

type Wan21SettingsProps = {
  orientation: string;
  size: string;
  frameCount: string;
  steps: string;
  guidance: string;
  seed: string;
  selectedDevice: string;
  devices: RealEsrganDevice[];
  preferredModelDevice: string;
  offloadModel: boolean;
  t5Cpu: boolean;
  onSetOrientation: (value: string) => void;
  onSetFrameCount: (value: string) => void;
  onSetSteps: (value: string) => void;
  onSetGuidance: (value: string) => void;
  onSetSeed: (value: string) => void;
  onSetSelectedDevice: (value: string) => void;
  onSetOffloadModel: (value: boolean) => void;
  onSetT5Cpu: (value: boolean) => void;
};

export function Wan21Settings({
  orientation,
  size,
  frameCount,
  steps,
  guidance,
  seed,
  selectedDevice,
  devices,
  preferredModelDevice,
  offloadModel,
  t5Cpu,
  onSetOrientation,
  onSetFrameCount,
  onSetSteps,
  onSetGuidance,
  onSetSeed,
  onSetSelectedDevice,
  onSetOffloadModel,
  onSetT5Cpu,
}: Wan21SettingsProps) {
  const deviceOptions = [
    { value: "", label: preferredModelDevice ? "Use preferred GPU" : "Auto" },
    ...devices.map((device) => ({ value: device.id, label: `GPU ${device.id} - ${device.name}` })),
    { value: "cpu", label: "CPU" },
  ];
  const frameNumber = normalizedWanFrameCount(frameCount);
  const durationSeconds = frameNumber / 16;

  return (
    <>
      <FormRow label="Orientation" help="Wan2.1 T2V-1.3B supports the 480p horizontal and vertical presets used here.">
        <div className="dither-mode-switch" role="radiogroup" aria-label="Wan2.1 orientation">
          <Button type="button" className={orientation === "horizontal" ? "active" : ""} onClick={() => onSetOrientation("horizontal")} aria-pressed={orientation === "horizontal"}>
            <RectangleHorizontal className="app-icon" />
            Horizontal
          </Button>
          <Button type="button" className={orientation === "vertical" ? "active" : ""} onClick={() => onSetOrientation("vertical")} aria-pressed={orientation === "vertical"}>
            <RectangleVertical className="app-icon" />
            Vertical
          </Button>
        </div>
      </FormRow>

      <p className="settings-note">Output size: {size}</p>

      <div className="settings-grid compact-settings">
        <RangeControl
          label="Duration"
          help="Wan2.1 T2V-1.3B saves at 16 fps and requires frame counts in a 4n+1 pattern. This slider chooses valid frame counts and shows the approximate time."
          value={frameNumber}
          min={9}
          max={129}
          step={4}
          displayValue={`${durationSeconds.toFixed(1)}s (${frameNumber} frames)`}
          onChange={onSetFrameCount} />
        <FormRow label="Steps" help="Sampling steps. Higher values can improve quality but are much slower.">
          <Input type="number" min="1" max="50" step="1" value={steps} onChange={(event) => onSetSteps(event.currentTarget.value)} />
        </FormRow>
        <FormRow label="Guidance" help="Prompt guidance scale passed to Wan sample_guide_scale.">
          <Input type="number" min="0" max="20" step="0.1" value={guidance} onChange={(event) => onSetGuidance(event.currentTarget.value)} />
        </FormRow>
        <FormRow label="Seed" help="Leave empty for Wan to choose a random seed.">
          <Input value={seed} onChange={(event) => onSetSeed(event.currentTarget.value)} placeholder="Random" />
        </FormRow>
      </div>

      <FormRow label="GPU" help="Uses the preferred GPU by default. CPU is available only as a diagnostic fallback.">
        <SelectControl value={selectedDevice} onChange={onSetSelectedDevice} options={deviceOptions} />
      </FormRow>

      <SwitchRow checked={offloadModel} onCheckedChange={onSetOffloadModel} help="Moves model parts between CPU and GPU to reduce VRAM use.">
        Offload model
      </SwitchRow>
      <SwitchRow checked={t5Cpu} onCheckedChange={onSetT5Cpu} help="Keeps the text encoder on CPU to reduce GPU memory pressure.">
        T5 on CPU
      </SwitchRow>
    </>
  );
}

function normalizedWanFrameCount(value: string) {
  const numeric = Math.max(9, Math.min(129, Math.round(Number(value) || 25)));
  const offset = numeric - 9;
  return 9 + Math.round(offset / 4) * 4;
}
