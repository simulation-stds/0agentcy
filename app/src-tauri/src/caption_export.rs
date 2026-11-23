use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use serde_json::json;
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::Duration,
};
use tauri::Emitter;
static ACTIVE: AtomicBool = AtomicBool::new(false);
static CANCEL: AtomicBool = AtomicBool::new(false);
static STAGE: Mutex<Option<Stage>> = Mutex::new(None);
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExportOptions {
    source: String,
    path: String,
    width: u32,
    height: u32,
    duration: f64,
    sidecar: Option<Sidecar>,
    #[serde(default)]
    effects: crate::video_effects::VideoEffects,
    #[serde(default)]
    start: f64,
}
#[derive(Deserialize)]
pub(crate) struct Sidecar {
    extension: String,
    text: String,
}
struct Stage {
    id: String,
    temp: tempfile::TempDir,
    options: ExportOptions,
    frames: usize,
    duration: f64,
    manifest: String,
    palette_cache: PathBuf,
}
struct ActiveGuard;
impl Drop for ActiveGuard {
    fn drop(&mut self) {
        ACTIVE.store(false, Ordering::SeqCst);
    }
}
fn validate(options: &ExportOptions) -> Result<(), String> {
    options.effects.validate()?;
    if !options.start.is_finite() || options.start < 0.0 {
        return Err("Invalid video start time".into());
    }
    if options.width == 0
        || options.height == 0
        || options.width > 8192
        || options.height > 8192
        || u64::from(options.width) * u64::from(options.height) > 33_554_432
        || !options.duration.is_finite()
        || options.duration <= 0.0
    {
        return Err("Invalid caption export dimensions or duration.".into());
    }
    if !Path::new(&options.source).is_file() {
        return Err("Source video is missing.".into());
    }
    let out = Path::new(&options.path);
    if out
        .extension()
        .and_then(|x| x.to_str())
        .map(str::to_lowercase)
        .as_deref()
        != Some("mp4")
    {
        return Err("Choose an MP4 output file.".into());
    }
    let source = fs::canonicalize(&options.source).map_err(|e| e.to_string())?;
    if out.exists() && fs::canonicalize(out).map_err(|e| e.to_string())? == source {
        return Err("Choose a different filename to preserve the source video.".into());
    }
    if let Some(sidecar) = &options.sidecar {
        if !matches!(sidecar.extension.as_str(), "srt" | "vtt" | "ass")
            || sidecar.text.len() > 20_000_000
        {
            return Err("Invalid subtitle sidecar.".into());
        }
    }
    Ok(())
}
#[tauri::command]
pub(crate) fn begin_caption_export(
    app: tauri::AppHandle,
    options: ExportOptions,
) -> Result<String, String> {
    validate(&options)?;
    let palette_cache = crate::video_effects::palette_cache(&app)?;
    if ACTIVE
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("A caption export is already running.".into());
    }
    let result = (|| {
        CANCEL.store(false, Ordering::SeqCst);
        let parent = Path::new(&options.path)
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let temp = tempfile::Builder::new()
            .prefix(".caption-export-")
            .tempdir_in(parent)
            .map_err(|e| e.to_string())?;
        let id = temp
            .path()
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        *STAGE.lock().map_err(|e| e.to_string())? = Some(Stage {
            id: id.clone(),
            temp,
            options,
            frames: 0,
            duration: 0.0,
            manifest: "ffconcat version 1.0\n".into(),
            palette_cache,
        });
        Ok(id)
    })();
    if result.is_err() {
        ACTIVE.store(false, Ordering::SeqCst);
    }
    result
}
fn png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 24 || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") || &bytes[12..16] != b"IHDR" {
        return None;
    }
    Some((
        u32::from_be_bytes(bytes[16..20].try_into().ok()?),
        u32::from_be_bytes(bytes[20..24].try_into().ok()?),
    ))
}
#[tauri::command]
pub(crate) async fn append_caption_frame(
    id: String,
    png: String,
    duration: f64,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if CANCEL.load(Ordering::SeqCst) {
            return Err("Caption export cancelled.".into());
        }
        if !duration.is_finite() || duration <= 0.0 || png.len() > 48_000_000 {
            return Err("Invalid caption frame.".into());
        }
        let mut lock = STAGE.lock().map_err(|e| e.to_string())?;
        let stage = lock
            .as_mut()
            .filter(|s| s.id == id)
            .ok_or("Caption export session expired")?;
        if stage.frames >= 100_000 || stage.duration + duration > stage.options.duration + 0.01 {
            return Err("Caption timeline exceeds the export range.".into());
        }
        let bytes = STANDARD.decode(png).map_err(|e| e.to_string())?;
        if png_dimensions(&bytes) != Some((stage.options.width, stage.options.height)) {
            return Err("Caption frame dimensions do not match the video.".into());
        }
        let file = format!("frame-{:06}.png", stage.frames);
        fs::write(stage.temp.path().join(&file), bytes).map_err(|e| e.to_string())?;
        stage.manifest +=
            &format!("file '{file}'\noption framerate 1000\nduration {duration:.9}\n");
        stage.frames += 1;
        stage.duration += duration;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) fn cancel_caption_export(id: Option<String>) -> Result<(), String> {
    CANCEL.store(true, Ordering::SeqCst);
    let mut stage = STAGE.lock().map_err(|e| e.to_string())?;
    if stage
        .as_ref()
        .is_some_and(|s| id.as_ref().is_none_or(|id| id == &s.id))
    {
        *stage = None;
        ACTIVE.store(false, Ordering::SeqCst);
    }
    Ok(())
}
fn encode(stage: &Stage, report: impl Fn(f64) + Send + 'static) -> Result<(), String> {
    if CANCEL.load(Ordering::SeqCst) {
        return Err("Caption export cancelled.".into());
    }
    if stage.frames == 0 || (stage.duration - stage.options.duration).abs() > 0.01 {
        return Err("Caption timeline is incomplete.".into());
    }
    let manifest = format!(
        "{}file 'frame-{:06}.png'\noption framerate 1000\n",
        stage.manifest,
        stage.frames - 1
    );
    fs::write(stage.temp.path().join("captions.ffconcat"), manifest).map_err(|e| e.to_string())?;
    let ffmpeg =
        crate::find_tool("ffmpeg").ok_or("Install FFmpeg in Settings → Must haves first.")?;
    let mut command = Command::new(ffmpeg);
    command
        .current_dir(stage.temp.path())
        .args([
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-filter_complex_threads",
            "1",
            "-ss",
        ])
        .arg(stage.options.start.to_string())
        .arg("-i")
        .arg(fs::canonicalize(&stage.options.source).map_err(|e| e.to_string())?)
        .args(["-f", "concat", "-safe", "0", "-i", "captions.ffconcat"]);
    let effects = &stage.options.effects;
    if effects.needs_palette() {
        effects.prepare_assets(
            stage.temp.path(),
            stage.options.width,
            stage.options.height,
            Path::new(&stage.options.source),
            &stage.palette_cache,
            &|| CANCEL.load(Ordering::SeqCst),
        )?;
        command.args(["-i", "palette.bmp"]);
        if effects.dither == "blue_noise" {
            command.args(["-i", "blue-noise.bmp"]);
        }
    }
    if CANCEL.load(Ordering::SeqCst) {
        return Err("Video export cancelled".into());
    }
    let graph = if effects.enabled && effects.affect_subtitles {
        format!("[0:v:0][1:v:0]overlay=0:0:eof_action=repeat:format=auto[composed];{};[effected]pad=ceil(iw/2)*2:ceil(ih/2)*2[v]", effects.graph("composed", "effected", "2:v", stage.options.width, stage.options.height))
    } else {
        format!("{};[effected][1:v:0]overlay=0:0:eof_action=repeat:format=auto,pad=ceil(iw/2)*2:ceil(ih/2)*2[v]", effects.graph("0:v:0", "effected", "2:v", stage.options.width, stage.options.height))
    };
    command
        .args([
            "-filter_complex",
            &graph,
            "-map",
            "[v]",
            "-map",
            "0:a?",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            "-t",
        ])
        .arg(stage.options.duration.to_string())
        .args(["-progress", "pipe:1", "-nostats", "output.mp4"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start video export: {e}"))?;
    let out = child.stdout.take().ok_or("Missing encoder output")?;
    let err = child.stderr.take().ok_or("Missing encoder diagnostics")?;
    let duration = stage.options.duration;
    let progress = thread::spawn(move || {
        for line in BufReader::new(out).lines().map_while(Result::ok) {
            if let Some(value) = line
                .strip_prefix("out_time_us=")
                .and_then(|v| v.parse::<f64>().ok())
            {
                report((value / 1_000_000.0 / duration).clamp(0.0, 1.0));
            }
        }
    });
    let errors = thread::spawn(move || {
        let mut tail = String::new();
        for line in BufReader::new(err).lines().map_while(Result::ok) {
            tail.push_str(&line);
            tail.push('\n');
            if tail.len() > 12000 {
                let index = tail
                    .char_indices()
                    .find(|(i, _)| *i >= tail.len() - 8000)
                    .map(|(i, _)| i)
                    .unwrap_or(0);
                tail.drain(..index);
            }
        }
        tail
    });
    let status = loop {
        if CANCEL.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            break Err("Caption export cancelled.".into());
        }
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => thread::sleep(Duration::from_millis(100)),
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(e.to_string());
            }
        }
    };
    let _ = progress.join();
    let error = errors.join().unwrap_or_default();
    let status = status?;
    if !status.success() {
        return Err(format!("Video export failed: {error}"));
    }
    if CANCEL.load(Ordering::SeqCst) {
        return Err("Caption export cancelled.".into());
    }
    // Publish only a complete encode. The source remains untouched on failure/cancel.
    let output = stage.temp.path().join("output.mp4");
    let sidecar = if let Some(sidecar) = &stage.options.sidecar {
        let path = PathBuf::from(&stage.options.path).with_extension(&sidecar.extension);
        let mut file = tempfile::NamedTempFile::new_in(path.parent().unwrap_or(Path::new(".")))
            .map_err(|e| e.to_string())?;
        file.write_all(sidecar.text.as_bytes())
            .map_err(|e| e.to_string())?;
        Some((file, path))
    } else {
        None
    };
    fs::rename(output, &stage.options.path).map_err(|e| e.to_string())?;
    if let Some((file, path)) = sidecar {
        file.persist(path)
            .map_err(|e| format!("Video saved, but the subtitle file could not be saved: {e}"))?;
    }
    Ok(())
}
#[tauri::command]
pub(crate) async fn finish_caption_export(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let stage = {
        let mut lock = STAGE.lock().map_err(|e| e.to_string())?;
        if lock.as_ref().is_none_or(|s| s.id != id) {
            return Err("Caption export session expired".into());
        }
        lock.take().unwrap()
    };
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = ActiveGuard;
        if stage.options.effects.needs_palette() && stage.options.effects.palette == "custom" {
            let _ = app.emit(
                "caption-export-progress",
                json!({"progress":0.0,"message":"Analyzing source colors"}),
            );
        }
        encode(&stage, move |progress| {
            let _ = app.emit(
                "caption-export-progress",
                json!({"progress":progress,"message":"Encoding captioned video"}),
            );
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_bad_png_headers() {
        assert_eq!(png_dimensions(b"not a png"), None);
        let mut bytes = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        bytes.extend_from_slice(&1920u32.to_be_bytes());
        bytes.extend_from_slice(&1080u32.to_be_bytes());
        assert_eq!(png_dimensions(&bytes), Some((1920, 1080)));
    }
    #[test]
    fn does_not_overwrite_source() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("source.mp4");
        fs::write(&path, b"source").unwrap();
        let options = ExportOptions {
            source: path.to_string_lossy().into(),
            path: path.to_string_lossy().into(),
            width: 1080,
            height: 1920,
            duration: 10.0,
            sidecar: None,
            effects: Default::default(),
            start: 0.0,
        };
        assert!(validate(&options).unwrap_err().contains("preserve"));
    }
    #[test]
    fn encodes_timed_overlays_and_audio_and_preserves_outputs_on_failure() {
        let Some(ffmpeg) = crate::find_tool("ffmpeg") else {
            return;
        };
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("source.mp4");
        assert!(Command::new(&ffmpeg)
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=blue:s=320x180:r=30:d=3",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=3",
                "-c:v",
                "libx264",
                "-c:a",
                "aac",
                "-shortest",
                "-y"
            ])
            .arg(&source)
            .status()
            .unwrap()
            .success());
        let temp = tempfile::tempdir_in(directory.path()).unwrap();
        for (name, color) in [
            ("frame-000000.png", "red@0.5"),
            ("frame-000001.png", "lime@0.5"),
            ("frame-000002.png", "black@0.0"),
        ] {
            assert!(Command::new(&ffmpeg)
                .args([
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    &format!("color=c={color}:s=320x180,format=rgba"),
                    "-frames:v",
                    "1",
                    "-y"
                ])
                .arg(temp.path().join(name))
                .status()
                .unwrap()
                .success());
        }
        let output = directory.path().join("captioned.mp4");
        let mut stage=Stage{palette_cache:directory.path().join("palette-cache"),id:"test".into(),temp,options:ExportOptions{source:source.to_string_lossy().into(),path:output.to_string_lossy().into(),width:320,height:180,duration:3.0,effects:Default::default(),start:0.0,sidecar:Some(Sidecar{extension:"srt".into(),text:"test subtitles".into()})},frames:3,duration:3.0,manifest:"ffconcat version 1.0\nfile 'frame-000000.png'\noption framerate 1000\nduration 1.0\nfile 'frame-000001.png'\noption framerate 1000\nduration 1.0\nfile 'frame-000002.png'\noption framerate 1000\nduration 1.0\n".into()};
        CANCEL.store(false, Ordering::SeqCst);
        encode(&stage, |_| {}).unwrap();
        assert!(output.is_file());
        assert_eq!(
            fs::read_to_string(output.with_extension("srt")).unwrap(),
            "test subtitles"
        );
        for (time, channel) in [("0.5", 0), ("1.5", 1), ("2.5", 2)] {
            let result = Command::new(&ffmpeg)
                .args(["-v", "error", "-ss", time, "-i"])
                .arg(&output)
                .args([
                    "-vf",
                    "scale=1:1",
                    "-frames:v",
                    "1",
                    "-f",
                    "rawvideo",
                    "-pix_fmt",
                    "rgb24",
                    "pipe:1",
                ])
                .output()
                .unwrap();
            assert!(result.status.success());
            assert_eq!(result.stdout.len(), 3);
            assert!(
                result.stdout[channel] > 100 && result.stdout[2] > 100,
                "unexpected pixel: {:?}",
                result.stdout
            );
        }
        let audio = Command::new(&ffmpeg)
            .args(["-v", "error", "-i"])
            .arg(&output)
            .args(["-map", "0:a:0", "-f", "null", "-"])
            .output()
            .unwrap();
        assert!(audio.status.success());
        // Effects precede captions unless explicitly applied to the composition.
        stage.options.effects = crate::video_effects::VideoEffects {
            enabled: true,
            dither: "bayer".into(),
            palette: "mono".into(),
            ..Default::default()
        };
        for affect in [false, true] {
            stage.options.effects.affect_subtitles = affect;
            encode(&stage, |_| {}).unwrap();
            let result = Command::new(&ffmpeg)
                .args(["-v", "error", "-ss", "0.5", "-i"])
                .arg(&output)
                .args([
                    "-vf",
                    "scale=1:1",
                    "-frames:v",
                    "1",
                    "-f",
                    "rawvideo",
                    "-pix_fmt",
                    "rgb24",
                    "pipe:1",
                ])
                .output()
                .unwrap();
            assert!(result.status.success());
            let rgb = &result.stdout;
            if affect {
                assert!((i32::from(rgb[0]) - i32::from(rgb[1])).abs() < 5);
            } else {
                assert!(
                    i32::from(rgb[0]) - i32::from(rgb[1]) > 50,
                    "captions were unexpectedly dithered: {rgb:?}"
                );
            }
        }
        stage.options.effects.dither = "blue_noise".into();
        stage.options.effects.palette = "custom".into();
        stage.options.effects.color_count = 23;
        stage.options.effects.custom_colors =
            vec!["#112233".into(), "#ff8800".into(), "#ffffff".into()];
        encode(&stage, |_| {}).unwrap();
        let prior = fs::read(&output).unwrap();
        CANCEL.store(true, Ordering::SeqCst);
        assert!(encode(&stage, |_| {}).unwrap_err().contains("cancelled"));
        CANCEL.store(false, Ordering::SeqCst);
        assert_eq!(fs::read(&output).unwrap(), prior);
    }
}
