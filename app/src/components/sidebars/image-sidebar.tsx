import type { ReactNode, DragEvent } from "react";
import { FieldLabel, FormRow, PrimaryButton, RangeControl, SecondaryButton, SelectControl, SwitchRow, type SelectOption } from "@/components/app-controls";
import { GenerativeSizeControls, type GenerativeReferenceItem } from "@/components/generative-controls";
import { DitherControls } from "@/components/sidebars/dither-controls";
import { ImageActionPanel, ImageDropZone } from "@/components/sidebars/image-sidebar-sections";
import { PaletteControls } from "@/components/sidebars/palette-controls";
import type { RealEsrganDevice } from "@/hooks/use-tool-state";
import type { CompressorSizeSummary } from "@/hooks/use-image-tools";
import type { DitherSettings, ImageCompressorSettings, PaletteSettings } from "@/lib/app-options";
import type { ImageDimensions } from "@/hooks/use-image-file-input";
import type { GenerativeAspectOrientation } from "@/lib/generative-sizing";
import { modelDeviceOptions } from "@/lib/model-devices";
import { Input } from "@/components/ui/input";

type AspectRatioOption = {
  value: string;
  label: string;
  icon: string;
};

type ImageSidebarProps = {
  vosrControls: ReactNode;
  vosrBusy: boolean;
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
  flux2AspectOrientation: GenerativeAspectOrientation;
  flux2AspectRatio: string;
  flux2Width: string;
  flux2Height: string;
  flux2Steps: number;
  flux2Guidance: number;
  flux2Seed: string;
  flux2Device: string;
  flux2CpuOffload: boolean;
  flux2References: GenerativeReferenceItem[];
  isRunningFlux2: boolean;
  flux2Status: string;
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
  onSetFlux2AspectOrientation: (value: GenerativeAspectOrientation) => void;
  onSetFlux2AspectRatio: (value: string) => void;
  onSetFlux2Width: (value: string) => void;
  onSetFlux2Steps: (value: number) => void;
  onSetFlux2Guidance: (value: number) => void;
  onSetFlux2Seed: (value: string) => void;
  onSetFlux2Device: (value: string) => void;
  onSetFlux2CpuOffload: (checked: boolean) => void;
  onRemoveFlux2Reference: (id: string) => void;
};

export function ImageSidebar({
  vosrControls,
  vosrBusy,
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
  flux2AspectOrientation,
  flux2AspectRatio,
  flux2Width,
  flux2Height,
  flux2Steps,
  flux2Guidance,
  flux2Seed,
  flux2Device,
  flux2CpuOffload,
  flux2References,
  isRunningFlux2,
  flux2Status,
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
  onSetFlux2AspectOrientation,
  onSetFlux2AspectRatio,
  onSetFlux2Width,
  onSetFlux2Steps,
  onSetFlux2Guidance,
  onSetFlux2Seed,
  onSetFlux2Device,
  onSetFlux2CpuOffload,
  onRemoveFlux2Reference,
}: ImageSidebarProps) {
  return (
    <aside className="sidebar">
      <ImageDropZone
        imageSrc={imageSrc}
        imageName={imageName}
        imagePath={imagePath}
        imageObjectUrl={imageObjectUrl}
        isGenerative={imageAction === "flux2"}
        disabled={vosrBusy || (imageAction === "flux2" && isRunningFlux2)}
        references={flux2References}
        onDrop={onDrop}
        onChooseInputImage={onChooseInputImage}
        onRemoveReference={onRemoveFlux2Reference} />
      <ImageActionPanel imageAction={imageAction} onSetImageAction={onSetImageAction} disabled={vosrBusy} />

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
          onUpdateDitherAspectRatio={onUpdateDitherAspectRatio} />
      )}

      {imageAction === "palette" && (
        <PaletteControls
          paletteSettings={paletteSettings}
          onUpdatePaletteSettings={onUpdatePaletteSettings} />
      )}

      {imageAction === "compress" && (
        <ImageCompressorControls
          settings={compressorSettings}
          isAnimatedGif={isAnimatedGif}
          onUpdate={onUpdateCompressorSettings} />
      )}

      {imageAction === "vosr" && vosrControls}

      {imageAction === "flux2" && (
        <section className="panel">
          <h2>Setup</h2>
          <GenerativeSizeControls
            orientation={flux2AspectOrientation}
            aspectRatio={flux2AspectRatio}
            width={flux2Width}
            height={flux2Height}
            onSetOrientation={onSetFlux2AspectOrientation}
            onSetAspectRatio={onSetFlux2AspectRatio}
            onSetWidth={onSetFlux2Width} />
          <RangeControl
            label="Steps"
            help="More steps can add polish and detail, but each step takes longer. Use 2 for quick tests and 4 for better results."
            min="1"
            max="20"
            step="1"
            value={flux2Steps}
            displayValue={`${flux2Steps}`}
            onChange={(value) => onSetFlux2Steps(Number(value))} />
          <RangeControl
            label="Guidance"
            help="Higher values can follow the prompt more strongly. Lower values can look more natural."
            min="0"
            max="5"
            step="0.1"
            value={flux2Guidance}
            displayValue={flux2Guidance.toFixed(1)}
            onChange={(value) => onSetFlux2Guidance(Number(value))} />
          <FormRow label="Seed" help="Leave blank for a random seed.">
            <Input value={flux2Seed} onChange={(event) => onSetFlux2Seed(event.currentTarget.value)} inputMode="numeric" placeholder="Random" />
          </FormRow>
          <FormRow label="Device" help="Favourite uses the preferred GPU selected in General settings.">
            <SelectControl
              value={flux2Device}
              onChange={onSetFlux2Device}
              options={modelDeviceOptions(devices, preferredModelDevice, true)} />
          </FormRow>
          <SwitchRow checked={flux2CpuOffload} onCheckedChange={onSetFlux2CpuOffload} help="Offload model parts to CPU to reduce VRAM pressure. This is slower but more likely to fit.">
            CPU offload
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
      </section>

      <section className="panel">
        <h2>Metadata</h2>
        {imagePath || imageObjectUrl || imageAction === "flux2" ? (
          <>
            {imageAction !== "flux2" && (
              <>
                <p><FieldLabel help="Original image dimensions detected from the loaded file.">Source</FieldLabel> {imageDimensions ? `${imageDimensions.width}x${imageDimensions.height}` : "Detecting..."}</p>
                <p><FieldLabel help="Current preview or sampling metadata for the selected image tool.">Preview</FieldLabel> <MetadataValue value={imageMeta || "Pending"} /></p>
              </>
            )}
            {imageAction === "compress" && (
              <>
                <p><FieldLabel help="Latest compressor output status.">Compressor</FieldLabel> <MetadataValue value={compressorStatus} /></p>
                {compressorSizeSummary && (
                  <p><FieldLabel help="Source size, preview output size, and estimated savings.">Disk</FieldLabel> <span className="metadata-size-row"><code>{compressorSizeSummary.before}</code><span>to</span><code>{compressorSizeSummary.after}</code><span>{compressorSizeSummary.saved}</span></span></p>
                )}
              </>
            )}
            {imageAction === "flux2" && (
              <p><FieldLabel help="Latest Flux.2 generation status.">Flux.2</FieldLabel> <MetadataValue value={flux2Status} /></p>
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
          options={formatOptions} />
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
          onChange={(value) => onUpdate({ quality: Number(value) })} />
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
            onChange={(value) => onUpdate({ paletteColors: Number(value) })} />
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
          ]} />
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
