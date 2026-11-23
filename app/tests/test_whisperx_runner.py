import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("worker", Path(__file__).parents[1] / "src-tauri/src/whisperx_runner.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class NormalizeTests(unittest.TestCase):
    def test_selection_offset_and_missing_word_alignment(self):
        result = worker.normalize_segments([{"start": 1.234, "end": 2.345, "text": " Hello 2014 ",
            "words": [{"word": "Hello", "start": 1.234, "end": 1.9, "score": .8}, {"word": "2014"}]}], 80)
        self.assertEqual(result[0]["start"], 81.234)
        self.assertEqual(result[0]["end"], 82.345)
        self.assertEqual(result[0]["words"][0]["start"], 81.234)
        self.assertNotIn("start", result[0]["words"][1])
        self.assertEqual(result[0]["text"], "Hello 2014")

    def test_subtitle_grouping_preserves_words_and_wraps_lines(self):
        words = [{"word": f"word{i}", "start": i * .5, "end": i * .5 + .4} for i in range(25)]
        result = worker.subtitle_cues([{"id": "old", "start": 0, "end": 13, "text": "", "words": words}], "en")
        self.assertGreater(len(result), 1)
        self.assertEqual(sum(len(cue["words"]) for cue in result), 25)
        self.assertTrue(all(cue["end"] > cue["start"] for cue in result))
        self.assertTrue(all(len(line) <= 42 for cue in result for line in cue["text"].splitlines()))
        self.assertEqual(len({cue["id"] for cue in result}), len(result))

    def test_empty_speech_and_invalid_cues(self):
        self.assertEqual(worker.normalize_segments([], 0), [])
        self.assertEqual(worker.normalize_segments([{"start": 1, "end": 1, "text": "noise"}], 0), [])

class SpeakerLabelTests(unittest.TestCase):
    def project(self):
        return {"version": 1, "source": "/recording.wav", "language": "en", "model": "tiny",
                "rangeStart": 80, "rangeEnd": 90, "recognizedSegments": [{"text": "Original recognition"}],
                "speakers": {}, "cues": [
                    {"id": "1", "start": 81, "end": 83, "text": "Manually corrected text", "words": [{"word": "Original", "start": 81, "end": 82, "score": .9}]},
                    {"id": "2", "start": 84, "end": 86, "text": "Another voice"}]}

    def test_adds_speakers_without_changing_edited_text_or_word_timing(self):
        import copy
        project = self.project()
        before = copy.deepcopy(project)
        labeled = [{"speaker": "SPEAKER_00", "words": [{"speaker": "SPEAKER_00"}]}, {"speaker": "SPEAKER_01"}]
        turns = [{"start": 1, "end": 3, "speaker": "SPEAKER_00"}, {"start": 4, "end": 6, "speaker": "SPEAKER_01"}]
        result = worker.merge_speaker_labels(project, labeled, turns, 80)
        self.assertEqual(project, before)
        self.assertEqual(result["speakerDetection"]["count"], 2)
        self.assertEqual(result["speakerDetection"]["turns"][0]["start"], 81)
        self.assertEqual(result["recognizedSegments"], before["recognizedSegments"])
        for old, new in zip(before["cues"], result["cues"]):
            for key in ("id", "text", "start", "end"):
                self.assertEqual(old[key], new[key])
        self.assertEqual(result["cues"][0]["words"][0]["start"], 81)
        self.assertEqual(result["cues"][0]["words"][0]["speaker"], "speaker-1")

    def test_renamed_speakers_survive_cluster_number_changes_on_rerun(self):
        project = self.project()
        project["speakers"] = {"speaker-1": "Alice", "speaker-2": "Bob"}
        project["cues"][0]["speaker"] = "speaker-1"
        project["cues"][1]["speaker"] = "speaker-2"
        labeled = [{"speaker": "SPEAKER_01"}, {"speaker": "SPEAKER_00"}]
        turns = [{"start": 1, "end": 3, "speaker": "SPEAKER_01"}, {"start": 4, "end": 6, "speaker": "SPEAKER_00"}]
        result = worker.merge_speaker_labels(project, labeled, turns, 80)
        self.assertEqual(result["cues"][0]["speaker"], "speaker-1")
        self.assertEqual(result["cues"][1]["speaker"], "speaker-2")
        self.assertEqual(result["speakers"], project["speakers"])

    def test_unused_manual_names_are_kept_and_empty_placeholders_are_reused(self):
        project = self.project()
        project["speakers"] = {"speaker-1": "Speaker 1", "speaker-2": "Interview host"}
        result = worker.merge_speaker_labels(project, [{"speaker": "A"}, {}], [{"start": 1, "end": 3, "speaker": "A"}], 80)
        self.assertEqual(result["cues"][0]["speaker"], "speaker-1")
        self.assertEqual(result["speakers"]["speaker-2"], "Interview host")

    def test_no_speech_keeps_project_untouched(self):
        project = self.project()
        with self.assertRaisesRegex(RuntimeError, "No speakers"):
            worker.merge_speaker_labels(project, [], [], 80)
        self.assertEqual(project["speakers"], {})


class SpeakerErrorTests(unittest.TestCase):
    def test_dependency_failure_is_not_reported_as_access_denied(self):
        message = worker.speaker_error_message(OSError("libnppicc.so.12: cannot open shared object file"), "prepare-speakers")
        self.assertIn("libnppicc.so.12", message)
        self.assertNotIn("denied access", message)

    def test_checkpoint_error_preserves_specific_metadata_type(self):
        error = RuntimeError("Weights only load failed. Unsupported global: GLOBAL pyannote.audio.core.task.Specifications")
        message = worker.speaker_error_message(error, "prepare-speakers")
        self.assertIn("Checkpoint compatibility error", message)
        self.assertIn("Specifications", message)

    def test_real_access_denial_and_secrets_are_distinguished(self):
        class Denied(Exception):
            response = type("Response", (), {"status_code": 403})()
        message = worker.speaker_error_message(Denied("hf_fixture_secret"), "prepare-speakers")
        self.assertIn("Hugging Face denied access", message)
        message = worker.speaker_error_message(ValueError("Authorization: hf_fixture_secret"), "diarize", "hf_fixture_secret")
        self.assertNotIn("hf_fixture_secret", message)
        self.assertIn("transcript has been kept", message)


if __name__ == "__main__":
    unittest.main()
