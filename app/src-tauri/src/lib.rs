use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::hash_map::DefaultHasher,
    env, fs,
    hash::{Hash, Hasher},
    io::{BufRead, BufReader, Read, Seek, SeekFrom, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
    sync::{mpsc, Arc, Mutex, OnceLock},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Emitter;

static CANCEL_UPSCALE: AtomicBool = AtomicBool::new(false);
static CLOUDFLARE_TUNNEL: OnceLock<Mutex<Option<Child>>> = OnceLock::new();

#[derive(Serialize)]
struct ToolStatus {
    ffmpeg: Option<String>,
    ffprobe: Option<String>,
    realesrgan: Option<String>,
    rife: Option<String>,
    cloudflared: Option<String>,
    docker: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PingvinSettings {
    #[serde(default = "default_pingvin_local_url")]
    local_url: String,
    #[serde(default)]
    public_url: String,
    #[serde(default)]
    cloudflared_path: String,
    #[serde(default)]
    base_url: String,
    #[serde(default)]
    token: String,
    #[serde(default)]
    expiration: String,
    #[serde(default)]
    password: String,
    #[serde(default)]
    visitor_limit: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    #[serde(default)]
    default_download_folder: String,
    segmind_api_key: String,
    segmind_target_fps: String,
    segmind_target_resolution: String,
    segmind_input_mode: String,
    segmind_video_url: String,
    pingvin: PingvinSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_download_folder: workspace_root()
                .join("output")
                .to_string_lossy()
                .to_string(),
            segmind_api_key: String::new(),
            segmind_target_fps: "60".to_string(),
            segmind_target_resolution: "1080p".to_string(),
            segmind_input_mode: "local_bridge".to_string(),
            segmind_video_url: String::new(),
            pingvin: PingvinSettings {
                local_url: default_pingvin_local_url(),
                public_url: String::new(),
                cloudflared_path: String::new(),
                base_url: String::new(),
                token: String::new(),
                expiration: String::new(),
                password: String::new(),
                visitor_limit: String::new(),
            },
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TunnelResult {
    public_url: String,
    log: String,
}

struct LocalFileBridge {
    local_url: String,
    route_path: String,
    stop: Arc<AtomicBool>,
    requests: Arc<AtomicU64>,
    handle: Option<thread::JoinHandle<()>>,
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
struct SegmindTopazOptions {
    input_path: String,
    output_folder: String,
    output_name: String,
    settings: AppSettings,
}

#[tauri::command]
fn detect_tools() -> ToolStatus {
    ToolStatus {
        ffmpeg: find_tool("ffmpeg"),
        ffprobe: find_tool("ffprobe"),
        realesrgan: find_tool("realesrgan-ncnn-vulkan"),
        rife: find_tool("rife-ncnn-vulkan"),
        cloudflared: find_tool("cloudflared"),
        docker: find_tool("docker"),
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
            "cloudflared",
            "Cloudflared",
            root.join("cloudflared"),
            "~40-80 MB installed",
        ),
        (
            "pingvin",
            "Pingvin",
            root.join("pingvin"),
            "Docker image + data, often 500 MB+",
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
async fn update_cloudflared(app: tauri::AppHandle) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || update_cloudflared_blocking(app))
        .await
        .map_err(|err| format!("Cloudflared update task failed: {err}"))?
}

fn update_cloudflared_blocking(app: tauri::AppHandle) -> Result<JobResult, String> {
    let root = workspace_root();
    let tools_dir = root.join("tools");
    let temp_dir = root.join("temp").join("tool_downloads");
    fs::create_dir_all(&tools_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(&temp_dir).map_err(|err| err.to_string())?;

    emit_progress(
        &app,
        "Update Cloudflared",
        "Checking cloudflare/cloudflared releases...".to_string(),
    );
    let asset = latest_github_asset_ext(
        "cloudflare/cloudflared",
        &["cloudflared-windows-amd64"],
        ".exe",
    )?;
    let download_path = temp_dir.join(&asset.name);
    emit_progress(
        &app,
        "Update Cloudflared",
        format!("Downloading {}...", asset.name),
    );
    download_with_progress(&app, "Update Cloudflared", &asset.url, &download_path)?;

    let staged_dir = root
        .join("temp")
        .join(format!("tool_stage_cloudflared_{}", timestamp_id()));
    if staged_dir.exists() {
        fs::remove_dir_all(&staged_dir).map_err(|err| err.to_string())?;
    }
    fs::create_dir_all(&staged_dir).map_err(|err| err.to_string())?;
    let staged_exe = staged_dir.join("cloudflared.exe");
    fs::copy(&download_path, &staged_exe).map_err(|err| err.to_string())?;

    let probe = Command::new(&staged_exe)
        .arg("--version")
        .output()
        .map_err(|err| format!("Failed to validate cloudflared: {err}"))?;
    if !probe.status.success() {
        return Err("Downloaded cloudflared executable failed validation.".into());
    }

    let managed_dir = tools_dir.join("cloudflared");
    let backup_dir = root
        .join("temp")
        .join(format!("tool_backup_cloudflared_{}", timestamp_id()));
    if managed_dir.exists() {
        fs::rename(&managed_dir, &backup_dir).map_err(|err| err.to_string())?;
    }
    match fs::rename(&staged_dir, &managed_dir) {
        Ok(()) => {
            if backup_dir.exists() {
                fs::remove_dir_all(&backup_dir).ok();
            }
            emit_progress(
                &app,
                "Update Cloudflared",
                "Installed cloudflared.".to_string(),
            );
            Ok(JobResult {
                output_path: managed_dir
                    .join("cloudflared.exe")
                    .to_string_lossy()
                    .to_string(),
                log: format!("Installed {} from cloudflare/cloudflared.", asset.name),
            })
        }
        Err(error) => {
            if backup_dir.exists() && !managed_dir.exists() {
                let _ = fs::rename(&backup_dir, &managed_dir);
            }
            Err(format!("Failed to activate cloudflared: {error}"))
        }
    }
}

#[tauri::command]
async fn start_cloudflare_tunnel(
    app: tauri::AppHandle,
    local_url: String,
    cloudflared_path: String,
) -> Result<TunnelResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        start_cloudflare_tunnel_blocking(app, local_url, cloudflared_path)
    })
    .await
    .map_err(|err| format!("Cloudflare tunnel task failed: {err}"))?
}

fn start_cloudflare_tunnel_blocking(
    app: tauri::AppHandle,
    local_url: String,
    cloudflared_path: String,
) -> Result<TunnelResult, String> {
    stop_cloudflare_tunnel_blocking(&app)?;
    let executable = if cloudflared_path.trim().is_empty() {
        find_tool("cloudflared").ok_or(
            "cloudflared was not found. Install it from Cloud settings or choose cloudflared.exe.",
        )?
    } else {
        cloudflared_path.trim().to_string()
    };
    let local_url = default_if_empty(&local_url, "http://localhost:3000").to_string();

    emit_progress(
        &app,
        "Cloudflare Tunnel",
        format!("Starting tunnel for {local_url}"),
    );
    let mut child = Command::new(&executable)
        .args(["tunnel", "--url"])
        .arg(&local_url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("Failed to start cloudflared at {executable}: {err}"))?;

    let (sender, receiver) = mpsc::channel::<String>();
    if let Some(stdout) = child.stdout.take() {
        stream_lines(stdout, sender.clone());
    }
    if let Some(stderr) = child.stderr.take() {
        stream_lines(stderr, sender.clone());
    }
    drop(sender);

    let started_at = SystemTime::now();
    let mut full_log = String::new();
    loop {
        while let Ok(line) = receiver.try_recv() {
            if !line.trim().is_empty() {
                full_log.push_str(&line);
                full_log.push('\n');
                emit_progress(&app, "Cloudflare Tunnel", line.clone());
                if let Some(public_url) = extract_trycloudflare_url(&line) {
                    *cloudflare_tunnel_slot()
                        .lock()
                        .map_err(|_| "Cloudflare tunnel lock is poisoned.".to_string())? =
                        Some(child);
                    emit_progress(
                        &app,
                        "Cloudflare Tunnel",
                        format!("Public URL: {public_url}"),
                    );
                    return Ok(TunnelResult {
                        public_url,
                        log: full_log,
                    });
                }
            }
        }

        if let Some(status) = child
            .try_wait()
            .map_err(|err| format!("cloudflared failed while running: {err}"))?
        {
            return Err(format!(
                "cloudflared exited before a tunnel URL was detected: {status}. {full_log}"
            ));
        }

        if started_at
            .elapsed()
            .unwrap_or_else(|_| Duration::from_secs(0))
            > Duration::from_secs(45)
        {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "Timed out waiting for a trycloudflare.com URL. {full_log}"
            ));
        }

        thread::sleep(Duration::from_millis(120));
    }
}

#[tauri::command]
fn stop_cloudflare_tunnel(app: tauri::AppHandle) -> Result<(), String> {
    stop_cloudflare_tunnel_blocking(&app)
}

fn stop_cloudflare_tunnel_blocking(app: &tauri::AppHandle) -> Result<(), String> {
    let mut slot = cloudflare_tunnel_slot()
        .lock()
        .map_err(|_| "Cloudflare tunnel lock is poisoned.".to_string())?;
    if let Some(mut child) = slot.take() {
        let _ = child.kill();
        let _ = child.wait();
        emit_progress(app, "Cloudflare Tunnel", "Stopped".to_string());
    }
    Ok(())
}

#[tauri::command]
async fn install_pingvin(app: tauri::AppHandle) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || install_pingvin_blocking(app))
        .await
        .map_err(|err| format!("Pingvin install task failed: {err}"))?
}

fn install_pingvin_blocking(app: tauri::AppHandle) -> Result<JobResult, String> {
    let docker =
        find_tool("docker").ok_or("Docker was not found. Install Docker Desktop first.")?;
    let pingvin_dir = pingvin_dir();
    fs::create_dir_all(pingvin_dir.join("data")).map_err(|err| err.to_string())?;
    fs::create_dir_all(pingvin_dir.join("images")).map_err(|err| err.to_string())?;
    fs::write(pingvin_dir.join("docker-compose.yml"), pingvin_compose())
        .map_err(|err| err.to_string())?;

    let mut log = String::new();
    let mut pull = Command::new(&docker);
    pull.args(["compose", "pull"]).current_dir(&pingvin_dir);
    run_stage(&app, "Install Pingvin", &mut pull, None, None, &mut log)?;

    Ok(JobResult {
        output_path: pingvin_dir.to_string_lossy().to_string(),
        log,
    })
}

#[tauri::command]
async fn start_pingvin(app: tauri::AppHandle) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || start_pingvin_blocking(app))
        .await
        .map_err(|err| format!("Pingvin start task failed: {err}"))?
}

fn start_pingvin_blocking(app: tauri::AppHandle) -> Result<JobResult, String> {
    let docker =
        find_tool("docker").ok_or("Docker was not found. Install Docker Desktop first.")?;
    ensure_pingvin_compose()?;
    let mut log = String::new();
    let mut command = Command::new(&docker);
    command
        .args(["compose", "up", "-d"])
        .current_dir(pingvin_dir());
    run_stage(&app, "Start Pingvin", &mut command, None, None, &mut log)?;
    Ok(JobResult {
        output_path: "http://localhost:3000".to_string(),
        log,
    })
}

#[tauri::command]
async fn stop_pingvin(app: tauri::AppHandle) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || stop_pingvin_blocking(app))
        .await
        .map_err(|err| format!("Pingvin stop task failed: {err}"))?
}

fn stop_pingvin_blocking(app: tauri::AppHandle) -> Result<JobResult, String> {
    let docker =
        find_tool("docker").ok_or("Docker was not found. Install Docker Desktop first.")?;
    ensure_pingvin_compose()?;
    let mut log = String::new();
    let mut command = Command::new(&docker);
    command.args(["compose", "down"]).current_dir(pingvin_dir());
    run_stage(&app, "Stop Pingvin", &mut command, None, None, &mut log)?;
    Ok(JobResult {
        output_path: pingvin_dir().to_string_lossy().to_string(),
        log,
    })
}

#[tauri::command]
fn pingvin_status() -> Result<JobResult, String> {
    let docker =
        find_tool("docker").ok_or("Docker was not found. Install Docker Desktop first.")?;
    ensure_pingvin_compose()?;
    let output = Command::new(&docker)
        .args(["compose", "ps"])
        .current_dir(pingvin_dir())
        .output()
        .map_err(|err| format!("Failed to check Pingvin status: {err}"))?;
    let log = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    if !output.status.success() {
        return Err(log);
    }
    Ok(JobResult {
        output_path: "http://localhost:3000".to_string(),
        log,
    })
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
async fn upload_to_pingvin_share(
    app: tauri::AppHandle,
    input_path: String,
    settings: PingvinSettings,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        upload_to_pingvin_share_blocking(&app, &PathBuf::from(input_path), &settings)
    })
    .await
    .map_err(|err| format!("Pingvin upload task failed: {err}"))?
}

#[tauri::command]
async fn run_segmind_topaz_job(
    app: tauri::AppHandle,
    options: SegmindTopazOptions,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_segmind_topaz_job_blocking(app, options))
        .await
        .map_err(|err| format!("Segmind task failed: {err}"))?
}

fn run_segmind_topaz_job_blocking(
    app: tauri::AppHandle,
    options: SegmindTopazOptions,
) -> Result<JobResult, String> {
    let api_key = options.settings.segmind_api_key.trim();
    if api_key.is_empty() {
        return Err("Segmind API key is missing.".into());
    }

    let input_path = PathBuf::from(&options.input_path);
    let mut bridge_guard: Option<LocalFileBridge> = None;
    let mut stop_tunnel_after_job = false;
    let video_url = if matches!(
        options.settings.segmind_input_mode.as_str(),
        "local_bridge" | "pingvin"
    ) {
        let bridge = start_local_file_bridge(&app, &input_path)?;
        let tunnel = start_cloudflare_tunnel_blocking(
            app.clone(),
            bridge.local_url.clone(),
            options.settings.pingvin.cloudflared_path.clone(),
        )?;
        let public_url = format!(
            "{}{}",
            tunnel.public_url.trim_end_matches('/'),
            bridge.route_path
        );
        emit_progress(
            &app,
            "Local Bridge",
            format!("Public video URL ready: {public_url}"),
        );
        if let Err(error) = verify_public_bridge_url(&app, &public_url) {
            let _ = stop_cloudflare_tunnel_blocking(&app);
            stop_local_file_bridge(bridge);
            return Err(error);
        }
        bridge_guard = Some(bridge);
        stop_tunnel_after_job = true;
        public_url
    } else {
        let url = options.settings.segmind_video_url.trim().to_string();
        if url.is_empty() {
            return Err("Segmind video URL is missing.".into());
        }
        url
    };

    let target_fps = options
        .settings
        .segmind_target_fps
        .trim()
        .parse::<u32>()
        .unwrap_or(60);
    let target_resolution = default_if_empty(&options.settings.segmind_target_resolution, "1080p");
    let body = json!({
        "video": video_url,
        "target_fps": target_fps,
        "target_resolution": target_resolution,
    });

    let result = (|| {
        emit_progress(&app, "Segmind Topaz", "Sending request...".to_string());
        let mut response = ureq::post("https://api.segmind.com/v1/topaz-video-upscale")
            .header("User-Agent", "videomaxxxing-local-tool")
            .header("Content-Type", "application/json")
            .header("x-api-key", api_key)
            .send_json(body)
            .map_err(|err| format!("Segmind request failed: {err}"))?;
        let status = response.status().as_u16();
        let text = response
            .body_mut()
            .read_to_string()
            .map_err(|err| format!("Failed to read Segmind response: {err}"))?;
        if !(200..300).contains(&status) {
            return Err(format!("Segmind failed with HTTP {status}: {text}"));
        }

        let output_url = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|value| find_first_url(&value))
            .unwrap_or_default();
        let local_hint = if output_url.is_empty() {
            PathBuf::from(&options.output_folder)
                .join(default_if_empty(&options.output_name, "segmind_result.mp4"))
                .to_string_lossy()
                .to_string()
        } else {
            output_url
        };
        emit_progress(&app, "Segmind Topaz", "Response received.".to_string());
        Ok(JobResult {
            output_path: local_hint,
            log: pretty_json_or_raw(&text),
        })
    })();

    if let Some(bridge) = bridge_guard {
        let request_count = bridge.requests.load(Ordering::SeqCst);
        if request_count == 0 {
            emit_progress(
                &app,
                "Local Bridge",
                "No valid bridge requests were received during the Segmind call.".to_string(),
            );
        }
        schedule_local_bridge_cleanup(app.clone(), bridge, stop_tunnel_after_job, 600);
    } else if stop_tunnel_after_job {
        let _ = stop_cloudflare_tunnel_blocking(&app);
    }

    result
}

fn verify_public_bridge_url(app: &tauri::AppHandle, public_url: &str) -> Result<(), String> {
    emit_progress(
        app,
        "Local Bridge",
        "Verifying public bridge URL...".to_string(),
    );
    let started_at = SystemTime::now();
    let mut attempt = 0_u32;
    let mut last_error: Option<String>;
    loop {
        attempt += 1;
        match ureq::get(public_url)
            .header("User-Agent", "videomaxxxing-local-tool")
            .header("Range", "bytes=0-0")
            .call()
        {
            Ok(mut response) => {
                let status = response.status().as_u16();
                if matches!(status, 200 | 206) {
                    emit_progress(
                        app,
                        "Local Bridge",
                        format!("Public bridge verified with HTTP {status}."),
                    );
                    return Ok(());
                }
                let text = response.body_mut().read_to_string().unwrap_or_default();
                last_error = Some(format!("HTTP {status}: {text}"));
                if !matches!(status, 502 | 503 | 530) {
                    return Err(format!(
                        "Public bridge check failed with {}",
                        last_error.as_deref().unwrap_or("unknown error")
                    ));
                }
            }
            Err(error) => {
                last_error = Some(error.to_string());
            }
        }

        let elapsed = started_at
            .elapsed()
            .unwrap_or_else(|_| Duration::from_secs(0));
        if elapsed > Duration::from_secs(90) {
            return Err(format!(
                "Public bridge check timed out after {attempt} attempts. Last error: {last_error}",
                last_error = last_error.as_deref().unwrap_or("unknown error")
            ));
        }

        if attempt == 1 || attempt % 5 == 0 {
            emit_progress(
                app,
                "Local Bridge",
                format!(
                    "Waiting for Cloudflare quick tunnel DNS/routing ({attempt} attempts). Last error: {last_error}",
                    last_error = last_error.as_deref().unwrap_or("unknown error")
                ),
            );
        }
        thread::sleep(Duration::from_secs(2));
    }
}

fn schedule_local_bridge_cleanup(
    app: tauri::AppHandle,
    bridge: LocalFileBridge,
    stop_tunnel: bool,
    after_seconds: u64,
) {
    emit_progress(
        &app,
        "Local Bridge",
        format!("Keeping bridge URL alive for {after_seconds}s for remote fetch/debug."),
    );
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(after_seconds));
        stop_local_file_bridge(bridge);
        if stop_tunnel {
            let _ = stop_cloudflare_tunnel_blocking(&app);
        }
    });
}

fn start_local_file_bridge(
    app: &tauri::AppHandle,
    input_path: &Path,
) -> Result<LocalFileBridge, String> {
    if !input_path.exists() {
        return Err("Input video does not exist.".into());
    }
    let listener =
        TcpListener::bind("127.0.0.1:0").map_err(|err| format!("Bridge bind failed: {err}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|err| format!("Bridge nonblocking setup failed: {err}"))?;
    let port = listener
        .local_addr()
        .map_err(|err| format!("Bridge address lookup failed: {err}"))?
        .port();
    let local_url = format!("http://127.0.0.1:{port}");
    let token = format!("{}{}", timestamp_id(), short_path_hash(input_path));
    let extension = input_path
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("mp4");
    let route_path = format!("/files/{token}/input.{extension}");
    let file_path = input_path.to_path_buf();
    let stop = Arc::new(AtomicBool::new(false));
    let requests = Arc::new(AtomicU64::new(0));
    let stop_thread = stop.clone();
    let requests_thread = requests.clone();
    let route_path_thread = route_path.clone();
    let app_thread = app.clone();
    let handle = thread::spawn(move || {
        while !stop_thread.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let file_path = file_path.clone();
                    let route_path = route_path_thread.clone();
                    let requests = requests_thread.clone();
                    let app = app_thread.clone();
                    thread::spawn(move || {
                        if let Err(error) =
                            handle_bridge_client(stream, &file_path, &route_path, &requests, &app)
                        {
                            emit_progress(&app, "Local Bridge", error);
                        }
                    });
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(80));
                }
                Err(error) => {
                    emit_progress(
                        &app_thread,
                        "Local Bridge",
                        format!("Bridge failed: {error}"),
                    );
                    break;
                }
            }
        }
    });

    emit_progress(
        app,
        "Local Bridge",
        format!("Serving selected video at {local_url}{route_path}"),
    );
    Ok(LocalFileBridge {
        local_url,
        route_path,
        stop,
        requests,
        handle: Some(handle),
    })
}

fn stop_local_file_bridge(mut bridge: LocalFileBridge) {
    bridge.stop.store(true, Ordering::SeqCst);
    if let Some(handle) = bridge.handle.take() {
        let _ = handle.join();
    }
}

fn handle_bridge_client(
    mut stream: TcpStream,
    input_path: &Path,
    route_path: &str,
    requests: &AtomicU64,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(8)))
        .map_err(|err| format!("Bridge timeout setup failed: {err}"))?;
    let mut buffer = [0_u8; 8192];
    let count = stream
        .read(&mut buffer)
        .map_err(|err| format!("Bridge request read failed: {err}"))?;
    let request = String::from_utf8_lossy(&buffer[..count]);
    let mut lines = request.lines();
    let first_line = lines.next().unwrap_or_default();
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let path = parts.next().unwrap_or_default();
    if !matches!(method, "GET" | "HEAD") {
        return write_bridge_response(
            &mut stream,
            "405 Method Not Allowed",
            &[("Allow", "GET, HEAD".to_string())],
            None,
            method,
        );
    }
    if path != route_path {
        return write_bridge_response(&mut stream, "404 Not Found", &[], None, method);
    }
    requests.fetch_add(1, Ordering::SeqCst);

    let mut range_header: Option<String> = None;
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            if name.trim().eq_ignore_ascii_case("range") {
                range_header = Some(value.trim().to_string());
                break;
            }
        }
    }

    let metadata = fs::metadata(input_path).map_err(|err| {
        format!(
            "Bridge metadata read failed for {}: {err}",
            input_path.display()
        )
    })?;
    let file_size = metadata.len();
    if file_size == 0 {
        return write_bridge_response(&mut stream, "416 Range Not Satisfiable", &[], None, method);
    }
    let content_type = content_type_for_path(input_path).to_string();
    let (status, start, end) = match range_header
        .as_deref()
        .and_then(|value| parse_range(value, file_size))
    {
        Some((start, end)) => ("206 Partial Content", start, end),
        None => ("200 OK", 0, file_size - 1),
    };
    let content_length = end - start + 1;
    let mut headers = vec![
        ("Content-Type", content_type),
        ("Accept-Ranges", "bytes".to_string()),
        ("Cache-Control", "no-store".to_string()),
        ("Content-Length", content_length.to_string()),
    ];
    if status.starts_with("206") {
        headers.push(("Content-Range", format!("bytes {start}-{end}/{file_size}")));
    }
    emit_progress(
        app,
        "Local Bridge",
        format!("Segmind requested bytes {start}-{end} of {file_size}"),
    );
    write_bridge_response(
        &mut stream,
        status,
        &headers,
        Some((input_path, start, content_length)),
        method,
    )
}

fn write_bridge_response(
    stream: &mut TcpStream,
    status: &str,
    headers: &[(&str, String)],
    body: Option<(&Path, u64, u64)>,
    method: &str,
) -> Result<(), String> {
    let mut response = format!("HTTP/1.1 {status}\r\nConnection: close\r\n");
    for (name, value) in headers {
        response.push_str(name);
        response.push_str(": ");
        response.push_str(value);
        response.push_str("\r\n");
    }
    response.push_str("\r\n");
    stream
        .write_all(response.as_bytes())
        .map_err(|err| format!("Bridge response write failed: {err}"))?;
    if method == "HEAD" {
        return Ok(());
    }
    if let Some((path, start, length)) = body {
        let mut file = fs::File::open(path)
            .map_err(|err| format!("Bridge file open failed for {}: {err}", path.display()))?;
        file.seek(SeekFrom::Start(start))
            .map_err(|err| format!("Bridge file seek failed: {err}"))?;
        let mut limited = file.take(length);
        std::io::copy(&mut limited, stream)
            .map_err(|err| format!("Bridge file stream failed: {err}"))?;
    }
    Ok(())
}

fn parse_range(value: &str, file_size: u64) -> Option<(u64, u64)> {
    let range = value.trim().strip_prefix("bytes=")?;
    let (start_raw, end_raw) = range.split_once('-')?;
    if start_raw.trim().is_empty() {
        let suffix = end_raw.trim().parse::<u64>().ok()?;
        if suffix == 0 {
            return None;
        }
        let start = file_size.saturating_sub(suffix);
        return Some((start, file_size - 1));
    }
    let start = start_raw.trim().parse::<u64>().ok()?;
    if start >= file_size {
        return None;
    }
    let end = if end_raw.trim().is_empty() {
        file_size - 1
    } else {
        end_raw.trim().parse::<u64>().ok()?.min(file_size - 1)
    };
    (start <= end).then_some((start, end))
}

fn content_type_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        _ => "video/mp4",
    }
}

fn upload_to_pingvin_share_blocking(
    app: &tauri::AppHandle,
    input_path: &Path,
    settings: &PingvinSettings,
) -> Result<String, String> {
    if !input_path.exists() {
        return Err("Input video does not exist.".into());
    }
    let local_base = default_if_empty(&settings.local_url, "http://localhost:3000")
        .trim()
        .trim_end_matches('/')
        .to_string();
    let public_base = settings.public_url.trim().trim_end_matches('/').to_string();
    if local_base.is_empty() {
        return Err("Pingvin local URL is missing.".into());
    }
    if public_base.is_empty() {
        return Err("Pingvin public URL is missing. Start the Cloudflare tunnel or paste the public tunnel URL.".into());
    }

    emit_progress(app, "Pingvin Upload", "Creating share...".to_string());
    let create_body = json!({
        "expiration": empty_to_null(&settings.expiration),
        "recipients": [],
        "security": {
            "password": empty_to_null(&settings.password),
            "maxViews": settings.visitor_limit.trim().parse::<u64>().ok(),
        }
    });
    let create = pingvin_json_request(
        &format!("{local_base}/api/shares"),
        &settings.token,
        create_body,
    )?;
    let share_id = find_first_string(&create, &["id", "shareId", "share_id"])
        .ok_or_else(|| format!("Pingvin create share response did not include an id: {create}"))?;

    emit_progress(
        app,
        "Pingvin Upload",
        format!("Uploading to share {share_id}..."),
    );
    let file_name = input_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("video.mp4")
        .to_string();
    let form = ureq::unversioned::multipart::Form::new()
        .text("shareId", &share_id)
        .text("id", &share_id)
        .file("file", input_path)
        .map_err(|err| format!("Failed to prepare Pingvin upload: {err}"))?;
    let mut upload_request = ureq::post(&format!("{local_base}/api/files"))
        .header("User-Agent", "videomaxxxing-local-tool")
        .header("Accept", "application/json");
    if !settings.token.trim().is_empty() {
        upload_request = upload_request.header(
            "Authorization",
            &format!("Bearer {}", settings.token.trim()),
        );
    }
    let mut upload_response = upload_request
        .send(form)
        .map_err(|err| format!("Pingvin file upload failed: {err}"))?;
    let upload_status = upload_response.status().as_u16();
    let upload_text = upload_response
        .body_mut()
        .read_to_string()
        .unwrap_or_default();
    if !(200..300).contains(&upload_status) {
        return Err(format!(
            "Pingvin upload failed with HTTP {upload_status}: {upload_text}"
        ));
    }

    emit_progress(app, "Pingvin Upload", "Completing share...".to_string());
    let complete = pingvin_json_request(
        &format!("{local_base}/api/shares/{share_id}/complete"),
        &settings.token,
        json!({}),
    )?;
    let url = find_first_url(&complete)
        .or_else(|| find_first_string(&complete, &["url", "shareUrl", "publicUrl", "link"]))
        .map(|url| replace_url_origin(&url, &public_base))
        .unwrap_or_else(|| format!("{public_base}/s/{share_id}"));
    emit_progress(
        app,
        "Pingvin Upload",
        format!("Uploaded {file_name}: {url}"),
    );
    Ok(url)
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

fn empty_to_null(value: &str) -> Value {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Value::Null
    } else {
        Value::String(trimmed.to_string())
    }
}

fn pingvin_json_request(url: &str, token: &str, body: Value) -> Result<Value, String> {
    let mut request = ureq::post(url)
        .header("User-Agent", "videomaxxxing-local-tool")
        .header("Accept", "application/json")
        .header("Content-Type", "application/json");
    if !token.trim().is_empty() {
        request = request.header("Authorization", &format!("Bearer {}", token.trim()));
    }
    let mut response = request
        .send_json(body)
        .map_err(|err| format!("Pingvin request to {url} failed: {err}"))?;
    let status = response.status().as_u16();
    let text = response.body_mut().read_to_string().unwrap_or_default();
    if !(200..300).contains(&status) {
        return Err(format!(
            "Pingvin request to {url} failed with HTTP {status}: {text}"
        ));
    }
    if text.trim().is_empty() {
        Ok(json!({}))
    } else {
        serde_json::from_str(&text).map_err(|err| {
            format!("Pingvin response from {url} was not valid JSON: {err}. Body: {text}")
        })
    }
}

fn find_first_string(value: &Value, keys: &[&str]) -> Option<String> {
    match value {
        Value::Object(map) => {
            for key in keys {
                if let Some(text) = map.get(*key).and_then(Value::as_str) {
                    if !text.trim().is_empty() {
                        return Some(text.to_string());
                    }
                }
            }
            map.values().find_map(|item| find_first_string(item, keys))
        }
        Value::Array(items) => items.iter().find_map(|item| find_first_string(item, keys)),
        _ => None,
    }
}

fn find_first_url(value: &Value) -> Option<String> {
    match value {
        Value::String(text) if text.starts_with("http://") || text.starts_with("https://") => {
            Some(text.to_string())
        }
        Value::Object(map) => map.values().find_map(find_first_url),
        Value::Array(items) => items.iter().find_map(find_first_url),
        _ => None,
    }
}

fn pretty_json_or_raw(text: &str) -> String {
    serde_json::from_str::<Value>(text)
        .ok()
        .and_then(|value| serde_json::to_string_pretty(&value).ok())
        .unwrap_or_else(|| text.to_string())
}

fn default_pingvin_local_url() -> String {
    "http://localhost:3000".to_string()
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
    if settings.segmind_input_mode == "pingvin" {
        settings.segmind_input_mode = "local_bridge".to_string();
    }
    if settings.pingvin.local_url.trim().is_empty() {
        settings.pingvin.local_url = default_pingvin_local_url();
    }
    if settings.pingvin.public_url.trim().is_empty() && !settings.pingvin.base_url.trim().is_empty()
    {
        settings.pingvin.public_url = settings.pingvin.base_url.clone();
    }
    settings
}

fn cloudflare_tunnel_slot() -> &'static Mutex<Option<Child>> {
    CLOUDFLARE_TUNNEL.get_or_init(|| Mutex::new(None))
}

fn extract_trycloudflare_url(line: &str) -> Option<String> {
    line.split_whitespace()
        .map(|part| {
            part.trim_matches(|character: char| {
                matches!(character, '"' | '\'' | ',' | ';' | ')' | '(')
            })
        })
        .find(|part| part.starts_with("https://") && part.contains(".trycloudflare.com"))
        .map(|part| part.trim_end_matches('/').to_string())
}

fn replace_url_origin(url: &str, public_base: &str) -> String {
    let public_base = public_base.trim_end_matches('/');
    for scheme in ["http://", "https://"] {
        if let Some(rest) = url.strip_prefix(scheme) {
            if let Some((_, path)) = rest.split_once('/') {
                return format!("{public_base}/{path}");
            }
        }
    }
    url.to_string()
}

fn pingvin_dir() -> PathBuf {
    workspace_root().join("tools").join("pingvin")
}

fn ensure_pingvin_compose() -> Result<(), String> {
    let dir = pingvin_dir();
    fs::create_dir_all(dir.join("data")).map_err(|err| err.to_string())?;
    fs::create_dir_all(dir.join("images")).map_err(|err| err.to_string())?;
    let compose_path = dir.join("docker-compose.yml");
    if !compose_path.exists() {
        fs::write(&compose_path, pingvin_compose()).map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn pingvin_compose() -> &'static str {
    r#"services:
  pingvin-share-x:
    image: smp46/pingvin-share-x:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/opt/app/backend/data
      - ./images:/opt/app/frontend/public/img
"#
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
        "cloudflared" => vec![root
            .join("tools")
            .join("cloudflared")
            .join("cloudflared.exe")],
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

fn short_path_hash(path: &Path) -> String {
    let mut hasher = DefaultHasher::new();
    path.to_string_lossy().to_lowercase().hash(&mut hasher);
    format!("{:016x}", hasher.finish())
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
            run_segmind_topaz_job,
            upload_to_pingvin_share,
            cancel_upscale_job,
            update_ffmpeg,
            update_cloudflared,
            start_cloudflare_tunnel,
            stop_cloudflare_tunnel,
            install_pingvin,
            start_pingvin,
            stop_pingvin,
            pingvin_status,
            update_realesrgan,
            update_rife,
            compare_realesrgan_models
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
