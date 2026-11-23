import type { DragEvent } from "react";
import { FormRow, PathButton, RangeControl, SelectControl, SwitchRow } from "@/components/app-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RealEsrganDevice } from "@/components/sidebars/video-actions/types";
import { fileName } from "@/lib/media-utils";
import { ImagePlus, RectangleHorizontal, RectangleVertical, X } from "lucide-react";

type Wan22SettingsProps = {
  referencePath: string;
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
  convertModelDtype: boolean;
  t5Cpu: boolean;
  onChooseReference: () => void;
  onSetReference: (path: string) => void;
  onClearReference: () => void;
  onSetOrientation: (value: string) => void;
  onSetFrameCount: (value: string) => void;
  onSetSteps: (value: string) => void;
  onSetGuidance: (value: string) => void;
  onSetSeed: (value: string) => void;
  onSetSelectedDevice: (value: string) => void;
  onSetOffloadModel: (value: boolean) => void;
  onSetConvertModelDtype: (value: boolean) => void;
  onSetT5Cpu: (value: boolean) => void;
};

export function Wan22Settings({
  referencePath,
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
  convertModelDtype,
  t5Cpu,
  onChooseReference,
  onSetReference,
  onClearReference,
  onSetOrientation,
  onSetFrameCount,
  onSetSteps,
  onSetGuidance,
  onSetSeed,
  onSetSelectedDevice,
  onSetOffloadModel,
  onSetConvertModelDtype,
  onSetT5Cpu,
}: Wan22SettingsProps) {
  const deviceOptions = [
    { value: "", label: preferredModelDevice ? "Use preferred GPU" : "Auto" },
    ...devices.map((device) => ({ value: device.id, label: `GPU ${device.id} - ${device.name}` })),
    { value: "cpu", label: "CPU" },
  ];
  const frameNumber = normalizedWanFrameCount(frameCount);
  const durationSeconds = frameNumber / 24;

  function handleReferenceDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0] as (File & { path?: string }) | undefined;
    if (file?.path && /\.(png|jpe?g|webp|bmp)$/i.test(file.name)) {
      onSetReference(file.path);
    }
  }

  return (
    <>
      <FormRow label="Reference image" help="Optional image-to-video reference. Leave empty for text-to-video generation.">
        <div className="source-preview-stack">
          <PathButton
            className="source-preview-button"
            type="button"
            onClick={onChooseReference}
            onDrop={handleReferenceDrop}
            onDragOver={(event) => event.preventDefault()}
            aria-label={referencePath || "Choose Wan2.2 reference image"}
          >
            {referencePath ? (
              <span>{fileName(referencePath)}</span>
            ) : (
              <>
                <ImagePlus className="app-icon" />
                Choose image
              </>
            )}
          </PathButton>
          {referencePath && (
            <Button type="button" variant="outline" className="icon-button" title="Clear reference image" onClick={onClearReference}>
              <X className="app-icon" />
            </Button>
          )}
        </div>
      </FormRow>

      <FormRow label="Orientation" help="Wan2.2 TI2V-5B supports the 720p horizontal and vertical presets used here.">
        <div className="dither-mode-switch" role="radiogroup" aria-label="Wan2.2 orientation">
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

      <p className="settings-note">
        Output size: {size}
      </p>

      <div className="settings-grid compact-settings">
        <RangeControl
          label="Duration"
          help="Wan2.2 TI2V-5B generates at 24 fps and requires frame counts in a 4n+1 pattern. This slider chooses valid frame counts and shows the approximate time: 25 frames is about 1 second, 241 frames is about 10 seconds."
          value={frameNumber}
          min={25}
          max={241}
          step={4}
          displayValue={`${durationSeconds.toFixed(1)}s (${frameNumber} frames)`}
          onChange={onSetFrameCount} />
        <FormRow label="Steps" help="Sampling steps. Higher values can improve quality but are much slower.">
          <Input type="number" min="1" max="80" step="1" value={steps} onChange={(event) => onSetSteps(event.currentTarget.value)} />
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
      <SwitchRow checked={convertModelDtype} onCheckedChange={onSetConvertModelDtype} help="Uses Wan's dtype conversion flag for lower memory usage.">
        Convert model dtype
      </SwitchRow>
      <SwitchRow checked={t5Cpu} onCheckedChange={onSetT5Cpu} help="Keeps the text encoder on CPU to reduce GPU memory pressure.">
        T5 on CPU
      </SwitchRow>
    </>
  );
}

function normalizedWanFrameCount(value: string) {
  const numeric = Math.max(25, Math.min(241, Math.round(Number(value) || 49)));
  const offset = numeric - 25;
  return 25 + Math.round(offset / 4) * 4;
}
