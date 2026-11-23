"""Apply the CC0 SkinContrast Standard checkpoint inside a painted skin mask."""

import argparse
import json
from pathlib import Path
import runpy

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageOps
import torch
from torch import nn

MODEL_NAME = "1xSkinContrast-SuperUltraCompact.pth"
MODEL_URL = "https://huggingface.co/risunobushi/1xSkinContrast/resolve/ff8d262/1xSkinContrast-SuperUltraCompact.pth"
MODEL_SIZE = 181474
MODEL_SHA256 = "2713e618f12995f243aafd1963e1fcc23d49b5ae6f151c14e12b6ce65e711663"
TILE_SIZE = 768
CONV_RADIUS = 10
REGION_PADDING = 40
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


class CompactSkinContrast(nn.Module):
    """The 24-feature, 8-block, scale-1 SRVGG layout used by the checkpoint."""

    def __init__(self):
        super().__init__()
        layers = [nn.Conv2d(3, 24, 3, padding=1), nn.PReLU(24)]
        for _ in range(8):
            layers.extend((nn.Conv2d(24, 24, 3, padding=1), nn.PReLU(24)))
        layers.append(nn.Conv2d(24, 3, 3, padding=1))
        self.body = nn.Sequential(*layers)

    def forward(self, image):
        return image + self.body(image)


def rasterize_mask(size, strokes, auto_mask=None, mask_bounds=None, mask_coverage=50):
    mask = Image.new("L", size)
    if auto_mask is not None:
        with Image.open(auto_mask) as bitmap:
            if bitmap.format != "PNG" or max(bitmap.size) > 1024 or bitmap.mode != "RGBA":
                raise ValueError("The detected skin mask is invalid.")
            left, top, right, bottom = mask_bounds or (0, 0, 1, 1)
            if not (0 <= left < right <= 1 and 0 <= top < bottom <= 1 and 1 <= mask_coverage <= 99):
                raise ValueError("The detected skin mask is invalid.")
            width, height = size
            x0, y0, x1, y1 = round(left * width), round(top * height), round(right * width), round(bottom * height)
            if x1 <= x0 or y1 <= y0:
                raise ValueError("The detected skin mask is too small.")
            probability = bitmap.getchannel("A").resize((x1 - x0, y1 - y0), Image.Resampling.BILINEAR)
        cutoff = ((100 - mask_coverage) * 255 + 99) // 100
        mask.paste(probability.point(lambda value: 255 if value >= cutoff else 0), (x0, y0))
    draw = ImageDraw.Draw(mask)
    for stroke in strokes:
        diameter = max(1, round(stroke["width"] * min(size)))
        radius = diameter / 2
        value = 0 if stroke["erase"] else 255
        points = [(round(x * (size[0] - 1)), round(y * (size[1] - 1))) for x, y in stroke["points"]]
        if len(points) > 1:
            draw.line(points, fill=value, width=diameter)
        for x, y in points:
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=value)
    return mask


@torch.inference_mode()
def infer_brightness_delta(model, rgb, device):
    height, width = rgb.shape[:2]
    difference = np.empty((height, width), dtype=np.float32)
    rows = range(0, height, TILE_SIZE)
    for row, top in enumerate(rows, start=1):
        bottom = min(height, top + TILE_SIZE)
        for left in range(0, width, TILE_SIZE):
            right = min(width, left + TILE_SIZE)
            y0, x0 = max(0, top - CONV_RADIUS), max(0, left - CONV_RADIUS)
            y1, x1 = min(height, bottom + CONV_RADIUS), min(width, right + CONV_RADIUS)
            patch = torch.from_numpy(rgb[y0:y1, x0:x1].copy()).to(device).permute(2, 0, 1)[None] / 255
            predicted = model(patch)[0].permute(1, 2, 0).clamp_(0, 1).cpu().numpy()
            core = predicted[top - y0:bottom - y0, left - x0:right - x0]
            difference[top:bottom, left:right] = (core * 255 - rgb[top:bottom, left:right]) @ LUMA
        print(f"Enhanced skin tile row {row} of {len(rows)}", flush=True)
    return difference


def enhance_skin(source, mask, model, device):
    x0, y0, x1, y1 = mask.getbbox()
    box = (max(0, x0 - REGION_PADDING), max(0, y0 - REGION_PADDING),
           min(source.width, x1 + REGION_PADDING), min(source.height, y1 + REGION_PADDING))
    rgb = np.array(source.crop(box).convert("RGB"), dtype=np.float32)
    selected = np.array(mask.crop(box))
    difference = infer_brightness_delta(model, rgb, device)
    detail = cv2.GaussianBlur(difference, (0, 0), 0.55) - cv2.GaussianBlur(difference, (0, 0), 5.0)
    # Feather inward and clamp the luminance change, keeping unpainted pixels intact.
    distance = cv2.distanceTransform(cv2.copyMakeBorder(selected, 1, 1, 1, 1, cv2.BORDER_CONSTANT), cv2.DIST_L2, 5)[1:-1, 1:-1]
    feather_width = min(22, max(2, min(source.size) * 0.012))
    feather = np.clip(distance / feather_width, 0, 1)
    feather *= feather * (3 - 2 * feather)
    amount = np.clip(detail, -8, 8) * feather
    amount = np.clip(amount, -rgb.min(axis=-1), 255 - rgb.max(axis=-1))
    enhanced = Image.fromarray(np.round(rgb + amount[:, :, None]).astype(np.uint8))
    output = source.copy()
    if output.mode == "RGBA":
        enhanced.putalpha(source.getchannel("A").crop(box))
    output.paste(enhanced, box[:2])
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--strokes", type=Path, required=True)
    parser.add_argument("--auto-mask", type=Path)
    parser.add_argument("--mask-bounds", type=float, nargs=4)
    parser.add_argument("--mask-coverage", type=int, default=50)
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--downloader", type=Path, required=True)
    args = parser.parse_args()

    with Image.open(args.input) as opened:
        if opened.format != "PNG" or getattr(opened, "is_animated", False):
            raise ValueError("Choose a still VOSR PNG result.")
        corrected = ImageOps.exif_transpose(opened)
        has_alpha = "A" in corrected.getbands() or "transparency" in corrected.info
        source = corrected.convert("RGBA" if has_alpha else "RGB")
        profile = corrected.info.get("icc_profile")
    strokes = json.loads(args.strokes.read_text(encoding="utf-8"))
    mask = rasterize_mask(source.size, strokes, args.auto_mask, args.mask_bounds, args.mask_coverage)
    if not mask.getbbox():
        raise ValueError("The skin mask is empty. Increase Mask Coverage or paint some skin.")
    weights = args.weights / MODEL_NAME
    download_verified = runpy.run_path(str(args.downloader))["download_verified"]
    download_verified(MODEL_URL, weights, MODEL_SIZE, MODEL_SHA256)
    print("Loading SkinContrast Standard", flush=True)
    torch.set_num_threads(4)
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    model = CompactSkinContrast()
    model.load_state_dict(torch.load(weights, map_location="cpu", weights_only=True)["params"], strict=True)
    output = enhance_skin(source, mask, model.eval().to(device), device)
    output.save(args.output, format="PNG", icc_profile=profile)
    print(f"Skin Enhance complete · {output.width} × {output.height} · {device.type.upper()}", flush=True)


if __name__ == "__main__":
    main()
