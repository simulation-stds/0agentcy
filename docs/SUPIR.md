# SUPIR on Ubuntu

The Linux integration uses a dedicated managed Python 3.10 runtime, separate
from VOSR and the legacy Windows Conda installation. Source is pinned to
Fanghua-Yu/SUPIR bda91af2000042f8bedfec8897d92917e67c1d88. GPU packages are
PyTorch 2.1.2+cu121, torchvision 0.16.2+cu121 and xFormers 0.0.23.post1.
The Python requirements keep the upstream dependency generation, with a
compatible Hugging Face Hub pin and fsspec 2023.6.0 to satisfy its dependency.

SUPIR uses a verified generation in the [shared Linux runtime store](WORKSPACE.md#shared-linux-tool-installations). Compatible checkouts reuse the source, model weights, and Python environment, and the store provides the managed Python and package cache. The original app-data install remains available during migration. Setup can import existing checkpoints and leaves their originals in place.

The installer reuses the managed uv bootstrap and does not require Conda or a
system CUDA Toolkit. It installs the pinned GPU stack before Python dependencies,
using constraints to prevent torch/xFormers upgrades. The marker fingerprints
the worker, requirements, constraints and runtime version. Status verifies imports,
a real PyTorch CUDA operation and a real xFormers attention operation. CUDA GPU
selection uses the runtime's own list with consistent PCI ordering; inherited
visibility masks and the Vulkan favourite are not used for Linux jobs.

The SDXL checkpoint already contains both text encoders. The adapter downloads
only the pinned CLIP configuration/tokenizer files, constructs the encoders
without downloading duplicate weights, verifies encoder coverage in the SDXL
state dict, then loads the base and selected SUPIR checkpoint. LLaVA is off by
default, imported lazily, and needs additional model downloads and memory if used.

Low VRAM is the default preset. On Linux it uses half precision weights, the
upstream tiled restoration sampler, upstream fast VAE normalization and tiled
VAE processing. Fast VAE normalization estimates normalization statistics and
can differ from the full/slow VAE path. Accelerate offloads restoration/text
network weights to CPU; the VAE and denoiser remain on GPU because the upstream
VAE hook manages its own device moves. Text encoder modules preload their
submodules to support direct parameter access. CPU offload trades speed and
system RAM for lower GPU memory use.

A host-memory watchdog protects against the large RAM/swap consumption observed
with the original slow tiled VAE. Runs require 14 GiB available at startup and
reserve headroom. The worker stops if available RAM falls below 3 GiB, worker
RSS plus swap exceeds min(20 GiB, startup available RAM minus 4 GiB), or worker
swap exceeds 2 GiB. A stopped worker never publishes a completed image.

Jobs use a shared operation lock, stage results in the output filesystem and
publish with no-clobber semantics after successful exit. Native cancellation
uses the existing job runner. Completed images are added individually to the
asset protocol scope for comparison previews outside the standard folders.

The Windows installer/runner remains on its legacy path. A null CUDA-device list
keeps its previous device UI; Linux returns a dedicated list, including an empty
list before setup. Default SUPIR selection is Auto. The current Quality and
Fidelity preset sampling values remain identical; model v0Q/v0F is independent.

Validation commands:
- python3 -m unittest discover -s app/tests -p test_supir_runner.py
- cargo test --manifest-path app/src-tauri/Cargo.toml supir::tests --lib
- npm run build from app

Real GPU verification and image-run logs are retained as local generated
artifacts under output/image/supir-ubuntu-test. Do not interpret a successful
runtime probe as verification of image restoration at every output size.
