# Graph Report - videomaxxxing  (2026-06-01)

## Corpus Check
- 116 files · ~70,487 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1167 nodes · 3481 edges · 79 communities (73 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `00d9065d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 84|Community 84]]

## God Nodes (most connected - your core abstractions)
1. `String` - 171 edges
2. `Result` - 112 edges
3. `AppHandle` - 66 edges
4. `JobResult` - 54 edges
5. `find_tool()` - 52 edges
6. `cn()` - 50 edges
7. `Option` - 47 edges
8. `PathBuf` - 43 edges
9. `Path` - 41 edges
10. `SettingsDialog()` - 33 edges

## Surprising Connections (you probably didn't know these)
- `ModelCompareDialog()` --calls--> `formatTime()`  [INFERRED]
  app/src/components/previews/model-compare-dialog.tsx → app/src/lib/media-utils.ts
- `ModelCompareDialog()` --calls--> `imageSource()`  [INFERRED]
  app/src/components/previews/model-compare-dialog.tsx → app/src/lib/media-utils.ts
- `SelectGroup()` --calls--> `cn()`  [EXTRACTED]
  app/src/components/ui/select.tsx → app/src/lib/utils.ts
- `SelectLabel()` --calls--> `cn()`  [EXTRACTED]
  app/src/components/ui/select.tsx → app/src/lib/utils.ts
- `Skill for /graphify` --references--> `Index HTML for Simulation Studio App`  [EXTRACTED]
  agents.md → app/index.html

## Communities (79 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.16
Nodes (16): Option, common_parent_dir(), downloads_dir(), find_conda_in_dir(), find_cudnn_dll(), find_cudnn_runtime(), find_downloaded_checkpoint(), find_file_recursive_limited() (+8 more)

### Community 1 - "Community 1"
Cohesion: 0.18
Nodes (25): algorithmId(), clamp(), computeDrawRect(), createProgram(), createShader(), diffuse(), ditherLuma(), halftoneShapeId() (+17 more)

### Community 2 - "Community 2"
Cohesion: 0.16
Nodes (15): cn(), AccordionContent(), AccordionItem(), AccordionTrigger(), Badge(), badgeVariants, Checkbox(), DialogOverlay() (+7 more)

### Community 3 - "Community 3"
Cohesion: 0.14
Nodes (12): audioExtensions, AudioMetadata, JobResult, useAudioTools(), UseAudioToolsArgs, Window, appendTailLog(), AudioPreview() (+4 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (24): code:bash (mkdir -p graphify-out), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash (# Detect the correct Python interpreter (handles uv tool, pi), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c ") (+16 more)

### Community 5 - "Community 5"
Cohesion: 0.16
Nodes (23): UseModelInstallArgs, basicModelByTool, installModelCatalog, createEmptyUpdateAvailability(), UpdateAvailability, ModelCompareDialog(), ModelCompareDialogProps, ModelPreview (+15 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (32): dependencies, class-variance-authority, clsx, lucide-react, radix-ui, react, react-dom, shadcn (+24 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (21): compilerOptions, allowImportingTsExtensions, baseUrl, isolatedModules, jsx, lib, module, moduleResolution (+13 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (21): app, security, windows, withGlobalTauri, enable, scope, build, beforeBuildCommand (+13 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.16
Nodes (49): AppHandle, Duration, Result, conda_env_ready(), conda_named_env_ready(), copy_dir_all(), delete_image_codec_tool(), delete_image_codec_tool_blocking() (+41 more)

### Community 11 - "Community 11"
Cohesion: 0.25
Nodes (7): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 12 - "Community 12"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (25): Skill for /graphify, Index HTML for Simulation Studio App, Audio, Codebase Map, code:text (videomaxxxing/), code:powershell (.\run_app.bat), code:powershell (cd app), code:powershell (where.exe cublasLt64_12.dll) (+17 more)

### Community 22 - "Community 22"
Cohesion: 0.05
Nodes (38): 10. Convert MP4 to ProRes for After Effects, 1. Telegram-Friendly H.264 MP4, 2. High-Quality GIF, 3. Smaller GIF, 4. Balanced GIF, 5. Animated WebP, 6. Extract Last Frame, 7. Extract Frame at Timestamp (+30 more)

### Community 41 - "Community 41"
Cohesion: 0.11
Nodes (18): code:text (Python + PySide6), code:text (D:\VideoToolsApp\), code:json ({), code:text (┌──────────────────────────────────────────────┐), code:text (A clean FFmpeg preset launcher with editable JSON presets.), code:text (Choose input file), Core App Concept, Final Recommended MVP Scope (+10 more)

### Community 42 - "Community 42"
Cohesion: 0.08
Nodes (25): code:powershell (python -m pip install --user graphifyy), code:powershell (.\scripts\load-graphify-env.ps1), code:powershell (.\scripts\load-graphify-env.ps1), code:powershell (& $env:GRAPHIFY_EXE explain "FaceFusion" --graph graphify-ou), code:powershell (& $env:GRAPHIFY_EXE path "VideoSidebar" "run_facefusion_job"), code:powershell (& $env:GRAPHIFY_EXE query "Where is FaceFusion wired into th), code:powershell (& $env:GRAPHIFY_EXE tree --graph graphify-out\graph.json --o), code:powershell (.\scripts\load-graphify-env.ps1) (+17 more)

### Community 44 - "Community 44"
Cohesion: 0.12
Nodes (16): code:block1 (/graphify                                             # full), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash (python3 -m graphify.watch INPUT_PATH --debounce 3), code:bash (graphify hook install    # install), code:bash (graphify claude install), code:bash (graphify claude uninstall  # remove the section), For --cluster-only (+8 more)

### Community 45 - "Community 45"
Cohesion: 0.13
Nodes (14): Build And Check, code:powershell (npm.cmd run tauri dev), code:powershell (npm.cmd run build), code:powershell (cd src-tauri), code:text (../output   generated exports), code:powershell (where.exe cublasLt64_12.dll), FaceFusion CUDA Checklist, Required Tools (+6 more)

### Community 46 - "Community 46"
Cohesion: 0.47
Nodes (5): latestProgressPercent(), LogPanel(), LogPanelProps, EtaEstimate, formatEtaDuration()

### Community 47 - "Community 47"
Cohesion: 0.20
Nodes (10): Cancel Button, code:text (temp/job_YYYYMMDD_HHMMSS_randomid/), code:text (input_telegram.mp4), code:text (tools/ffmpeg.exe), code:text (FFmpeg: found / missing), Important Implementation Details, Output Naming, Subprocess Handling (+2 more)

### Community 48 - "Community 48"
Cohesion: 0.29
Nodes (7): code:text (Input video), code:powershell (ffmpeg -i "{input}" "{temp_frames}\frame_%08d.png"), code:powershell (realesrgan-ncnn-vulkan.exe -i "{temp_frames}" -o "{upscaled_), code:powershell (ffmpeg -framerate {fps} -i "{upscaled_frames}\frame_%08d.png), code:text (scale: 2 or 4), Optional AI Upscaling Pipeline, Real-ESRGAN Upscale

### Community 49 - "Community 49"
Cohesion: 0.29
Nodes (7): code:text (crf 18), code:text (Small GIF: 15 fps, 540 width), code:text (quality 85), GIF Quality and Size, MP4 Quality, Quality Guidance for Presets, WebP Quality

### Community 50 - "Community 50"
Cohesion: 0.33
Nodes (6): code:text (ffmpeg.exe), code:text (realesrgan-ncnn-vulkan.exe), code:text (waifu2x-ncnn-vulkan.exe), External Tools, Optional AI Tools, Required

### Community 51 - "Community 51"
Cohesion: 0.33
Nodes (6): Phase 1 — FFmpeg MVP, Phase 2 — Metadata and Smarter Defaults, Phase 3 — AI Upscaling, Phase 4 — Frame Interpolation, Phase 5 — Polish, Suggested Build Phases

### Community 52 - "Community 52"
Cohesion: 0.50
Nodes (4): code:text (Input video), code:text (24 fps → 48 fps), Optional Frame Interpolation Pipeline, RIFE Interpolation

### Community 53 - "Community 53"
Cohesion: 0.67
Nodes (3): code:text (The input frame is not in sRGB, colors may be off), code:text (Palette created successfully. Color-space warning is common ), Color and Warning Notes

### Community 56 - "Community 56"
Cohesion: 0.15
Nodes (13): code:block10 (You are a graphify extraction subagent. Read the files liste), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:block8 (spawn_agent(agent_type="worker", message="Your task is to pe) (+5 more)

### Community 57 - "Community 57"
Cohesion: 0.29
Nodes (15): PrimaryButton(), SecondaryButton(), SettingsSection(), StatusBadge(), ToolAccordionItem(), ToolStatus, ToolStorage, MustHaveEnvironmentsSection() (+7 more)

### Community 58 - "Community 58"
Cohesion: 0.16
Nodes (26): Default, PathBuf, R, Self, Sender, app_settings_path(), AppSettings, create_thumbnail() (+18 more)

### Community 59 - "Community 59"
Cohesion: 0.13
Nodes (34): AudioWorkspace(), VideoWorkspace(), AudioEtaInput, calibratedEstimate(), CalibrationEntry, calibrationKey(), CalibrationStore, canUseLocalStorage() (+26 more)

### Community 60 - "Community 60"
Cohesion: 0.07
Nodes (58): ButtonProps, ColorControl(), FieldLabel(), FormRow(), fpsOptions, FpsSelect(), PathButton(), RangeControl() (+50 more)

### Community 61 - "Community 61"
Cohesion: 0.14
Nodes (20): PaletteSection(), ComparePan, useModelCompareInteraction(), PaletteResult, localAssetSrc(), clamp(), ColorFormat, extractPaletteFromImageData() (+12 more)

### Community 62 - "Community 62"
Cohesion: 0.41
Nodes (8): MustHaveSettings(), MustHaveSettingsProps, SettingsSidebarProps, Tabs(), TabsContent(), TabsList(), tabsListVariants, TabsTrigger()

### Community 64 - "Community 64"
Cohesion: 0.08
Nodes (33): JobResult, useDitherActions(), UseDitherActionsArgs, ImageDimensions, useImageFileInput(), UseImageFileInputArgs, AnimatedImageFrame, useDitherRenderEffect() (+25 more)

### Community 65 - "Community 65"
Cohesion: 0.07
Nodes (53): Command, add_audio_encode_args(), add_trim_args(), AudioJobOptions, check_tool_updates(), delete_swinir_model(), delete_tool_model(), detect_facefusion() (+45 more)

### Community 67 - "Community 67"
Cohesion: 0.14
Nodes (26): delete_supir_checkpoint(), detect_supir(), find_first_file_with_extension(), import_supir_checkpoint(), is_supir_managed_dependency(), list_supir_models(), run_supir_image_job(), run_supir_image_job_blocking() (+18 more)

### Community 68 - "Community 68"
Cohesion: 0.33
Nodes (6): code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash (if [ ! -f graphify-out/.graphify_extract.json ]; then), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), For --update (incremental re-extraction)

### Community 69 - "Community 69"
Cohesion: 0.09
Nodes (47): AsRef, AudioMetadata, compact_status_message(), concat_file_path(), count_files_with_extension(), default_if_empty(), delete_rife_model(), emit_progress_detail() (+39 more)

### Community 71 - "Community 71"
Cohesion: 0.20
Nodes (31): Path, audio_output_name(), check_tool_updates_blocking(), compress_to_apng(), compress_to_avif(), compress_to_gif(), compress_to_jpeg(), compress_to_png() (+23 more)

### Community 72 - "Community 72"
Cohesion: 0.10
Nodes (22): AppHeader(), ImageWorkspace(), ImageWorkspaceProps, ProgressEvent, useAppLifecycle(), UseAppLifecycleArgs, JobResult, useAppSettings() (+14 more)

### Community 73 - "Community 73"
Cohesion: 0.50
Nodes (4): code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -m graphify save-result), For /graphify query

### Community 74 - "Community 74"
Cohesion: 0.50
Nodes (4): code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -m graphify save-result), For /graphify path

### Community 75 - "Community 75"
Cohesion: 0.50
Nodes (4): code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -c "), code:bash ($(cat graphify-out/.graphify_python) -m graphify save-result), For /graphify explain

### Community 76 - "Community 76"
Cohesion: 0.67
Nodes (3): code:bash ($(cat graphify-out/.graphify_python) -c "), code:block27 (Graph complete. Outputs in PATH_TO_DIR/graphify-out/), Step 9 - Save manifest, update cost tracker, clean up, and report

### Community 77 - "Community 77"
Cohesion: 0.67
Nodes (3): code:bash ($(cat graphify-out/.graphify_python) -c "), code:block4 (Corpus: X files · ~Y words), Step 2 - Detect files

### Community 78 - "Community 78"
Cohesion: 0.10
Nodes (30): IconButton(), FaceFusionStatus, SupirModel, SupirStatus, SwinIrStatus, UseToolStateArgs, ModelSettingsRow, ModelTool (+22 more)

### Community 80 - "Community 80"
Cohesion: 0.27
Nodes (8): useModelInstall(), JobResult, useToolManagement(), UseToolManagementArgs, useToolSetupController(), UseToolSetupControllerArgs, ImageCodecTool, InstalledModelLike

### Community 82 - "Community 82"
Cohesion: 0.06
Nodes (66): VideoWorkspaceProps, useDerivedUiState(), UseDerivedUiStateArgs, useFilePickers(), UseFilePickersArgs, ModelCompareResult, ModelPreview, useModelCompare() (+58 more)

### Community 84 - "Community 84"
Cohesion: 0.12
Nodes (24): compare_realesrgan_models(), compare_realesrgan_models_blocking(), delete_realesrgan_model(), detect_realesrgan_devices(), facefusion_available_providers(), facefusion_processors(), FaceFusionOptions, list_realesrgan_models() (+16 more)

## Knowledge Gaps
- **343 isolated node(s):** `PreToolUse`, `$schema`, `style`, `rsc`, `tsx` (+338 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `facefusion_provider()` connect `Community 82` to `Community 64`, `Community 65`, `Community 84`?**
  _High betweenness centrality (0.129) - this node is a cross-community bridge._
- **Why does `normalize_app_settings()` connect `Community 58` to `Community 72`, `Community 65`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `SettingsDialog()` connect `Community 5` to `Community 64`, `Community 72`, `Community 78`, `Community 80`, `Community 82`, `Community 60`, `Community 62`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `PreToolUse`, `$schema`, `style` to the rest of the system?**
  _343 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.13725490196078433 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `Community 6` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._