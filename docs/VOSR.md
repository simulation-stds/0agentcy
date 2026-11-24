# VOSR 2.0 image upscaling

Install from **Settings → Image → Editing → Install VOSR 2.0**. Setup manages
Python 3.11, a dedicated environment, GPU-enabled PyTorch, the inference code,
and the matched VOSR2, Qwen image VAE and DINOv2-L model files. Git, Conda,
ComfyUI, system Python and a system CUDA Toolkit are not required. Windows and
Linux x86-64 are supported; running an upscale requires a compatible NVIDIA
GPU and driver. PyTorch 2.8.0 / torchvision 0.23.0 use the CUDA 12.8 wheel index.

Choose **Image → VOSR 2.0 Upscale**, load a still image, set the output name,
choose 1× restoration, 2× or 4× enlargement, and run. The result is saved as PNG
in the configured Image output directory and shown beside the original with a
comparison slider. Existing output files are never overwritten. Animated
images are rejected. Outputs currently contain RGB pixels without source
metadata or transparency. Cancel terminates the worker and discards its staged
output. No inference-time downloads occur after installation.

## Shared installation

On Linux, VOSR uses a verified generation in the [shared runtime store](WORKSPACE.md#shared-linux-tool-installations). Settings displays the selected environment and model paths. The store owns the Linux uv bootstrap, managed Python, and package cache. The original app-data install remains a fallback during migration.

On Windows, the default root is `<app local data>/shared/vosr`. An absolute `VIDEOMAXXING_SHARED_MODELS` selects a different parent directory for its `vosr` subdirectory.

```text
shared/vosr/
  runtimes/vosr2-v1/env/          dedicated Python packages
  runtimes/vosr2-v1/worker.py     application-owned runner
  models/<model revision>/       verified bundle and resumable .part files
  code/                          pinned upstream source and its license
  dino/                          pinned vision encoder source and its license
  licenses/                      additional upstream notices
  cache/                         feature-specific model caches
  operation.lock                 OS-managed exclusive install/job lock
```

Ordinary Linux checkouts select the same compatible installation. A file lock
coordinates setup and repair. Staging can build its own candidate. Readiness
requires successful dependency import, model-file validation and a marker tied
to this integration's runner and requirements. An interrupted installation can
be resumed with Install; Repair reinstalls/checks packages and verifies the
bundle without deleting the model directory. Other tools' environments are
unaffected. There is deliberately no shared-storage deletion button.

Package downloads use a 300-second HTTP read timeout, up to five retries, and
two concurrent transfers to tolerate slow or congested connections while
fetching large CUDA wheels. Retrying setup reuses completed cached downloads;
interrupted downloads may need to start again. Restart the desktop app after
updating the installer so the new settings take effect.

Model downloads use direct HTTPS instead of the native Xet transfer backend.
Requests cover at most 64 MiB at a time, have a 30-second socket timeout, and
reconnect automatically with a fresh redirect and an HTTP Range request from
the saved byte offset. Up to eight consecutive connection failures are retried
with bounded backoff. If the connection stays unavailable, Install resumes the
saved bytes in the same app session; a restart is not needed.

The downloader validates Content-Range before appending bytes, handles servers
that ignore Range without corrupting a prefix, and verifies every completed
artifact against a pinned SHA-256 digest before atomically publishing it.
Completed files are verified and reused. Existing Xet partial files are adopted
without copying; if they contain non-contiguous or corrupt data, checksum
verification triggers one automatic clean retry of that file only.

Transfers report newline-delimited byte counts, percentages, recent speed and
an approximate remaining time every ten seconds. Silent reads time out and
retry automatically. Small source archives and license notices also use bounded
timeouts and retries. No model download relies on a private Hugging Face hook.

## Pinned assets and inference

- VOSR source: `cswry/VOSR@516f292b99cf23c76fdc33351e86dc4f97711fe8`.
- Model bundle: `CSWRY/VOSR@f24b3061b7f350b81e1907bdcfc27f71fb4ff3f3`.
- DINOv2 source: `facebookresearch/dinov2@7764ea0f912e53c92e82eb78a2a1631e92725fc8`.
- Private uv bootstrap: `0.9.10`, with platform-specific SHA-256 verification.

Inference uses the official one-step entry point with a local-only DINOv2
loader, explicit shared VAE path, orientation-normalized temporary input, and
output dimension/PNG verification. Eager PyTorch replaces optional compilation
to avoid requiring Triton or a compiler on Windows. Only the DiT and vision
encoder use BF16 (or FP16 when BF16 is unavailable); the VAE stays FP32.
The isolated runner supplies a standard PyTorch RMS normalization module with
matching parameter names instead of importing unused upstream Llama training
utilities and fairscale. Source notices remain with the downloaded source.

VOSR defaults to Auto and lists only GPUs reported by its own CUDA runtime.
Explicit selections use stable NVIDIA GPU UUIDs when available. The global
favourite device uses a different enumeration and is not passed to VOSR.
Worker processes discard inherited CUDA visibility masks before applying an
explicit VOSR selection; probing and inference use the same PCI device order.

Standard mode uses 512-pixel diffusion tiles; Lower memory uses 256. Both default to
tiled VAE processing; Advanced can override its tile size or disable it. Memory requirements and runtime must be measured on the
target GPU; the UI does not invent an ETA.

The VOSR model card licenses its own weights under Apache-2.0 and identifies
separate upstream terms for its VAE and DINOv2 components. Preserve the source,
model card and upstream notices when redistributing. See
[VOSR model terms](https://huggingface.co/CSWRY/VOSR#license).

## Validation

From `app`: `npm run build`, `node --test tests/tool-loading.test.mjs`.
From `app/src-tauri`: `cargo test vosr::tests`.
From the repository root: `python3 -m unittest discover -s app/tests -p test_vosr_runner.py`.
Downloader fault tests: `python3 -m unittest discover -s app/tests -p test_vosr_download.py`.
The latter includes local HTTP-server tests that drop or stall real sockets;
those two tests skip if the environment does not allow loopback sockets.
Before release, install on a target NVIDIA machine and verify 1×/2×/4× output,
large-image tiling, cancellation, restart/resume and reuse from another checkout.


## Optional xFormers and Advanced settings

Install/Repair attempts the pinned `xformers==0.0.32.post2` binary from the
PyTorch CUDA 12.8 index with `--no-deps`, preserving PyTorch 2.8. A failed optional
installation leaves PyTorch inference available. The readiness fingerprint
includes the optional package pin as well as the worker and base requirements.

Advanced exposes Auto/PyTorch/xFormers attention, wavelet/AdaIN/no color correction,
restoration tile overlap, VAE tile size (512/1024/2048 or full image), and VAE
overlap. Defaults preserve 512-pixel restoration tiles, 64-pixel restoration
overlap, 1024-pixel VAE tiles and 128-pixel VAE overlap. Backend RPC fields have
backward-compatible defaults; both Rust and Python validate the choices.

Auto prefers xFormers if a CUDA operation with the encoder's dtype and default
1025-token/16-head/64-channel shape succeeds. The integration changes only the
DINOv2 attention operation, keeping the original modules and weights. DiT/VAE
retain PyTorch SDPA and their existing precision. We intentionally keep DINO's
upstream optional implementation selection disabled to avoid swapping its MLP
or SwiGLU implementation. Unsupported imports/kernels fall back to PyTorch;
a runtime attention failure switches all remaining vision attention calls to
PyTorch. Logs report the final backend, successful xFormers call count and reason
for any fallback. An explicit PyTorch selection does not import xFormers.

Restoration overlap has an upstream minimum of one eighth of the tile; zero
selects that minimum. Zero VAE overlap follows the restoration overlap (and
upstream's own minimum). Full-image VAE keeps FP32 processing on the GPU and
can exceed VRAM; it does not silently switch device, precision or resolution.
The UI does not expose CFG for the one-step sampler, or imply that extra steps
improve this checkpoint. VAE latent encoding remains deterministic.

The output publication grants asset-protocol access to that completed image so
comparison works with custom output folders, including mounted workspace drives.
A failed result-image request displays a preview error rather than silently
showing the original on both sides.

Measured on the project's RTX 4070 Laptop with the 1199x1171 test photo at 2x:
PyTorch 16.755 s versus xFormers 16.811 s for the restoration stage, both with
5.895 GiB peak allocated / 7.260 GiB peak reserved GPU memory. These are medians
of two measured subprocess runs per backend after one discarded warmup each.
Each xFormers run used its attention operation 864 times with no fallback.
This test establishes functionality, but no meaningful speed or peak-memory
advantage for this photo. Raw logs, outputs, settings and methodology are in
`output/image/vosr-xformers-benchmark/` (local generated artifacts).
