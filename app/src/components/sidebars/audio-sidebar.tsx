import { FieldLabel, FormRow, PrimaryButton, SecondaryButton, SelectControl, SwitchRow } from "@/components/app-controls";
import { Input } from "@/components/ui/input";
import type { useAudioTools } from "@/hooks/use-audio-tools";
import { formatTime } from "@/lib/media-utils";

type AudioSidebarProps = {
  audioTools: ReturnType<typeof useAudioTools>;
};

const actionOptions = [
  { value: "trim", label: "Trim" },
  { value: "convert", label: "Convert" },
];

const formatOptions = [
  { value: "mp3", label: "MP3" },
  { value: "wav", label: "WAV" },
  { value: "flac", label: "FLAC" },
  { value: "m4a", label: "M4A / AAC" },
  { value: "ogg", label: "OGG Vorbis" },
];

const bitrateOptions = ["96k", "128k", "160k", "192k", "256k", "320k"].map((value) => ({
  value,
  label: value,
}));

const sampleRateOptions = [
  { value: "source", label: "Source" },
  { value: "22050", label: "22.05 kHz" },
  { value: "32000", label: "32 kHz" },
  { value: "44100", label: "44.1 kHz" },
  { value: "48000", label: "48 kHz" },
  { value: "96000", label: "96 kHz" },
];

const channelOptions = [
  { value: "source", label: "Source" },
  { value: "1", label: "Mono" },
  { value: "2", label: "Stereo" },
];

export function AudioSidebar({ audioTools }: AudioSidebarProps) {
  const lossyFormat = audioTools.outputFormat === "mp3" || audioTools.outputFormat === "m4a" || audioTools.outputFormat === "ogg";

  return (
    <aside className="sidebar">
      <section className="drop-zone" onDrop={audioTools.handleDrop} onDragOver={(event) => event.preventDefault()}>
        <span className="material-symbols-rounded" aria-hidden="true">audio_file</span>
        <strong>{audioTools.audioName || "Choose audio"}</strong>
        {!audioTools.audioPath && <p>Drop audio here or browse from Explorer.</p>}
        <PrimaryButton type="button" disabled={audioTools.isLoading} onClick={audioTools.chooseInputAudio}>
          <span className="material-symbols-rounded" aria-hidden="true">folder_open</span>
          Browse Audio
        </PrimaryButton>
      </section>

      <div className="panel">
        <h2>Action</h2>
        <SelectControl value={audioTools.action} onChange={audioTools.setAction} options={actionOptions} />
        {audioTools.action === "convert" && (
          <SwitchRow
            checked={audioTools.saveSelection}
            onCheckedChange={audioTools.setSaveSelection}
            help="When enabled, Convert exports only the selected waveform range instead of the full file."
          >
            Save selection
          </SwitchRow>
        )}
      </div>

      <div className="panel">
        <h2>Preview</h2>
        <div className="form-row">
          <FieldLabel help="Fit playback to the selected waveform range, or return preview playback to the full file.">
            Range
          </FieldLabel>
          <SecondaryButton type="button" disabled={!audioTools.metadata} onClick={audioTools.toggleFitToSelection}>
            <span className="material-symbols-rounded" aria-hidden="true">
              {audioTools.playSelectionOnly ? "fullscreen" : "fit_screen"}
            </span>
            {audioTools.playSelectionOnly ? "Show Full" : "Fit To Selection"}
          </SecondaryButton>
        </div>
        <SwitchRow
          checked={audioTools.loopPlayback}
          onCheckedChange={audioTools.setLoopPlayback}
          help="When enabled, playback restarts automatically when the preview reaches the end of the selected range or full file."
        >
          Play on loop
        </SwitchRow>
        <SwitchRow
          checked={audioTools.showSeparateChannels}
          onCheckedChange={audioTools.setShowSeparateChannels}
          help="Show each audio channel as its own stacked waveform instead of mixing them into one waveform."
        >
          Separate channels
        </SwitchRow>
      </div>

      <div className="panel">
        <h2>Format</h2>
        <FormRow label="Output" help="Choose the file format for the exported audio. WAV and FLAC are lossless; MP3, M4A, and OGG are compressed.">
          <SelectControl value={audioTools.outputFormat} onChange={audioTools.setOutputFormat} options={formatOptions} />
        </FormRow>
        {lossyFormat && (
          <FormRow label="Bitrate" help="Higher bitrates usually sound cleaner and create larger files.">
            <SelectControl value={audioTools.bitrate} onChange={audioTools.setBitrate} options={bitrateOptions} />
          </FormRow>
        )}
        <FormRow label="Sample rate" help="Keep Source unless you need a specific delivery rate such as 44.1 kHz or 48 kHz.">
          <SelectControl value={audioTools.sampleRate} onChange={audioTools.setSampleRate} options={sampleRateOptions} />
        </FormRow>
        <FormRow label="Channels" help="Keep Source to preserve the original channel layout, or force mono/stereo when exporting.">
          <SelectControl value={audioTools.channels} onChange={audioTools.setChannels} options={channelOptions} />
        </FormRow>
      </div>

      <div className="panel">
        <h2>Output</h2>
        <FormRow label="Name" help="Output files are saved in the Audio folder inside the general output folder.">
          <Input value={audioTools.outputName} onChange={(event) => audioTools.setOutputName(event.currentTarget.value)} />
        </FormRow>
        <PrimaryButton type="button" disabled={audioTools.isRunning || !audioTools.metadata || !audioTools.audioPath} onClick={audioTools.runAudioJob}>
          Run Action
        </PrimaryButton>
        <SecondaryButton type="button" className="danger-action" disabled={!audioTools.isRunning} onClick={audioTools.cancelAudioJob}>
          Cancel
        </SecondaryButton>
      </div>

      <div className="panel">
        <h2>Metadata</h2>
        {audioTools.metadata ? (
          <>
            <p><FieldLabel help="Detected audio codec from FFprobe.">Codec</FieldLabel> {audioTools.metadata.codec || "Unknown"}</p>
            <p><FieldLabel help="Detected sample rate from FFprobe.">Sample rate</FieldLabel> {audioTools.metadata.sampleRate || 0} Hz</p>
            <p><FieldLabel help="Detected channel count from FFprobe.">Channels</FieldLabel> {audioTools.metadata.channels || 0}</p>
            <p><FieldLabel help="Detected total duration.">Duration</FieldLabel> {formatTime(audioTools.metadata.duration)}</p>
          </>
        ) : (
          <p>No audio loaded</p>
        )}
      </div>
    </aside>
  );
}
