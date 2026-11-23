"""Predict editable skin probabilities with Stars Speck Character Skin V1 Pro."""

import argparse
import json
import math
from pathlib import Path
import runpy

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

# The released weights are CC BY-NC 4.0.
MODEL_FILE = "stars-speck-character-skin-v1-pro-b2-fp32-dynamic.onnx"
MODEL_REVISION = "900f0fbbbbd65efce2cec33bf32922d93dc739d5"
MODEL_URL = (
    "https://media.githubusercontent.com/media/kuiwaiwai/stars-speck-character-skin/"
    f"{MODEL_REVISION}/{MODEL_FILE}"
)
MODEL_SHA256 = "072817eecd40af194d7ea2fc120a649ed4f26f149b6a2f947c0710d0c7cb7b52"
MODEL_SIZE = 109891087
MEAN = np.array((0.485, 0.456, 0.406), dtype=np.float32)
STD = np.array((0.229, 0.224, 0.225), dtype=np.float32)
CROP_PADDING = 0.125


def padded_box(size, crop):
    width, height = size
    if crop is None:
        return 0, 0, width, height
    left, top, right, bottom = crop
    if not (0 <= left < right <= 1 and 0 <= top < bottom <= 1):
        raise ValueError("Draw a valid skin detection crop.")
    pad_x, pad_y = (right - left) * CROP_PADDING, (bottom - top) * CROP_PADDING
    return (
        max(0, math.floor((left - pad_x) * width)),
        max(0, math.floor((top - pad_y) * height)),
        min(width, math.ceil((right + pad_x) * width)),
        min(height, math.ceil((bottom + pad_y) * height)),
    )


def predict(image, model_path, long_edge):
    scale = long_edge / max(image.size)
    width, height = (max(1, round(edge * scale)) for edge in image.size)
    resized = image.convert("RGB").resize((width, height), Image.Resampling.BILINEAR)
    padded = Image.new("RGB", tuple((edge + 31) // 32 * 32 for edge in resized.size))
    padded.paste(resized, (0, 0))
    rgb = np.asarray(padded, dtype=np.float32) / 255
    tensor = ((rgb - MEAN) / STD).transpose(2, 0, 1)[None]

    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    session = ort.InferenceSession(str(model_path), sess_options=options, providers=["CPUExecutionProvider"])
    probability = session.run(["skin_probability"], {"image": tensor})[0][0, 0, :height, :width]
    if "A" in image.getbands() or "transparency" in image.info:
        alpha = image.convert("RGBA").getchannel("A").resize((width, height), Image.Resampling.BILINEAR)
        probability = np.where(np.asarray(alpha) > 127, probability, 0)
    return Image.fromarray(np.rint(np.clip(probability, 0, 1) * 255).astype(np.uint8))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--bounds", type=Path, required=True)
    parser.add_argument("--models", type=Path, required=True)
    parser.add_argument("--downloader", type=Path, required=True)
    parser.add_argument("--long-edge", type=int, choices=(512, 1024), required=True)
    parser.add_argument("--crop", type=float, nargs=4)
    args = parser.parse_args()

    with Image.open(args.input) as opened:
        if opened.format != "PNG" or getattr(opened, "is_animated", False):
            raise ValueError("Choose a still VOSR PNG result.")
        image = ImageOps.exif_transpose(opened)
    box = padded_box(image.size, args.crop)
    bounds = [edge / dimension for edge, dimension in zip(box, image.size * 2)]
    download_verified = runpy.run_path(str(args.downloader))["download_verified"]
    model = download_verified(MODEL_URL, args.models / MODEL_FILE, MODEL_SIZE, MODEL_SHA256)
    print("Detecting skin with Stars Speck on CPU", flush=True)
    probability = predict(image.crop(box), model, args.long_edge)

    # Carry probabilities in the alpha channel for both the editor and Skin Enhance.
    mask = Image.new("RGBA", probability.size, "#78ef9b")
    mask.putalpha(probability)
    mask.save(args.output, format="PNG")
    args.bounds.write_text(json.dumps(bounds), encoding="utf-8")


if __name__ == "__main__":
    main()
