"""Fail promptly when Graphify's checkout-local extraction cache is unwritable."""

from pathlib import Path
from uuid import uuid4

from graphify.cache import cache_dir


def main() -> None:
    probe = cache_dir(Path.cwd()) / (".write-probe-" + uuid4().hex)
    with probe.open("xb"):
        pass
    probe.unlink()


if __name__ == "__main__":
    main()
