import { FaceFusionSettings } from "@/components/sidebars/video-actions/facefusion-settings";
import { RealEsrganSettings } from "@/components/sidebars/video-actions/realesrgan-settings";
import { RifeSettings } from "@/components/sidebars/video-actions/rife-settings";
import { SocialExportSettings } from "@/components/sidebars/video-actions/social-export-settings";
import { VideoAudioSettings } from "@/components/sidebars/video-actions/video-audio-settings";
import type { useDerivedUiState } from "@/hooks/use-derived-ui-state";
import type { useFilePickers } from "@/hooks/use-file-pickers";
import type { useToolState } from "@/hooks/use-tool-state";
import type { useVideoForm } from "@/hooks/use-video-form";
import type { useVideoMedia } from "@/hooks/use-video-media";
import { crfOptions, threadOptions, tileSizeOptions } from "@/lib/app-options";

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
        onSetSocialIncludeAudio={videoForm.setSocialIncludeAudio}
      />
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
        canCompareModels={Boolean(videoMedia.metadata)}
        isComparingModels={isComparingModels}
        hasCurrentVideoComparison={hasCurrentVideoComparison}
        onCompareModels={onCompareModels}
        onViewLastComparison={onViewLastComparison}
      />
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
        onSetRifeUhd={videoForm.setRifeUhd}
      />
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
        onSetFaceFusionProvider={videoForm.setFaceFusionProvider}
      />
    );
  }

  return null;
}
