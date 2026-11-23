"""Adapter checks using installed WhisperX assignment code, without gated model access."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("speaker_worker", Path(__file__).parents[1] / "src-tauri/src/whisperx_runner.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


@unittest.skipUnless(importlib.util.find_spec("whisperx"), "requires the managed WhisperX runtime")
class WhisperXAdapterTests(unittest.TestCase):
    def test_real_word_assignment_preserves_source_times_and_corrections(self):
        import numpy as np
        import pandas as pd
        import whisperx
        from whisperx import diarize
        with tempfile.TemporaryDirectory() as folder:
            project = {"version": 1, "source": "/sample.wav", "language": "en", "model": "tiny", "rangeStart": 80, "rangeEnd": 90,
                       "speakers": {}, "recognizedSegments": [], "cues": [
                           {"id": "a", "start": 81, "end": 83, "text": "Corrected first subtitle", "words": [{"word": "first", "start": 81.2, "end": 82}]},
                           {"id": "b", "start": 84, "end": 86, "text": "Second voice", "words": [{"word": "second", "start": 84.2, "end": 85}]}]}
            input_path, output_path = Path(folder) / "project.json", Path(folder) / "result.json"
            input_path.write_text(json.dumps(project))
            calls = []

            class Model:
                def __init__(self, **kwargs):
                    calls.append(kwargs)

                def __call__(self, audio, **kwargs):
                    self.assertions = kwargs
                    kwargs["progress_callback"](100)
                    return pd.DataFrame([{"start": 1., "end": 3., "speaker": "SPEAKER_00"}, {"start": 4., "end": 6., "speaker": "SPEAKER_01"}])

            args = SimpleNamespace(mode="diarize", device="cpu", project=str(input_path), input="/audio.wav", output=str(output_path), start=80, speaker_count=2)
            with patch.dict("os.environ", {"VMX_SPEAKERS": folder}), patch.object(diarize, "DiarizationPipeline", Model), patch.object(whisperx, "load_audio", return_value=np.zeros(160000, dtype=np.float32)), patch.object(worker, "PROTOCOL", io.StringIO()):
                worker.speaker_operation(args, whisperx)
            result = json.loads(output_path.read_text())
            self.assertIsNone(calls[0]["token"])
            self.assertEqual(result["cues"][0]["speaker"], "speaker-1")
            self.assertEqual(result["cues"][1]["speaker"], "speaker-2")
            self.assertEqual(result["cues"][0]["words"][0]["start"], 81.2)
            self.assertEqual(result["cues"][0]["words"][0]["speaker"], "speaker-1")
            self.assertEqual(result["cues"][0]["text"], "Corrected first subtitle")
            self.assertEqual(result["recognizedSegments"], project["recognizedSegments"])

    def test_metadata_allowlist_is_scoped_and_weights_only_remains_enabled(self):
        import torch
        import pickle
        from pyannote.audio.core.task import Specifications, Problem, Resolution
        metadata = Specifications(problem=Problem.MONO_LABEL_CLASSIFICATION, resolution=Resolution.FRAME, duration=10.)
        with tempfile.TemporaryDirectory() as folder:
            checkpoint = Path(folder) / "metadata.pt"
            torch.save({"specifications": metadata, "weight": torch.ones(1)}, checkpoint)
            with self.assertRaises(pickle.UnpicklingError):
                torch.load(checkpoint, weights_only=True)
            baseline = list(torch.serialization.get_safe_globals())
            def pipeline_class(**kwargs):
                return torch.load(checkpoint, weights_only=True)
            loaded = worker.load_speaker_pipeline(pipeline_class, token=None, device="cpu", cache_dir=folder)
            self.assertEqual(loaded["specifications"].problem, Problem.MONO_LABEL_CLASSIFICATION)
            self.assertEqual(torch.serialization.get_safe_globals(), baseline)
            with self.assertRaises(pickle.UnpicklingError):
                torch.load(checkpoint, weights_only=True)

    def test_authentication_failure_does_not_include_token_in_error(self):
        import whisperx
        from whisperx import diarize
        token = "hf_fixture_not_a_real_credential"
        args = SimpleNamespace(mode="prepare-speakers", device="cpu")
        with patch.dict("os.environ", {"VMX_SPEAKERS": "/test-cache"}), patch("sys.stdin", io.StringIO(json.dumps({"token": token}))), patch.object(diarize, "DiarizationPipeline", side_effect=RuntimeError(f"Authorization: {token}")), patch.object(worker, "PROTOCOL", io.StringIO()):
            with self.assertRaises(RuntimeError) as error:
                worker.speaker_operation(args, whisperx)
        self.assertNotIn(token, str(error.exception))
        self.assertIn("[redacted]", str(error.exception))
        self.assertNotIn("Accept the model", str(error.exception))


if __name__ == "__main__":
    unittest.main()
