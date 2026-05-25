# Personal Video Tools App Pipeline

## Goal

Build a small local Windows desktop app for personal use that acts as a clean GUI around FFmpeg and free/open-source video enhancement tools.

The app should help with common video workflows:

- FFmpeg video cleanup/export
- high-quality GIF creation
- small GIF creation
- animated WebP creation
- frame extraction
- audio extraction
- ProRes conversion for After Effects
- optional AI video upscaling
- optional frame interpolation

The app does not need to implement video processing itself. It should run command-line tools locally and provide a simple interface for presets, file selection, progress logs, and output management.

---

## Target User

Single personal user on Windows.

No commercial distribution is planned. The app can assume tools are installed locally or placed in a local `tools` folder.

---

## Recommended Tech Stack

Use:

```text
Python + PySide6
```

Reasons:

- good for quick desktop GUI development
- easy to run subprocess commands
- simple file pickers and log panels
- easier than Electron/Tauri for a personal utility
- lightweight enough for a small local tool

Alternative options:

| Stack | Notes |
|---|---|
| Python + PySide6 | Recommended |
| Python + Tkinter | Simpler but uglier UI |
| Electron + Node | Nice UI, heavier |
| Tauri | Lightweight but more setup |
| PowerShell menu | Fastest prototype, not a real GUI |

---

## Local Folder Structure

Suggested project layout:

```text
D:\VideoToolsApp\
├─ app.py
├─ presets.json
├─ settings.json
├─ tools\
│  ├─ ffmpeg.exe
│  ├─ ffprobe.exe
│  ├─ realesrgan-ncnn-vulkan.exe
│  ├─ rife-ncnn-vulkan.exe
│  └─ other-tools\
├─ temp\
├─ output\
└─ logs\
```

The app should first check the local `tools` folder, then optionally fall back to tools available in the system `PATH`.

---

## External Tools

### Required

```text
ffmpeg.exe
ffprobe.exe
```

### Optional AI Tools

```text
realesrgan-ncnn-vulkan.exe
rife-ncnn-vulkan.exe
```

Optional future tools:

```text
waifu2x-ncnn-vulkan.exe
anime4k-based workflow
```

---

## Core App Concept

The app should behave like a preset launcher.

Basic flow:

```text
Choose input file
→ choose preset
→ adjust simple settings if needed
→ choose output folder/name
→ run command
→ show live terminal log
→ open output folder
```

The commands should be defined in `presets.json` so they can be edited without changing the Python code.

---

## Minimum Viable Product

Version 1 should include:

1. Input file picker
2. Output folder picker
3. Preset dropdown
4. Output filename field
5. Run button
6. Cancel button
7. Live command log
8. Progress/status text
9. Open output folder button
10. Tool path detection

---

## Recommended Presets

### 1. Telegram-Friendly H.264 MP4

Purpose:

- clean MP4 export
- animation-friendly H.264 compression
- good compatibility
- no audio

Command template:

```powershell
ffmpeg -i "{input}" ^
-vf "fps=24,scale=1280:-2:flags=lanczos,gradfun=strength=0.6" ^
-an ^
-c:v libx264 ^
-pix_fmt yuv420p ^
-movflags +faststart ^
-preset veryslow ^
-crf 18 ^
-tune animation ^
"{output}"
```

PowerShell version:

```powershell
ffmpeg -i "{input}" `
-vf "fps=24,scale=1280:-2:flags=lanczos,gradfun=strength=0.6" `
-an `
-c:v libx264 `
-pix_fmt yuv420p `
-movflags +faststart `
-preset veryslow `
-crf 18 `
-tune animation `
"{output}"
```

Recommended editable settings:

```text
fps: 24
width: 1280
crf: 18
preset: veryslow
gradfun strength: 0.6
```

---

### 2. High-Quality GIF

Purpose:

- best visual GIF quality
- uses two-pass palette workflow
- bigger files expected

Step 1: generate palette

```powershell
ffmpeg -i "{input}" `
-vf "fps=24,scale=960:-1:flags=lanczos,palettegen=stats_mode=full" `
-frames:v 1 -update 1 `
"{temp_palette}"
```

Step 2: create GIF

```powershell
ffmpeg -i "{input}" -i "{temp_palette}" `
-filter_complex "fps=24,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a" `
-loop 0 `
"{output}"
```

Recommended editable settings:

```text
fps: 24
width: 960
dither: sierra2_4a
stats_mode: full
loop: 0
```

Notes:

- The palette PNG will be tiny, usually 16×16. This is expected.
- The palette is not the GIF. It is only a color lookup image.
- GIFs are limited to 256 colors, so the palette workflow is important.

---

### 3. Smaller GIF

Purpose:

- much smaller GIFs
- lower quality than HQ GIF
- better for chat/web posting

Step 1: generate palette

```powershell
ffmpeg -i "{input}" `
-vf "fps=15,scale=540:-1:flags=lanczos,palettegen=stats_mode=diff" `
-frames:v 1 -update 1 `
"{temp_palette}"
```

Step 2: create GIF

```powershell
ffmpeg -i "{input}" -i "{temp_palette}" `
-filter_complex "fps=15,scale=540:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" `
-loop 0 `
"{output}"
```

Recommended editable settings:

```text
fps: 15
width: 540
dither: bayer
bayer_scale: 4
stats_mode: diff
diff_mode: rectangle
```

---

### 4. Balanced GIF

Purpose:

- good middle ground between quality and filesize

Step 1:

```powershell
ffmpeg -i "{input}" `
-vf "fps=18,scale=720:-1:flags=lanczos,palettegen=stats_mode=diff" `
-frames:v 1 -update 1 `
"{temp_palette}"
```

Step 2:

```powershell
ffmpeg -i "{input}" -i "{temp_palette}" `
-filter_complex "fps=18,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" `
-loop 0 `
"{output}"
```

Recommended editable settings:

```text
fps: 18
width: 720
dither: bayer
bayer_scale: 3
stats_mode: diff
diff_mode: rectangle
```

---

### 5. Animated WebP

Purpose:

- better modern alternative to GIF
- usually much smaller
- better quality than GIF

Command:

```powershell
ffmpeg -i "{input}" `
-vf "fps=24,scale=960:-1:flags=lanczos" `
-loop 0 `
-c:v libwebp `
-quality 85 `
-compression_level 6 `
"{output}"
```

Recommended editable settings:

```text
fps: 24
width: 960
quality: 85
compression_level: 6
```

---

### 6. Extract Last Frame

Purpose:

- save final frame of a video as PNG

Command:

```powershell
ffmpeg -sseof -0.1 -i "{input}" -frames:v 1 "{output}"
```

Recommended output extension:

```text
.png
```

---

### 7. Extract Frame at Timestamp

Purpose:

- save one frame from a specific timestamp

Command:

```powershell
ffmpeg -ss {timestamp} -i "{input}" -frames:v 1 "{output}"
```

Example timestamp:

```text
00:00:05.500
```

Recommended editable settings:

```text
timestamp
```

---

### 8. Convert MP4 to WAV

Purpose:

- extract uncompressed audio

Command:

```powershell
ffmpeg -i "{input}" -vn -acodec pcm_s16le -ar 44100 -ac 2 "{output}"
```

Recommended output extension:

```text
.wav
```

---

### 9. Convert MP4 to MP3

Purpose:

- extract compressed audio

Command:

```powershell
ffmpeg -i "{input}" -vn -codec:a libmp3lame -q:a 2 "{output}"
```

Recommended output extension:

```text
.mp3
```

---

### 10. Convert MP4 to ProRes for After Effects

Purpose:

- create editing-friendly file
- avoid H.264 decoding issues in After Effects
- useful before time remapping, frame blending, or heavy compositing

No audio:

```powershell
ffmpeg -i "{input}" -fps_mode cfr -r 24 -c:v prores_ks -profile:v 2 -pix_fmt yuv422p10le "{output}"
```

With audio:

```powershell
ffmpeg -i "{input}" -fps_mode cfr -r 24 -c:v prores_ks -profile:v 2 -pix_fmt yuv422p10le -c:a pcm_s16le "{output}"
```

Recommended output extension:

```text
.mov
```

Recommended editable settings:

```text
fps: 24
profile: 2
include_audio: true/false
```

ProRes profile values:

| Profile | Value | Use |
|---|---:|---|
| Proxy | 0 | Lightweight editing |
| LT | 1 | Smaller files |
| 422 | 2 | Recommended balance |
| HQ | 3 | Higher quality |
| 4444 | 4 | Alpha/transparency support |

---

## Optional AI Upscaling Pipeline

AI tools should be optional and disabled if the executable is not found.

### Real-ESRGAN Upscale

Purpose:

- upscale video frames
- improve perceived detail
- useful for animation, motion graphics, and compressed footage

Suggested workflow:

```text
Input video
→ extract frames
→ upscale frames with Real-ESRGAN
→ reassemble video with FFmpeg
→ optionally copy or reattach audio
```

Frame extraction:

```powershell
ffmpeg -i "{input}" "{temp_frames}\frame_%08d.png"
```

Upscale frames:

```powershell
realesrgan-ncnn-vulkan.exe -i "{temp_frames}" -o "{upscaled_frames}" -n realesrgan-x4plus-anime -s 2 -f png
```

Reassemble video:

```powershell
ffmpeg -framerate {fps} -i "{upscaled_frames}\frame_%08d.png" `
-i "{input}" `
-map 0:v:0 -map 1:a? `
-c:v libx264 `
-crf 18 `
-preset slow `
-pix_fmt yuv420p `
-c:a copy `
-shortest `
"{output}"
```

Recommended editable settings:

```text
scale: 2 or 4
model: realesrgan-x4plus-anime / realesrgan-x4plus
fps: detected from source
crf: 18
preset: slow
```

Important:

- Detect source FPS with `ffprobe`.
- Use numbered PNG frames.
- Keep temporary folders unique per job.
- For animation/motion graphics, anime-oriented models may work better.

---

## Optional Frame Interpolation Pipeline

### RIFE Interpolation

Purpose:

- convert 24 fps to 48/60 fps
- create smoother motion
- useful for motion graphics and animation

Suggested workflow:

```text
Input video
→ extract frames
→ interpolate with RIFE
→ reassemble video at higher FPS
→ optionally copy or reattach audio
```

Example target:

```text
24 fps → 48 fps
24 fps → 60 fps
```

The exact command depends on the specific RIFE executable being used.

The app should expose this as an optional advanced preset only after the tool path is configured.

---

## FFprobe Metadata Detection

The app should use `ffprobe` to detect:

- duration
- width
- height
- frame rate
- codec
- audio presence

Example command:

```powershell
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,avg_frame_rate,codec_name -show_entries format=duration -of json "{input}"
```

Use this data to:

- auto-fill FPS
- suggest output dimensions
- warn if there is no audio
- estimate whether scaling is up/down/no-op
- generate better output names

---

## Preset JSON Design

Use a `presets.json` file so commands can be modified without editing the app.

Example structure:

```json
{
  "telegram_mp4": {
    "name": "Telegram-Friendly H.264 MP4",
    "type": "single_command",
    "output_extension": ".mp4",
    "command": "ffmpeg -i {input} -vf fps={fps},scale={width}:-2:flags=lanczos,gradfun=strength={gradfun} -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart -preset {preset} -crf {crf} -tune animation {output}",
    "settings": {
      "fps": 24,
      "width": 1280,
      "gradfun": 0.6,
      "preset": "veryslow",
      "crf": 18
    }
  },
  "balanced_gif": {
    "name": "Balanced GIF",
    "type": "multi_command",
    "output_extension": ".gif",
    "commands": [
      "ffmpeg -i {input} -vf fps={fps},scale={width}:-1:flags=lanczos,palettegen=stats_mode=diff -frames:v 1 -update 1 {temp_palette}",
      "ffmpeg -i {input} -i {temp_palette} -filter_complex fps={fps},scale={width}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale={bayer_scale}:diff_mode=rectangle -loop 0 {output}"
    ],
    "settings": {
      "fps": 18,
      "width": 720,
      "bayer_scale": 3
    }
  }
}
```

Implementation note:

- Do not execute commands through a shell string if avoidable.
- Prefer building argument arrays for subprocess safety.
- If using template strings, quote paths carefully.

---

## GUI Layout

Suggested UI:

```text
┌──────────────────────────────────────────────┐
│ Input File                                   │
│ [ D:\path\video.mp4                  Browse ]│
│                                              │
│ Preset                                       │
│ [ Balanced GIF                         v ]   │
│                                              │
│ Output Folder                                │
│ [ D:\path\output                    Browse ]│
│                                              │
│ Output Name                                  │
│ [ video_balanced.gif                       ] │
│                                              │
│ Settings                                     │
│ FPS: [18]   Width: [720]   Quality/CRF: [...]│
│                                              │
│ [ Run ] [ Cancel ] [ Open Output Folder ]    │
│                                              │
│ Log                                          │
│ ┌──────────────────────────────────────────┐ │
│ │ ffmpeg output appears here...            │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

---

## Important Implementation Details

### Subprocess Handling

Use `subprocess.Popen` so the app can:

- stream logs live
- cancel running jobs
- show progress
- detect success/failure

### Cancel Button

The cancel button should terminate the active process.

For multi-step presets, the app should stop before the next command if cancellation is requested.

### Temporary Files

Use unique temp folders per job:

```text
temp/job_YYYYMMDD_HHMMSS_randomid/
```

Clean up temp files after successful jobs, unless debug mode is enabled.

### Output Naming

Auto-generate names like:

```text
input_telegram.mp4
input_hq.gif
input_small.gif
input_webp.webp
input_prores.mov
input_upscaled_2x.mp4
```

### Tool Detection

On startup, detect:

```text
tools/ffmpeg.exe
tools/ffprobe.exe
tools/realesrgan-ncnn-vulkan.exe
tools/rife-ncnn-vulkan.exe
```

If missing, show:

```text
FFmpeg: found / missing
FFprobe: found / missing
Real-ESRGAN: found / missing
RIFE: found / missing
```

Disable presets that need missing tools.

---

## Quality Guidance for Presets

### MP4 Quality

Use CRF for H.264 quality:

| CRF | Result |
|---:|---|
| 12–16 | Very high quality, large file |
| 17–20 | Good balance |
| 21–24 | Smaller file, more compression |
| 25+ | Low quality |

Recommended default:

```text
crf 18
```

### GIF Quality and Size

Biggest filesize factors:

| Setting | Smaller | Higher Quality |
|---|---|---|
| FPS | 12–18 | 20–24 |
| Width | 480–720 | 960–1280 |
| Dither | bayer | sierra2_4a |
| Palette stats | diff | full |

Recommended defaults:

```text
Small GIF: 15 fps, 540 width
Balanced GIF: 18 fps, 720 width
HQ GIF: 24 fps, 960 width
```

### WebP Quality

Animated WebP is usually better than GIF for modern sharing.

Recommended default:

```text
quality 85
compression_level 6
```

---

## Color and Warning Notes

FFmpeg may show warnings such as:

```text
The input frame is not in sRGB, colors may be off
```

This often appears during GIF palette generation from BT.709 video sources.

It is usually not fatal.

The app can show a friendly note:

```text
Palette created successfully. Color-space warning is common for video-to-GIF conversion.
```

Palette PNGs are expected to be tiny, often 16×16.

---

## Safety and Reliability

The app should:

- never overwrite files without confirmation
- show the full command before running if advanced mode is enabled
- save logs for failed jobs
- validate input exists
- validate output folder exists
- check that required tools are present
- avoid deleting source files
- keep temp files if a job fails

---

## Suggested Build Phases

### Phase 1 — FFmpeg MVP

Build basic GUI with:

- input picker
- output picker
- preset dropdown
- live log
- run/cancel

Include presets:

- Telegram MP4
- Balanced GIF
- Small GIF
- Animated WebP
- Extract Last Frame
- Extract Frame at Timestamp
- MP4 to WAV
- MP4 to MP3
- ProRes

### Phase 2 — Metadata and Smarter Defaults

Add:

- ffprobe metadata detection
- auto FPS detection
- auto output naming
- preset-specific settings UI
- simple file size reporting

### Phase 3 — AI Upscaling

Add:

- Real-ESRGAN path detection
- frame extraction
- frame upscaling
- video reassembly
- temp folder management

### Phase 4 — Frame Interpolation

Add:

- RIFE support
- target FPS control
- interpolation workflow

### Phase 5 — Polish

Add:

- saved settings
- recent files
- drag-and-drop input
- dark mode
- command preview
- better progress parsing
- error explanations

---

## Final Recommended MVP Scope

Start with FFmpeg only.

Do not start with AI upscaling first. It adds complexity because of frame extraction, temp folders, model selection, and reassembly.

The best first version is:

```text
A clean FFmpeg preset launcher with editable JSON presets.
```

Once that works, add Real-ESRGAN as a second-stage workflow.

---

## Summary for Another LLM

Build a personal Windows desktop app in Python with PySide6. The app should provide a GUI for common FFmpeg workflows and later optional AI upscaling workflows. Use a `presets.json` file to store command templates. The app should detect local tools, let the user pick an input file and output folder, select a preset, edit basic parameters, run commands with live logs, support canceling, and manage temporary files. Start with FFmpeg presets only, then add Real-ESRGAN and RIFE workflows after the core launcher is stable.

