import { ColorControl, FormRow, RangeControl, SelectControl, SwitchRow, type SelectOption } from "@/components/app-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultDitherSettings, type DitherAlgorithm, type DitherSettings } from "@/lib/app-options";
import { Crop, Palette, RectangleHorizontal, RectangleVertical, Square, WandSparkles, type LucideIcon } from "lucide-react";

type AspectRatioOption = {
  value: string;
  label: string;
  icon: string;
};

const aspectRatioIcons: Record<string, LucideIcon> = {
  image_aspect_ratio: Crop,
  crop_square: Square,
  aspect_ratio: Crop,
  crop_portrait: RectangleVertical,
  crop_16_9: RectangleHorizontal,
  panorama_wide_angle: RectangleHorizontal,
};

export function DitherControls({
  ditherSettings,
  ditherAspectRatio,
  ditherAlgorithms,
  ditherAlgorithmHelp,
  aspectRatios,
  onUpdateDitherSettings,
  onUpdateDitherWidth,
  onUpdateDitherAspectRatio,
}: {
  ditherSettings: DitherSettings;
  ditherAspectRatio: string;
  ditherAlgorithms: SelectOption[];
  ditherAlgorithmHelp: string;
  aspectRatios: AspectRatioOption[];
  onUpdateDitherSettings: (patch: Partial<DitherSettings>) => void;
  onUpdateDitherWidth: (width: number) => void;
  onUpdateDitherAspectRatio: (value: string) => void;
}) {
  return (
    <>
      <div className="panel">
        <h2>Image</h2>
        <div className="settings-grid">
          <FormRow label="Fit mode" help="How the source image is fitted into the output canvas before dithering.">
            <SelectControl value={ditherSettings.fitMode} onChange={(value) => onUpdateDitherSettings({ fitMode: value as DitherSettings["fitMode"] })} options={[
              { value: "contain", label: "Contain" },
              { value: "cover", label: "Cover" },
              { value: "original", label: "Free" },
            ]} />
          </FormRow>
          <FormRow label="Aspect ratio" help="Locks output height from the width. Original uses the source image aspect ratio.">
            <div className="ratio-options" role="radiogroup" aria-label="Aspect ratio">
              {aspectRatios.map((item) => {
                const AspectIcon = aspectRatioIcons[item.icon] ?? Crop;

                return (
                  <Button
                    key={item.value}
                    type="button"
                    className={ditherAspectRatio === item.value ? "active" : ""}
                    onClick={() => onUpdateDitherAspectRatio(item.value)}
                    aria-label={item.label}
                    aria-pressed={ditherAspectRatio === item.value}
                  >
                    <AspectIcon className="app-icon" />
                    {item.label}
                  </Button>
                );
              })}
            </div>
          </FormRow>
          <FormRow label="Output width" help="Output PNG width in pixels. If an aspect ratio is selected, height updates automatically.">
            <Input type="number" min="8" max="4096" value={ditherSettings.outputWidth} onChange={(event) => onUpdateDitherWidth(Number(event.currentTarget.value))} />
          </FormRow>
          <p className="settings-note">Height auto: {ditherSettings.outputHeight}px</p>
        </div>
      </div>

      <DitherColorModeControls ditherSettings={ditherSettings} onUpdateDitherSettings={onUpdateDitherSettings} />
      <DitherLookControls
        ditherSettings={ditherSettings}
        ditherAlgorithms={ditherAlgorithms}
        ditherAlgorithmHelp={ditherAlgorithmHelp}
        onUpdateDitherSettings={onUpdateDitherSettings} />
    </>
  );
}

function DitherColorModeControls({
  ditherSettings,
  onUpdateDitherSettings,
}: {
  ditherSettings: DitherSettings;
  onUpdateDitherSettings: (patch: Partial<DitherSettings>) => void;
}) {
  return (
    <>
      <div className="dither-mode-switch" role="radiogroup" aria-label="Dither color mode">
        <Button type="button" className={!ditherSettings.usePalette ? "active" : ""} onClick={() => onUpdateDitherSettings({ usePalette: false })} aria-pressed={!ditherSettings.usePalette}>
          <Palette className="app-icon" />
          Source Colors
        </Button>
        <Button type="button" className={ditherSettings.usePalette ? "active" : ""} onClick={() => onUpdateDitherSettings({ usePalette: true })} aria-pressed={ditherSettings.usePalette}>
          <WandSparkles className="app-icon" />
          Palette
        </Button>
      </div>

      {ditherSettings.usePalette && (
        <div className="panel palette-panel">
          <h2>Palette</h2>
          <div className="settings-grid">
            <ColorControl
              label="Shadow"
              help="Darkest color used by the dither palette."
              value={ditherSettings.shadowColor}
              onChange={(value) => onUpdateDitherSettings({ shadowColor: value })} />
            <ColorControl
              label="Mid"
              help="Middle color used by the dither palette."
              value={ditherSettings.midColor}
              onChange={(value) => onUpdateDitherSettings({ midColor: value })} />
            <ColorControl
              label="Highlight"
              help="Lightest color used by the dither palette."
              value={ditherSettings.highlightColor}
              onChange={(value) => onUpdateDitherSettings({ highlightColor: value })} />
            <SwitchRow
              checked={ditherSettings.invertPalette}
              onCheckedChange={(checked) => onUpdateDitherSettings({ invertPalette: checked })}
              help="Swaps the luminance mapping so shadows use highlight colors and highlights use shadow colors."
            >
              Invert palette
            </SwitchRow>
          </div>
        </div>
      )}
    </>
  );
}

function DitherLookControls({
  ditherSettings,
  ditherAlgorithms,
  ditherAlgorithmHelp,
  onUpdateDitherSettings,
}: {
  ditherSettings: DitherSettings;
  ditherAlgorithms: SelectOption[];
  ditherAlgorithmHelp: string;
  onUpdateDitherSettings: (patch: Partial<DitherSettings>) => void;
}) {
  const isBayer = ditherSettings.algorithm === "bayer";
  const isHalftone = ditherSettings.algorithm === "halftone";
  const isNoise = ditherSettings.algorithm === "blue_noise" || ditherSettings.algorithm === "random_noise";
  const isErrorDiffusion = ditherSettings.algorithm === "floyd_steinberg" || ditherSettings.algorithm === "atkinson";
  const strengthLabel = isErrorDiffusion ? "Diffusion strength" : "Dither strength";
  const strengthHelp = isErrorDiffusion
    ? "How much quantization error is pushed into neighboring pixels. Lower values reduce grain; higher values keep more detail."
    : "How strongly the chosen threshold pattern affects luminance before palette or source-color mapping.";
  const halftoneAngle = ditherSettings.halftoneAngle ?? defaultDitherSettings.halftoneAngle;
  const halftoneShape = ditherSettings.halftoneShape ?? defaultDitherSettings.halftoneShape;
  const noiseScale = ditherSettings.noiseScale ?? defaultDitherSettings.noiseScale;
  const noiseSeed = ditherSettings.noiseSeed ?? defaultDitherSettings.noiseSeed;

  return (
    <div className="panel">
      <h2>Look</h2>
      <div className="settings-grid">
        <FormRow label="Algorithm" help={ditherAlgorithmHelp}>
          <SelectControl value={ditherSettings.algorithm} onChange={(value) => onUpdateDitherSettings({ algorithm: value as DitherAlgorithm })} options={ditherAlgorithms} />
        </FormRow>
        {isBayer && (
          <FormRow label="Bayer size" help="Ordered dithering matrix size. 4x4 is balanced; larger sizes create finer, more regular threshold patterns.">
            <SelectControl value={String(ditherSettings.bayerSize)} onChange={(value) => onUpdateDitherSettings({ bayerSize: Number(value) })} options={[
              { value: "2", label: "2x2" },
              { value: "4", label: "4x4" },
              { value: "8", label: "8x8" },
              { value: "16", label: "16x16" },
            ]} />
          </FormRow>
        )}
        {isHalftone && (
          <>
            <FormRow label="Dot size" help="Controls the halftone screen cell size. Larger values make bigger, more visible print-style dots.">
              <SelectControl value={String(ditherSettings.bayerSize)} onChange={(value) => onUpdateDitherSettings({ bayerSize: Number(value) })} options={[
                { value: "2", label: "Small" },
                { value: "4", label: "Medium" },
                { value: "8", label: "Large" },
                { value: "16", label: "Extra large" },
              ]} />
            </FormRow>
            <RangeControl
              label="Screen angle"
              help="Rotates the halftone dot grid. Angled screens usually look more natural than a straight horizontal grid."
              min="0"
              max="90"
              step="1"
              value={halftoneAngle}
              displayValue={`${halftoneAngle}deg`}
              onChange={(value) => onUpdateDitherSettings({ halftoneAngle: Number(value) })} />
            <FormRow label="Dot shape" help="Changes the threshold shape inside each halftone cell. Round is classic; diamond and line are more graphic.">
              <SelectControl value={halftoneShape} onChange={(value) => onUpdateDitherSettings({ halftoneShape: value as DitherSettings["halftoneShape"] })} options={[
                { value: "round", label: "Round" },
                { value: "diamond", label: "Diamond" },
                { value: "line", label: "Line" },
              ]} />
            </FormRow>
          </>
        )}
        {isNoise && (
          <>
            <RangeControl
              label="Noise scale"
              help="Controls the size of the noise texture. 1 keeps noise at pixel level; higher values make rougher, chunkier grain."
              min="1"
              max="16"
              step="1"
              value={noiseScale}
              displayValue={`${noiseScale}px`}
              onChange={(value) => onUpdateDitherSettings({ noiseScale: Number(value) })} />
            <RangeControl
              label="Noise seed"
              help="Changes the deterministic noise pattern without changing the rest of the look."
              min="0"
              max="99"
              step="1"
              value={noiseSeed}
              displayValue={noiseSeed}
              onChange={(value) => onUpdateDitherSettings({ noiseSeed: Number(value) })} />
          </>
        )}
        <RangeControl
          label="Pixel size"
          help="Size of each rendered pixel block. Larger values create a chunkier pixel-art look."
          min="1"
          max="32"
          step="1"
          value={ditherSettings.pixelScale}
          displayValue={`${ditherSettings.pixelScale}x`}
          onChange={(value) => onUpdateDitherSettings({ pixelScale: Number(value) })} />
        <RangeControl label={strengthLabel} help={strengthHelp} min="0" max="1" step="0.01" value={ditherSettings.ditherStrength} displayValue={ditherSettings.ditherStrength.toFixed(2)} onChange={(value) => onUpdateDitherSettings({ ditherStrength: Number(value) })} />
        <RangeControl label="Posterize levels" help="Number of luminance steps before palette mapping. Lower creates flatter posterized bands." min="2" max="16" step="1" value={ditherSettings.posterizeLevels} displayValue={ditherSettings.posterizeLevels} onChange={(value) => onUpdateDitherSettings({ posterizeLevels: Number(value) })} />
        <RangeControl label="Black point" help="Input luminance value that maps to the darkest palette color." min="0" max="0.95" step="0.01" value={ditherSettings.blackPoint} displayValue={ditherSettings.blackPoint.toFixed(2)} onChange={(value) => onUpdateDitherSettings({ blackPoint: Number(value) })} />
        <RangeControl label="White point" help="Input luminance value that maps to the lightest palette color." min="0.05" max="1" step="0.01" value={ditherSettings.whitePoint} displayValue={ditherSettings.whitePoint.toFixed(2)} onChange={(value) => onUpdateDitherSettings({ whitePoint: Number(value) })} />
        <RangeControl label="Gamma" help="Midtone curve. Lower brightens midtones; higher darkens midtones." min="0.2" max="3" step="0.01" value={ditherSettings.gamma} displayValue={ditherSettings.gamma.toFixed(2)} onChange={(value) => onUpdateDitherSettings({ gamma: Number(value) })} />
        <RangeControl label="Contrast" help="Pushes values away from or toward middle gray before dithering." min="-1" max="1" step="0.01" value={ditherSettings.contrast} displayValue={ditherSettings.contrast.toFixed(2)} onChange={(value) => onUpdateDitherSettings({ contrast: Number(value) })} />
        <RangeControl label="Brightness" help="Adds or subtracts brightness before palette mapping." min="-1" max="1" step="0.01" value={ditherSettings.brightness} displayValue={ditherSettings.brightness.toFixed(2)} onChange={(value) => onUpdateDitherSettings({ brightness: Number(value) })} />
      </div>
    </div>
  );
}
