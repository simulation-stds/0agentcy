# Simulation Studio

Local creative media tools for Windows, built with Tauri, React, TypeScript, Rust, and shadcn/Tailwind.

The current MVP focuses on free local workflows so the app stays easier to install, share, and run offline.

Current version: `v0.1.0`.

## Current Tools

### Video

- Trim/export MP4 with FFmpeg.
- Extract a frame from the current preview position.
- Extract video audio to MP3 or WAV.
- Social export to H.264 MP4, GIF, animated WebP, and APNG.
- Real-ESRGAN local upscaling with per-model frame comparison.
- RIFE local frame interpolation.
- FaceFusion local face swap/enhance through an isolated Conda environment.

### Image

- Dithering with Bayer, Floyd-Steinberg, Atkinson, blue noise, halftone, and random/noise algorithms.
- Source-color or custom-palette dithering.
- Color palette extraction with primary, secondary, and tertiary colors.
- Opposite-spectrum palette mode.
- Gradient suggestions and CSS export.

### Audio

- Dedicated audio workspace is present.
- Video-to-audio export still runs from the Video tools for this MVP.

## Project Layout

```text
videomaxxxing/
  app/      Tauri + React application source
  docs/     planning notes and backlog
  input/    optional local input staging folder
  output/   generated exports
  temp/     thumbnails, downloads, and job scratch files
  tools/    downloaded local binaries, Conda envs, and models
```

`input`, `output`, `temp`, and `tools` are runtime folders. Their contents should stay out of git.

## For Users

The intended MVP experience is that non-technical users install a packaged Simulation Studio build and manage tools from the app settings.

Users should not need to install Python manually. Tools that need Python, such as FaceFusion, use a managed Miniforge/Conda environment under `tools/`.

Minimum practical requirements:

- Windows 10/11.
- Current GPU drivers.
- FFmpeg, installed or managed from the app settings.

Optional requirements:

- Git, only for source-based tools such as FaceFusion.
- CUDA Toolkit 12.x and cuDNN 9, only for FaceFusion CUDA acceleration on NVIDIA GPUs.

Graphify, Ollama, DeepSeek, Node.js, Rust, and Visual Studio Build Tools are developer-only and are not needed to run the packaged app.

## Run From Source

On Ubuntu, run `./run_app.sh` from the project root or open the `Launch Videomaxxing.desktop` shortcut. For worktrees, staging, and validation, see the [workspace workflow](docs/WORKSPACE.md). For source responsibilities, see the [architecture guide](docs/ARCHITECTURE.md).

On Windows:

From the project root:

```powershell
.\run_app.bat
```

Or directly:

```powershell
cd app
npm.cmd run tauri dev
```

If Rust cannot find `link.exe`, run the app from **Developer PowerShell for VS 2022** or install Visual Studio Build Tools with the C++ workload.

## First-Time Setup

Open Settings in the app and use the tool sections to install or detect dependencies.

### Must Haves

- **FFmpeg**: required for metadata, trimming, export, audio extraction, thumbnails, and format conversion. FFprobe is part of the FFmpeg suite and is validated with it.
- **Git**: required for source-based AI tools such as FaceFusion. The app expects a normal system Git install.
- **Miniforge / Conda**: used for isolated Python environments. The app manages its own Miniforge under `tools/miniforge`.

### Local Video AI

- **Real-ESRGAN ncnn Vulkan**: shared per-user runtime and models, managed in Settings. Linux installation starts with the lightweight x2 model. See [installation and usage](docs/REALESRGAN.md).
- **RIFE ncnn Vulkan**: local frame interpolation. First-time install should keep `rife-v4.6` as the basic default.
- **FaceFusion**: local face swap/enhance. Uses a managed Conda environment and keeps FaceFusion's own model downloads/cache behavior.

### Optional NVIDIA CUDA Path

FaceFusion works with CPU and can use DirectML as the recommended broad Windows fallback. CUDA is optional and only needed if the user chooses the CUDA execution provider.

For CUDA FaceFusion on NVIDIA GPUs, the app process must be able to see:

- CUDA Toolkit 12.x `bin`, including `cublasLt64_12.dll`.
- cuDNN 9 for CUDA 12.x `bin`, including `cudnn64_9.dll`.

Useful checks from the same PowerShell session that launches the app:

```powershell
where.exe cublasLt64_12.dll
where.exe cudnn64_9.dll
```

If either command returns nothing, CUDA provider loading can fail even when CUDA or cuDNN is installed elsewhere. In Settings > Must haves > GPU Processing, pick the CUDA and cuDNN `bin` folders so the app can add them before launching FaceFusion.

## RIFE Model Guide

For frame interpolation, start with stability before chasing the newest model.

- `rife-v4.6`: best default for normal video. Try this first with `2x`, TTA off, and UHD off.
- `rife-v4`: useful fallback, especially for compatibility with custom frame/timestep behavior.
- `rife-v2.4`: lighter fallback when `rife-v4.6` fails or the GPU reports Vulkan device loss.
- `rife-v2.3`: older/light fallback for weaker GPUs.
- `rife-anime`: use for anime, cartoons, and 2D animation.
- `rife-HD`: try for HD real footage if `rife-v4.6` gives artifacts or fails.
- `rife-UHD`: only for very high resolution footage on a strong GPU; this is more likely to fail on limited VRAM.
- `rife`: legacy/basic fallback if newer models fail.

If interpolation fails with `vkQueueSubmit failed -4`, Vulkan reported `VK_ERROR_DEVICE_LOST`. Usually that means VRAM pressure, driver reset, too-heavy model/settings, or the wrong GPU. Try a shorter trim, `2x`, TTA off, UHD off, and a lighter model.

## FaceFusion Notes

FaceFusion may download provider/model files on first run, including files from GitHub or Hugging Face. That is normal. Repeated downloads usually mean the cache path is not being reused, the model files were removed, or the environment changed.

Execution providers shown in the FaceFusion action should be limited to providers detected in the managed environment. CUDA should only be used when the Settings GPU checks report CUDA/cuDNN as ready.

## Development

```powershell
cd app
npm.cmd install
npm.cmd run build
npm.cmd run tauri dev
```

Rust checks:

```powershell
cd app\src-tauri
cargo check
cargo fmt --check
```

Frontend stack:

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- shadcn/Radix primitives
- lucide-react for app icons

Backend stack:

- Tauri 2
- Rust commands for local tool orchestration
- External tools under `tools/`

### Codebase Map

Graphify is installed project-local for Codex navigation. See `docs/architecture/graphify.md` for the command path, graph build/update workflow, and indexing boundaries.

## Git Hygiene

Do not commit downloaded binaries, Conda environments, generated previews, outputs, or temporary jobs. The repo should contain source, docs, and lightweight app assets only.
