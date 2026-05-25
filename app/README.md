# Video Tools Tauri App

Local Tauri + React desktop app for FFmpeg video utilities, Real-ESRGAN upscaling, and RIFE frame interpolation.

## Run

```powershell
npm.cmd run tauri dev
```

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

Recommended troubleshooting order:

1. `rife-v4.6`, `2x`, TTA off, UHD off.
2. If GPU/Vulkan fails, try `rife-v2.4`.
3. If it still fails, try `rife-v2.3`.
4. For anime/cartoon footage, try `rife-anime`.
5. Avoid `rife-UHD` unless the source is high resolution and the GPU has enough VRAM.

If interpolation fails with `vkQueueSubmit failed -4`, Vulkan reported `VK_ERROR_DEVICE_LOST`. Usually that means VRAM pressure, driver reset, too-heavy model/settings, or the wrong GPU. Try a shorter trim, `2x`, TTA off, UHD off, and a lighter model.
