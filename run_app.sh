#!/usr/bin/env bash
set -e

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/app"

if [[ -r "$HOME/.cargo/env" ]]; then
  source "$HOME/.cargo/env"
fi

nvm_script="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
if ! command -v npm >/dev/null && [[ -r "$nvm_script" ]]; then
  source "$nvm_script"
fi

if ! command -v npm >/dev/null || ! command -v cargo >/dev/null; then
  printf '%s\n' "Videomaxxing needs Node.js, npm, and Rust to run from source." >&2
  exit 1
fi

export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$PWD/src-tauri/target/ubuntu}"
exec npm run tauri dev -- -- --locked
