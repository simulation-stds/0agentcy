"""Pinned VOSR 2.0 setup and offline inference for Videomaxxing.

The process owns no global Python settings. All downloaded assets live below --root.
"""
import argparse
import hashlib
import http.client
import re
import importlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import threading
import time
import types
import urllib.error
import urllib.request
import zipfile

CODE_REVISION = "516f292b99cf23c76fdc33351e86dc4f97711fe8"
MODEL_REVISION = "f24b3061b7f350b81e1907bdcfc27f71fb4ff3f3"
DINO_REVISION = "7764ea0f912e53c92e82eb78a2a1631e92725fc8"
MODEL_FILES = (
    "VOSR2/args.json",
    "VOSR2/checkpoints/ema_model.safetensors",
    "Qwen-Image-vae-2d/config.json",
    "Qwen-Image-vae-2d/diffusion_pytorch_model.safetensors",
    "torch_cache/checkpoints/dinov2_vitl14_pretrain.pth",
)


class DownloadProgress:
    """Newline progress for the pinned Hub client's HTTP and Xet callbacks.

    Terminal progress bars use carriage returns, which the desktop log reader
    cannot display until a newline arrives. A timer also reports silent stalls.
    """
    def __init__(self, desc, total=None, initial=0, report=print, clock=time.monotonic, interval=10):
        self.desc, self.total, self.n = desc, total, initial
        self.report, self.clock, self.interval = report, clock, interval
        self.last_change = self.last_report = clock()
        self.last_bytes = initial
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.thread = None

    def update(self, amount):
        if amount > 0:
            with self.lock:
                self.n += amount
                self.last_change = self.clock()

    def message(self):
        with self.lock:
            now = self.clock()
            size = f"{self.n / 1_000_000:.1f} MB"
            if self.total:
                size += f" / {self.total / 1_000_000:.1f} MB ({min(100, self.n / self.total * 100):.1f}%)"
            elapsed = now - self.last_report
            transferred = self.n - self.last_bytes
            if elapsed > 0 and transferred > 0:
                rate = transferred / elapsed
                size += f" | {rate / 1_000_000:.2f} MB/s"
                if self.total and self.n < self.total:
                    size += f" | about {int((self.total - self.n) / rate)}s remaining"
            elif not self.total or self.n < self.total:
                idle = int(now - self.last_change)
                size += f" | no transfer progress for {idle}s"
                if idle >= 60:
                    size += "; connection may be stalled or retrying"
            self.last_report, self.last_bytes = now, self.n
            return f"{self.desc}: {size}"

    def emit(self):
        self.report(self.message(), flush=True)

    def __enter__(self):
        self.emit()
        def monitor():
            while not self.stop.wait(self.interval):
                self.emit()
        self.thread = threading.Thread(target=monitor, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, *_):
        self.stop.set()
        if self.thread:
            self.thread.join()
        self.emit()


# Sizes and SHA-256 digests from the pinned repository revision, not mutable HEAD.
MODEL_MANIFEST = (
    ("VOSR2/args.json", 816, "63b2f423eafae1f684ca860eb8fd0e81aa5fac858397f783d8f337871241c281"),
    ("VOSR2/checkpoints/ema_model.safetensors", 5576385424, "bdcaa81e4c675b6074de643e27daafe73eb8125d4d0264d1bf30a004e9644b71"),
    ("Qwen-Image-vae-2d/config.json", 811, "1e294faf15188e06fcb72ce09652e8fb7368bd77b8dd794b5b39fe77d610681b"),
    ("Qwen-Image-vae-2d/diffusion_pytorch_model.safetensors", 178418892, "1dd2c67f3f29734d48709513ed181d4f351966d76ba95f77a5cff8e1daf547fa"),
    ("torch_cache/checkpoints/dinov2_vitl14_pretrain.pth", 1217586395, "d5383ea8f4877b2472eb973e0fd72d557c7da5d3611bd527ceeb1d7162cbf428"),
    ("README.md", 5013, "f599967907906e697e0faddcdac614cda70845f1ac415eb8c478cd232b26a8ee"),
)


class DownloadProtocolError(RuntimeError):
    pass


def file_digest(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(4 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download_verified(url, destination, size, checksum, *, legacy_partial=None,
                      timeout=30, max_failures=8, range_size=64 * 1024 * 1024,
                      opener=urllib.request.urlopen, sleep=time.sleep, report=print):
    """Resume durable bytes after broken connections; publish only a verified file.

    Every request asks for a bounded range and gets a fresh redirect URL. The
    socket timeout bounds silent reads. We do not enter hf-xet's native retry
    loop, and no signed download URL or authentication is written to the log.
    """
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(f"{destination.name}.{checksum}.part")
    if destination.is_file():
        report(f"Verifying {destination.name} already on disk…", flush=True)
        if destination.stat().st_size == size and file_digest(destination) == checksum:
            report(f"{destination.name}: verified, reusing completed download", flush=True)
            return destination
        report(f"{destination.name}: existing file failed verification; downloading a replacement", flush=True)
    if not partial.exists() and legacy_partial and Path(legacy_partial).is_file():
        # Rename, not copy: keep the previous downloader's progress. Xet may
        # have written non-contiguous ranges, so the final checksum is mandatory.
        Path(legacy_partial).replace(partial)
        report(f"{destination.name}: retaining {partial.stat().st_size / 1_000_000:.1f} MB from previous attempt", flush=True)
    if partial.exists() and partial.stat().st_size > size:
        report(f"{destination.name}: partial file is oversized; restarting this file", flush=True)
        partial.unlink()
    failures, integrity_failures = 0, 0
    with DownloadProgress(destination.name, size, partial.stat().st_size if partial.exists() else 0,
                          report=report) as progress:
        while True:
            offset = partial.stat().st_size if partial.exists() else 0
            if offset == size:
                report(f"Verifying {destination.name} SHA-256…", flush=True)
                if file_digest(partial) == checksum:
                    os.replace(partial, destination)
                    report(f"{destination.name}: download complete and checksum verified", flush=True)
                    return destination
                integrity_failures += 1
                if integrity_failures > 1:
                    raise RuntimeError(f"{destination.name}: checksum failed twice; no unverified model was installed")
                report(f"{destination.name}: checksum failed; automatically restarting this file only", flush=True)
                partial.unlink()
                with progress.lock:
                    progress.n = progress.last_bytes = 0
                    progress.last_change = progress.clock()
                continue
            end = min(size - 1, offset + range_size - 1)
            # Bypass cached expired redirect signatures on reconnect.
            separator = "&" if "?" in url else "?"
            request_url = f"{url}{separator}download=true&vmx_request={time.time_ns()}"
            request = urllib.request.Request(request_url, headers={
                "Range": f"bytes={offset}-{end}", "Accept-Encoding": "identity",
                "Cache-Control": "no-cache", "User-Agent": "Videomaxxing-VOSR/1",
            })
            try:
                with opener(request, timeout=timeout) as response:
                    status = response.status
                    if status == 206:
                        match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", response.headers.get("Content-Range", ""))
                        if (not match or int(match[1]) != offset or int(match[2]) != end
                                or int(match[3]) != size):
                            raise DownloadProtocolError("server returned a mismatched byte range")
                        remaining = end - offset + 1
                    elif status == 200:
                        # A server ignoring Range must never be appended to a
                        # prefix. Its complete response safely replaces the prefix.
                        if response.headers.get("Content-Length") != str(size):
                            raise DownloadProtocolError("server returned an unexpected file size")
                        if offset:
                            report(f"{destination.name}: server ignored resume; restarting this file safely", flush=True)
                            partial.write_bytes(b"")
                            with progress.lock:
                                progress.n = progress.last_bytes = 0
                                progress.last_change = progress.clock()
                        offset, remaining = 0, size
                    else:
                        raise DownloadProtocolError(f"unexpected HTTP status {status}")
                    mode = "r+b" if partial.exists() else "w+b"
                    with partial.open(mode) as output:
                        output.seek(offset)
                        while remaining:
                            block = response.read1(min(1024 * 1024, remaining))
                            if not block:
                                raise DownloadProtocolError("connection closed before the requested range finished")
                            output.write(block)
                            progress.update(len(block))
                            remaining -= len(block)
                        output.flush()
                        os.fsync(output.fileno())
                failures = 0
            except (urllib.error.URLError, TimeoutError, ConnectionError,
                    http.client.HTTPException, DownloadProtocolError) as error:
                failures += 1
                if isinstance(error, urllib.error.HTTPError):
                    error.close()
                    if error.code in (400, 404, 410):
                        raise RuntimeError(f"{destination.name}: model server returned HTTP {error.code}; partial download retained") from error
                if failures >= max_failures:
                    raise RuntimeError(f"{destination.name}: connection failed {failures} consecutive times; downloaded bytes are saved. Use Install to resume without restarting the app") from error
                delay = min(30, 2 ** (failures - 1))
                saved = partial.stat().st_size if partial.exists() else 0
                report(f"{destination.name}: connection interrupted; retry {failures}/{max_failures} in {delay}s from {saved / 1_000_000:.1f} MB", flush=True)
                sleep(delay)


def download_models(root):
    models = model_directory(root)
    for relative, size, checksum in MODEL_MANIFEST:
        legacy_folder = models / ".cache/huggingface/download" / Path(relative).parent
        candidates = list(legacy_folder.glob(f"*.{checksum}.incomplete")) if legacy_folder.exists() else []
        legacy = max(candidates, key=lambda path: path.stat().st_size) if candidates else None
        url = f"https://huggingface.co/CSWRY/VOSR/resolve/{MODEL_REVISION}/{relative}"
        download_verified(url, models / relative, size, checksum, legacy_partial=legacy)


def download_auxiliary(url, destination, attempts=5, timeout=30):
    """Bounded retries for small source archives and license notices."""
    destination = Path(destination)
    temporary = destination.with_name(destination.name + ".tmp")
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Videomaxxing-VOSR/1"})
            with urllib.request.urlopen(request, timeout=timeout) as response, temporary.open("wb") as output:
                expected = response.headers.get("Content-Length")
                written = 0
                while True:
                    block = response.read1(1024 * 1024)
                    if not block:
                        break
                    output.write(block)
                    written += len(block)
                if expected and written != int(expected):
                    raise DownloadProtocolError("incomplete auxiliary download")
            temporary.replace(destination)
            return
        except (urllib.error.URLError, TimeoutError, ConnectionError,
                http.client.HTTPException, DownloadProtocolError) as error:
            if isinstance(error, urllib.error.HTTPError):
                error.close()
            if attempt + 1 == attempts:
                raise RuntimeError(f"Could not download {destination.name} after {attempts} attempts") from error
            print(f"{destination.name}: connection interrupted; retrying automatically ({attempt + 1}/{attempts})", flush=True)
            time.sleep(min(30, 2 ** attempt))
        finally:
            temporary.unlink(missing_ok=True)


def archive_source(url, destination, required_files=()):
    """Extract a pinned public source archive, rejecting paths outside its root."""
    if ((destination / ".complete").is_file()
            and (destination / ".complete").read_text(encoding="utf8") == url
            and all((destination / file).is_file() for file in required_files)):
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent) as temporary:
        temporary = Path(temporary)
        archive = temporary / "source.zip"
        download_auxiliary(url, archive)
        with zipfile.ZipFile(archive) as source:
            for member in source.infolist():
                target = (temporary / member.filename).resolve()
                if not target.is_relative_to(temporary.resolve()):
                    raise ValueError("Invalid path in source archive")
            source.extractall(temporary / "unpacked")
        folders = list((temporary / "unpacked").iterdir())
        if len(folders) != 1 or not folders[0].is_dir():
            raise ValueError("Unexpected source archive layout")
        if destination.exists():
            shutil.rmtree(destination)
        shutil.move(str(folders[0]), destination)
        (destination / ".complete").write_text(url, encoding="utf8")


def model_directory(root):
    return root / "models" / MODEL_REVISION


def verify_models(root):
    models = model_directory(root)
    for relative in MODEL_FILES:
        path = models / relative
        if not path.is_file() or path.stat().st_size == 0:
            raise FileNotFoundError(f"Missing VOSR model file: {path}")
    config = json.loads((models / "VOSR2/args.json").read_text())
    if config.get("ae_type") != "qwen" or config.get("enc_type") != "dinov2l":
        raise ValueError("The downloaded configuration is not the VOSR 2.0 bundle")
    from safetensors import safe_open
    for relative in MODEL_FILES:
        if relative.endswith(".safetensors"):
            with safe_open(models / relative, framework="pt") as weights:
                if not list(weights.keys()):
                    raise ValueError(f"Empty model weights: {relative}")


def prepare(root):
    print("Downloading pinned VOSR inference code", flush=True)
    archive_source(f"https://codeload.github.com/cswry/VOSR/zip/{CODE_REVISION}", root / "code",
                   ("inference_vosr_onestep.py", "models/lightningdit.py", "models/qwenimage_vae2d.py", "tiled_vae.py", "vosr.py"))
    print("Downloading pinned vision encoder code", flush=True)
    archive_source(f"https://codeload.github.com/facebookresearch/dinov2/zip/{DINO_REVISION}", root / "dino",
                   ("hubconf.py", "dinov2/models/vision_transformer.py"))
    print("Downloading VOSR 2.0, image VAE and vision encoder weights (several GB)", flush=True)
    download_models(root)
    verify_models(root)
    # Preserve upstream notices alongside the downloadable model bundle.
    notices = root / "licenses"
    notices.mkdir(exist_ok=True)
    for name, url in {
        "Qwen-Image.txt": "https://raw.githubusercontent.com/QwenLM/Qwen-Image/main/LICENSE",
        "Wan2.1.txt": "https://raw.githubusercontent.com/Wan-Video/Wan2.1/main/LICENSE.txt",
    }.items():
        if not (notices / name).is_file():
            download_auxiliary(url, notices / name)
    print("VOSR model files verified", flush=True)


def load_inference(root):
    import torch
    # Eager PyTorch avoids a system compiler/Triton requirement, including on Windows.
    torch.compile = lambda function=None, **kwargs: function if function else lambda f: f
    sys.path.insert(0, str(root / "code"))
    # Use only RMS normalization, rather than importing upstream's unused Llama
    # training utilities and their fairscale dependency. Parameter names match.
    normalization = types.ModuleType("models.rmsnorm")

    class RMSNorm(torch.nn.Module):
        def __init__(self, dim, eps=1e-6):
            super().__init__()
            self.weight = torch.nn.Parameter(torch.ones(dim))
            self.eps = eps

        def forward(self, value):
            normalized = torch.nn.functional.rms_norm(value.float(), (value.shape[-1],), eps=self.eps)
            return normalized.to(value.dtype) * self.weight

    normalization.RMSNorm = RMSNorm
    sys.modules["models.rmsnorm"] = normalization
    module = importlib.import_module("inference_vosr_onestep")
    module.QWEN_AE_PATH = str(model_directory(root) / "Qwen-Image-vae-2d")
    original_config = module.load_config_with_cli

    def local_config(checkpoint, parser):
        config = original_config(checkpoint, parser)
        # The release embeds a relative ae_path; the model storage is external.
        config.ae_path = module.QWEN_AE_PATH
        return config

    module.load_config_with_cli = local_config
    original_load = torch.hub.load

    def local_encoder(repository, model, *args, **kwargs):
        if repository != "facebookresearch/dinov2" or model != "dinov2_vitl14":
            raise ValueError("Unexpected vision encoder requested")
        encoder = original_load(str(root / "dino"), model, source="local", pretrained=False)
        weights = torch.load(model_directory(root) / MODEL_FILES[-1], map_location="cpu", weights_only=True)
        encoder.load_state_dict(weights, strict=True)
        return encoder

    torch.hub.load = local_encoder
    return module


def probe(root):
    import torch
    module = load_inference(root)
    from models.qwenimage_vae2d import AutoencoderKLQwenImage2D  # noqa: F401
    verify_models(root)
    cuda = torch.cuda.is_available()
    if cuda:
        # Detect unsupported GPU architectures and broken drivers before a long job.
        (torch.ones(1, device="cuda") + 1).cpu()
    devices = []
    if cuda:
        for index in range(torch.cuda.device_count()):
            properties = torch.cuda.get_device_properties(index)
            uuid = getattr(properties, "uuid", None)
            devices.append({"id": f"GPU-{uuid}" if uuid else str(index), "name": properties.name})
    return {"runtimeReady": bool(module), "cudaReady": cuda, "cudaDevices": devices,
            "torchVersion": torch.__version__}


class AttentionBackend:
    """Optional xFormers for DINO only; DiT/VAE retain PyTorch SDPA."""
    def __init__(self, requested, dtype):
        self.name = "pytorch"
        self.reason = ""
        self.operation = None
        self.calls = 0
        if requested == "pytorch":
            return
        import torch
        try:
            operation = importlib.import_module("xformers.ops").memory_efficient_attention
            # DINOv2-L uses 16 heads of width 64, with 1025 tokens at the default 448-pixel encoder input.
            with torch.inference_mode():
                sample = torch.zeros((1, 1025, 16, 64), dtype=dtype, device="cuda")
                result = operation(sample, sample, sample)
                if result.shape != sample.shape or not torch.isfinite(result).all().item():
                    raise RuntimeError("xFormers kernel returned invalid values")
                torch.cuda.synchronize()
            self.operation = operation
            self.name = "xformers"
        except (ImportError, OSError, RuntimeError, NotImplementedError, AttributeError) as error:
            self.fallback(error)

    def fallback(self, error):
        self.name = "pytorch"
        self.operation = None
        self.reason = f"{type(error).__name__}: {error}"
        print(f"xFormers unavailable; using PyTorch. {self.reason}", flush=True)

    def attach(self, encoder):
        # Keep upstream PyTorch modules and weights, replacing only the attention
        # operation. This avoids changing SwiGLU implementations/state dicts.
        if self.operation is None:
            return
        for attention in encoder.modules():
            if attention.__class__.__name__ != "MemEffAttention":
                continue
            original = attention.forward

            def forward(layer, value, attn_bias=None, original=original):
                if self.operation is not None:
                    try:
                        result = self.compute(layer, value, attn_bias)
                        self.calls += 1
                        return result
                    except (RuntimeError, NotImplementedError, ValueError, TypeError) as error:
                        self.fallback(error)
                return original(value, attn_bias=attn_bias)

            attention.forward = types.MethodType(forward, attention)

    def compute(self, layer, value, bias):
        import torch
        batch, tokens, channels = value.shape
        qkv = layer.qkv(value).reshape(batch, tokens, 3, layer.num_heads, channels // layer.num_heads)
        query, key, values = torch.unbind(qkv, 2)
        result = self.operation(query, key, values, attn_bias=bias)
        result = result.reshape(batch, tokens, channels)
        return layer.proj_drop(layer.proj(result))


def validate_advanced(backend, color_correction, tile_size, tile_overlap, vae_tile_size, vae_tile_overlap):
    if (backend not in ("auto", "pytorch", "xformers")
            or color_correction not in ("wavelet", "adain", "nofix")
            or tile_size not in (256, 512)
            or tile_overlap not in (0, 32, 64, 128) or tile_overlap >= tile_size
            or vae_tile_size not in (0, 512, 1024, 2048)
            or vae_tile_overlap not in (0, 64, 128, 256)
            or (vae_tile_size > 0 and vae_tile_overlap >= vae_tile_size)):
        raise ValueError("Unsupported VOSR advanced settings")


def run_image(root, source, output, upscale, tile_size, seed, backend="auto",
              color_correction="wavelet", tile_overlap=64, vae_tile_size=1024, vae_tile_overlap=128):
    import torch
    import numpy as np
    from PIL import Image, ImageOps
    validate_advanced(backend, color_correction, tile_size, tile_overlap, vae_tile_size, vae_tile_overlap)
    if not torch.cuda.is_available():
        selected = os.environ.get("CUDA_VISIBLE_DEVICES")
        detail = f" Selected CUDA device: {selected}. Try Auto in VOSR." if selected else ""
        raise RuntimeError("VOSR needs an NVIDIA CUDA GPU and a compatible driver." + detail)
    verify_models(root)
    import warnings
    os.environ["XFORMERS_DISABLED"] = "1"
    warnings.filterwarnings("ignore", message=r"xFormers is (disabled|not available).*",
                            category=UserWarning, module=r"dinov2\.layers\..*")
    module = load_inference(root)
    # Keep the VAE in FP32; only the DiT and vision encoder use mixed precision.
    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    attention = AttentionBackend(backend, dtype)
    print(f"Vision attention: {attention.name} (requested {backend})", flush=True)
    base_model = module.LightningDiT

    class InferenceDiT(base_model):
        def to(self, *args, **kwargs):
            super().to(*args, **kwargs)
            return super().to(dtype=dtype)

        def forward_flexible(self, *args, **kwargs):
            with torch.autocast("cuda", dtype=dtype):
                return super().forward_flexible(*args, **kwargs)

    module.LightningDiT = InferenceDiT
    original_features = module.get_venc_features

    def mixed_features(encoder, *args, **kwargs):
        encoder.to(dtype=dtype)
        # Attach once; subsequent image tiles reuse the same encoder.
        if not getattr(encoder, "_vosr_attention_attached", False):
            attention.attach(encoder)
            encoder._vosr_attention_attached = True
        with torch.autocast("cuda", dtype=dtype):
            return original_features(encoder, *args, **kwargs)

    module.get_venc_features = mixed_features
    output.parent.mkdir(parents=True, exist_ok=True)
    # A private input fixes orientation, handles arbitrary file names, and prevents
    # upstream's skip-existing behavior from returning a stale result.
    with tempfile.TemporaryDirectory(prefix="vosr-", dir=output.parent) as temporary:
        temporary = Path(temporary)
        prepared = temporary / "source.png"
        with Image.open(source) as image:
            if getattr(image, "n_frames", 1) > 1:
                raise ValueError("Choose a still image; animated images are not supported by VOSR")
            image = ImageOps.exif_transpose(image).convert("RGB")
            expected_size = image.size
            # The VAE and DiT need dimensions divisible by 16. Edge padding
            # preserves the image geometry, unlike resizing to a rounded size.
            pixels = np.asarray(image)
            pad_h = max(64, (image.height + 15) // 16 * 16) - image.height
            pad_w = max(64, (image.width + 15) // 16 * 16) - image.width
            Image.fromarray(np.pad(pixels, ((0, pad_h), (0, pad_w), (0, 0)), mode="edge")).save(prepared)
            padded_size = ((image.width + pad_w) * upscale, (image.height + pad_h) * upscale)
        sys.argv = ["inference_vosr_onestep.py", "-c", str(model_directory(root) / "VOSR2"),
                    "-i", str(prepared), "-o", str(temporary / "result"), "-u", str(upscale),
                    "--tile_size", str(tile_size), "--tile_overlap", str(tile_overlap),
                    "--vae_tile_size", str(vae_tile_size), "--vae_tile_overlap", str(vae_tile_overlap),
                    "--align_method", color_correction,
                    "--seed", str(seed), "--force_rerun"]
        # Upstream uses relative paths and Torch Hub cache paths.
        os.chdir(root / "code")
        with torch.inference_mode():
            module.main()
        result = temporary / "result/source.png"
        if not result.is_file():
            raise RuntimeError("VOSR did not produce an image; see the processing log")
        with Image.open(result) as image:
            if image.size != padded_size:
                raise RuntimeError("VOSR returned unexpected output dimensions")
            image.load()
            image.crop((0, 0, expected_size[0] * upscale, expected_size[1] * upscale)).save(output)
        # Rust publishes this staging file only after the worker has exited successfully.
    report = {"attentionBackend": attention.name, "xformersCalls": attention.calls,
              "fallbackReason": attention.reason}
    print("VOSR attention summary: " + json.dumps(report), flush=True)
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["prepare", "probe", "run"])
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--upscale", type=int, choices=[1, 2, 4], default=2)
    parser.add_argument("--tile-size", type=int, choices=[256, 512], default=512)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--backend", choices=["auto", "pytorch", "xformers"], default="auto")
    parser.add_argument("--color-correction", choices=["wavelet", "adain", "nofix"], default="wavelet")
    parser.add_argument("--tile-overlap", type=int, default=64)
    parser.add_argument("--vae-tile-size", type=int, default=1024)
    parser.add_argument("--vae-tile-overlap", type=int, default=128)
    args = parser.parse_args()
    args.root = args.root.resolve()
    if args.mode == "prepare":
        prepare(args.root)
        print(json.dumps(probe(args.root)), flush=True)
    elif args.mode == "probe":
        print(json.dumps(probe(args.root)), flush=True)
    else:
        if not args.input or not args.output:
            parser.error("run needs --input and --output")
        run_image(args.root, args.input.resolve(), args.output.resolve(), args.upscale, args.tile_size, args.seed,
                  args.backend, args.color_correction, args.tile_overlap, args.vae_tile_size, args.vae_tile_overlap)


if __name__ == "__main__":
    main()
