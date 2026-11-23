# Real-ESRGAN

Manage installation under **Settings → Video → Editing → Real-ESRGAN**. Choose
**Install runtime + suggested model** for the lightweight Anime Video x2 model.
Individual model download buttons add models without removing installed ones.
**Repair installation** reinstalls the pinned runtime and refreshes installed
bundled models. **Check installation** runs a small real inference and reports
Vulkan/driver errors. Individual models, all models, or the entire runtime and
models can be removed separately. These changes affect every project for this
user. Installs and deletion cannot run during a Real-ESRGAN job or comparison.

The executable and NCNN `.param`/`.bin` model pairs live together in
`app_local_data_dir/realesrgan`, outside the source checkout. On Linux this is
normally `~/.local/share/com.w2ds.videomaxxxing/realesrgan` (or the equivalent
under `XDG_DATA_HOME`). Launching from another directory or checkout reuses the
same installation. Administrator access, Python, PyTorch, CUDA and cuDNN packages
are not required. A working Vulkan implementation/GPU driver and FFmpeg are
required. GPU drivers and the Vulkan runtime remain system-managed.

The installer uses the official v0.2.5.0 / 20220424 portable distribution.
Linux x86-64 selects the Ubuntu ZIP and verifies its SHA-256; executable permission
is set explicitly. Windows and Intel macOS select their matching official ZIPs;
these platforms are not validated by Linux tests. Other architectures return an
explicit unsupported-platform error. Downloads and staging are temporary;
replacement is staged beside the shared installation and failures retain the
previous runtime. Only complete, nonempty model pairs appear as installed.
Legacy checkout-local executables are not used or deleted by this integration.

Use **Video → Action → AI Upscale with Real-ESRGAN**. Model, device, tile size,
threads, encoding quality and frame comparisons remain in the left sidebar.
The action requires a loaded video and an installed selected model. Anime Video
models map to the runtime's base model name with the matching 2×/3×/4× scale;
model paths are passed explicitly, independent of the working directory.

The selected range is extracted to temporary PNG frames, upscaled, then encoded
as H.264 MP4 with AAC audio when present. Intermediates are automatically cleaned
on success, failure or cancellation. Encoding stages output beside the final
file and publishes it only after success; failed/cancelled jobs retain any
existing output. Upscaling is a separate action; it does not apply video effects
or burn edited subtitles into the result. Variable-frame-rate inputs are rebuilt
at the source's reported frame rate.

Checks include package/platform selection, integrity failure, incomplete models,
model-path validation, model preservation and failed replacement rollback. The
ignored `official_linux_package_installs_and_upscales` test accepts
`REAL_ESRGAN_ARCHIVE` pointing to the official Ubuntu ZIP, installs into an
isolated temporary user-data directory and checks a real inference result and
its scaled PNG dimensions. It does not modify the actual user installation.
