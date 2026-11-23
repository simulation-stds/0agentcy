import { FaceFusionSettings } from "@/components/sidebars/video-actions/facefusion-settings";
import { RealEsrganSettings } from "@/components/sidebars/video-actions/realesrgan-settings";
import { RifeSettings } from "@/components/sidebars/video-actions/rife-settings";
import { SocialExportSettings } from "@/components/sidebars/video-actions/social-export-settings";
import { VideoAudioSettings } from "@/components/sidebars/video-actions/video-audio-settings";
import { Wan21Settings } from "@/components/sidebars/video-actions/wan21-settings";
import { Wan22Settings } from "@/components/sidebars/video-actions/wan22-settings";
import type { useDerivedUiState } from "@/hooks/use-derived-ui-state";
import type { useFilePickers } from "@/hooks/use-file-pickers";
import type { useToolState } from "@/hooks/use-tool-state";
import type { useVideoForm } from "@/hooks/use-video-form";
import type { useVideoMedia } from "@/hooks/use-video-media";
import { crfOptions, threadOptions, tileSizeOptions } from "@/lib/app-options";
import { FormRow, SelectControl } from "@/components/app-controls";
import { Input } from "@/components/ui/input";
import { contactSheetResolutions, maxContactSheetFrames } from "@/lib/contact-sheet";

type VideoActionSettingsProps = {
  videoForm: ReturnType<typeof useVideoForm>;
  videoMedia: ReturnType<typeof useVideoMedia>;
  toolState: ReturnType<typeof useToolState>;
  filePickers: ReturnType<typeof useFilePickers>;
  derivedState: ReturnType<typeof useDerivedUiState>;
  faceFusionSourceSrc: string;
  faceFusionSourceName: string;
  preferredModelDevice: string;
  isComparingModels: boolean;
  hasCurrentVideoComparison: boolean;
  onCompareModels: () => void;
  onViewLastComparison: () => void;
};

export function VideoActionSettings({
  videoForm,
  videoMedia,
  toolState,
  filePickers,
  derivedState,
  faceFusionSourceSrc,
  faceFusionSourceName,
  preferredModelDevice,
  isComparingModels,
  hasCurrentVideoComparison,
  onCompareModels,
  onViewLastComparison,
}: VideoActionSettingsProps) {
  if (videoForm.action === "contact_sheet") {
    return (
      <>
        <FormRow label="Frame count" help={`Sample 1 to ${maxContactSheetFrames} frames across the selected video range.`}>
          <Input
            aria-label="Frame count"
            type="number"
            min={1}
            max={maxContactSheetFrames}
            step={1}
            value={videoForm.contactSheetFrameCount}
            onChange={(event) => videoForm.setContactSheetFrameCount(event.currentTarget.value)}
          />
        </FormRow>
        <FormRow label="Tile resolution" help="Higher resolution keeps more detail and makes the exported PNG larger.">
          <SelectControl
            value={videoForm.contactSheetResolution}
            onChange={videoForm.setContactSheetResolution}
            options={contactSheetResolutions}
          />
        </FormRow>
      </>
    );
  }

  if (videoForm.action === "video_audio") {
    return <VideoAudioSettings audioFormat={videoForm.audioFormat} onSetAudioFormat={videoForm.setAudioFormat} />;
  }

  if (videoForm.action === "social_export") {
    return (
      <SocialExportSettings
        socialFormat={videoForm.socialFormat}
        socialFps={videoForm.socialFps}
        socialWidth={videoForm.socialWidth}
        socialLoop={videoForm.socialLoop}
        socialScaleFilter={videoForm.socialScaleFilter}
        socialCrf={videoForm.socialCrf}
        socialQuality={videoForm.socialQuality}
        socialPreset={videoForm.socialPreset}
        socialIncludeAudio={videoForm.socialIncludeAudio}
        crfOptions={crfOptions}
        onSetSocialFormat={videoForm.setSocialFormat}
        onSetSocialFps={videoForm.setSocialFps}
        onSetSocialWidth={videoForm.setSocialWidth}
        onSetSocialLoop={videoForm.setSocialLoop}
        onSetSocialScaleFilter={videoForm.setSocialScaleFilter}
        onSetSocialCrf={videoForm.setSocialCrf}
        onSetSocialQuality={videoForm.setSocialQuality}
        onSetSocialPreset={videoForm.setSocialPreset}
        onSetSocialIncludeAudio={videoForm.setSocialIncludeAudio} />
    );
  }

  if (videoForm.action === "realesrgan_upscale") {
    return (
      <RealEsrganSettings
        models={toolState.models}
        selectedModel={videoForm.selectedModel}
        devices={toolState.devices}
        selectedDevice={videoForm.selectedDevice}
        preferredModelDevice={preferredModelDevice}
        crf={videoForm.crf}
        encoderPreset={videoForm.encoderPreset}
        tileSize={videoForm.tileSize}
        threads={videoForm.threads}
        activeModelScale={derivedState.activeModel?.scale || ""}
        roughUpscaleEta={derivedState.roughUpscaleEta}
        crfOptions={crfOptions}
        tileSizeOptions={tileSizeOptions}
        threadOptions={threadOptions}
        onSetSelectedModel={videoForm.setSelectedModel}
        onSetSelectedDevice={videoForm.setSelectedDevice}
        onSetCrf={videoForm.setCrf}
        onSetEncoderPreset={videoForm.setEncoderPreset}
        onSetTileSize={videoForm.setTileSize}
        onSetThreads={videoForm.setThreads}
        canCompareModels={Boolean(videoMedia.metadata && toolState.tools?.realesrgan && toolState.models.length)}
        isComparingModels={isComparingModels}
        hasCurrentVideoComparison={hasCurrentVideoComparison}
        onCompareModels={onCompareModels}
        onViewLastComparison={onViewLastComparison} />
    );
  }

  if (videoForm.action === "rife_interpolate") {
    return (
      <RifeSettings
        rifeModels={toolState.rifeModels}
        selectedRifeModel={videoForm.selectedRifeModel}
        rifeMultiplier={videoForm.rifeMultiplier}
        devices={toolState.devices}
        selectedDevice={videoForm.selectedDevice}
        preferredModelDevice={preferredModelDevice}
        crf={videoForm.crf}
        encoderPreset={videoForm.encoderPreset}
        threads={videoForm.threads}
        rifeTtaSpatial={videoForm.rifeTtaSpatial}
        rifeTtaTemporal={videoForm.rifeTtaTemporal}
        rifeUhd={videoForm.rifeUhd}
        metadata={videoMedia.metadata}
        roughRifeEta={derivedState.roughRifeEta}
        crfOptions={crfOptions}
        threadOptions={threadOptions}
        onSetSelectedRifeModel={videoForm.setSelectedRifeModel}
        onSetRifeMultiplier={videoForm.setRifeMultiplier}
        onSetSelectedDevice={videoForm.setSelectedDevice}
        onSetCrf={videoForm.setCrf}
        onSetEncoderPreset={videoForm.setEncoderPreset}
        onSetThreads={videoForm.setThreads}
        onSetRifeTtaSpatial={videoForm.setRifeTtaSpatial}
        onSetRifeTtaTemporal={videoForm.setRifeTtaTemporal}
        onSetRifeUhd={videoForm.setRifeUhd} />
    );
  }

  if (videoForm.action === "facefusion") {
    return (
      <FaceFusionSettings
        faceFusionSourcePath={filePickers.faceFusionSourcePath}
        faceFusionSourceSrc={faceFusionSourceSrc}
        faceFusionSourceName={faceFusionSourceName}
        faceFusionProcessor={videoForm.faceFusionProcessor}
        faceFusionProvider={videoForm.faceFusionProvider}
        faceFusionProviders={derivedState.availableFaceFusionProviders}
        faceFusionStatus={toolState.faceFusionStatus}
        onChooseFaceFusionSource={filePickers.chooseFaceFusionSource}
        onSetFaceFusionProcessor={videoForm.setFaceFusionProcessor}
        onSetFaceFusionProvider={videoForm.setFaceFusionProvider} />
    );
  }

  if (videoForm.action === "wan22_generate") {
    return (
      <Wan22Settings
        referencePath={filePickers.wan22ReferencePath}
        orientation={videoForm.wan22Orientation}
        size={videoForm.wan22Size}
        frameCount={videoForm.wan22FrameCount}
        steps={videoForm.wan22Steps}
        guidance={videoForm.wan22Guidance}
        seed={videoForm.wan22Seed}
        selectedDevice={videoForm.selectedDevice}
        devices={toolState.devices}
        preferredModelDevice={preferredModelDevice}
        offloadModel={videoForm.wan22OffloadModel}
        convertModelDtype={videoForm.wan22ConvertModelDtype}
        t5Cpu={videoForm.wan22T5Cpu}
        onChooseReference={filePickers.chooseWan22Reference}
        onSetReference={filePickers.setWan22Reference}
        onClearReference={filePickers.clearWan22Reference}
        onSetOrientation={videoForm.setWan22Orientation}
        onSetFrameCount={videoForm.setWan22FrameCount}
        onSetSteps={videoForm.setWan22Steps}
        onSetGuidance={videoForm.setWan22Guidance}
        onSetSeed={videoForm.setWan22Seed}
        onSetSelectedDevice={videoForm.setSelectedDevice}
        onSetOffloadModel={videoForm.setWan22OffloadModel}
        onSetConvertModelDtype={videoForm.setWan22ConvertModelDtype}
        onSetT5Cpu={videoForm.setWan22T5Cpu} />
    );
  }

  if (videoForm.action === "wan21_generate") {
    return (
      <Wan21Settings
        orientation={videoForm.wan21Orientation}
        size={videoForm.wan21Size}
        frameCount={videoForm.wan21FrameCount}
        steps={videoForm.wan21Steps}
        guidance={videoForm.wan21Guidance}
        seed={videoForm.wan21Seed}
        selectedDevice={videoForm.selectedDevice}
        devices={toolState.devices}
        preferredModelDevice={preferredModelDevice}
        offloadModel={videoForm.wan21OffloadModel}
        t5Cpu={videoForm.wan21T5Cpu}
        onSetOrientation={videoForm.setWan21Orientation}
        onSetFrameCount={videoForm.setWan21FrameCount}
        onSetSteps={videoForm.setWan21Steps}
        onSetGuidance={videoForm.setWan21Guidance}
        onSetSeed={videoForm.setWan21Seed}
        onSetSelectedDevice={videoForm.setSelectedDevice}
        onSetOffloadModel={videoForm.setWan21OffloadModel}
        onSetT5Cpu={videoForm.setWan21T5Cpu} />
    );
  }

  return null;
}
