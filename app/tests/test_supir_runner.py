import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('supir_runner', Path(__file__).parents[1] / 'src-tauri/src/supir_runner.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class StorageTests(unittest.TestCase):
    def test_import_preserves_original_and_reuses_complete_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, target = root/'old.ckpt', root/'shared/model.ckpt'
            source.write_bytes(b'original model bytes')
            worker.atomic_copy(source, target)
            self.assertEqual(source.read_bytes(), target.read_bytes())
            with patch.object(Path, 'open', side_effect=AssertionError('copied again')):
                worker.atomic_copy(source, target)

    def test_import_never_overwrites_conflicting_model(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, target = root/'old.ckpt', root/'model.ckpt'
            source.write_bytes(b'long original')
            target.write_bytes(b'old')
            with self.assertRaisesRegex(RuntimeError, 'different size'):
                worker.atomic_copy(source, target)
            self.assertEqual(target.read_bytes(), b'old')

    def test_interrupted_import_does_not_publish_partial_model(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, target = root/'source.ckpt', root/'model.ckpt'
            source.write_bytes(b'original')
            with patch('os.link', side_effect=OSError('interrupted')):
                with self.assertRaises(OSError):
                    worker.atomic_copy(source, target)
            self.assertFalse(target.exists())
            self.assertEqual(sorted(p.name for p in root.iterdir()), ['source.ckpt'])

    def test_import_paths_are_shared_and_do_not_rewrite_legacy_config(self):
        import sys
        root = Path('/shared/supir')
        previous = sys.path[:]
        try:
            with patch.dict(sys.modules):
                worker.configure_imports(root)
                paths = sys.modules['CKPT_PTH']
                self.assertEqual(paths.SDXL_CLIP1_PATH, str(root/'models/clip-vit-large-patch14'))
                self.assertIsNone(paths.SDXL_CLIP2_CKPT_PTH)
                self.assertEqual(sys.path[0], str(root/'repo'))
        finally:
            sys.path[:] = previous

class ModelContracts(unittest.TestCase):
    def test_both_text_encoders_must_be_covered_by_the_base_checkpoint(self):
        keys = ['conditioner.embedders.0.text.weight', 'conditioner.embedders.1.text.weight']
        worker.verify_text_weights(keys, keys)
        with self.assertRaisesRegex(RuntimeError, 'missing text encoder'):
            worker.verify_text_weights(keys, keys[:1])
        with self.assertRaisesRegex(RuntimeError, 'both text encoders'):
            worker.verify_text_weights(keys[:1], keys)

    def test_memory_guard_stops_before_system_or_process_limit(self):
        memory = worker.memory_values('MemAvailable: 10000000 kB\n')
        process = worker.memory_values('VmRSS: 1000000 kB\nVmSwap: 0 kB\n')
        self.assertFalse(worker.memory_pressure(memory, process, 20 * 2**30))
        self.assertTrue(worker.memory_pressure({'MemAvailable': 2 * 2**30}, process, 20 * 2**30))
        self.assertTrue(worker.memory_pressure(memory, {'VmRSS': 21 * 2**30}, 20 * 2**30))
        self.assertTrue(worker.memory_pressure(memory, {'VmSwap': 3 * 2**30}, 20 * 2**30))

    def test_progress_stream_converts_tqdm_to_readable_log_lines(self):
        import io
        output = io.StringIO()
        stream = worker.ProgressLines(output)
        stream.write('\rStep 1\rStep 2')
        self.assertEqual(output.getvalue(), '\nStep 1\nStep 2')

if __name__ == '__main__':
    unittest.main()
