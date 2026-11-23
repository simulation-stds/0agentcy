"""Linux SUPIR adapter. Pinned upstream source; no edits to the legacy checkout."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import types
import urllib.request

REVISION = 'bda91af2000042f8bedfec8897d92917e67c1d88'
CLIP_REVISION = '32bd64288804d66eefd0ccbe215aa642df71cc41'
MODEL_NAMES = ['sd_xl_base_1.0_0.9vae.safetensors', 'SUPIR-v0Q.ckpt', 'SUPIR-v0F.ckpt']


def atomic_copy(source, target):
    """Copy with progress; never expose partial models or overwrite existing files."""
    if target.is_file():
        if target.stat().st_size != source.stat().st_size:
            raise RuntimeError(f'{target.name} has a different size; verify it before retrying')
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as temporary:
        partial = Path(temporary.name)
        try:
            done = 0
            last = 0
            with source.open('rb') as stream:
                while True:
                    block = stream.read(8 * 1024 * 1024)
                    if not block:
                        break
                    temporary.write(block)
                    done += len(block)
                    if done - last >= 512 * 1024 * 1024:
                        print(f'{source.name}: copying {done / 2**30:.1f} / {source.stat().st_size / 2**30:.1f} GiB', flush=True)
                        last = done
            temporary.flush()
            os.fsync(temporary.fileno())
            # A concurrent installer is excluded by the native cross-checkout lock.
            os.link(partial, target)
        finally:
            partial.unlink(missing_ok=True)


def download_small(url, destination):
    last = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                data = response.read(64 * 1024 * 1024 + 1)
            if len(data) > 64 * 1024 * 1024:
                raise ValueError('Unexpectedly large source/configuration download')
            destination.write_bytes(data)
            return
        except (OSError, ValueError) as error:
            last = error
            print(f'Download retry {attempt + 1}/5: {error}', flush=True)
            time.sleep(min(2**attempt, 8))
    raise RuntimeError(f'Download failed: {url}: {last}')


def prepare(root, legacy):
    root.mkdir(parents=True, exist_ok=True)
    repo = root / 'repo'
    if not (repo / '.revision').is_file() or (repo / '.revision').read_text() != REVISION:
        if repo.exists():
            raise RuntimeError('Shared SUPIR source has a different revision; keep it for inspection before repairing')
        with tempfile.TemporaryDirectory(dir=root) as temporary:
            temporary = Path(temporary)
            archive = temporary / 'source.tar'
            try:
                result = subprocess.run(['git', '-C', str(legacy / 'repo'), 'rev-parse', 'HEAD'], text=True, capture_output=True)
                local = result.returncode == 0 and result.stdout.strip() == REVISION
            except FileNotFoundError:
                local = False
            if local:
                with archive.open('wb') as stream:
                    subprocess.run(['git', '-C', str(legacy / 'repo'), 'archive', REVISION], stdout=stream, check=True)
            else:
                download_small(f'https://codeload.github.com/Fanghua-Yu/SUPIR/tar.gz/{REVISION}', archive)
            source = temporary / 'source'
            source.mkdir()
            with tarfile.open(archive) as bundle:
                members = bundle.getmembers()
                for member in members:
                    if not local:
                        member.name = '/'.join(member.name.split('/')[1:])
                    if not member.name:
                        continue
                    path = Path(member.name)
                    if path.is_absolute() or '..' in path.parts or member.issym() or member.islnk():
                        raise ValueError('Unsafe source archive')
                    if member.isdir():
                        (source / path).mkdir(parents=True, exist_ok=True)
                    elif member.isfile():
                        (source / path).parent.mkdir(parents=True, exist_ok=True)
                        with bundle.extractfile(member) as stream, (source / path).open('wb') as output:
                            shutil.copyfileobj(stream, output)
            (source / '.revision').write_text(REVISION)
            source.rename(repo)
    for name in MODEL_NAMES:
        original = legacy / 'checkpoints' / name
        if original.is_file():
            atomic_copy(original, root / 'checkpoints' / name)
    # Only text configuration and tokenizer assets are needed. Encoder parameters
    # come from the SDXL checkpoint, with coverage checked before inference.
    clip = root / 'models/clip-vit-large-patch14'
    clip.mkdir(parents=True, exist_ok=True)
    for name in ['config.json', 'merges.txt', 'vocab.json', 'tokenizer_config.json', 'special_tokens_map.json']:
        if not (clip / name).is_file():
            download_small(f'https://huggingface.co/openai/clip-vit-large-patch14/resolve/{CLIP_REVISION}/{name}', clip / name)
    print('SUPIR source, shared models and tokenizer prepared', flush=True)


def configure_imports(root):
    sys.path.insert(0, str(root / 'repo'))
    paths = types.ModuleType('CKPT_PTH')
    paths.SDXL_CLIP1_PATH = str(root / 'models/clip-vit-large-patch14')
    paths.SDXL_CLIP2_CKPT_PTH = None
    paths.LLAVA_CLIP_PATH = None
    paths.LLAVA_MODEL_PATH = 'liuhaotian/llava-v1.5-13b'
    sys.modules['CKPT_PTH'] = paths


def probe(root):
    import torch
    configure_imports(root)
    from SUPIR.models.SUPIR_model import SUPIRModel  # noqa: F401
    from sgm.modules.encoders.modules import FrozenCLIPEmbedder  # noqa: F401
    cuda = torch.cuda.is_available()
    devices = []
    if cuda:
        (torch.ones(1, device='cuda') + 1).cpu()
        for index in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(index)
            devices.append({'id': str(index), 'name': props.name})
    xformers = False
    version = ''
    message = 'CUDA is unavailable'
    if cuda:
        try:
            import xformers as xf
            from xformers.ops import memory_efficient_attention
            value = torch.zeros((1, 32, 8, 64), dtype=torch.float16, device='cuda')
            result = memory_efficient_attention(value, value, value)
            torch.cuda.synchronize()
            xformers = bool(torch.isfinite(result).all().item())
            version = xf.__version__
            message = 'CUDA kernel verified' if xformers else 'Invalid kernel output'
        except (ImportError, OSError, RuntimeError, NotImplementedError) as error:
            message = str(error)
    return dict(runtimeReady=True, cudaReady=cuda, cudaDevices=devices, torchVersion=torch.__version__,
                xformersReady=xformers, xformersVersion=version, xformersMessage=message)


def verify_text_weights(model_keys, checkpoint_keys):
    prefixes = ('conditioner.embedders.0.', 'conditioner.embedders.1.')
    keys = list(model_keys)
    if not all(any(name.startswith(prefix) for name in keys) for prefix in prefixes):
        raise RuntimeError('SUPIR model configuration must contain both text encoders')
    missing = [name for name in keys if name.startswith(prefixes)
               and name not in checkpoint_keys and not name.endswith('position_ids')]
    if missing:
        raise RuntimeError(f'SDXL checkpoint is missing text encoder weights: {missing[:5]}')


def load_model(root, sign, low_vram):
    import torch
    from omegaconf import OmegaConf
    from transformers import CLIPTextModel, CLIPTextConfig
    import open_clip
    from SUPIR.util import load_state_dict
    from sgm.util import instantiate_from_config
    # The base checkpoint already contains the exact text encoder weights.
    original_text = CLIPTextModel.from_pretrained
    original_open = open_clip.create_model_and_transforms
    CLIPTextModel.from_pretrained = lambda *a, **kw: CLIPTextModel(CLIPTextConfig.from_pretrained(root / 'models/clip-vit-large-patch14'))
    def local_open(*args, **kwargs):
        kwargs['pretrained'] = None
        return original_open(*args, **kwargs)
    open_clip.create_model_and_transforms = local_open
    try:
        config = OmegaConf.load(root / ('repo/options/SUPIR_v0_tiled.yaml' if low_vram else 'repo/options/SUPIR_v0.yaml'))
        config.model.params.sampler_config.params.verbose = True
        original_dtype = torch.get_default_dtype()
        try:
            if low_vram:
                torch.set_default_dtype(torch.float16)
            model = instantiate_from_config(config.model).cpu()
        finally:
            torch.set_default_dtype(original_dtype)
    finally:
        CLIPTextModel.from_pretrained = original_text
        open_clip.create_model_and_transforms = original_open
    base = load_state_dict(str(root / 'checkpoints' / MODEL_NAMES[0]))
    verify_text_weights(model.state_dict().keys(), base.keys())
    model.load_state_dict(base, strict=False)
    del base
    weights = load_state_dict(str(root / 'checkpoints' / f'SUPIR-v0{sign}.ckpt'))
    model.load_state_dict(weights, strict=False)
    del weights
    if low_vram:
        model.half()
        model.init_tile_vae(encoder_tile_size=512, decoder_tile_size=64)
        for module in [model.first_stage_model.encoder, model.first_stage_model.denoise_encoder,
                       model.first_stage_model.decoder]:
            module.forward.fast_mode = True
        print('SUPIR Low VRAM: tiled sampling and fast VAE normalization enabled', flush=True)
    model.ae_dtype = torch.bfloat16
    model.model.dtype = torch.float16
    print('SUPIR weights and both text encoders loaded from shared checkpoints', flush=True)
    model.eval()
    if low_vram:
        from accelerate import cpu_offload
        # Upstream's tiled VAE moves its modules explicitly, so its parameters
        # must remain real tensors. Offload only the restoration/text networks.
        model.first_stage_model.to('cuda')
        model.denoiser.to('cuda')
        cpu_offload(model.model, execution_device=torch.device('cuda'), offload_buffers=False)
        cpu_offload(model.conditioner, execution_device=torch.device('cuda'), offload_buffers=False,
                    preload_module_classes=['FrozenCLIPEmbedder', 'FrozenOpenCLIPEmbedder2'])
        print('SUPIR Low VRAM: CPU weight offload enabled', flush=True)
        return model
    return model.to('cuda')


def memory_values(text):
    values = {}
    for line in text.splitlines():
        fields = line.split()
        if len(fields) >= 2 and fields[0].endswith(':'):
            try:
                values[fields[0][:-1]] = int(fields[1]) * 1024
            except ValueError:
                pass
    return values


def memory_pressure(memory, process, budget):
    return (memory.get('MemAvailable', budget) < 3 * 2**30
            or process.get('VmRSS', 0) + process.get('VmSwap', 0) > budget
            or process.get('VmSwap', 0) > 2 * 2**30)


def start_memory_guard():
    available = memory_values(Path('/proc/meminfo').read_text()).get('MemAvailable', 0)
    if available < 14 * 2**30:
        raise RuntimeError('SUPIR needs more available system memory. Close other memory-heavy apps before retrying.')
    budget = min(20 * 2**30, available - 4 * 2**30)
    def watch():
        while True:
            try:
                memory = memory_values(Path('/proc/meminfo').read_text())
                process = memory_values(Path('/proc/self/status').read_text())
                if memory_pressure(memory, process, budget):
                    print('SUPIR stopped before exhausting system memory. Try a smaller image or lower upscale.', flush=True)
                    os._exit(1)
            except OSError:
                pass
            time.sleep(0.25)
    threading.Thread(target=watch, daemon=True).start()


def run_image(root, source, output, model_name, preset, upscale, use_llava):
    import torch
    from PIL import Image, ImageOps
    configure_imports(root)
    if model_name not in ('SUPIR-v0Q', 'SUPIR-v0F') or preset not in ('quality', 'fidelity', 'low_vram') or upscale not in (1, 2, 4):
        raise ValueError('Unsupported SUPIR model, preset or upscale')
    if not torch.cuda.is_available():
        raise RuntimeError('SUPIR needs a working NVIDIA CUDA GPU. Choose Auto or a CUDA device.')
    from SUPIR.util import PIL2Tensor, Tensor2PIL
    low = preset == 'low_vram'
    captions = ['']
    with Image.open(source) as image:
        if getattr(image, 'n_frames', 1) > 1:
            raise ValueError('Choose a still image for SUPIR')
        image = ImageOps.exif_transpose(image).convert('RGB')
        expected = (image.width * upscale, image.height * upscale)
        model = load_model(root, model_name[-1], low)
        tensor, height, width = PIL2Tensor(image, upsacle=upscale, min_size=1024)
        if use_llava:
            from llava.llava_agent import LLavaAgent
            from CKPT_PTH import LLAVA_MODEL_PATH
            agent = LLavaAgent(LLAVA_MODEL_PATH, device='cuda', load_8bit=low, load_4bit=False)
            captions = agent.gen_image_caption([image])
        with torch.inference_mode():
            samples = model.batchify_sample(tensor.unsqueeze(0).to('cuda'), captions,
                num_steps=30 if low else 50, restoration_scale=-1, s_churn=5,
                s_noise=1.001 if low else 1.003, cfg_scale=6.0 if low else 7.5,
                control_scale=1.0, seed=1234, num_samples=1,
                p_p='default', n_p='default',
                color_fix_type='Wavelet', use_linear_CFG=True, use_linear_control_scale=False,
                cfg_scale_start=3.0 if low else 4.0, control_scale_start=0.0)
            result = Tensor2PIL(samples[0], height, width)
        if result.size != expected:
            raise RuntimeError(f'Unexpected SUPIR dimensions: {result.size}, expected {expected}')
        output.parent.mkdir(parents=True, exist_ok=True)
        result.save(output, format='PNG')
    print(f'SUPIR output: {output}', flush=True)


class ProgressLines:
    def __init__(self, stream):
        self.stream = stream
    def write(self, value):
        self.stream.write(value.replace('\r', '\n'))
        self.stream.flush()
        return len(value)
    def __getattr__(self, name):
        return getattr(self.stream, name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['prepare', 'probe', 'run'])
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--legacy', type=Path)
    parser.add_argument('--input', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--model', default='SUPIR-v0Q')
    parser.add_argument('--preset', default='low_vram')
    parser.add_argument('--upscale', type=int, default=2)
    parser.add_argument('--llava', action='store_true')
    args = parser.parse_args()
    if args.mode == 'prepare':
        if args.legacy is None:
            parser.error('prepare requires --legacy')
        prepare(args.root, args.legacy)
    elif args.mode == 'probe':
        print(json.dumps(probe(args.root)), flush=True)
    else:
        if not args.input or not args.output:
            parser.error('run requires --input and --output')
        sys.stderr = ProgressLines(sys.stderr)
        start_memory_guard()
        try:
            run_image(args.root, args.input, args.output, args.model, args.preset, args.upscale, args.llava)
        except Exception as error:
            if 'out of memory' in str(error).lower():
                raise RuntimeError('SUPIR ran out of GPU memory. Use Low VRAM, disable LLaVA and reduce upscale. This GPU may be too small for this model even at those settings.') from error
            raise

if __name__ == '__main__':
    main()
