"""Run the pinned Bandit v2 multilingual model on a 48 kHz WAV."""

import os
import sys
from pathlib import Path

import soundfile as sf
import torch
from bandit_infer import BanditSession


def main():
    checkpoint, digest, device, *audio_paths = sys.argv[1:]
    torch.set_num_threads(min(os.cpu_count() or 1, 4))
    with BanditSession(
        "v2-multi",
        family="v2",
        device=device,
        checkpoint_path=Path(checkpoint),
        checkpoint_sha256=digest,
    ) as session:
        if not audio_paths:
            return  # Installation probe validates that the weights load on the selected device.
        source, destination = audio_paths
        samples, rate = sf.read(source, dtype="float32", always_2d=True)
        stems = session.infer(samples.T, sample_rate=rate)
        for name in ("speech", "music", "effects"):
            sf.write(Path(destination) / f"{name}.wav", stems[name].T, rate, subtype="FLOAT")


if __name__ == "__main__":
    main()
