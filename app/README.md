# Simulation Studio App

Tauri + React desktop app for local creative media workflows.

Version: `0.1.0`.

## Tech Stack

- Tauri 2
- Rust backend commands
- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- shadcn/Radix UI primitives

## Run

```powershell
npm.cmd run tauri dev
```

If Rust cannot find `link.exe`, launch from **Developer PowerShell for VS 2022** or install Visual Studio Build Tools with the Visual C++ workload.

## Build And Check

```powershell
npm.cmd run build
```

```powershell
cd src-tauri
cargo check
cargo fmt --check
```

## Runtime Folders

The app writes generated files and downloaded tools outside `app/src`:

```text
../output   generated exports
../temp     thumbnails, previews, downloads, and job scratch files
../tools    FFmpeg, Real-ESRGAN, RIFE, Miniforge, FaceFusion, models
```

These folders are runtime state and should not be committed.

## User Runtime Notes

Packaged app users should not need to install Python manually. Python-based tools run through the managed Miniforge/Conda environment under `../tools/miniforge`.

Graphify, Ollama, DeepSeek, Node.js, Rust, and Visual Studio Build Tools are development dependencies, not normal user requirements.

## Required Tools

The app settings modal manages or detects most dependencies:

- FFmpeg suite: required for media metadata and processing.
- Git: required for source-based tools such as FaceFusion.
- Miniforge / Conda: managed under `tools/miniforge` for Python AI tools.
- Real-ESRGAN ncnn Vulkan: local video upscaling.
- RIFE ncnn Vulkan: local interpolation.
- FaceFusion: local face swap/enhance.

## FaceFusion CUDA Checklist

CUDA is optional. DirectML is the simpler Windows fallback.

When using CUDA, the app process needs both CUDA and cuDNN DLLs visible:

```powershell
where.exe cublasLt64_12.dll
where.exe cudnn64_9.dll
```

If either command fails in the same shell that launches the app, select the CUDA Toolkit `bin` folder and cuDNN `bin` folder in Settings > Must haves > GPU Processing.

## RIFE Model Guide

Recommended troubleshooting order:

1. `rife-v4.6`, `2x`, TTA off, UHD off.
2. If GPU/Vulkan fails, try `rife-v2.4`.
3. If it still fails, try `rife-v2.3`.
4. For anime/cartoon footage, try `rife-anime`.
5. Avoid `rife-UHD` unless the source is high resolution and the GPU has enough VRAM.

If interpolation fails with `vkQueueSubmit failed -4`, Vulkan reported `VK_ERROR_DEVICE_LOST`. Usually that means VRAM pressure, driver reset, too-heavy model/settings, or the wrong GPU.
