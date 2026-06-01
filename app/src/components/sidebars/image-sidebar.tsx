import type { DragEvent } from "react";
import { FieldLabel, FormRow, PrimaryButton, RangeControl, SecondaryButton, SelectControl, SwitchRow, type SelectOption } from "@/components/app-controls";
import { DitherControls } from "@/components/sidebars/dither-controls";
import { ImageActionPanel, ImageDropZone } from "@/components/sidebars/image-sidebar-sections";
import { PaletteControls } from "@/components/sidebars/palette-controls";
import type { RealEsrganDevice } from "@/hooks/use-tool-state";
import type { CompressorSizeSummary } from "@/hooks/use-image-tools";
import type { DitherSettings, ImageCompressorSettings, PaletteSettings } from "@/lib/app-options";
import type { ImageDimensions } from "@/hooks/use-image-file-input";
import { modelDeviceOptions } from "@/lib/model-devices";
import { Input } from "@/components/ui/input";

type AspectRatioOption = {
  value: string;
  label: string;
  icon: string;
};

type ImageSidebarProps = {
  imageSrc: string;
  imageName: string;
  imagePath: string;
  imageObjectUrl: string;
  imageDimensions: ImageDimensions | null;
  isAnimatedGif: boolean;
  imageAction: string;
  imageOutputName: string;
  imageMeta: string;
  ditherComparePreview: boolean;
  compressorSettings: ImageCompressorSettings;
  compressorStatus: string;
  compressorOutputPath: string;
  compressorSizeSummary: CompressorSizeSummary | null;
  isRunningCompressor: boolean;
  isDitherReady: boolean;
  ditherSettings: DitherSettings;
  ditherAspectRatio: string;
  ditherAlgorithms: SelectOption[];
  ditherAlgorithmHelp: string;
  aspectRatios: AspectRatioOption[];
  paletteSettings: PaletteSettings;
  hasPaletteResult: boolean;
  supirModel: string;
  supirPreset: string;
  supirDevice: string;
  supirUpscale: string;
  supirUseLlava: boolean;
  isRunningSupir: boolean;
  devices: RealEsrganDevice[];
  preferredModelDevice: string;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onChooseInputImage: () => void;
  onSetImageAction: (value: string) => void;
  onSetImageOutputName: (value: string) => void;
  onSetDitherComparePreview: (checked: boolean) => void;
  onUpdateCompressorSettings: (patch: Partial<ImageCompressorSettings>) => void;
  onUpdateDitherSettings: (patch: Partial<DitherSettings>) => void;
  onUpdateDitherWidth: (width: number) => void;
  onUpdateDitherAspectRatio: (value: string) => void;
  onDownloadDitherPng: () => void;
  onPreviewCompressor: () => void;
  onSaveCompressorPreview: () => void;
  onUpdatePaletteSettings: (patch: Partial<PaletteSettings>) => void;
  onCopyPaletteCss: () => void;
  onDownloadPaletteCss: () => void;
  onDownloadPaletteSheet: () => void;
  onSetSupirModel: (value: string) => void;
  onSetSupirPreset: (value: string) => void;
  onSetSupirDevice: (value: string) => void;
  onSetSupirUpscale: (value: string) => void;
  onSetSupirUseLlava: (checked: boolean) => void;
  onRunSupir: () => void;
  onCancelSupir: () => void;
};

export function ImageSidebar({
  imageSrc,
  imageName,
  imagePath,
  imageObjectUrl,
  imageDimensions,
  isAnimatedGif,
  imageAction,
  imageOutputName,
  imageMeta,
  ditherComparePreview,
  compressorSettings,
  compressorStatus,
  compressorOutputPath,
  compressorSizeSummary,
  isRunningCompressor,
  isDitherReady,
  ditherSettings,
  ditherAspectRatio,
  ditherAlgorithms,
  ditherAlgorithmHelp,
  aspectRatios,
  paletteSettings,
  hasPaletteResult,
  supirModel,
  supirPreset,
  supirDevice,
  supirUpscale,
  supirUseLlava,
  isRunningSupir,
  devices,
  preferredModelDevice,
  onDrop,
  onChooseInputImage,
  onSetImageAction,
  onSetImageOutputName,
  onSetDitherComparePreview,
  onUpdateCompressorSettings,
  onUpdateDitherSettings,
  onUpdateDitherWidth,
  onUpdateDitherAspectRatio,
  onDownloadDitherPng,
  onPreviewCompressor,
  onSaveCompressorPreview,
  onUpdatePaletteSettings,
  onCopyPaletteCss,
  onDownloadPaletteCss,
  onDownloadPaletteSheet,
  onSetSupirModel,
  onSetSupirPreset,
  onSetSupirDevice,
  onSetSupirUpscale,
  onSetSupirUseLlava,
  onRunSupir,
  onCancelSupir,
}: ImageSidebarProps) {
  return (
    <aside className="sidebar">
      <ImageDropZone
        imageSrc={imageSrc}
        imageName={imageName}
        imagePath={imagePath}
        imageObjectUrl={imageObjectUrl}
        onDrop={onDrop}
        onChooseInputImage={onChooseInputImage}
      />
      <ImageActionPanel imageAction={imageAction} onSetImageAction={onSetImageAction} />

      {(imageAction === "dither" || imageAction === "compress") && (
        <section className="panel">
          <h2>Preview</h2>
          {imageAction === "dither" && (
            <SwitchRow
              checked={ditherComparePreview}
              onCheckedChange={onSetDitherComparePreview}
              help="Compare the original image against the current dither preview with a split view."
            >
              Compare original
            </SwitchRow>
          )}
          {imageAction === "compress" && (
            <>
              <SwitchRow
                checked={compressorSettings.compareOriginal}
                onCheckedChange={(checked) => onUpdateCompressorSettings({ compareOriginal: checked })}
                help="Compare the original image against the compressed output with a split view."
              >
                Compare original
              </SwitchRow>
              {isAnimatedGif && (
                <SecondaryButton type="button" disabled={!imagePath || isRunningCompressor} onClick={onPreviewCompressor}>
                  Preview
                </SecondaryButton>
              )}
            </>
          )}
        </section>
      )}

      {imageAction === "dither" && (
        <DitherControls
          ditherSettings={ditherSettings}
          ditherAspectRatio={ditherAspectRatio}
          ditherAlgorithms={ditherAlgorithms}
          ditherAlgorithmHelp={ditherAlgorithmHelp}
          aspectRatios={aspectRatios}
          onUpdateDitherSettings={onUpdateDitherSettings}
          onUpdateDitherWidth={onUpdateDitherWidth}
          onUpdateDitherAspectRatio={onUpdateDitherAspectRatio}
        />
      )}

      {imageAction === "palette" && (
        <PaletteControls
          paletteSettings={paletteSettings}
          onUpdatePaletteSettings={onUpdatePaletteSettings}
        />
      )}

      {imageAction === "compress" && (
        <ImageCompressorControls
          settings={compressorSettings}
          isAnimatedGif={isAnimatedGif}
          onUpdate={onUpdateCompressorSettings}
        />
      )}

      {imageAction === "supir" && (
        <section className="panel">
          <h2>Setup</h2>
          <FormRow label="Model" help="SUPIR v0Q prioritizes perceptual restoration. SUPIR v0F prioritizes fidelity.">
            <SelectControl
              value={supirModel}
              onChange={onSetSupirModel}
              options={[
                { value: "SUPIR-v0Q", label: "SUPIR v0Q" },
                { value: "SUPIR-v0F", label: "SUPIR v0F" },
              ]}
            />
          </FormRow>
          <FormRow label="Preset" help="Low VRAM uses tiled VAE and reduced defaults.">
            <SelectControl
              value={supirPreset}
              onChange={onSetSupirPreset}
              options={[
                { value: "quality", label: "Quality" },
                { value: "fidelity", label: "Fidelity" },
                { value: "low_vram", label: "Low VRAM" },
              ]}
            />
          </FormRow>
          <FormRow label="Upscale" help="SUPIR will restore the image and write a PNG preview result.">
            <SelectControl
              value={supirUpscale}
              onChange={onSetSupirUpscale}
              options={[
                { value: "1", label: "1x" },
                { value: "2", label: "2x" },
                { value: "4", label: "4x" },
              ]}
            />
          </FormRow>
          <FormRow label="Device" help="Favourite uses the preferred GPU selected in General settings. SUPIR is CUDA-only.">
            <SelectControl
              value={supirDevice}
              onChange={onSetSupirDevice}
              options={modelDeviceOptions(devices, preferredModelDevice)}
            />
          </FormRow>
          <SwitchRow checked={supirUseLlava} onCheckedChange={onSetSupirUseLlava} help="LLaVA can improve prompt guidance, but it increases memory use and may need its own model download.">
            LLaVA guidance
          </SwitchRow>
        </section>
      )}

      <section className="panel">
        <h2>Output</h2>
        <FormRow label="Name" help="Image outputs are saved in the Image folder inside the general output folder.">
          <Input value={imageOutputName} onChange={(event) => onSetImageOutputName(event.currentTarget.value)} />
        </FormRow>
        {imageAction === "dither" && (
          <PrimaryButton type="button" disabled={!isDitherReady} onClick={onDownloadDitherPng}>
            Run Action
          </PrimaryButton>
        )}
        {imageAction === "palette" && (
          <div className="settings-grid">
            <SecondaryButton type="button" disabled={!hasPaletteResult} onClick={onCopyPaletteCss}>
              Copy CSS
            </SecondaryButton>
            <SecondaryButton type="button" disabled={!hasPaletteResult} onClick={onDownloadPaletteCss}>
              Save CSS
            </SecondaryButton>
            <PrimaryButton type="button" disabled={!hasPaletteResult} onClick={onDownloadPaletteSheet}>
              Save Sheet
            </PrimaryButton>
          </div>
        )}
        {imageAction === "compress" && (
          <PrimaryButton type="button" disabled={!compressorOutputPath || isRunningCompressor} onClick={onSaveCompressorPreview}>
            Save
          </PrimaryButton>
        )}
        {imageAction === "supir" && (
          <>
            <PrimaryButton type="button" disabled={!imagePath || isRunningSupir} onClick={onRunSupir}>
              Run Action
            </PrimaryButton>
            <SecondaryButton type="button" className="danger-action" disabled={!isRunningSupir} onClick={onCancelSupir}>
              Cancel
            </SecondaryButton>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Metadata</h2>
        {imagePath || imageObjectUrl ? (
          <>
            <p><FieldLabel help="Original image dimensions detected from the loaded file.">Source</FieldLabel> {imageDimensions ? `${imageDimensions.width}x${imageDimensions.height}` : "Detecting..."}</p>
            <p><FieldLabel help="Current preview or sampling metadata for the selected image tool.">Preview</FieldLabel> <MetadataValue value={imageMeta || "Pending"} /></p>
            {imageAction === "compress" && (
              <>
                <p><FieldLabel help="Latest compressor output status.">Compressor</FieldLabel> <MetadataValue value={compressorStatus} /></p>
                {compressorSizeSummary && (
                  <p><FieldLabel help="Source size, preview output size, and estimated savings.">Disk</FieldLabel> <span className="metadata-size-row"><code>{compressorSizeSummary.before}</code><span>to</span><code>{compressorSizeSummary.after}</code><span>{compressorSizeSummary.saved}</span></span></p>
                )}
              </>
            )}
          </>
        ) : (
          <p>No image loaded</p>
        )}
      </section>
    </aside>
  );
}

function ImageCompressorControls({
  settings,
  isAnimatedGif,
  onUpdate,
}: {
  settings: ImageCompressorSettings;
  isAnimatedGif: boolean;
  onUpdate: (patch: Partial<ImageCompressorSettings>) => void;
}) {
  const lossy = settings.format === "jpg" || settings.format === "webp" || settings.format === "avif" || settings.format === "gif";
  const canLossless = settings.format === "webp" || settings.format === "avif";
  const formatOptions: SelectOption[] = isAnimatedGif
    ? [
        { value: "gif", label: "GIF" },
        { value: "webp", label: "Animated WebP" },
        { value: "apng", label: "APNG" },
      ]
    : [
        { value: "png", label: "PNG" },
        { value: "jpg", label: "JPEG" },
        { value: "webp", label: "WebP" },
        { value: "avif", label: "AVIF" },
      ];

  return (
    <section className="panel">
      <h2>Setup</h2>
      <FormRow label="Format" help="Choose the compressed output format. Animated GIF input can be preserved for GIF, WebP, and APNG outputs.">
        <SelectControl
          value={settings.format}
          onChange={(value) => onUpdate({ format: value as ImageCompressorSettings["format"] })}
          options={formatOptions}
        />
      </FormRow>
      {lossy && !settings.lossless && (
        <RangeControl
          label="Quality"
          help="Higher quality keeps more detail and creates larger files."
          min="1"
          max="100"
          step="1"
          value={settings.quality}
          displayValue={`${settings.quality}%`}
          onChange={(value) => onUpdate({ quality: Number(value) })}
        />
      )}
      {canLossless && (
        <SwitchRow checked={settings.lossless} onCheckedChange={(checked) => onUpdate({ lossless: checked })} help="Lossless keeps exact pixels where supported, usually with larger files.">
          Lossless
        </SwitchRow>
      )}
      <SwitchRow checked={settings.reducePalette} onCheckedChange={(checked) => onUpdate({ reducePalette: checked })} help="Reduce color count before encoding. This can make PNG, GIF, APNG, and lossless WebP much smaller.">
        Reduce palette
      </SwitchRow>
      {settings.reducePalette && (
        <>
          <RangeControl
            label="Palette colors"
            help="Maximum number of colors kept before compression."
            min="2"
            max="256"
            step="1"
            value={settings.paletteColors}
            displayValue={`${settings.paletteColors}`}
            onChange={(value) => onUpdate({ paletteColors: Number(value) })}
          />
          <SwitchRow checked={settings.paletteDither} onCheckedChange={(checked) => onUpdate({ paletteDither: checked })} help="Dither color reduction to hide banding. Turning it off can compress flatter graphics better.">
            Palette dithering
          </SwitchRow>
        </>
      )}
      <FormRow label="Effort" help="Higher effort can make smaller files but takes longer.">
        <SelectControl
          value={settings.effort}
          onChange={(value) => onUpdate({ effort: value as ImageCompressorSettings["effort"] })}
          options={[
            { value: "fast", label: "Fast" },
            { value: "balanced", label: "Balanced" },
            { value: "smallest", label: "Smallest" },
          ]}
        />
      </FormRow>
      <SwitchRow checked={settings.keepMetadata} onCheckedChange={(checked) => onUpdate({ keepMetadata: checked })} help="Keep metadata when the selected codec supports it. Stripping metadata usually makes files smaller.">
        Keep metadata
      </SwitchRow>
      {isAnimatedGif && (
        <SwitchRow checked={settings.preserveAnimation} onCheckedChange={(checked) => onUpdate({ preserveAnimation: checked })} help="When enabled, animated GIF inputs stay animated for GIF, WebP, or APNG outputs.">
          Preserve animation
        </SwitchRow>
      )}
    </section>
  );
}

function MetadataValue({ value }: { value: string }) {
  const looksLikePath = /(^[a-zA-Z]:[\\/])|([\\/][^\\/]+[\\/])/.test(value);
  return <span className={looksLikePath ? "metadata-value file-path-text" : "metadata-value"}>{value}</span>;
}
