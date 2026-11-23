"""Offline integration contracts for the VOSR runner; no model download required."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import zipfile

SCRIPT = Path(__file__).resolve().parents[1] / "src-tauri/src/vosr_runner.py"
spec = importlib.util.spec_from_file_location("vosr_runner", SCRIPT)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class InstallationContracts(unittest.TestCase):
    def test_progress_reports_bytes_speed_then_a_stalled_connection(self):
        now = [0.0]
        progress = runner.DownloadProgress("VOSR weights", total=100_000_000, clock=lambda: now[0])
        progress.update(25_000_000)
        now[0] = 5
        message = progress.message()
        self.assertIn("25.0 MB / 100.0 MB (25.0%)", message)
        self.assertIn("5.00 MB/s", message)
        self.assertIn("15s remaining", message)
        now[0] = 75
        progress.update(0)
        stalled = progress.message()
        self.assertIn("no transfer progress for 75s", stalled)
        self.assertIn("stalled or retrying", stalled)
        self.assertNotIn("MB/s", stalled)

    def test_resumed_progress_starts_at_the_existing_byte_count(self):
        progress = runner.DownloadProgress("VOSR weights", total=100_000_000,
                                         initial=60_000_000, clock=lambda: 0)
        self.assertIn("60.0 MB / 100.0 MB (60.0%)", progress.message())

    def test_progress_monitor_stops_when_a_download_fails(self):
        messages = []
        progress = runner.DownloadProgress("weights", total=10, interval=0.01,
                                         report=lambda message, **_: messages.append(message))
        with self.assertRaises(RuntimeError):
            with progress:
                progress.update(2)
                raise RuntimeError("connection lost")
        self.assertFalse(progress.thread.is_alive())
        self.assertIn("20.0%", messages[-1])

    def test_missing_or_empty_model_files_are_not_ready(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for relative in runner.MODEL_FILES:
                with self.assertRaises(FileNotFoundError):
                    runner.verify_models(root)
                file = runner.model_directory(root) / relative
                file.parent.mkdir(parents=True, exist_ok=True)
                file.touch()
            with self.assertRaises(FileNotFoundError):
                runner.verify_models(root)

    def test_source_archive_cannot_escape_install_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            def download(_url, destination):
                with zipfile.ZipFile(destination, "w") as archive:
                    archive.writestr("../../escaped.py", "invalid")
            with patch.object(runner, "download_auxiliary", download):
                with self.assertRaises(ValueError):
                    runner.archive_source("https://example.invalid/pinned.zip", root / "code")
            self.assertFalse((root / "code/.complete").exists())
            self.assertFalse((root.parent / "escaped.py").exists())

    def test_completed_matching_source_is_reused_without_network(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / ".complete").write_text("pinned-url")
            with patch.object(runner, "download_auxiliary", side_effect=AssertionError("network")):
                runner.archive_source("pinned-url", root)

    def test_stale_source_revision_is_replaced(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "code"
            root.mkdir()
            (root / ".complete").write_text("old-url")
            def download(_url, destination):
                with zipfile.ZipFile(destination, "w") as archive:
                    archive.writestr("new-revision/inference.py", "pinned")
            with patch.object(runner, "download_auxiliary", download):
                runner.archive_source("new-url", root)
            self.assertEqual((root / ".complete").read_text(), "new-url")
            self.assertEqual((root / "inference.py").read_text(), "pinned")


HAS_INFERENCE_DEPS = all(importlib.util.find_spec(name) for name in ["torch", "numpy", "PIL"])


@unittest.skipUnless(HAS_INFERENCE_DEPS, "Run in the VOSR environment for image contracts")
class ImageContracts(unittest.TestCase):
    def test_encoder_load_is_local_only_and_vae_path_is_explicit(self):
        import torch
        from unittest.mock import Mock
        root = Path("/shared/vosr")
        encoder = Mock()
        module = types.SimpleNamespace(load_config_with_cli=lambda *_: types.SimpleNamespace(ae_path="relative/path"))
        original_path = sys.path[:]
        try:
            with patch.dict(sys.modules), \
                 patch.object(torch, "compile"), \
                 patch.object(torch.hub, "load", return_value=encoder) as local_load, \
                 patch.object(torch, "load", return_value={"weight": "tensor"}) as weights, \
                 patch.object(runner.importlib, "import_module", return_value=module):
                loaded = runner.load_inference(root)
                torch.hub.load("facebookresearch/dinov2", "dinov2_vitl14")
                local_load.assert_called_once_with(str(root / "dino"), "dinov2_vitl14", source="local", pretrained=False)
                self.assertTrue(weights.call_args.kwargs["weights_only"])
                self.assertEqual(loaded.load_config_with_cli(None, None).ae_path,
                                 str(runner.model_directory(root) / "Qwen-Image-vae-2d"))
        finally:
            sys.path[:] = original_path

    def test_odd_dimensions_are_padded_and_cropped_at_each_scale(self):
        import torch
        from PIL import Image
        for scale in (1, 2, 4):
            for size in ((19, 37), (517, 259)):
                with self.subTest(scale=scale, size=size), tempfile.TemporaryDirectory() as temporary:
                    root = Path(temporary)
                    (root / "code").mkdir()
                    source, output = root / "odd.jpg", root / "output.png"
                    Image.new("RGB", size, (80, 100, 120)).save(source)
                    module = types.SimpleNamespace(LightningDiT=torch.nn.Module, get_venc_features=lambda *a: None)
                    def fake_inference():
                        args = sys.argv
                        with Image.open(args[args.index("-i") + 1]) as image:
                            self.assertEqual(args[args.index("--tile_overlap") + 1], "128")
                            self.assertEqual(args[args.index("--vae_tile_size") + 1], "512")
                            self.assertEqual(args[args.index("--vae_tile_overlap") + 1], "64")
                            self.assertEqual(args[args.index("--align_method") + 1], "nofix")
                            self.assertEqual(image.width % 16, 0)
                            self.assertEqual(image.height % 16, 0)
                            result = Path(args[args.index("-o") + 1]) / "source.png"
                            result.parent.mkdir()
                            image.resize((image.width * scale, image.height * scale)).save(result)
                    module.main = fake_inference
                    original_cwd, original_args = Path.cwd(), sys.argv[:]
                    try:
                        with patch.object(torch.cuda, "is_available", return_value=True), \
                             patch.object(torch.cuda, "is_bf16_supported", return_value=False), \
                             patch.object(runner, "verify_models"), \
                             patch.object(runner, "load_inference", return_value=module):
                            runner.run_image(root, source, output, scale, 512, 42, backend="pytorch", color_correction="nofix", tile_overlap=128, vae_tile_size=512, vae_tile_overlap=64)
                        with Image.open(output) as image:
                            self.assertEqual(image.size, tuple(side * scale for side in size))
                    finally:
                        runner.os.chdir(original_cwd)
                        sys.argv = original_args

    def test_probe_returns_stable_cuda_ids(self):
        import torch
        from unittest.mock import MagicMock
        uuid = "8c4fc32f-55b8-cba4-b97b-195ae9820734"
        vae = types.ModuleType("models.qwenimage_vae2d")
        vae.AutoencoderKLQwenImage2D = object
        with patch.dict(sys.modules, {"models.qwenimage_vae2d": vae}), \
             patch.object(runner, "load_inference", return_value=object()), \
             patch.object(runner, "verify_models"), \
             patch.object(torch, "ones", return_value=MagicMock()), \
             patch.object(torch.cuda, "is_available", return_value=True), \
             patch.object(torch.cuda, "device_count", return_value=1), \
             patch.object(torch.cuda, "get_device_properties", return_value=types.SimpleNamespace(uuid=uuid, name="RTX 4070")):
            result = runner.probe(Path("/unused"))
        self.assertEqual(result["cudaDevices"], [{"id": "GPU-" + uuid, "name": "RTX 4070"}])
        self.assertTrue(result["cudaReady"])

    def test_pytorch_backend_never_imports_xformers(self):
        import torch
        with patch.object(runner.importlib, "import_module", side_effect=AssertionError("optional import")):
            backend = runner.AttentionBackend("pytorch", torch.float32)
        self.assertEqual(backend.name, "pytorch")

    def test_missing_xformers_falls_back(self):
        import torch
        with patch.object(runner.importlib, "import_module", side_effect=ImportError("missing wheel")):
            backend = runner.AttentionBackend("auto", torch.float32)
        self.assertEqual(backend.name, "pytorch")
        self.assertIn("missing wheel", backend.reason)

    def test_failed_kernel_preflight_falls_back(self):
        import torch
        operation = lambda *args: (_ for _ in ()).throw(NotImplementedError("unsupported GPU"))
        with patch.object(runner.importlib, "import_module", return_value=types.SimpleNamespace(memory_efficient_attention=operation)), \
             patch.object(torch, "zeros", return_value=torch.empty(1)):
            backend = runner.AttentionBackend("xformers", torch.float32)
        self.assertEqual(backend.name, "pytorch")
        self.assertIn("unsupported GPU", backend.reason)

    def test_runtime_attention_failure_uses_original_and_stays_on_pytorch(self):
        import torch
        from unittest.mock import Mock
        class MemEffAttention(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.num_heads = 2
                self.qkv = torch.nn.Linear(8, 24)
                self.proj = torch.nn.Linear(8, 8)
                self.proj_drop = torch.nn.Identity()
            def forward(self, value, attn_bias=None):
                return value + 3
        encoder = torch.nn.Sequential(MemEffAttention())
        backend = runner.AttentionBackend("pytorch", torch.float32)
        backend.name = "xformers"
        operation = Mock(side_effect=NotImplementedError("shape unsupported"))
        backend.operation = operation
        backend.attach(encoder)
        value = torch.ones((1, 3, 8))
        self.assertTrue(torch.equal(encoder(value), value + 3))
        self.assertTrue(torch.equal(encoder(value), value + 3))
        self.assertEqual(operation.call_count, 1)
        self.assertEqual(backend.name, "pytorch")
        self.assertEqual(backend.calls, 0)

    def test_no_cuda_fails_before_loading_models(self):
        import torch
        with patch.object(torch.cuda, "is_available", return_value=False), \
             patch.object(runner, "load_inference", side_effect=AssertionError("loaded models")):
            with self.assertRaisesRegex(RuntimeError, "NVIDIA"):
                runner.run_image(Path("/unused"), Path("input"), Path("output"), 2, 512, 42)


if __name__ == "__main__":
    unittest.main()
