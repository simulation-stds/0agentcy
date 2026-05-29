use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::hash_map::DefaultHasher,
    env, fs,
    hash::{Hash, Hasher},
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    sync::mpsc,
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Emitter;

static CANCEL_UPSCALE: AtomicBool = AtomicBool::new(false);
const FACEFUSION_ENV_NAME: &str = "videotools-facefusion";

#[derive(Serialize)]
struct ToolStatus {
    ffmpeg: Option<String>,
    ffprobe: Option<String>,
    realesrgan: Option<String>,
    rife: Option<String>,
    facefusion: Option<String>,
    git: Option<String>,
    conda: Option<String>,
    cudnn: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    #[serde(default)]
    default_download_folder: String,
    #[serde(default)]
    cuda_bin_folder: String,
    #[serde(default)]
    cudnn_bin_folder: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_download_folder: workspace_root()
                .join("output")
                .to_string_lossy()
                .to_string(),
            cuda_bin_folder: find_cuda_bin_dir()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_default(),
            cudnn_bin_folder: find_cudnn_bin_dir()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_default(),
        }
    }
}

#[derive(Serialize)]
struct VideoMetadata {
    duration: f64,
    fps: f64,
    width: u64,
    height: u64,
    codec: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Thumbnail {
    time: f64,
    data_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelPreview {
    model: String,
    scale: String,
    data_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelCompareResult {
    original_data_url: String,
    previews: Vec<ModelPreview>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RealEsrganModel {
    name: String,
    scale: String,
    description: String,
    size_bytes: u64,
    size_label: String,
    estimated_size_label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RealEsrganDevice {
    id: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RifeModel {
    name: String,
    description: String,
    size_bytes: u64,
    size_label: String,
    estimated_size_label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FaceFusionStatus {
    state: String,
    repo_path: String,
    env_name: String,
    current_size_label: String,
    estimated_install_label: String,
    available_providers: Vec<String>,
    runtime_label: String,
    provider_warning: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolStorage {
    key: String,
    label: String,
    current_bytes: u64,
    current_label: String,
    estimated_install_label: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent {
    stage: String,
    message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobOptions {
    input_path: String,
    output_folder: String,
    output_name: String,
    action: String,
    trim_start: f64,
    trim_end: f64,
    current_time: f64,
    audio_format: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JobResult {
    output_path: String,
    log: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpscaleOptions {
    input_path: String,
    output_folder: String,
    output_name: String,
    model: String,
    device: Option<String>,
    fps: f64,
    crf: String,
    encoder_preset: String,
    tile_size: String,
    threads: String,
    trim_start: f64,
    trim_end: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RifeOptions {
    input_path: String,
    output_folder: String,
    output_name: String,
    model: String,
    device: Option<String>,
    multiplier: u32,
    fps: f64,
    crf: String,
    encoder_preset: String,
    threads: String,
    tta_spatial: bool,
    tta_temporal: bool,
    uhd: bool,
    trim_start: f64,
    trim_end: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SocialExportOptions {
    input_path: String,
    output_folder: String,
    output_name: String,
    format: String,
    trim_start: f64,
    trim_end: f64,
    fps: String,
    width: String,
    loop_output: bool,
    scale_filter: String,
    crf: String,
    quality: String,
    preset: String,
    include_audio: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FaceFusionOptions {
    input_path: String,
    source_path: String,
    output_folder: String,
    output_name: String,
    processor_preset: String,
    execution_provider: String,
    trim_start: f64,
    trim_end: f64,
}

#[tauri::command]
fn detect_tools() -> ToolStatus {
    ToolStatus {
        ffmpeg: find_tool("ffmpeg"),
        ffprobe: find_tool("ffprobe"),
        realesrgan: find_tool("realesrgan-ncnn-vulkan"),
        rife: find_tool("rife-ncnn-vulkan"),
        facefusion: facefusion_repo_ready()
            .then(|| facefusion_repo_dir().to_string_lossy().to_string()),
        git: find_tool("git"),
        conda: find_tool("conda"),
        cudnn: find_cudnn_runtime(),
    }
    .stringify()
}

#[tauri::command]
fn probe_video(path: String) -> Result<VideoMetadata, String> {
    let input_path = PathBuf::from(path);
    if !input_path.exists() {
        return Err("Input video does not exist.".into());
    }

    let ffprobe = find_tool("ffprobe").ok_or("FFprobe was not found.")?;
    let output = Command::new(ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,r_frame_rate,avg_frame_rate,codec_name",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
        ])
        .arg(&input_path)
        .output()
        .map_err(|err| format!("Failed to run FFprobe: {err}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let data: Value = serde_json::from_slice(&output.stdout).map_err(|err| err.to_string())?;
    let stream = data["streams"]
        .as_array()
        .and_then(|streams| streams.first())
        .ok_or("No video stream found.")?;

    Ok(VideoMetadata {
        duration: data["format"]["duration"]
            .as_str()
            .and_then(|value| value.parse::<f64>().ok())
            .unwrap_or(0.0),
        fps: parse_fps(
            stream["avg_frame_rate"]
                .as_str()
                .or_else(|| stream["r_frame_rate"].as_str())
                .unwrap_or(""),
        ),
        width: stream["width"].as_u64().unwrap_or(0),
        height: stream["height"].as_u64().unwrap_or(0),
        codec: stream["codec_name"].as_str().unwrap_or("").to_string(),
    })
}

#[tauri::command]
fn generate_thumbnails(
    path: String,
    duration: f64,
    count: u32,
    start: Option<f64>,
    end: Option<f64>,
) -> Result<Vec<Thumbnail>, String> {
    let input_path = PathBuf::from(path);
    if !input_path.exists() {
        return Err("Input video does not exist.".into());
    }

    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let thumb_count = count.clamp(1, 16);
    let range_start = start.unwrap_or(0.0).clamp(0.0, duration.max(0.0));
    let range_end = end
        .unwrap_or(duration)
        .clamp(range_start, duration.max(range_start));
    let range_duration = (range_end - range_start).max(0.0);
    let output_dir = thumbnail_dir(&input_path)?;
    fs::create_dir_all(&output_dir).map_err(|err| err.to_string())?;

    let mut thumbnails = Vec::new();
    let mut last_error = String::new();
    for index in 0..thumb_count {
        let denominator = thumb_count.saturating_sub(1).max(1) as f64;
        let time = if range_duration > 0.0 {
            (range_start + range_duration * index as f64 / denominator)
                .min((range_end - 0.05).max(range_start))
        } else {
            range_start
        };
        let output_path = output_dir.join(format!("thumb_{index:02}.jpg"));

        if let Err(error) = create_thumbnail(&ffmpeg, &input_path, &output_path, time) {
            last_error = error;
            continue;
        }

        let bytes = match fs::read(&output_path) {
            Ok(bytes) => bytes,
            Err(error) => {
                last_error = error.to_string();
                continue;
            }
        };
        thumbnails.push(Thumbnail {
            time,
            data_url: format!(
                "data:image/jpeg;base64,{}",
                general_purpose::STANDARD.encode(bytes)
            ),
        });
    }

    if thumbnails.is_empty() && !last_error.is_empty() {
        Err(format!("Thumbnail generation failed: {last_error}"))
    } else {
        Ok(thumbnails)
    }
}

#[tauri::command]
fn list_realesrgan_models() -> Result<Vec<RealEsrganModel>, String> {
    let executable = find_tool("realesrgan-ncnn-vulkan").ok_or("Real-ESRGAN was not found.")?;
    let models_dir = PathBuf::from(executable)
        .parent()
        .ok_or("Real-ESRGAN path has no parent directory.")?
        .join("models");
    if !models_dir.exists() {
        return Ok(Vec::new());
    }

    let mut models = Vec::new();
    for entry in fs::read_dir(models_dir).map_err(|err| err.to_string())? {
        let path = entry.map_err(|err| err.to_string())?.path();
        if path.extension().and_then(|value| value.to_str()) == Some("param") {
            let Some(name) = path.file_stem().and_then(|value| value.to_str()) else {
                continue;
            };
            let bin_path = path.with_extension("bin");
            let size_bytes = file_size(&path) + file_size(&bin_path);
            models.push(RealEsrganModel {
                name: name.to_string(),
                scale: realesrgan_model_scale(name),
                description: realesrgan_model_description(name),
                size_bytes,
                size_label: format_bytes(size_bytes),
                estimated_size_label: realesrgan_model_estimate(name).to_string(),
            });
        }
    }
    models.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(models)
}

#[tauri::command]
fn detect_realesrgan_devices() -> Result<Vec<RealEsrganDevice>, String> {
    let executable = find_tool("realesrgan-ncnn-vulkan").ok_or("Real-ESRGAN was not found.")?;
    let model = list_realesrgan_models()?
        .first()
        .map(|item| item.name.clone())
        .unwrap_or_else(|| "realesr-animevideov3-x2".to_string());
    let output_path = workspace_root()
        .join("temp")
        .join(format!("gpu_probe_{}.png", timestamp_id()));
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    let output = Command::new(&executable)
        .arg("-i")
        .arg("input.jpg")
        .arg("-o")
        .arg(output_path)
        .arg("-n")
        .arg(&model)
        .arg("-s")
        .arg(realesrgan_model_scale(&model))
        .args(["-t", "0", "-j", "1:2:2", "-f", "png", "-g", "0"])
        .current_dir(executable_parent(&executable)?)
        .output()
        .map_err(|err| format!("Failed to run Real-ESRGAN GPU probe: {err}"))?;

    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let mut devices = Vec::new();
    for line in text.lines() {
        let Some(rest) = line.strip_prefix('[') else {
            continue;
        };
        let Some((inside, _)) = rest.split_once(']') else {
            continue;
        };
        let Some((id, name)) = inside.split_once(' ') else {
            continue;
        };
        if id.chars().all(|character| character.is_ascii_digit())
            && !devices
                .iter()
                .any(|device: &RealEsrganDevice| device.id == id)
        {
            devices.push(RealEsrganDevice {
                id: id.to_string(),
                name: name.trim().to_string(),
            });
        }
    }
    Ok(devices)
}

#[tauri::command]
fn list_rife_models() -> Result<Vec<RifeModel>, String> {
    let executable = find_tool("rife-ncnn-vulkan").ok_or("RIFE was not found.")?;
    let tool_dir = executable_parent(&executable)?;
    let candidates = [tool_dir.join("models"), tool_dir.clone()];

    let mut models = Vec::new();
    for models_dir in candidates {
        if !models_dir.exists() {
            continue;
        }
        for entry in fs::read_dir(models_dir).map_err(|err| err.to_string())? {
            let path = entry.map_err(|err| err.to_string())?.path();
            if !path.is_dir() {
                continue;
            }
            let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
                continue;
            };
            if name == "jobs" || models.iter().any(|item: &RifeModel| item.name == name) {
                continue;
            }
            if path.join("flownet.param").exists() && path.join("flownet.bin").exists() {
                let size_bytes = dir_size(&path);
                models.push(RifeModel {
                    name: name.to_string(),
                    description: rife_model_description(name),
                    size_bytes,
                    size_label: format_bytes(size_bytes),
                    estimated_size_label: rife_model_estimate(name).to_string(),
                });
            }
        }
    }
    models.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(models)
}

#[tauri::command]
fn get_tool_storage() -> Vec<ToolStorage> {
    let root = workspace_root().join("tools");
    let items = [
        (
            "ffmpeg",
            "FFmpeg",
            root.join("ffmpeg"),
            "~250-450 MB installed",
        ),
        (
            "git",
            "Git",
            root.join("git"),
            "External install recommended",
        ),
        (
            "miniforge",
            "Miniforge",
            root.join("miniforge"),
            "~700 MB-2 GB depending on Python envs",
        ),
        (
            "realesrgan",
            "Real-ESRGAN",
            root.join("realesrgan-ncnn-vulkan"),
            "~120-350 MB with bundled models",
        ),
        (
            "rife",
            "RIFE",
            root.join("rife-ncnn-vulkan"),
            "~180-800 MB depending on models",
        ),
        (
            "facefusion",
            "FaceFusion",
            root.join("facefusion"),
            "~2-8 GB depending on runtime and models",
        ),
    ];

    items
        .into_iter()
        .map(|(key, label, path, estimated_install_label)| {
            let current_bytes = dir_size(&path);
            ToolStorage {
                key: key.to_string(),
                label: label.to_string(),
                current_bytes,
                current_label: format_bytes(current_bytes),
                estimated_install_label: estimated_install_label.to_string(),
            }
        })
        .collect()
}

#[tauri::command]
fn delete_tool_model(tool: String, model: String) -> Result<JobResult, String> {
    match tool.as_str() {
        "realesrgan" => delete_realesrgan_model(&model)?,
        "rife" => delete_rife_model(&model)?,
        _ => return Err("Unknown model tool.".into()),
    }
    Ok(JobResult {
        output_path: model.clone(),
        log: format!("Removed {tool} model: {model}"),
    })
}

#[tauri::command]
fn default_output_dir() -> Result<String, String> {
    let output = get_app_settings()
        .map(|settings| PathBuf::from(settings.default_download_folder))
        .unwrap_or_else(|_| workspace_root().join("output"));
    fs::create_dir_all(&output).map_err(|err| err.to_string())?;
    Ok(output.to_string_lossy().to_string())
}

#[tauri::command]
fn get_app_settings() -> Result<AppSettings, String> {
    let path = app_settings_path();
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let text = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let settings: AppSettings =
        serde_json::from_str(&text).map_err(|err| format!("Settings file is invalid: {err}"))?;
    Ok(normalize_app_settings(settings))
}

#[tauri::command]
fn save_app_settings(settings: AppSettings) -> Result<AppSettings, String> {
    let settings = normalize_app_settings(settings);
    let path = app_settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let text = serde_json::to_string_pretty(&settings).map_err(|err| err.to_string())?;
    fs::write(&path, text).map_err(|err| err.to_string())?;
    Ok(settings)
}

#[tauri::command]
fn save_text_to_downloads(output_name: String, text: String) -> Result<JobResult, String> {
    let folder = PathBuf::from(get_app_settings()?.default_download_folder);
    fs::create_dir_all(&folder).map_err(|err| err.to_string())?;
    let output_path = folder.join(safe_output_filename(&output_name, "download.txt"));
    fs::write(&output_path, text).map_err(|err| err.to_string())?;
    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: format!("Saved {}", output_path.display()),
    })
}

#[tauri::command]
fn save_data_url_to_downloads(output_name: String, data_url: String) -> Result<JobResult, String> {
    let (_, encoded) = data_url
        .split_once(',')
        .ok_or("Data URL did not contain encoded data.")?;
    let bytes = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|err| format!("Data URL decode failed: {err}"))?;
    let folder = PathBuf::from(get_app_settings()?.default_download_folder);
    fs::create_dir_all(&folder).map_err(|err| err.to_string())?;
    let output_path = folder.join(safe_output_filename(&output_name, "download.bin"));
    fs::write(&output_path, bytes).map_err(|err| err.to_string())?;
    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: format!("Saved {}", output_path.display()),
    })
}

#[tauri::command]
fn run_ffmpeg_job(options: JobOptions) -> Result<JobResult, String> {
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let input_path = PathBuf::from(options.input_path);
    if !input_path.exists() {
        return Err("Input video does not exist.".into());
    }

    let output_folder = PathBuf::from(options.output_folder);
    fs::create_dir_all(&output_folder).map_err(|err| err.to_string())?;

    let output_name = output_name_with_extension(
        &options.output_name,
        &options.action,
        options.audio_format.as_deref(),
    );
    let output_path = output_folder.join(output_name);

    let mut command = Command::new(ffmpeg);
    command.arg("-hide_banner").arg("-y");

    match options.action.as_str() {
        "trim_mp4" => {
            add_trim_args(&mut command, options.trim_start, options.trim_end);
            command
                .arg("-i")
                .arg(&input_path)
                .args([
                    "-c:v",
                    "libx264",
                    "-crf",
                    "18",
                    "-preset",
                    "medium",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "160k",
                    "-movflags",
                    "+faststart",
                ])
                .arg(&output_path);
        }
        "extract_frame" => {
            command
                .arg("-ss")
                .arg(format!("{:.3}", options.current_time.max(0.0)))
                .arg("-i")
                .arg(&input_path)
                .args(["-frames:v", "1", "-update", "1"])
                .arg(&output_path);
        }
        "video_audio" => {
            add_trim_args(&mut command, options.trim_start, options.trim_end);
            command.arg("-i").arg(&input_path).arg("-vn");
            if options.audio_format.as_deref() == Some("wav") {
                command.args(["-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2"]);
            } else {
                command.args(["-codec:a", "libmp3lame", "-q:a", "2"]);
            }
            command.arg(&output_path);
        }
        _ => return Err("Unknown action.".into()),
    }

    let output = command
        .output()
        .map_err(|err| format!("Failed to run FFmpeg: {err}"))?;

    let log = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    if !output.status.success() {
        return Err(if log.trim().is_empty() {
            "FFmpeg failed without output.".into()
        } else {
            log
        });
    }

    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log,
    })
}

#[tauri::command]
async fn run_social_export_job(
    app: tauri::AppHandle,
    options: SocialExportOptions,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_social_export_job_blocking(app, options))
        .await
        .map_err(|err| format!("Social export task failed: {err}"))?
}

fn run_social_export_job_blocking(
    app: tauri::AppHandle,
    options: SocialExportOptions,
) -> Result<JobResult, String> {
    CANCEL_UPSCALE.store(false, Ordering::SeqCst);
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let input_path = PathBuf::from(&options.input_path);
    if !input_path.exists() {
        return Err("Input video does not exist.".into());
    }

    let output_folder = PathBuf::from(&options.output_folder);
    fs::create_dir_all(&output_folder).map_err(|err| err.to_string())?;
    let output_path = output_folder.join(social_output_name(&options.output_name, &options.format));
    let mut full_log = String::new();

    emit_progress(&app, "Social Export", format!("Format: {}", options.format));

    if options.format == "gif" {
        let temp_dir = workspace_root()
            .join("temp")
            .join(format!("social_export_{}", timestamp_id()));
        fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;
        let palette_path = temp_dir.join("palette.png");
        let vf = social_video_filter(&options, false);

        let mut palette = Command::new(&ffmpeg);
        palette.arg("-hide_banner").arg("-y");
        add_trim_args(&mut palette, options.trim_start, options.trim_end);
        palette
            .arg("-i")
            .arg(&input_path)
            .arg("-vf")
            .arg(format!("{vf},palettegen=max_colors=256"))
            .arg(&palette_path);
        run_stage(&app, "GIF palette", &mut palette, None, None, &mut full_log)?;

        let mut gif = Command::new(&ffmpeg);
        gif.arg("-hide_banner").arg("-y");
        add_trim_args(&mut gif, options.trim_start, options.trim_end);
        gif.arg("-i")
            .arg(&input_path)
            .arg("-i")
            .arg(&palette_path)
            .arg("-lavfi")
            .arg(format!("{vf}[x];[x][1:v]paletteuse=dither=sierra2_4a"))
            .arg("-loop")
            .arg(if options.loop_output { "0" } else { "-1" })
            .arg(&output_path);
        run_stage(&app, "GIF export", &mut gif, None, None, &mut full_log)?;
        fs::remove_dir_all(&temp_dir).ok();
    } else {
        let mut command = Command::new(&ffmpeg);
        command.arg("-hide_banner").arg("-y");
        add_trim_args(&mut command, options.trim_start, options.trim_end);
        command.arg("-i").arg(&input_path);
        let vf = social_video_filter(&options, options.format == "h264_mp4");
        command.arg("-vf").arg(vf);

        match options.format.as_str() {
            "h264_mp4" => {
                command
                    .args(["-c:v", "libx264", "-crf"])
                    .arg(default_if_empty(&options.crf, "18"))
                    .arg("-preset")
                    .arg(default_if_empty(&options.preset, "veryslow"))
                    .args(["-pix_fmt", "yuv420p", "-movflags", "+faststart"]);
                if options.include_audio {
                    command.args(["-c:a", "aac", "-b:a", "160k"]);
                } else {
                    command.arg("-an");
                }
            }
            "webp" => {
                command
                    .args(["-an", "-c:v", "libwebp", "-quality"])
                    .arg(default_if_empty(&options.quality, "90"))
                    .args(["-compression_level", "6", "-loop"])
                    .arg(if options.loop_output { "0" } else { "1" });
            }
            "apng" => {
                emit_progress(
                    &app,
                    "APNG export",
                    "Animated PNG can create very large files.".to_string(),
                );
                command
                    .args(["-an", "-f", "apng", "-plays"])
                    .arg(if options.loop_output { "0" } else { "1" });
            }
            _ => return Err("Unknown social export format.".into()),
        }

        command.arg(&output_path);
        run_stage(
            &app,
            "Social Export",
            &mut command,
            None,
            None,
            &mut full_log,
        )?;
    }

    emit_progress(
        &app,
        "Social Export",
        format!("Output: {}", output_path.display()),
    );
    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: full_log,
    })
}

#[tauri::command]
fn cancel_upscale_job() {
    CANCEL_UPSCALE.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn cancel_facefusion_job() {
    CANCEL_UPSCALE.store(true, Ordering::SeqCst);
}

#[tauri::command]
fn detect_facefusion() -> FaceFusionStatus {
    facefusion_status()
}

#[tauri::command]
async fn install_or_update_facefusion(
    app: tauri::AppHandle,
    onnxruntime: String,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        install_or_update_facefusion_blocking(app, onnxruntime)
    })
    .await
    .map_err(|err| format!("FaceFusion install task failed: {err}"))?
}

fn install_or_update_facefusion_blocking(
    app: tauri::AppHandle,
    onnxruntime: String,
) -> Result<JobResult, String> {
    let git = find_tool("git")
        .ok_or("Git was not found in PATH. Install Git before installing FaceFusion.")?;
    let conda = find_tool("conda").ok_or(
        "Conda was not found in PATH. Install Miniconda or Anaconda before installing FaceFusion.",
    )?;
    find_tool("ffmpeg").ok_or("FFmpeg was not found. Install FFmpeg first from Must haves.")?;

    let tool_dir = facefusion_tool_dir();
    let repo_dir = facefusion_repo_dir();
    fs::create_dir_all(&tool_dir).map_err(|err| err.to_string())?;
    let runtime = default_if_empty(&onnxruntime, "directml").to_lowercase();
    let mut full_log = String::new();

    if repo_dir.join("facefusion.py").exists() {
        let mut pull = Command::new(&git);
        pull.args(["-C"]).arg(&repo_dir).args(["pull", "--ff-only"]);
        run_stage(
            &app,
            "FaceFusion update",
            &mut pull,
            None,
            None,
            &mut full_log,
        )?;
    } else {
        if repo_dir.exists() {
            fs::remove_dir_all(&repo_dir).map_err(|err| err.to_string())?;
        }
        let mut clone = Command::new(&git);
        clone
            .args(["clone", "https://github.com/facefusion/facefusion"])
            .arg(&repo_dir);
        run_stage(
            &app,
            "FaceFusion clone",
            &mut clone,
            None,
            None,
            &mut full_log,
        )?;
    }

    if !conda_env_ready(&conda) {
        let mut create = Command::new(&conda);
        create.args([
            "create",
            "--yes",
            "--name",
            FACEFUSION_ENV_NAME,
            "python=3.12",
            "pip=25.0",
        ]);
        run_stage(
            &app,
            "FaceFusion environment",
            &mut create,
            None,
            None,
            &mut full_log,
        )?;
    }

    let mut install = Command::new(&conda);
    install
        .args([
            "run",
            "--no-capture-output",
            "-n",
            FACEFUSION_ENV_NAME,
            "python",
        ])
        .arg("install.py")
        .arg("--onnxruntime")
        .arg(&runtime);
    run_stage(
        &app,
        "FaceFusion install",
        &mut install,
        Some(repo_dir.clone()),
        None,
        &mut full_log,
    )?;

    emit_progress(&app, "FaceFusion", "Installed FaceFusion.".to_string());
    Ok(JobResult {
        output_path: repo_dir.to_string_lossy().to_string(),
        log: full_log,
    })
}

#[tauri::command]
async fn update_rife(
    app: tauri::AppHandle,
    selected_models: Option<Vec<String>>,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || update_rife_blocking(app, selected_models))
        .await
        .map_err(|err| format!("RIFE update task failed: {err}"))?
}

fn update_rife_blocking(
    app: tauri::AppHandle,
    selected_models: Option<Vec<String>>,
) -> Result<JobResult, String> {
    install_github_release_tool(
        &app,
        "Update RIFE",
        "nihui/rife-ncnn-vulkan",
        "rife-ncnn-vulkan",
        "rife-ncnn-vulkan.exe",
        &["rife-ncnn-vulkan", "windows"],
    )?;
    if let Some(models) = selected_models.as_ref().filter(|items| !items.is_empty()) {
        prune_rife_models(models)?;
    }
    let tool_path = find_tool("rife-ncnn-vulkan").unwrap_or_default();
    Ok(JobResult {
        output_path: tool_path,
        log: "RIFE update finished.".to_string(),
    })
}

#[tauri::command]
async fn update_ffmpeg(app: tauri::AppHandle) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || update_ffmpeg_blocking(app))
        .await
        .map_err(|err| format!("FFmpeg update task failed: {err}"))?
}

fn update_ffmpeg_blocking(app: tauri::AppHandle) -> Result<JobResult, String> {
    let root = workspace_root();
    let tools_dir = root.join("tools");
    let temp_dir = root.join("temp").join("tool_downloads");
    fs::create_dir_all(&tools_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;

    emit_progress(
        &app,
        "Update FFmpeg",
        "Checking BtbN/FFmpeg-Builds releases...".to_string(),
    );
    let asset = latest_github_asset("BtbN/FFmpeg-Builds", &["ffmpeg-master-latest-win64-gpl"])?;
    let zip_path = temp_dir.join(&asset.name);
    emit_progress(
        &app,
        "Update FFmpeg",
        format!("Downloading {}...", asset.name),
    );
    download_with_progress(&app, "Update FFmpeg", &asset.url, &zip_path)?;

    let extract_dir = root
        .join("temp")
        .join(format!("tool_extract_ffmpeg_{}", timestamp_id()));
    if extract_dir.exists() {
        fs::remove_dir_all(&extract_dir).map_err(|err| err.to_string())?;
    }
    fs::create_dir_all(&extract_dir).map_err(|err| err.to_string())?;
    emit_progress(&app, "Update FFmpeg", "Extracting package...".to_string());
    unzip_archive(&zip_path, &extract_dir)?;

    let ffmpeg = find_file_by_name(&extract_dir, "ffmpeg.exe")
        .ok_or("Downloaded package did not contain ffmpeg.exe.")?;
    find_file_by_name(&extract_dir, "ffprobe.exe")
        .ok_or("Downloaded package did not contain ffprobe.exe.")?;
    let package_bin_dir = ffmpeg
        .parent()
        .ok_or("Downloaded FFmpeg executable has no parent directory.")?;
    let staged_dir = root
        .join("temp")
        .join(format!("tool_stage_ffmpeg_{}", timestamp_id()));
    if staged_dir.exists() {
        fs::remove_dir_all(&staged_dir).map_err(|err| err.to_string())?;
    }
    copy_dir_all(package_bin_dir, &staged_dir)?;

    let probe = Command::new(staged_dir.join("ffmpeg.exe"))
        .arg("-version")
        .output()
        .map_err(|err| format!("Failed to validate FFmpeg: {err}"))?;
    if !probe.status.success() {
        return Err(format!(
            "Downloaded FFmpeg executable failed validation: {}",
            String::from_utf8_lossy(&probe.stderr).trim()
        ));
    }
    let probe = Command::new(staged_dir.join("ffprobe.exe"))
        .arg("-version")
        .output()
        .map_err(|err| format!("Failed to validate FFprobe: {err}"))?;
    if !probe.status.success() {
        return Err(format!(
            "Downloaded FFprobe executable failed validation: {}",
            String::from_utf8_lossy(&probe.stderr).trim()
        ));
    }

    let managed_dir = tools_dir.join("ffmpeg");
    let backup_dir = root
        .join("temp")
        .join(format!("tool_backup_ffmpeg_{}", timestamp_id()));
    if managed_dir.exists() {
        fs::rename(&managed_dir, &backup_dir).map_err(|err| err.to_string())?;
    }
    match fs::rename(&staged_dir, &managed_dir) {
        Ok(()) => {
            if backup_dir.exists() {
                fs::remove_dir_all(&backup_dir).ok();
            }
            fs::remove_dir_all(&extract_dir).ok();
            emit_progress(&app, "Update FFmpeg", "Installed FFmpeg.".to_string());
            Ok(JobResult {
                output_path: managed_dir.to_string_lossy().to_string(),
                log: format!("Installed {} from BtbN/FFmpeg-Builds.", asset.name),
            })
        }
        Err(error) => {
            if backup_dir.exists() && !managed_dir.exists() {
                let _ = fs::rename(&backup_dir, &managed_dir);
            }
            Err(format!("Failed to activate FFmpeg: {error}"))
        }
    }
}

#[tauri::command]
async fn update_miniforge(app: tauri::AppHandle) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || update_miniforge_blocking(app))
        .await
        .map_err(|err| format!("Miniforge update task failed: {err}"))?
}

fn update_miniforge_blocking(app: tauri::AppHandle) -> Result<JobResult, String> {
    let root = workspace_root();
    let tools_dir = root.join("tools");
    let temp_dir = root.join("temp").join("tool_downloads");
    fs::create_dir_all(&tools_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;

    emit_progress(
        &app,
        "Update Miniforge",
        "Checking conda-forge/miniforge releases...".to_string(),
    );
    let asset = latest_github_asset_ext(
        "conda-forge/miniforge",
        &["miniforge3", "windows", "x86_64"],
        ".exe",
    )?;
    let installer_path = temp_dir.join(&asset.name);
    emit_progress(
        &app,
        "Update Miniforge",
        format!("Downloading {}...", asset.name),
    );
    download_with_progress(&app, "Update Miniforge", &asset.url, &installer_path)?;

    let staged_dir = root
        .join("temp")
        .join(format!("tool_stage_miniforge_{}", timestamp_id()));
    if staged_dir.exists() {
        fs::remove_dir_all(&staged_dir).map_err(|err| err.to_string())?;
    }
    fs::create_dir_all(&staged_dir).map_err(|err| err.to_string())?;

    let mut install = Command::new(&installer_path);
    install
        .args([
            "/S",
            "/InstallationType=JustMe",
            "/AddToPath=0",
            "/RegisterPython=0",
        ])
        .arg(format!("/D={}", staged_dir.to_string_lossy()));
    let mut full_log = String::new();
    run_stage(
        &app,
        "Update Miniforge",
        &mut install,
        None,
        None,
        &mut full_log,
    )?;

    let staged_conda = find_conda_in_dir(&staged_dir)
        .ok_or("Miniforge installer finished, but conda.exe was not found.")?;
    let probe = Command::new(&staged_conda)
        .arg("--version")
        .output()
        .map_err(|err| format!("Failed to validate Miniforge conda: {err}"))?;
    if !probe.status.success() {
        return Err(format!(
            "Downloaded Miniforge failed validation: {}",
            String::from_utf8_lossy(&probe.stderr).trim()
        ));
    }

    let managed_dir = miniforge_dir();
    let backup_dir = root
        .join("temp")
        .join(format!("tool_backup_miniforge_{}", timestamp_id()));
    if managed_dir.exists() {
        fs::rename(&managed_dir, &backup_dir).map_err(|err| err.to_string())?;
    }
    match fs::rename(&staged_dir, &managed_dir) {
        Ok(()) => {
            if backup_dir.exists() {
                fs::remove_dir_all(&backup_dir).ok();
            }
            emit_progress(&app, "Update Miniforge", "Installed Miniforge.".to_string());
            Ok(JobResult {
                output_path: find_conda_in_dir(&managed_dir)
                    .unwrap_or_else(|| managed_dir.join("Scripts").join("conda.exe"))
                    .to_string_lossy()
                    .to_string(),
                log: format!("Installed {} from conda-forge/miniforge.", asset.name),
            })
        }
        Err(error) => {
            if backup_dir.exists() && !managed_dir.exists() {
                let _ = fs::rename(&backup_dir, &managed_dir);
            }
            Err(format!("Failed to activate Miniforge: {error}"))
        }
    }
}

#[tauri::command]
async fn compare_realesrgan_models(
    app: tauri::AppHandle,
    path: String,
    current_time: f64,
    device: Option<String>,
    tile_size: String,
    threads: String,
) -> Result<ModelCompareResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        compare_realesrgan_models_blocking(app, path, current_time, device, tile_size, threads)
    })
    .await
    .map_err(|err| format!("Model compare task failed: {err}"))?
}

fn compare_realesrgan_models_blocking(
    app: tauri::AppHandle,
    path: String,
    current_time: f64,
    device: Option<String>,
    tile_size: String,
    threads: String,
) -> Result<ModelCompareResult, String> {
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let realesrgan = find_tool("realesrgan-ncnn-vulkan").ok_or("Real-ESRGAN was not found.")?;
    let input_path = PathBuf::from(path);
    if !input_path.exists() {
        return Err("Input video does not exist.".into());
    }

    let models = list_realesrgan_models()?;
    if models.is_empty() {
        return Err("No Real-ESRGAN models were found.".into());
    }

    let temp_dir = workspace_root()
        .join("temp")
        .join("jobs")
        .join("model_compare")
        .join(timestamp_id());
    fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;
    let source_frame = temp_dir.join("source.png");

    emit_progress(
        &app,
        "Model Compare",
        format!("Extracting frame at {:.3}s", current_time.max(0.0)),
    );
    create_frame_png(&ffmpeg, &input_path, &source_frame, current_time.max(0.0))
        .map_err(|err| format!("Failed to extract compare frame: {err}"))?;
    if !source_frame.exists() {
        return Err(format!(
            "Compare frame was not created: {}",
            source_frame.display()
        ));
    }
    let original_data_url = image_data_url(&source_frame, "image/png")?;

    let mut previews = Vec::new();
    for model in models {
        emit_progress(&app, "Model Compare", format!("Testing {}", model.name));
        let model_dir = temp_dir.join(&model.name);
        fs::create_dir_all(&model_dir).map_err(|err| err.to_string())?;
        let model_output = model_dir.join("preview.png");
        let mut command = Command::new(&realesrgan);
        command
            .arg("-i")
            .arg(&source_frame)
            .arg("-o")
            .arg(&model_output)
            .arg("-n")
            .arg(&model.name)
            .arg("-s")
            .arg(&model.scale)
            .arg("-t")
            .arg(default_if_empty(&tile_size, "0"))
            .arg("-j")
            .arg(default_if_empty(&threads, "1:2:2"))
            .arg("-f")
            .arg("png");
        if let Some(device) = device.as_deref().filter(|value| !value.trim().is_empty()) {
            command.arg("-g").arg(device);
        }

        let output = command
            .current_dir(executable_parent(&realesrgan)?)
            .output()
            .map_err(|err| format!("Failed to run Real-ESRGAN at {}: {err}", realesrgan))?;
        if !output.status.success() {
            emit_progress(
                &app,
                "Model Compare",
                format!(
                    "{} failed: {}",
                    model.name,
                    String::from_utf8_lossy(&output.stderr).trim()
                ),
            );
            continue;
        }

        if !model_output.exists() {
            emit_progress(
                &app,
                "Model Compare",
                format!("{} did not create {}", model.name, model_output.display()),
            );
            continue;
        }

        previews.push(ModelPreview {
            model: model.name,
            scale: model.scale,
            data_url: image_data_url(&model_output, "image/png")?,
        });
    }

    if previews.is_empty() {
        Err("No model previews were generated.".into())
    } else {
        Ok(ModelCompareResult {
            original_data_url,
            previews,
        })
    }
}

#[tauri::command]
async fn update_realesrgan(
    app: tauri::AppHandle,
    selected_models: Option<Vec<String>>,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || update_realesrgan_blocking(app, selected_models))
        .await
        .map_err(|err| format!("Real-ESRGAN update task failed: {err}"))?
}

fn update_realesrgan_blocking(
    app: tauri::AppHandle,
    selected_models: Option<Vec<String>>,
) -> Result<JobResult, String> {
    install_github_release_tool(
        &app,
        "Update Real-ESRGAN",
        "xinntao/Real-ESRGAN",
        "realesrgan-ncnn-vulkan",
        "realesrgan-ncnn-vulkan.exe",
        &["realesrgan-ncnn-vulkan", "windows"],
    )?;
    if let Some(models) = selected_models.as_ref().filter(|items| !items.is_empty()) {
        prune_realesrgan_models(models)?;
    }
    let tool_path = find_tool("realesrgan-ncnn-vulkan").unwrap_or_default();
    Ok(JobResult {
        output_path: tool_path,
        log: "Real-ESRGAN update finished.".to_string(),
    })
}

#[tauri::command]
async fn run_upscale_job(
    app: tauri::AppHandle,
    options: UpscaleOptions,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_upscale_job_blocking(app, options))
        .await
        .map_err(|err| format!("Upscale task failed: {err}"))?
}

fn run_upscale_job_blocking(
    app: tauri::AppHandle,
    options: UpscaleOptions,
) -> Result<JobResult, String> {
    CANCEL_UPSCALE.store(false, Ordering::SeqCst);
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let realesrgan = find_tool("realesrgan-ncnn-vulkan").ok_or("Real-ESRGAN was not found.")?;
    let input_path = PathBuf::from(&options.input_path);
    if !input_path.exists() {
        return Err("Input video does not exist.".into());
    }

    let output_folder = PathBuf::from(&options.output_folder);
    fs::create_dir_all(&output_folder).map_err(|err| err.to_string())?;
    let mut output_name = options.output_name.trim().to_string();
    if Path::new(&output_name).extension().is_none() {
        output_name.push_str(".mp4");
    }
    let output_path = output_folder.join(output_name);
    let temp_dir = workspace_root()
        .join("temp")
        .join("jobs")
        .join(format!("tauri_upscale_{}", timestamp_id()));
    let frames_dir = temp_dir.join("frames");
    let upscaled_dir = temp_dir.join("upscaled_frames");
    fs::create_dir_all(&frames_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(&upscaled_dir).map_err(|err| err.to_string())?;

    emit_progress(
        &app,
        "Preparing",
        format!("Temp files: {}", temp_dir.display()),
    );
    let mut full_log = String::new();

    let input_pattern = frames_dir.join("frame_%08d.png");
    let mut extract = Command::new(&ffmpeg);
    extract.arg("-hide_banner").arg("-y");
    add_trim_args(&mut extract, options.trim_start, options.trim_end);
    extract.arg("-i").arg(&input_path).arg(&input_pattern);
    run_stage(
        &app,
        "Extract frames",
        &mut extract,
        None,
        None,
        &mut full_log,
    )?;
    let extracted_frames = count_files_with_extension(&frames_dir, "png")?;
    emit_progress(
        &app,
        "Extract frames",
        format!("Prepared {extracted_frames} frames"),
    );

    let scale = realesrgan_model_scale(&options.model);
    let mut upscale = Command::new(&realesrgan);
    upscale
        .arg("-i")
        .arg(&frames_dir)
        .arg("-o")
        .arg(&upscaled_dir)
        .arg("-n")
        .arg(&options.model)
        .arg("-s")
        .arg(&scale)
        .arg("-t")
        .arg(default_if_empty(&options.tile_size, "0"))
        .arg("-j")
        .arg(default_if_empty(&options.threads, "1:2:2"))
        .arg("-f")
        .arg("png");
    if let Some(device) = options
        .device
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        upscale.arg("-g").arg(device);
    }
    run_stage(
        &app,
        "Upscale frames",
        &mut upscale,
        Some(executable_parent(&realesrgan)?),
        Some(extracted_frames),
        &mut full_log,
    )?;

    let upscaled_pattern = upscaled_dir.join("frame_%08d.png");
    let mut assemble = Command::new(&ffmpeg);
    assemble
        .arg("-hide_banner")
        .arg("-y")
        .arg("-framerate")
        .arg(format!("{:.3}", options.fps.max(1.0)))
        .arg("-start_number")
        .arg("1")
        .arg("-i")
        .arg(&upscaled_pattern);
    add_trim_args(&mut assemble, options.trim_start, options.trim_end);
    assemble
        .arg("-i")
        .arg(&input_path)
        .args(["-map", "0:v:0", "-map", "1:a?", "-c:v", "libx264", "-crf"])
        .arg(default_if_empty(&options.crf, "18"))
        .arg("-preset")
        .arg(default_if_empty(&options.encoder_preset, "medium"))
        .args(["-pix_fmt", "yuv420p", "-c:a", "copy", "-shortest"])
        .arg(&output_path);
    run_stage(
        &app,
        "Reassemble video",
        &mut assemble,
        None,
        None,
        &mut full_log,
    )?;

    if output_path.exists() {
        fs::remove_dir_all(&temp_dir).ok();
    }
    emit_progress(&app, "Done", format!("Output: {}", output_path.display()));
    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: full_log,
    })
}

#[tauri::command]
async fn run_rife_job(app: tauri::AppHandle, options: RifeOptions) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_rife_job_blocking(app, options))
        .await
        .map_err(|err| format!("RIFE task failed: {err}"))?
}

fn run_rife_job_blocking(app: tauri::AppHandle, options: RifeOptions) -> Result<JobResult, String> {
    CANCEL_UPSCALE.store(false, Ordering::SeqCst);
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let rife = find_tool("rife-ncnn-vulkan").ok_or("RIFE was not found.")?;
    let input_path = PathBuf::from(&options.input_path);
    if !input_path.exists() {
        return Err("Input video does not exist.".into());
    }

    let output_folder = PathBuf::from(&options.output_folder);
    fs::create_dir_all(&output_folder).map_err(|err| err.to_string())?;
    let mut output_name = options.output_name.trim().to_string();
    if Path::new(&output_name).extension().is_none() {
        output_name.push_str(".mp4");
    }
    let output_path = output_folder.join(output_name);
    let temp_dir = workspace_root()
        .join("temp")
        .join("jobs")
        .join(format!("tauri_rife_{}", timestamp_id()));
    let frames_dir = temp_dir.join("frames");
    fs::create_dir_all(&frames_dir).map_err(|err| err.to_string())?;

    emit_progress(
        &app,
        "Preparing",
        format!("Temp files: {}", temp_dir.display()),
    );
    let mut full_log = String::new();

    let input_pattern = frames_dir.join("frame_%08d.png");
    let mut extract = Command::new(&ffmpeg);
    extract.arg("-hide_banner").arg("-y");
    add_trim_args(&mut extract, options.trim_start, options.trim_end);
    extract.arg("-i").arg(&input_path).arg(&input_pattern);
    run_stage(
        &app,
        "Extract frames",
        &mut extract,
        None,
        None,
        &mut full_log,
    )?;
    let extracted_frames = count_files_with_extension(&frames_dir, "png")?;
    if extracted_frames < 2 {
        return Err("RIFE needs at least two frames to interpolate.".into());
    }
    emit_progress(
        &app,
        "Extract frames",
        format!("Prepared {extracted_frames} frames"),
    );

    let multiplier = options.multiplier.clamp(2, 8);
    let passes = multiplier.ilog2().max(1);
    let model_path = rife_model_path(&rife, &options.model)?;
    let mut source_dir = frames_dir.clone();
    let mut source_count = extracted_frames;

    for pass in 1..=passes {
        let pass_dir = temp_dir.join(format!("interpolated_pass_{pass}"));
        fs::create_dir_all(&pass_dir).map_err(|err| err.to_string())?;
        let target_frames = source_count.saturating_mul(2);
        let mut interpolate = Command::new(&rife);
        interpolate
            .arg("-i")
            .arg(&source_dir)
            .arg("-o")
            .arg(&pass_dir)
            .arg("-m")
            .arg(&model_path)
            .arg("-j")
            .arg(default_if_empty(&options.threads, "1:2:2"))
            .arg("-f")
            .arg("%08d.png");
        if let Some(device) = options
            .device
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            interpolate.arg("-g").arg(device);
        }
        if options.tta_spatial {
            interpolate.arg("-x");
        }
        if options.tta_temporal {
            interpolate.arg("-z");
        }
        if options.uhd {
            interpolate.arg("-u");
        }
        run_stage(
            &app,
            &format!("Interpolate frames {pass}/{passes}"),
            &mut interpolate,
            Some(executable_parent(&rife)?),
            Some(target_frames),
            &mut full_log,
        )?;
        source_dir = pass_dir;
        source_count = count_files_with_extension(&source_dir, "png")?;
        emit_progress(
            &app,
            "Interpolate frames",
            format!("Pass {pass}/{passes} produced {source_count} frames"),
        );
    }

    let interpolated_pattern = source_dir.join("%08d.png");
    let mut assemble = Command::new(&ffmpeg);
    assemble
        .arg("-hide_banner")
        .arg("-y")
        .arg("-framerate")
        .arg(format!("{:.3}", (options.fps * multiplier as f64).max(1.0)))
        .arg("-i")
        .arg(&interpolated_pattern);
    add_trim_args(&mut assemble, options.trim_start, options.trim_end);
    assemble
        .arg("-i")
        .arg(&input_path)
        .args(["-map", "0:v:0", "-map", "1:a?", "-c:v", "libx264", "-crf"])
        .arg(default_if_empty(&options.crf, "18"))
        .arg("-preset")
        .arg(default_if_empty(&options.encoder_preset, "medium"))
        .args(["-pix_fmt", "yuv420p", "-c:a", "copy", "-shortest"])
        .arg(&output_path);
    run_stage(
        &app,
        "Reassemble video",
        &mut assemble,
        None,
        None,
        &mut full_log,
    )?;

    if output_path.exists() {
        fs::remove_dir_all(&temp_dir).ok();
    }
    emit_progress(&app, "Done", format!("Output: {}", output_path.display()));
    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: full_log,
    })
}

#[tauri::command]
async fn run_facefusion_job(
    app: tauri::AppHandle,
    options: FaceFusionOptions,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_facefusion_job_blocking(app, options))
        .await
        .map_err(|err| format!("FaceFusion task failed: {err}"))?
}

fn run_facefusion_job_blocking(
    app: tauri::AppHandle,
    options: FaceFusionOptions,
) -> Result<JobResult, String> {
    CANCEL_UPSCALE.store(false, Ordering::SeqCst);
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    let conda = find_tool("conda").ok_or("Conda was not found in PATH.")?;
    let settings = get_app_settings()?;
    let repo_dir = facefusion_repo_dir();
    if !repo_dir.join("facefusion.py").exists() {
        return Err("FaceFusion is not installed. Install it from Video settings first.".into());
    }
    if !conda_env_ready(&conda) {
        return Err(
            "FaceFusion Conda environment is not ready. Run FaceFusion install/update first."
                .into(),
        );
    }

    let input_path = PathBuf::from(&options.input_path);
    let source_path = PathBuf::from(&options.source_path);
    if !input_path.exists() {
        return Err("Target video does not exist.".into());
    }
    if !source_path.exists() {
        return Err("Source face image does not exist.".into());
    }

    let output_folder = PathBuf::from(&options.output_folder);
    fs::create_dir_all(&output_folder).map_err(|err| err.to_string())?;
    let mut output_name = options.output_name.trim().to_string();
    if Path::new(&output_name).extension().is_none() {
        output_name.push_str(".mp4");
    }
    let output_path = output_folder.join(output_name);
    if output_path.exists() {
        fs::remove_file(&output_path).map_err(|err| err.to_string())?;
    }

    let temp_dir = workspace_root()
        .join("temp")
        .join("jobs")
        .join("facefusion")
        .join(timestamp_id());
    fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;
    let target_path = if options.trim_end > options.trim_start + 0.05 {
        let trimmed_target = temp_dir.join("target_trim.mp4");
        let mut trim = Command::new(&ffmpeg);
        trim.arg("-hide_banner").arg("-y");
        add_trim_args(&mut trim, options.trim_start, options.trim_end);
        trim.arg("-i")
            .arg(&input_path)
            .args(["-c:v", "libx264", "-crf", "18", "-preset", "fast"])
            .args(["-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k"])
            .arg(&trimmed_target);
        let mut full_log = String::new();
        run_stage(
            &app,
            "FaceFusion trim",
            &mut trim,
            None,
            None,
            &mut full_log,
        )?;
        trimmed_target
    } else {
        input_path.clone()
    };

    let processors = facefusion_processors(&options.processor_preset);
    let provider = facefusion_provider(&options.execution_provider);
    let mut full_log = String::new();
    emit_progress(
        &app,
        "FaceFusion",
        format!("Running {} with {provider}.", options.processor_preset),
    );

    let mut runtime_paths = Vec::new();
    if let Some(ffmpeg_dir) = PathBuf::from(&ffmpeg).parent() {
        runtime_paths.push(ffmpeg_dir.to_path_buf());
    }
    if provider == "cuda" {
        push_existing_runtime_path(&mut runtime_paths, &settings.cuda_bin_folder);
        push_existing_runtime_path(&mut runtime_paths, &settings.cudnn_bin_folder);
    }
    let launcher_path = if provider == "cuda" {
        write_facefusion_launcher(&temp_dir, &repo_dir, &runtime_paths)?
    } else {
        repo_dir.join("facefusion.py")
    };

    let mut command = Command::new(&conda);
    command
        .args([
            "run",
            "--no-capture-output",
            "-n",
            FACEFUSION_ENV_NAME,
            "python",
        ])
        .arg(&launcher_path)
        .arg("headless-run")
        .arg("--source-paths")
        .arg(&source_path)
        .arg("--target-path")
        .arg(&target_path)
        .arg("--output-path")
        .arg(&output_path)
        .arg("--execution-providers")
        .arg(provider);
    if !processors.is_empty() {
        command.arg("--processors");
        for processor in processors {
            command.arg(processor);
        }
    }
    prepend_paths_env(&mut command, &runtime_paths);
    run_stage(
        &app,
        "FaceFusion",
        &mut command,
        Some(repo_dir),
        None,
        &mut full_log,
    )?;

    if output_path.exists() {
        fs::remove_dir_all(&temp_dir).ok();
    }
    emit_progress(
        &app,
        "FaceFusion",
        format!("Output: {}", output_path.display()),
    );
    Ok(JobResult {
        output_path: output_path.to_string_lossy().to_string(),
        log: full_log,
    })
}

fn emit_progress(app: &tauri::AppHandle, stage: &str, message: String) {
    let _ = app.emit(
        "upscale-progress",
        ProgressEvent {
            stage: stage.to_string(),
            message,
        },
    );
}

fn run_stage(
    app: &tauri::AppHandle,
    stage: &str,
    command: &mut Command,
    current_dir: Option<PathBuf>,
    frame_total: Option<usize>,
    full_log: &mut String,
) -> Result<(), String> {
    if let Some(dir) = current_dir {
        command.current_dir(dir);
    }

    emit_progress(app, stage, "Started".to_string());
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|err| format!("{stage} failed to start: {err}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let (sender, receiver) = mpsc::channel::<String>();
    let mut frame_progress = frame_total.map(FrameProgress::new);

    if let Some(stream) = stdout {
        stream_lines(stream, sender.clone());
    }
    if let Some(stream) = stderr {
        stream_lines(stream, sender.clone());
    }
    drop(sender);

    loop {
        while let Ok(line) = receiver.try_recv() {
            if !line.trim().is_empty() {
                full_log.push_str(&line);
                full_log.push('\n');
                emit_progress(app, stage, format_stage_line(line, &mut frame_progress));
            }
        }

        if CANCEL_UPSCALE.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            emit_progress(app, stage, "Cancelled".to_string());
            return Err("Upscale job cancelled.".into());
        }

        if let Some(status) = child
            .try_wait()
            .map_err(|err| format!("{stage} failed while running: {err}"))?
        {
            for line in receiver.try_iter() {
                if !line.trim().is_empty() {
                    full_log.push_str(&line);
                    full_log.push('\n');
                    emit_progress(app, stage, format_stage_line(line, &mut frame_progress));
                }
            }

            if status.success() {
                emit_progress(app, stage, "Finished".to_string());
                return Ok(());
            }

            return Err(format!(
                "{stage} failed with exit code {}.",
                status
                    .code()
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "unknown".to_string())
            ));
        }

        thread::sleep(std::time::Duration::from_millis(120));
    }
}

fn stream_lines<R: Read + Send + 'static>(stream: R, sender: mpsc::Sender<String>) {
    thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines().map_while(Result::ok) {
            let _ = sender.send(line);
        }
    });
}

fn install_github_release_tool(
    app: &tauri::AppHandle,
    stage: &str,
    repo: &str,
    managed_name: &str,
    executable_name: &str,
    asset_terms: &[&str],
) -> Result<(), String> {
    let root = workspace_root();
    let tools_dir = root.join("tools");
    let temp_dir = root.join("temp").join("tool_downloads");
    fs::create_dir_all(&tools_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;

    emit_progress(app, stage, format!("Checking {repo} releases..."));
    let asset = latest_github_asset(repo, asset_terms)?;
    let zip_path = temp_dir.join(&asset.name);

    emit_progress(app, stage, format!("Downloading {}...", asset.name));
    download_with_progress(app, stage, &asset.url, &zip_path)?;

    let extract_dir =
        root.join("temp")
            .join(format!("tool_extract_{}_{}", managed_name, timestamp_id()));
    if extract_dir.exists() {
        fs::remove_dir_all(&extract_dir).map_err(|err| err.to_string())?;
    }
    fs::create_dir_all(&extract_dir).map_err(|err| err.to_string())?;

    emit_progress(app, stage, "Extracting package...".to_string());
    unzip_archive(&zip_path, &extract_dir)?;
    let executable = find_file_by_name(&extract_dir, executable_name)
        .ok_or_else(|| format!("Downloaded package did not contain {executable_name}."))?;
    let package_dir = executable_parent(&executable)?;
    let staged_dir =
        root.join("temp")
            .join(format!("tool_stage_{}_{}", managed_name, timestamp_id()));
    if staged_dir.exists() {
        fs::remove_dir_all(&staged_dir).map_err(|err| err.to_string())?;
    }
    copy_dir_all(&package_dir, &staged_dir)?;

    let managed_dir = tools_dir.join(managed_name);
    let backup_dir =
        root.join("temp")
            .join(format!("tool_backup_{}_{}", managed_name, timestamp_id()));
    if managed_dir.exists() {
        fs::rename(&managed_dir, &backup_dir).map_err(|err| err.to_string())?;
    }

    match fs::rename(&staged_dir, &managed_dir) {
        Ok(()) => {
            if backup_dir.exists() {
                fs::remove_dir_all(&backup_dir).ok();
            }
            fs::remove_dir_all(&extract_dir).ok();
            emit_progress(app, stage, format!("Installed {}.", asset.name));
            Ok(())
        }
        Err(error) => {
            if backup_dir.exists() && !managed_dir.exists() {
                let _ = fs::rename(&backup_dir, &managed_dir);
            }
            Err(format!("Failed to activate {managed_name}: {error}"))
        }
    }
}

struct ReleaseAsset {
    name: String,
    url: String,
}

fn latest_github_asset(repo: &str, terms: &[&str]) -> Result<ReleaseAsset, String> {
    latest_github_asset_ext(repo, terms, ".zip")
}

fn latest_github_asset_ext(
    repo: &str,
    terms: &[&str],
    extension: &str,
) -> Result<ReleaseAsset, String> {
    let url = format!("https://api.github.com/repos/{repo}/releases");
    let mut response = ureq::get(&url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "videomaxxxing-local-tool")
        .call()
        .map_err(|err| format!("Failed to fetch GitHub releases: {err}"))?;
    let body = response
        .body_mut()
        .read_to_string()
        .map_err(|err| format!("Failed to read GitHub releases: {err}"))?;
    let releases: Value = serde_json::from_str(&body).map_err(|err| err.to_string())?;
    let releases = releases
        .as_array()
        .ok_or("GitHub releases response was not an array.")?;

    for release in releases {
        let Some(assets) = release["assets"].as_array() else {
            continue;
        };
        for asset in assets {
            let name = asset["name"].as_str().unwrap_or_default();
            let lower = name.to_lowercase();
            let matches_terms = terms
                .iter()
                .all(|term| lower.contains(&term.to_lowercase()))
                && lower.ends_with(&extension.to_lowercase());
            if matches_terms {
                let url = asset["browser_download_url"]
                    .as_str()
                    .ok_or("GitHub asset had no download URL.")?;
                return Ok(ReleaseAsset {
                    name: name.to_string(),
                    url: url.to_string(),
                });
            }
        }
    }

    Err(format!("No matching Windows asset was found for {repo}."))
}

fn download_with_progress(
    app: &tauri::AppHandle,
    stage: &str,
    url: &str,
    destination: &Path,
) -> Result<(), String> {
    let mut response = ureq::get(url)
        .header("User-Agent", "videomaxxxing-local-tool")
        .call()
        .map_err(|err| format!("Failed to download release asset: {err}"))?;
    let total = response
        .headers()
        .get("content-length")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok());
    let mut reader = response.body_mut().as_reader();
    let mut output = fs::File::create(destination).map_err(|err| err.to_string())?;
    let mut buffer = vec![0_u8; 1024 * 256];
    let mut downloaded = 0_u64;
    let mut last_reported_mb = 0_u64;

    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|err| format!("Failed while downloading: {err}"))?;
        if read == 0 {
            break;
        }
        output
            .write_all(&buffer[..read])
            .map_err(|err| err.to_string())?;
        downloaded += read as u64;
        let downloaded_mb = downloaded / 1_048_576;
        if downloaded_mb >= last_reported_mb + 5 {
            last_reported_mb = downloaded_mb;
            let message = if let Some(total) = total {
                format!(
                    "Downloaded {:.1} / {:.1} MB",
                    downloaded as f64 / 1_048_576.0,
                    total as f64 / 1_048_576.0
                )
            } else {
                format!("Downloaded {:.1} MB", downloaded as f64 / 1_048_576.0)
            };
            emit_progress(app, stage, message);
        }
    }

    emit_progress(
        app,
        stage,
        format!("Downloaded {:.1} MB", downloaded as f64 / 1_048_576.0),
    );
    Ok(())
}

fn unzip_archive(zip_path: &Path, destination: &Path) -> Result<(), String> {
    let file = fs::File::open(zip_path).map_err(|err| err.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|err| err.to_string())?;
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|err| err.to_string())?;
        let Some(enclosed_name) = file.enclosed_name() else {
            continue;
        };
        let output_path = destination.join(enclosed_name);
        if file.is_dir() {
            fs::create_dir_all(&output_path).map_err(|err| err.to_string())?;
        } else {
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent).map_err(|err| err.to_string())?;
            }
            let mut output = fs::File::create(&output_path).map_err(|err| err.to_string())?;
            std::io::copy(&mut file, &mut output).map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

struct FrameProgress {
    current: usize,
    total: usize,
    last_percent: f64,
}

impl FrameProgress {
    fn new(total: usize) -> Self {
        Self {
            current: 1,
            total: total.max(1),
            last_percent: 0.0,
        }
    }
}

fn format_stage_line(line: String, progress: &mut Option<FrameProgress>) -> String {
    let trimmed = line.trim();
    let Some(value) = trimmed
        .strip_suffix('%')
        .and_then(|percent| percent.parse::<f64>().ok())
    else {
        return line;
    };

    let Some(progress) = progress else {
        return line;
    };

    if value < progress.last_percent && progress.current < progress.total {
        progress.current += 1;
    }
    progress.last_percent = value;
    format!(
        "frame [{}/{}] - {} {:.1}%",
        progress.current,
        progress.total,
        text_progress_bar(value),
        value
    )
}

fn text_progress_bar(percent: f64) -> String {
    let filled = (percent / 10.0).round().clamp(0.0, 10.0) as usize;
    format!("{}{}", "▓".repeat(filled), "▒".repeat(10 - filled))
}

fn app_settings_path() -> PathBuf {
    workspace_root().join("app_settings.local.json")
}

fn safe_output_filename(name: &str, fallback: &str) -> String {
    let trimmed = name.trim();
    let source = if trimmed.is_empty() {
        fallback
    } else {
        trimmed
    };
    let cleaned = source
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ if character.is_control() => '_',
            _ => character,
        })
        .collect::<String>();
    if cleaned.trim().is_empty() {
        fallback.to_string()
    } else {
        cleaned
    }
}

fn social_output_name(name: &str, format: &str) -> String {
    let extension = match format {
        "gif" => ".gif",
        "webp" => ".webp",
        "apng" => ".apng",
        _ => ".mp4",
    };
    let stem = default_if_empty(name, "social_export");
    let desired = extension.trim_start_matches('.');
    let path = Path::new(stem);
    if path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case(desired))
    {
        stem.to_string()
    } else {
        let clean_stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or(stem);
        format!("{clean_stem}{extension}")
    }
}

fn social_video_filter(options: &SocialExportOptions, include_gradfun: bool) -> String {
    let mut parts = Vec::new();
    if let Ok(fps) = options.fps.trim().parse::<f64>() {
        if fps > 0.0 {
            parts.push(format!("fps={fps:.3}"));
        }
    }
    let width = default_if_empty(&options.width, "1280");
    let scale_filter = default_if_empty(&options.scale_filter, "lanczos");
    parts.push(format!("scale={width}:-2:flags={scale_filter}"));
    if include_gradfun {
        parts.push("gradfun=strength=0.6".to_string());
    }
    parts.join(",")
}

fn file_size(path: &Path) -> u64 {
    fs::metadata(path)
        .map(|metadata| metadata.len())
        .unwrap_or(0)
}

fn dir_size(path: &Path) -> u64 {
    let Ok(metadata) = fs::metadata(path) else {
        return 0;
    };
    if metadata.is_file() {
        return metadata.len();
    }

    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .filter_map(Result::ok)
        .map(|entry| dir_size(&entry.path()))
        .sum()
}

fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} {}", UNITS[unit])
    } else if value >= 10.0 {
        format!("{value:.0} {}", UNITS[unit])
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

fn normalize_app_settings(mut settings: AppSettings) -> AppSettings {
    if settings.default_download_folder.trim().is_empty() {
        settings.default_download_folder = workspace_root()
            .join("output")
            .to_string_lossy()
            .to_string();
    }
    if settings.cuda_bin_folder.trim().is_empty() {
        settings.cuda_bin_folder = find_cuda_bin_dir()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default();
    }
    if settings.cudnn_bin_folder.trim().is_empty() {
        settings.cudnn_bin_folder = find_cudnn_bin_dir()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default();
    }
    settings
}

fn facefusion_tool_dir() -> PathBuf {
    workspace_root().join("tools").join("facefusion")
}

fn facefusion_repo_dir() -> PathBuf {
    facefusion_tool_dir().join("repo")
}

fn miniforge_dir() -> PathBuf {
    workspace_root().join("tools").join("miniforge")
}

fn find_conda_in_dir(dir: &Path) -> Option<PathBuf> {
    [
        dir.join("Scripts").join("conda.exe"),
        dir.join("condabin").join("conda.exe"),
        dir.join("condabin").join("conda.bat"),
    ]
    .into_iter()
    .find(|path| path.exists())
}

fn facefusion_repo_ready() -> bool {
    facefusion_repo_dir().join("facefusion.py").exists()
}

fn facefusion_status() -> FaceFusionStatus {
    let repo_path = facefusion_repo_dir();
    let current_bytes = dir_size(&facefusion_tool_dir());
    let estimated_install_label = "~2-8 GB depending on runtime and models".to_string();
    let repo_ready = repo_path.join("facefusion.py").exists();
    let conda = find_tool("conda");
    let env_ready = conda.as_deref().map(conda_env_ready).unwrap_or(false);
    let (available_providers, provider_warning) = if env_ready {
        conda
            .as_deref()
            .map(facefusion_available_providers)
            .unwrap_or_else(|| (Vec::new(), String::new()))
    } else {
        (Vec::new(), String::new())
    };
    let runtime_label = facefusion_runtime_label(&available_providers);
    let (state, message) = if !repo_ready {
        (
            "missing".to_string(),
            "FaceFusion repo is not installed.".to_string(),
        )
    } else if conda.is_none() {
        (
            "needs_setup".to_string(),
            "FaceFusion repo exists, but Conda was not found in PATH.".to_string(),
        )
    } else if !env_ready {
        (
            "needs_setup".to_string(),
            format!("FaceFusion repo exists, but Conda env {FACEFUSION_ENV_NAME} is not ready."),
        )
    } else {
        (
            "installed".to_string(),
            "FaceFusion repo and Conda environment are ready.".to_string(),
        )
    };

    FaceFusionStatus {
        state,
        repo_path: repo_path.to_string_lossy().to_string(),
        env_name: FACEFUSION_ENV_NAME.to_string(),
        current_size_label: format_bytes(current_bytes),
        estimated_install_label,
        available_providers,
        runtime_label,
        provider_warning,
        message,
    }
}

fn conda_env_ready(conda: &str) -> bool {
    Command::new(conda)
        .args(["run", "-n", FACEFUSION_ENV_NAME, "python", "--version"])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn facefusion_available_providers(conda: &str) -> (Vec<String>, String) {
    let output = Command::new(conda)
        .args([
            "run",
            "-n",
            FACEFUSION_ENV_NAME,
            "python",
            "-c",
            "import json, onnxruntime as ort; print(json.dumps(ort.get_available_providers()))",
        ])
        .output();
    let Ok(output) = output else {
        return (
            Vec::new(),
            "Failed to probe ONNX Runtime providers.".to_string(),
        );
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let providers = stdout
        .lines()
        .rev()
        .find_map(|line| serde_json::from_str::<Vec<String>>(line.trim()).ok())
        .unwrap_or_default();
    let warning = stderr
        .lines()
        .filter(|line| {
            let lower = line.to_lowercase();
            lower.contains("error")
                || lower.contains("fail")
                || lower.contains("missing")
                || lower.contains("cuda")
        })
        .take(4)
        .collect::<Vec<_>>()
        .join("\n");
    (providers, warning)
}

fn facefusion_runtime_label(providers: &[String]) -> String {
    let labels: Vec<&str> = [
        ("CUDAExecutionProvider", "CUDA"),
        ("DmlExecutionProvider", "DirectML"),
        ("OpenVINOExecutionProvider", "OpenVINO"),
        ("CPUExecutionProvider", "CPU"),
    ]
    .into_iter()
    .filter_map(|(provider, label)| {
        providers
            .iter()
            .any(|item| item == provider)
            .then_some(label)
    })
    .collect();
    if labels.is_empty() {
        "Unknown".to_string()
    } else {
        labels.join(" + ")
    }
}

fn facefusion_processors(preset: &str) -> Vec<&'static str> {
    match preset {
        "face_enhance" => vec!["face_enhancer"],
        "swap_enhance" => vec!["face_swapper", "face_enhancer"],
        _ => vec!["face_swapper"],
    }
}

fn facefusion_provider(provider: &str) -> &'static str {
    match provider.to_lowercase().as_str() {
        "cuda" => "cuda",
        "openvino" => "openvino",
        "cpu" | "default" => "cpu",
        _ => "directml",
    }
}

fn push_existing_runtime_path(paths: &mut Vec<PathBuf>, path: &str) {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return;
    }
    let candidate = PathBuf::from(trimmed);
    if candidate.exists() {
        paths.push(candidate);
    }
}

fn write_facefusion_launcher(
    temp_dir: &Path,
    repo_dir: &Path,
    runtime_paths: &[PathBuf],
) -> Result<PathBuf, String> {
    let launcher_path = temp_dir.join("run_facefusion_with_dll_dirs.py");
    let facefusion_script = repo_dir.join("facefusion.py");
    let paths_json = serde_json::to_string(
        &runtime_paths
            .iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect::<Vec<_>>(),
    )
    .map_err(|err| err.to_string())?;
    let script_json = serde_json::to_string(&facefusion_script.to_string_lossy())
        .map_err(|err| err.to_string())?;
    let launcher = format!(
        r#"import os
import runpy
import sys

repo_dir = os.path.dirname({script_json})
for dll_dir in {paths_json}:
    if dll_dir and os.path.isdir(dll_dir):
        os.add_dll_directory(dll_dir)

facefusion_script = {script_json}
os.chdir(repo_dir)
sys.path.insert(0, repo_dir)
sys.argv = [facefusion_script] + sys.argv[1:]
runpy.run_path(facefusion_script, run_name="__main__")
"#
    );
    fs::write(&launcher_path, launcher)
        .map_err(|err| format!("Failed to write FaceFusion CUDA launcher: {err}"))?;
    Ok(launcher_path)
}

fn prepend_paths_env(command: &mut Command, paths: &[PathBuf]) {
    if paths.is_empty() {
        return;
    }
    let separator = if cfg!(windows) { ";" } else { ":" };
    let current = env::var("PATH").unwrap_or_default();
    let prefix = paths
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(separator);
    command.env(
        "PATH",
        if current.is_empty() {
            prefix
        } else {
            format!("{prefix}{separator}{current}")
        },
    );
}

trait StringifyTools {
    fn stringify(self) -> ToolStatus;
}

impl StringifyTools for ToolStatus {
    fn stringify(self) -> ToolStatus {
        self
    }
}

fn find_tool(name: &str) -> Option<String> {
    local_tool_candidates(name)
        .into_iter()
        .chain(path_tool_candidates(name))
        .find(|path| path.exists())
        .map(|path| path.to_string_lossy().to_string())
}

fn find_cudnn_runtime() -> Option<String> {
    find_tool("cudnn64_9.dll")
        .or_else(|| find_cudnn_dll().map(|path| path.to_string_lossy().to_string()))
}

fn find_cuda_bin_dir() -> Option<PathBuf> {
    let root = PathBuf::from(r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA");
    let mut candidates = Vec::new();
    if let Ok(entries) = fs::read_dir(&root) {
        for entry in entries.flatten() {
            let path = entry.path().join("bin");
            if path.join("cublasLt64_12.dll").exists() {
                candidates.push(path);
            }
        }
    }
    candidates.sort_by(|left, right| right.to_string_lossy().cmp(&left.to_string_lossy()));
    candidates.into_iter().next()
}

fn find_cudnn_bin_dir() -> Option<PathBuf> {
    find_cudnn_dll().and_then(|path| path.parent().map(Path::to_path_buf))
}

fn find_cudnn_dll() -> Option<PathBuf> {
    let root = PathBuf::from(r"C:\Program Files\NVIDIA\CUDNN");
    find_file_recursive_limited(&root, "cudnn64_9.dll", 6)
}

fn find_file_recursive_limited(root: &Path, file_name: &str, max_depth: usize) -> Option<PathBuf> {
    if max_depth == 0 || !root.exists() {
        return None;
    }

    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file()
            && path
                .file_name()
                .is_some_and(|name| name.to_string_lossy().eq_ignore_ascii_case(file_name))
        {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_file_recursive_limited(&path, file_name, max_depth - 1) {
                return Some(found);
            }
        }
    }
    None
}

fn local_tool_candidates(name: &str) -> Vec<PathBuf> {
    let root = workspace_root();
    match name {
        "realesrgan-ncnn-vulkan" => vec![
            root.join("tools")
                .join("realesrgan-ncnn-vulkan")
                .join("realesrgan-ncnn-vulkan.exe"),
            root.join("tools")
                .join("models")
                .join("realesrgan-ncnn")
                .join("realesrgan-ncnn-vulkan.exe"),
        ],
        "rife-ncnn-vulkan" => vec![root
            .join("tools")
            .join("rife-ncnn-vulkan")
            .join("rife-ncnn-vulkan.exe")],
        "ffmpeg" => vec![root.join("tools").join("ffmpeg").join("ffmpeg.exe")],
        "ffprobe" => vec![root.join("tools").join("ffmpeg").join("ffprobe.exe")],
        "conda" => vec![
            root.join("tools")
                .join("miniforge")
                .join("Scripts")
                .join("conda.exe"),
            root.join("tools")
                .join("miniforge")
                .join("condabin")
                .join("conda.exe"),
            root.join("tools")
                .join("miniforge")
                .join("condabin")
                .join("conda.bat"),
        ],
        _ => Vec::new(),
    }
}

fn realesrgan_models_dir() -> Result<PathBuf, String> {
    let executable = find_tool("realesrgan-ncnn-vulkan").ok_or("Real-ESRGAN was not found.")?;
    Ok(PathBuf::from(executable)
        .parent()
        .ok_or("Real-ESRGAN path has no parent directory.")?
        .join("models"))
}

fn rife_model_dirs() -> Result<Vec<PathBuf>, String> {
    let executable = find_tool("rife-ncnn-vulkan").ok_or("RIFE was not found.")?;
    let tool_dir = executable_parent(&executable)?;
    Ok(vec![tool_dir.join("models"), tool_dir])
}

fn delete_realesrgan_model(model: &str) -> Result<(), String> {
    let models_dir = realesrgan_models_dir()?;
    for extension in ["param", "bin"] {
        let path = models_dir.join(format!("{model}.{extension}"));
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|err| format!("Failed to remove {}: {err}", path.display()))?;
        }
    }
    Ok(())
}

fn delete_rife_model(model: &str) -> Result<(), String> {
    for dir in rife_model_dirs()? {
        let path = dir.join(model);
        if path.is_dir() {
            fs::remove_dir_all(&path)
                .map_err(|err| format!("Failed to remove {}: {err}", path.display()))?;
        }
    }
    Ok(())
}

fn prune_realesrgan_models(keep: &[String]) -> Result<(), String> {
    let keep: Vec<&str> = keep.iter().map(String::as_str).collect();
    for model in list_realesrgan_models()? {
        if !keep.contains(&model.name.as_str()) {
            delete_realesrgan_model(&model.name)?;
        }
    }
    Ok(())
}

fn prune_rife_models(keep: &[String]) -> Result<(), String> {
    let keep: Vec<&str> = keep.iter().map(String::as_str).collect();
    for model in list_rife_models()? {
        if !keep.contains(&model.name.as_str()) {
            delete_rife_model(&model.name)?;
        }
    }
    Ok(())
}

fn realesrgan_model_description(name: &str) -> String {
    match name {
        value if value.contains("anime") => {
            "Anime/cartoon line art and stylized video upscaling.".to_string()
        }
        value if value.contains("general") => {
            "General photo/video restoration model with optional denoise variants.".to_string()
        }
        value if value.contains("plus") => {
            "General-purpose Real-ESRGAN model for natural images and video frames.".to_string()
        }
        _ => "Real-ESRGAN frame upscaling model.".to_string(),
    }
}

fn realesrgan_model_estimate(name: &str) -> &'static str {
    match name {
        value if value.contains("anime") => "~15-35 MB",
        value if value.contains("general") => "~50-140 MB",
        _ => "~60-180 MB",
    }
}

fn rife_model_description(name: &str) -> String {
    match name {
        value if value.contains("v4.6") => {
            "Recommended general RIFE interpolation model for most videos.".to_string()
        }
        value if value.contains("v4") => {
            "RIFE v4 model family; best match for current ncnn custom timestep support.".to_string()
        }
        value if value.contains("anime") => {
            "Interpolation tuned for animation/anime-style content.".to_string()
        }
        _ => "RIFE frame interpolation model.".to_string(),
    }
}

fn rife_model_estimate(name: &str) -> &'static str {
    match name {
        value if value.contains("v4") => "~40-160 MB",
        _ => "~50-250 MB",
    }
}

fn path_tool_candidates(name: &str) -> Vec<PathBuf> {
    let mut names = vec![name.to_string()];
    if cfg!(windows) && !name.ends_with(".exe") {
        names.push(format!("{name}.exe"));
        names.push(format!("{name}.cmd"));
        names.push(format!("{name}.bat"));
    }

    env::var_os("PATH")
        .into_iter()
        .flat_map(|paths| env::split_paths(&paths).collect::<Vec<_>>())
        .flat_map(|dir| names.iter().map(move |name| dir.join(name)))
        .collect()
}

fn workspace_root() -> PathBuf {
    let current = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    for path in current.ancestors() {
        if path.join("tools").exists()
            && (path.join("app").exists() || path.join("tauri-video-tools").exists())
        {
            return path.to_path_buf();
        }
    }
    current
}

fn thumbnail_dir(input_path: &Path) -> Result<PathBuf, String> {
    let metadata = fs::metadata(input_path).map_err(|err| err.to_string())?;
    let mut hasher = DefaultHasher::new();
    input_path
        .to_string_lossy()
        .to_lowercase()
        .hash(&mut hasher);
    metadata.len().hash(&mut hasher);
    if let Ok(modified) = metadata.modified() {
        modified.hash(&mut hasher);
    }
    Ok(workspace_root()
        .join("temp")
        .join("tauri_thumbnails")
        .join(format!("{:016x}", hasher.finish())))
}

fn create_thumbnail(
    ffmpeg: &str,
    input_path: &Path,
    output_path: &Path,
    time: f64,
) -> Result<(), String> {
    let fast = Command::new(ffmpeg)
        .args(["-hide_banner", "-loglevel", "error", "-y", "-ss"])
        .arg(format!("{time:.3}"))
        .arg("-i")
        .arg(input_path)
        .args([
            "-frames:v",
            "1",
            "-vf",
            "scale=160:-1",
            "-q:v",
            "4",
            "-update",
            "1",
        ])
        .arg(output_path)
        .output()
        .map_err(|err| format!("Failed to run FFmpeg: {err}"))?;

    if fast.status.success() && output_path.exists() {
        return Ok(());
    }

    let accurate = Command::new(ffmpeg)
        .args(["-hide_banner", "-loglevel", "error", "-y"])
        .arg("-i")
        .arg(input_path)
        .arg("-ss")
        .arg(format!("{time:.3}"))
        .args([
            "-frames:v",
            "1",
            "-vf",
            "scale=160:-1",
            "-q:v",
            "4",
            "-update",
            "1",
        ])
        .arg(output_path)
        .output()
        .map_err(|err| format!("Failed to run FFmpeg: {err}"))?;

    if accurate.status.success() && output_path.exists() {
        Ok(())
    } else {
        let fast_error = String::from_utf8_lossy(&fast.stderr);
        let accurate_error = String::from_utf8_lossy(&accurate.stderr);
        Err(format!("{fast_error}{accurate_error}").trim().to_string())
    }
}

fn create_frame_png(
    ffmpeg: &str,
    input_path: &Path,
    output_path: &Path,
    time: f64,
) -> Result<(), String> {
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    let attempts = [
        vec![
            "-hide_banner".to_string(),
            "-loglevel".to_string(),
            "error".to_string(),
            "-y".to_string(),
            "-ss".to_string(),
            format!("{time:.3}"),
            "-i".to_string(),
        ],
        vec![
            "-hide_banner".to_string(),
            "-loglevel".to_string(),
            "error".to_string(),
            "-y".to_string(),
            "-i".to_string(),
        ],
    ];

    let mut last_error = String::new();
    for (index, mut args) in attempts.into_iter().enumerate() {
        let mut command = Command::new(ffmpeg);
        command.args(args.drain(..));
        command.arg(input_path);
        if index == 1 {
            command.arg("-ss").arg(format!("{time:.3}"));
        }
        command
            .args(["-frames:v", "1", "-update", "1"])
            .arg(output_path);
        let output = command
            .output()
            .map_err(|err| format!("Failed to run FFmpeg at {ffmpeg}: {err}"))?;
        if output.status.success() && output_path.exists() {
            return Ok(());
        }
        last_error = String::from_utf8_lossy(&output.stderr).trim().to_string();
    }

    Err(if last_error.is_empty() {
        "FFmpeg failed without output.".to_string()
    } else {
        last_error
    })
}

fn image_data_url(path: &Path, mime_type: &str) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|err| err.to_string())?;
    Ok(format!(
        "data:{mime_type};base64,{}",
        general_purpose::STANDARD.encode(bytes)
    ))
}

fn count_files_with_extension(dir: &Path, extension: &str) -> Result<usize, String> {
    let mut total = 0;
    for entry in fs::read_dir(dir).map_err(|err| err.to_string())? {
        let path = entry.map_err(|err| err.to_string())?.path();
        if path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case(extension))
        {
            total += 1;
        }
    }
    Ok(total)
}

fn find_file_by_name(root: &Path, name: &str) -> Option<PathBuf> {
    for entry in fs::read_dir(root).ok()? {
        let path = entry.ok()?.path();
        if path
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case(name))
        {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_file_by_name(&path, name) {
                return Some(found);
            }
        }
    }
    None
}

fn copy_dir_all(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|err| err.to_string())?;
    for entry in fs::read_dir(source).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if source_path.is_dir() {
            copy_dir_all(&source_path, &destination_path)?;
        } else {
            fs::copy(&source_path, &destination_path).map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

fn rife_model_path(executable: &str, model: &str) -> Result<PathBuf, String> {
    let tool_dir = executable_parent(executable)?;
    let direct = tool_dir.join(model);
    if direct.exists() {
        return Ok(direct);
    }
    let nested = tool_dir.join("models").join(model);
    if nested.exists() {
        return Ok(nested);
    }
    Err(format!("RIFE model not found: {model}"))
}

fn executable_parent(path: impl AsRef<Path>) -> Result<PathBuf, String> {
    path.as_ref()
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Executable path has no parent directory.".to_string())
}

fn timestamp_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    millis.to_string()
}

fn default_if_empty<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback
    } else {
        trimmed
    }
}

fn realesrgan_model_scale(model: &str) -> String {
    if model.contains("-x2") || model.ends_with("x2") {
        "2".to_string()
    } else if model.contains("-x3") || model.ends_with("x3") {
        "3".to_string()
    } else {
        "4".to_string()
    }
}

fn add_trim_args(command: &mut Command, start: f64, end: f64) {
    let safe_start = start.max(0.0);
    let duration = (end - safe_start).max(0.0);
    if safe_start > 0.0 {
        command.arg("-ss").arg(format!("{safe_start:.3}"));
    }
    if duration > 0.0 {
        command.arg("-t").arg(format!("{duration:.3}"));
    }
}

fn output_name_with_extension(name: &str, action: &str, audio_format: Option<&str>) -> String {
    let trimmed = name.trim();
    let fallback = "output";
    let stem = if trimmed.is_empty() {
        fallback
    } else {
        trimmed
    };
    let extension = match action {
        "extract_frame" => ".png",
        "video_audio" if audio_format == Some("wav") => ".wav",
        "video_audio" => ".mp3",
        _ => ".mp4",
    };

    let desired = extension.trim_start_matches('.');
    let path = Path::new(stem);
    let current = path.extension().and_then(|value| value.to_str());
    if current.is_some_and(|value| value.eq_ignore_ascii_case(desired)) {
        stem.to_string()
    } else {
        let clean_stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or(stem);
        format!("{clean_stem}{extension}")
    }
}

fn parse_fps(value: &str) -> f64 {
    let Some((numerator, denominator)) = value.split_once('/') else {
        return value.parse::<f64>().unwrap_or(0.0);
    };
    let numerator = numerator.parse::<f64>().unwrap_or(0.0);
    let denominator = denominator.parse::<f64>().unwrap_or(0.0);
    if denominator <= 0.0 {
        0.0
    } else {
        numerator / denominator
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            detect_tools,
            detect_facefusion,
            get_tool_storage,
            probe_video,
            generate_thumbnails,
            list_realesrgan_models,
            detect_realesrgan_devices,
            list_rife_models,
            delete_tool_model,
            default_output_dir,
            get_app_settings,
            save_app_settings,
            save_text_to_downloads,
            save_data_url_to_downloads,
            run_ffmpeg_job,
            run_social_export_job,
            run_upscale_job,
            run_rife_job,
            run_facefusion_job,
            cancel_upscale_job,
            cancel_facefusion_job,
            install_or_update_facefusion,
            update_ffmpeg,
            update_miniforge,
            update_realesrgan,
            update_rife,
            compare_realesrgan_models
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
