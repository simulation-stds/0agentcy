import { FormRow, SelectControl } from "@/components/app-controls";

type VideoAudioSettingsProps = {
  audioFormat: string;
  onSetAudioFormat: (value: string) => void;
};

export function VideoAudioSettings({ audioFormat, onSetAudioFormat }: VideoAudioSettingsProps) {
  return (
    <FormRow label="Format">
      <SelectControl
        value={audioFormat}
        onChange={onSetAudioFormat}
        options={[
          { value: "mp3", label: "MP3" },
          { value: "wav", label: "WAV" },
        ]}
      />
    </FormRow>
  );
}
