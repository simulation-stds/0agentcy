# WhisperX transcription

Choose **Transcribe / Subtitles (WhisperX)** in either the Video or Audio action list.
Install and manage models in **Settings → Audio → Editing**.
Use **Set up transcription** once, choosing CPU or NVIDIA GPU, a speech model,
and an initial alignment language. Managed setup currently supports Windows and
Linux x86-64. GPU mode requires a compatible NVIDIA driver; CPU mode is available
without GPU setup. FFmpeg is supplied through the existing Must haves settings.

Setup verifies the pinned uv archive checksum and provisions a private installer, managed Python 3.12, and a dedicated
WhisperX 3.8.6 environment in the current user's app-local data directory under
`transcription/`. It does not install packages into system Python or require
administrator access. CPU and CUDA environments are separate. Model downloads,
Python downloads and package caches are shared across media projects. Setup can
download several GB; other languages and models download on first use. Download
all required assets before offline use. Media processing is local. Hugging Face
and pyannote telemetry are disabled for the worker.

The app verifies runtime imports, GPU availability when selected, and model
loading before marking setup ready. **Settings → Audio → Editing** exposes repair and
removal. Repair resynchronizes pinned packages and retries missing model downloads.
Removing a runtime preserves subtitle projects; model downloads can be removed
separately with the runtime. The shared installer, Python download, and package
cache are retained for reinstalling. Interrupted setup does not produce a ready
marker, and can be retried. Cancellation terminates the current process group.

Transcription accepts the whole file or selected range. Source-relative times are
preserved. WhisperX recognizes speech and aligns words; the worker groups words
into readable subtitle cues. If alignment fails, the transcript is retained with
segment timing and a visible warning. Missing word alignment is never represented
as precise word timing.

## Editing and persistence

Open subtitle projects from the file-browsing container at the top of either sidebar.
Preview toggles, export settings, manual saving and speaker names live in the left
sidebar. The results column has Subtitles and Log tabs. Successful transcription opens
Subtitles. Captions follow playback in video and audio previews; cue blocks on a
subtitle timeline and timestamps in the editor seek playback. Search, manual
speaker assignment, speaker renaming, cue timing and text edits are available.
Follow playback and caption visibility can be disabled. Audio captions overlay the
waveform as white text on a translucent black background. Enable **Add speakers**
in the left sidebar to show speaker-name fields and per-cue speaker assignment.
Turning it off hides these controls while preserving saved names and assignments.
Export sits immediately to the left of Save project. Expand opens a larger
editor.

Edits are saved automatically to `transcription/projects/`, keyed by the source
path. Saves use atomic file replacement and are flushed before closing if pending.
Loading that source restores its saved transcript. Export a JSON subtitle project
for a portable backup. To import it, load its original media first. Moving or
replacing source media currently requires care: project association is based on
its path, not a media-content fingerprint.

SRT, WebVTT and plain-text exports use edited cues. Optional export settings shift
selection timestamps to zero and include speaker names. Project JSON retains
recognized segments, aligned words, editable cues and speaker names separately.
Text/timing edits do not silently rewrite the original recognized data. Word-level
alignment stored with an edited cue remains recognition data, not a fresh alignment
of the corrected dialogue.

## Word-count grouping

The left sidebar's **Block grouping** section provides 3/5/8/12-word presets,
a custom maximum from 1 to 50, one or two text lines (wrapped at 42 characters),
and optional breaks at sentence endings. Different cue speaker labels are always
kept separate, as are long pauses and overlapping source cues. Existing six-second
caption limits are retained when a block can be split between words.

**Preview grouping** shows proposed blocks in the right editor, captions and
subtitle timeline. This preview is read-only and never autosaved or exported.
**Cancel preview** restores the current saved/editable arrangement. **Apply grouping**
commits the result, autosaves it, and records an undo snapshot for this session.
**Undo grouping** restores the exact previous cues while retaining speaker renames.
Further cue text, timing, or assignment edits disable that snapshot so undo cannot
discard those later changes. A new apply replaces the previous undo snapshot.

Grouping uses the current corrected text, not the original recognized text. When
word text and timings still match, boundaries use the aligned words. Edited or
unaligned blocks are subdivided using estimates within their existing time range;
preview and cue labels explicitly identify estimated timing. No transcription or
model download is triggered. Existing recognition and speaker metadata are retained,
and original pre-grouping cue/word data is archived in `groupingSourceCues` in the
project. The chosen settings are stored in `subtitleGrouping`. Regrouping never
presents old word alignment as a fresh alignment of rewritten dialogue. Projects
without these optional fields continue to load normally.

## Automatic speaker detection

In **Settings → Audio → Editing**, the WhisperX section includes automatic speaker
setup. Accept the [Community-1 model conditions](https://huggingface.co/pyannote/speaker-diarization-community-1)
and save a Hugging Face token with read access. **Remember securely on this computer**
uses Windows Credential Manager or the Linux Secret Service; uncheck it to keep the
token in memory for this app session. The settings field is cleared after saving.
A locked/unavailable keyring produces an explicit error, with session storage as an
alternative. The token is never returned to the UI, saved in project files, passed
as a command-line argument, or included in worker diagnostics. Authentication is
sent through a private stdin pipe for model setup. No Hugging Face login file is
written. Remove token deletes the credential separately from model removal.

Set up the selected CPU/NVIDIA WhisperX runtime first, then choose **Set up speaker
detection** to download and verify `pyannote/speaker-diarization-community-1` (CC BY
4.0). Models are shared by projects under `transcription/speaker-models/`; readiness
is verified separately for CPU and NVIDIA. Model removal and repair stay in Settings.

After transcribing, use **Detect speakers** in the left sidebar. Leave the speaker
count blank for automatic counting, or enter a known count. Detection works on audio
and video by extracting the relevant audio range. It is a separate, cancellable
pass that uses the cached model offline and does not rerun speech recognition.
The app passes audio as an in-memory waveform to pyannote, avoiding dependence on
TorchCodec's file decoder. All profiles pin the CPU TorchCodec wheel (strict
`===0.7.0`), including NVIDIA runtimes: CUDA remains enabled for model inference,
while unused GPU video-decoding dependencies such as NPP are avoided. The optional
file-decoder warning is suppressed only because that decoder is not used here.
Pyannote's three checkpoint metadata types (`Specifications`, `Problem`, and
`Resolution`) are allowed within a scoped `torch.serialization.safe_globals`
context during pipeline construction. Weights-only loading remains enabled.
Setup errors report the actual sanitized cause; access instructions are shown
for access-denied errors rather than every loading failure. Detection enables the speaker fields automatically;
rename each detected speaker on the left. Renames save with the project and are
used by exports when **Include speaker names in export** is enabled.

Corrected text, cue identifiers, cue times and original recognized segments are
preserved. Word speaker labels and source-relative speaker turns are recorded.
A cue spanning multiple voices receives its dominant speaker; review and change
its label as needed. Rerunning detection asks before replacing assignments and
matches clusters to earlier cue assignments to retain renamed speakers even when
cluster numbering changes. Failures leave the previous transcript intact. Speaker
identities remain local to each transcript; this is not cross-recording voice ID.

Captioned MP4 exports are available from the subtitle sidebar. Embedded, switchable subtitle tracks remain deferred.

## Installer maintenance

`app/src-tauri/whisperx/requirements.in` defines the direct package versions.
Four fully pinned package lists are embedded into the app, one per OS/device.
They were resolved for Python 3.12 using uv. Regenerate each with:

```sh
uv pip compile --python-version 3.12 \
  --python-platform PLATFORM --no-annotate --no-header \
  --extra-index-url https://download.pytorch.org/whl/INDEX \
  --index-strategy unsafe-best-match \
  -o app/src-tauri/whisperx/OS-DEVICE.txt \
  app/src-tauri/whisperx/requirements.in
```

PLATFORM is `x86_64-manylinux_2_28` or `x86_64-pc-windows-msvc`; INDEX is `cpu`
or `cu128`. Validate each supported platform/device on real hardware before
shipping a release. Resolving a package list is not an end-to-end hardware test.

The worker is embedded from `app/src-tauri/src/whisperx_runner.py`. It emits a
small JSON progress protocol on stdout, with third-party diagnostics on stderr.
Rust drains both pipes and retains a bounded diagnostic tail on failure.

## Subtitle fonts

**Settings → Fonts** opens the cached Fontsource catalogue automatically. Search
and category filters combine; categories come from catalogue metadata. Rows load
in batches as you scroll. Visible/nearby rows automatically preview the current
subtitle text, with at most three simultaneous requests and a bounded in-memory
font cache. No preview button is needed. Preview bytes are cached locally for
seven days (up to 200 fonts); previewing never installs a desktop font.

Each catalogue row has an accessible icon-only download/install button, a
spinner while installing, and a checkmark once installed. Downloading retains
licences, metadata, language subsets and regular/bold weights when available.
WOFF2 copies serve the editor; desktop TTF copies are installed into the OS font
folder for the current user so other applications can use them. This does not
require administrator privileges and does not install for other OS accounts.
Linux uses the XDG user font folder and refreshes fontconfig. Windows uses the
user font folder, HKCU font registration and a font-change notification. macOS
uses the user's Library/Fonts folder. Other applications may need restarting.

Existing app-only downloads have **Install for other applications** to add their
desktop copies. Local TTF/OTF imports also install desktop copies. Removal
uninstalls only the files managed by this app, then removes the app's copy;
unrelated fonts are not replaced or deleted. Failed desktop installation retains
the app download and exposes the installation error for retry. Native Linux
installation/removal is covered by an isolated Fontsource/fontconfig test;
Windows/macOS installation needs validation on their respective platforms.

Font files are not embedded in JSON projects; add them on another computer when
moving a project. Video export stops with an actionable message if a project's
custom font is missing or cannot load. ASS players need the chosen font too.

## Subtitle styling and word timing

The left sidebar controls font, size, text/outline/background colors, outline
width, opacity, padding, corner radius, bold, uppercase and top/center/bottom
position. Size and padding use a 1080-pixel reference height and scale with the
frame. Choose a built-in preset or save/delete your own style presets locally.
The style itself autosaves with each project and is retained by grouping/undo.

Background modes are **Whole caption**, **Individual word boxes**, and
**Highlight spoken word**. Highlight mode has separate text and background
colors. Exact WhisperX word timestamps drive highlighting when they match the
current text. Missing alignment or text changes use proportional estimates,
clearly marked in the cue's **Word timings** editor. Listen, adjust each word's
start/end, and select **Confirm reviewed word timings**. Timing gaps are retained;
no word is highlighted between spoken words. Confirmation records manual review;
it does not rerun acoustic alignment. Text and speaker labels remain unchanged.
Uppercase changes rendering without rewriting the edited transcript.

Live video/waveform captions and MP4 exports use the same canvas drawing code,
font files, line layout and word timing. Playback reads the media clock for word
highlight changes. Letterboxing and video rotation metadata are respected.
Styling is disabled during grouping previews; apply or cancel them first.

## Subtitle and captioned video exports

The left sidebar offers **Subtitle file**, **Captioned video (MP4)** and
**Video + subtitle file**. Video choices require a loaded video with metadata;
audio-only projects can export subtitle files and preview on the waveform.
Video exports process the full source with permanently visible captions, using
H.264 video and AAC audio when audio exists. Odd dimensions are padded for MP4.
They do not crop or reformat the source into a vertical social-media layout.

The app renders transparent PNG overlays only when cue/highlight state changes,
then FFmpeg composites them over the source. Preparation and encoding have
progress and cancellation. Temporary frames and incomplete videos are removed
after completion/failure/cancel. Completed video publication preserves the source;
choose a different output name. PNG preparation uses temporary disk space in the
output folder, which can be substantial for long recordings with many words.

**Video + subtitle file** writes a same-name SRT, VTT or ASS beside the MP4;
a confirmation covers replacing an existing same-name subtitle file. These
sidecars retain source timing. Standalone subtitle exports still offer the
selection-zero option. ASS preserves basic font/color/outline/background and
position styling with centisecond timestamps. Word boxes, highlighting, rounded
corners and exact canvas layout are preserved in MP4 and project JSON, rather
than ASS. SRT/VTT/plain text contain text and timing without visual styling.

Fontsource integration follows its [catalogue](https://fontsource.org/docs/api/fonts)
and [font-file metadata](https://fontsource.org/docs/api/font-id) APIs. ASS
conventions follow the [Aegisub style documentation](https://aegisub.org/docs/latest/styles/).
