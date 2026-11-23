"""Check checkout-local code graph freshness without updating its state.

Uses Graphify's discovery, ignore rules and manifest hashes. Discovery
may create sizing/conversion caches; these go into a disposable temp directory.
Exit codes: 0=current, 2=stale/missing, 1=invalid checkout or unreadable state.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unicodedata

from graphify.detect import FileType, _md5_file, classify_file, detect, load_manifest


def git(root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-c", f"safe.directory={root.as_posix()}", "-C", str(root), *args],
        capture_output=True, text=True, encoding="utf-8", timeout=15,
        env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"}, check=True,
    )
    return result.stdout.strip()


def inspect(root: Path) -> dict:
    root = root.resolve()
    if not (root / ".git").exists():
        raise ValueError("Select an application checkout, not its parent container.")
    if Path(git(root, "rev-parse", "--show-toplevel")).resolve() != root:
        raise ValueError("The selected path must be the Git checkout root.")
    result = {
        "checkout": str(root), "branch": git(root, "rev-parse", "--abbrev-ref", "HEAD"),
        "commit": git(root, "rev-parse", "HEAD"),
        "graph": str(root / "graphify-out/graph.json"),
        "status": "missing", "new": [], "changed": [], "deleted": [], "excluded": [],
        "documents_new": [], "documents_changed": [], "documents_deleted": [], "documents_excluded": [],
    }
    out = root / "graphify-out"
    if not all((out / name).is_file() for name in ("graph.json", "manifest.json", ".graphify_root")):
        return result
    marker = Path((out / ".graphify_root").read_text(encoding="utf-8-sig").strip())
    if not marker.is_absolute():
        marker = root / marker
    if marker.resolve() != root:
        raise ValueError(f"Graph belongs to {marker.resolve()}, not {root}.")
    manifest = load_manifest(str(out / "manifest.json"), root=root)
    if not isinstance(manifest, dict) or not manifest:
        raise ValueError("Graphify manifest is empty or invalid; rebuild the code graph.")
    for filename in manifest:
        if not Path(filename).resolve().is_relative_to(root):
            raise ValueError("Manifest contains a path outside the selected checkout; rebuild it.")
    with tempfile.TemporaryDirectory(prefix="graphify-status-") as cache:
        scan = detect(root, google_workspace=False, cache_root=Path(cache))
    if scan.get("walk_errors"):
        raise ValueError("Graphify could not read the complete source tree.")
    current = {unicodedata.normalize("NFC", f) for f in scan["files"]["code"]}
    documents = {unicodedata.normalize("NFC", f) for kind, paths in scan["files"].items()
                 if kind != "code" for f in paths}

    def relative(filename: str) -> str:
        return Path(filename).relative_to(root).as_posix()

    for filename in sorted(current):
        entry = manifest.get(filename)
        if entry is None:
            result["new"].append(relative(filename))
        elif not isinstance(entry, dict) or not entry.get("ast_hash") or _md5_file(Path(filename)) != entry["ast_hash"]:
            result["changed"].append(relative(filename))
    for filename in sorted(documents):
        entry = manifest.get(filename)
        if entry is None:
            result["documents_new"].append(relative(filename))
        elif not isinstance(entry, dict) or not entry.get("semantic_hash") or _md5_file(Path(filename)) != entry["semantic_hash"]:
            result["documents_changed"].append(relative(filename))
    for filename in sorted(set(manifest) - current - documents):
        if classify_file(Path(filename)) != FileType.CODE:
            entry = manifest[filename]
            stored_hash = entry.get("semantic_hash") or entry.get("ast_hash") if isinstance(entry, dict) else None
            if Path(filename).exists():
                result["documents_excluded"].append(relative(filename))
            else:
                result["documents_deleted"].append(relative(filename))
            continue
        category = "excluded" if Path(filename).exists() else "deleted"
        result[category].append(relative(filename))
    result["code_files"] = len(current)
    result["document_files"] = len(documents)
    result["document_status"] = "stale" if any(result[k] for k in ("documents_new", "documents_changed", "documents_deleted", "documents_excluded")) else "current"
    result["status"] = "stale" if any(result[k] for k in ("new", "changed", "deleted", "excluded")) else "current"
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        result = inspect(args.root)
    except (ValueError, OSError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "error", "error": str(exc)}) if args.json else f"Graphify check failed: {exc}")
        return 1
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"Checkout: {result['checkout']}\nBranch: {result['branch']}\nCommit: {result['commit']}\nGraph: {result['graph']}\nCode freshness: {result['status']}\nDocument/semantic freshness: {result.get('document_status', 'unknown')}")
        for category in ("new", "changed", "deleted", "excluded"):
            if result[category]:
                print(f"{category}: {', '.join(result[category])}")
        if result["status"] != "current":
            print("Run this checkout's scripts/graphify.ps1 refresh before relying on relationships.")
        for category in ("documents_new", "documents_changed", "documents_deleted", "documents_excluded"):
            if result[category]:
                print(f"{category}: {', '.join(result[category])}")
        if result.get("document_status") != "current":
            print("Use exact search/current text; code refresh does not rebuild semantic documents.")
    return 0 if result["status"] == "current" else 2


if __name__ == "__main__":
    raise SystemExit(main())
