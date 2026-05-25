# Video Tools

Local creative media tools for Windows, built with Tauri, React, and Rust.

The current MVP focuses on free local workflows:

- Video trim/export, frame extraction, and audio extraction with FFmpeg.
- Social export to H.264 MP4, GIF, animated WebP, and APNG.
- Real-ESRGAN local video upscaling with model comparison previews.
- RIFE local frame interpolation.
- Image dithering with several dithering algorithms.

## Project Layout

```text
videomaxxxing/
  app/      Tauri + React application source
  docs/     planning notes and backlog
  input/    optional local input staging folder
  output/   generated exports
  temp/     thumbnails, downloads, and job scratch files
  tools/    downloaded local binaries and models
```

`input`, `output`, `temp`, and `tools` are runtime folders. Their contents are ignored by git.

## Run

```powershell
.\run_app.bat
```

Or directly:

```powershell
cd app
npm.cmd run tauri dev
```

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

## Tools

The app can install or detect local tool binaries under `tools/`:

- FFmpeg from BtbN FFmpeg builds.
- Real-ESRGAN ncnn Vulkan.
- RIFE ncnn Vulkan.

Downloaded binaries and models are not committed. A new user should install tools from the app settings modal.

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
