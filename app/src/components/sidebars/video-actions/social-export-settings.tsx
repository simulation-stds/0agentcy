import { FormRow, FpsSelect, RangeControl, SelectControl, SwitchRow } from "@/components/app-controls";
import { Input } from "@/components/ui/input";

type SocialExportSettingsProps = {
  socialFormat: string;
  socialFps: string;
  socialWidth: string;
  socialLoop: boolean;
  socialScaleFilter: string;
  socialCrf: string;
  socialQuality: string;
  socialPreset: string;
  socialIncludeAudio: boolean;
  crfOptions: string[];
  onSetSocialFormat: (value: string) => void;
  onSetSocialFps: (value: string) => void;
  onSetSocialWidth: (value: string) => void;
  onSetSocialLoop: (value: boolean) => void;
  onSetSocialScaleFilter: (value: string) => void;
  onSetSocialCrf: (value: string) => void;
  onSetSocialQuality: (value: string) => void;
  onSetSocialPreset: (value: string) => void;
  onSetSocialIncludeAudio: (value: boolean) => void;
};

export function SocialExportSettings({
  socialFormat,
  socialFps,
  socialWidth,
  socialLoop,
  socialScaleFilter,
  socialCrf,
  socialQuality,
  socialPreset,
  socialIncludeAudio,
  crfOptions,
  onSetSocialFormat,
  onSetSocialFps,
  onSetSocialWidth,
  onSetSocialLoop,
  onSetSocialScaleFilter,
  onSetSocialCrf,
  onSetSocialQuality,
  onSetSocialPreset,
  onSetSocialIncludeAudio,
}: SocialExportSettingsProps) {
  return (
    <div className="settings-grid">
      <FormRow label="Format">
        <SelectControl
          value={socialFormat}
          onChange={onSetSocialFormat}
          options={[
            { value: "h264_mp4", label: "H.264 MP4" },
            { value: "gif", label: "GIF" },
            { value: "webp", label: "Animated WebP" },
            { value: "apng", label: "Animated PNG" },
          ]} />
      </FormRow>
      <FormRow label="FPS" help="Frames per second for the exported social file. Auto uses the source video FPS.">
        <FpsSelect value={socialFps === "auto" ? "auto" : socialFps} onChange={onSetSocialFps} />
      </FormRow>
      <FormRow label="Width" help="Output width in pixels. Height is calculated from the source aspect ratio.">
        <Input value={socialWidth} onChange={(event) => onSetSocialWidth(event.currentTarget.value)} />
      </FormRow>
      <FormRow label="Scale Filter" help="FFmpeg scaling algorithm. Lanczos is sharp, bicubic is softer, bilinear is fastest.">
        <SelectControl
          value={socialScaleFilter}
          onChange={onSetSocialScaleFilter}
          options={[
            { value: "lanczos", label: "lanczos" },
            { value: "bicubic", label: "bicubic" },
            { value: "bilinear", label: "bilinear" },
          ]} />
      </FormRow>
      {socialFormat === "h264_mp4" ? (
        <>
          <FormRow label="CRF" help="Constant Rate Factor for H.264. Lower values are larger and cleaner; 18 is high quality.">
            <SelectControl value={socialCrf} onChange={onSetSocialCrf} options={crfOptions.map((value) => ({ value, label: value }))} />
          </FormRow>
          <FormRow label="Preset">
            <SelectControl
              value={socialPreset}
              onChange={onSetSocialPreset}
              options={[
                { value: "veryslow", label: "veryslow" },
                { value: "slow", label: "slow" },
                { value: "medium", label: "medium" },
                { value: "fast", label: "fast" },
              ]} />
          </FormRow>
          <SwitchRow checked={socialIncludeAudio} onCheckedChange={onSetSocialIncludeAudio}>
            Include audio
          </SwitchRow>
        </>
      ) : (
        <>
          <RangeControl
            label="Quality"
            help="Animation quality. Higher is cleaner and usually larger; lower is smaller."
            min="1"
            max="100"
            step="1"
            value={socialQuality}
            displayValue={socialQuality}
            onChange={onSetSocialQuality} />
          <SwitchRow checked={socialLoop} onCheckedChange={onSetSocialLoop}>
            Loop animation
          </SwitchRow>
          {socialFormat === "apng" && <p>Animated PNG can get large quickly.</p>}
        </>
      )}
    </div>
  );
}
