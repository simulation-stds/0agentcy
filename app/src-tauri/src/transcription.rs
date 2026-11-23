use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{Emitter, Manager};

const VERSION: &str = "3.8.6";
const SPEAKER_MODEL: &str = "pyannote/speaker-diarization-community-1";
static LOCK: Mutex<()> = Mutex::new(());
static CANCEL: AtomicBool = AtomicBool::new(false);
const RUNNER: &str = include_str!("whisperx_runner.py");

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Status {
    installed: bool,
    path: String,
    gpu_available: bool,
    speaker_model_ready: bool,
    token_configured: bool,
    token_persistent: bool,
    credential_error: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Options {
    source: String,
    model: String,
    device: String,
    language: String,
    start: f64,
    end: f64,
}

fn private_directory(path: &Path) -> Result<(), String> {
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(path).map_err(|e| e.to_string())
}
fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("transcription"))
}
fn environment(root: &Path, device: &str) -> PathBuf {
    root.join("runtimes")
        .join(format!("whisperx-{VERSION}-{device}"))
}
fn python(root: &Path, device: &str) -> PathBuf {
    environment(root, device).join(if cfg!(windows) {
        "Scripts/python.exe"
    } else {
        "bin/python"
    })
}
fn device_valid(device: &str) -> Result<(), String> {
    if !matches!(device, "cpu" | "cuda") {
        return Err("Choose CPU or NVIDIA GPU.".into());
    }
    Ok(())
}
fn validate(model: &str, device: &str, language: &str) -> Result<(), String> {
    device_valid(device)?;
    if !matches!(
        model,
        "tiny" | "base" | "small" | "medium" | "large-v3" | "turbo"
    ) {
        return Err("Unsupported transcription model.".into());
    }
    if language != "auto"
        && !(language.len() >= 2
            && language.len() <= 3
            && language.bytes().all(|b| b.is_ascii_lowercase()))
    {
        return Err("Choose a language code or Auto.".into());
    }
    Ok(())
}
fn report(app: &tauri::AppHandle, message: &str) {
    let _ = app.emit("transcription-progress", json!({"message":message}));
}
fn gpu_available() -> bool {
    crate::find_tool("nvidia-smi")
        .and_then(|p| Command::new(p).arg("-L").output().ok())
        .map(|o| o.status.success())
        .unwrap_or(false)
}
#[tauri::command]
pub(crate) async fn transcription_status(
    app: tauri::AppHandle,
    device: String,
) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || {
        device_valid(&device)?;
        let root = root(&app)?;
        let credentials = crate::transcription_credentials::read();
        let (token_configured, token_persistent, credential_error) = match credentials {
            Ok((token, persistent)) => (token.is_some(), persistent, None),
            Err(error) => (false, false, Some(error)),
        };
        Ok(Status {
            speaker_model_ready: speakers_ready(&root, &device),
            token_configured,
            token_persistent,
            credential_error,
            installed: python(&root, &device).is_file()
                && environment(&root, &device).join("ready").is_file(),
            path: root.to_string_lossy().into_owned(),
            gpu_available: gpu_available(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// Pipe readers prevent long-running installers from blocking on full output buffers.
fn run(app: &tauri::AppHandle, command: &mut Command) -> Result<(), String> {
    run_private(app, command, None)
}
fn run_private(
    app: &tauri::AppHandle,
    command: &mut Command,
    secret: Option<&str>,
) -> Result<(), String> {
    if CANCEL.load(Ordering::SeqCst) {
        return Err("Transcription cancelled.".into());
    }
    command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(if secret.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        });
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start transcription tool: {e}"))?;
    if let Some(token) = secret {
        let mut input = serde_json::to_vec(&json!({"token": token}))
            .map_err(|_| "Could not prepare authentication.")?;
        let written = child
            .stdin
            .take()
            .ok_or("Missing private worker input")?
            .write_all(&input);
        input.fill(0);
        if written.is_err() {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Could not pass authentication to the worker.".into());
        }
    }
    let out = child.stdout.take().ok_or("Missing worker output")?;
    let err = child.stderr.take().ok_or("Missing worker diagnostics")?;
    let handle = app.clone();
    let output_secret = secret.map(str::to_owned);
    let error_secret = output_secret.clone();
    let reader = thread::spawn(move || {
        for line in BufReader::new(out).lines().map_while(Result::ok) {
            let line = redact_secret(&line, output_secret.as_deref());
            if let Some(payload) = line.strip_prefix("VMX:") {
                if let Ok(value) = serde_json::from_str::<Value>(payload) {
                    let _ = handle.emit("transcription-progress", value);
                }
            }
        }
    });
    let errors = thread::spawn(move || {
        let mut tail = std::collections::VecDeque::new();
        for line in BufReader::new(err).lines().map_while(Result::ok) {
            tail.push_back(redact_secret(&line, error_secret.as_deref()));
            if tail.len() > 24 {
                tail.pop_front();
            }
        }
        tail.into_iter().collect::<Vec<_>>().join("\n")
    });
    let result = loop {
        if CANCEL.load(Ordering::SeqCst) {
            #[cfg(unix)]
            {
                let _ = Command::new("kill")
                    .args(["-KILL", "--"])
                    .arg(format!("-{}", child.id()))
                    .status();
            }
            #[cfg(windows)]
            {
                let _ = Command::new("taskkill")
                    .args(["/F", "/T", "/PID"])
                    .arg(child.id().to_string())
                    .output();
            }
            let _ = child.kill();
            let _ = child.wait();
            break Err("Transcription cancelled.".into());
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                break if status.success() {
                    Ok(())
                } else {
                    Err("Transcription tool failed".into())
                }
            }
            Ok(None) => thread::sleep(Duration::from_millis(100)),
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(e.to_string());
            }
        }
    };
    let _ = reader.join();
    let tail = errors.join().unwrap_or_default();
    result.map_err(|e: String| {
        if CANCEL.load(Ordering::SeqCst) || tail.is_empty() {
            e
        } else {
            format!("{e}: {tail}")
        }
    })
}
fn redact_secret(text: &str, secret: Option<&str>) -> String {
    match secret.filter(|token| !token.is_empty()) {
        Some(token) => text.replace(token, "[redacted]"),
        None => text.to_owned(),
    }
}
fn download(app: &tauri::AppHandle, url: &str, path: &Path) -> Result<(), String> {
    let mut response = ureq::get(url)
        .header("User-Agent", "Videomaxxing")
        .call()
        .map_err(|e| e.to_string())?;
    let mut file = fs::File::create(path).map_err(|e| e.to_string())?;
    let mut buffer = [0u8; 65536];
    let mut reader = response.body_mut().as_reader();
    loop {
        if CANCEL.load(Ordering::SeqCst) {
            return Err("Setup cancelled.".into());
        }
        let n = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
    }
    report(app, "Installer downloaded");
    Ok(())
}
fn installer(app: &tauri::AppHandle, root: &Path) -> Result<PathBuf, String> {
    // A private installer avoids modifying system Python or PATH.
    let directory = root.join("installer");
    let (asset, binary, checksum) = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("linux", "x86_64") => (
            "uv-x86_64-unknown-linux-gnu.tar.gz",
            "uv-x86_64-unknown-linux-gnu/uv",
            "440c4215b171e64061d65d16a23753dd25c29a7f7b1b0446c9e9aed0fa372f27",
        ),
        ("windows", "x86_64") => (
            "uv-x86_64-pc-windows-msvc.zip",
            "uv.exe",
            "bf5a9bb171e90bc612c7acebfb560693d04dba1d1009c297b83da23155218607",
        ),
        _ => {
            return Err(
                "Managed transcription setup currently supports Windows and Linux x86-64.".into(),
            )
        }
    };
    let executable = directory.join(binary);
    if executable.is_file() {
        return Ok(executable);
    }
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    report(app, "Downloading private Python installer");
    let archive = directory.join(asset);
    download(
        app,
        &format!("https://github.com/astral-sh/uv/releases/download/0.9.10/{asset}"),
        &archive,
    )?;
    use sha2::{Digest, Sha256};
    let actual = format!(
        "{:x}",
        Sha256::digest(fs::read(&archive).map_err(|e| e.to_string())?)
    );
    if actual != checksum {
        let _ = fs::remove_file(&archive);
        return Err("Installer download verification failed. Retry setup.".into());
    }
    if cfg!(windows) {
        zip::ZipArchive::new(fs::File::open(&archive).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?
            .extract(&directory)
            .map_err(|e| e.to_string())?;
    } else {
        run(
            app,
            Command::new("tar")
                .arg("-xzf")
                .arg(&archive)
                .arg("-C")
                .arg(&directory),
        )?;
    }
    let _ = fs::remove_file(archive);
    if !executable.is_file() {
        return Err("Installer archive did not contain the expected executable.".into());
    }
    Ok(executable)
}
fn configure(command: &mut Command, root: &Path) -> Result<(), String> {
    for dir in [
        "models",
        "alignment",
        "hf",
        "torch",
        "nltk",
        "python",
        "cache",
        "speaker-models",
    ] {
        private_directory(&root.join(dir))?;
    }
    command
        .env("HF_HOME", root.join("hf"))
        .env("TORCH_HOME", root.join("torch"))
        .env("NLTK_DATA", root.join("nltk"))
        .env("VMX_MODELS", root.join("models"))
        .env("VMX_ALIGN", root.join("alignment"))
        .env("VMX_SPEAKERS", root.join("speaker-models"))
        .env("HF_HUB_DISABLE_IMPLICIT_TOKEN", "1")
        .env_remove("HF_TOKEN")
        .env_remove("HUGGING_FACE_HUB_TOKEN")
        .env("UV_PYTHON_INSTALL_DIR", root.join("python"))
        .env("UV_CACHE_DIR", root.join("cache"))
        .env("PYTHONUNBUFFERED", "1")
        .env("HF_HUB_DISABLE_TELEMETRY", "1")
        .env("PYANNOTE_METRICS_ENABLED", "0")
        .env("DO_NOT_TRACK", "1");
    if let Some(ffmpeg) = crate::find_tool("ffmpeg") {
        if let Some(parent) = Path::new(&ffmpeg).parent() {
            let mut paths = vec![parent.to_path_buf()];
            paths.extend(std::env::split_paths(
                &std::env::var_os("PATH").unwrap_or_default(),
            ));
            command.env(
                "PATH",
                std::env::join_paths(paths).map_err(|e| e.to_string())?,
            );
        }
    }
    Ok(())
}
fn worker(root: &Path, device: &str, mode: &str) -> Result<Command, String> {
    let script = root.join("worker.py");
    fs::write(&script, RUNNER).map_err(|e| e.to_string())?;
    let mut command = Command::new(python(root, device));
    command
        .arg("-u")
        .arg(script)
        .arg(mode)
        .arg("--device")
        .arg(device);
    configure(&mut command, root)?;
    #[cfg(target_os = "linux")]
    {
        let base = environment(root, device).join("lib/python3.12/site-packages/nvidia");
        let mut paths = Vec::new();
        if let Ok(entries) = fs::read_dir(base) {
            for entry in entries.flatten() {
                let path = entry.path().join("lib");
                if path.is_dir() {
                    paths.push(path);
                }
            }
        }
        paths.extend(std::env::split_paths(
            &std::env::var_os("LD_LIBRARY_PATH").unwrap_or_default(),
        ));
        command.env(
            "LD_LIBRARY_PATH",
            std::env::join_paths(paths).map_err(|e| e.to_string())?,
        );
    }
    Ok(command)
}

#[tauri::command]
pub(crate) async fn setup_transcription(
    app: tauri::AppHandle,
    device: String,
    model: String,
    language: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK.try_lock().map_err(|_| "A transcription operation is already running.")?;
        CANCEL.store(false, Ordering::SeqCst);
        validate(&model, &device, &language)?;
        if language == "auto" { return Err("Select an initial alignment language for setup. Auto detection is available when transcribing.".into()); }
        if device == "cuda" && !gpu_available() { return Err("No NVIDIA GPU detected. Choose CPU or update your GPU driver.".into()); }
        let root = root(&app)?;
        private_directory(&root)?;
        let uv = installer(&app, &root)?;
        let env = environment(&root, &device);
        let ready = env.join("ready");
        let _ = fs::remove_file(&ready);
        if !python(&root, &device).is_file() {
            report(&app, "Creating private Python 3.12 environment");
            let mut cmd = Command::new(&uv);
            cmd.args(["venv", "--python", "3.12", "--managed-python"]).arg(&env);
            configure(&mut cmd, &root)?;
            run(&app, &mut cmd)?;
        }
        report(&app, "Installing WhisperX and compatible runtime packages (this can take several minutes)");
        let mut cmd = Command::new(&uv);
        let requirements = match (std::env::consts::OS, device.as_str()) {
            ("linux", "cpu") => include_str!("../whisperx/linux-cpu.txt"),
            ("linux", "cuda") => include_str!("../whisperx/linux-cuda.txt"),
            ("windows", "cpu") => include_str!("../whisperx/windows-cpu.txt"),
            ("windows", "cuda") => include_str!("../whisperx/windows-cuda.txt"),
            _ => return Err("Unsupported transcription platform.".into()),
        };
        let lockfile = root.join(format!("requirements-{device}.txt"));
        fs::write(&lockfile, requirements).map_err(|e| e.to_string())?;
        cmd.args(["pip", "sync", "--reinstall", "--python"]).arg(python(&root, &device))
            .arg(&lockfile).arg("--extra-index-url")
            .arg(if device == "cpu" { "https://download.pytorch.org/whl/cpu" } else { "https://download.pytorch.org/whl/cu128" })
            .arg("--index-strategy").arg("unsafe-best-match");
        configure(&mut cmd, &root)?;
        run(&app, &mut cmd)?;
        report(&app, "Verifying runtime");
        run(&app, &mut worker(&root, &device, "verify")?)?;
        let mut cmd = worker(&root, &device, "prepare")?;
        cmd.arg("--model").arg(&model).arg("--language").arg(language);
        run(&app, &mut cmd)?;
        fs::write(ready, VERSION).map_err(|e| e.to_string())?;
        report(&app, "Transcription ready");
        Ok(())
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) fn cancel_transcription() {
    CANCEL.store(true, Ordering::SeqCst);
}

fn project_path(app: &tauri::AppHandle, source: &str) -> Result<PathBuf, String> {
    use sha2::{Digest, Sha256};
    let hash = format!("{:x}", Sha256::digest(source.as_bytes()));
    Ok(root(app)?.join("projects").join(format!("{hash}.json")))
}
fn validate_project(project: &Value) -> Result<&str, String> {
    let source = project["source"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or("Missing source media")?;
    let range_start = project["rangeStart"]
        .as_f64()
        .ok_or("Missing project range")?;
    let range_end = project["rangeEnd"]
        .as_f64()
        .ok_or("Missing project range")?;
    if project["version"] != 1
        || !project["language"].is_string()
        || !project["model"].is_string()
        || range_start < 0.0
        || range_end <= range_start
    {
        return Err("Unsupported subtitle project.".into());
    }
    let speakers = project["speakers"]
        .as_object()
        .ok_or("Invalid speaker names")?;
    if speakers.values().any(|name| !name.is_string()) {
        return Err("Invalid speaker names".into());
    }
    for key in ["cues", "recognizedSegments"] {
        let cues = project[key].as_array().ok_or("Missing subtitle cues")?;
        let mut ids = std::collections::HashSet::new();
        for cue in cues {
            let id = cue["id"].as_str().ok_or("Missing subtitle identifier")?;
            let start = cue["start"].as_f64().ok_or("Invalid subtitle start")?;
            let end = cue["end"].as_f64().ok_or("Invalid subtitle end")?;
            if !ids.insert(id) || start < 0.0 || end <= start || !cue["text"].is_string() {
                return Err(
                    "Subtitle cues need unique identifiers and an end after their start.".into(),
                );
            }
            if let Some(speaker) = cue.get("speaker") {
                if !speaker.is_string() {
                    return Err("Invalid speaker label".into());
                }
            }
            if let Some(words) = cue.get("words") {
                for word in words.as_array().ok_or("Invalid word timing data")? {
                    if !word["word"].is_string() {
                        return Err("Invalid recognized word".into());
                    }
                    for time in ["start", "end"] {
                        if let Some(value) = word.get(time) {
                            if value.as_f64().is_none() {
                                return Err("Invalid word time".into());
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(source)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Missing output directory")?;
    private_directory(parent)?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    file.write_all(bytes)
        .and_then(|_| file.as_file().sync_all())
        .map_err(|e| e.to_string())?;
    file.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub(crate) fn save_transcript(app: tauri::AppHandle, project: Value) -> Result<(), String> {
    let source = validate_project(&project)?;
    atomic_write(
        &project_path(&app, source)?,
        &serde_json::to_vec_pretty(&project).map_err(|e| e.to_string())?,
    )
}
#[tauri::command]
pub(crate) fn load_transcript(
    app: tauri::AppHandle,
    source: String,
) -> Result<Option<Value>, String> {
    let path = project_path(&app, &source)?;
    if !path.is_file() {
        return Ok(None);
    }
    let value = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    validate_project(&value)?;
    Ok(Some(value))
}
#[tauri::command]
pub(crate) fn import_transcript(path: String) -> Result<Value, String> {
    let value = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    validate_project(&value)?;
    Ok(value)
}
#[tauri::command]
pub(crate) fn export_transcript(path: String, text: String) -> Result<(), String> {
    atomic_write(Path::new(&path), text.as_bytes())
}
#[tauri::command]
pub(crate) async fn remove_transcription(
    app: tauri::AppHandle,
    device: String,
    models: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK
            .try_lock()
            .map_err(|_| "Wait for the transcription operation to finish.")?;
        device_valid(&device)?;
        let root = root(&app)?;
        let env = environment(&root, &device);
        if env.exists() {
            fs::remove_dir_all(env).map_err(|e| e.to_string())?;
        }
        if models {
            for mode in ["cpu", "cuda"] {
                let _ = fs::remove_file(speaker_marker(&root, mode));
            }
            for dir in [
                "models",
                "alignment",
                "hf",
                "torch",
                "nltk",
                "speaker-models",
            ] {
                let path = root.join(dir);
                if path.exists() {
                    fs::remove_dir_all(path).map_err(|e| e.to_string())?;
                }
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn run_transcription(
    app: tauri::AppHandle,
    options: Options,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK
            .try_lock()
            .map_err(|_| "A transcription operation is already running.")?;
        CANCEL.store(false, Ordering::SeqCst);
        validate(&options.model, &options.device, &options.language)?;
        if !options.start.is_finite()
            || !options.end.is_finite()
            || options.start < 0.0
            || options.end <= options.start
        {
            return Err("Choose a non-empty transcription range.".into());
        }
        if !Path::new(&options.source).is_file() {
            return Err("Source media is unavailable.".into());
        }
        let root = root(&app)?;
        if !environment(&root, &options.device).join("ready").is_file() {
            return Err("Set up transcription first.".into());
        }
        let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
        let audio = temp.path().join("audio.wav");
        let output = temp.path().join("transcript.json");
        report(&app, "Preparing selected audio");
        let ffmpeg =
            crate::find_tool("ffmpeg").ok_or("Install FFmpeg in Settings → Must haves first.")?;
        run(
            &app,
            Command::new(ffmpeg)
                .args(["-nostdin", "-v", "error", "-y", "-ss"])
                .arg(options.start.to_string())
                .arg("-i")
                .arg(&options.source)
                .arg("-t")
                .arg((options.end - options.start).to_string())
                .args(["-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"])
                .arg(&audio),
        )?;
        let mut cmd = worker(&root, &options.device, "transcribe")?;
        cmd.arg("--model")
            .arg(options.model)
            .arg("--language")
            .arg(options.language)
            .arg("--input")
            .arg(audio)
            .arg("--output")
            .arg(&output)
            .arg("--source")
            .arg(&options.source)
            .arg("--start")
            .arg(options.start.to_string())
            .arg("--end")
            .arg(options.end.to_string());
        run(&app, &mut cmd)?;
        let project: Value = serde_json::from_slice(&fs::read(output).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        save_transcript(app, project.clone())?;
        Ok(project)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_and_cuda_environments_are_separate() {
        let root = Path::new("user-data");
        assert_ne!(python(root, "cpu"), python(root, "cuda"));
        assert!(python(root, "cpu").starts_with(root));
    }

    #[test]
    fn rejects_unrecognized_install_options() {
        assert!(validate("small", "cpu", "en").is_ok());
        assert!(validate("turbo", "cuda", "auto").is_ok());
        assert!(validate("../../other", "cpu", "en").is_err());
        assert!(validate("small", "../../other", "en").is_err());
        assert!(validate("small", "cpu", "--other").is_err());
    }

    #[test]
    fn rejects_invalid_cue_times() {
        let project = json!({"version":1,"source":"/media.wav","cues":[{"start":2,"end":1,"text":"hello"}],"recognizedSegments":[],"speakers":{}});
        assert!(validate_project(&project).is_err());
    }

    #[test]
    fn atomic_saves_replace_existing_projects() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("project.json");
        atomic_write(&path, b"first").unwrap();
        atomic_write(&path, b"edited").unwrap();
        assert_eq!(fs::read(path).unwrap(), b"edited");
    }
}

fn speaker_marker(root: &Path, device: &str) -> PathBuf {
    root.join(format!("speakers-ready-{device}"))
}
fn speakers_ready(root: &Path, device: &str) -> bool {
    environment(root, device).join("ready").is_file()
        && root.join("speaker-models").is_dir()
        && fs::read_to_string(speaker_marker(root, device))
            .map(|text| text == SPEAKER_MODEL)
            .unwrap_or(false)
}

#[tauri::command]
pub(crate) async fn set_transcription_token(token: String, remember: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::transcription_credentials::store(token, remember)
    })
    .await
    .map_err(|_| "Credential operation failed.".to_string())?
}
#[tauri::command]
pub(crate) async fn clear_transcription_token() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(crate::transcription_credentials::clear)
        .await
        .map_err(|_| "Credential operation failed.".to_string())?
}
#[tauri::command]
pub(crate) async fn setup_speaker_detection(
    app: tauri::AppHandle,
    device: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK
            .try_lock()
            .map_err(|_| "A transcription operation is already running.")?;
        CANCEL.store(false, Ordering::SeqCst);
        device_valid(&device)?;
        let root = root(&app)?;
        if !environment(&root, &device).join("ready").is_file() {
            return Err("Set up the selected WhisperX runtime first.".into());
        }
        let (token, _) = crate::transcription_credentials::read()?;
        let token = token.ok_or("Save a Hugging Face read token in Settings first.")?;
        let marker = speaker_marker(&root, &device);
        let _ = fs::remove_file(&marker);
        report(
            &app,
            "Downloading and verifying the speaker detection model",
        );
        run_private(
            &app,
            &mut worker(&root, &device, "prepare-speakers")?,
            Some(&token),
        )?;
        if CANCEL.load(Ordering::SeqCst) {
            return Err("Speaker setup cancelled.".into());
        }
        atomic_write(&marker, SPEAKER_MODEL.as_bytes())?;
        report(&app, "Speaker detection ready");
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn remove_speaker_detection(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK
            .try_lock()
            .map_err(|_| "Wait for the transcription operation to finish.")?;
        let root = root(&app)?;
        for device in ["cpu", "cuda"] {
            let _ = fs::remove_file(speaker_marker(&root, device));
        }
        let models = root.join("speaker-models");
        if models.exists() {
            fs::remove_dir_all(models).map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
fn detection_range(project: &Value) -> Result<(f64, f64), String> {
    validate_project(project)?;
    let mut start = project["rangeStart"]
        .as_f64()
        .ok_or("Invalid transcript range")?;
    let mut end = project["rangeEnd"]
        .as_f64()
        .ok_or("Invalid transcript range")?;
    for cue in project["cues"].as_array().ok_or("Missing subtitles")? {
        start = start.min(cue["start"].as_f64().ok_or("Invalid subtitle start")?);
        end = end.max(cue["end"].as_f64().ok_or("Invalid subtitle end")?);
    }
    Ok((start, end))
}
#[tauri::command]
pub(crate) async fn detect_transcript_speakers(
    app: tauri::AppHandle,
    device: String,
    project: Value,
    speaker_count: Option<u32>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK.try_lock().map_err(|_| "A transcription operation is already running.")?;
        CANCEL.store(false, Ordering::SeqCst);
        device_valid(&device)?;
        if speaker_count.is_some_and(|n| n == 0 || n > 50) { return Err("Use automatic counting or enter 1–50 speakers.".into()); }
        let source = validate_project(&project)?.to_owned();
        if project["cues"].as_array().is_none_or(|cues| cues.is_empty()) { return Err("Transcribe speech before detecting speakers.".into()); }
        if !Path::new(&source).is_file() { return Err("The original media file is unavailable.".into()); }
        let root = root(&app)?;
        if !speakers_ready(&root, &device) { return Err("Set up speaker detection for the selected processing device in Settings → Audio → Editing.".into()); }
        let (start, end) = detection_range(&project)?;
        let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
        let audio = temp.path().join("audio.wav");
        let input = temp.path().join("project.json");
        let output = temp.path().join("labeled.json");
        fs::write(&input, serde_json::to_vec(&project).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        report(&app, "Preparing audio for speaker detection");
        let ffmpeg = crate::find_tool("ffmpeg").ok_or("Install FFmpeg in Settings → Must haves first.")?;
        run(&app, Command::new(ffmpeg).args(["-nostdin", "-v", "error", "-y", "-ss"]).arg(start.to_string()).arg("-i").arg(source)
            .arg("-t").arg((end - start).to_string()).args(["-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"]).arg(&audio))?;
        let mut command = worker(&root, &device, "diarize")?;
        command.arg("--input").arg(&audio).arg("--project").arg(&input).arg("--output").arg(&output).arg("--start").arg(start.to_string())
            .env("HF_HUB_OFFLINE", "1").env("TRANSFORMERS_OFFLINE", "1");
        if let Some(count) = speaker_count { command.arg("--speaker-count").arg(count.to_string()); }
        run(&app, &mut command)?;
        let labeled: Value = serde_json::from_slice(&fs::read(output).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        validate_project(&labeled)?;
        // Detection may add labels, but must never replace corrected dialogue or cue timing.
        if !same_dialogue(&project, &labeled) { return Err("Speaker detection returned unexpected subtitle changes; your original transcript was kept.".into()); }
        save_transcript(app, labeled.clone())?;
        Ok(labeled)
    }).await.map_err(|e| e.to_string())?
}
fn same_dialogue(before: &Value, after: &Value) -> bool {
    if before["source"] != after["source"]
        || before["recognizedSegments"] != after["recognizedSegments"]
    {
        return false;
    }
    let Some(a) = before["cues"].as_array() else {
        return false;
    };
    let Some(b) = after["cues"].as_array() else {
        return false;
    };
    a.len() == b.len()
        && a.iter().zip(b).all(|(left, right)| {
            ["id", "text", "start", "end"]
                .iter()
                .all(|key| left[*key] == right[*key])
        })
}

#[cfg(test)]
mod speaker_tests {
    use super::*;
    fn project() -> Value {
        json!({"version":1,"source":"/audio.wav","language":"en","model":"small","rangeStart":80,"rangeEnd":90,"speakers":{},"recognizedSegments":[],"cues":[{"id":"1","start":81,"end":83,"text":"Corrected words"}]})
    }
    #[test]
    fn detection_covers_edits_outside_original_selection() {
        let mut p = project();
        p["cues"][0]["start"] = json!(75);
        p["cues"][0]["end"] = json!(95);
        assert_eq!(detection_range(&p).unwrap(), (75.0, 95.0));
    }
    #[test]
    fn speaker_updates_can_add_labels_but_cannot_rewrite_dialogue() {
        let p = project();
        let mut labels = p.clone();
        labels["cues"][0]["speaker"] = json!("speaker-1");
        labels["speakers"] = json!({"speaker-1":"Alice"});
        assert!(same_dialogue(&p, &labels));
        labels["cues"][0]["text"] = json!("Replaced words");
        assert!(!same_dialogue(&p, &labels));
        labels = p.clone();
        labels["cues"][0]["start"] = json!(82);
        assert!(!same_dialogue(&p, &labels));
        labels = p.clone();
        labels["recognizedSegments"] = json!([{"text":"changed"}]);
        assert!(!same_dialogue(&p, &labels));
    }
    #[test]
    fn private_worker_output_redacts_authentication() {
        assert_eq!(
            redact_secret("Authorization: hf_sample_secret", Some("hf_sample_secret")),
            "Authorization: [redacted]"
        );
        assert_eq!(redact_secret("Ready", None), "Ready");
    }
    #[test]
    fn removed_model_directory_invalidates_setup_marker() {
        let tmp = tempfile::tempdir().unwrap();
        private_directory(&environment(tmp.path(), "cpu")).unwrap();
        fs::write(environment(tmp.path(), "cpu").join("ready"), VERSION).unwrap();
        fs::write(speaker_marker(tmp.path(), "cpu"), SPEAKER_MODEL).unwrap();
        assert!(!speakers_ready(tmp.path(), "cpu"));
        private_directory(&tmp.path().join("speaker-models")).unwrap();
        assert!(speakers_ready(tmp.path(), "cpu"));
        assert!(!speakers_ready(tmp.path(), "cuda"));
    }
}
