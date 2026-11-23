"""WhisperX worker. JSON protocol on stdout; third-party diagnostics on stderr."""
import argparse
import contextlib
import copy
import gc
import json
import os
import re
from pathlib import Path
import sys
import textwrap
import warnings

PROTOCOL = sys.stdout


def progress(message):
    print("VMX:" + json.dumps({"message": message}), file=PROTOCOL, flush=True)


def normalize_segments(segments, offset):
    cues = []
    for i, segment in enumerate(segments):
        start, end = float(segment["start"]) + offset, float(segment["end"]) + offset
        if end <= start or not segment.get("text", "").strip():
            continue
        words = []
        for raw in segment.get("words", []):
            word = {"word": str(raw.get("word", ""))}
            for key in ("start", "end"):
                if raw.get(key) is not None:
                    word[key] = round(float(raw[key]) + offset, 3)
            if raw.get("score") is not None:
                word["score"] = float(raw["score"])
            words.append(word)
        cues.append({"id": str(i + 1), "start": round(start, 3), "end": round(end, 3),
                     "text": segment["text"].strip(), "words": words})
    return cues


def subtitle_cues(segments, language):
    """Group aligned words into readable cues; preserve original word data separately."""
    cues = []
    for segment in segments:
        words = segment.get("words", [])
        if not words:
            cues.append(dict(segment))
            continue
        group = []

        def flush():
            if not group:
                return
            timed = [word for word in group if "start" in word and "end" in word]
            start = timed[0]["start"] if timed else segment["start"]
            end = timed[-1]["end"] if timed else segment["end"]
            if end <= start:
                start, end = segment["start"], segment["end"]
            separator = "" if language in ("ja", "zh") else " "
            text = separator.join(word["word"].strip() for word in group).strip()
            lines = textwrap.wrap(text, width=42, break_long_words=False, break_on_hyphens=False)
            cues.append({"id": "", "start": start, "end": end, "text": "\n".join(lines), "words": list(group)})
            group.clear()

        for word in words:
            text_length = sum(len(item["word"]) + 1 for item in group)
            first_start = next((item["start"] for item in group if "start" in item), segment["start"])
            if group and (text_length + len(word["word"]) > 80 or word.get("end", first_start) - first_start > 6):
                flush()
            group.append(word)
            if word["word"].rstrip().endswith((".", "?", "!", "。", "？", "！")):
                flush()
        flush()
    for index, cue in enumerate(cues):
        cue["id"] = str(index + 1)
    return cues



SPEAKER_MODEL = "pyannote/speaker-diarization-community-1"


class NoSpeakersDetected(RuntimeError):
    pass


def merge_speaker_labels(project, labeled_segments, turns, offset):
    """Attach labels without rewriting edited dialogue, timing or recognized segments."""
    result = copy.deepcopy(project)
    labels = sorted({turn["speaker"] for turn in turns})
    if not labels:
        raise NoSpeakersDetected("No speakers were detected. The current transcript has been kept.")
    old_names = project.get("speakers", {})
    # Match rerun clusters by their overlap with old cue labels, never by arbitrary cluster numbering.
    overlaps = {}
    for old, labeled in zip(project["cues"], labeled_segments):
        previous, detected = old.get("speaker"), labeled.get("speaker")
        if previous in old_names and detected in labels:
            key = (previous, detected)
            overlaps[key] = overlaps.get(key, 0) + old["end"] - old["start"]
    mapping, used = {}, set()
    for (previous, detected), _ in sorted(overlaps.items(), key=lambda pair: pair[1], reverse=True):
        if detected not in mapping and previous not in used:
            mapping[detected] = previous
            used.add(previous)
    referenced = {cue.get("speaker") for cue in project["cues"]}
    names = {key: name for key, name in old_names.items()
             if key in referenced or not (key.startswith("speaker-") and name == f"Speaker {key[8:]}")}
    for label in labels:
        if label not in mapping:
            number = 1
            while f"speaker-{number}" in names:
                number += 1
            mapping[label] = f"speaker-{number}"
            names[mapping[label]] = f"Speaker {number}"
    for target, labeled in zip(result["cues"], labeled_segments):
        if labeled.get("speaker") in mapping:
            target["speaker"] = mapping[labeled["speaker"]]
        for word, detected in zip(target.get("words", []), labeled.get("words", [])):
            if detected.get("speaker") in mapping:
                word["speaker"] = mapping[detected["speaker"]]
    result["speakers"] = names
    result["speakerDetection"] = {"model": SPEAKER_MODEL, "count": len(labels), "turns": [
        {"start": round(turn["start"] + offset, 3), "end": round(turn["end"] + offset, 3), "speaker": mapping[turn["speaker"]]}
        for turn in turns
    ]}
    return result


def load_speaker_pipeline(pipeline_class, *, token, device, cache_dir):
    import torch
    from pyannote.audio.core.task import Specifications, Problem, Resolution
    # Community-1 serializes these metadata types. Keep weights-only loading and
    # limit this allowlist to constructing the pinned pyannote pipeline.
    with torch.serialization.safe_globals([Specifications, Problem, Resolution]):
        return pipeline_class(model_name=SPEAKER_MODEL, token=token, device=device, cache_dir=cache_dir)


def speaker_error_message(error, mode, token=None):
    reason = str(error)
    if token:
        reason = reason.replace(token, "[redacted]")
    reason = re.sub(r"hf_[A-Za-z0-9_]+", "[redacted]", reason)
    reason = re.sub(r"\x1b\[[0-9;]*m", "", reason)
    status = getattr(getattr(error, "response", None), "status_code", None)
    kind = type(error).__name__
    prefix = "Speaker model setup failed" if mode == "prepare-speakers" else "Speaker detection failed"
    if status in (401, 403) or kind == "GatedRepoError":
        detail = "Hugging Face denied access. Verify that the token belongs to the account with model access and allows reading this gated model."
    elif "weights only load failed" in reason.lower() or "unsupported global" in reason.lower():
        global_name = re.search(r"Unsupported global: GLOBAL ([\w.]+)", reason)
        detail = "Checkpoint compatibility error" + (f" ({global_name.group(1)})" if global_name else "") + ". Repair the WhisperX runtime; do not disable PyTorch's weights-only protection."
    elif "out of memory" in reason.lower():
        detail = "Not enough memory to load the speaker model. Try CPU processing or free GPU memory."
    elif kind == "LocalEntryNotFoundError":
        detail = "Required model files are missing from the local cache. Use Verify / repair speaker model in Settings with an internet connection."
    else:
        detail = f"{kind}: {reason[:1500]}"
    suffix = " Your transcript has been kept." if mode == "diarize" else ""
    return f"{prefix}. {detail}{suffix}"


def speaker_operation(args, whisperx):
    from whisperx.diarize import DiarizationPipeline, assign_word_speakers
    token = None
    if args.mode == "prepare-speakers":
        token = json.load(sys.stdin).get("token")
        if not token:
            raise RuntimeError("Save a Hugging Face read token in Settings first.")
    try:
        progress("Loading speaker detection model" if args.mode == "diarize" else "Downloading and checking speaker detection model")
        pipeline = load_speaker_pipeline(DiarizationPipeline, token=token, device=args.device,
                                        cache_dir=os.environ["VMX_SPEAKERS"])
        if args.mode == "prepare-speakers":
            progress("Speaker model verified")
            return
        project = json.loads(Path(args.project).read_text(encoding="utf-8"))
        audio = whisperx.load_audio(args.input)
        last = [-10]

        def update(percent):
            value = int(percent)
            if value >= last[0] + 10:
                progress(f"Detecting speakers: {value}%")
                last[0] = value

        progress("Detecting speakers")
        segments = pipeline(audio, num_speakers=args.speaker_count, progress_callback=update)
        relative = copy.deepcopy(project["cues"])
        for cue in relative:
            cue["start"] -= args.start
            cue["end"] -= args.start
            cue.pop("speaker", None)
            for word in cue.get("words", []):
                word.pop("speaker", None)
                for key in ("start", "end"):
                    if key in word:
                        word[key] -= args.start
        labeled = assign_word_speakers(segments, {"segments": relative}, fill_nearest=False)
        turns = [{"start": float(row.start), "end": float(row.end), "speaker": str(row.speaker)} for row in segments.itertuples()]
        result = merge_speaker_labels(project, labeled["segments"], turns, args.start)
        Path(args.output).write_text(json.dumps(result, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        progress(f"Detected {result['speakerDetection']['count']} speakers")
    except NoSpeakersDetected:
        raise
    except Exception as error:
        raise RuntimeError(speaker_error_message(error, args.mode, token)) from None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["verify", "prepare", "transcribe", "prepare-speakers", "diarize"])
    parser.add_argument("--model", default="small")
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--language", default="en")
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--source")
    parser.add_argument("--project")
    parser.add_argument("--speaker-count", type=int)
    parser.add_argument("--start", type=float, default=0)
    parser.add_argument("--end", type=float, default=0)
    args = parser.parse_args()
    if os.name == "posix":
        os.umask(0o077)
    nltk_root = Path(os.environ["NLTK_DATA"])
    nltk_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if os.name == "posix":
        nltk_root.chmod(0o700)
    # Keep private NVIDIA wheel DLLs discoverable on Windows.
    dll_handles = []
    if sys.platform == "win32":
        import site
        for base in site.getsitepackages():
            paths = list(Path(base).glob("nvidia/*/bin")) + [Path(base) / "torch/lib"]
            for path in paths:
                if path.is_dir():
                    dll_handles.append(os.add_dll_directory(str(path)))
    with contextlib.redirect_stdout(sys.stderr), warnings.catch_warnings():
        # All audio enters through FFmpeg or an in-memory waveform. Pyannote's
        # optional TorchCodec file decoder is never used by this worker.
        warnings.filterwarnings("ignore", message=r"\s*torchcodec is not installed correctly so built-in audio decoding will fail.*", category=UserWarning, module=r"pyannote\.audio\.core\.io")
        import torch
        import ctranslate2
        import whisperx
        import nltk
        if args.device == "cuda" and (not torch.cuda.is_available() or ctranslate2.get_cuda_device_count() < 1):
            raise RuntimeError("NVIDIA GPU unavailable. Update the GPU driver or set up CPU mode.")
        if args.mode == "verify":
            progress("Runtime verified")
            return
        if args.mode in ("prepare-speakers", "diarize"):
            speaker_operation(args, whisperx)
            return
        try:
            nltk.data.find("tokenizers/punkt_tab")
        except LookupError:
            progress("Downloading text segmentation data")
            nltk.download("punkt_tab", download_dir=os.environ["NLTK_DATA"], raise_on_error=True, quiet=True)
        progress("Loading transcription model (downloads missing model files)")
        model = whisperx.load_model(args.model, args.device,
            compute_type="int8" if args.device == "cpu" else "float16",
            language=None if args.language == "auto" else args.language,
            vad_method="silero", download_root=os.environ["VMX_MODELS"])
        if args.mode == "prepare":
            del model
            gc.collect()
            progress("Loading language alignment model")
            whisperx.load_align_model(language_code=args.language, device=args.device,
                                     model_dir=os.environ["VMX_ALIGN"])
            progress("Models ready")
            return
        audio = whisperx.load_audio(args.input)
        progress("Transcribing speech")
        result = model.transcribe(audio, batch_size=4 if args.device == "cuda" else 1,
                                  language=None if args.language == "auto" else args.language)
        del model
        gc.collect()
        if args.device == "cuda":
            torch.cuda.empty_cache()
        language = result.get("language", args.language)
        original = normalize_segments(result["segments"], args.start)
        progress("Aligning words (downloads missing language model files)")
        aligned = result
        alignment_warnings = []
        if result["segments"]:
            try:
                alignment, metadata = whisperx.load_align_model(language_code=language, device=args.device,
                                                               model_dir=os.environ["VMX_ALIGN"])
                aligned = whisperx.align(result["segments"], alignment, metadata, audio, args.device,
                                         return_char_alignments=False)
            except Exception as error:
                warning = "Word alignment unavailable; subtitle timing uses speech segments. " + str(error)
                alignment_warnings.append(warning)
                progress(warning)
        project = {"version": 1, "source": args.source, "language": language, "model": args.model,
                   "rangeStart": args.start, "rangeEnd": args.end,
                   "cues": subtitle_cues(normalize_segments(aligned["segments"], args.start), language),
                   "recognizedSegments": original, "speakers": {}, "warnings": alignment_warnings}
        Path(args.output).write_text(json.dumps(project, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        progress("Subtitles ready")


if __name__ == "__main__":
    main()
