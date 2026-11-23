import { VosrControls } from "@/components/sidebars/vosr-controls";
import { SkinMaskEditor } from "@/components/previews/skin-mask-editor";
import { localAssetSrc } from "@/lib/media-utils";
import { ImagePreview } from "@/components/previews/image-preview";
import { GenerativePromptBox } from "@/components/generative-controls";
import { ImageSidebar } from "@/components/sidebars/image-sidebar";
import { LogPanel } from "@/components/log-panel";
import type { useImageTools } from "@/hooks/use-image-tools";
import type { RealEsrganDevice, VosrDevice } from "@/hooks/use-tool-state";
import type { aspectRatios, ditherAlgorithms } from "@/lib/app-options";
import { estimateImageEta } from "@/lib/eta";

type ImageWorkspaceProps = {
  imageTools: ReturnType<typeof useImageTools>;
  aspectRatios: typeof aspectRatios;
  ditherAlgorithms: typeof ditherAlgorithms;
  ditherAlgorithmHelp: string;
  vosrReady: boolean;
  vosrMessage?: string;
  vosrInstalling: boolean;
  vosrDevices: VosrDevice[];
  devices: RealEsrganDevice[];
  preferredModelDevice: string;
  log: string[];
  onRetryToolChecks?: () => void;
  jobProgress: number;
  jobStep: string;
};

export function ImageWorkspace({
  imageTools,
  aspectRatios,
  ditherAlgorithms,
  ditherAlgorithmHelp,
  vosrReady,
  vosrMessage,
  vosrInstalling,
  vosrDevices,
  devices,
  preferredModelDevice,
  log,
  onRetryToolChecks,
  jobProgress,
  jobStep,
}: ImageWorkspaceProps) {
  const eta = estimateImageEta({
    imageAction: imageTools.imageAction,
    dimensions: imageTools.imageDimensions,
  });

  return (
    <section className="workspace">
      <ImageSidebar
        vosrControls={<VosrControls tools={imageTools} ready={vosrReady} setupMessage={vosrMessage} installing={vosrInstalling}
          devices={vosrDevices} />}
        vosrBusy={imageTools.isRunningVosr || imageTools.isEnhancingVosr || imageTools.isDetectingSkin}
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
        flux2AspectOrientation={imageTools.flux2AspectOrientation}
        flux2AspectRatio={imageTools.flux2AspectRatio}
        flux2Width={imageTools.flux2Width}
        flux2Height={imageTools.flux2Height}
        flux2Steps={imageTools.flux2Steps}
        flux2Guidance={imageTools.flux2Guidance}
        flux2Seed={imageTools.flux2Seed}
        flux2Device={imageTools.flux2Device}
        flux2CpuOffload={imageTools.flux2CpuOffload}
        flux2References={imageTools.flux2References}
        isRunningFlux2={imageTools.isRunningFlux2}
        flux2Status={imageTools.flux2Status}
        devices={devices}
        preferredModelDevice={preferredModelDevice}
        onDrop={imageTools.imageAction === "flux2" ? imageTools.handleFlux2ReferenceDrop : imageTools.handleImageDrop}
        onChooseInputImage={imageTools.imageAction === "flux2" ? imageTools.addFlux2References : imageTools.chooseInputImage}
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
        onSetFlux2AspectOrientation={imageTools.setFlux2AspectOrientation}
        onSetFlux2AspectRatio={imageTools.setFlux2AspectRatio}
        onSetFlux2Width={imageTools.setFlux2Width}
        onSetFlux2Steps={imageTools.setFlux2Steps}
        onSetFlux2Guidance={imageTools.setFlux2Guidance}
        onSetFlux2Seed={imageTools.setFlux2Seed}
        onSetFlux2Device={imageTools.setFlux2Device}
        onSetFlux2CpuOffload={imageTools.setFlux2CpuOffload}
        onRemoveFlux2Reference={imageTools.removeFlux2Reference} />
      <div className="preview-stack">
        {imageTools.imageAction === "vosr" && imageTools.skinMaskEditing ? (
          <SkinMaskEditor key={imageTools.vosrOutputPath}
            src={localAssetSrc(imageTools.vosrOutputPath)}
            autoMask={imageTools.detectedSkinMask}
            mode={imageTools.skinDetectionMode}
            onModeChange={imageTools.setSkinDetectionMode}
            crop={imageTools.skinCrop}
            onCropChange={imageTools.setSkinCrop}
            coverage={imageTools.skinMaskCoverage}
            onCoverageChange={imageTools.setSkinMaskCoverage}
            strokes={imageTools.skinStrokes}
            onDetect={imageTools.detectSkinMask}
            onClear={imageTools.clearSkinMask}
            onStrokesChange={imageTools.setSkinStrokes}
            onApply={imageTools.enhanceVosrSkin}
            onClose={() => imageTools.setSkinMaskEditing(false)}
            detecting={imageTools.isDetectingSkin}
            busy={imageTools.isEnhancingVosr || imageTools.isDetectingSkin} />
        ) : (
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
            vosrOutputPath={imageTools.vosrOutputPath}
            vosrBlendSource={imageTools.vosrBlendSource}
            vosrDetailPath={imageTools.vosrCompareDetail ? imageTools.vosrDetailPath : ""}
            vosrStrength={imageTools.vosrStrength}
            skinStrength={imageTools.skinStrength}
            flux2OutputPath={imageTools.flux2OutputPath}
            paletteResult={imageTools.paletteResult}
            paletteColorFormat={imageTools.paletteSettings.colorFormat}
            ditherCanvasRef={imageTools.ditherCanvasRef}
            ditherSourceCanvasRef={imageTools.ditherSourceCanvasRef}
            paletteCanvasRef={imageTools.paletteCanvasRef}
            paletteSourceCanvasRef={imageTools.paletteSourceCanvasRef} />
        )}
        {imageTools.imageAction === "flux2" && (
          <GenerativePromptBox
            prompt={imageTools.flux2Prompt}
            isRunning={imageTools.isRunningFlux2}
            onPromptChange={imageTools.setFlux2Prompt}
            onSubmit={imageTools.runFlux2}
            onCancel={imageTools.cancelFlux2} />
        )}
      </div>
      <LogPanel lines={log} onRetryToolChecks={onRetryToolChecks} eta={eta} progress={jobProgress} step={jobStep} />
    </section>
  );
}
