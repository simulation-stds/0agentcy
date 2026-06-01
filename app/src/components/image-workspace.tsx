import { ImagePreview } from "@/components/previews/image-preview";
import { ImageSidebar } from "@/components/sidebars/image-sidebar";
import { LogPanel } from "@/components/log-panel";
import type { useImageTools } from "@/hooks/use-image-tools";
import type { RealEsrganDevice } from "@/hooks/use-tool-state";
import type { aspectRatios, ditherAlgorithms } from "@/lib/app-options";
import { estimateImageEta } from "@/lib/eta";

type ImageWorkspaceProps = {
  imageTools: ReturnType<typeof useImageTools>;
  aspectRatios: typeof aspectRatios;
  ditherAlgorithms: typeof ditherAlgorithms;
  ditherAlgorithmHelp: string;
  devices: RealEsrganDevice[];
  preferredModelDevice: string;
  log: string[];
  jobProgress: number;
  jobStep: string;
};

export function ImageWorkspace({
  imageTools,
  aspectRatios,
  ditherAlgorithms,
  ditherAlgorithmHelp,
  devices,
  preferredModelDevice,
  log,
  jobProgress,
  jobStep,
}: ImageWorkspaceProps) {
  const eta = estimateImageEta({
    imageAction: imageTools.imageAction,
    dimensions: imageTools.imageDimensions,
    supirModel: imageTools.supirModel,
    supirPreset: imageTools.supirPreset,
    supirDevice: imageTools.supirDevice,
    supirUpscale: imageTools.supirUpscale,
    supirUseLlava: imageTools.supirUseLlava,
    preferredModelDevice,
    devices,
  });

  return (
    <section className="workspace">
      <ImageSidebar
        imageSrc={imageTools.imageSrc}
        imageName={imageTools.imageName}
        imagePath={imageTools.imagePath}
        imageObjectUrl={imageTools.imageObjectUrl}
        imageDimensions={imageTools.imageDimensions}
        isAnimatedGif={imageTools.isAnimatedGif}
        imageAction={imageTools.imageAction}
        imageOutputName={imageTools.imageOutputName}
        imageMeta={imageTools.imageMeta}
        ditherComparePreview={imageTools.ditherComparePreview}
        compressorSettings={imageTools.compressorSettings}
        compressorStatus={imageTools.compressorStatus}
        compressorOutputPath={imageTools.compressorOutputPath}
        compressorSizeSummary={imageTools.compressorSizeSummary}
        isRunningCompressor={imageTools.isRunningCompressor}
        isDitherReady={imageTools.isDitherReady}
        ditherSettings={imageTools.ditherSettings}
        ditherAspectRatio={imageTools.ditherAspectRatio}
        ditherAlgorithms={ditherAlgorithms}
        ditherAlgorithmHelp={ditherAlgorithmHelp}
        aspectRatios={aspectRatios}
        paletteSettings={imageTools.paletteSettings}
        hasPaletteResult={Boolean(imageTools.paletteResult)}
        supirModel={imageTools.supirModel}
        supirPreset={imageTools.supirPreset}
        supirDevice={imageTools.supirDevice}
        supirUpscale={imageTools.supirUpscale}
        supirUseLlava={imageTools.supirUseLlava}
        isRunningSupir={imageTools.isRunningSupir}
        devices={devices}
        preferredModelDevice={preferredModelDevice}
        onDrop={imageTools.handleImageDrop}
        onChooseInputImage={imageTools.chooseInputImage}
        onSetImageAction={imageTools.setImageAction}
        onSetImageOutputName={imageTools.setImageOutputName}
        onSetDitherComparePreview={imageTools.setDitherComparePreview}
        onUpdateCompressorSettings={imageTools.updateCompressorSettings}
        onUpdateDitherSettings={imageTools.updateDitherSettings}
        onUpdateDitherWidth={imageTools.updateDitherWidth}
        onUpdateDitherAspectRatio={imageTools.updateDitherAspectRatio}
        onDownloadDitherPng={imageTools.downloadDitherPng}
        onPreviewCompressor={imageTools.previewCompressor}
        onSaveCompressorPreview={imageTools.saveCompressorPreview}
        onUpdatePaletteSettings={imageTools.updatePaletteSettings}
        onCopyPaletteCss={imageTools.copyPaletteCss}
        onDownloadPaletteCss={imageTools.downloadPaletteCss}
        onDownloadPaletteSheet={imageTools.downloadPaletteSheet}
        onSetSupirModel={imageTools.setSupirModel}
        onSetSupirPreset={imageTools.setSupirPreset}
        onSetSupirDevice={imageTools.setSupirDevice}
        onSetSupirUpscale={imageTools.setSupirUpscale}
        onSetSupirUseLlava={imageTools.setSupirUseLlava}
        onRunSupir={imageTools.runSupir}
        onCancelSupir={imageTools.cancelSupir}
      />
      <ImagePreview
        imageAction={imageTools.imageAction}
        imageSrc={imageTools.imageSrc}
        gifFrames={imageTools.gifFrames}
        ditherGifFrames={imageTools.ditherGifFrames}
        isDitherReady={imageTools.isDitherReady}
        ditherFitMode={imageTools.ditherSettings.fitMode}
        ditherComparePreview={imageTools.ditherComparePreview}
        compressorComparePreview={imageTools.compressorSettings.compareOriginal}
        compressorOutputPath={imageTools.compressorOutputPath}
        compressorSizeSummary={imageTools.compressorSizeSummary}
        ditherViewport={imageTools.ditherViewport}
        onSetDitherViewport={imageTools.setDitherViewport}
        supirOutputPath={imageTools.supirOutputPath}
        paletteResult={imageTools.paletteResult}
        paletteColorFormat={imageTools.paletteSettings.colorFormat}
        ditherCanvasRef={imageTools.ditherCanvasRef}
        ditherSourceCanvasRef={imageTools.ditherSourceCanvasRef}
        paletteCanvasRef={imageTools.paletteCanvasRef}
        paletteSourceCanvasRef={imageTools.paletteSourceCanvasRef}
      />
      <LogPanel lines={log} eta={eta} progress={jobProgress} step={jobStep} />
    </section>
  );
}
