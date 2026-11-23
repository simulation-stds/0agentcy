mod realesrgan;
mod adaptive_palette;
mod video_effects;
mod system_fonts;
mod subtitle_fonts;
mod caption_export;
mod audio_models;
mod transcription;
mod transcription_credentials;
mod shared_runtime;
mod vosr;
#[cfg(target_os = "linux")]
mod supir;
mod upscale_progress;
#[cfg(target_os = "linux")]
mod video_preview_stream;
mod video_waveform;
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::hash_map::DefaultHasher,
    env, fs,
    hash::{Hash, Hasher},
    io::{BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    sync::mpsc,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::Emitter;

static CANCEL_UPSCALE: AtomicBool = AtomicBool::new(false);
const FACEFUSION_ENV_NAME: &str = "videotools-facefusion";
#[cfg(not(target_os = "linux"))]
const SUPIR_ENV_NAME: &str = "videotools-supir";
const FLUX2_ENV_NAME: &str = "videotools-flux2";
const WAN21_ENV_NAME: &str = "videotools-wan21";
const WAN21_MODEL_ID: &str = "Wan-AI/Wan2.1-T2V-1.3B";
const WAN21_REPO_URL: &str = "https://github.com/Wan-Video/Wan2.1";
const WAN22_ENV_NAME: &str = "videotools-wan22";
const WAN22_MODEL_ID: &str = "Wan-AI/Wan2.2-TI2V-5B";
const WAN22_REPO_URL: &str = "https://github.com/Wan-Video/Wan2.2";
const FLUX2_MODEL_ID: &str = "black-forest-labs/FLUX.2-klein-4B";
const FLUX2_TORCH_VERSION: &str = "torch==2.8.0";
const FLUX2_TORCHVISION_VERSION: &str = "torchvision==0.23.0";
const FLUX2_TORCH_INDEX_URL: &str = "https://download.pytorch.org/whl/cu128";
const FLUX2_TRANSFORMERS_VERSION: &str = "transformers==4.56.1";
const FLUX2_ACCELERATE_VERSION: &str = "accelerate==1.12.0";
const FLUX2_SAFETENSORS_VERSION: &str = "safetensors>=0.8.0rc0";
const WAN22_TORCH_VERSION: &str = "torch==2.6.0";
const WAN22_TORCHVISION_VERSION: &str = "torchvision==0.21.0";
const WAN22_TORCHAUDIO_VERSION: &str = "torchaudio==2.6.0";
const WAN22_TORCH_INDEX_URL: &str = "https://download.pytorch.org/whl/cu124";
const WAN_FLASH_ATTN_WHEEL_URL: &str = "https://huggingface.co/lldacing/flash-attention-windows-wheel/resolve/main/flash_attn-2.7.4%2Bcu124torch2.6.0cxx11abiFALSE-cp310-cp310-win_amd64.whl";
#[cfg(not(target_os = "linux"))]
const SUPIR_TORCH_VERSION: &str = "torch==2.1.2+cu121";
#[cfg(not(target_os = "linux"))]
const SUPIR_TORCHVISION_VERSION: &str = "torchvision==0.16.2+cu121";
#[cfg(not(target_os = "linux"))]
const SUPIR_TORCH_INDEX_URL: &str = "https://download.pytorch.org/whl/cu121";
#[cfg(not(target_os = "linux"))]
const SUPIR_XFORMERS_VERSION: &str = "xformers==0.0.23.post1";
const WAN21_RUNNER_SCRIPT: &str = r#"
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def bool_text(value):
    return "True" if value else "False"


def main():
    parser = argparse.ArgumentParser(description="Run Wan2.1 T2V-1.3B generation.")
    parser.add_argument("--repo", required=True)
    parser.add_argument("--ckpt-dir", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--size", required=True)
    parser.add_argument("--frame-num", type=int, required=True)
    parser.add_argument("--steps", type=int, required=True)
    parser.add_argument("--guidance", type=float, required=True)
    parser.add_argument("--seed", default="")
    parser.add_argument("--offload-model", action="store_true")
    parser.add_argument("--t5-cpu", action="store_true")
    args = parser.parse_args()

    repo = Path(args.repo)
    generate = repo / "generate.py"
    ckpt_dir = Path(args.ckpt_dir)
    if not generate.exists():
        raise FileNotFoundError(f"Wan generate.py was not found: {generate}")
    if not ckpt_dir.exists():
        raise FileNotFoundError(f"Wan checkpoint directory was not found: {ckpt_dir}")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    seed = int(args.seed) if str(args.seed).strip() else -1

    command = [
        sys.executable,
        str(generate),
        "--task",
        "t2v-1.3B",
        "--ckpt_dir",
        str(ckpt_dir),
        "--prompt",
        args.prompt,
        "--size",
        args.size,
        "--frame_num",
        str(args.frame_num),
        "--sample_steps",
        str(args.steps),
        "--sample_shift",
        "8",
        "--sample_guide_scale",
        f"{args.guidance:.3f}",
        "--base_seed",
        str(seed),
        "--save_file",
        str(output),
        "--offload_model",
        bool_text(args.offload_model),
    ]
    if args.t5_cpu:
        command.append("--t5_cpu")

    print(json.dumps({
        "event": "launch",
        "task": "t2v-1.3B",
        "size": args.size,
        "frameNum": args.frame_num,
        "steps": args.steps,
        "guidance": args.guidance,
        "seed": seed,
    }), flush=True)

    env = os.environ.copy()
    python_path = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = str(repo) if not python_path else str(repo) + os.pathsep + python_path
    process = subprocess.Popen(command, cwd=repo, env=env)
    code = process.wait()
    if code != 0:
        raise SystemExit(code)
    if not output.exists():
        raise FileNotFoundError(f"Wan did not produce an output video: {output}")
    print(json.dumps({"event": "saved", "output": str(output)}), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"event": "error", "message": str(exc)}), file=sys.stderr, flush=True)
        raise
"#;
const WAN21_STATUS_SCRIPT: &str = r#"
import importlib
import importlib.metadata as metadata
import json
import sys
from pathlib import Path

packages = [
    ("torch", "torch"),
    ("torchvision", "torchvision"),
    ("transformers", "transformers"),
    ("diffusers", "diffusers"),
    ("accelerate", "accelerate"),
    ("imageio_ffmpeg", "imageio-ffmpeg"),
    ("cv2", "opencv-python"),
    ("einops", "einops"),
    ("ftfy", "ftfy"),
    ("regex", "regex"),
    ("triton", "triton-windows"),
]
versions = {}
missing = []
for package, metadata_name in packages:
    try:
        importlib.import_module(package)
        versions[package] = metadata.version(metadata_name)
    except Exception as exc:
        missing.append(f"{package}: {exc}")

wan_import_ready = False
wan_import_message = ""
repo_dir = Path(__file__).resolve().parent / "repo"
if repo_dir.exists():
    sys.path.insert(0, str(repo_dir))
    try:
        import wan
        from wan import WanT2V
        from wan.configs import WAN_CONFIGS
        if "t2v-1.3B" not in WAN_CONFIGS:
            raise RuntimeError("Wan2.1 t2v-1.3B config is unavailable.")
        wan_import_ready = True
    except Exception as exc:
        wan_import_message = str(exc)
        missing.append(f"wan: {exc}")
else:
    wan_import_message = f"Wan2.1 repo folder is missing: {repo_dir}"
    missing.append(wan_import_message)

flash_attn_ready = False
flash_attn_message = ""
try:
    importlib.import_module("flash_attn")
    flash_attn_ready = True
    versions["flash_attn"] = metadata.version("flash_attn")
except Exception as exc:
    flash_attn_message = str(exc)

cuda_available = False
cuda_name = ""
try:
    import torch
    cuda_available = torch.cuda.is_available()
    if cuda_available:
        cuda_name = torch.cuda.get_device_name(0)
except Exception:
    pass

ready = not missing
message_parts = []
if missing:
    message_parts.append("Missing packages: " + "; ".join(missing))
if not flash_attn_ready:
    message_parts.append("flash_attn is not installed or unavailable; Wan may use more VRAM: " + flash_attn_message)
if not message_parts:
    message_parts.append("Wan2.1 Python runtime is ready.")

print(json.dumps({
    "ready": ready,
    "versions": versions,
    "wanImportReady": wan_import_ready,
    "wanImportMessage": wan_import_message,
    "flashAttnReady": flash_attn_ready,
    "flashAttnMessage": flash_attn_message,
    "cudaAvailable": cuda_available,
    "cudaName": cuda_name,
    "message": " ".join(message_parts),
}))
if not ready:
    sys.exit(1)
"#;
const WAN22_RUNNER_SCRIPT: &str = r#"
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def bool_text(value):
    return "True" if value else "False"


def existing_file(path, label):
    if not path:
        return None
    source = Path(path)
    if not source.exists():
        raise FileNotFoundError(f"{label} does not exist: {source}")
    return source


def main():
    parser = argparse.ArgumentParser(description="Run Wan2.2 TI2V-5B generation.")
    parser.add_argument("--repo", required=True)
    parser.add_argument("--ckpt-dir", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--size", required=True)
    parser.add_argument("--frame-num", type=int, required=True)
    parser.add_argument("--steps", type=int, required=True)
    parser.add_argument("--guidance", type=float, required=True)
    parser.add_argument("--seed", default="")
    parser.add_argument("--image", default="")
    parser.add_argument("--offload-model", action="store_true")
    parser.add_argument("--convert-model-dtype", action="store_true")
    parser.add_argument("--t5-cpu", action="store_true")
    args = parser.parse_args()

    repo = Path(args.repo)
    generate = repo / "generate.py"
    ckpt_dir = Path(args.ckpt_dir)
    if not generate.exists():
        raise FileNotFoundError(f"Wan generate.py was not found: {generate}")
    if not ckpt_dir.exists():
        raise FileNotFoundError(f"Wan checkpoint directory was not found: {ckpt_dir}")

    image = existing_file(args.image, "Reference image")
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    seed = int(args.seed) if str(args.seed).strip() else -1

    command = [
        sys.executable,
        str(generate),
        "--task",
        "ti2v-5B",
        "--ckpt_dir",
        str(ckpt_dir),
        "--prompt",
        args.prompt,
        "--size",
        args.size,
        "--frame_num",
        str(args.frame_num),
        "--sample_steps",
        str(args.steps),
        "--sample_guide_scale",
        f"{args.guidance:.3f}",
        "--base_seed",
        str(seed),
        "--save_file",
        str(output),
        "--offload_model",
        bool_text(args.offload_model),
    ]
    if image is not None:
        command.extend(["--image", str(image)])
    if args.convert_model_dtype:
        command.append("--convert_model_dtype")
    if args.t5_cpu:
        command.append("--t5_cpu")

    print(json.dumps({
        "event": "launch",
        "task": "ti2v-5B",
        "size": args.size,
        "frameNum": args.frame_num,
        "steps": args.steps,
        "guidance": args.guidance,
        "seed": seed,
        "hasImage": image is not None,
    }), flush=True)

    env = os.environ.copy()
    python_path = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = str(repo) if not python_path else str(repo) + os.pathsep + python_path
    process = subprocess.Popen(command, cwd=repo, env=env)
    code = process.wait()
    if code != 0:
        raise SystemExit(code)
    if not output.exists():
        raise FileNotFoundError(f"Wan did not produce an output video: {output}")
    print(json.dumps({"event": "saved", "output": str(output)}), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"event": "error", "message": str(exc)}), file=sys.stderr, flush=True)
        raise
"#;
const WAN22_STATUS_SCRIPT: &str = r#"
import importlib
import importlib.metadata as metadata
import json
import sys
from pathlib import Path

packages = [
    ("torch", "torch"),
    ("torchvision", "torchvision"),
    ("transformers", "transformers"),
    ("diffusers", "diffusers"),
    ("accelerate", "accelerate"),
    ("imageio_ffmpeg", "imageio-ffmpeg"),
    ("cv2", "opencv-python"),
    ("einops", "einops"),
    ("decord", "decord"),
    ("peft", "peft"),
    ("librosa", "librosa"),
    ("safetensors", "safetensors"),
    ("regex", "regex"),
]
versions = {}
missing = []
for package, metadata_name in packages:
    try:
        importlib.import_module(package)
        versions[package] = metadata.version(metadata_name)
    except Exception as exc:
        missing.append(f"{package}: {exc}")

wan_import_ready = False
wan_import_message = ""
repo_dir = Path(__file__).resolve().parent / "repo"
if repo_dir.exists():
    sys.path.insert(0, str(repo_dir))
    try:
        import wan
        from wan import WanTI2V
        from wan.configs import ti2v_5B
        from wan.modules.vae2_2 import Wan2_2_VAE
        wan_import_ready = True
    except Exception as exc:
        wan_import_message = str(exc)
        missing.append(f"wan: {exc}")
else:
    wan_import_message = f"Wan2.2 repo folder is missing: {repo_dir}"
    missing.append(wan_import_message)

flash_attn_ready = False
flash_attn_message = ""
try:
    importlib.import_module("flash_attn")
    flash_attn_ready = True
    versions["flash_attn"] = metadata.version("flash_attn")
except Exception as exc:
    flash_attn_message = str(exc)

cuda_available = False
cuda_name = ""
try:
    import torch
    cuda_available = torch.cuda.is_available()
    if cuda_available:
        cuda_name = torch.cuda.get_device_name(0)
except Exception:
    pass

ready = not missing
message_parts = []
if missing:
    message_parts.append("Missing packages: " + "; ".join(missing))
if not flash_attn_ready:
    message_parts.append("flash_attn is not installed or unavailable; Wan may run slower or fail if upstream requires it: " + flash_attn_message)
if not message_parts:
    message_parts.append("Wan2.2 Python runtime is ready.")

print(json.dumps({
    "ready": ready,
    "versions": versions,
    "wanImportReady": wan_import_ready,
    "wanImportMessage": wan_import_message,
    "flashAttnReady": flash_attn_ready,
    "flashAttnMessage": flash_attn_message,
    "cudaAvailable": cuda_available,
    "cudaName": cuda_name,
    "message": " ".join(message_parts),
}))
if not ready:
    sys.exit(1)
"#;
const FLUX2_RUNNER_SCRIPT: &str = r#"
import argparse
import json
import random
import sys
from pathlib import Path

import torch
from diffusers import Flux2KleinPipeline
from PIL import Image, ImageOps


def log(message):
    print(message, flush=True)


def load_reference_image(path):
    source = Path(path)
    if not source.exists():
        raise FileNotFoundError(f"Reference image does not exist: {source}")
    with Image.open(source) as image:
        return ImageOps.exif_transpose(image).convert("RGB")


def main():
    parser = argparse.ArgumentParser(description="Run Flux.2 Klein text-to-image inference.")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--width", type=int, required=True)
    parser.add_argument("--height", type=int, required=True)
    parser.add_argument("--steps", type=int, default=4)
    parser.add_argument("--guidance", type=float, default=1.0)
    parser.add_argument("--seed", default="")
    parser.add_argument("--model", default="black-forest-labs/FLUX.2-klein-4B")
    parser.add_argument("--reference", action="append", default=[])
    parser.add_argument("--cpu-offload", action="store_true")
    args = parser.parse_args()

    seed = int(args.seed) if str(args.seed).strip() else random.randint(0, 2**31 - 1)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if device == "cuda" else torch.float32
    reference_images = [load_reference_image(path) for path in args.reference]

    log(json.dumps({"event": "load", "model": args.model, "device": device, "dtype": str(dtype), "seed": seed}))
    pipe = Flux2KleinPipeline.from_pretrained(args.model, torch_dtype=dtype)
    if device == "cuda" and args.cpu_offload:
        pipe.enable_model_cpu_offload()
    else:
        pipe = pipe.to(device)

    generator_device = "cuda" if device == "cuda" else "cpu"
    generator = torch.Generator(device=generator_device).manual_seed(seed)
    log(json.dumps({"event": "generate", "width": args.width, "height": args.height, "steps": args.steps, "guidance": args.guidance, "referenceCount": len(reference_images)}))
    call_args = {
        "prompt": args.prompt,
        "height": args.height,
        "width": args.width,
        "guidance_scale": args.guidance,
        "num_inference_steps": args.steps,
        "generator": generator,
    }
    if reference_images:
        call_args["image"] = reference_images[0] if len(reference_images) == 1 else reference_images
    image = pipe(**call_args).images[0]

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)
    log(json.dumps({"event": "saved", "output": str(output), "seed": seed}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"event": "error", "message": str(exc)}), file=sys.stderr, flush=True)
        raise
"#;
const FLUX2_STATUS_SCRIPT: &str = r#"
import importlib
import importlib.metadata as metadata
import json
import sys

packages = ["torch", "diffusers", "transformers", "accelerate"]
versions = {}
missing = []
for package in packages:
    try:
        importlib.import_module(package)
        versions[package] = metadata.version(package)
    except Exception as exc:
        missing.append(f"{package}: {exc}")

pipeline_ready = False
pipeline_error = ""
try:
    from diffusers import Flux2KleinPipeline
    pipeline_ready = Flux2KleinPipeline is not None
except Exception as exc:
    pipeline_error = str(exc)

cuda_available = False
cuda_name = ""
try:
    import torch
    cuda_available = torch.cuda.is_available()
    if cuda_available:
        cuda_name = torch.cuda.get_device_name(0)
except Exception:
    pass

ready = not missing and pipeline_ready
message_parts = []
if missing:
    message_parts.append("Missing packages: " + "; ".join(missing))
if not pipeline_ready:
    message_parts.append("Flux2KleinPipeline is unavailable: " + pipeline_error)
if not message_parts:
    message_parts.append("Flux.2 Python runtime is ready.")

print(json.dumps({
    "ready": ready,
    "versions": versions,
    "pipelineReady": pipeline_ready,
    "cudaAvailable": cuda_available,
    "cudaName": cuda_name,
    "message": " ".join(message_parts),
}))
if not ready:
    sys.exit(1)
"#;
#[cfg(not(target_os = "linux"))]
const SUPIR_XFORMERS_CHECK_SCRIPT: &str = r#"
import importlib.metadata as metadata
import json
import sys

version = ""
try:
    version = metadata.version("xformers")
    import torch
    import xformers.ops

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is not available to validate xFormers.")

    q = torch.randn((1, 16, 1, 32), device="cuda", dtype=torch.float16)
    k = torch.randn((1, 16, 1, 32), device="cuda", dtype=torch.float16)
    v = torch.randn((1, 16, 1, 32), device="cuda", dtype=torch.float16)
    out = xformers.ops.memory_efficient_attention(q, k, v)
    torch.cuda.synchronize()

    print(json.dumps({
        "ready": True,
        "version": version,
        "message": f"xFormers CUDA attention is ready ({tuple(out.shape)}).",
    }))
except Exception as exc:
    print(json.dumps({
        "ready": False,
        "version": version,
        "message": str(exc),
    }))
    sys.exit(1)
"#;

#[derive(Serialize)]
struct ToolStatus {
    ffmpeg: Option<String>,
    ffprobe: Option<String>,
    realesrgan: Option<String>,
    rife: Option<String>,
    supir: Option<String>,
    flux2: Option<String>,
    wan21: Option<String>,
    wan22: Option<String>,
    facefusion: Option<String>,
    git: Option<String>,
    conda: Option<String>,
    cudnn: Option<String>,
    #[serde(rename = "windowsDeveloperMode")]
    windows_developer_mode: Option<String>,
    imagemagick: Option<String>,
    oxipng: Option<String>,
    libavif: Option<String>,
    libwebp: Option<String>,
    mozjpeg: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateAvailability {
    ffmpeg: bool,
    miniforge: bool,
    realesrgan: bool,
    rife: bool,
    facefusion: bool,
    supir: bool,
    supir_xformers: bool,
    flux2: bool,
    wan21: bool,
    wan22: bool,
    imagemagick: bool,
    oxipng: bool,
    libavif: bool,
    libwebp: bool,
    mozjpeg: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    #[serde(default)]
    default_download_folder: String,
    #[serde(default)]
    temp_folder: String,
    #[serde(default)]
    cuda_bin_folder: String,
    #[serde(default)]
    cudnn_bin_folder: String,
    #[serde(default)]
    preferred_model_device: String,
    #[serde(default = "default_true")]
    play_notifications: bool,
    #[serde(default = "default_true")]
    show_info_icons: bool,
}

fn default_true() -> bool {
    true
}

const DEFAULT_OUTPUT_FOLDER: &str = "output";

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_download_folder: DEFAULT_OUTPUT_FOLDER.to_string(),
            temp_folder: workspace_root().join("temp").to_string_lossy().to_string(),
            cuda_bin_folder: find_cuda_bin_dir()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_default(),
            cudnn_bin_folder: find_cudnn_bin_dir()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_default(),
            preferred_model_device: String::new(),
            play_notifications: true,
            show_info_icons: true,
        }
    }
}

#[derive(Serialize)]
struct VideoMetadata {
    rotation: i64,
    duration: f64,
    fps: f64,
    width: u64,
    height: u64,
    codec: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioMetadata {
    duration: f64,
    codec: String,
    sample_rate: u64,
    channels: u64,
    bit_rate: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Thumbnail {
    time: f64,
    data_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GifFrameData {
    index: usize,
    delay_ms: u64,
    data_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GifFrameSet {
    width: u64,
    height: u64,
    total_duration_ms: u64,
    frames: Vec<GifFrameData>,
    log: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GifFrameInput {
    delay_ms: u64,
    data_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelPreview {
    model: String,
    scale: String,
    data_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelCompareResult {
    original_data_url: String,
    previews: Vec<ModelPreview>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RealEsrganModel {
    name: String,
    scale: String,
    description: String,
    size_bytes: u64,
    size_label: String,
    estimated_size_label: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RealEsrganDevice {
    id: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RifeModel {
    name: String,
    description: String,
    size_bytes: u64,
    size_label: String,
    estimated_size_label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SupirModel {
    name: String,
    label: String,
    file_name: String,
    description: String,
    required: bool,
    installed: bool,
    installed_path: String,
    direct_download: bool,
    size_bytes: u64,
    size_label: String,
    estimated_size_label: String,
    source_label: String,
    download_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FaceFusionStatus {
    state: String,
    repo_path: String,
    env_name: String,
    current_size_label: String,
    estimated_install_label: String,
    available_providers: Vec<String>,
    runtime_label: String,
    provider_warning: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SupirStatus {
    state: String,
    repo_path: String,
    env_name: String,
    checkpoint_path: String,
    current_size_label: String,
    estimated_install_label: String,
    cuda_ready: bool,
    checkpoints_ready: bool,
    xformers_ready: bool,
    xformers_version: String,
    xformers_message: String,
    cuda_devices: Option<Vec<Value>>,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Flux2Status {
    state: String,
    tool_path: String,
    env_name: String,
    cache_path: String,
    current_size_label: String,
    estimated_install_label: String,
    runtime_ready: bool,
    cuda_ready: bool,
    cuda_label: String,
    torch_version: String,
    diffusers_version: String,
    transformers_version: String,
    accelerate_version: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Wan21Status {
    state: String,
    tool_path: String,
    repo_path: String,
    model_path: String,
    cache_path: String,
    env_name: String,
    current_size_label: String,
    estimated_install_label: String,
    runtime_ready: bool,
    model_ready: bool,
    cuda_ready: bool,
    cuda_label: String,
    torch_version: String,
    transformers_version: String,
    diffusers_version: String,
    accelerate_version: String,
    flash_attn_ready: bool,
    flash_attn_message: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Wan22Status {
    state: String,
    tool_path: String,
    repo_path: String,
    model_path: String,
    cache_path: String,
    env_name: String,
    current_size_label: String,
    estimated_install_label: String,
    runtime_ready: bool,
    model_ready: bool,
    cuda_ready: bool,
    cuda_label: String,
    torch_version: String,
    transformers_version: String,
    diffusers_version: String,
    accelerate_version: String,
    flash_attn_ready: bool,
    flash_attn_message: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolStorage {
    key: String,
    label: String,
    current_bytes: u64,
    current_label: String,
    estimated_install_label: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent {
    stage: String,
    message: String,
    progress: Option<f64>,
    step: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobOptions {
    input_path: String,
    output_name: String,
    action: String,
    trim_start: f64,
    trim_end: f64,
    current_time: f64,
    audio_format: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JobResult {
    output_path: String,
    log: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageCompressResult {
    output_path: String,
    log: String,
    input_size_label: String,
    output_size_label: String,
    saved_label: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpscaleOptions {
    input_path: String,
    output_name: String,
    model: String,
    device: Option<String>,
    fps: f64,
    crf: String,
    encoder_preset: String,
    tile_size: String,
    threads: String,
    trim_start: f64,
    trim_end: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RifeOptions {
    input_path: String,
    output_name: String,
    model: String,
    device: Option<String>,
    multiplier: u32,
    fps: f64,
    crf: String,
    encoder_preset: String,
    threads: String,
    tta_spatial: bool,
    tta_temporal: bool,
    uhd: bool,
    trim_start: f64,
    trim_end: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SocialExportOptions {
    input_path: String,
    output_name: String,
    format: String,
    trim_start: f64,
    trim_end: f64,
    fps: String,
    width: String,
    loop_output: bool,
    scale_filter: String,
    crf: String,
    quality: String,
    preset: String,
    include_audio: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FaceFusionOptions {
    input_path: String,
    source_path: String,
    output_name: String,
    processor_preset: String,
    execution_provider: String,
    trim_start: f64,
    trim_end: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AudioJobOptions {
    input_path: String,
    output_name: String,
    action: String,
    output_format: String,
    trim_start: f64,
    trim_end: f64,
    bitrate: String,
    sample_rate: String,
    channels: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SupirImageOptions {
    input_path: String,
    output_name: String,
    model: String,
    preset: String,
    device: Option<String>,
    upscale: String,
    use_llava: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Flux2ImageOptions {
    prompt: String,
    output_name: String,
    width: u32,
    height: u32,
    steps: u32,
    guidance: f64,
    seed: String,
    #[serde(default)]
    reference_paths: Vec<String>,
    device: Option<String>,
    cpu_offload: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Wan22VideoOptions {
    prompt: String,
    image_path: Option<String>,
    output_name: String,
    orientation: String,
    size: String,
    frame_count: u32,
    steps: u32,
    guidance: f64,
    seed: String,
    device: Option<String>,
    offload_model: bool,
    convert_model_dtype: bool,
    t5_cpu: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Wan21VideoOptions {
    prompt: String,
    output_name: String,
    orientation: String,
    size: String,
    frame_count: u32,
    steps: u32,
    guidance: f64,
    seed: String,
    device: Option<String>,
    offload_model: bool,
    t5_cpu: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImageCompressOptions {
    input_path: String,
    output_name: String,
    format: String,
    quality: u8,
    lossless: bool,
    effort: String,
    keep_metadata: bool,
    preserve_animation: bool,
    #[serde(default)]
    reduce_palette: bool,
    #[serde(default)]
    palette_colors: u16,
    #[serde(default)]
    palette_dither: bool,
    preview_only: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveImageCompressPreviewOptions {
    preview_path: String,
    output_name: String,
    format: String,
}

// All UI discovery runs off the event thread and only for the requested tool.
#[tauri::command]
async fn probe_tool(app: tauri::AppHandle, tool: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if tool == "vosr" {
            let status = vosr::status(&app)?;
            return Ok(serde_json::json!({ "path": status.runtime_ready.then(|| status.path.clone()), "status": status }));
        }
        probe_tool_blocking(&tool)
    })
        .await
        .map_err(|err| format!("Tool probe failed: {err}"))?
}

fn probe_tool_blocking(tool: &str) -> Result<Value, String> {
    use serde_json::json;
    let result = match tool {
        "devices" => {
            json!({ "devices": if find_tool("realesrgan-ncnn-vulkan").is_some() { detect_realesrgan_devices()? } else { Vec::<RealEsrganDevice>::new() } })
        }
        "realesrgan" => {
            json!({ "path": find_tool("realesrgan-ncnn-vulkan"), "models": list_realesrgan_models()? })
        }
        "rife" => json!({ "path": find_tool("rife-ncnn-vulkan"), "models": list_rife_models()? }),
        "supir" => {
            json!({ "status": supir_status(), "models": list_supir_models()?, "path": supir_repo_ready().then(|| supir_repo_dir()) })
        }
        "facefusion" => {
            json!({ "status": facefusion_status(), "path": facefusion_repo_ready().then(|| facefusion_repo_dir()) })
        }
        "flux2" => {
            let status = flux2_status();
            json!({ "path": status.runtime_ready.then(|| flux2_tool_dir()), "status": status })
        }
        "wan21" => {
            let status = wan21_status();
            json!({ "path": status.runtime_ready.then(|| wan21_tool_dir()), "status": status })
        }
        "wan22" => {
            let status = wan22_status();
            json!({ "path": status.runtime_ready.then(|| wan22_tool_dir()), "status": status })
        }
        "cudnn" => json!({ "path": find_cudnn_runtime() }),
        "windowsDeveloperMode" => {
            json!({ "path": windows_developer_mode_enabled().then_some("enabled") })
        }
        "ffmpeg" | "ffprobe" | "git" | "conda" | "oxipng" => json!({ "path": find_tool(tool) }),
        "imagemagick" => json!({ "path": find_tool("magick") }),
        "libavif" => json!({ "path": find_tool("avifenc") }),
        "libwebp" => json!({ "path": find_tool("cwebp") }),
        "mozjpeg" => json!({ "path": find_tool("cjpeg") }),
        _ => return Err(format!("Unknown tool: {tool}")),
    };
    Ok(result)
}

#[tauri::command]
async fn probe_tool_storage(tool: String) -> Result<Vec<ToolStorage>, String> {
    tauri::async_runtime::spawn_blocking(move || tool_storage(Some(&tool)))
        .await
        .map_err(|err| format!("Storage probe failed: {err}"))
}

#[tauri::command]
fn detect_tools() -> ToolStatus {
    ToolStatus {
        ffmpeg: find_tool("ffmpeg"),
        ffprobe: find_tool("ffprobe"),
        realesrgan: find_tool("realesrgan-ncnn-vulkan"),
        rife: find_tool("rife-ncnn-vulkan"),
        supir: supir_repo_ready().then(|| supir_repo_dir().to_string_lossy().to_string()),
        flux2: flux2_runtime_ready().then(|| flux2_tool_dir().to_string_lossy().to_string()),
        wan21: wan21_runtime_ready().then(|| wan21_tool_dir().to_string_lossy().to_string()),
        wan22: wan22_runtime_ready().then(|| wan22_tool_dir().to_string_lossy().to_string()),
        facefusion: facefusion_repo_ready()
            .then(|| facefusion_repo_dir().to_string_lossy().to_string()),
        git: find_tool("git"),
        conda: find_tool("conda"),
        cudnn: find_cudnn_runtime(),
        windows_developer_mode: windows_developer_mode_enabled().then(|| "enabled".to_string()),
        imagemagick: find_tool("magick"),
        oxipng: find_tool("oxipng"),
        libavif: find_tool("avifenc"),
        libwebp: find_tool("cwebp"),
        mozjpeg: find_tool("cjpeg"),
    }
    .stringify()
}

#[tauri::command]
async fn check_tool_updates() -> Result<UpdateAvailability, String> {
    tauri::async_runtime::spawn_blocking(check_tool_updates_blocking)
        .await
        .map_err(|err| format!("Update check task failed: {err}"))
}

fn check_tool_updates_blocking() -> UpdateAvailability {
    let git = find_tool("git");
    let facefusion = git
        .as_deref()
        .map(|git| git_repo_has_update(git, &facefusion_repo_dir()))
        .unwrap_or(false);
    let supir = git
        .as_deref()
        .map(|git| git_repo_has_update(git, &supir_repo_dir()))
        .unwrap_or(false);

    UpdateAvailability {
        ffmpeg: false,
        miniforge: false,
        realesrgan: false,
        rife: false,
        facefusion,
        supir,
        supir_xformers: false,
        flux2: false,
        wan21: false,
        wan22: false,
        imagemagick: false,
        oxipng: false,
        libavif: false,
        libwebp: false,
        mozjpeg: false,
    }
}

fn git_repo_has_update(git: &str, repo_dir: &Path) -> bool {
    if !repo_dir.join(".git").exists() {
        return false;
    }

    let fetch_ok = Command::new(git)
        .args(["-C"])
        .arg(repo_dir)
        .args(["fetch", "--quiet"])
        .status()
        .map(|status| status.success())
        .unwrap_or(false);

    if !fetch_ok {
        return false;
    }

    let Some(local_head) = git_rev_parse(git, repo_dir, "HEAD") else {
        return false;
    };
    let Some(upstream_head) = git_rev_parse(git, repo_dir, "@{u}") else {
        return false;
    };

    local_head != upstream_head
}

fn git_rev_parse(git: &str, repo_dir: &Path, rev: &str) -> Option<String> {
    let output = Command::new(git)
        .args(["-C"])
        .arg(repo_dir)
        .args(["rev-parse", rev])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!value.is_empty()).then_some(value)
}

#[tauri::command]
async fn video_preview_url(path: String) -> Result<Option<String>, String> {
    #[cfg(target_os = "linux")]
    {
        video_preview_stream::preview_url(PathBuf::from(path))
            .await
            .map(Some)
            .map_err(|err| format!("Could not open video preview: {err}"))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = path;
        Ok(None)
    }
}

#[tauri::command]
fn probe_video(path: String) -> Result<VideoMetadata, String> {
    let input_path = PathBuf::from(path);
    if !input_path.exists() {
        return Err("Input video does not exist.".into());
    }

    let ffprobe = find_tool("ffprobe").ok_or("FFprobe was not found.")?;
    let output = Command::new(ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,r_frame_rate,avg_frame_rate,codec_name:stream_side_data=rotation",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
        ])
        .arg(&input_path)
        .output()
        .map_err(|err| format!("Failed to run FFprobe: {err}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let data: Value = serde_json::from_slice(&output.stdout).map_err(|err| err.to_string())?;
    let stream = data["streams"]
        .as_array()
        .and_then(|streams| streams.first())
        .ok_or("No video stream found.")?;

    Ok(VideoMetadata {
        rotation: stream["side_data_list"].as_array().and_then(|list| list.iter().find_map(|item| item["rotation"].as_i64())).unwrap_or(0),
        duration: data["format"]["duration"]
            .as_str()
            .and_then(|value| value.parse::<f64>().ok())
            .unwrap_or(0.0),
        fps: parse_fps(
            stream["avg_frame_rate"]
                .as_str()
                .or_else(|| stream["r_frame_rate"].as_str())
                .unwrap_or(""),
        ),
        width: stream["width"].as_u64().unwrap_or(0),
        height: stream["height"].as_u64().unwrap_or(0),
        codec: stream["codec_name"].as_str().unwrap_or("").to_string(),
    })
}

#[tauri::command]
fn probe_audio(path: String) -> Result<AudioMetadata, String> {
    let input_path = PathBuf::from(path);
    if !input_path.exists() {
        return Err("Input audio does not exist.".into());
    }

    let ffprobe = find_tool("ffprobe").ok_or("FFprobe was not found.")?;
    let output = Command::new(ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=codec_name,sample_rate,channels,bit_rate",
            "-show_entries",
            "format=duration,bit_rate",
            "-of",
            "json",
        ])
        .arg(&input_path)
        .output()
        .map_err(|err| format!("Failed to run FFprobe: {err}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let data: Value = serde_json::from_slice(&output.stdout).map_err(|err| err.to_string())?;
    let stream = data["streams"]
        .as_array()
        .and_then(|streams| streams.first())
        .ok_or("No audio stream found.")?;

    Ok(AudioMetadata {
        duration: data["format"]["duration"]
            .as_str()
            .and_then(|value| value.parse::<f64>().ok())
            .unwrap_or(0.0),
        codec: stream["codec_name"].as_str().unwrap_or("").to_string(),
        sample_rate: stream["sample_rate"]
            .as_str()
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0),
        channels: stream["channels"].as_u64().unwrap_or(0),
        bit_rate: stream["bit_rate"]
            .as_str()
            .or_else(|| data["format"]["bit_rate"].as_str())
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0),
    })
}

#[tauri::command]
fn generate_thumbnails(
    path: String,
    duration: f64,
    count: u32,
    start: Option<f64>,
    end: Option<f64>,
) -> Result<Vec<Thumbnail>, String> {
    let input_path = PathBuf::from(path);
    if !input_path.exists() {
        return Err("Input video does not exist.".into());
    }

    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let thumb_count = count.clamp(1, 16);
    let range_start = start.unwrap_or(0.0).clamp(0.0, duration.max(0.0));
    let range_end = end
        .unwrap_or(duration)
        .clamp(range_start, duration.max(range_start));
    let range_duration = (range_end - range_start).max(0.0);
    let output_dir = thumbnail_dir(&input_path)?;
    fs::create_dir_all(&output_dir).map_err(|err| err.to_string())?;

    let mut thumbnails = Vec::new();
    let mut last_error = String::new();
    for index in 0..thumb_count {
        let denominator = thumb_count.saturating_sub(1).max(1) as f64;
        let time = if range_duration > 0.0 {
            (range_start + range_duration * index as f64 / denominator)
                .min((range_end - 0.05).max(range_start))
        } else {
            range_start
        };
        let output_path = output_dir.join(format!("thumb_{index:02}.jpg"));

        if let Err(error) =
            create_thumbnail(&ffmpeg, &input_path, &output_path, time, "scale=160:-1", "4")
        {
            last_error = error;
            continue;
        }

        let bytes = match fs::read(&output_path) {
            Ok(bytes) => bytes,
            Err(error) => {
                last_error = error.to_string();
                continue;
            }
        };
        thumbnails.push(Thumbnail {
            time,
            data_url: format!(
                "data:image/jpeg;base64,{}",
                general_purpose::STANDARD.encode(bytes)
            ),
        });
    }

    if thumbnails.is_empty() && !last_error.is_empty() {
        Err(format!("Thumbnail generation failed: {last_error}"))
    } else {
        Ok(thumbnails)
    }
}

#[tauri::command]
async fn sample_contact_sheet(
    app: tauri::AppHandle,
    path: String,
    start: f64,
    end: f64,
    count: u32,
    tile_width: u32,
) -> Result<Vec<Thumbnail>, String> {
    if !(1..=48).contains(&count)
        || !start.is_finite()
        || !end.is_finite()
        || start < 0.0
        || end <= start
    {
        return Err("Select a non-empty video range and a frame count from 1 to 48.".into());
    }
    if !matches!(tile_width, 320 | 480 | 640) {
        return Err("Select a contact sheet tile width of 320, 480, or 640 pixels.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let input = PathBuf::from(path);
        if !input.is_file() {
            return Err("Input video does not exist.".into());
        }
        let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
        let scratch = tempfile::tempdir().map_err(|err| err.to_string())?;
        let mut frames: Vec<Thumbnail> = Vec::with_capacity(count as usize);
        let interval = (end - start) / f64::from(count);
        let tile_height = tile_width * 9 / 16;
        let filter = format!(
            "scale={tile_width}:{tile_height}:flags=lanczos:force_original_aspect_ratio=decrease,setsar=1"
        );
        for index in 0..count {
            let mut time = start + (f64::from(index) + 0.5) * interval;
            let output = scratch.path().join(format!("frame-{index}.jpg"));
            match create_thumbnail(&ffmpeg, &input, &output, time, &filter, "2") {
                Ok(()) => {}
                Err(error) if error.is_empty() => {
                    // A seek past the final decodable frame may succeed without writing an image.
                    if let Some(previous) = frames.last() {
                        frames.push(Thumbnail {
                            time: previous.time,
                            data_url: previous.data_url.clone(),
                        });
                        continue;
                    }
                    time = start;
                    create_thumbnail(&ffmpeg, &input, &output, time, &filter, "2")
                        .map_err(|err| format!("Could not sample the selected range. {err}"))?;
                }
                Err(error) => return Err(format!("Could not sample the video at {time:.3}s: {error}")),
            }
            let bytes = fs::read(output).map_err(|err| err.to_string())?;
            frames.push(Thumbnail {
                time,
                data_url: format!(
                    "data:image/jpeg;base64,{}",
                    general_purpose::STANDARD.encode(bytes)
                ),
            });
            emit_progress_detail(
                &app,
                "Contact Sheet",
                format!("Sampled frame {} of {count}", index + 1),
                Some(f64::from(index + 1) / f64::from(count) * 90.0),
                Some("Sampling frames"),
            );
        }
        Ok(frames)
    })
    .await
    .map_err(|err| format!("Contact sheet task failed: {err}"))?
}

#[tauri::command]
fn list_realesrgan_models() -> Result<Vec<RealEsrganModel>, String> {
    let Some(executable) = find_tool("realesrgan-ncnn-vulkan") else { return Ok(Vec::new()); };
    let models_dir = PathBuf::from(executable)
        .parent()
        .ok_or("Real-ESRGAN path has no parent directory.")?
        .join("models");
    if !models_dir.exists() {
        return Ok(Vec::new());
    }

    let mut models = Vec::new();
    for entry in fs::read_dir(models_dir).map_err(|err| err.to_string())? {
        let path = entry.map_err(|err| err.to_string())?.path();
        if path.extension().and_then(|value| value.to_str()) == Some("param") {
            let Some(name) = path.file_stem().and_then(|value| value.to_str()) else {
                continue;
            };
            if !realesrgan::model_ready(&realesrgan::root()?, name) { continue; }
            let bin_path = path.with_extension("bin");
            let size_bytes = file_size(&path) + file_size(&bin_path);
            models.push(RealEsrganModel {
                name: name.to_string(),
                scale: realesrgan_model_scale(name),
                description: realesrgan_model_description(name),
                size_bytes,
                size_label: format_bytes(size_bytes),
                estimated_size_label: realesrgan_model_estimate(name).to_string(),
            });
        }
    }
    models.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(models)
}

#[tauri::command]
fn detect_realesrgan_devices() -> Result<Vec<RealEsrganDevice>, String> {
    if list_realesrgan_models()?.is_empty() { return Ok(Vec::new()); }
    realesrgan::devices()
}

#[tauri::command]
fn list_rife_models() -> Result<Vec<RifeModel>, String> {
    let executable = find_tool("rife-ncnn-vulkan").ok_or("RIFE was not found.")?;
    let tool_dir = executable_parent(&executable)?;
    let candidates = [tool_dir.join("models"), tool_dir.clone()];

    let mut models = Vec::new();
    for models_dir in candidates {
        if !models_dir.exists() {
            continue;
        }
        for entry in fs::read_dir(models_dir).map_err(|err| err.to_string())? {
            let path = entry.map_err(|err| err.to_string())?.path();
            if !path.is_dir() {
                continue;
            }
            let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
                continue;
            };
            if name == "jobs" || models.iter().any(|item: &RifeModel| item.name == name) {
                continue;
            }
            if path.join("flownet.param").exists() && path.join("flownet.bin").exists() {
                let size_bytes = dir_size(&path);
                models.push(RifeModel {
                    name: name.to_string(),
                    description: rife_model_description(name),
                    size_bytes,
                    size_label: format_bytes(size_bytes),
                    estimated_size_label: rife_model_estimate(name).to_string(),
                });
            }
        }
    }
    models.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(models)
}

#[tauri::command]
fn list_supir_models() -> Result<Vec<SupirModel>, String> {
    let mut models = Vec::new();
    for spec in supir_model_specs() {
        let path = supir_checkpoint_dir().join(spec.file_name);
        let installed = path.exists();
        let size_bytes = installed.then(|| file_size(&path)).unwrap_or(0);
        models.push(SupirModel {
            name: spec.name.to_string(),
            label: spec.label.to_string(),
            file_name: spec.file_name.to_string(),
            description: spec.description.to_string(),
            required: spec.required,
            installed,
            installed_path: installed
                .then(|| path.to_string_lossy().to_string())
                .unwrap_or_default(),
            direct_download: spec.direct_download,
            size_bytes,
            size_label: installed
                .then(|| format_bytes(size_bytes))
                .unwrap_or_default(),
            estimated_size_label: spec.estimate.to_string(),
            source_label: spec.source_label.to_string(),
            download_url: spec.download_url.to_string(),
        });
    }
    Ok(models)
}

#[tauri::command]
fn get_tool_storage() -> Vec<ToolStorage> {
    tool_storage(None)
}

fn tool_storage(selected: Option<&str>) -> Vec<ToolStorage> {
    let root = workspace_root().join("tools");
    let items = [
        (
            "ffmpeg",
            "FFmpeg",
            root.join("ffmpeg"),
            "~250-450 MB installed",
        ),
        (
            "git",
            "Git",
            root.join("git"),
            "External install recommended",
        ),
        (
            "miniforge",
            "Miniforge",
            root.join("miniforge"),
            "~700 MB-2 GB depending on Python envs",
        ),
        (
            "realesrgan",
            "Real-ESRGAN",
            realesrgan::root().unwrap_or_else(|_| root.join("realesrgan-ncnn-vulkan")),
            "~120-350 MB with bundled models",
        ),
        (
            "rife",
            "RIFE",
            root.join("rife-ncnn-vulkan"),
            "~180-800 MB depending on models",
        ),
        (
            "supir",
            "SUPIR",
            root.join("supir"),
            "~20-80 GB depending on checkpoints",
        ),
        (
            "flux2",
            "Flux.2",
            root.join("flux2"),
            "~12-30 GB depending on cache and model weights",
        ),
        (
            "wan22",
            "Wan2.2",
            root.join("wan22"),
            "~25-60 GB depending on model cache and runtime",
        ),
        (
            "wan21",
            "Wan2.1",
            root.join("wan21"),
            "~10-25 GB depending on model cache and runtime",
        ),
        (
            "facefusion",
            "FaceFusion",
            root.join("facefusion"),
            "~2-8 GB depending on runtime and models",
        ),
        (
            "imagemagick",
            "ImageMagick",
            root.join("imagemagick"),
            "~80-250 MB installed",
        ),
        (
            "oxipng",
            "OxiPNG",
            root.join("oxipng"),
            "~5-20 MB installed",
        ),
        (
            "libavif",
            "libavif",
            root.join("libavif"),
            "~10-40 MB installed",
        ),
        (
            "libwebp",
            "libwebp",
            root.join("libwebp"),
            "~10-50 MB installed",
        ),
        (
            "mozjpeg",
            "MozJPEG",
            root.join("mozjpeg"),
            "~10-50 MB installed",
        ),
    ];

    items
        .into_iter()
        .filter(|(key, _, _, _)| selected.map_or(true, |selected| selected == *key))
        .map(|(key, label, path, estimated_install_label)| {
            let current_bytes = dir_size(&path);
            ToolStorage {
                key: key.to_string(),
                label: label.to_string(),
                current_bytes,
                current_label: format_bytes(current_bytes),
                estimated_install_label: estimated_install_label.to_string(),
            }
        })
        .collect()
}

#[tauri::command]
fn delete_tool_model(tool: String, model: String) -> Result<JobResult, String> {
    match tool.as_str() {
        "realesrgan" => delete_realesrgan_model(&model)?,
        "rife" => delete_rife_model(&model)?,
        _ => return Err("Unknown model tool.".into()),
    }
    Ok(JobResult {
        output_path: model.clone(),
        log: format!("Removed {tool} model: {model}"),
    })
}

#[tauri::command]
fn default_output_dir() -> Result<String, String> {
    let settings = get_app_settings().unwrap_or_default();
    let output = workspace_root().join(settings.default_download_folder);
    fs::create_dir_all(&output).map_err(|err| err.to_string())?;
    Ok(output.to_string_lossy().to_string())
}

enum OutputKind {
    Video,
    Image,
    Audio,
}

impl OutputKind {
    fn folder_name(&self) -> &'static str {
        match self {
            Self::Video => "video",
            Self::Image => "image",
            Self::Audio => "audio",
        }
    }
}

fn output_dir_for(kind: OutputKind) -> Result<PathBuf, String> {
    let settings = get_app_settings()?;
    let output_dir = workspace_root()
        .join(settings.default_download_folder)
        .join(kind.folder_name());
    fs::create_dir_all(&output_dir).map_err(|err| err.to_string())?;
    Ok(output_dir)
}

fn ffmpeg_output_kind(action: &str, audio_format: Option<&str>) -> OutputKind {
    match action {
        "extract_frame" => OutputKind::Image,
        "video_audio" if audio_format == Some("wav") || audio_format == Some("mp3") => {
            OutputKind::Audio
        }
        _ => OutputKind::Video,
    }
}

fn ffmpeg_progress_step(action: &str, audio_format: Option<&str>) -> &'static str {
    match action {
        "trim_mp4" => "Encoding video",
        "extract_frame" => "Extracting frame",
        "video_audio" if audio_format == Some("wav") || audio_format == Some("mp3") => {
            "Extracting audio"
        }
        _ => "Processing media",
    }
}

fn social_output_kind(format: &str) -> OutputKind {
    match format {
        "gif" | "webp" | "apng" => OutputKind::Image,
        _ => OutputKind::Video,
    }
}

#[tauri::command]
fn get_app_settings() -> Result<AppSettings, String> {
    let path = app_settings_path();
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let text = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let settings: AppSettings =
        serde_json::from_str(&text).map_err(|err| format!("Settings file is invalid: {err}"))?;
    Ok(normalize_app_settings(settings))
}

#[tauri::command]
fn save_app_settings(settings: AppSettings) -> Result<AppSettings, String> {
    let settings = normalize_app_settings(settings);
    let path = app_settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let text = serde_json::to_string_pretty(&settings).map_err(|err| err.to_string())?;
    fs::write(&path, text).map_err(|err| err.to_string())?;
    Ok(settings)
}

#[tauri::command]
fn flush_temp_folder() -> Result<JobResult, String> {
    let temp_dir = PathBuf::from(get_app_settings()?.temp_folder);
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir)
            .map_err(|err| format!("Failed to flush {}: {err}", temp_dir.display()))?;
    }
    fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;
    Ok(JobResult {
        output_path: temp_dir.to_string_lossy().to_string(),
        log: format!("Flushed temp folder: {}", temp_dir.display()),
    })
}

#[tauri::command]
fn save_text_to_downloads(
    app: tauri::AppHandle,
    output_name: String,
    text: String,
) -> Result<JobResult, String> {
    emit_progress_detail(
        &app,
        "Image Export",
        "Preparing text export".to_string(),
        Some(5.0),
        Some("Saving output"),
    );
    let folder = output_dir_for(OutputKind::Image)?;
    let output_path = folder.join(safe_output_filename(&output_name, "download.txt"));
    fs::write(&output_path, text).map_err(|err| err.to_string())?;
    emit_progress_detail(
        &app,
        "Image Export",
        format!("Output: {}", output_path.display()),
        Some(100.0),
        Some("Complete"),
    );
    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: format!("Saved {}", output_path.display()),
    })
}

#[tauri::command]
fn save_data_url_to_downloads(
    app: tauri::AppHandle,
    output_name: String,
    data_url: String,
    preserve_existing: Option<bool>,
) -> Result<JobResult, String> {
    emit_progress_detail(
        &app,
        "Image Export",
        "Preparing image export".to_string(),
        Some(5.0),
        Some("Saving output"),
    );
    let (_, encoded) = data_url
        .split_once(',')
        .ok_or("Data URL did not contain encoded data.")?;
    let bytes = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|err| format!("Data URL decode failed: {err}"))?;
    let folder = output_dir_for(OutputKind::Image)?;
    let file_name = safe_output_filename(&output_name, "download.bin");
    let output_path = if preserve_existing.unwrap_or(false) {
        let path = unique_output_path(&folder, &file_name);
        let mut staged = tempfile::NamedTempFile::new_in(&folder).map_err(|err| err.to_string())?;
        staged.write_all(&bytes).map_err(|err| err.to_string())?;
        staged.persist_noclobber(&path).map_err(|err| err.to_string())?;
        path
    } else {
        let path = folder.join(file_name);
        fs::write(&path, bytes).map_err(|err| err.to_string())?;
        path
    };
    emit_progress_detail(
        &app,
        "Image Export",
        format!("Output: {}", output_path.display()),
        Some(100.0),
        Some("Complete"),
    );
    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: format!("Saved {}", output_path.display()),
    })
}

#[tauri::command]
fn extract_gif_frames(app: tauri::AppHandle, input_path: String) -> Result<GifFrameSet, String> {
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let input_path = PathBuf::from(input_path);
    if !input_path.exists() {
        return Err("GIF input does not exist.".into());
    }

    let temp_dir = workspace_root()
        .join("temp")
        .join(format!("gif_frames_{}", timestamp_id()));
    fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;
    let frame_pattern = temp_dir.join("frame_%08d.png");
    let mut log = String::new();

    emit_progress_detail(
        &app,
        "GIF decode",
        "Extracting GIF frames".to_string(),
        Some(5.0),
        Some("Preparing frames"),
    );

    let mut command = Command::new(&ffmpeg);
    command
        .arg("-hide_banner")
        .arg("-y")
        .arg("-i")
        .arg(&input_path)
        .args(["-vsync", "0"])
        .arg(&frame_pattern);
    run_stage_progress(
        &app,
        "GIF decode",
        &mut command,
        None,
        None,
        &mut log,
        JobProgressRange::new(5.0, 80.0, "Extracting GIF frames"),
    )?;

    let mut frame_paths = fs::read_dir(&temp_dir)
        .map_err(|err| err.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.eq_ignore_ascii_case("png"))
        })
        .collect::<Vec<_>>();
    frame_paths.sort();

    if frame_paths.is_empty() {
        fs::remove_dir_all(&temp_dir).ok();
        return Err("GIF did not produce any frames.".into());
    }

    let delays = gif_frame_delays_ms(&input_path, frame_paths.len());
    let (width, height) = probe_image_dimensions(&input_path).unwrap_or((0, 0));
    let mut total_duration_ms = 0_u64;
    let frames = frame_paths
        .iter()
        .enumerate()
        .map(|(index, path)| {
            let delay_ms = delays.get(index).copied().unwrap_or(100).max(10);
            total_duration_ms = total_duration_ms.saturating_add(delay_ms);
            Ok(GifFrameData {
                index,
                delay_ms,
                data_url: image_data_url(path, "image/png")?,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    emit_progress_detail(
        &app,
        "GIF decode",
        format!("Prepared {} GIF frames", frames.len()),
        Some(100.0),
        Some("Frames ready"),
    );
    fs::remove_dir_all(&temp_dir).ok();

    Ok(GifFrameSet {
        width,
        height,
        total_duration_ms,
        frames,
        log: format!(
            "GIF frames ready: {} frames, {:.2}s",
            frame_paths.len(),
            total_duration_ms as f64 / 1000.0
        ),
    })
}

#[tauri::command]
fn save_gif_frames_to_downloads(
    app: tauri::AppHandle,
    output_name: String,
    frames: Vec<GifFrameInput>,
) -> Result<JobResult, String> {
    if frames.is_empty() {
        return Err("No GIF frames were provided.".into());
    }
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let output_path = output_dir_for(OutputKind::Image)?.join(output_gif_name(&output_name));
    let temp_dir = workspace_root()
        .join("temp")
        .join(format!("dither_gif_{}", timestamp_id()));
    fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;
    let palette_path = temp_dir.join("palette.png");
    let concat_path = temp_dir.join("frames.txt");
    let mut concat = String::new();
    let mut log = String::new();

    emit_progress_detail(
        &app,
        "GIF export",
        "Preparing animated GIF frames".to_string(),
        Some(5.0),
        Some("Saving frames"),
    );

    for (index, frame) in frames.iter().enumerate() {
        let frame_path = temp_dir.join(format!("frame_{:08}.png", index + 1));
        write_data_url_to_path(&frame.data_url, &frame_path)?;
        concat.push_str(&format!("file '{}'\n", concat_file_path(&frame_path)));
        concat.push_str(&format!(
            "duration {:.4}\n",
            frame.delay_ms.max(10) as f64 / 1000.0
        ));
    }
    if let Some(last_path) =
        (frames.len() > 0).then(|| temp_dir.join(format!("frame_{:08}.png", frames.len())))
    {
        concat.push_str(&format!("file '{}'\n", concat_file_path(&last_path)));
    }
    fs::write(&concat_path, concat).map_err(|err| err.to_string())?;

    let mut palette = Command::new(&ffmpeg);
    palette
        .arg("-hide_banner")
        .arg("-y")
        .args(["-f", "concat", "-safe", "0"])
        .arg("-i")
        .arg(&concat_path)
        .arg("-vf")
        .arg("palettegen=max_colors=256")
        .args(["-frames:v", "1", "-update", "1"])
        .arg(&palette_path);
    run_stage_progress(
        &app,
        "GIF palette",
        &mut palette,
        None,
        None,
        &mut log,
        JobProgressRange::new(10.0, 35.0, "Generating GIF palette"),
    )?;

    let mut gif = Command::new(&ffmpeg);
    gif.arg("-hide_banner")
        .arg("-y")
        .args(["-f", "concat", "-safe", "0"])
        .arg("-i")
        .arg(&concat_path)
        .arg("-i")
        .arg(&palette_path)
        .arg("-lavfi")
        .arg("paletteuse=dither=sierra2_4a")
        .arg("-loop")
        .arg("0")
        .arg(&output_path);
    run_stage_progress(
        &app,
        "GIF export",
        &mut gif,
        None,
        None,
        &mut log,
        JobProgressRange::new(35.0, 95.0, "Encoding GIF"),
    )?;

    fs::remove_dir_all(&temp_dir).ok();
    emit_progress_detail(
        &app,
        "GIF export",
        format!("Output: {}", output_path.display()),
        Some(100.0),
        Some("Complete"),
    );
    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: format!("Saved {}", output_path.display()),
    })
}

#[tauri::command]
async fn run_image_compress_job(
    app: tauri::AppHandle,
    options: ImageCompressOptions,
) -> Result<ImageCompressResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_image_compress_job_blocking(app, options))
        .await
        .map_err(|err| format!("Image compressor task failed: {err}"))?
}

fn run_image_compress_job_blocking(
    app: tauri::AppHandle,
    options: ImageCompressOptions,
) -> Result<ImageCompressResult, String> {
    CANCEL_UPSCALE.store(false, Ordering::SeqCst);
    let input_path = PathBuf::from(&options.input_path);
    if !input_path.exists() {
        return Err("Input image does not exist.".into());
    }

    let format = normalized_image_compress_format(&options.format);
    let quality = options.quality.clamp(1, 100);
    let temp_dir = workspace_root()
        .join("temp")
        .join(format!("image_compress_{}", timestamp_id()));
    fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;
    let output_path = if options.preview_only {
        temp_dir.join(image_compress_output_name("compress_preview", format))
    } else {
        output_dir_for(OutputKind::Image)?
            .join(image_compress_output_name(&options.output_name, format))
    };
    let mut log = String::new();
    let animated_input = is_gif_path(&input_path);
    let preserve_animation = options.preserve_animation && animated_input;
    let reduced_input = if options.reduce_palette && !(animated_input && preserve_animation) {
        Some(reduce_palette_still(
            &app,
            &input_path,
            &temp_dir,
            &options,
            &mut log,
        )?)
    } else {
        if options.reduce_palette && animated_input && preserve_animation && format != "gif" {
            log.push_str(
                "Palette reduction for animated inputs is applied only to GIF output for now.\n",
            );
        }
        None
    };
    let compressor_input = reduced_input.as_deref().unwrap_or(&input_path);

    emit_progress_detail(
        &app,
        "Image Compressor",
        format!("Input: {}", input_path.display()),
        Some(5.0),
        Some("Preparing input"),
    );

    let result = match format {
        "png" => compress_to_png(
            &app,
            compressor_input,
            &output_path,
            &temp_dir,
            &options,
            &mut log,
        ),
        "jpg" => compress_to_jpeg(
            &app,
            compressor_input,
            &output_path,
            &temp_dir,
            quality,
            &options,
            &mut log,
        ),
        "webp" => compress_to_webp(
            &app,
            if preserve_animation {
                &input_path
            } else {
                compressor_input
            },
            &output_path,
            &temp_dir,
            quality,
            &options,
            preserve_animation,
            &mut log,
        ),
        "avif" => compress_to_avif(
            &app,
            compressor_input,
            &output_path,
            &temp_dir,
            quality,
            &options,
            &mut log,
        ),
        "gif" => compress_to_gif(
            &app,
            if preserve_animation {
                &input_path
            } else {
                compressor_input
            },
            &output_path,
            &temp_dir,
            quality,
            preserve_animation,
            &options,
            &mut log,
        ),
        "apng" => compress_to_apng(
            &app,
            if preserve_animation {
                &input_path
            } else {
                compressor_input
            },
            &output_path,
            &temp_dir,
            preserve_animation,
            &options,
            &mut log,
        ),
        _ => Err("Unsupported image compressor format.".into()),
    };

    result?;
    if !options.preview_only {
        fs::remove_dir_all(&temp_dir).ok();
    }

    let input_size = file_size(&input_path);
    let output_size = file_size(&output_path);
    let saved = input_size.saturating_sub(output_size);
    let saved_label = if input_size > 0 && output_size <= input_size {
        let ratio = (saved as f64 / input_size as f64) * 100.0;
        format!("Saved {} ({ratio:.1}%)", format_bytes(saved))
    } else {
        "Output is larger than source".to_string()
    };

    emit_progress_detail(
        &app,
        "Image Compressor",
        format!("Output: {}", output_path.display()),
        Some(100.0),
        Some("Complete"),
    );

    if !options.keep_metadata {
        log.push_str("Metadata: stripped where supported by the selected codec.\n");
    } else {
        log.push_str("Metadata: keep metadata requested; external codec support is best-effort.\n");
    }
    log.push_str(&format!(
        "Compressed image: {} -> {}. {saved_label}.\n",
        format_bytes(input_size),
        format_bytes(output_size)
    ));

    Ok(ImageCompressResult {
        output_path: output_path.to_string_lossy().to_string(),
        log,
        input_size_label: format_bytes(input_size),
        output_size_label: format_bytes(output_size),
        saved_label,
    })
}

#[tauri::command]
fn save_image_compress_preview(
    app: tauri::AppHandle,
    options: SaveImageCompressPreviewOptions,
) -> Result<JobResult, String> {
    let preview_path = PathBuf::from(&options.preview_path);
    if !preview_path.exists() {
        return Err("Compressor preview does not exist. Generate a preview first.".into());
    }
    let format = normalized_image_compress_format(&options.format);
    let output_path = output_dir_for(OutputKind::Image)?
        .join(image_compress_output_name(&options.output_name, format));
    emit_progress_detail(
        &app,
        "Image Compressor",
        "Saving compressor preview".to_string(),
        Some(20.0),
        Some("Saving output"),
    );
    fs::copy(&preview_path, &output_path)
        .map_err(|err| format!("Failed to save compressor preview: {err}"))?;
    emit_progress_detail(
        &app,
        "Image Compressor",
        format!("Output: {}", output_path.display()),
        Some(100.0),
        Some("Complete"),
    );
    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: format!(
            "Saved compressed image: {} ({})",
            output_path.display(),
            format_bytes(file_size(&output_path))
        ),
    })
}

#[tauri::command]
fn run_ffmpeg_job(app: tauri::AppHandle, options: JobOptions) -> Result<JobResult, String> {
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let input_path = PathBuf::from(options.input_path);
    if !input_path.exists() {
        return Err("Input video does not exist.".into());
    }

    let output_name = output_name_with_extension(
        &options.output_name,
        &options.action,
        options.audio_format.as_deref(),
    );
    let output_path = output_dir_for(ffmpeg_output_kind(
        &options.action,
        options.audio_format.as_deref(),
    ))?
    .join(output_name);
    let progress_step = ffmpeg_progress_step(&options.action, options.audio_format.as_deref());

    let mut command = Command::new(ffmpeg);
    command.arg("-hide_banner").arg("-y");
    emit_progress_detail(
        &app,
        "FFmpeg",
        format!("Input: {}", input_path.display()),
        Some(5.0),
        Some(progress_step),
    );

    match options.action.as_str() {
        "trim_mp4" => {
            add_trim_args(&mut command, options.trim_start, options.trim_end);
            command
                .arg("-i")
                .arg(&input_path)
                .args([
                    "-c:v",
                    "libx264",
                    "-crf",
                    "18",
                    "-preset",
                    "medium",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "160k",
                    "-movflags",
                    "+faststart",
                ])
                .arg(&output_path);
        }
        "extract_frame" => {
            command
                .arg("-ss")
                .arg(format!("{:.3}", options.current_time.max(0.0)))
                .arg("-i")
                .arg(&input_path)
                .args(["-frames:v", "1", "-update", "1"])
                .arg(&output_path);
        }
        "video_audio" => {
            add_trim_args(&mut command, options.trim_start, options.trim_end);
            command.arg("-i").arg(&input_path).arg("-vn");
            if options.audio_format.as_deref() == Some("wav") {
                command.args(["-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2"]);
            } else {
                command.args(["-codec:a", "libmp3lame", "-q:a", "2"]);
            }
            command.arg(&output_path);
        }
        _ => return Err("Unknown action.".into()),
    }

    let mut log = String::new();
    run_stage_progress(
        &app,
        "FFmpeg",
        &mut command,
        None,
        None,
        &mut log,
        JobProgressRange::new(10.0, 95.0, progress_step),
    )?;

    emit_progress_detail(
        &app,
        "FFmpeg",
        format!("Output: {}", output_path.display()),
        Some(100.0),
        Some("Complete"),
    );

    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log,
    })
}

#[tauri::command]
async fn run_social_export_job(
    app: tauri::AppHandle,
    options: SocialExportOptions,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_social_export_job_blocking(app, options))
        .await
        .map_err(|err| format!("Social export task failed: {err}"))?
}

fn run_social_export_job_blocking(
    app: tauri::AppHandle,
    options: SocialExportOptions,
) -> Result<JobResult, String> {
    CANCEL_UPSCALE.store(false, Ordering::SeqCst);
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let input_path = PathBuf::from(&options.input_path);
    if !input_path.exists() {
        return Err("Input video does not exist.".into());
    }

    let output_path = output_dir_for(social_output_kind(&options.format))?
        .join(social_output_name(&options.output_name, &options.format));
    let mut full_log = String::new();

    emit_progress_detail(
        &app,
        "Social Export",
        format!("Format: {}", options.format),
        Some(2.0),
        Some("Preparing export"),
    );

    if options.format == "gif" {
        let temp_dir = workspace_root()
            .join("temp")
            .join(format!("social_export_{}", timestamp_id()));
        fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;
        let palette_path = temp_dir.join("palette.png");
        let vf = social_video_filter(&options, false);

        let mut palette = Command::new(&ffmpeg);
        palette.arg("-hide_banner").arg("-y");
        add_trim_args(&mut palette, options.trim_start, options.trim_end);
        palette
            .arg("-i")
            .arg(&input_path)
            .arg("-vf")
            .arg(format!("{vf},palettegen=max_colors=256"))
            .arg(&palette_path);
        run_stage_progress(
            &app,
            "GIF palette",
            &mut palette,
            None,
            None,
            &mut full_log,
            JobProgressRange::new(5.0, 30.0, "Generating GIF palette"),
        )?;

        let mut gif = Command::new(&ffmpeg);
        gif.arg("-hide_banner").arg("-y");
        add_trim_args(&mut gif, options.trim_start, options.trim_end);
        gif.arg("-i")
            .arg(&input_path)
            .arg("-i")
            .arg(&palette_path)
            .arg("-lavfi")
            .arg(format!("{vf}[x];[x][1:v]paletteuse=dither=sierra2_4a"))
            .arg("-loop")
            .arg(if options.loop_output { "0" } else { "-1" })
            .arg(&output_path);
        run_stage_progress(
            &app,
            "GIF export",
            &mut gif,
            None,
            None,
            &mut full_log,
            JobProgressRange::new(30.0, 95.0, "Encoding GIF"),
        )?;
        fs::remove_dir_all(&temp_dir).ok();
    } else {
        let mut command = Command::new(&ffmpeg);
        command.arg("-hide_banner").arg("-y");
        add_trim_args(&mut command, options.trim_start, options.trim_end);
        command.arg("-i").arg(&input_path);
        let vf = social_video_filter(&options, options.format == "h264_mp4");
        command.arg("-vf").arg(vf);

        match options.format.as_str() {
            "h264_mp4" => {
                command
                    .args(["-c:v", "libx264", "-crf"])
                    .arg(default_if_empty(&options.crf, "18"))
                    .arg("-preset")
                    .arg(default_if_empty(&options.preset, "veryslow"))
                    .args(["-pix_fmt", "yuv420p", "-movflags", "+faststart"]);
                if options.include_audio {
                    command.args(["-c:a", "aac", "-b:a", "160k"]);
                } else {
                    command.arg("-an");
                }
            }
            "webp" => {
                command
                    .args(["-an", "-c:v", "libwebp", "-quality"])
                    .arg(default_if_empty(&options.quality, "90"))
                    .args(["-compression_level", "6", "-loop"])
                    .arg(if options.loop_output { "0" } else { "1" });
            }
            "apng" => {
                emit_progress(
                    &app,
                    "APNG export",
                    "Animated PNG can create very large files.".to_string(),
                );
                command
                    .args(["-an", "-f", "apng", "-plays"])
                    .arg(if options.loop_output { "0" } else { "1" });
            }
            _ => return Err("Unknown social export format.".into()),
        }

        command.arg(&output_path);
        run_stage_progress(
            &app,
            "Social Export",
            &mut command,
            None,
            None,
            &mut full_log,
            JobProgressRange::new(10.0, 95.0, "Encoding export"),
        )?;
    }

    emit_progress_detail(
        &app,
        "Social Export",
        format!("Output: {}", output_path.display()),
        Some(100.0),
        Some("Complete"),
    );
    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: full_log,
    })
}

#[tauri::command]
async fn run_audio_job(
    app: tauri::AppHandle,
    options: AudioJobOptions,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_audio_job_blocking(app, options))
        .await
        .map_err(|err| format!("Audio task failed: {err}"))?
}

fn run_audio_job_blocking(
    app: tauri::AppHandle,
    options: AudioJobOptions,
) -> Result<JobResult, String> {
    CANCEL_UPSCALE.store(false, Ordering::SeqCst);
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let input_path = PathBuf::from(&options.input_path);
    if !input_path.exists() {
        return Err("Input audio does not exist.".into());
    }

    let format = normalized_audio_format(&options.output_format);
    let output_name = audio_output_name(&options.output_name, &input_path, format);
    let output_path = output_dir_for(OutputKind::Audio)?.join(output_name);

    emit_progress_detail(
        &app,
        "Audio",
        format!("Input: {}", input_path.display()),
        Some(5.0),
        Some("Preparing audio"),
    );

    let mut command = Command::new(ffmpeg);
    command.arg("-hide_banner").arg("-y");
    if options.action == "trim" || options.action == "trim_convert" {
        add_trim_args(&mut command, options.trim_start, options.trim_end);
    }
    command.arg("-i").arg(&input_path).arg("-vn");
    add_audio_encode_args(&mut command, format, &options)?;
    command.arg(&output_path);

    let mut full_log = String::new();
    run_stage_progress(
        &app,
        "Audio",
        &mut command,
        None,
        None,
        &mut full_log,
        JobProgressRange::new(10.0, 95.0, "Processing audio"),
    )?;

    emit_progress_detail(
        &app,
        "Audio",
        format!("Output: {}", output_path.display()),
        Some(100.0),
        Some("Complete"),
    );

    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: full_log,
    })
}

#[tauri::command]
fn cancel_upscale_job() {
    CANCEL_UPSCALE.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn cancel_facefusion_job() {
    CANCEL_UPSCALE.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn cancel_audio_job() {
    CANCEL_UPSCALE.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn cancel_supir_image_job() {
    CANCEL_UPSCALE.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn cancel_flux2_image_job() {
    CANCEL_UPSCALE.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn cancel_wan22_video_job() {
    CANCEL_UPSCALE.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn cancel_wan21_video_job() {
    CANCEL_UPSCALE.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn import_supir_checkpoint(
    source_path: String,
    checkpoint_name: String,
) -> Result<JobResult, String> {
    let spec = supir_model_spec(&checkpoint_name)
        .ok_or_else(|| format!("Unknown SUPIR checkpoint: {checkpoint_name}"))?;
    let source = PathBuf::from(source_path.trim());
    if !source.is_file() {
        return Err(format!(
            "Selected checkpoint was not found: {}",
            source.display()
        ));
    }
    fs::create_dir_all(supir_checkpoint_dir()).map_err(|err| err.to_string())?;
    let destination = supir_checkpoint_dir().join(spec.file_name);
    fs::copy(&source, &destination).map_err(|err| {
        format!(
            "Failed to import {} to {}: {err}",
            source.display(),
            destination.display()
        )
    })?;
    if supir_repo_ready() {
        write_supir_runtime_files()?;
    }
    Ok(JobResult {
        output_path: destination.to_string_lossy().to_string(),
        log: format!("Imported {} to {}", spec.file_name, destination.display()),
    })
}

#[tauri::command]
fn import_supir_checkpoint_from_downloads(checkpoint_name: String) -> Result<JobResult, String> {
    let spec = supir_model_spec(&checkpoint_name)
        .ok_or_else(|| format!("Unknown SUPIR checkpoint: {checkpoint_name}"))?;
    let source = find_downloaded_checkpoint(spec.file_name).ok_or_else(|| {
        format!(
            "Could not find {} in your Downloads folder. Download it first, or use Choose file.",
            spec.file_name
        )
    })?;
    import_supir_checkpoint(source.to_string_lossy().to_string(), spec.name.to_string())
}

#[tauri::command]
async fn download_supir_checkpoint(
    app: tauri::AppHandle,
    checkpoint_name: String,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        download_supir_checkpoint_blocking(app, checkpoint_name)
    })
    .await
    .map_err(|err| format!("SUPIR checkpoint download task failed: {err}"))?
}

fn download_supir_checkpoint_blocking(
    app: tauri::AppHandle,
    checkpoint_name: String,
) -> Result<JobResult, String> {
    let spec = supir_model_spec(&checkpoint_name)
        .ok_or_else(|| format!("Unknown SUPIR checkpoint: {checkpoint_name}"))?;
    if !spec.direct_download {
        return Err(format!(
            "{} is hosted on {}. Open the download page, then import the file.",
            spec.label, spec.source_label
        ));
    }
    fs::create_dir_all(supir_checkpoint_dir()).map_err(|err| err.to_string())?;
    let destination = supir_checkpoint_dir().join(spec.file_name);
    if destination.exists() {
        return Ok(JobResult {
            output_path: destination.to_string_lossy().to_string(),
            log: format!("{} is already installed.", spec.label),
        });
    }
    emit_progress(
        &app,
        "SUPIR checkpoint",
        format!("Downloading {} ({})", spec.label, spec.estimate),
    );
    download_with_progress(&app, "SUPIR checkpoint", spec.resolve_url, &destination)
        .map_err(|err| format!("Failed to download {}: {err}", spec.label))?;
    if supir_repo_ready() {
        write_supir_runtime_files()?;
    }
    Ok(JobResult {
        output_path: destination.to_string_lossy().to_string(),
        log: format!("Downloaded {} to {}", spec.label, destination.display()),
    })
}

#[tauri::command]
fn delete_supir_checkpoint(checkpoint_name: String) -> Result<JobResult, String> {
    let spec = supir_model_spec(&checkpoint_name)
        .ok_or_else(|| format!("Unknown SUPIR checkpoint: {checkpoint_name}"))?;
    let path = supir_checkpoint_dir().join(spec.file_name);
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|err| format!("Failed to remove {}: {err}", path.display()))?;
    }
    Ok(JobResult {
        output_path: path.to_string_lossy().to_string(),
        log: format!("Removed {}", spec.file_name),
    })
}

#[tauri::command]
fn detect_facefusion() -> FaceFusionStatus {
    facefusion_status()
}

#[tauri::command]
fn detect_supir() -> SupirStatus {
    supir_status()
}

#[tauri::command]
fn detect_flux2() -> Flux2Status {
    flux2_status()
}

#[tauri::command]
fn detect_wan21() -> Wan21Status {
    wan21_status()
}

#[tauri::command]
fn detect_wan22() -> Wan22Status {
    wan22_status()
}

#[tauri::command]
async fn install_or_update_flux2(app: tauri::AppHandle) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || install_or_update_flux2_blocking(app))
        .await
        .map_err(|err| format!("Flux.2 install task failed: {err}"))?
}

fn install_or_update_flux2_blocking(app: tauri::AppHandle) -> Result<JobResult, String> {
    let conda = find_tool("conda")
        .ok_or("Conda was not found in PATH. Install Miniforge before installing Flux.2.")?;
    let git = find_tool("git").ok_or(
        "Git was not found in PATH. Git is needed to install current Diffusers for Flux.2.",
    )?;
    let tool_dir = flux2_tool_dir();
    fs::create_dir_all(&tool_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(flux2_cache_dir()).map_err(|err| err.to_string())?;
    write_flux2_runtime_files()?;

    let mut full_log = String::new();
    if !conda_named_env_ready(&conda, FLUX2_ENV_NAME) {
        let mut create = Command::new(&conda);
        create.args([
            "create",
            "--yes",
            "--name",
            FLUX2_ENV_NAME,
            "python=3.12",
            "pip",
        ]);
        run_stage(
            &app,
            "Flux.2 environment",
            &mut create,
            None,
            None,
            &mut full_log,
        )?;
    }

    let mut install_torch = Command::new(&conda);
    install_torch.args([
        "run",
        "--no-capture-output",
        "-n",
        FLUX2_ENV_NAME,
        "python",
        "-m",
        "pip",
        "install",
        "--upgrade",
        FLUX2_TORCH_VERSION,
        FLUX2_TORCHVISION_VERSION,
        "--index-url",
        FLUX2_TORCH_INDEX_URL,
    ]);
    run_stage(
        &app,
        "Flux.2 PyTorch",
        &mut install_torch,
        Some(tool_dir.clone()),
        None,
        &mut full_log,
    )?;

    let mut install_runtime = Command::new(&conda);
    install_runtime.args([
        "run",
        "--no-capture-output",
        "-n",
        FLUX2_ENV_NAME,
        "python",
        "-m",
        "pip",
        "install",
        "--upgrade",
        "git+https://github.com/huggingface/diffusers.git",
        FLUX2_TRANSFORMERS_VERSION,
        FLUX2_ACCELERATE_VERSION,
        FLUX2_SAFETENSORS_VERSION,
        "pillow",
        "huggingface_hub[hf_xet]",
        "hf_xet",
    ]);
    install_runtime.env("GIT_PYTHON_GIT_EXECUTABLE", &git);
    if let Some(git_dir) = PathBuf::from(&git).parent() {
        prepend_paths_env(&mut install_runtime, &[git_dir.to_path_buf()]);
    }
    run_stage(
        &app,
        "Flux.2 runtime",
        &mut install_runtime,
        Some(tool_dir.clone()),
        None,
        &mut full_log,
    )?;

    let status = flux2_status();
    if !status.runtime_ready {
        return Err(status.message);
    }

    emit_progress(
        &app,
        "Flux.2",
        "Installed Flux.2 Python runtime. The model weights will download on first run."
            .to_string(),
    );
    Ok(JobResult {
        output_path: tool_dir.to_string_lossy().to_string(),
        log: full_log,
    })
}

#[tauri::command]
async fn install_or_update_wan21(app: tauri::AppHandle) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || install_or_update_wan21_blocking(app))
        .await
        .map_err(|err| format!("Wan2.1 install task failed: {err}"))?
}

#[tauri::command]
async fn delete_wan21(app: tauri::AppHandle) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || delete_wan21_blocking(app))
        .await
        .map_err(|err| format!("Wan2.1 remove task failed: {err}"))?
}

#[tauri::command]
async fn install_or_update_wan22(app: tauri::AppHandle) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || install_or_update_wan22_blocking(app))
        .await
        .map_err(|err| format!("Wan2.2 install task failed: {err}"))?
}

#[tauri::command]
async fn delete_wan22(app: tauri::AppHandle) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || delete_wan22_blocking(app))
        .await
        .map_err(|err| format!("Wan2.2 remove task failed: {err}"))?
}

fn install_or_update_wan21_blocking(app: tauri::AppHandle) -> Result<JobResult, String> {
    let conda = find_tool("conda")
        .ok_or("Conda was not found in PATH. Install Miniforge before installing Wan2.1.")?;
    let git =
        find_tool("git").ok_or("Git was not found in PATH. Git is needed to install Wan2.1.")?;
    let tool_dir = wan21_tool_dir();
    let repo_dir = wan21_repo_dir();
    fs::create_dir_all(&tool_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(wan21_cache_dir()).map_err(|err| err.to_string())?;
    fs::create_dir_all(wan21_models_dir()).map_err(|err| err.to_string())?;
    write_wan21_runtime_files()?;

    let mut full_log = String::new();
    if repo_dir.join("generate.py").exists() {
        let mut pull = Command::new(&git);
        pull.args(["-C"]).arg(&repo_dir).args(["pull", "--ff-only"]);
        run_stage(&app, "Wan2.1 update", &mut pull, None, None, &mut full_log)?;
    } else {
        let mut clone = Command::new(&git);
        clone.args(["clone", WAN21_REPO_URL]).arg(&repo_dir);
        run_stage(&app, "Wan2.1 clone", &mut clone, None, None, &mut full_log)?;
    }

    if !conda_named_env_ready(&conda, WAN21_ENV_NAME) {
        let mut create = Command::new(&conda);
        create.args([
            "create",
            "--yes",
            "--name",
            WAN21_ENV_NAME,
            "python=3.10",
            "pip",
        ]);
        run_stage(
            &app,
            "Wan2.1 environment",
            &mut create,
            None,
            None,
            &mut full_log,
        )?;
    }

    let mut install_torch = Command::new(&conda);
    install_torch.args([
        "run",
        "--no-capture-output",
        "-n",
        WAN21_ENV_NAME,
        "python",
        "-m",
        "pip",
        "install",
        "--upgrade",
        WAN22_TORCH_VERSION,
        WAN22_TORCHVISION_VERSION,
        WAN22_TORCHAUDIO_VERSION,
        "--index-url",
        WAN22_TORCH_INDEX_URL,
    ]);
    run_stage(
        &app,
        "Wan2.1 PyTorch",
        &mut install_torch,
        Some(tool_dir.clone()),
        None,
        &mut full_log,
    )?;

    let mut install_runtime = Command::new(&conda);
    install_runtime.args([
        "run",
        "--no-capture-output",
        "-n",
        WAN21_ENV_NAME,
        "python",
        "-m",
        "pip",
        "install",
        "--upgrade",
        "opencv-python>=4.9.0.80",
        "diffusers>=0.31.0",
        "transformers>=4.49.0,<=4.51.3",
        "tokenizers>=0.20.3",
        "accelerate>=1.1.1",
        "tqdm",
        "imageio[ffmpeg]",
        "easydict",
        "einops",
        "ftfy",
        "dashscope",
        "imageio-ffmpeg",
        "decord",
        "peft",
        "librosa",
        "safetensors",
        "regex",
        "packaging",
        "ninja",
        "triton-windows<3.3",
        "numpy>=1.23.5,<2",
        "pillow",
        "huggingface_hub[hf_xet,cli]",
        "hf_xet",
    ]);
    run_stage(
        &app,
        "Wan2.1 runtime",
        &mut install_runtime,
        Some(repo_dir.clone()),
        None,
        &mut full_log,
    )?;

    let mut install_flash = Command::new(&conda);
    install_flash.args([
        "run",
        "--no-capture-output",
        "-n",
        WAN21_ENV_NAME,
        "python",
        "-m",
        "pip",
        "install",
        "--force-reinstall",
        "--no-deps",
        WAN_FLASH_ATTN_WHEEL_URL,
    ]);
    if let Err(err) = run_stage(
        &app,
        "Wan2.1 flash attention",
        &mut install_flash,
        Some(repo_dir.clone()),
        None,
        &mut full_log,
    ) {
        let message = format!("Wan2.1 flash_attn install skipped: {err}");
        full_log.push_str(&message);
        full_log.push('\n');
        emit_progress(&app, "Wan2.1", message);
    }

    if !wan21_model_ready() {
        download_wan21_model(&app, &conda, &tool_dir, &mut full_log)?;
    }

    let status = wan21_status();
    if !status.runtime_ready || !status.model_ready {
        return Err(status.message);
    }

    emit_progress_detail(
        &app,
        "Wan2.1",
        "Installed Wan2.1 T2V-1.3B runtime and model.".to_string(),
        Some(100.0),
        Some("Ready"),
    );
    Ok(JobResult {
        output_path: tool_dir.to_string_lossy().to_string(),
        log: full_log,
    })
}

fn download_wan21_model(
    app: &tauri::AppHandle,
    conda: &str,
    tool_dir: &Path,
    full_log: &mut String,
) -> Result<(), String> {
    emit_progress_detail(
        app,
        "Wan2.1 model",
        "Downloading Wan2.1 T2V-1.3B model. Partial downloads will be reused if this is a repair."
            .to_string(),
        Some(5.0),
        Some("Downloading model"),
    );
    let first_result =
        run_wan21_model_download_attempt(app, conda, tool_dir, full_log, false, "Wan2.1 model");
    if first_result.is_ok() || wan21_model_ready() {
        return Ok(());
    }

    let first_error = first_result
        .err()
        .unwrap_or_else(|| "unknown error".to_string());
    let retry_message = format!(
        "Wan2.1 model download did not finish: {first_error} Retrying with Hugging Face Xet disabled."
    );
    full_log.push_str(&retry_message);
    full_log.push('\n');
    emit_progress_detail(
        app,
        "Wan2.1 model",
        retry_message,
        Some(45.0),
        Some("Retrying model download"),
    );

    run_wan21_model_download_attempt(
        app,
        conda,
        tool_dir,
        full_log,
        true,
        "Wan2.1 model fallback",
    )
    .map_err(|err| {
        format!(
            "Wan2.1 model download failed after retry. Check your Hugging Face connection/login and run Repair / Update again. Last error: {err}"
        )
    })?;
    if wan21_model_ready() {
        Ok(())
    } else {
        Err(format!(
            "Wan2.1 model download finished, but required model files were not found at {}.",
            wan21_model_dir().display()
        ))
    }
}

fn run_wan21_model_download_attempt(
    app: &tauri::AppHandle,
    conda: &str,
    tool_dir: &Path,
    full_log: &mut String,
    disable_xet: bool,
    stage: &str,
) -> Result<(), String> {
    let mut download = Command::new(conda);
    download
        .args([
            "run",
            "--no-capture-output",
            "-n",
            WAN21_ENV_NAME,
            "huggingface-cli",
            "download",
            WAN21_MODEL_ID,
            "--local-dir",
        ])
        .arg(wan21_model_dir())
        .args(["--local-dir-use-symlinks", "False"]);
    add_wan21_cache_env(&mut download);
    download.env("HF_HUB_VERBOSITY", "info");
    if disable_xet {
        download.env("HF_HUB_DISABLE_XET", "1");
        download.env("HF_HUB_ENABLE_HF_TRANSFER", "0");
    }
    run_stage_with_heartbeat_options(
        app,
        stage,
        &mut download,
        Some(tool_dir.to_path_buf()),
        None,
        full_log,
        StageHeartbeatOptions {
            interval: Some(Duration::from_secs(20)),
            no_output_timeout: Some(Duration::from_secs(20 * 60)),
            include_gpu_status: false,
            heartbeat_message: "Still downloading model",
            timeout_message: "Wan2.1 model download produced no output for 20 minutes. The transfer is likely stalled.",
        },
        Some(JobProgressRange::new(5.0, 95.0, "Downloading model")),
    )
}

fn delete_wan21_blocking(app: tauri::AppHandle) -> Result<JobResult, String> {
    CANCEL_UPSCALE.store(true, Ordering::SeqCst);
    let tool_dir = wan21_tool_dir();
    let workspace = workspace_root();
    if !tool_dir.starts_with(&workspace) {
        return Err("Wan2.1 tool folder is outside the workspace.".into());
    }

    let mut full_log = String::new();
    if let Some(conda) =
        find_tool("conda").filter(|path| conda_named_env_ready(path, WAN21_ENV_NAME))
    {
        let mut remove_env = Command::new(&conda);
        remove_env.args(["env", "remove", "--yes", "--name", WAN21_ENV_NAME]);
        run_stage(
            &app,
            "Wan2.1 environment",
            &mut remove_env,
            None,
            None,
            &mut full_log,
        )?;
    } else {
        full_log.push_str("Wan2.1 Conda environment was not found.\n");
    }

    if tool_dir.exists() {
        fs::remove_dir_all(&tool_dir)
            .map_err(|err| format!("Failed to remove Wan2.1 tool folder: {err}"))?;
        full_log.push_str(&format!("Removed {}\n", tool_dir.display()));
    } else {
        full_log.push_str("Wan2.1 tool folder was not found.\n");
    }

    emit_progress_detail(
        &app,
        "Wan2.1",
        "Wan2.1 removed.".to_string(),
        Some(100.0),
        Some("Removed"),
    );
    Ok(JobResult {
        output_path: tool_dir.to_string_lossy().to_string(),
        log: full_log,
    })
}

fn install_or_update_wan22_blocking(app: tauri::AppHandle) -> Result<JobResult, String> {
    let conda = find_tool("conda")
        .ok_or("Conda was not found in PATH. Install Miniforge before installing Wan2.2.")?;
    let git =
        find_tool("git").ok_or("Git was not found in PATH. Git is needed to install Wan2.2.")?;
    let tool_dir = wan22_tool_dir();
    let repo_dir = wan22_repo_dir();
    fs::create_dir_all(&tool_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(wan22_cache_dir()).map_err(|err| err.to_string())?;
    fs::create_dir_all(wan22_models_dir()).map_err(|err| err.to_string())?;
    write_wan22_runtime_files()?;

    let mut full_log = String::new();
    if repo_dir.join("generate.py").exists() {
        let mut pull = Command::new(&git);
        pull.args(["-C"]).arg(&repo_dir).args(["pull", "--ff-only"]);
        run_stage(&app, "Wan2.2 update", &mut pull, None, None, &mut full_log)?;
    } else {
        let mut clone = Command::new(&git);
        clone.args(["clone", WAN22_REPO_URL]).arg(&repo_dir);
        run_stage(&app, "Wan2.2 clone", &mut clone, None, None, &mut full_log)?;
    }

    if !conda_named_env_ready(&conda, WAN22_ENV_NAME) {
        let mut create = Command::new(&conda);
        create.args([
            "create",
            "--yes",
            "--name",
            WAN22_ENV_NAME,
            "python=3.10",
            "pip",
        ]);
        run_stage(
            &app,
            "Wan2.2 environment",
            &mut create,
            None,
            None,
            &mut full_log,
        )?;
    }

    let mut install_torch = Command::new(&conda);
    install_torch.args([
        "run",
        "--no-capture-output",
        "-n",
        WAN22_ENV_NAME,
        "python",
        "-m",
        "pip",
        "install",
        "--upgrade",
        WAN22_TORCH_VERSION,
        WAN22_TORCHVISION_VERSION,
        WAN22_TORCHAUDIO_VERSION,
        "--index-url",
        WAN22_TORCH_INDEX_URL,
    ]);
    run_stage(
        &app,
        "Wan2.2 PyTorch",
        &mut install_torch,
        Some(tool_dir.clone()),
        None,
        &mut full_log,
    )?;

    let mut install_runtime = Command::new(&conda);
    install_runtime.args([
        "run",
        "--no-capture-output",
        "-n",
        WAN22_ENV_NAME,
        "python",
        "-m",
        "pip",
        "install",
        "--upgrade",
        "opencv-python>=4.9.0.80",
        "diffusers>=0.31.0",
        "transformers>=4.49.0,<=4.51.3",
        "tokenizers>=0.20.3",
        "accelerate>=1.1.1",
        "tqdm",
        "imageio[ffmpeg]",
        "easydict",
        "einops",
        "ftfy",
        "dashscope",
        "imageio-ffmpeg",
        "decord",
        "peft",
        "librosa",
        "safetensors",
        "regex",
        "packaging",
        "ninja",
        "numpy>=1.23.5,<2",
        "pillow",
        "huggingface_hub[hf_xet,cli]",
        "hf_xet",
    ]);
    run_stage(
        &app,
        "Wan2.2 runtime",
        &mut install_runtime,
        Some(repo_dir.clone()),
        None,
        &mut full_log,
    )?;

    let mut install_flash = Command::new(&conda);
    install_flash.args([
        "run",
        "--no-capture-output",
        "-n",
        WAN22_ENV_NAME,
        "python",
        "-m",
        "pip",
        "install",
        "--upgrade",
        "flash-attn",
        "--no-build-isolation",
    ]);
    install_flash.env("MAX_JOBS", "2");
    if let Err(err) = run_stage(
        &app,
        "Wan2.2 flash attention",
        &mut install_flash,
        Some(repo_dir.clone()),
        None,
        &mut full_log,
    ) {
        let message = format!("Wan2.2 flash_attn install skipped: {err}");
        full_log.push_str(&message);
        full_log.push('\n');
        emit_progress(&app, "Wan2.2", message);
    }

    if !wan22_model_ready() {
        let mut download = Command::new(&conda);
        download
            .args([
                "run",
                "--no-capture-output",
                "-n",
                WAN22_ENV_NAME,
                "huggingface-cli",
                "download",
                WAN22_MODEL_ID,
                "--local-dir",
            ])
            .arg(wan22_model_dir())
            .args(["--local-dir-use-symlinks", "False"]);
        add_wan22_cache_env(&mut download);
        run_stage_with_heartbeat(
            &app,
            "Wan2.2 model",
            &mut download,
            Some(tool_dir.clone()),
            None,
            &mut full_log,
            Some(Duration::from_secs(20)),
            Some(JobProgressRange::new(5.0, 95.0, "Downloading model")),
        )?;
    }

    let status = wan22_status();
    if !status.runtime_ready || !status.model_ready {
        return Err(status.message);
    }

    emit_progress(
        &app,
        "Wan2.2",
        "Installed Wan2.2 TI2V-5B runtime and model.".to_string(),
    );
    Ok(JobResult {
        output_path: tool_dir.to_string_lossy().to_string(),
        log: full_log,
    })
}

fn delete_wan22_blocking(app: tauri::AppHandle) -> Result<JobResult, String> {
    CANCEL_UPSCALE.store(true, Ordering::SeqCst);
    let tool_dir = wan22_tool_dir();
    let workspace = workspace_root();
    if !tool_dir.starts_with(&workspace) {
        return Err("Wan2.2 tool folder is outside the workspace.".into());
    }

    let mut full_log = String::new();
    if let Some(conda) =
        find_tool("conda").filter(|path| conda_named_env_ready(path, WAN22_ENV_NAME))
    {
        let mut remove_env = Command::new(&conda);
        remove_env.args(["env", "remove", "--yes", "--name", WAN22_ENV_NAME]);
        run_stage(
            &app,
            "Wan2.2 environment",
            &mut remove_env,
            None,
            None,
            &mut full_log,
        )?;
    } else {
        full_log.push_str("Wan2.2 Conda environment was not found.\n");
    }

    if tool_dir.exists() {
        fs::remove_dir_all(&tool_dir)
            .map_err(|err| format!("Failed to remove Wan2.2 tool folder: {err}"))?;
        full_log.push_str(&format!("Removed {}\n", tool_dir.display()));
    } else {
        full_log.push_str("Wan2.2 tool folder was not found.\n");
    }

    emit_progress_detail(
        &app,
        "Wan2.2",
        "Wan2.2 removed.".to_string(),
        Some(100.0),
        Some("Removed"),
    );
    Ok(JobResult {
        output_path: tool_dir.to_string_lossy().to_string(),
        log: full_log,
    })
}

#[tauri::command]
async fn install_or_update_supir_xformers(app: tauri::AppHandle) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || install_or_update_supir_xformers_blocking(app))
        .await
        .map_err(|err| format!("SUPIR xFormers install task failed: {err}"))?
}

#[cfg(target_os = "linux")]
fn install_or_update_supir_xformers_blocking(app: tauri::AppHandle) -> Result<JobResult, String> { supir::xformers(&app, false) }

#[cfg(not(target_os = "linux"))]
fn install_or_update_supir_xformers_blocking(app: tauri::AppHandle) -> Result<JobResult, String> {
    let conda = find_tool("conda")
        .ok_or("Conda was not found in PATH. Install Miniforge before installing SUPIR.")?;
    if !supir_repo_ready() {
        return Err("SUPIR repo is not installed. Run SUPIR Download first.".into());
    }
    if !conda_named_env_ready(&conda, SUPIR_ENV_NAME) {
        return Err(format!(
            "SUPIR Conda env {SUPIR_ENV_NAME} is not ready. Run SUPIR Download first."
        ));
    }

    let repo_dir = supir_repo_dir();
    let mut full_log = String::new();
    install_supir_xformers_stages(&app, &conda, &repo_dir, &mut full_log)?;
    Ok(JobResult {
        output_path: repo_dir.to_string_lossy().to_string(),
        log: full_log,
    })
}

#[tauri::command]
async fn delete_supir_xformers(app: tauri::AppHandle) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || delete_supir_xformers_blocking(app))
        .await
        .map_err(|err| format!("SUPIR xFormers remove task failed: {err}"))?
}

#[cfg(target_os = "linux")]
fn delete_supir_xformers_blocking(app: tauri::AppHandle) -> Result<JobResult, String> { supir::xformers(&app, true) }

#[cfg(not(target_os = "linux"))]
fn delete_supir_xformers_blocking(app: tauri::AppHandle) -> Result<JobResult, String> {
    let conda = find_tool("conda")
        .ok_or("Conda was not found in PATH. Install Miniforge before changing SUPIR.")?;
    if !conda_named_env_ready(&conda, SUPIR_ENV_NAME) {
        return Err(format!("SUPIR Conda env {SUPIR_ENV_NAME} is not ready."));
    }

    let mut full_log = String::new();
    let mut uninstall = Command::new(&conda);
    uninstall.args([
        "run",
        "--no-capture-output",
        "-n",
        SUPIR_ENV_NAME,
        "python",
        "-m",
        "pip",
        "uninstall",
        "--yes",
        "xformers",
    ]);
    run_stage(
        &app,
        "SUPIR xFormers remove",
        &mut uninstall,
        Some(supir_repo_dir()),
        None,
        &mut full_log,
    )?;
    Ok(JobResult {
        output_path: supir_tool_dir().to_string_lossy().to_string(),
        log: full_log,
    })
}

#[tauri::command]
async fn install_or_update_supir(app: tauri::AppHandle) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || install_or_update_supir_blocking(app))
        .await
        .map_err(|err| format!("SUPIR install task failed: {err}"))?
}

#[cfg(target_os = "linux")]
fn install_or_update_supir_blocking(app: tauri::AppHandle) -> Result<JobResult, String> { supir::install(&app) }

#[cfg(not(target_os = "linux"))]
fn install_or_update_supir_blocking(app: tauri::AppHandle) -> Result<JobResult, String> {
    let git = find_tool("git")
        .ok_or("Git was not found in PATH. Install Git before installing SUPIR.")?;
    let conda = find_tool("conda")
        .ok_or("Conda was not found in PATH. Install Miniforge before installing SUPIR.")?;

    let tool_dir = supir_tool_dir();
    let repo_dir = supir_repo_dir();
    fs::create_dir_all(&tool_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(supir_checkpoint_dir()).map_err(|err| err.to_string())?;
    let mut full_log = String::new();

    if repo_dir.join("test.py").exists() {
        let mut pull = Command::new(&git);
        pull.args(["-C"]).arg(&repo_dir).args(["pull", "--ff-only"]);
        run_stage(&app, "SUPIR update", &mut pull, None, None, &mut full_log)?;
    } else {
        if repo_dir.exists() {
            fs::remove_dir_all(&repo_dir).map_err(|err| err.to_string())?;
        }
        let mut clone = Command::new(&git);
        clone
            .args(["clone", "https://github.com/Fanghua-Yu/SUPIR"])
            .arg(&repo_dir);
        run_stage(&app, "SUPIR clone", &mut clone, None, None, &mut full_log)?;
    }

    if !conda_named_env_ready(&conda, SUPIR_ENV_NAME) {
        let mut create = Command::new(&conda);
        create.args([
            "create",
            "--yes",
            "--name",
            SUPIR_ENV_NAME,
            "python=3.8",
            "pip",
        ]);
        run_stage(
            &app,
            "SUPIR environment",
            &mut create,
            None,
            None,
            &mut full_log,
        )?;
    }

    write_supir_runtime_files()?;

    let mut install_torch = Command::new(&conda);
    install_torch.args([
        "run",
        "--no-capture-output",
        "-n",
        SUPIR_ENV_NAME,
        "python",
        "-m",
        "pip",
        "install",
        "--upgrade",
        SUPIR_TORCH_VERSION,
        SUPIR_TORCHVISION_VERSION,
        "--index-url",
        SUPIR_TORCH_INDEX_URL,
    ]);
    run_stage(
        &app,
        "SUPIR PyTorch",
        &mut install_torch,
        Some(repo_dir.clone()),
        None,
        &mut full_log,
    )?;

    install_supir_xformers_stages(&app, &conda, &repo_dir, &mut full_log)?;

    let mut install = Command::new(&conda);
    install.args([
        "run",
        "--no-capture-output",
        "-n",
        SUPIR_ENV_NAME,
        "python",
        "-m",
        "pip",
        "install",
        "--upgrade",
        "-r",
    ]);
    install.arg(supir_requirements_path());
    run_stage(
        &app,
        "SUPIR dependencies",
        &mut install,
        Some(repo_dir),
        None,
        &mut full_log,
    )?;

    emit_progress(
        &app,
        "SUPIR",
        "Installed SUPIR repo and Python environment. Add checkpoints before running.".to_string(),
    );
    Ok(JobResult {
        output_path: supir_repo_dir().to_string_lossy().to_string(),
        log: full_log,
    })
}

#[tauri::command]
async fn install_or_update_facefusion(
    app: tauri::AppHandle,
    onnxruntime: String,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        install_or_update_facefusion_blocking(app, onnxruntime)
    })
    .await
    .map_err(|err| format!("FaceFusion install task failed: {err}"))?
}

fn install_or_update_facefusion_blocking(
    app: tauri::AppHandle,
    onnxruntime: String,
) -> Result<JobResult, String> {
    let git = find_tool("git")
        .ok_or("Git was not found in PATH. Install Git before installing FaceFusion.")?;
    let conda = find_tool("conda").ok_or(
        "Conda was not found in PATH. Install Miniconda or Anaconda before installing FaceFusion.",
    )?;
    find_tool("ffmpeg").ok_or("FFmpeg was not found. Install FFmpeg first from Must haves.")?;

    let tool_dir = facefusion_tool_dir();
    let repo_dir = facefusion_repo_dir();
    fs::create_dir_all(&tool_dir).map_err(|err| err.to_string())?;
    let runtime = default_if_empty(&onnxruntime, "directml").to_lowercase();
    let mut full_log = String::new();

    if repo_dir.join("facefusion.py").exists() {
        let mut pull = Command::new(&git);
        pull.args(["-C"]).arg(&repo_dir).args(["pull", "--ff-only"]);
        run_stage(
            &app,
            "FaceFusion update",
            &mut pull,
            None,
            None,
            &mut full_log,
        )?;
    } else {
        if repo_dir.exists() {
            fs::remove_dir_all(&repo_dir).map_err(|err| err.to_string())?;
        }
        let mut clone = Command::new(&git);
        clone
            .args(["clone", "https://github.com/facefusion/facefusion"])
            .arg(&repo_dir);
        run_stage(
            &app,
            "FaceFusion clone",
            &mut clone,
            None,
            None,
            &mut full_log,
        )?;
    }

    if !conda_env_ready(&conda) {
        let mut create = Command::new(&conda);
        create.args([
            "create",
            "--yes",
            "--name",
            FACEFUSION_ENV_NAME,
            "python=3.12",
            "pip=25.0",
        ]);
        run_stage(
            &app,
            "FaceFusion environment",
            &mut create,
            None,
            None,
            &mut full_log,
        )?;
    }

    let mut install = Command::new(&conda);
    install
        .args([
            "run",
            "--no-capture-output",
            "-n",
            FACEFUSION_ENV_NAME,
            "python",
        ])
        .arg("install.py")
        .arg("--onnxruntime")
        .arg(&runtime);
    run_stage(
        &app,
        "FaceFusion install",
        &mut install,
        Some(repo_dir.clone()),
        None,
        &mut full_log,
    )?;

    emit_progress(&app, "FaceFusion", "Installed FaceFusion.".to_string());
    Ok(JobResult {
        output_path: repo_dir.to_string_lossy().to_string(),
        log: full_log,
    })
}

#[tauri::command]
async fn update_rife(
    app: tauri::AppHandle,
    selected_models: Option<Vec<String>>,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || update_rife_blocking(app, selected_models))
        .await
        .map_err(|err| format!("RIFE update task failed: {err}"))?
}

fn update_rife_blocking(
    app: tauri::AppHandle,
    selected_models: Option<Vec<String>>,
) -> Result<JobResult, String> {
    install_github_release_tool(
        &app,
        "Update RIFE",
        "nihui/rife-ncnn-vulkan",
        "rife-ncnn-vulkan",
        "rife-ncnn-vulkan.exe",
        &["rife-ncnn-vulkan", "windows"],
    )?;
    if let Some(models) = selected_models.as_ref().filter(|items| !items.is_empty()) {
        prune_rife_models(models)?;
    }
    let tool_path = find_tool("rife-ncnn-vulkan").unwrap_or_default();
    Ok(JobResult {
        output_path: tool_path,
        log: "RIFE update finished.".to_string(),
    })
}

#[tauri::command]
async fn update_ffmpeg(app: tauri::AppHandle) -> Result<JobResult, String> {
    if !cfg!(windows) {
        return Err("Update system FFmpeg and FFprobe with your package manager.".into());
    }

    tauri::async_runtime::spawn_blocking(move || update_ffmpeg_blocking(app))
        .await
        .map_err(|err| format!("FFmpeg update task failed: {err}"))?
}

fn update_ffmpeg_blocking(app: tauri::AppHandle) -> Result<JobResult, String> {
    let root = workspace_root();
    let tools_dir = root.join("tools");
    let temp_dir = root.join("temp").join("tool_downloads");
    fs::create_dir_all(&tools_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;

    emit_progress(
        &app,
        "Update FFmpeg",
        "Checking BtbN/FFmpeg-Builds releases...".to_string(),
    );
    let asset = latest_github_asset("BtbN/FFmpeg-Builds", &["ffmpeg-master-latest-win64-gpl"])?;
    let zip_path = temp_dir.join(&asset.name);
    emit_progress(
        &app,
        "Update FFmpeg",
        format!("Downloading {}...", asset.name),
    );
    download_with_progress(&app, "Update FFmpeg", &asset.url, &zip_path)?;

    let extract_dir = root
        .join("temp")
        .join(format!("tool_extract_ffmpeg_{}", timestamp_id()));
    if extract_dir.exists() {
        fs::remove_dir_all(&extract_dir).map_err(|err| err.to_string())?;
    }
    fs::create_dir_all(&extract_dir).map_err(|err| err.to_string())?;
    emit_progress(&app, "Update FFmpeg", "Extracting package...".to_string());
    unzip_archive(&zip_path, &extract_dir)?;

    let ffmpeg = find_file_by_name(&extract_dir, "ffmpeg.exe")
        .ok_or("Downloaded package did not contain ffmpeg.exe.")?;
    find_file_by_name(&extract_dir, "ffprobe.exe")
        .ok_or("Downloaded package did not contain ffprobe.exe.")?;
    let package_bin_dir = ffmpeg
        .parent()
        .ok_or("Downloaded FFmpeg executable has no parent directory.")?;
    let staged_dir = root
        .join("temp")
        .join(format!("tool_stage_ffmpeg_{}", timestamp_id()));
    if staged_dir.exists() {
        fs::remove_dir_all(&staged_dir).map_err(|err| err.to_string())?;
    }
    copy_dir_all(package_bin_dir, &staged_dir)?;

    let probe = Command::new(staged_dir.join("ffmpeg.exe"))
        .arg("-version")
        .output()
        .map_err(|err| format!("Failed to validate FFmpeg: {err}"))?;
    if !probe.status.success() {
        return Err(format!(
            "Downloaded FFmpeg executable failed validation: {}",
            String::from_utf8_lossy(&probe.stderr).trim()
        ));
    }
    let probe = Command::new(staged_dir.join("ffprobe.exe"))
        .arg("-version")
        .output()
        .map_err(|err| format!("Failed to validate FFprobe: {err}"))?;
    if !probe.status.success() {
        return Err(format!(
            "Downloaded FFprobe executable failed validation: {}",
            String::from_utf8_lossy(&probe.stderr).trim()
        ));
    }

    let managed_dir = tools_dir.join("ffmpeg");
    let backup_dir = root
        .join("temp")
        .join(format!("tool_backup_ffmpeg_{}", timestamp_id()));
    if managed_dir.exists() {
        fs::rename(&managed_dir, &backup_dir).map_err(|err| err.to_string())?;
    }
    match fs::rename(&staged_dir, &managed_dir) {
        Ok(()) => {
            if backup_dir.exists() {
                fs::remove_dir_all(&backup_dir).ok();
            }
            fs::remove_dir_all(&extract_dir).ok();
            emit_progress(&app, "Update FFmpeg", "Installed FFmpeg.".to_string());
            Ok(JobResult {
                output_path: managed_dir.to_string_lossy().to_string(),
                log: format!("Installed {} from BtbN/FFmpeg-Builds.", asset.name),
            })
        }
        Err(error) => {
            if backup_dir.exists() && !managed_dir.exists() {
                let _ = fs::rename(&backup_dir, &managed_dir);
            }
            Err(format!("Failed to activate FFmpeg: {error}"))
        }
    }
}

#[tauri::command]
async fn update_miniforge(app: tauri::AppHandle) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || update_miniforge_blocking(app))
        .await
        .map_err(|err| format!("Miniforge update task failed: {err}"))?
}

fn update_miniforge_blocking(app: tauri::AppHandle) -> Result<JobResult, String> {
    let root = workspace_root();
    let tools_dir = root.join("tools");
    let temp_dir = root.join("temp").join("tool_downloads");
    fs::create_dir_all(&tools_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;

    emit_progress(
        &app,
        "Update Miniforge",
        "Checking conda-forge/miniforge releases...".to_string(),
    );
    let asset = latest_github_asset_ext(
        "conda-forge/miniforge",
        &["miniforge3", "windows", "x86_64"],
        ".exe",
    )?;
    let installer_path = temp_dir.join(&asset.name);
    emit_progress(
        &app,
        "Update Miniforge",
        format!("Downloading {}...", asset.name),
    );
    download_with_progress(&app, "Update Miniforge", &asset.url, &installer_path)?;

    let staged_dir = root
        .join("temp")
        .join(format!("tool_stage_miniforge_{}", timestamp_id()));
    if staged_dir.exists() {
        fs::remove_dir_all(&staged_dir).map_err(|err| err.to_string())?;
    }
    fs::create_dir_all(&staged_dir).map_err(|err| err.to_string())?;

    let mut install = Command::new(&installer_path);
    install
        .args([
            "/S",
            "/InstallationType=JustMe",
            "/AddToPath=0",
            "/RegisterPython=0",
        ])
        .arg(format!("/D={}", staged_dir.to_string_lossy()));
    let mut full_log = String::new();
    run_stage(
        &app,
        "Update Miniforge",
        &mut install,
        None,
        None,
        &mut full_log,
    )?;

    let staged_conda = find_conda_in_dir(&staged_dir)
        .ok_or("Miniforge installer finished, but conda.exe was not found.")?;
    let probe = Command::new(&staged_conda)
        .arg("--version")
        .output()
        .map_err(|err| format!("Failed to validate Miniforge conda: {err}"))?;
    if !probe.status.success() {
        return Err(format!(
            "Downloaded Miniforge failed validation: {}",
            String::from_utf8_lossy(&probe.stderr).trim()
        ));
    }

    let managed_dir = miniforge_dir();
    let backup_dir = root
        .join("temp")
        .join(format!("tool_backup_miniforge_{}", timestamp_id()));
    if managed_dir.exists() {
        fs::rename(&managed_dir, &backup_dir).map_err(|err| err.to_string())?;
    }
    match fs::rename(&staged_dir, &managed_dir) {
        Ok(()) => {
            if backup_dir.exists() {
                fs::remove_dir_all(&backup_dir).ok();
            }
            emit_progress(&app, "Update Miniforge", "Installed Miniforge.".to_string());
            Ok(JobResult {
                output_path: find_conda_in_dir(&managed_dir)
                    .unwrap_or_else(|| managed_dir.join("Scripts").join("conda.exe"))
                    .to_string_lossy()
                    .to_string(),
                log: format!("Installed {} from conda-forge/miniforge.", asset.name),
            })
        }
        Err(error) => {
            if backup_dir.exists() && !managed_dir.exists() {
                let _ = fs::rename(&backup_dir, &managed_dir);
            }
            Err(format!("Failed to activate Miniforge: {error}"))
        }
    }
}

#[tauri::command]
async fn update_image_codec_tool(app: tauri::AppHandle, tool: String) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || update_image_codec_tool_blocking(app, &tool))
        .await
        .map_err(|err| format!("Image codec tool update task failed: {err}"))?
}

#[tauri::command]
async fn delete_image_codec_tool(tool: String) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || delete_image_codec_tool_blocking(&tool))
        .await
        .map_err(|err| format!("Image codec tool delete task failed: {err}"))?
}

#[tauri::command]
async fn update_imagemagick(app: tauri::AppHandle) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        update_image_codec_tool_blocking(app, "imagemagick")
    })
    .await
    .map_err(|err| format!("ImageMagick update task failed: {err}"))?
}

#[tauri::command]
async fn delete_imagemagick() -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || delete_image_codec_tool_blocking("imagemagick"))
        .await
        .map_err(|err| format!("ImageMagick delete task failed: {err}"))?
}

fn update_image_codec_tool_blocking(
    app: tauri::AppHandle,
    tool: &str,
) -> Result<JobResult, String> {
    let spec = image_codec_tool_spec(tool).ok_or("Unknown image codec tool.")?;
    let root = workspace_root();
    let tools_dir = root.join("tools");
    let temp_dir = root.join("temp").join("tool_downloads");
    fs::create_dir_all(&tools_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;
    let stage = format!("Update {}", spec.label);

    let asset = if let Some(url) = spec.direct_asset_url {
        let name = url
            .rsplit('/')
            .next()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("tool.zip")
            .to_string();
        emit_progress(
            &app,
            &stage,
            format!("Using official {} package...", spec.repo),
        );
        ReleaseAsset {
            name,
            url: url.to_string(),
        }
    } else {
        emit_progress(&app, &stage, format!("Checking {} releases...", spec.repo));
        latest_github_asset_ext(spec.repo, spec.asset_terms, spec.asset_extension)?
    };
    let archive_path = temp_dir.join(&asset.name);
    emit_progress(&app, &stage, format!("Downloading {}...", asset.name));
    download_with_progress(&app, &stage, &asset.url, &archive_path)?;

    let extract_dir =
        root.join("temp")
            .join(format!("tool_extract_{}_{}", spec.key, timestamp_id()));
    if extract_dir.exists() {
        fs::remove_dir_all(&extract_dir).map_err(|err| err.to_string())?;
    }
    fs::create_dir_all(&extract_dir).map_err(|err| err.to_string())?;
    emit_progress(&app, &stage, "Extracting package...".to_string());
    extract_archive(&archive_path, &extract_dir)?;

    let required_paths = spec
        .required_executables
        .iter()
        .map(|name| {
            find_file_by_name(&extract_dir, name)
                .ok_or_else(|| format!("Downloaded package did not contain {name}."))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let package_bin_dir = common_parent_dir(&required_paths).unwrap_or(&extract_dir);
    let staged_dir = root
        .join("temp")
        .join(format!("tool_stage_{}_{}", spec.key, timestamp_id()));
    if staged_dir.exists() {
        fs::remove_dir_all(&staged_dir).map_err(|err| err.to_string())?;
    }
    copy_dir_all(package_bin_dir, &staged_dir)?;

    for executable in spec.required_executables {
        let executable_path = staged_dir.join(executable);
        if !executable_path.exists() {
            return Err(format!(
                "Staged {} did not include {} at the expected location.",
                spec.label, executable
            ));
        }
        let mut validation = Command::new(&executable_path);
        validation.arg(spec.validation_arg);
        if spec.key == "imagemagick" {
            configure_imagemagick_command(&mut validation, &executable_path);
        }
        let output = validation
            .output()
            .map_err(|err| format!("Failed to validate {executable}: {err}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let details = if !stderr.is_empty() {
                stderr
            } else if !stdout.is_empty() {
                stdout
            } else {
                format!("exit status {}", output.status)
            };
            return Err(format!(
                "Downloaded {executable} failed validation: {details}"
            ));
        }
    }

    let managed_dir = tools_dir.join(spec.key);
    let backup_dir = root
        .join("temp")
        .join(format!("tool_backup_{}_{}", spec.key, timestamp_id()));
    if managed_dir.exists() {
        fs::rename(&managed_dir, &backup_dir).map_err(|err| err.to_string())?;
    }
    match fs::rename(&staged_dir, &managed_dir) {
        Ok(()) => {
            if backup_dir.exists() {
                fs::remove_dir_all(&backup_dir).ok();
            }
            fs::remove_dir_all(&extract_dir).ok();
            emit_progress(&app, &stage, format!("Installed {}.", spec.label));
            Ok(JobResult {
                output_path: managed_dir.to_string_lossy().to_string(),
                log: format!("Installed {} from {}.", asset.name, spec.repo),
            })
        }
        Err(error) => {
            if backup_dir.exists() && !managed_dir.exists() {
                let _ = fs::rename(&backup_dir, &managed_dir);
            }
            Err(format!("Failed to activate {}: {error}", spec.label))
        }
    }
}

fn delete_image_codec_tool_blocking(tool: &str) -> Result<JobResult, String> {
    let spec = image_codec_tool_spec(tool).ok_or("Unknown image codec tool.")?;
    let tool_dir = workspace_root().join("tools").join(spec.key);
    if tool_dir.exists() {
        fs::remove_dir_all(&tool_dir)
            .map_err(|err| format!("Failed to remove {}: {err}", tool_dir.display()))?;
    }
    Ok(JobResult {
        output_path: tool_dir.to_string_lossy().to_string(),
        log: format!("Removed {} from {}", spec.label, tool_dir.display()),
    })
}

#[tauri::command]
async fn compare_realesrgan_models(
    app: tauri::AppHandle,
    path: String,
    current_time: f64,
    device: Option<String>,
    tile_size: String,
    threads: String,
) -> Result<ModelCompareResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        compare_realesrgan_models_blocking(app, path, current_time, device, tile_size, threads)
    })
    .await
    .map_err(|err| format!("Model compare task failed: {err}"))?
}

fn compare_realesrgan_models_blocking(
    app: tauri::AppHandle,
    path: String,
    current_time: f64,
    device: Option<String>,
    tile_size: String,
    threads: String,
) -> Result<ModelCompareResult, String> {
    let _guard = realesrgan::lock()?;
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let realesrgan = find_tool("realesrgan-ncnn-vulkan").ok_or("Real-ESRGAN was not found.")?;
    let input_path = PathBuf::from(path);
    if !input_path.exists() {
        return Err("Input video does not exist.".into());
    }

    let models = list_realesrgan_models()?;
    if models.is_empty() {
        return Err("No Real-ESRGAN models were found.".into());
    }

    let temp = tempfile::tempdir().map_err(|e|e.to_string())?;
    let temp_dir = temp.path();
    let source_frame = temp_dir.join("source.png");

    emit_progress(
        &app,
        "Model Compare",
        format!("Extracting frame at {:.3}s", current_time.max(0.0)),
    );
    create_frame_png(&ffmpeg, &input_path, &source_frame, current_time.max(0.0))
        .map_err(|err| format!("Failed to extract compare frame: {err}"))?;
    if !source_frame.exists() {
        return Err(format!(
            "Compare frame was not created: {}",
            source_frame.display()
        ));
    }
    let original_data_url = image_data_url(&source_frame, "image/png")?;

    let mut previews = Vec::new();
    for model in models {
        emit_progress(&app, "Model Compare", format!("Testing {}", model.name));
        let model_dir = temp_dir.join(&model.name);
        fs::create_dir_all(&model_dir).map_err(|err| err.to_string())?;
        let model_output = model_dir.join("preview.png");
        let mut command = Command::new(&realesrgan);
        command
            .arg("-i")
            .arg(&source_frame)
            .arg("-o")
            .arg(&model_output)
            .arg("-n")
            .arg(realesrgan::model_argument(&model.name))
            .arg("-m").arg(realesrgan::root()?.join("models"))
            .arg("-s")
            .arg(&model.scale)
            .arg("-t")
            .arg(default_if_empty(&tile_size, "0"))
            .arg("-j")
            .arg(default_if_empty(&threads, "1:2:2"))
            .arg("-f")
            .arg("png");
        if let Some(device) = device.as_deref().filter(|value| !value.trim().is_empty()) {
            command.arg("-g").arg(device);
        }

        let output = command
            .current_dir(executable_parent(&realesrgan)?)
            .output()
            .map_err(|err| format!("Failed to run Real-ESRGAN at {}: {err}", realesrgan))?;
        if !output.status.success() {
            emit_progress(
                &app,
                "Model Compare",
                format!(
                    "{} failed: {}",
                    model.name,
                    String::from_utf8_lossy(&output.stderr).trim()
                ),
            );
            continue;
        }

        if !model_output.exists() {
            emit_progress(
                &app,
                "Model Compare",
                format!("{} did not create {}", model.name, model_output.display()),
            );
            continue;
        }

        previews.push(ModelPreview {
            model: model.name,
            scale: model.scale,
            data_url: image_data_url(&model_output, "image/png")?,
        });
    }

    if previews.is_empty() {
        Err("No model previews were generated.".into())
    } else {
        Ok(ModelCompareResult {
            original_data_url,
            previews,
        })
    }
}

#[tauri::command]
async fn update_realesrgan(
    app: tauri::AppHandle,
    selected_models: Option<Vec<String>>,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || update_realesrgan_blocking(app, selected_models))
        .await
        .map_err(|err| format!("Real-ESRGAN update task failed: {err}"))?
}

fn update_realesrgan_blocking(
    app: tauri::AppHandle,
    selected_models: Option<Vec<String>>,
) -> Result<JobResult, String> {
    realesrgan::install(&app, selected_models.as_deref().unwrap_or_default())
}

#[tauri::command]
async fn run_upscale_job(
    app: tauri::AppHandle,
    options: UpscaleOptions,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_upscale_job_blocking(app, options))
        .await
        .map_err(|err| format!("Upscale task failed: {err}"))?
}

fn run_upscale_job_blocking(
    app: tauri::AppHandle,
    options: UpscaleOptions,
) -> Result<JobResult, String> {
    let _guard = realesrgan::lock()?;
    realesrgan::validate_model(&options.model)?;
    if !options.fps.is_finite() || options.fps <= 0.0 || !options.trim_start.is_finite() || !options.trim_end.is_finite() || options.trim_start < 0.0 || options.trim_end <= options.trim_start { return Err("Invalid video timing or selection".into()); }
    CANCEL_UPSCALE.store(false, Ordering::SeqCst);
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let realesrgan = find_tool("realesrgan-ncnn-vulkan").ok_or("Real-ESRGAN was not found.")?;
    let input_path = PathBuf::from(&options.input_path);
    if !input_path.exists() {
        return Err("Input video does not exist.".into());
    }

    let mut output_name = options.output_name.trim().to_string();
    if Path::new(&output_name).extension().is_none() {
        output_name.push_str(".mp4");
    }
    let output_name = safe_output_filename(&output_name, "upscaled.mp4");
    let output_path = output_dir_for(OutputKind::Video)?.join(output_name);
    if output_path.exists() && fs::canonicalize(&output_path).ok() == fs::canonicalize(&input_path).ok() {
        return Err("Choose an output name different from the source video".into());
    }
    let staged_output = tempfile::Builder::new().suffix(".mp4").tempfile_in(output_path.parent().ok_or("Invalid output directory")?).map_err(|e|e.to_string())?;
    let temp = tempfile::tempdir().map_err(|e|e.to_string())?;
    let temp_dir = temp.path();
    let frames_dir = temp_dir.join("frames");
    let upscaled_dir = temp_dir.join("upscaled_frames");
    fs::create_dir_all(&frames_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(&upscaled_dir).map_err(|err| err.to_string())?;

    emit_progress_detail(
        &app,
        "Preparing",
        format!("Temp files: {}", temp_dir.display()),
        Some(2.0),
        Some("Preparing workspace"),
    );
    let mut full_log = String::new();

    let input_pattern = frames_dir.join("frame_%08d.png");
    let mut extract = Command::new(&ffmpeg);
    extract.arg("-hide_banner").arg("-y");
    add_trim_args(&mut extract, options.trim_start, options.trim_end);
    extract.arg("-i").arg(&input_path).arg(&input_pattern);
    run_stage_progress(
        &app,
        "Extract frames",
        &mut extract,
        None,
        None,
        &mut full_log,
        JobProgressRange::new(5.0, 15.0, "Extracting frames"),
    )?;
    let extracted_frames = count_files_with_extension(&frames_dir, "png")?;
    emit_progress_detail(
        &app,
        "Extract frames",
        format!("Prepared {extracted_frames} frames"),
        Some(15.0),
        Some("Extracting frames"),
    );

    if extracted_frames == 0 { return Err("No video frames in the selected range".into()); }
    let scale = realesrgan_model_scale(&options.model);
    let mut upscale = Command::new(&realesrgan);
    upscale
        .arg("-v")
        .arg("-i")
        .arg(&frames_dir)
        .arg("-o")
        .arg(&upscaled_dir)
        .arg("-n")
        .arg(realesrgan::model_argument(&options.model))
        .arg("-m").arg(realesrgan::root()?.join("models"))
        .arg("-s")
        .arg(&scale)
        .arg("-t")
        .arg(default_if_empty(&options.tile_size, "0"))
        .arg("-j")
        .arg(default_if_empty(&options.threads, "1:2:2"))
        .arg("-f")
        .arg("png");
    if let Some(device) = options
        .device
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        upscale.arg("-g").arg(device);
    }
    run_stage_progress(
        &app,
        "Upscale frames",
        &mut upscale,
        Some(executable_parent(&realesrgan)?),
        Some(extracted_frames),
        &mut full_log,
        JobProgressRange::new(15.0, 88.0, "Upscaling frames"),
    )?;

    if count_files_with_extension(&upscaled_dir, "png")? != extracted_frames { return Err("Real-ESRGAN did not produce every selected frame. Try a smaller tile size.".into()); }
    let upscaled_pattern = upscaled_dir.join("frame_%08d.png");
    let mut assemble = Command::new(&ffmpeg);
    assemble
        .arg("-hide_banner")
        .arg("-y")
        .arg("-framerate")
        .arg(options.fps.to_string())
        .arg("-start_number")
        .arg("1")
        .arg("-i")
        .arg(&upscaled_pattern);
    add_trim_args(&mut assemble, options.trim_start, options.trim_end);
    assemble
        .arg("-i")
        .arg(&input_path)
        .args(["-map", "0:v:0", "-map", "1:a?", "-c:v", "libx264", "-crf"])
        .arg(default_if_empty(&options.crf, "18"))
        .arg("-preset")
        .arg(default_if_empty(&options.encoder_preset, "medium"))
        .args(["-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart"])
        .arg(staged_output.path());
    run_stage_progress(
        &app,
        "Reassemble video",
        &mut assemble,
        None,
        None,
        &mut full_log,
        JobProgressRange::new(88.0, 98.0, "Reassembling video"),
    )?;

    if CANCEL_UPSCALE.load(Ordering::SeqCst) { return Err("Upscaling cancelled".into()); }
    staged_output.persist(&output_path).map_err(|e|e.to_string())?;
    emit_progress_detail(
        &app,
        "Done",
        format!("Output: {}", output_path.display()),
        Some(100.0),
        Some("Complete"),
    );
    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: full_log,
    })
}

#[tauri::command]
async fn run_supir_image_job(
    app: tauri::AppHandle,
    options: SupirImageOptions,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_supir_image_job_blocking(app, options))
        .await
        .map_err(|err| format!("SUPIR image task failed: {err}"))?
}

#[cfg(target_os = "linux")]
fn run_supir_image_job_blocking(app: tauri::AppHandle, options: SupirImageOptions) -> Result<JobResult, String> { supir::run_image(app, options) }

#[cfg(not(target_os = "linux"))]
fn run_supir_image_job_blocking(
    app: tauri::AppHandle,
    options: SupirImageOptions,
) -> Result<JobResult, String> {
    CANCEL_UPSCALE.store(false, Ordering::SeqCst);
    let conda = find_tool("conda").ok_or("Conda was not found in PATH.")?;
    if !supir_repo_ready() {
        return Err("SUPIR is not installed. Install it from Image settings first.".into());
    }
    if !conda_named_env_ready(&conda, SUPIR_ENV_NAME) {
        return Err(format!("SUPIR Conda env {SUPIR_ENV_NAME} is not ready."));
    }
    let spec = supir_model_spec(&options.model)
        .ok_or_else(|| format!("Unknown SUPIR model: {}", options.model))?;
    let sdxl_path = supir_sdxl_checkpoint_path();
    let supir_path = supir_checkpoint_dir().join(spec.file_name);
    if !sdxl_path.exists() {
        return Err(format!(
            "SUPIR needs SDXL checkpoint at {}.",
            sdxl_path.display()
        ));
    }
    if !supir_path.exists() {
        return Err(format!(
            "SUPIR model checkpoint is missing: {}",
            supir_path.display()
        ));
    }

    let input_path = PathBuf::from(&options.input_path);
    if !input_path.exists() {
        return Err("Input image does not exist.".into());
    }
    write_supir_runtime_files()?;

    let output_folder = output_dir_for(OutputKind::Image)?;
    let output_name = output_image_name(&options.output_name, &input_path, "supir");
    let output_path = output_folder.join(output_name);

    let temp_dir = PathBuf::from(get_app_settings()?.temp_folder)
        .join("jobs")
        .join(format!("supir_{}", timestamp_id()));
    let input_dir = temp_dir.join("input");
    let result_dir = temp_dir.join("result");
    fs::create_dir_all(&input_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(&result_dir).map_err(|err| err.to_string())?;
    let temp_input = input_dir.join(
        input_path
            .file_name()
            .ok_or("Input image path has no file name.")?,
    );
    fs::copy(&input_path, &temp_input).map_err(|err| err.to_string())?;

    emit_progress_detail(
        &app,
        "SUPIR",
        format!("Temp files: {}", temp_dir.display()),
        Some(5.0),
        Some("Preparing workspace"),
    );
    let mut full_log = String::new();
    let preset = supir_preset(&options.preset);
    let mut command = Command::new(&conda);
    command
        .args([
            "run",
            "--no-capture-output",
            "-n",
            SUPIR_ENV_NAME,
            "python",
            "test.py",
            "--img_dir",
        ])
        .arg(&input_dir)
        .arg("--save_dir")
        .arg(&result_dir)
        .arg("--SUPIR_sign")
        .arg(spec.sign)
        .arg("--upscale")
        .arg(default_if_empty(&options.upscale, "2"))
        .arg("--edm_steps")
        .arg(preset.edm_steps)
        .arg("--s_cfg")
        .arg(preset.s_cfg)
        .arg("--s_stage2")
        .arg(preset.s_stage2)
        .arg("--spt_linear_CFG")
        .arg(preset.spt_linear_cfg)
        .arg("--s_noise")
        .arg(preset.s_noise)
        .arg("--color_fix_type")
        .arg("Wavelet");
    if !options.use_llava {
        command.arg("--no_llava");
    }
    if preset.low_vram {
        command
            .arg("--loading_half_params")
            .arg("--use_tile_vae")
            .arg("--load_8bit_llava");
    }
    if let Some(device) = options
        .device
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        command.env("CUDA_VISIBLE_DEVICES", device);
    }

    run_stage_with_heartbeat(
        &app,
        "SUPIR restore",
        &mut command,
        Some(supir_repo_dir()),
        None,
        &mut full_log,
        Some(Duration::from_secs(15)),
        Some(JobProgressRange::new(10.0, 95.0, "Restoring image")),
    )?;

    let result_path = find_first_file_with_extension(&result_dir, "png")
        .ok_or("SUPIR did not produce a PNG output.")?;
    emit_progress_detail(
        &app,
        "SUPIR",
        "Saving output image.".to_string(),
        Some(98.0),
        Some("Saving output"),
    );
    fs::copy(&result_path, &output_path).map_err(|err| err.to_string())?;
    fs::remove_dir_all(&temp_dir).ok();
    emit_progress_detail(
        &app,
        "SUPIR",
        format!("Output: {}", output_path.display()),
        Some(100.0),
        Some("Complete"),
    );
    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: full_log,
    })
}

#[tauri::command]
async fn run_flux2_image_job(
    app: tauri::AppHandle,
    options: Flux2ImageOptions,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_flux2_image_job_blocking(app, options))
        .await
        .map_err(|err| format!("Flux.2 image task failed: {err}"))?
}

fn run_flux2_image_job_blocking(
    app: tauri::AppHandle,
    options: Flux2ImageOptions,
) -> Result<JobResult, String> {
    CANCEL_UPSCALE.store(false, Ordering::SeqCst);
    let conda = find_tool("conda").ok_or("Conda was not found in PATH.")?;
    if !conda_named_env_ready(&conda, FLUX2_ENV_NAME) {
        return Err(
            "Flux.2 Conda environment is not ready. Install Flux.2 from Image settings first."
                .into(),
        );
    }
    write_flux2_runtime_files()?;

    let prompt = options.prompt.trim();
    if prompt.is_empty() {
        return Err("Flux.2 needs a prompt.".into());
    }
    validate_flux2_dimensions(options.width, options.height)?;
    let reference_paths = validate_flux2_reference_paths(&options.reference_paths)?;
    let steps = options.steps.clamp(1, 50);
    let guidance = options.guidance.clamp(0.0, 20.0);

    let output_folder = output_dir_for(OutputKind::Image)?;
    let output_name = output_image_name(&options.output_name, Path::new("flux2.png"), "flux2");
    let output_path = unique_output_path(&output_folder, &output_name);
    let temp_dir = PathBuf::from(get_app_settings()?.temp_folder)
        .join("jobs")
        .join(format!("flux2_{}", timestamp_id()));
    fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;
    let temp_output = temp_dir.join("flux2.png");

    emit_progress_detail(
        &app,
        "Flux.2",
        format!("Generating {}x{} image.", options.width, options.height),
        Some(5.0),
        Some("Preparing Flux.2"),
    );
    let mut command = Command::new(&conda);
    command
        .args(["run", "--no-capture-output", "-n", FLUX2_ENV_NAME, "python"])
        .arg(flux2_runner_script_path())
        .arg("--prompt")
        .arg(prompt)
        .arg("--output")
        .arg(&temp_output)
        .arg("--width")
        .arg(options.width.to_string())
        .arg("--height")
        .arg(options.height.to_string())
        .arg("--steps")
        .arg(steps.to_string())
        .arg("--guidance")
        .arg(format!("{guidance:.3}"))
        .arg("--seed")
        .arg(options.seed.trim())
        .arg("--model")
        .arg(FLUX2_MODEL_ID);
    for reference_path in reference_paths {
        command.arg("--reference").arg(reference_path);
    }
    if options.cpu_offload {
        command.arg("--cpu-offload");
    }
    if let Some(device) = options
        .device
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        command.env("CUDA_VISIBLE_DEVICES", device);
    }
    add_flux2_cache_env(&mut command);
    let settings = get_app_settings()?;
    let mut runtime_paths = Vec::new();
    push_existing_runtime_path(&mut runtime_paths, &settings.cuda_bin_folder);
    push_existing_runtime_path(&mut runtime_paths, &settings.cudnn_bin_folder);
    prepend_paths_env(&mut command, &runtime_paths);

    let mut full_log = String::new();
    run_stage_with_heartbeat(
        &app,
        "Flux.2",
        &mut command,
        Some(flux2_tool_dir()),
        None,
        &mut full_log,
        Some(Duration::from_secs(15)),
        Some(JobProgressRange::new(10.0, 95.0, "Generating image")),
    )?;

    if !temp_output.exists() {
        return Err("Flux.2 did not produce an output image.".into());
    }
    emit_progress_detail(
        &app,
        "Flux.2",
        "Saving output image.".to_string(),
        Some(98.0),
        Some("Saving output"),
    );
    fs::copy(&temp_output, &output_path).map_err(|err| err.to_string())?;
    fs::remove_dir_all(&temp_dir).ok();
    emit_progress_detail(
        &app,
        "Flux.2",
        format!("Output: {}", output_path.display()),
        Some(100.0),
        Some("Complete"),
    );
    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: full_log,
    })
}

#[tauri::command]
async fn run_wan21_video_job(
    app: tauri::AppHandle,
    options: Wan21VideoOptions,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_wan21_video_job_blocking(app, options))
        .await
        .map_err(|err| format!("Wan2.1 video task failed: {err}"))?
}

fn run_wan21_video_job_blocking(
    app: tauri::AppHandle,
    options: Wan21VideoOptions,
) -> Result<JobResult, String> {
    CANCEL_UPSCALE.store(false, Ordering::SeqCst);
    let conda = find_tool("conda").ok_or("Conda was not found in PATH.")?;
    if !conda_named_env_ready(&conda, WAN21_ENV_NAME) {
        return Err(
            "Wan2.1 Conda environment is not ready. Install Wan2.1 from Video settings first."
                .into(),
        );
    }
    if !wan21_repo_ready() {
        return Err(
            "Wan2.1 repo is not installed. Install Wan2.1 from Video settings first.".into(),
        );
    }
    if !wan21_model_ready() {
        return Err(
            "Wan2.1 T2V-1.3B model is not installed. Install Wan2.1 from Video settings first."
                .into(),
        );
    }
    write_wan21_runtime_files()?;
    let status = wan21_status();
    if !status.runtime_ready {
        return Err(
            "Wan2.1 needs to finish setup before generation. Open Video settings and run Repair / Update Wan2.1."
                .into(),
        );
    }

    let prompt = options.prompt.trim();
    if prompt.is_empty() {
        return Err("Wan2.1 needs a prompt.".into());
    }
    let size = validate_wan21_size(&options.size, &options.orientation)?;
    let frame_count = validate_wan21_frame_count(options.frame_count)?;
    let steps = options.steps.clamp(1, 50);
    let guidance = options.guidance.clamp(0.0, 20.0);

    let output_folder = output_dir_for(OutputKind::Video)?;
    let output_name = output_video_name(&options.output_name, "wan21_generate.mp4");
    let output_path = unique_output_path(&output_folder, &output_name);
    let temp_dir = PathBuf::from(get_app_settings()?.temp_folder)
        .join("jobs")
        .join(format!("wan21_{}", timestamp_id()));
    fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;
    let temp_output = temp_dir.join("wan21.mp4");

    emit_progress_detail(
        &app,
        "Wan2.1",
        format!("Generating {size} video with {frame_count} frames."),
        Some(5.0),
        Some("Preparing Wan2.1"),
    );
    let mut command = Command::new(&conda);
    command
        .args(["run", "--no-capture-output", "-n", WAN21_ENV_NAME, "python"])
        .arg(wan21_runner_script_path())
        .arg("--repo")
        .arg(wan21_repo_dir())
        .arg("--ckpt-dir")
        .arg(wan21_model_dir())
        .arg("--prompt")
        .arg(prompt)
        .arg("--output")
        .arg(&temp_output)
        .arg("--size")
        .arg(size)
        .arg("--frame-num")
        .arg(frame_count.to_string())
        .arg("--steps")
        .arg(steps.to_string())
        .arg("--guidance")
        .arg(format!("{guidance:.3}"))
        .arg("--seed")
        .arg(options.seed.trim());
    if options.offload_model {
        command.arg("--offload-model");
    }
    if options.t5_cpu {
        command.arg("--t5-cpu");
    }
    if let Some(device) = options
        .device
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        command.env("CUDA_VISIBLE_DEVICES", device);
    }
    add_wan21_cache_env(&mut command);
    let settings = get_app_settings()?;
    let mut runtime_paths = Vec::new();
    push_existing_runtime_path(&mut runtime_paths, &settings.cuda_bin_folder);
    push_existing_runtime_path(&mut runtime_paths, &settings.cudnn_bin_folder);
    prepend_paths_env(&mut command, &runtime_paths);

    let mut full_log = String::new();
    run_stage_with_heartbeat(
        &app,
        "Wan2.1",
        &mut command,
        Some(wan21_tool_dir()),
        None,
        &mut full_log,
        Some(Duration::from_secs(20)),
        Some(JobProgressRange::new(10.0, 95.0, "Generating video")),
    )?;

    if !temp_output.exists() {
        return Err("Wan2.1 did not produce an output video.".into());
    }
    emit_progress_detail(
        &app,
        "Wan2.1",
        "Saving output video.".to_string(),
        Some(98.0),
        Some("Saving output"),
    );
    fs::copy(&temp_output, &output_path).map_err(|err| err.to_string())?;
    fs::remove_dir_all(&temp_dir).ok();
    emit_progress_detail(
        &app,
        "Wan2.1",
        format!("Output: {}", output_path.display()),
        Some(100.0),
        Some("Complete"),
    );
    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: full_log,
    })
}

#[tauri::command]
async fn run_wan22_video_job(
    app: tauri::AppHandle,
    options: Wan22VideoOptions,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_wan22_video_job_blocking(app, options))
        .await
        .map_err(|err| format!("Wan2.2 video task failed: {err}"))?
}

fn run_wan22_video_job_blocking(
    app: tauri::AppHandle,
    options: Wan22VideoOptions,
) -> Result<JobResult, String> {
    CANCEL_UPSCALE.store(false, Ordering::SeqCst);
    let conda = find_tool("conda").ok_or("Conda was not found in PATH.")?;
    if !conda_named_env_ready(&conda, WAN22_ENV_NAME) {
        return Err(
            "Wan2.2 Conda environment is not ready. Install Wan2.2 from Video settings first."
                .into(),
        );
    }
    if !wan22_repo_ready() {
        return Err(
            "Wan2.2 repo is not installed. Install Wan2.2 from Video settings first.".into(),
        );
    }
    if !wan22_model_ready() {
        return Err(
            "Wan2.2 TI2V-5B model is not installed. Install Wan2.2 from Video settings first."
                .into(),
        );
    }
    write_wan22_runtime_files()?;
    let status = wan22_status();
    if !status.runtime_ready {
        return Err(
            "Wan2.2 needs to finish setup before generation. Open Video settings and run Install / Update Wan2.2."
                .into(),
        );
    }

    let prompt = options.prompt.trim();
    if prompt.is_empty() {
        return Err("Wan2.2 needs a prompt.".into());
    }
    let size = validate_wan22_size(&options.size, &options.orientation)?;
    let frame_count = validate_wan22_frame_count(options.frame_count)?;
    let steps = options.steps.clamp(1, 80);
    let guidance = options.guidance.clamp(0.0, 20.0);
    let image_path = validate_wan22_image_path(options.image_path.as_deref())?;

    let output_folder = output_dir_for(OutputKind::Video)?;
    let output_name = output_video_name(&options.output_name, "wan22_generate.mp4");
    let output_path = unique_output_path(&output_folder, &output_name);
    let temp_dir = PathBuf::from(get_app_settings()?.temp_folder)
        .join("jobs")
        .join(format!("wan22_{}", timestamp_id()));
    fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;
    let temp_output = temp_dir.join("wan22.mp4");

    emit_progress_detail(
        &app,
        "Wan2.2",
        format!("Generating {size} video with {frame_count} frames."),
        Some(5.0),
        Some("Preparing Wan2.2"),
    );
    let mut command = Command::new(&conda);
    command
        .args(["run", "--no-capture-output", "-n", WAN22_ENV_NAME, "python"])
        .arg(wan22_runner_script_path())
        .arg("--repo")
        .arg(wan22_repo_dir())
        .arg("--ckpt-dir")
        .arg(wan22_model_dir())
        .arg("--prompt")
        .arg(prompt)
        .arg("--output")
        .arg(&temp_output)
        .arg("--size")
        .arg(size)
        .arg("--frame-num")
        .arg(frame_count.to_string())
        .arg("--steps")
        .arg(steps.to_string())
        .arg("--guidance")
        .arg(format!("{guidance:.3}"))
        .arg("--seed")
        .arg(options.seed.trim());
    if let Some(image_path) = image_path {
        command.arg("--image").arg(image_path);
    }
    if options.offload_model {
        command.arg("--offload-model");
    }
    if options.convert_model_dtype {
        command.arg("--convert-model-dtype");
    }
    if options.t5_cpu {
        command.arg("--t5-cpu");
    }
    if let Some(device) = options
        .device
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        command.env("CUDA_VISIBLE_DEVICES", device);
    }
    add_wan22_cache_env(&mut command);
    let settings = get_app_settings()?;
    let mut runtime_paths = Vec::new();
    push_existing_runtime_path(&mut runtime_paths, &settings.cuda_bin_folder);
    push_existing_runtime_path(&mut runtime_paths, &settings.cudnn_bin_folder);
    prepend_paths_env(&mut command, &runtime_paths);

    let mut full_log = String::new();
    run_stage_with_heartbeat(
        &app,
        "Wan2.2",
        &mut command,
        Some(wan22_tool_dir()),
        None,
        &mut full_log,
        Some(Duration::from_secs(20)),
        Some(JobProgressRange::new(10.0, 95.0, "Generating video")),
    )?;

    if !temp_output.exists() {
        return Err("Wan2.2 did not produce an output video.".into());
    }
    emit_progress_detail(
        &app,
        "Wan2.2",
        "Saving output video.".to_string(),
        Some(98.0),
        Some("Saving output"),
    );
    fs::copy(&temp_output, &output_path).map_err(|err| err.to_string())?;
    fs::remove_dir_all(&temp_dir).ok();
    emit_progress_detail(
        &app,
        "Wan2.2",
        format!("Output: {}", output_path.display()),
        Some(100.0),
        Some("Complete"),
    );
    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: full_log,
    })
}

#[tauri::command]
async fn run_rife_job(app: tauri::AppHandle, options: RifeOptions) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_rife_job_blocking(app, options))
        .await
        .map_err(|err| format!("RIFE task failed: {err}"))?
}

fn run_rife_job_blocking(app: tauri::AppHandle, options: RifeOptions) -> Result<JobResult, String> {
    CANCEL_UPSCALE.store(false, Ordering::SeqCst);
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let rife = find_tool("rife-ncnn-vulkan").ok_or("RIFE was not found.")?;
    let input_path = PathBuf::from(&options.input_path);
    if !input_path.exists() {
        return Err("Input video does not exist.".into());
    }

    let mut output_name = options.output_name.trim().to_string();
    if Path::new(&output_name).extension().is_none() {
        output_name.push_str(".mp4");
    }
    let output_name = safe_output_filename(&output_name, "rife.mp4");
    let output_path = output_dir_for(OutputKind::Video)?.join(output_name);
    let temp_dir = workspace_root()
        .join("temp")
        .join("jobs")
        .join(format!("tauri_rife_{}", timestamp_id()));
    let frames_dir = temp_dir.join("frames");
    fs::create_dir_all(&frames_dir).map_err(|err| err.to_string())?;

    emit_progress_detail(
        &app,
        "Preparing",
        format!("Temp files: {}", temp_dir.display()),
        Some(2.0),
        Some("Preparing workspace"),
    );
    let mut full_log = String::new();

    let input_pattern = frames_dir.join("frame_%08d.png");
    let mut extract = Command::new(&ffmpeg);
    extract.arg("-hide_banner").arg("-y");
    add_trim_args(&mut extract, options.trim_start, options.trim_end);
    extract.arg("-i").arg(&input_path).arg(&input_pattern);
    run_stage_progress(
        &app,
        "Extract frames",
        &mut extract,
        None,
        None,
        &mut full_log,
        JobProgressRange::new(5.0, 15.0, "Extracting frames"),
    )?;
    let extracted_frames = count_files_with_extension(&frames_dir, "png")?;
    if extracted_frames < 2 {
        return Err("RIFE needs at least two frames to interpolate.".into());
    }
    emit_progress_detail(
        &app,
        "Extract frames",
        format!("Prepared {extracted_frames} frames"),
        Some(15.0),
        Some("Extracting frames"),
    );

    let multiplier = options.multiplier.clamp(2, 8);
    let passes = multiplier.ilog2().max(1);
    let model_path = rife_model_path(&rife, &options.model)?;
    let mut source_dir = frames_dir.clone();
    let mut source_count = extracted_frames;

    for pass in 1..=passes {
        let pass_dir = temp_dir.join(format!("interpolated_pass_{pass}"));
        fs::create_dir_all(&pass_dir).map_err(|err| err.to_string())?;
        let target_frames = source_count.saturating_mul(2);
        let mut interpolate = Command::new(&rife);
        interpolate
            .arg("-i")
            .arg(&source_dir)
            .arg("-o")
            .arg(&pass_dir)
            .arg("-m")
            .arg(&model_path)
            .arg("-j")
            .arg(default_if_empty(&options.threads, "1:2:2"))
            .arg("-f")
            .arg("%08d.png");
        if let Some(device) = options
            .device
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            interpolate.arg("-g").arg(device);
        }
        if options.tta_spatial {
            interpolate.arg("-x");
        }
        if options.tta_temporal {
            interpolate.arg("-z");
        }
        if options.uhd {
            interpolate.arg("-u");
        }
        let pass_start = 15.0 + (75.0 * (pass - 1) as f64 / passes as f64);
        let pass_end = 15.0 + (75.0 * pass as f64 / passes as f64);
        run_stage_progress(
            &app,
            &format!("Interpolate frames {pass}/{passes}"),
            &mut interpolate,
            Some(executable_parent(&rife)?),
            Some(target_frames),
            &mut full_log,
            JobProgressRange::new(pass_start, pass_end, "Interpolating frames"),
        )?;
        source_dir = pass_dir;
        source_count = count_files_with_extension(&source_dir, "png")?;
        emit_progress_detail(
            &app,
            "Interpolate frames",
            format!("Pass {pass}/{passes} produced {source_count} frames"),
            Some(pass_end),
            Some("Interpolating frames"),
        );
    }

    let interpolated_pattern = source_dir.join("%08d.png");
    let mut assemble = Command::new(&ffmpeg);
    assemble
        .arg("-hide_banner")
        .arg("-y")
        .arg("-framerate")
        .arg(format!("{:.3}", (options.fps * multiplier as f64).max(1.0)))
        .arg("-i")
        .arg(&interpolated_pattern);
    add_trim_args(&mut assemble, options.trim_start, options.trim_end);
    assemble
        .arg("-i")
        .arg(&input_path)
        .args(["-map", "0:v:0", "-map", "1:a?", "-c:v", "libx264", "-crf"])
        .arg(default_if_empty(&options.crf, "18"))
        .arg("-preset")
        .arg(default_if_empty(&options.encoder_preset, "medium"))
        .args(["-pix_fmt", "yuv420p", "-c:a", "copy", "-shortest"])
        .arg(&output_path);
    run_stage_progress(
        &app,
        "Reassemble video",
        &mut assemble,
        None,
        None,
        &mut full_log,
        JobProgressRange::new(90.0, 98.0, "Reassembling video"),
    )?;

    if output_path.exists() {
        fs::remove_dir_all(&temp_dir).ok();
    }
    emit_progress_detail(
        &app,
        "Done",
        format!("Output: {}", output_path.display()),
        Some(100.0),
        Some("Complete"),
    );
    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: full_log,
    })
}

#[tauri::command]
async fn run_facefusion_job(
    app: tauri::AppHandle,
    options: FaceFusionOptions,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_facefusion_job_blocking(app, options))
        .await
        .map_err(|err| format!("FaceFusion task failed: {err}"))?
}

fn run_facefusion_job_blocking(
    app: tauri::AppHandle,
    options: FaceFusionOptions,
) -> Result<JobResult, String> {
    CANCEL_UPSCALE.store(false, Ordering::SeqCst);
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let conda = find_tool("conda").ok_or("Conda was not found in PATH.")?;
    let settings = get_app_settings()?;
    let repo_dir = facefusion_repo_dir();
    if !repo_dir.join("facefusion.py").exists() {
        return Err("FaceFusion is not installed. Install it from Video settings first.".into());
    }
    if !conda_env_ready(&conda) {
        return Err(
            "FaceFusion Conda environment is not ready. Run FaceFusion install/update first."
                .into(),
        );
    }

    let input_path = PathBuf::from(&options.input_path);
    let source_path = PathBuf::from(&options.source_path);
    if !input_path.exists() {
        return Err("Target video does not exist.".into());
    }
    if !source_path.exists() {
        return Err("Source face image does not exist.".into());
    }

    let mut output_name = options.output_name.trim().to_string();
    if Path::new(&output_name).extension().is_none() {
        output_name.push_str(".mp4");
    }
    let output_name = safe_output_filename(&output_name, "facefusion.mp4");
    let output_path = output_dir_for(OutputKind::Video)?.join(output_name);
    if output_path.exists() {
        fs::remove_file(&output_path).map_err(|err| err.to_string())?;
    }

    let temp_dir = workspace_root()
        .join("temp")
        .join("jobs")
        .join("facefusion")
        .join(timestamp_id());
    fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;
    let target_path = if options.trim_end > options.trim_start + 0.05 {
        let trimmed_target = temp_dir.join("target_trim.mp4");
        let mut trim = Command::new(&ffmpeg);
        trim.arg("-hide_banner").arg("-y");
        add_trim_args(&mut trim, options.trim_start, options.trim_end);
        trim.arg("-i")
            .arg(&input_path)
            .args(["-c:v", "libx264", "-crf", "18", "-preset", "fast"])
            .args(["-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k"])
            .arg(&trimmed_target);
        let mut full_log = String::new();
        run_stage_progress(
            &app,
            "FaceFusion trim",
            &mut trim,
            None,
            None,
            &mut full_log,
            JobProgressRange::new(5.0, 20.0, "Preparing target"),
        )?;
        trimmed_target
    } else {
        input_path.clone()
    };

    let processors = facefusion_processors(&options.processor_preset);
    let provider = facefusion_provider(&options.execution_provider);
    let mut full_log = String::new();
    emit_progress_detail(
        &app,
        "FaceFusion",
        format!("Running {} with {provider}.", options.processor_preset),
        Some(if target_path == input_path {
            10.0
        } else {
            20.0
        }),
        Some("Running FaceFusion"),
    );

    let mut runtime_paths = Vec::new();
    if let Some(ffmpeg_dir) = PathBuf::from(&ffmpeg).parent() {
        runtime_paths.push(ffmpeg_dir.to_path_buf());
    }
    if provider == "cuda" {
        push_existing_runtime_path(&mut runtime_paths, &settings.cuda_bin_folder);
        push_existing_runtime_path(&mut runtime_paths, &settings.cudnn_bin_folder);
    }
    let launcher_path = if provider == "cuda" {
        write_facefusion_launcher(&temp_dir, &repo_dir, &runtime_paths)?
    } else {
        repo_dir.join("facefusion.py")
    };

    let mut command = Command::new(&conda);
    command
        .args([
            "run",
            "--no-capture-output",
            "-n",
            FACEFUSION_ENV_NAME,
            "python",
        ])
        .arg(&launcher_path)
        .arg("headless-run")
        .arg("--source-paths")
        .arg(&source_path)
        .arg("--target-path")
        .arg(&target_path)
        .arg("--output-path")
        .arg(&output_path)
        .arg("--execution-providers")
        .arg(provider);
    if !processors.is_empty() {
        command.arg("--processors");
        for processor in processors {
            command.arg(processor);
        }
    }
    prepend_paths_env(&mut command, &runtime_paths);
    run_stage_progress(
        &app,
        "FaceFusion",
        &mut command,
        Some(repo_dir),
        None,
        &mut full_log,
        JobProgressRange::new(
            if target_path == input_path {
                10.0
            } else {
                20.0
            },
            95.0,
            "Running FaceFusion",
        ),
    )?;

    if output_path.exists() {
        fs::remove_dir_all(&temp_dir).ok();
    }
    emit_progress_detail(
        &app,
        "FaceFusion",
        format!("Output: {}", output_path.display()),
        Some(100.0),
        Some("Complete"),
    );
    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: full_log,
    })
}

fn emit_progress(app: &tauri::AppHandle, stage: &str, message: String) {
    emit_progress_value(app, stage, message, None);
}

fn emit_progress_value(
    app: &tauri::AppHandle,
    stage: &str,
    message: String,
    progress: Option<f64>,
) {
    emit_progress_detail(app, stage, message, progress, None);
}

fn emit_progress_detail(
    app: &tauri::AppHandle,
    stage: &str,
    message: String,
    progress: Option<f64>,
    step: Option<&str>,
) {
    let _ = app.emit(
        "upscale-progress",
        ProgressEvent {
            stage: stage.to_string(),
            message,
            progress: progress.map(|value| value.clamp(0.0, 100.0)),
            step: step.map(str::to_string),
        },
    );
}

#[derive(Clone, Copy)]
struct JobProgressRange {
    start: f64,
    end: f64,
    step: &'static str,
}

impl JobProgressRange {
    fn new(start: f64, end: f64, step: &'static str) -> Self {
        Self { start, end, step }
    }
}

#[derive(Clone, Copy)]
struct StageHeartbeatOptions {
    interval: Option<Duration>,
    no_output_timeout: Option<Duration>,
    include_gpu_status: bool,
    heartbeat_message: &'static str,
    timeout_message: &'static str,
}

impl StageHeartbeatOptions {
    fn standard(interval: Option<Duration>) -> Self {
        Self {
            interval,
            no_output_timeout: None,
            include_gpu_status: true,
            heartbeat_message: "Still running",
            timeout_message: "Command produced no output for too long.",
        }
    }
}

fn run_stage(
    app: &tauri::AppHandle,
    stage: &str,
    command: &mut Command,
    current_dir: Option<PathBuf>,
    frame_total: Option<usize>,
    full_log: &mut String,
) -> Result<(), String> {
    run_stage_with_heartbeat(
        app,
        stage,
        command,
        current_dir,
        frame_total,
        full_log,
        None,
        None,
    )
}

fn run_stage_progress(
    app: &tauri::AppHandle,
    stage: &str,
    command: &mut Command,
    current_dir: Option<PathBuf>,
    frame_total: Option<usize>,
    full_log: &mut String,
    progress: JobProgressRange,
) -> Result<(), String> {
    run_stage_with_heartbeat(
        app,
        stage,
        command,
        current_dir,
        frame_total,
        full_log,
        None,
        Some(progress),
    )
}

fn run_stage_with_heartbeat(
    app: &tauri::AppHandle,
    stage: &str,
    command: &mut Command,
    current_dir: Option<PathBuf>,
    frame_total: Option<usize>,
    full_log: &mut String,
    heartbeat_interval: Option<Duration>,
    progress_range: Option<JobProgressRange>,
) -> Result<(), String> {
    run_stage_with_heartbeat_options(
        app,
        stage,
        command,
        current_dir,
        frame_total,
        full_log,
        StageHeartbeatOptions::standard(heartbeat_interval),
        progress_range,
    )
}

fn run_stage_with_heartbeat_options(
    app: &tauri::AppHandle,
    stage: &str,
    command: &mut Command,
    current_dir: Option<PathBuf>,
    frame_total: Option<usize>,
    full_log: &mut String,
    heartbeat: StageHeartbeatOptions,
    progress_range: Option<JobProgressRange>,
) -> Result<(), String> {
    shared_runtime::configure(&workspace_root(), command)?;
    if let Some(dir) = current_dir {
        command.current_dir(dir);
    }

    if let Some(range) = progress_range {
        emit_progress_detail(
            app,
            stage,
            "Started".to_string(),
            Some(range.start),
            Some(range.step),
        );
    } else {
        emit_progress(app, stage, "Started".to_string());
    }
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|err| format!("{stage} failed to start: {err}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let (sender, receiver) = mpsc::channel::<String>();
    let mut frame_progress = if stage == "Upscale frames" {
        frame_total.map(upscale_progress::UpscaleFrameProgress::new)
    } else {
        None
    };

    if let Some(stream) = stdout {
        stream_lines(stream, sender.clone());
    }
    if let Some(stream) = stderr {
        stream_lines(stream, sender.clone());
    }
    drop(sender);

    let started_at = Instant::now();
    let mut last_heartbeat = Instant::now();
    let mut last_output_at = Instant::now();
    loop {
        while let Ok(line) = receiver.try_recv() {
            if !line.trim().is_empty() {
                last_output_at = Instant::now();
                report_stage_output(
                    app, stage, &line, full_log, progress_range, &mut frame_progress,
                );
            }
        }

        if CANCEL_UPSCALE.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            emit_progress_detail(
                app,
                stage,
                "Cancelled".to_string(),
                Some(0.0),
                Some("Cancelled"),
            );
            return Err("Job cancelled.".into());
        }

        if let Some(timeout) = heartbeat.no_output_timeout {
            if last_output_at.elapsed() >= timeout {
                let _ = child.kill();
                let _ = child.wait();
                let elapsed = started_at.elapsed().as_secs();
                let quiet = last_output_at.elapsed().as_secs();
                let message = format!(
                    "{} ({elapsed}s elapsed, {quiet}s since last output).",
                    heartbeat.timeout_message
                );
                full_log.push_str(&message);
                full_log.push('\n');
                emit_progress_detail(
                    app,
                    stage,
                    message.clone(),
                    None,
                    progress_range.map(|range| range.step),
                );
                return Err(message);
            }
        }

        if let Some(status) = child
            .try_wait()
            .map_err(|err| format!("{stage} failed while running: {err}"))?
        {
            // Wait for both pipe readers to finish so the last saved frames are reported.
            loop {
                let line = if frame_progress.is_some() {
                    receiver.recv().ok()
                } else {
                    receiver.try_recv().ok()
                };
                let Some(line) = line else { break };
                if !line.trim().is_empty() {
                    report_stage_output(
                        app, stage, &line, full_log, progress_range, &mut frame_progress,
                    );
                }
            }

            if status.success() {
                if let Some(range) = progress_range {
                    emit_progress_detail(
                        app,
                        stage,
                        "Finished".to_string(),
                        Some(range.end),
                        Some(range.step),
                    );
                } else {
                    emit_progress(app, stage, "Finished".to_string());
                }
                return Ok(());
            }

            return Err(format!(
                "{stage} failed with exit code {}.",
                status
                    .code()
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "unknown".to_string())
            ));
        }

        if let Some(interval) = heartbeat.interval {
            if last_heartbeat.elapsed() >= interval {
                let elapsed = started_at.elapsed().as_secs();
                let quiet = last_output_at.elapsed().as_secs();
                let gpu_status = if heartbeat.include_gpu_status {
                    gpu_heartbeat_status()
                        .map(|status| format!(" {status}"))
                        .unwrap_or_default()
                } else {
                    String::new()
                };
                emit_progress_detail(
                    app,
                    stage,
                    format!(
                        "{} ({elapsed}s elapsed, {quiet}s since last output).{gpu_status}",
                        heartbeat.heartbeat_message
                    ),
                    None,
                    progress_range.map(|range| range.step),
                );
                last_heartbeat = Instant::now();
            }
        }

        thread::sleep(Duration::from_millis(120));
    }
}

fn report_stage_output(
    app: &tauri::AppHandle,
    stage: &str,
    line: &str,
    full_log: &mut String,
    range: Option<JobProgressRange>,
    frames: &mut Option<upscale_progress::UpscaleFrameProgress>,
) {
    let (message, fraction) = if let Some(frames) = frames {
        let Some(update) = frames.update(line) else { return };
        update
    } else {
        (line.to_string(), None)
    };
    full_log.push_str(&message);
    full_log.push('\n');
    let progress = fraction
        .zip(range)
        .map(|(fraction, range)| range.start + fraction * (range.end - range.start));
    emit_progress_detail(app, stage, message, progress, range.map(|range| range.step));
}

fn stream_lines<R: Read + Send + 'static>(stream: R, sender: mpsc::Sender<String>) {
    thread::spawn(move || {
        let mut reader = BufReader::new(stream);
        let mut buffer = Vec::new();
        let mut byte = [0_u8; 1];
        let mut last_carriage_emit = Instant::now();
        let mut pending_carriage_return = false;
        loop {
            match reader.read(&mut byte) {
                Ok(0) => {
                    send_stream_buffer(&sender, &mut buffer);
                    break;
                }
                Ok(_) => {
                    // CRLF is a complete line, not an in-place progress update.
                    if pending_carriage_return && byte[0] != b'\n' {
                        if last_carriage_emit.elapsed() >= Duration::from_secs(2) {
                            send_stream_buffer(&sender, &mut buffer);
                            last_carriage_emit = Instant::now();
                        } else {
                            buffer.clear();
                        }
                    }
                    pending_carriage_return = byte[0] == b'\r';
                    match byte[0] {
                        b'\n' => send_stream_buffer(&sender, &mut buffer),
                        value if value.is_ascii_control() => {}
                        value => buffer.push(value),
                    }
                }
                Err(_) => {
                    send_stream_buffer(&sender, &mut buffer);
                    break;
                }
            }
        }
    });
}

fn send_stream_buffer(sender: &mpsc::Sender<String>, buffer: &mut Vec<u8>) {
    if buffer.is_empty() {
        return;
    }
    let line = String::from_utf8_lossy(buffer).trim().to_string();
    buffer.clear();
    if !line.is_empty() {
        let _ = sender.send(line);
    }
}

#[cfg(test)]
mod stream_tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn preserves_windows_crlf_frame_completions_and_final_partial_line() {
        let (sender, receiver) = mpsc::channel();
        stream_lines(Cursor::new(b"25.00%\r\nin.png -> frame_00000001.png done\r\nlast line"), sender);
        let lines: Vec<_> = receiver.iter().collect();
        assert_eq!(lines, ["25.00%", "in.png -> frame_00000001.png done", "last line"]);
    }

    #[test]
    fn throttles_carriage_return_updates_without_losing_the_following_line() {
        let (sender, receiver) = mpsc::channel();
        stream_lines(Cursor::new(b"10%\r20%\rFinished\n"), sender);
        assert_eq!(receiver.iter().collect::<Vec<_>>(), ["Finished"]);
    }
}

fn gpu_heartbeat_status() -> Option<String> {
    let nvidia_smi = find_tool("nvidia-smi").unwrap_or_else(|| "nvidia-smi".to_string());
    let output = Command::new(nvidia_smi)
        .args([
            "--query-gpu=index,name,utilization.gpu,memory.used,memory.total",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut parts = Vec::new();
    for line in stdout.lines().filter(|line| !line.trim().is_empty()) {
        let columns = line
            .split(',')
            .map(|column| column.trim())
            .collect::<Vec<_>>();
        if columns.len() < 5 {
            continue;
        }
        parts.push(format!(
            "GPU {} {}: {}% util, {}/{} MiB VRAM",
            columns[0], columns[1], columns[2], columns[3], columns[4]
        ));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("; "))
    }
}

fn install_github_release_tool(
    app: &tauri::AppHandle,
    stage: &str,
    repo: &str,
    managed_name: &str,
    executable_name: &str,
    asset_terms: &[&str],
) -> Result<(), String> {
    let root = workspace_root();
    let tools_dir = root.join("tools");
    let temp_dir = root.join("temp").join("tool_downloads");
    fs::create_dir_all(&tools_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;

    emit_progress(app, stage, format!("Checking {repo} releases..."));
    let asset = latest_github_asset(repo, asset_terms)?;
    let zip_path = temp_dir.join(&asset.name);

    emit_progress(app, stage, format!("Downloading {}...", asset.name));
    download_with_progress(app, stage, &asset.url, &zip_path)?;

    let extract_dir =
        root.join("temp")
            .join(format!("tool_extract_{}_{}", managed_name, timestamp_id()));
    if extract_dir.exists() {
        fs::remove_dir_all(&extract_dir).map_err(|err| err.to_string())?;
    }
    fs::create_dir_all(&extract_dir).map_err(|err| err.to_string())?;

    emit_progress(app, stage, "Extracting package...".to_string());
    unzip_archive(&zip_path, &extract_dir)?;
    let executable = find_file_by_name(&extract_dir, executable_name)
        .ok_or_else(|| format!("Downloaded package did not contain {executable_name}."))?;
    let package_dir = executable_parent(&executable)?;
    let staged_dir =
        root.join("temp")
            .join(format!("tool_stage_{}_{}", managed_name, timestamp_id()));
    if staged_dir.exists() {
        fs::remove_dir_all(&staged_dir).map_err(|err| err.to_string())?;
    }
    copy_dir_all(&package_dir, &staged_dir)?;

    let managed_dir = tools_dir.join(managed_name);
    let backup_dir =
        root.join("temp")
            .join(format!("tool_backup_{}_{}", managed_name, timestamp_id()));
    if managed_dir.exists() {
        fs::rename(&managed_dir, &backup_dir).map_err(|err| err.to_string())?;
    }

    match fs::rename(&staged_dir, &managed_dir) {
        Ok(()) => {
            if backup_dir.exists() {
                fs::remove_dir_all(&backup_dir).ok();
            }
            fs::remove_dir_all(&extract_dir).ok();
            emit_progress(app, stage, format!("Installed {}.", asset.name));
            Ok(())
        }
        Err(error) => {
            if backup_dir.exists() && !managed_dir.exists() {
                let _ = fs::rename(&backup_dir, &managed_dir);
            }
            Err(format!("Failed to activate {managed_name}: {error}"))
        }
    }
}

struct ReleaseAsset {
    name: String,
    url: String,
}

struct ImageCodecToolSpec {
    key: &'static str,
    label: &'static str,
    repo: &'static str,
    asset_terms: &'static [&'static str],
    asset_extension: &'static str,
    direct_asset_url: Option<&'static str>,
    required_executables: &'static [&'static str],
    validation_arg: &'static str,
}

fn image_codec_tool_spec(tool: &str) -> Option<ImageCodecToolSpec> {
    match tool.trim().to_lowercase().as_str() {
        "oxipng" => Some(ImageCodecToolSpec {
            key: "oxipng",
            label: "OxiPNG",
            repo: "oxipng/oxipng",
            asset_terms: &["x86_64", "windows", "msvc"],
            asset_extension: ".zip",
            direct_asset_url: None,
            required_executables: &["oxipng.exe"],
            validation_arg: "--version",
        }),
        "libavif" => Some(ImageCodecToolSpec {
            key: "libavif",
            label: "libavif",
            repo: "AOMediaCodec/libavif",
            asset_terms: &["windows"],
            asset_extension: ".zip",
            direct_asset_url: None,
            required_executables: &["avifenc.exe", "avifdec.exe"],
            validation_arg: "--version",
        }),
        "libwebp" => Some(ImageCodecToolSpec {
            key: "libwebp",
            label: "libwebp",
            repo: "Google WebP precompiled utilities",
            asset_terms: &[],
            asset_extension: ".zip",
            direct_asset_url: Some("https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-1.6.0-windows-x64.zip"),
            required_executables: &["cwebp.exe", "dwebp.exe"],
            validation_arg: "-version",
        }),
        "mozjpeg" => Some(ImageCodecToolSpec {
            key: "mozjpeg",
            label: "MozJPEG",
            repo: "mozilla/mozjpeg",
            asset_terms: &["win", "x64"],
            asset_extension: ".zip",
            direct_asset_url: None,
            required_executables: &["cjpeg.exe", "jpegtran.exe"],
            validation_arg: "-version",
        }),
        "imagemagick" => Some(ImageCodecToolSpec {
            key: "imagemagick",
            label: "ImageMagick",
            repo: "ImageMagick/ImageMagick",
            asset_terms: &["portable-q16-x64"],
            asset_extension: ".7z",
            direct_asset_url: None,
            required_executables: &["magick.exe"],
            validation_arg: "-version",
        }),
        _ => None,
    }
}

fn common_parent_dir(paths: &[PathBuf]) -> Option<&Path> {
    let first = paths.first()?.parent()?;
    paths
        .iter()
        .all(|path| path.parent().is_some_and(|parent| parent == first))
        .then_some(first)
}

fn latest_github_asset(repo: &str, terms: &[&str]) -> Result<ReleaseAsset, String> {
    latest_github_asset_ext(repo, terms, ".zip")
}

fn latest_github_asset_ext(
    repo: &str,
    terms: &[&str],
    extension: &str,
) -> Result<ReleaseAsset, String> {
    let url = format!("https://api.github.com/repos/{repo}/releases");
    let mut response = ureq::get(&url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "videomaxxxing-local-tool")
        .call()
        .map_err(|err| format!("Failed to fetch GitHub releases: {err}"))?;
    let body = response
        .body_mut()
        .read_to_string()
        .map_err(|err| format!("Failed to read GitHub releases: {err}"))?;
    let releases: Value = serde_json::from_str(&body).map_err(|err| err.to_string())?;
    let releases = releases
        .as_array()
        .ok_or("GitHub releases response was not an array.")?;

    for release in releases {
        let Some(assets) = release["assets"].as_array() else {
            continue;
        };
        for asset in assets {
            let name = asset["name"].as_str().unwrap_or_default();
            let lower = name.to_lowercase();
            let matches_terms = terms
                .iter()
                .all(|term| lower.contains(&term.to_lowercase()))
                && lower.ends_with(&extension.to_lowercase());
            if matches_terms {
                let url = asset["browser_download_url"]
                    .as_str()
                    .ok_or("GitHub asset had no download URL.")?;
                return Ok(ReleaseAsset {
                    name: name.to_string(),
                    url: url.to_string(),
                });
            }
        }
    }

    Err(format!("No matching Windows asset was found for {repo}."))
}

fn extract_archive(archive_path: &Path, destination: &Path) -> Result<(), String> {
    let extension = archive_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();
    if extension == "zip" {
        return unzip_archive(archive_path, destination);
    }

    let output = Command::new("tar")
        .arg("-xf")
        .arg(archive_path)
        .arg("-C")
        .arg(destination)
        .output()
        .map_err(|err| {
            format!(
                "Failed to extract {} with tar: {err}",
                archive_path.display()
            )
        })?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Failed to extract {}: {}",
            archive_path.display(),
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

fn download_with_progress(
    app: &tauri::AppHandle,
    stage: &str,
    url: &str,
    destination: &Path,
) -> Result<(), String> {
    let mut response = ureq::get(url)
        .header("User-Agent", "videomaxxxing-local-tool")
        .call()
        .map_err(|err| format!("Failed to download release asset: {err}"))?;
    let total = response
        .headers()
        .get("content-length")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok());
    let mut reader = response.body_mut().as_reader();
    let mut output = fs::File::create(destination).map_err(|err| err.to_string())?;
    let mut buffer = vec![0_u8; 1024 * 256];
    let mut downloaded = 0_u64;
    let mut last_reported_mb = 0_u64;

    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|err| format!("Failed while downloading: {err}"))?;
        if read == 0 {
            break;
        }
        output
            .write_all(&buffer[..read])
            .map_err(|err| err.to_string())?;
        downloaded += read as u64;
        let downloaded_mb = downloaded / 1_048_576;
        if downloaded_mb >= last_reported_mb + 5 {
            last_reported_mb = downloaded_mb;
            let (message, progress) = if let Some(total) = total {
                (
                    format!(
                        "Downloaded {:.1} / {:.1} MB",
                        downloaded as f64 / 1_048_576.0,
                        total as f64 / 1_048_576.0
                    ),
                    Some((downloaded as f64 / total as f64) * 100.0),
                )
            } else {
                (
                    format!("Downloaded {:.1} MB", downloaded as f64 / 1_048_576.0),
                    None,
                )
            };
            emit_progress_value(app, stage, message, progress);
        }
    }

    emit_progress_value(
        app,
        stage,
        format!("Downloaded {:.1} MB", downloaded as f64 / 1_048_576.0),
        Some(100.0),
    );
    Ok(())
}

fn unzip_archive(zip_path: &Path, destination: &Path) -> Result<(), String> {
    let file = fs::File::open(zip_path).map_err(|err| err.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|err| err.to_string())?;
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|err| err.to_string())?;
        let Some(enclosed_name) = file.enclosed_name() else {
            continue;
        };
        let output_path = destination.join(enclosed_name);
        if file.is_dir() {
            fs::create_dir_all(&output_path).map_err(|err| err.to_string())?;
        } else {
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent).map_err(|err| err.to_string())?;
            }
            let mut output = fs::File::create(&output_path).map_err(|err| err.to_string())?;
            std::io::copy(&mut file, &mut output).map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

fn app_settings_path() -> PathBuf {
    workspace_root().join("app_settings.local.json")
}

fn safe_output_filename(name: &str, fallback: &str) -> String {
    let trimmed = name.trim();
    let source = if trimmed.is_empty() {
        fallback
    } else {
        trimmed
    };
    let cleaned = source
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ if character.is_control() => '_',
            _ => character,
        })
        .collect::<String>();
    if cleaned.trim().is_empty() {
        fallback.to_string()
    } else {
        cleaned
    }
}

fn social_output_name(name: &str, format: &str) -> String {
    let extension = match format {
        "gif" => ".gif",
        "webp" => ".webp",
        "apng" => ".apng",
        _ => ".mp4",
    };
    let stem = default_if_empty(name, "social_export");
    let desired = extension.trim_start_matches('.');
    let path = Path::new(stem);
    let candidate = if path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case(desired))
    {
        stem.to_string()
    } else {
        let clean_stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or(stem);
        format!("{clean_stem}{extension}")
    };
    safe_output_filename(&candidate, &format!("social_export{extension}"))
}

fn normalized_image_compress_format(format: &str) -> &'static str {
    match format.trim().to_lowercase().as_str() {
        "png" => "png",
        "jpg" | "jpeg" => "jpg",
        "webp" => "webp",
        "avif" => "avif",
        "gif" => "gif",
        "apng" => "apng",
        _ => "webp",
    }
}

fn image_compress_output_name(name: &str, format: &str) -> String {
    let extension = match format {
        "jpg" => ".jpg",
        "webp" => ".webp",
        "avif" => ".avif",
        "gif" => ".gif",
        "apng" => ".apng",
        _ => ".png",
    };
    let stem = default_if_empty(name, "image_compress");
    let desired = extension.trim_start_matches('.');
    let path = Path::new(stem);
    let candidate = if path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case(desired))
    {
        stem.to_string()
    } else {
        let clean_stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or(stem);
        format!("{clean_stem}{extension}")
    };
    safe_output_filename(&candidate, &format!("image_compress{extension}"))
}

fn is_gif_path(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("gif"))
}

fn effort_oxipng(effort: &str) -> &'static str {
    match effort {
        "fast" => "2",
        "smallest" => "6",
        _ => "4",
    }
}

fn effort_webp(effort: &str) -> &'static str {
    match effort {
        "fast" => "2",
        "smallest" => "6",
        _ => "4",
    }
}

fn effort_avif(effort: &str) -> &'static str {
    match effort {
        "fast" => "8",
        "smallest" => "4",
        _ => "6",
    }
}

fn ffmpeg_still_to(
    app: &tauri::AppHandle,
    input_path: &Path,
    output_path: &Path,
    codec_format: &str,
    full_log: &mut String,
    range: JobProgressRange,
) -> Result<(), String> {
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let mut command = Command::new(ffmpeg);
    command
        .arg("-hide_banner")
        .arg("-y")
        .arg("-i")
        .arg(input_path)
        .args(["-frames:v", "1", "-update", "1"]);
    if codec_format == "ppm" {
        command.args(["-f", "image2", "-c:v", "ppm"]);
    }
    command.arg(output_path);
    run_stage_progress(
        app,
        "Image decode",
        &mut command,
        None,
        None,
        full_log,
        range,
    )
}

fn magick_still_to(
    app: &tauri::AppHandle,
    input_path: &Path,
    output_path: &Path,
    format: &str,
    quality: Option<u8>,
    options: &ImageCompressOptions,
    full_log: &mut String,
    range: JobProgressRange,
) -> Result<(), String> {
    let magick = find_tool("magick")
        .ok_or("ImageMagick was not found. Install ImageMagick from Must haves.")?;
    let magick_path = PathBuf::from(&magick);
    let mut command = Command::new(&magick_path);
    configure_imagemagick_command(&mut command, &magick_path);
    command.arg(input_path).arg("-auto-orient");
    if !options.keep_metadata {
        command.arg("-strip");
    }
    if options.lossless && matches!(format, "webp" | "avif") {
        if format == "webp" {
            command.args(["-define", "webp:lossless=true"]);
        }
    } else if let Some(value) = quality {
        command.arg("-quality").arg(value.to_string());
    }
    if format == "png" && options.effort != "fast" {
        command.args(["-define", "png:compression-level=9"]);
    }
    command.arg(output_path);
    run_stage_progress(
        app,
        "ImageMagick",
        &mut command,
        None,
        None,
        full_log,
        range,
    )
}

fn configure_imagemagick_command(command: &mut Command, executable_path: &Path) {
    if let Some(parent) = executable_path.parent() {
        command.current_dir(parent).env("MAGICK_HOME", parent);
    }
}

fn palette_color_count(options: &ImageCompressOptions) -> u16 {
    let value = if options.palette_colors == 0 {
        128
    } else {
        options.palette_colors
    };
    value.clamp(2, 256)
}

fn reduce_palette_still(
    app: &tauri::AppHandle,
    input_path: &Path,
    temp_dir: &Path,
    options: &ImageCompressOptions,
    full_log: &mut String,
) -> Result<PathBuf, String> {
    let magick = find_tool("magick").ok_or(
        "ImageMagick was not found. Install ImageMagick from Must haves to reduce palette.",
    )?;
    let output_path = temp_dir.join("palette_reduced.png");
    let magick_path = PathBuf::from(&magick);
    let colors = palette_color_count(options);
    let mut command = Command::new(&magick_path);
    configure_imagemagick_command(&mut command, &magick_path);
    command.arg(input_path).arg("-auto-orient");
    if !options.keep_metadata {
        command.arg("-strip");
    }
    if options.palette_dither {
        command.args(["-dither", "FloydSteinberg"]);
    } else {
        command.arg("+dither");
    }
    command
        .arg("-colors")
        .arg(colors.to_string())
        .arg(&output_path);
    run_stage_progress(
        app,
        "Palette reduction",
        &mut command,
        None,
        None,
        full_log,
        JobProgressRange::new(8.0, 24.0, "Reducing palette"),
    )?;
    full_log.push_str(&format!(
        "Palette reduced to up to {colors} colors{}.\n",
        if options.palette_dither {
            " with dithering"
        } else {
            ""
        }
    ));
    Ok(output_path)
}

fn compress_to_png(
    app: &tauri::AppHandle,
    input_path: &Path,
    output_path: &Path,
    _temp_dir: &Path,
    options: &ImageCompressOptions,
    full_log: &mut String,
) -> Result<(), String> {
    let oxipng = find_tool("oxipng");
    if oxipng.is_none() {
        full_log.push_str("OxiPNG is not installed. Using ImageMagick PNG compression.\n");
        return magick_still_to(
            app,
            input_path,
            output_path,
            "png",
            None,
            options,
            full_log,
            JobProgressRange::new(10.0, 95.0, "Encoding PNG"),
        );
    }
    ffmpeg_still_to(
        app,
        input_path,
        output_path,
        "png",
        full_log,
        JobProgressRange::new(10.0, 60.0, "Encoding PNG"),
    )?;

    let mut command = Command::new(oxipng.expect("checked oxipng"));
    command.arg("-o").arg(effort_oxipng(&options.effort));
    if !options.keep_metadata {
        command.args(["--strip", "safe"]);
    }
    command.arg(output_path);
    run_stage_progress(
        app,
        "OxiPNG",
        &mut command,
        None,
        None,
        full_log,
        JobProgressRange::new(60.0, 95.0, "Optimizing PNG"),
    )
}

fn compress_to_jpeg(
    app: &tauri::AppHandle,
    input_path: &Path,
    output_path: &Path,
    temp_dir: &Path,
    quality: u8,
    options: &ImageCompressOptions,
    full_log: &mut String,
) -> Result<(), String> {
    let cjpeg = find_tool("cjpeg");
    if cjpeg.is_none() {
        full_log.push_str("MozJPEG is not installed. Using ImageMagick JPEG compression.\n");
        return magick_still_to(
            app,
            input_path,
            output_path,
            "jpg",
            Some(quality),
            options,
            full_log,
            JobProgressRange::new(10.0, 95.0, "Encoding JPEG"),
        );
    }
    let ppm_path = temp_dir.join("source.ppm");
    ffmpeg_still_to(
        app,
        input_path,
        &ppm_path,
        "ppm",
        full_log,
        JobProgressRange::new(10.0, 45.0, "Preparing JPEG input"),
    )?;

    let mut command = Command::new(cjpeg.expect("checked cjpeg"));
    command.arg("-quality").arg(quality.to_string());
    if options.effort != "fast" {
        command.arg("-optimize").arg("-progressive");
    }
    command.arg("-outfile").arg(output_path).arg(&ppm_path);
    run_stage_progress(
        app,
        "MozJPEG",
        &mut command,
        None,
        None,
        full_log,
        JobProgressRange::new(45.0, 95.0, "Encoding JPEG"),
    )
}

fn compress_to_webp(
    app: &tauri::AppHandle,
    input_path: &Path,
    output_path: &Path,
    temp_dir: &Path,
    quality: u8,
    options: &ImageCompressOptions,
    preserve_animation: bool,
    full_log: &mut String,
) -> Result<(), String> {
    if preserve_animation {
        let gif2webp = find_tool("gif2webp").ok_or(
            "libwebp gif2webp.exe was not found. Install libwebp from Image editing settings.",
        )?;
        let mut command = Command::new(gif2webp);
        if !options.lossless {
            command.arg("-lossy");
        }
        command
            .arg("-q")
            .arg(quality.to_string())
            .arg("-m")
            .arg(effort_webp(&options.effort))
            .arg(input_path)
            .arg("-o")
            .arg(output_path);
        return run_stage_progress(
            app,
            "libwebp",
            &mut command,
            None,
            None,
            full_log,
            JobProgressRange::new(10.0, 95.0, "Encoding animated WebP"),
        );
    }

    let cwebp = find_tool("cwebp");
    if cwebp.is_none() {
        full_log.push_str("libwebp is not installed. Using ImageMagick WebP compression.\n");
        return magick_still_to(
            app,
            input_path,
            output_path,
            "webp",
            Some(quality),
            options,
            full_log,
            JobProgressRange::new(10.0, 95.0, "Encoding WebP"),
        );
    }
    let png_path = temp_dir.join("source.png");
    ffmpeg_still_to(
        app,
        input_path,
        &png_path,
        "png",
        full_log,
        JobProgressRange::new(10.0, 45.0, "Preparing WebP input"),
    )?;

    let mut command = Command::new(cwebp.expect("checked cwebp"));
    if options.lossless {
        command.arg("-lossless");
    }
    command
        .arg("-q")
        .arg(quality.to_string())
        .arg("-m")
        .arg(effort_webp(&options.effort))
        .arg(&png_path)
        .arg("-o")
        .arg(output_path);
    run_stage_progress(
        app,
        "libwebp",
        &mut command,
        None,
        None,
        full_log,
        JobProgressRange::new(45.0, 95.0, "Encoding WebP"),
    )
}

fn compress_to_avif(
    app: &tauri::AppHandle,
    input_path: &Path,
    output_path: &Path,
    temp_dir: &Path,
    quality: u8,
    options: &ImageCompressOptions,
    full_log: &mut String,
) -> Result<(), String> {
    let avifenc = find_tool("avifenc");
    if avifenc.is_none() {
        full_log.push_str("libavif is not installed. Using ImageMagick AVIF compression.\n");
        return magick_still_to(
            app,
            input_path,
            output_path,
            "avif",
            Some(quality),
            options,
            full_log,
            JobProgressRange::new(10.0, 95.0, "Encoding AVIF"),
        );
    }
    let png_path = temp_dir.join("source.png");
    ffmpeg_still_to(
        app,
        input_path,
        &png_path,
        "png",
        full_log,
        JobProgressRange::new(10.0, 45.0, "Preparing AVIF input"),
    )?;

    let mut command = Command::new(avifenc.expect("checked avifenc"));
    if options.lossless {
        command.arg("--lossless");
    } else {
        command.arg("-q").arg(quality.to_string());
    }
    command
        .arg("-s")
        .arg(effort_avif(&options.effort))
        .arg(&png_path)
        .arg(output_path);
    run_stage_progress(
        app,
        "libavif",
        &mut command,
        None,
        None,
        full_log,
        JobProgressRange::new(45.0, 95.0, "Encoding AVIF"),
    )
}

fn compress_to_gif(
    app: &tauri::AppHandle,
    input_path: &Path,
    output_path: &Path,
    temp_dir: &Path,
    quality: u8,
    preserve_animation: bool,
    options: &ImageCompressOptions,
    full_log: &mut String,
) -> Result<(), String> {
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    if preserve_animation {
        let palette_path = temp_dir.join("palette.png");
        let max_colors = if options.reduce_palette {
            palette_color_count(options)
        } else {
            ((quality as f64 / 100.0) * 224.0 + 32.0)
                .round()
                .clamp(32.0, 256.0) as u16
        };
        let mut palette = Command::new(&ffmpeg);
        palette
            .arg("-hide_banner")
            .arg("-y")
            .arg("-i")
            .arg(input_path)
            .arg("-vf")
            .arg(format!("palettegen=max_colors={max_colors}"))
            .arg(&palette_path);
        run_stage_progress(
            app,
            "GIF palette",
            &mut palette,
            None,
            None,
            full_log,
            JobProgressRange::new(10.0, 35.0, "Generating GIF palette"),
        )?;

        let mut gif = Command::new(ffmpeg);
        gif.arg("-hide_banner")
            .arg("-y")
            .arg("-i")
            .arg(input_path)
            .arg("-i")
            .arg(&palette_path)
            .arg("-lavfi")
            .arg(if options.palette_dither {
                "[0:v][1:v]paletteuse=dither=sierra2_4a"
            } else {
                "[0:v][1:v]paletteuse=dither=none"
            })
            .arg("-loop")
            .arg("0")
            .arg(output_path);
        return run_stage_progress(
            app,
            "GIF export",
            &mut gif,
            None,
            None,
            full_log,
            JobProgressRange::new(35.0, 95.0, "Encoding GIF"),
        );
    }

    let mut command = Command::new(ffmpeg);
    command
        .arg("-hide_banner")
        .arg("-y")
        .arg("-i")
        .arg(input_path)
        .args(["-frames:v", "1"])
        .arg(output_path);
    run_stage_progress(
        app,
        "GIF export",
        &mut command,
        None,
        None,
        full_log,
        JobProgressRange::new(10.0, 95.0, "Encoding GIF"),
    )
}

fn compress_to_apng(
    app: &tauri::AppHandle,
    input_path: &Path,
    output_path: &Path,
    _temp_dir: &Path,
    preserve_animation: bool,
    options: &ImageCompressOptions,
    full_log: &mut String,
) -> Result<(), String> {
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let oxipng = find_tool("oxipng")
        .ok_or("OxiPNG was not found. Install OxiPNG from Image editing settings.")?;
    let mut command = Command::new(ffmpeg);
    command
        .arg("-hide_banner")
        .arg("-y")
        .arg("-i")
        .arg(input_path);
    if !preserve_animation {
        command.args(["-frames:v", "1"]);
    }
    command
        .args(["-an", "-f", "apng", "-plays", "0"])
        .arg(output_path);
    run_stage_progress(
        app,
        "APNG export",
        &mut command,
        None,
        None,
        full_log,
        JobProgressRange::new(10.0, 70.0, "Encoding APNG"),
    )?;

    let mut optimize = Command::new(oxipng);
    optimize.arg("-o").arg(effort_oxipng(&options.effort));
    if !options.keep_metadata {
        optimize.args(["--strip", "safe"]);
    }
    optimize.arg(output_path);
    run_stage_progress(
        app,
        "OxiPNG",
        &mut optimize,
        None,
        None,
        full_log,
        JobProgressRange::new(70.0, 95.0, "Optimizing APNG"),
    )
}

fn social_video_filter(options: &SocialExportOptions, include_gradfun: bool) -> String {
    let mut parts = Vec::new();
    if let Ok(fps) = options.fps.trim().parse::<f64>() {
        if fps > 0.0 {
            parts.push(format!("fps={fps:.3}"));
        }
    }
    let width = default_if_empty(&options.width, "1280");
    let scale_filter = default_if_empty(&options.scale_filter, "lanczos");
    parts.push(format!("scale={width}:-2:flags={scale_filter}"));
    if include_gradfun {
        parts.push("gradfun=strength=0.6".to_string());
    }
    parts.join(",")
}

fn file_size(path: &Path) -> u64 {
    fs::metadata(path)
        .map(|metadata| metadata.len())
        .unwrap_or(0)
}

fn dir_size(path: &Path) -> u64 {
    let Ok(metadata) = fs::metadata(path) else {
        return 0;
    };
    if metadata.is_file() {
        return metadata.len();
    }

    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .filter_map(Result::ok)
        .map(|entry| dir_size(&entry.path()))
        .sum()
}

fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} {}", UNITS[unit])
    } else if value >= 10.0 {
        format!("{value:.0} {}", UNITS[unit])
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

fn normalize_app_settings(mut settings: AppSettings) -> AppSettings {
    if settings.default_download_folder.trim().is_empty()
        || Path::new(&settings.default_download_folder)
            == workspace_root().join(DEFAULT_OUTPUT_FOLDER)
    {
        settings.default_download_folder = DEFAULT_OUTPUT_FOLDER.to_string();
    }
    if settings.temp_folder.trim().is_empty() {
        settings.temp_folder = workspace_root().join("temp").to_string_lossy().to_string();
    }
    if settings.cuda_bin_folder.trim().is_empty() {
        settings.cuda_bin_folder = find_cuda_bin_dir()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default();
    }
    if settings.cudnn_bin_folder.trim().is_empty() {
        settings.cudnn_bin_folder = find_cudnn_bin_dir()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default();
    }
    settings
}

fn flux2_tool_dir() -> PathBuf {
    workspace_root().join("tools").join("flux2")
}

fn flux2_cache_dir() -> PathBuf {
    flux2_tool_dir().join("cache")
}

fn flux2_runner_script_path() -> PathBuf {
    flux2_tool_dir().join("run_flux2.py")
}

fn flux2_status_script_path() -> PathBuf {
    flux2_tool_dir().join("check_flux2.py")
}

fn write_flux2_runtime_files() -> Result<(), String> {
    fs::create_dir_all(flux2_tool_dir()).map_err(|err| err.to_string())?;
    fs::create_dir_all(flux2_cache_dir()).map_err(|err| err.to_string())?;
    fs::write(flux2_runner_script_path(), FLUX2_RUNNER_SCRIPT.trim_start())
        .map_err(|err| format!("Failed to write Flux.2 runner: {err}"))?;
    fs::write(flux2_status_script_path(), FLUX2_STATUS_SCRIPT.trim_start())
        .map_err(|err| format!("Failed to write Flux.2 status check: {err}"))?;
    Ok(())
}

fn add_flux2_cache_env(command: &mut Command) {
    let cache = flux2_cache_dir();
    command.env("HF_HOME", &cache);
    command.env("HF_HUB_CACHE", cache.join("hub"));
    command.env("TRANSFORMERS_CACHE", cache.join("transformers"));
}

fn flux2_runtime_ready() -> bool {
    find_tool("conda")
        .as_deref()
        .map(|conda| conda_named_env_ready(conda, FLUX2_ENV_NAME))
        .unwrap_or(false)
}

fn flux2_status() -> Flux2Status {
    let conda = find_tool("conda");
    let env_ready = conda
        .as_deref()
        .map(|path| conda_named_env_ready(path, FLUX2_ENV_NAME))
        .unwrap_or(false);
    let mut runtime_ready = false;
    let mut cuda_ready = false;
    let mut cuda_label = String::new();
    let mut torch_version = String::new();
    let mut diffusers_version = String::new();
    let mut transformers_version = String::new();
    let mut accelerate_version = String::new();
    let mut probe_message = if conda.is_none() {
        "Conda was not found in PATH.".to_string()
    } else if !env_ready {
        format!("Conda env {FLUX2_ENV_NAME} is not ready.")
    } else {
        "Flux.2 runtime has not been validated.".to_string()
    };

    if let Some(conda) = conda.as_deref().filter(|_| env_ready) {
        let Ok(_) = write_flux2_runtime_files() else {
            return Flux2Status {
                state: "needs_setup".to_string(),
                tool_path: flux2_tool_dir().to_string_lossy().to_string(),
                env_name: FLUX2_ENV_NAME.to_string(),
                cache_path: flux2_cache_dir().to_string_lossy().to_string(),
                current_size_label: format_bytes(dir_size(&flux2_tool_dir())),
                estimated_install_label: "~12-30 GB depending on cache and model weights"
                    .to_string(),
                runtime_ready,
                cuda_ready,
                cuda_label,
                torch_version,
                diffusers_version,
                transformers_version,
                accelerate_version,
                message: "Could not write Flux.2 runtime validation script.".to_string(),
            };
        };
        let mut probe = Command::new(conda);
        probe
            .args(["run", "-n", FLUX2_ENV_NAME, "python"])
            .arg(flux2_status_script_path());
        add_flux2_cache_env(&mut probe);
        let output = shared_runtime::configure(&workspace_root(), &mut probe)
            .and_then(|_| probe.output().map_err(|err| err.to_string()));
        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            if let Some(value) = stdout
                .lines()
                .rev()
                .find_map(|line| serde_json::from_str::<Value>(line.trim()).ok())
            {
                runtime_ready = output.status.success()
                    && value
                        .get("ready")
                        .and_then(|item| item.as_bool())
                        .unwrap_or(false);
                cuda_ready = value
                    .get("cudaAvailable")
                    .and_then(|item| item.as_bool())
                    .unwrap_or(false);
                cuda_label = value
                    .get("cudaName")
                    .and_then(|item| item.as_str())
                    .unwrap_or_default()
                    .to_string();
                if let Some(versions) = value.get("versions").and_then(|item| item.as_object()) {
                    torch_version = versions
                        .get("torch")
                        .and_then(|item| item.as_str())
                        .unwrap_or_default()
                        .to_string();
                    diffusers_version = versions
                        .get("diffusers")
                        .and_then(|item| item.as_str())
                        .unwrap_or_default()
                        .to_string();
                    transformers_version = versions
                        .get("transformers")
                        .and_then(|item| item.as_str())
                        .unwrap_or_default()
                        .to_string();
                    accelerate_version = versions
                        .get("accelerate")
                        .and_then(|item| item.as_str())
                        .unwrap_or_default()
                        .to_string();
                }
                probe_message = value
                    .get("message")
                    .and_then(|item| item.as_str())
                    .map(compact_status_message)
                    .unwrap_or_else(|| "Flux.2 runtime validation finished.".to_string());
            } else {
                let combined = format!("{} {}", stdout.trim(), stderr.trim());
                probe_message = compact_status_message(default_if_empty(
                    combined.trim(),
                    "Flux.2 runtime validation did not return a usable result.",
                ));
            }
        } else {
            probe_message = "Could not run Flux.2 runtime validation.".to_string();
        }
    }

    let state = if runtime_ready {
        "installed"
    } else if flux2_tool_dir().exists() || env_ready {
        "needs_setup"
    } else {
        "missing"
    }
    .to_string();
    let message = if runtime_ready && cuda_ready {
        format!(
            "Flux.2 runtime is ready. CUDA device: {}.",
            default_if_empty(&cuda_label, "available")
        )
    } else if runtime_ready {
        "Flux.2 runtime is ready, but CUDA was not detected. CPU generation is available but impractical for normal use.".to_string()
    } else {
        probe_message
    };

    Flux2Status {
        state,
        tool_path: flux2_tool_dir().to_string_lossy().to_string(),
        env_name: FLUX2_ENV_NAME.to_string(),
        cache_path: flux2_cache_dir().to_string_lossy().to_string(),
        current_size_label: format_bytes(dir_size(&flux2_tool_dir())),
        estimated_install_label: "~12-30 GB depending on cache and model weights".to_string(),
        runtime_ready,
        cuda_ready,
        cuda_label,
        torch_version,
        diffusers_version,
        transformers_version,
        accelerate_version,
        message,
    }
}

fn validate_flux2_dimensions(width: u32, height: u32) -> Result<(), String> {
    if width < 256 || height < 256 {
        return Err("Flux.2 width and height must be at least 256 pixels.".into());
    }
    if width > 2048 || height > 2048 {
        return Err(
            "Flux.2 width and height are capped at 2048 pixels for this local runner.".into(),
        );
    }
    if width % 16 != 0 || height % 16 != 0 {
        return Err("Flux.2 width and height must be multiples of 16.".into());
    }
    if u64::from(width) * u64::from(height) > 4_194_304 {
        return Err("Flux.2 output is capped at 4 megapixels.".into());
    }
    Ok(())
}

fn validate_flux2_reference_paths(paths: &[String]) -> Result<Vec<PathBuf>, String> {
    if paths.len() > 4 {
        return Err("Flux.2 supports up to 4 reference images.".into());
    }

    paths
        .iter()
        .map(|path| {
            let trimmed = path.trim();
            if trimmed.is_empty() {
                return Err("Flux.2 reference image path is empty.".to_string());
            }
            let reference_path = PathBuf::from(trimmed);
            if !reference_path.is_file() {
                return Err(format!(
                    "Flux.2 reference image was not found: {}",
                    reference_path.display()
                ));
            }
            Ok(reference_path)
        })
        .collect()
}

fn wan21_tool_dir() -> PathBuf {
    workspace_root().join("tools").join("wan21")
}

fn wan21_repo_dir() -> PathBuf {
    wan21_tool_dir().join("repo")
}

fn wan21_models_dir() -> PathBuf {
    wan21_tool_dir().join("models")
}

fn wan21_model_dir() -> PathBuf {
    wan21_models_dir().join("Wan2.1-T2V-1.3B")
}

fn wan21_cache_dir() -> PathBuf {
    wan21_tool_dir().join("cache")
}

fn wan21_runner_script_path() -> PathBuf {
    wan21_tool_dir().join("run_wan21.py")
}

fn wan21_status_script_path() -> PathBuf {
    wan21_tool_dir().join("check_wan21.py")
}

fn write_wan21_runtime_files() -> Result<(), String> {
    fs::create_dir_all(wan21_tool_dir()).map_err(|err| err.to_string())?;
    fs::create_dir_all(wan21_cache_dir()).map_err(|err| err.to_string())?;
    fs::write(wan21_runner_script_path(), WAN21_RUNNER_SCRIPT.trim_start())
        .map_err(|err| format!("Failed to write Wan2.1 runner: {err}"))?;
    fs::write(wan21_status_script_path(), WAN21_STATUS_SCRIPT.trim_start())
        .map_err(|err| format!("Failed to write Wan2.1 status check: {err}"))?;
    Ok(())
}

fn add_wan21_cache_env(command: &mut Command) {
    let cache = wan21_cache_dir();
    command.env("HF_HOME", &cache);
    command.env("HF_HUB_CACHE", cache.join("hub"));
    command.env("TRANSFORMERS_CACHE", cache.join("transformers"));
}

fn wan21_runtime_ready() -> bool {
    find_tool("conda")
        .as_deref()
        .map(|conda| conda_named_env_ready(conda, WAN21_ENV_NAME))
        .unwrap_or(false)
}

fn wan21_repo_ready() -> bool {
    wan21_repo_dir().join("generate.py").exists()
}

fn wan21_model_ready() -> bool {
    let model_dir = wan21_model_dir();
    model_dir.exists()
        && find_first_file_with_extension(&model_dir, "safetensors")
            .or_else(|| find_first_file_with_extension(&model_dir, "pt"))
            .or_else(|| find_first_file_with_extension(&model_dir, "bin"))
            .is_some()
}

fn wan21_status() -> Wan21Status {
    let conda = find_tool("conda");
    let env_ready = conda
        .as_deref()
        .map(|path| conda_named_env_ready(path, WAN21_ENV_NAME))
        .unwrap_or(false);
    let repo_ready = wan21_repo_ready();
    let model_ready = wan21_model_ready();
    let mut runtime_ready = false;
    let mut cuda_ready = false;
    let mut cuda_label = String::new();
    let mut torch_version = String::new();
    let mut transformers_version = String::new();
    let mut diffusers_version = String::new();
    let mut accelerate_version = String::new();
    let mut flash_attn_ready = false;
    let mut flash_attn_message = String::new();
    let mut probe_message = if conda.is_none() {
        "Conda was not found in PATH.".to_string()
    } else if !repo_ready {
        "Wan2.1 repo is not installed.".to_string()
    } else if !env_ready {
        format!("Conda env {WAN21_ENV_NAME} is not ready.")
    } else {
        "Wan2.1 runtime has not been validated.".to_string()
    };

    if let Some(conda) = conda.as_deref().filter(|_| repo_ready && env_ready) {
        let Ok(_) = write_wan21_runtime_files() else {
            return Wan21Status {
                state: "needs_setup".to_string(),
                tool_path: wan21_tool_dir().to_string_lossy().to_string(),
                repo_path: wan21_repo_dir().to_string_lossy().to_string(),
                model_path: wan21_model_dir().to_string_lossy().to_string(),
                cache_path: wan21_cache_dir().to_string_lossy().to_string(),
                env_name: WAN21_ENV_NAME.to_string(),
                current_size_label: format_bytes(dir_size(&wan21_tool_dir())),
                estimated_install_label: "~10-25 GB depending on model cache and runtime"
                    .to_string(),
                runtime_ready,
                model_ready,
                cuda_ready,
                cuda_label,
                torch_version,
                transformers_version,
                diffusers_version,
                accelerate_version,
                flash_attn_ready,
                flash_attn_message,
                message: "Could not write Wan2.1 runtime validation script.".to_string(),
            };
        };
        let mut probe = Command::new(conda);
        probe
            .args(["run", "-n", WAN21_ENV_NAME, "python"])
            .arg(wan21_status_script_path());
        add_wan21_cache_env(&mut probe);
        let output = shared_runtime::configure(&workspace_root(), &mut probe)
            .and_then(|_| probe.output().map_err(|err| err.to_string()));
        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            if let Some(value) = stdout
                .lines()
                .rev()
                .find_map(|line| serde_json::from_str::<Value>(line.trim()).ok())
            {
                runtime_ready = output.status.success()
                    && value
                        .get("ready")
                        .and_then(|item| item.as_bool())
                        .unwrap_or(false);
                cuda_ready = value
                    .get("cudaAvailable")
                    .and_then(|item| item.as_bool())
                    .unwrap_or(false);
                cuda_label = value
                    .get("cudaName")
                    .and_then(|item| item.as_str())
                    .unwrap_or_default()
                    .to_string();
                flash_attn_ready = value
                    .get("flashAttnReady")
                    .and_then(|item| item.as_bool())
                    .unwrap_or(false);
                flash_attn_message = value
                    .get("flashAttnMessage")
                    .and_then(|item| item.as_str())
                    .unwrap_or_default()
                    .to_string();
                if let Some(versions) = value.get("versions").and_then(|item| item.as_object()) {
                    torch_version = versions
                        .get("torch")
                        .and_then(|item| item.as_str())
                        .unwrap_or_default()
                        .to_string();
                    transformers_version = versions
                        .get("transformers")
                        .and_then(|item| item.as_str())
                        .unwrap_or_default()
                        .to_string();
                    diffusers_version = versions
                        .get("diffusers")
                        .and_then(|item| item.as_str())
                        .unwrap_or_default()
                        .to_string();
                    accelerate_version = versions
                        .get("accelerate")
                        .and_then(|item| item.as_str())
                        .unwrap_or_default()
                        .to_string();
                }
                probe_message = value
                    .get("message")
                    .and_then(|item| item.as_str())
                    .map(compact_status_message)
                    .unwrap_or_else(|| "Wan2.1 runtime validation finished.".to_string());
            } else {
                let combined = format!("{} {}", stdout.trim(), stderr.trim());
                probe_message = compact_status_message(default_if_empty(
                    combined.trim(),
                    "Wan2.1 runtime validation did not return a usable result.",
                ));
            }
        } else {
            probe_message = "Could not run Wan2.1 runtime validation.".to_string();
        }
    }

    let state = if runtime_ready && model_ready {
        "installed"
    } else if wan21_tool_dir().exists() || repo_ready || env_ready {
        "needs_setup"
    } else {
        "missing"
    }
    .to_string();
    let message = if runtime_ready && model_ready && cuda_ready {
        format!(
            "Wan2.1 T2V-1.3B is ready. CUDA device: {}.",
            default_if_empty(&cuda_label, "available")
        )
    } else if runtime_ready && model_ready {
        "Wan2.1 runtime and model are ready, but CUDA was not detected. CPU generation is not practical for normal use.".to_string()
    } else if runtime_ready && !model_ready {
        format!(
            "Wan2.1 runtime is ready, but model weights are missing at {}.",
            wan21_model_dir().display()
        )
    } else {
        probe_message
    };

    Wan21Status {
        state,
        tool_path: wan21_tool_dir().to_string_lossy().to_string(),
        repo_path: wan21_repo_dir().to_string_lossy().to_string(),
        model_path: wan21_model_dir().to_string_lossy().to_string(),
        cache_path: wan21_cache_dir().to_string_lossy().to_string(),
        env_name: WAN21_ENV_NAME.to_string(),
        current_size_label: format_bytes(dir_size(&wan21_tool_dir())),
        estimated_install_label: "~10-25 GB depending on model cache and runtime".to_string(),
        runtime_ready,
        model_ready,
        cuda_ready,
        cuda_label,
        torch_version,
        transformers_version,
        diffusers_version,
        accelerate_version,
        flash_attn_ready,
        flash_attn_message,
        message,
    }
}

fn validate_wan21_size<'a>(size: &'a str, orientation: &str) -> Result<&'a str, String> {
    let trimmed = size.trim();
    let expected = match orientation.trim() {
        "vertical" => "480*832",
        _ => "832*480",
    };
    if trimmed != "832*480" && trimmed != "480*832" {
        return Err("Wan2.1 size must be 832*480 or 480*832.".into());
    }
    if trimmed != expected {
        return Err(format!(
            "Wan2.1 {orientation} orientation expects size {expected}."
        ));
    }
    Ok(trimmed)
}

fn validate_wan21_frame_count(frame_count: u32) -> Result<u32, String> {
    let clamped = frame_count.clamp(9, 129);
    if (clamped - 1) % 4 != 0 {
        return Err("Wan2.1 frame count must follow 4n+1, for example 25, 49, 81, or 129.".into());
    }
    Ok(clamped)
}

fn wan22_tool_dir() -> PathBuf {
    workspace_root().join("tools").join("wan22")
}

fn wan22_repo_dir() -> PathBuf {
    wan22_tool_dir().join("repo")
}

fn wan22_models_dir() -> PathBuf {
    wan22_tool_dir().join("models")
}

fn wan22_model_dir() -> PathBuf {
    wan22_models_dir().join("Wan2.2-TI2V-5B")
}

fn wan22_cache_dir() -> PathBuf {
    wan22_tool_dir().join("cache")
}

fn wan22_runner_script_path() -> PathBuf {
    wan22_tool_dir().join("run_wan22.py")
}

fn wan22_status_script_path() -> PathBuf {
    wan22_tool_dir().join("check_wan22.py")
}

fn write_wan22_runtime_files() -> Result<(), String> {
    fs::create_dir_all(wan22_tool_dir()).map_err(|err| err.to_string())?;
    fs::create_dir_all(wan22_cache_dir()).map_err(|err| err.to_string())?;
    fs::write(wan22_runner_script_path(), WAN22_RUNNER_SCRIPT.trim_start())
        .map_err(|err| format!("Failed to write Wan2.2 runner: {err}"))?;
    fs::write(wan22_status_script_path(), WAN22_STATUS_SCRIPT.trim_start())
        .map_err(|err| format!("Failed to write Wan2.2 status check: {err}"))?;
    Ok(())
}

fn add_wan22_cache_env(command: &mut Command) {
    let cache = wan22_cache_dir();
    command.env("HF_HOME", &cache);
    command.env("HF_HUB_CACHE", cache.join("hub"));
    command.env("TRANSFORMERS_CACHE", cache.join("transformers"));
}

fn wan22_runtime_ready() -> bool {
    find_tool("conda")
        .as_deref()
        .map(|conda| conda_named_env_ready(conda, WAN22_ENV_NAME))
        .unwrap_or(false)
}

fn wan22_repo_ready() -> bool {
    wan22_repo_dir().join("generate.py").exists()
}

fn wan22_model_ready() -> bool {
    let model_dir = wan22_model_dir();
    model_dir.exists()
        && find_first_file_with_extension(&model_dir, "safetensors")
            .or_else(|| find_first_file_with_extension(&model_dir, "pt"))
            .or_else(|| find_first_file_with_extension(&model_dir, "bin"))
            .is_some()
}

fn wan22_status() -> Wan22Status {
    let conda = find_tool("conda");
    let env_ready = conda
        .as_deref()
        .map(|path| conda_named_env_ready(path, WAN22_ENV_NAME))
        .unwrap_or(false);
    let repo_ready = wan22_repo_ready();
    let model_ready = wan22_model_ready();
    let mut runtime_ready = false;
    let mut cuda_ready = false;
    let mut cuda_label = String::new();
    let mut torch_version = String::new();
    let mut transformers_version = String::new();
    let mut diffusers_version = String::new();
    let mut accelerate_version = String::new();
    let mut flash_attn_ready = false;
    let mut flash_attn_message = String::new();
    let mut probe_message = if conda.is_none() {
        "Conda was not found in PATH.".to_string()
    } else if !repo_ready {
        "Wan2.2 repo is not installed.".to_string()
    } else if !env_ready {
        format!("Conda env {WAN22_ENV_NAME} is not ready.")
    } else {
        "Wan2.2 runtime has not been validated.".to_string()
    };

    if let Some(conda) = conda.as_deref().filter(|_| repo_ready && env_ready) {
        let Ok(_) = write_wan22_runtime_files() else {
            return Wan22Status {
                state: "needs_setup".to_string(),
                tool_path: wan22_tool_dir().to_string_lossy().to_string(),
                repo_path: wan22_repo_dir().to_string_lossy().to_string(),
                model_path: wan22_model_dir().to_string_lossy().to_string(),
                cache_path: wan22_cache_dir().to_string_lossy().to_string(),
                env_name: WAN22_ENV_NAME.to_string(),
                current_size_label: format_bytes(dir_size(&wan22_tool_dir())),
                estimated_install_label: "~25-60 GB depending on model cache and runtime"
                    .to_string(),
                runtime_ready,
                model_ready,
                cuda_ready,
                cuda_label,
                torch_version,
                transformers_version,
                diffusers_version,
                accelerate_version,
                flash_attn_ready,
                flash_attn_message,
                message: "Could not write Wan2.2 runtime validation script.".to_string(),
            };
        };
        let mut probe = Command::new(conda);
        probe
            .args(["run", "-n", WAN22_ENV_NAME, "python"])
            .arg(wan22_status_script_path());
        add_wan22_cache_env(&mut probe);
        let output = shared_runtime::configure(&workspace_root(), &mut probe)
            .and_then(|_| probe.output().map_err(|err| err.to_string()));
        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            if let Some(value) = stdout
                .lines()
                .rev()
                .find_map(|line| serde_json::from_str::<Value>(line.trim()).ok())
            {
                runtime_ready = output.status.success()
                    && value
                        .get("ready")
                        .and_then(|item| item.as_bool())
                        .unwrap_or(false);
                cuda_ready = value
                    .get("cudaAvailable")
                    .and_then(|item| item.as_bool())
                    .unwrap_or(false);
                cuda_label = value
                    .get("cudaName")
                    .and_then(|item| item.as_str())
                    .unwrap_or_default()
                    .to_string();
                flash_attn_ready = value
                    .get("flashAttnReady")
                    .and_then(|item| item.as_bool())
                    .unwrap_or(false);
                flash_attn_message = value
                    .get("flashAttnMessage")
                    .and_then(|item| item.as_str())
                    .unwrap_or_default()
                    .to_string();
                if let Some(versions) = value.get("versions").and_then(|item| item.as_object()) {
                    torch_version = versions
                        .get("torch")
                        .and_then(|item| item.as_str())
                        .unwrap_or_default()
                        .to_string();
                    transformers_version = versions
                        .get("transformers")
                        .and_then(|item| item.as_str())
                        .unwrap_or_default()
                        .to_string();
                    diffusers_version = versions
                        .get("diffusers")
                        .and_then(|item| item.as_str())
                        .unwrap_or_default()
                        .to_string();
                    accelerate_version = versions
                        .get("accelerate")
                        .and_then(|item| item.as_str())
                        .unwrap_or_default()
                        .to_string();
                }
                probe_message = value
                    .get("message")
                    .and_then(|item| item.as_str())
                    .map(compact_status_message)
                    .unwrap_or_else(|| "Wan2.2 runtime validation finished.".to_string());
            } else {
                let combined = format!("{} {}", stdout.trim(), stderr.trim());
                probe_message = compact_status_message(default_if_empty(
                    combined.trim(),
                    "Wan2.2 runtime validation did not return a usable result.",
                ));
            }
        } else {
            probe_message = "Could not run Wan2.2 runtime validation.".to_string();
        }
    }

    let state = if runtime_ready && model_ready {
        "installed"
    } else if wan22_tool_dir().exists() || repo_ready || env_ready {
        "needs_setup"
    } else {
        "missing"
    }
    .to_string();
    let message = if runtime_ready && model_ready && cuda_ready {
        format!(
            "Wan2.2 TI2V-5B is ready. CUDA device: {}.",
            default_if_empty(&cuda_label, "available")
        )
    } else if runtime_ready && model_ready {
        "Wan2.2 runtime and model are ready, but CUDA was not detected. CPU generation is not practical for normal use.".to_string()
    } else if runtime_ready && !model_ready {
        format!(
            "Wan2.2 runtime is ready, but model weights are missing at {}.",
            wan22_model_dir().display()
        )
    } else {
        probe_message
    };

    Wan22Status {
        state,
        tool_path: wan22_tool_dir().to_string_lossy().to_string(),
        repo_path: wan22_repo_dir().to_string_lossy().to_string(),
        model_path: wan22_model_dir().to_string_lossy().to_string(),
        cache_path: wan22_cache_dir().to_string_lossy().to_string(),
        env_name: WAN22_ENV_NAME.to_string(),
        current_size_label: format_bytes(dir_size(&wan22_tool_dir())),
        estimated_install_label: "~25-60 GB depending on model cache and runtime".to_string(),
        runtime_ready,
        model_ready,
        cuda_ready,
        cuda_label,
        torch_version,
        transformers_version,
        diffusers_version,
        accelerate_version,
        flash_attn_ready,
        flash_attn_message,
        message,
    }
}

fn validate_wan22_size<'a>(size: &'a str, orientation: &str) -> Result<&'a str, String> {
    let trimmed = size.trim();
    let expected = match orientation.trim() {
        "vertical" => "704*1280",
        _ => "1280*704",
    };
    if trimmed != "1280*704" && trimmed != "704*1280" {
        return Err("Wan2.2 size must be 1280*704 or 704*1280.".into());
    }
    if trimmed != expected {
        return Err(format!(
            "Wan2.2 {orientation} orientation expects size {expected}."
        ));
    }
    Ok(trimmed)
}

fn validate_wan22_frame_count(frame_count: u32) -> Result<u32, String> {
    let clamped = frame_count.clamp(25, 241);
    if (clamped - 1) % 4 != 0 {
        return Err(
            "Wan2.2 frame count must follow 4n+1, for example 25, 49, 81, 121, or 241.".into(),
        );
    }
    Ok(clamped)
}

fn validate_wan22_image_path(path: Option<&str>) -> Result<Option<PathBuf>, String> {
    let Some(path) = path.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let source = PathBuf::from(path);
    if !source.exists() {
        return Err("Wan2.2 reference image does not exist.".into());
    }
    let valid = source
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| {
            matches!(
                value.to_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "webp" | "bmp"
            )
        })
        .unwrap_or(false);
    if !valid {
        return Err("Wan2.2 reference image must be PNG, JPG, WEBP, or BMP.".into());
    }
    Ok(Some(source))
}

fn facefusion_tool_dir() -> PathBuf {
    workspace_root().join("tools").join("facefusion")
}

fn facefusion_repo_dir() -> PathBuf {
    facefusion_tool_dir().join("repo")
}

fn miniforge_dir() -> PathBuf {
    workspace_root().join("tools").join("miniforge")
}

fn find_conda_in_dir(dir: &Path) -> Option<PathBuf> {
    [
        dir.join("Scripts").join("conda.exe"),
        dir.join("condabin").join("conda.exe"),
        dir.join("condabin").join("conda.bat"),
    ]
    .into_iter()
    .find(|path| path.exists())
}

fn facefusion_repo_ready() -> bool {
    facefusion_repo_dir().join("facefusion.py").exists()
}

struct SupirModelSpec {
    name: &'static str,
    label: &'static str,
    sign: &'static str,
    file_name: &'static str,
    description: &'static str,
    estimate: &'static str,
    required: bool,
    source_label: &'static str,
    download_url: &'static str,
    resolve_url: &'static str,
    direct_download: bool,
}

#[cfg(not(target_os = "linux"))]
struct SupirPreset {
    edm_steps: &'static str,
    s_cfg: &'static str,
    s_stage2: &'static str,
    spt_linear_cfg: &'static str,
    s_noise: &'static str,
    low_vram: bool,
}

#[cfg(target_os = "linux")]
fn supir_tool_dir() -> PathBuf { supir::root() }

#[cfg(not(target_os = "linux"))]
fn supir_tool_dir() -> PathBuf {
    workspace_root().join("tools").join("supir")
}

fn supir_repo_dir() -> PathBuf {
    supir_tool_dir().join("repo")
}

fn supir_checkpoint_dir() -> PathBuf {
    supir_tool_dir().join("checkpoints")
}

fn supir_requirements_path() -> PathBuf {
    supir_tool_dir().join("requirements-videomaxxxing.txt")
}

#[cfg(not(target_os = "linux"))]
fn supir_xformers_check_script_path() -> PathBuf {
    supir_tool_dir().join("check_xformers.py")
}

fn supir_sdxl_checkpoint_path() -> PathBuf {
    supir_checkpoint_dir().join("sd_xl_base_1.0_0.9vae.safetensors")
}

fn supir_repo_ready() -> bool {
    let repo = supir_repo_dir();
    repo.join("test.py").exists() && repo.join("SUPIR").exists()
}

fn supir_model_specs() -> Vec<SupirModelSpec> {
    vec![
        SupirModelSpec {
            name: "SDXL base 1.0 0.9 VAE",
            label: "Base model",
            sign: "sdxl",
            file_name: "sd_xl_base_1.0_0.9vae.safetensors",
            description: "Required base model used by SUPIR's restoration pipeline.",
            estimate: "~6.94 GB",
            required: true,
            source_label: "Hugging Face",
            download_url: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/sd_xl_base_1.0_0.9vae.safetensors",
            resolve_url: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0_0.9vae.safetensors",
            direct_download: true,
        },
        SupirModelSpec {
            name: "SUPIR-v0Q",
            label: "Recommended quality model",
            sign: "Q",
            file_name: "SUPIR-v0Q.ckpt",
            description: "Recommended quality model for general restoration.",
            estimate: "~5.33 GB",
            required: true,
            source_label: "Google Drive",
            download_url: "https://drive.google.com/drive/folders/1yELzm5SvAi9e7kPcO_jPp2XkTs4vK6aR?usp=sharing",
            resolve_url: "",
            direct_download: false,
        },
        SupirModelSpec {
            name: "SUPIR-v0F",
            label: "Optional fidelity model",
            sign: "F",
            file_name: "SUPIR-v0F.ckpt",
            description: "Optional model that keeps more original detail on lightly degraded images.",
            estimate: "~5.33 GB",
            required: false,
            source_label: "Google Drive",
            download_url: "https://drive.google.com/drive/folders/1yELzm5SvAi9e7kPcO_jPp2XkTs4vK6aR?usp=sharing",
            resolve_url: "",
            direct_download: false,
        },
    ]
}

fn supir_model_spec(model: &str) -> Option<SupirModelSpec> {
    let normalized = model.trim().to_lowercase();
    supir_model_specs().into_iter().find(|spec| {
        normalized == spec.name.to_lowercase()
            || normalized == spec.sign.to_lowercase()
            || normalized == spec.file_name.to_lowercase()
    })
}

fn downloads_dir() -> Option<PathBuf> {
    env::var("USERPROFILE")
        .ok()
        .map(PathBuf::from)
        .map(|path| path.join("Downloads"))
        .filter(|path| path.exists())
}

fn find_downloaded_checkpoint(file_name: &str) -> Option<PathBuf> {
    let downloads = downloads_dir()?;
    let direct = downloads.join(file_name);
    if direct.exists() {
        return Some(direct);
    }
    let stem = Path::new(file_name)
        .file_stem()?
        .to_string_lossy()
        .to_string();
    let extension = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let mut candidates = fs::read_dir(downloads)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .and_then(|value| value.to_str())
                    .is_some_and(|value| value.eq_ignore_ascii_case(extension))
                && path
                    .file_stem()
                    .and_then(|value| value.to_str())
                    .is_some_and(|value| value.starts_with(&stem))
        })
        .collect::<Vec<_>>();
    candidates.sort_by_key(|path| {
        fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .ok()
    });
    candidates.pop()
}

#[cfg(not(target_os = "linux"))]
fn supir_checkpoints_ready() -> bool {
    supir_sdxl_checkpoint_path().exists()
        && supir_model_specs()
            .iter()
            .filter(|spec| spec.sign == "Q" || spec.sign == "F")
            .any(|spec| supir_checkpoint_dir().join(spec.file_name).exists())
}

#[cfg(not(target_os = "linux"))]
fn supir_cuda_ready() -> bool {
    find_cuda_bin_dir().is_some() || env::var("CUDA_PATH").is_ok()
}

#[cfg(not(target_os = "linux"))]
fn write_supir_xformers_check_script() -> Result<PathBuf, String> {
    fs::create_dir_all(supir_tool_dir()).map_err(|err| err.to_string())?;
    let script_path = supir_xformers_check_script_path();
    fs::write(&script_path, SUPIR_XFORMERS_CHECK_SCRIPT.trim_start())
        .map_err(|err| format!("Failed to write SUPIR xFormers check script: {err}"))?;
    Ok(script_path)
}

#[cfg(not(target_os = "linux"))]
fn install_supir_xformers_stages(
    app: &tauri::AppHandle,
    conda: &str,
    repo_dir: &Path,
    full_log: &mut String,
) -> Result<(), String> {
    let script_path = write_supir_xformers_check_script()?;

    let mut install_xformers = Command::new(conda);
    install_xformers.args([
        "run",
        "--no-capture-output",
        "-n",
        SUPIR_ENV_NAME,
        "python",
        "-m",
        "pip",
        "install",
        "--upgrade",
        SUPIR_XFORMERS_VERSION,
        "--no-deps",
        "--only-binary=:all:",
    ]);
    run_stage(
        app,
        "SUPIR xFormers",
        &mut install_xformers,
        Some(repo_dir.to_path_buf()),
        None,
        full_log,
    )?;

    let mut xformers_info = Command::new(conda);
    xformers_info.args([
        "run",
        "--no-capture-output",
        "-n",
        SUPIR_ENV_NAME,
        "python",
        "-m",
        "xformers.info",
    ]);
    run_stage(
        app,
        "SUPIR xFormers check",
        &mut xformers_info,
        Some(repo_dir.to_path_buf()),
        None,
        full_log,
    )?;

    let mut xformers_smoke = Command::new(conda);
    xformers_smoke.args(["run", "--no-capture-output", "-n", SUPIR_ENV_NAME, "python"]);
    xformers_smoke.arg(script_path);
    run_stage(
        app,
        "SUPIR xFormers check",
        &mut xformers_smoke,
        Some(repo_dir.to_path_buf()),
        None,
        full_log,
    )
}

fn compact_status_message(message: &str) -> String {
    let normalized = message.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.len() <= 240 {
        return normalized;
    }
    format!("{}...", &normalized[..240])
}

#[cfg(not(target_os = "linux"))]
fn supir_xformers_probe(conda: &str) -> (bool, String, String) {
    let Ok(script_path) = write_supir_xformers_check_script() else {
        return (
            false,
            String::new(),
            "Could not write xFormers validation script.".to_string(),
        );
    };
    let output = Command::new(conda)
        .args(["run", "-n", SUPIR_ENV_NAME, "python"])
        .arg(script_path)
        .output();
    let Ok(output) = output else {
        return (
            false,
            String::new(),
            "Could not run xFormers validation.".to_string(),
        );
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let parsed = stdout
        .lines()
        .rev()
        .find_map(|line| serde_json::from_str::<Value>(line.trim()).ok());
    if let Some(value) = parsed {
        let ready = output.status.success()
            && value
                .get("ready")
                .and_then(|item| item.as_bool())
                .unwrap_or(false);
        let version = value
            .get("version")
            .and_then(|item| item.as_str())
            .unwrap_or_default()
            .to_string();
        let message = value
            .get("message")
            .and_then(|item| item.as_str())
            .unwrap_or_default()
            .to_string();
        let message = compact_status_message(&message);
        return (ready, version, message);
    }

    let message = format!("{} {}", stdout.trim(), stderr.trim())
        .trim()
        .to_string();
    (
        false,
        String::new(),
        compact_status_message(default_if_empty(
            &message,
            "xFormers validation did not return a usable result.",
        )),
    )
}

#[cfg(target_os = "linux")]
fn supir_status() -> SupirStatus { supir::status() }

#[cfg(not(target_os = "linux"))]
fn supir_status() -> SupirStatus {
    let repo_ready = supir_repo_ready();
    let conda = find_tool("conda");
    let env_ready = conda
        .as_deref()
        .map(|path| conda_named_env_ready(path, SUPIR_ENV_NAME))
        .unwrap_or(false);
    let cuda_ready = supir_cuda_ready();
    let checkpoints_ready = supir_checkpoints_ready();
    let (xformers_ready, xformers_version, xformers_message) = if !repo_ready {
        (
            false,
            String::new(),
            "SUPIR repo is not installed.".to_string(),
        )
    } else if env_ready && cuda_ready {
        conda
            .as_deref()
            .map(supir_xformers_probe)
            .unwrap_or_else(|| {
                (
                    false,
                    String::new(),
                    "Conda was not found in PATH.".to_string(),
                )
            })
    } else if !env_ready {
        (
            false,
            String::new(),
            format!("Conda env {SUPIR_ENV_NAME} is not ready."),
        )
    } else {
        (
            false,
            String::new(),
            "CUDA is required before validating xFormers.".to_string(),
        )
    };
    let checkpoint_path = supir_checkpoint_dir();
    let (state, message) = if !repo_ready {
        (
            "missing".to_string(),
            "SUPIR repo is not installed. Checkpoints are managed manually because the upstream files are hosted outside GitHub releases.".to_string(),
        )
    } else if conda.is_none() {
        (
            "needs_setup".to_string(),
            "SUPIR repo exists, but Conda was not found in PATH.".to_string(),
        )
    } else if !env_ready {
        (
            "needs_setup".to_string(),
            format!("SUPIR repo exists, but Conda env {SUPIR_ENV_NAME} is not ready."),
        )
    } else if !cuda_ready {
        (
            "needs_setup".to_string(),
            "SUPIR is installed, but CUDA was not detected. SUPIR's upstream script requires CUDA."
                .to_string(),
        )
    } else if !xformers_ready {
        (
            "needs_setup".to_string(),
            format!("SUPIR xFormers acceleration is not ready. {xformers_message}"),
        )
    } else if !checkpoints_ready {
        (
            "needs_setup".to_string(),
            format!(
                "SUPIR is installed. Add sd_xl_base_1.0_0.9vae.safetensors and SUPIR-v0Q.ckpt or SUPIR-v0F.ckpt to {}.",
                checkpoint_path.display()
            ),
        )
    } else {
        (
            "installed".to_string(),
            "SUPIR repo, Conda environment, CUDA, and checkpoints are ready.".to_string(),
        )
    };

    SupirStatus {
        state,
        repo_path: supir_repo_dir().to_string_lossy().to_string(),
        env_name: SUPIR_ENV_NAME.to_string(),
        checkpoint_path: checkpoint_path.to_string_lossy().to_string(),
        current_size_label: format_bytes(dir_size(&supir_tool_dir())),
        estimated_install_label: "~20-80 GB depending on checkpoints".to_string(),
        cuda_ready,
        checkpoints_ready,
        xformers_ready,
        xformers_version,
        xformers_message,
        cuda_devices: None,
        message,
    }
}

#[cfg(not(target_os = "linux"))]
fn supir_preset(preset: &str) -> SupirPreset {
    match preset {
        "fidelity" => SupirPreset {
            edm_steps: "50",
            s_cfg: "7.5",
            s_stage2: "1",
            spt_linear_cfg: "4.0",
            s_noise: "1.003",
            low_vram: false,
        },
        "low_vram" => SupirPreset {
            edm_steps: "30",
            s_cfg: "6.0",
            s_stage2: "1",
            spt_linear_cfg: "3.0",
            s_noise: "1.001",
            low_vram: true,
        },
        _ => SupirPreset {
            edm_steps: "50",
            s_cfg: "7.5",
            s_stage2: "1",
            spt_linear_cfg: "4.0",
            s_noise: "1.003",
            low_vram: false,
        },
    }
}

fn set_yaml_scalar(content: &str, key: &str, value: &Path) -> String {
    let value = value.to_string_lossy().replace('\\', "/");
    let mut found = false;
    let mut lines = Vec::new();
    for line in content.lines() {
        let indent_len = line.len() - line.trim_start().len();
        if line.trim_start().starts_with(&format!("{key}:")) {
            lines.push(format!("{}{}: {}", &line[..indent_len], key, value));
            found = true;
        } else {
            lines.push(line.to_string());
        }
    }
    if !found {
        lines.push(format!("{key}: {value}"));
    }
    lines.join("\n")
}

fn is_supir_managed_dependency(dependency: &str) -> bool {
    let normalized = dependency.trim().to_lowercase();
    [
        "fastapi",
        "gradio",
        "gradio_client",
        "gradio_imageslider",
        "torch",
        "torchvision",
        "torchaudio",
        "triton",
        "uvicorn",
        "xformers",
    ]
    .iter()
    .any(|name| {
        normalized == *name
            || normalized.starts_with(&format!("{name}=="))
            || normalized.starts_with(&format!("{name}>"))
            || normalized.starts_with(&format!("{name}<"))
            || normalized.starts_with(&format!("{name}~"))
            || normalized.starts_with(&format!("{name}["))
    })
}

fn write_supir_runtime_files() -> Result<(), String> {
    fs::create_dir_all(supir_checkpoint_dir()).map_err(|err| err.to_string())?;
    let repo_dir = supir_repo_dir();
    let source_requirements = repo_dir.join("requirements.txt");
    let requirements = fs::read_to_string(&source_requirements)
        .map_err(|err| format!("Failed to read {}: {err}", source_requirements.display()))?;
    let filtered = requirements
        .split_whitespace()
        .filter(|dependency| !is_supir_managed_dependency(dependency))
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(supir_requirements_path(), filtered)
        .map_err(|err| format!("Failed to write SUPIR requirements: {err}"))?;

    let ckpt_paths = r#"LLAVA_CLIP_PATH = None
LLAVA_MODEL_PATH = 'liuhaotian/llava-v1.5-13b'
SDXL_CLIP1_PATH = None
SDXL_CLIP2_CKPT_PTH = None
"#;
    fs::write(repo_dir.join("CKPT_PTH.py"), ckpt_paths)
        .map_err(|err| format!("Failed to write SUPIR checkpoint paths: {err}"))?;

    let options_path = repo_dir.join("options").join("SUPIR_v0.yaml");
    if options_path.exists() {
        let original = fs::read_to_string(&options_path).map_err(|err| err.to_string())?;
        let updated = set_yaml_scalar(&original, "SDXL_CKPT", &supir_sdxl_checkpoint_path());
        let updated = set_yaml_scalar(
            &updated,
            "SUPIR_CKPT_F",
            &supir_checkpoint_dir().join("SUPIR-v0F.ckpt"),
        );
        let updated = set_yaml_scalar(
            &updated,
            "SUPIR_CKPT_Q",
            &supir_checkpoint_dir().join("SUPIR-v0Q.ckpt"),
        );
        fs::write(&options_path, updated)
            .map_err(|err| format!("Failed to patch SUPIR options: {err}"))?;
    }

    Ok(())
}

fn facefusion_status() -> FaceFusionStatus {
    let repo_path = facefusion_repo_dir();
    let current_bytes = dir_size(&facefusion_tool_dir());
    let estimated_install_label = "~2-8 GB depending on runtime and models".to_string();
    let repo_ready = repo_path.join("facefusion.py").exists();
    let conda = find_tool("conda");
    let env_ready = conda.as_deref().map(conda_env_ready).unwrap_or(false);
    let (available_providers, provider_warning) = if env_ready {
        conda
            .as_deref()
            .map(facefusion_available_providers)
            .unwrap_or_else(|| (Vec::new(), String::new()))
    } else {
        (Vec::new(), String::new())
    };
    let runtime_label = facefusion_runtime_label(&available_providers);
    let (state, message) = if !repo_ready {
        (
            "missing".to_string(),
            "FaceFusion repo is not installed.".to_string(),
        )
    } else if conda.is_none() {
        (
            "needs_setup".to_string(),
            "FaceFusion repo exists, but Conda was not found in PATH.".to_string(),
        )
    } else if !env_ready {
        (
            "needs_setup".to_string(),
            format!("FaceFusion repo exists, but Conda env {FACEFUSION_ENV_NAME} is not ready."),
        )
    } else {
        (
            "installed".to_string(),
            "FaceFusion repo and Conda environment are ready.".to_string(),
        )
    };

    FaceFusionStatus {
        state,
        repo_path: repo_path.to_string_lossy().to_string(),
        env_name: FACEFUSION_ENV_NAME.to_string(),
        current_size_label: format_bytes(current_bytes),
        estimated_install_label,
        available_providers,
        runtime_label,
        provider_warning,
        message,
    }
}

fn conda_env_ready(conda: &str) -> bool {
    conda_named_env_ready(conda, FACEFUSION_ENV_NAME)
}

fn conda_named_env_ready(conda: &str, env_name: &str) -> bool {
    let mut command = Command::new(conda);
    command.args(["run", "-n", env_name, "python", "--version"]);
    shared_runtime::configure(&workspace_root(), &mut command)
        .and_then(|_| command.output().map_err(|err| err.to_string()))
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn facefusion_available_providers(conda: &str) -> (Vec<String>, String) {
    let output = Command::new(conda)
        .args([
            "run",
            "-n",
            FACEFUSION_ENV_NAME,
            "python",
            "-c",
            "import json, onnxruntime as ort; print(json.dumps(ort.get_available_providers()))",
        ])
        .output();
    let Ok(output) = output else {
        return (
            Vec::new(),
            "Failed to probe ONNX Runtime providers.".to_string(),
        );
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let providers = stdout
        .lines()
        .rev()
        .find_map(|line| serde_json::from_str::<Vec<String>>(line.trim()).ok())
        .unwrap_or_default();
    let warning = stderr
        .lines()
        .filter(|line| {
            let lower = line.to_lowercase();
            lower.contains("error")
                || lower.contains("fail")
                || lower.contains("missing")
                || lower.contains("cuda")
        })
        .take(4)
        .collect::<Vec<_>>()
        .join("\n");
    (providers, warning)
}

fn facefusion_runtime_label(providers: &[String]) -> String {
    let labels: Vec<&str> = [
        ("CUDAExecutionProvider", "CUDA"),
        ("DmlExecutionProvider", "DirectML"),
        ("OpenVINOExecutionProvider", "OpenVINO"),
        ("CPUExecutionProvider", "CPU"),
    ]
    .into_iter()
    .filter_map(|(provider, label)| {
        providers
            .iter()
            .any(|item| item == provider)
            .then_some(label)
    })
    .collect();
    if labels.is_empty() {
        "Unknown".to_string()
    } else {
        labels.join(" + ")
    }
}

fn facefusion_processors(preset: &str) -> Vec<&'static str> {
    match preset {
        "face_enhance" => vec!["face_enhancer"],
        "swap_enhance" => vec!["face_swapper", "face_enhancer"],
        _ => vec!["face_swapper"],
    }
}

fn facefusion_provider(provider: &str) -> &'static str {
    match provider.to_lowercase().as_str() {
        "cuda" => "cuda",
        "openvino" => "openvino",
        "cpu" | "default" => "cpu",
        _ => "directml",
    }
}

fn push_existing_runtime_path(paths: &mut Vec<PathBuf>, path: &str) {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return;
    }
    let candidate = PathBuf::from(trimmed);
    if candidate.exists() {
        paths.push(candidate);
    }
}

fn write_facefusion_launcher(
    temp_dir: &Path,
    repo_dir: &Path,
    runtime_paths: &[PathBuf],
) -> Result<PathBuf, String> {
    let launcher_path = temp_dir.join("run_facefusion_with_dll_dirs.py");
    let facefusion_script = repo_dir.join("facefusion.py");
    let paths_json = serde_json::to_string(
        &runtime_paths
            .iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect::<Vec<_>>(),
    )
    .map_err(|err| err.to_string())?;
    let script_json = serde_json::to_string(&facefusion_script.to_string_lossy())
        .map_err(|err| err.to_string())?;
    let launcher = format!(
        r#"import os
import runpy
import sys

repo_dir = os.path.dirname({script_json})
for dll_dir in {paths_json}:
    if dll_dir and os.path.isdir(dll_dir):
        os.add_dll_directory(dll_dir)

facefusion_script = {script_json}
os.chdir(repo_dir)
sys.path.insert(0, repo_dir)
sys.argv = [facefusion_script] + sys.argv[1:]
runpy.run_path(facefusion_script, run_name="__main__")
"#
    );
    fs::write(&launcher_path, launcher)
        .map_err(|err| format!("Failed to write FaceFusion CUDA launcher: {err}"))?;
    Ok(launcher_path)
}

fn prepend_paths_env(command: &mut Command, paths: &[PathBuf]) {
    if paths.is_empty() {
        return;
    }
    let separator = if cfg!(windows) { ";" } else { ":" };
    let current = env::var("PATH").unwrap_or_default();
    let prefix = paths
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(separator);
    command.env(
        "PATH",
        if current.is_empty() {
            prefix
        } else {
            format!("{prefix}{separator}{current}")
        },
    );
}

trait StringifyTools {
    fn stringify(self) -> ToolStatus;
}

impl StringifyTools for ToolStatus {
    fn stringify(self) -> ToolStatus {
        self
    }
}

fn find_tool(name: &str) -> Option<String> {
    if name == "realesrgan-ncnn-vulkan" {
        return realesrgan::executable().map(|p|p.to_string_lossy().into());
    }
    if !cfg!(windows) && matches!(name, "ffmpeg" | "ffprobe") {
        return path_tool_candidates(name)
            .into_iter()
            .find(|path| path.is_file())
            .map(|path| path.to_string_lossy().to_string());
    }

    local_tool_candidates(name)
        .into_iter()
        .chain(path_tool_candidates(name))
        .find(|path| path.exists())
        .map(|path| path.to_string_lossy().to_string())
}

fn find_cudnn_runtime() -> Option<String> {
    find_tool("cudnn64_9.dll")
        .or_else(|| find_cudnn_dll().map(|path| path.to_string_lossy().to_string()))
}

#[cfg(windows)]
fn windows_developer_mode_enabled() -> bool {
    let output = Command::new("reg")
        .args([
            "query",
            r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock",
            "/v",
            "AllowDevelopmentWithoutDevLicense",
        ])
        .output();
    let Ok(output) = output else {
        return false;
    };
    if !output.status.success() {
        return false;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
    stdout.contains("allowdevelopmentwithoutdevlicense") && stdout.contains("0x1")
}

#[cfg(not(windows))]
fn windows_developer_mode_enabled() -> bool {
    false
}

fn find_cuda_bin_dir() -> Option<PathBuf> {
    let root = PathBuf::from(r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA");
    let mut candidates = Vec::new();
    if let Ok(entries) = fs::read_dir(&root) {
        for entry in entries.flatten() {
            let path = entry.path().join("bin");
            if path.join("cublasLt64_12.dll").exists() {
                candidates.push(path);
            }
        }
    }
    candidates.sort_by(|left, right| right.to_string_lossy().cmp(&left.to_string_lossy()));
    candidates.into_iter().next()
}

fn find_cudnn_bin_dir() -> Option<PathBuf> {
    find_cudnn_dll().and_then(|path| path.parent().map(Path::to_path_buf))
}

fn find_cudnn_dll() -> Option<PathBuf> {
    let root = PathBuf::from(r"C:\Program Files\NVIDIA\CUDNN");
    find_file_recursive_limited(&root, "cudnn64_9.dll", 6)
}

fn find_file_recursive_limited(root: &Path, file_name: &str, max_depth: usize) -> Option<PathBuf> {
    if max_depth == 0 || !root.exists() {
        return None;
    }

    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file()
            && path
                .file_name()
                .is_some_and(|name| name.to_string_lossy().eq_ignore_ascii_case(file_name))
        {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_file_recursive_limited(&path, file_name, max_depth - 1) {
                return Some(found);
            }
        }
    }
    None
}

fn local_tool_candidates(name: &str) -> Vec<PathBuf> {
    let root = workspace_root();
    match name {
        "rife-ncnn-vulkan" => vec![root
            .join("tools")
            .join("rife-ncnn-vulkan")
            .join("rife-ncnn-vulkan.exe")],
        "ffmpeg" => vec![root.join("tools").join("ffmpeg").join("ffmpeg.exe")],
        "ffprobe" => vec![root.join("tools").join("ffmpeg").join("ffprobe.exe")],
        "magick" => vec![root.join("tools").join("imagemagick").join("magick.exe")],
        "oxipng" => vec![root.join("tools").join("oxipng").join("oxipng.exe")],
        "avifenc" => vec![root.join("tools").join("libavif").join("avifenc.exe")],
        "avifdec" => vec![root.join("tools").join("libavif").join("avifdec.exe")],
        "cwebp" => vec![root.join("tools").join("libwebp").join("cwebp.exe")],
        "dwebp" => vec![root.join("tools").join("libwebp").join("dwebp.exe")],
        "gif2webp" => vec![root.join("tools").join("libwebp").join("gif2webp.exe")],
        "img2webp" => vec![root.join("tools").join("libwebp").join("img2webp.exe")],
        "cjpeg" => vec![root.join("tools").join("mozjpeg").join("cjpeg.exe")],
        "jpegtran" => vec![root.join("tools").join("mozjpeg").join("jpegtran.exe")],
        "conda" => vec![
            root.join("tools")
                .join("miniforge")
                .join("Scripts")
                .join("conda.exe"),
            root.join("tools")
                .join("miniforge")
                .join("condabin")
                .join("conda.exe"),
            root.join("tools")
                .join("miniforge")
                .join("condabin")
                .join("conda.bat"),
        ],
        _ => Vec::new(),
    }
}

fn realesrgan_models_dir() -> Result<PathBuf, String> {
    let executable = find_tool("realesrgan-ncnn-vulkan").ok_or("Real-ESRGAN was not found.")?;
    Ok(PathBuf::from(executable)
        .parent()
        .ok_or("Real-ESRGAN path has no parent directory.")?
        .join("models"))
}

fn rife_model_dirs() -> Result<Vec<PathBuf>, String> {
    let executable = find_tool("rife-ncnn-vulkan").ok_or("RIFE was not found.")?;
    let tool_dir = executable_parent(&executable)?;
    Ok(vec![tool_dir.join("models"), tool_dir])
}

fn delete_realesrgan_model(model: &str) -> Result<(), String> {
    let _guard = realesrgan::lock()?;
    if !realesrgan::valid_name(model) { return Err("Invalid Real-ESRGAN model name".into()); }
    realesrgan::invalidate();
    let models_dir = realesrgan_models_dir()?;
    for extension in ["param", "bin"] {
        let path = models_dir.join(format!("{model}.{extension}"));
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|err| format!("Failed to remove {}: {err}", path.display()))?;
        }
    }
    Ok(())
}

fn delete_rife_model(model: &str) -> Result<(), String> {
    for dir in rife_model_dirs()? {
        let path = dir.join(model);
        if path.is_dir() {
            fs::remove_dir_all(&path)
                .map_err(|err| format!("Failed to remove {}: {err}", path.display()))?;
        }
    }
    Ok(())
}


fn prune_rife_models(keep: &[String]) -> Result<(), String> {
    let keep: Vec<&str> = keep.iter().map(String::as_str).collect();
    for model in list_rife_models()? {
        if !keep.contains(&model.name.as_str()) {
            delete_rife_model(&model.name)?;
        }
    }
    Ok(())
}

fn realesrgan_model_description(name: &str) -> String {
    match name {
        value if value.contains("anime") => {
            "Anime/cartoon line art and stylized video upscaling.".to_string()
        }
        value if value.contains("general") => {
            "General photo/video restoration model with optional denoise variants.".to_string()
        }
        value if value.contains("plus") => {
            "General-purpose Real-ESRGAN model for natural images and video frames.".to_string()
        }
        _ => "Real-ESRGAN frame upscaling model.".to_string(),
    }
}

fn realesrgan_model_estimate(name: &str) -> &'static str {
    match name {
        value if value.contains("anime") => "~15-35 MB",
        value if value.contains("general") => "~50-140 MB",
        _ => "~60-180 MB",
    }
}

fn rife_model_description(name: &str) -> String {
    match name {
        value if value.contains("v4.6") => {
            "Recommended general RIFE interpolation model for most videos.".to_string()
        }
        value if value.contains("v4") => {
            "RIFE v4 model family; best match for current ncnn custom timestep support.".to_string()
        }
        value if value.contains("anime") => {
            "Interpolation tuned for animation/anime-style content.".to_string()
        }
        _ => "RIFE frame interpolation model.".to_string(),
    }
}

fn rife_model_estimate(name: &str) -> &'static str {
    match name {
        value if value.contains("v4") => "~40-160 MB",
        _ => "~50-250 MB",
    }
}

fn path_tool_candidates(name: &str) -> Vec<PathBuf> {
    let mut names = vec![name.to_string()];
    if cfg!(windows) && !name.ends_with(".exe") {
        names.push(format!("{name}.exe"));
        names.push(format!("{name}.cmd"));
        names.push(format!("{name}.bat"));
    }

    env::var_os("PATH")
        .into_iter()
        .flat_map(|paths| env::split_paths(&paths).collect::<Vec<_>>())
        .flat_map(|dir| names.iter().map(move |name| dir.join(name)))
        .collect()
}

fn workspace_root() -> PathBuf {
    let current = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    for path in current.ancestors() {
        if path.join("tools").exists()
            && (path.join("app").exists() || path.join("tauri-video-tools").exists())
        {
            return path.to_path_buf();
        }
    }
    current
}

fn thumbnail_dir(input_path: &Path) -> Result<PathBuf, String> {
    let metadata = fs::metadata(input_path).map_err(|err| err.to_string())?;
    let mut hasher = DefaultHasher::new();
    input_path
        .to_string_lossy()
        .to_lowercase()
        .hash(&mut hasher);
    metadata.len().hash(&mut hasher);
    if let Ok(modified) = metadata.modified() {
        modified.hash(&mut hasher);
    }
    Ok(workspace_root()
        .join("temp")
        .join("tauri_thumbnails")
        .join(format!("{:016x}", hasher.finish())))
}

fn create_thumbnail(
    ffmpeg: &str,
    input_path: &Path,
    output_path: &Path,
    time: f64,
    filter: &str,
    jpeg_quality: &str,
) -> Result<(), String> {
    let fast = Command::new(ffmpeg)
        .args(["-hide_banner", "-loglevel", "error", "-y", "-ss"])
        .arg(format!("{time:.3}"))
        .arg("-i")
        .arg(input_path)
        .args([
            "-frames:v",
            "1",
            "-vf",
            filter,
            "-q:v",
            jpeg_quality,
            "-update",
            "1",
        ])
        .arg(output_path)
        .output()
        .map_err(|err| format!("Failed to run FFmpeg: {err}"))?;

    if fast.status.success() && output_path.exists() {
        return Ok(());
    }

    let accurate = Command::new(ffmpeg)
        .args(["-hide_banner", "-loglevel", "error", "-y"])
        .arg("-i")
        .arg(input_path)
        .arg("-ss")
        .arg(format!("{time:.3}"))
        .args([
            "-frames:v",
            "1",
            "-vf",
            filter,
            "-q:v",
            jpeg_quality,
            "-update",
            "1",
        ])
        .arg(output_path)
        .output()
        .map_err(|err| format!("Failed to run FFmpeg: {err}"))?;

    if accurate.status.success() && output_path.exists() {
        Ok(())
    } else {
        let fast_error = String::from_utf8_lossy(&fast.stderr);
        let accurate_error = String::from_utf8_lossy(&accurate.stderr);
        Err(format!("{fast_error}{accurate_error}").trim().to_string())
    }
}

fn create_frame_png(
    ffmpeg: &str,
    input_path: &Path,
    output_path: &Path,
    time: f64,
) -> Result<(), String> {
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    let attempts = [
        vec![
            "-hide_banner".to_string(),
            "-loglevel".to_string(),
            "error".to_string(),
            "-y".to_string(),
            "-ss".to_string(),
            format!("{time:.3}"),
            "-i".to_string(),
        ],
        vec![
            "-hide_banner".to_string(),
            "-loglevel".to_string(),
            "error".to_string(),
            "-y".to_string(),
            "-i".to_string(),
        ],
    ];

    let mut last_error = String::new();
    for (index, mut args) in attempts.into_iter().enumerate() {
        let mut command = Command::new(ffmpeg);
        command.args(args.drain(..));
        command.arg(input_path);
        if index == 1 {
            command.arg("-ss").arg(format!("{time:.3}"));
        }
        command
            .args(["-frames:v", "1", "-update", "1"])
            .arg(output_path);
        let output = command
            .output()
            .map_err(|err| format!("Failed to run FFmpeg at {ffmpeg}: {err}"))?;
        if output.status.success() && output_path.exists() {
            return Ok(());
        }
        last_error = String::from_utf8_lossy(&output.stderr).trim().to_string();
    }

    Err(if last_error.is_empty() {
        "FFmpeg failed without output.".to_string()
    } else {
        last_error
    })
}

fn image_data_url(path: &Path, mime_type: &str) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|err| err.to_string())?;
    Ok(format!(
        "data:{mime_type};base64,{}",
        general_purpose::STANDARD.encode(bytes)
    ))
}

fn write_data_url_to_path(data_url: &str, path: &Path) -> Result<(), String> {
    let (_, encoded) = data_url
        .split_once(',')
        .ok_or("Data URL did not contain encoded data.")?;
    let bytes = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|err| format!("Data URL decode failed: {err}"))?;
    fs::write(path, bytes).map_err(|err| err.to_string())
}

fn output_gif_name(name: &str) -> String {
    let cleaned = safe_output_filename(name, "image_dither.gif");
    if Path::new(&cleaned)
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("gif"))
    {
        cleaned
    } else {
        let stem = Path::new(&cleaned)
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or(&cleaned);
        format!("{stem}.gif")
    }
}

fn concat_file_path(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .replace('\'', "'\\''")
}

fn probe_image_dimensions(path: &Path) -> Result<(u64, u64), String> {
    let ffprobe = find_tool("ffprobe").ok_or("FFprobe was not found.")?;
    let output = Command::new(ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "json",
        ])
        .arg(path)
        .output()
        .map_err(|err| format!("Failed to run FFprobe: {err}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let data: Value = serde_json::from_slice(&output.stdout).map_err(|err| err.to_string())?;
    let stream = data["streams"]
        .as_array()
        .and_then(|streams| streams.first())
        .ok_or("FFprobe did not report an image stream.")?;
    Ok((
        stream["width"].as_u64().unwrap_or(0),
        stream["height"].as_u64().unwrap_or(0),
    ))
}

fn gif_frame_delays_ms(path: &Path, frame_count: usize) -> Vec<u64> {
    let fallback = vec![100; frame_count];
    let Some(ffprobe) = find_tool("ffprobe") else {
        return fallback;
    };
    let Ok(output) = Command::new(ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "frame=pkt_duration_time,duration_time",
            "-of",
            "json",
        ])
        .arg(path)
        .output()
    else {
        return fallback;
    };
    if !output.status.success() {
        return fallback;
    }
    let Ok(data) = serde_json::from_slice::<Value>(&output.stdout) else {
        return fallback;
    };
    let Some(frames) = data["frames"].as_array() else {
        return fallback;
    };
    let mut delays = frames
        .iter()
        .filter_map(|frame| {
            frame["pkt_duration_time"]
                .as_str()
                .or_else(|| frame["duration_time"].as_str())
                .and_then(|value| value.parse::<f64>().ok())
                .filter(|value| *value > 0.0)
                .map(|value| (value * 1000.0).round() as u64)
        })
        .collect::<Vec<_>>();
    if delays.is_empty() {
        return fallback;
    }
    while delays.len() < frame_count {
        let last = delays.last().copied().unwrap_or(100);
        delays.push(last);
    }
    delays.truncate(frame_count);
    delays
}

fn count_files_with_extension(dir: &Path, extension: &str) -> Result<usize, String> {
    let mut total = 0;
    for entry in fs::read_dir(dir).map_err(|err| err.to_string())? {
        let path = entry.map_err(|err| err.to_string())?.path();
        if path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case(extension))
        {
            total += 1;
        }
    }
    Ok(total)
}

fn find_file_by_name(root: &Path, name: &str) -> Option<PathBuf> {
    for entry in fs::read_dir(root).ok()? {
        let path = entry.ok()?.path();
        if path
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case(name))
        {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_file_by_name(&path, name) {
                return Some(found);
            }
        }
    }
    None
}

fn find_first_file_with_extension(root: &Path, extension: &str) -> Option<PathBuf> {
    for entry in fs::read_dir(root).ok()? {
        let path = entry.ok()?.path();
        if path.is_dir() {
            if let Some(found) = find_first_file_with_extension(&path, extension) {
                return Some(found);
            }
        } else if path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case(extension))
        {
            return Some(path);
        }
    }
    None
}

fn copy_dir_all(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|err| err.to_string())?;
    for entry in fs::read_dir(source).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if source_path.is_dir() {
            copy_dir_all(&source_path, &destination_path)?;
        } else {
            fs::copy(&source_path, &destination_path).map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

fn rife_model_path(executable: &str, model: &str) -> Result<PathBuf, String> {
    let tool_dir = executable_parent(executable)?;
    let direct = tool_dir.join(model);
    if direct.exists() {
        return Ok(direct);
    }
    let nested = tool_dir.join("models").join(model);
    if nested.exists() {
        return Ok(nested);
    }
    Err(format!("RIFE model not found: {model}"))
}

fn executable_parent(path: impl AsRef<Path>) -> Result<PathBuf, String> {
    path.as_ref()
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Executable path has no parent directory.".to_string())
}

fn timestamp_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    millis.to_string()
}

fn default_if_empty<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback
    } else {
        trimmed
    }
}

fn realesrgan_model_scale(model: &str) -> String {
    if model.contains("-x2") || model.ends_with("x2") {
        "2".to_string()
    } else if model.contains("-x3") || model.ends_with("x3") {
        "3".to_string()
    } else {
        "4".to_string()
    }
}

fn add_trim_args(command: &mut Command, start: f64, end: f64) {
    let safe_start = start.max(0.0);
    let duration = (end - safe_start).max(0.0);
    if safe_start > 0.0 {
        command.arg("-ss").arg(format!("{safe_start:.3}"));
    }
    if duration > 0.0 {
        command.arg("-t").arg(format!("{duration:.3}"));
    }
}

fn output_name_with_extension(name: &str, action: &str, audio_format: Option<&str>) -> String {
    let trimmed = name.trim();
    let fallback = "output";
    let stem = if trimmed.is_empty() {
        fallback
    } else {
        trimmed
    };
    let extension = match action {
        "extract_frame" => ".png",
        "video_audio" if audio_format == Some("wav") => ".wav",
        "video_audio" => ".mp3",
        _ => ".mp4",
    };

    let desired = extension.trim_start_matches('.');
    let path = Path::new(stem);
    let current = path.extension().and_then(|value| value.to_str());
    let candidate = if current.is_some_and(|value| value.eq_ignore_ascii_case(desired)) {
        stem.to_string()
    } else {
        let clean_stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or(stem);
        format!("{clean_stem}{extension}")
    };
    safe_output_filename(&candidate, &format!("output{extension}"))
}

fn output_image_name(name: &str, input_path: &Path, suffix: &str) -> String {
    let fallback_stem = input_path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("image");
    let fallback = format!("{fallback_stem}_{suffix}.png");
    let cleaned = safe_output_filename(name, &fallback);
    if Path::new(&cleaned)
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("png"))
    {
        cleaned
    } else {
        let stem = Path::new(&cleaned)
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or(&cleaned);
        format!("{stem}.png")
    }
}

fn output_video_name(name: &str, fallback: &str) -> String {
    let cleaned = safe_output_filename(name, fallback);
    if Path::new(&cleaned)
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("mp4"))
    {
        cleaned
    } else {
        let stem = Path::new(&cleaned)
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or(&cleaned);
        format!("{stem}.mp4")
    }
}

fn unique_output_path(folder: &Path, file_name: &str) -> PathBuf {
    let base_path = folder.join(file_name);
    if !base_path.exists() {
        return base_path;
    }

    let path = Path::new(file_name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("output");
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty());

    for index in 2..10_000 {
        let candidate_name = match extension {
            Some(extension) => format!("{stem}_{index}.{extension}"),
            None => format!("{stem}_{index}"),
        };
        let candidate_path = folder.join(candidate_name);
        if !candidate_path.exists() {
            return candidate_path;
        }
    }

    let fallback = match extension {
        Some(extension) => format!("{stem}_{}.{}", timestamp_id(), extension),
        None => format!("{}_{}", stem, timestamp_id()),
    };
    folder.join(fallback)
}

fn normalized_audio_format(format: &str) -> &'static str {
    match format.trim().to_lowercase().as_str() {
        "wav" => "wav",
        "flac" => "flac",
        "m4a" | "aac" => "m4a",
        "ogg" | "opus" => "ogg",
        _ => "mp3",
    }
}

fn audio_output_name(name: &str, input_path: &Path, format: &str) -> String {
    let fallback_stem = input_path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("audio");
    let fallback = format!("{fallback_stem}_{format}.{format}");
    let cleaned = safe_output_filename(name, &fallback);
    if Path::new(&cleaned)
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case(format))
    {
        cleaned
    } else {
        let stem = Path::new(&cleaned)
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or(&cleaned);
        format!("{stem}.{format}")
    }
}

fn add_audio_encode_args(
    command: &mut Command,
    format: &str,
    options: &AudioJobOptions,
) -> Result<(), String> {
    match format {
        "wav" => {
            command.args(["-c:a", "pcm_s16le"]);
        }
        "flac" => {
            command.args(["-c:a", "flac", "-compression_level", "8"]);
        }
        "m4a" => {
            command.args(["-c:a", "aac"]);
            push_audio_bitrate(command, &options.bitrate, "192k");
        }
        "ogg" => {
            command.args(["-c:a", "libvorbis"]);
            push_audio_bitrate(command, &options.bitrate, "192k");
        }
        "mp3" => {
            command.args(["-c:a", "libmp3lame"]);
            push_audio_bitrate(command, &options.bitrate, "192k");
        }
        _ => return Err("Unsupported audio format.".into()),
    }

    if let Some(sample_rate) = normalized_sample_rate(&options.sample_rate) {
        command.arg("-ar").arg(sample_rate);
    }
    if let Some(channels) = normalized_channels(&options.channels) {
        command.arg("-ac").arg(channels);
    }
    Ok(())
}

fn push_audio_bitrate(command: &mut Command, bitrate: &str, fallback: &str) {
    let value = match bitrate.trim() {
        "96k" | "128k" | "160k" | "192k" | "256k" | "320k" => bitrate.trim(),
        _ => fallback,
    };
    command.arg("-b:a").arg(value);
}

fn normalized_sample_rate(sample_rate: &str) -> Option<&'static str> {
    match sample_rate.trim() {
        "22050" => Some("22050"),
        "32000" => Some("32000"),
        "44100" => Some("44100"),
        "48000" => Some("48000"),
        "96000" => Some("96000"),
        _ => None,
    }
}

fn normalized_channels(channels: &str) -> Option<&'static str> {
    match channels.trim() {
        "1" => Some("1"),
        "2" => Some("2"),
        _ => None,
    }
}

fn parse_fps(value: &str) -> f64 {
    let Some((numerator, denominator)) = value.split_once('/') else {
        return value.parse::<f64>().unwrap_or(0.0);
    };
    let numerator = numerator.parse::<f64>().unwrap_or(0.0);
    let denominator = denominator.parse::<f64>().unwrap_or(0.0);
    if denominator <= 0.0 {
        0.0
    } else {
        numerator / denominator
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(audio_models::VideoAudioPreview::default());

    #[cfg(all(debug_assertions, target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init_with_config(
            tauri_plugin_mcp_bridge::Config::localhost_only(),
        ));
    }

    #[cfg(all(debug_assertions, not(target_os = "linux")))]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .setup(|app| {
            realesrgan::init(app.handle()).map_err(std::io::Error::other)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            detect_tools,
            probe_tool,
            probe_tool_storage,
            check_tool_updates,
            detect_facefusion,
            detect_supir,
            detect_flux2,
            detect_wan21,
            detect_wan22,
            get_tool_storage,
            probe_video,
            video_preview_url,
            probe_audio,
            generate_thumbnails,
            video_waveform::generate_video_waveform,
            sample_contact_sheet,
            list_realesrgan_models,
            detect_realesrgan_devices,
            list_rife_models,
            list_supir_models,
            delete_tool_model,
            default_output_dir,
            get_app_settings,
            save_app_settings,
            flush_temp_folder,
            save_text_to_downloads,
            save_data_url_to_downloads,
            extract_gif_frames,
            save_gif_frames_to_downloads,
            run_image_compress_job,
            save_image_compress_preview,
            run_ffmpeg_job,
            run_audio_job,
            transcription::transcription_status,
            transcription::set_transcription_token,
            transcription::clear_transcription_token,
            transcription::setup_speaker_detection,
            transcription::remove_speaker_detection,
            transcription::detect_transcript_speakers,
            transcription::setup_transcription,
            transcription::run_transcription,
            transcription::cancel_transcription,
            transcription::save_transcript,
            transcription::load_transcript,
            transcription::import_transcript,
            transcription::export_transcript,
            subtitle_fonts::list_subtitle_fonts,
            subtitle_fonts::fontsource_catalog,
            subtitle_fonts::preview_subtitle_font,
            subtitle_fonts::install_subtitle_font,
            subtitle_fonts::install_subtitle_font_system,
            subtitle_fonts::import_subtitle_font,
            subtitle_fonts::read_subtitle_font,
            subtitle_fonts::remove_subtitle_font,
            video_effects::preview_video_effects,
            video_effects::cancel_video_effect_preview,
            caption_export::begin_caption_export,
            caption_export::append_caption_frame,
            caption_export::finish_caption_export,
            caption_export::cancel_caption_export,
            transcription::remove_transcription,
            audio_models::audio_model_status,
            audio_models::manage_audio_model,
            audio_models::run_audio_model,
            audio_models::open_audio_project,
            audio_models::prepare_video_audio,
            audio_models::audio_playback_url,
            audio_models::cancel_audio_model,
            run_social_export_job,
            run_upscale_job,
            run_rife_job,
            run_facefusion_job,
            vosr::install_vosr,
            vosr::run_vosr_image_job,
            vosr::run_vosr_skin_job,
            vosr::detect_vosr_skin_mask,
            vosr::cancel_vosr,
            run_supir_image_job,
            run_flux2_image_job,
            run_wan21_video_job,
            run_wan22_video_job,
            cancel_upscale_job,
            cancel_audio_job,
            cancel_facefusion_job,
            cancel_supir_image_job,
            cancel_flux2_image_job,
            cancel_wan21_video_job,
            cancel_wan22_video_job,
            import_supir_checkpoint,
            import_supir_checkpoint_from_downloads,
            download_supir_checkpoint,
            delete_supir_checkpoint,
            install_or_update_facefusion,
            install_or_update_supir,
            install_or_update_flux2,
            install_or_update_wan21,
            install_or_update_wan22,
            delete_wan21,
            delete_wan22,
            install_or_update_supir_xformers,
            delete_supir_xformers,
            update_ffmpeg,
            update_miniforge,
            update_imagemagick,
            delete_imagemagick,
            update_image_codec_tool,
            delete_image_codec_tool,
            update_realesrgan,
            realesrgan::realesrgan_status,
            realesrgan::check_realesrgan,
            realesrgan::uninstall_realesrgan,
            update_rife,
            compare_realesrgan_models
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
