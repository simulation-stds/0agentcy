# Videomaxxing architecture

Simulation Studio is a local Tauri desktop application for editing and generating video, images, and audio. React owns interaction, previews, and presentation. Rust owns desktop integration, tool discovery, filesystem work, and process orchestration. FFmpeg and feature-specific workers do the media processing.

| Path | Responsibility |
| --- | --- |
| `app/src/main.tsx`, `app/src/App.tsx` | Start React, compose the workspaces and settings, and connect job events. |
| `app/src/components/` | Video, image, and audio workspaces, action controls, previews, timelines, and settings. |
| `app/src/hooks/` | File selection, tool state, preview playback, jobs, progress, and editing state. |
| `app/src/lib/` | Shared transforms and rendering, including contact sheets, captions, palettes, and effect options. |
| `app/src-tauri/src/main.rs`, `lib.rs` | Start Tauri and register the commands invoked by the frontend. The main library also handles shared paths, exports, and job events. |
| `app/src-tauri/src/*.rs` | Feature-specific modules for video previews, transcription, font handling, restoration, effects, and audio models. |
| `app/src-tauri/src/*_runner.py` and embedded requirements | Launch pinned Python workers for features such as SUPIR, VOSR, skin masks, and WhisperX. |
| `app/tests/` | Node and Python tests. Rust unit and integration tests also live with the backend modules. |
| `scripts/` | Launchers, Graphify maintenance, and the blue-noise data generator. |

The frontend calls Tauri commands and listens to progress events. The backend uses FFprobe for metadata and FFmpeg for previews and exports. On Ubuntu, the app uses system FFmpeg and FFprobe and streams selected local video through a loopback endpoint for playback and seeking. Windows supports managed FFmpeg and uses Tauri's asset protocol for video playback. The contact sheet action samples video through the backend and composes a timestamped PNG in the frontend.

Workspace settings default to `app_settings.local.json`. Outputs are resolved against the checkout unless the profile selects an absolute destination. Input media, exports, scratch files, tool packages, and Graphify graphs are local state. Some runtime installers use OS app-data directories, and VOSR and SUPIR can use shared model storage. The optional `shared-runtimes.local.json` routes named Conda environments to a machine-local manifest. WhisperX stores remembered Hugging Face tokens in the OS keyring and can also keep a token in the current process. The staging profile and storage boundaries are described in [the workspace guide](WORKSPACE.md).
