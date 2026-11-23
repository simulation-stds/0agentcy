//! One shared, isolated VOSR installation per app user, independent of checkout.
use crate::{
    download_with_progress, emit_progress_detail, extract_archive, output_dir_for,
    output_image_name, unique_output_path, JobResult, OutputKind,
};
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::Manager;

const XFORMERS: &str = "xformers==0.0.32.post2";
const VERSION: &str = "vosr2-v1";
const MODEL_REVISION: &str = "f24b3061b7f350b81e1907bdcfc27f71fb4ff3f3";
const RUNNER: &str = include_str!("vosr_runner.py");
const REQUIREMENTS: &str = include_str!("../vosr/requirements.txt");
const SKIN_MASK_WORKER: &str = include_str!("skin_mask_runner.py");
const SKIN_MASK_REQUIREMENTS: &str = include_str!("../vosr/skin-mask-requirements.txt");
const SKIN_WORKER: &str = include_str!("skincontrast_runner.py");
static CANCEL: AtomicBool = AtomicBool::new(false);

#[derive(Deserialize, Serialize)]
struct CudaDevice {
    id: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Status {
    state: &'static str,
    pub(crate) path: String,
    environment_path: String,
    model_path: String,
    pub(crate) runtime_ready: bool,
    models_ready: bool,
    cuda_ready: bool,
    cuda_devices: Vec<CudaDevice>,
    message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Options {
    input_path: String,
    output_name: String,
    upscale: u32,
    tile_size: u32,
    seed: u32,
    device: String,
    #[serde(default = "default_backend")]
    backend: String,
    #[serde(default = "default_color_correction")]
    color_correction: String,
    #[serde(default = "default_tile_overlap")]
    tile_overlap: u32,
    #[serde(default = "default_vae_tile_size")]
    vae_tile_size: u32,
    #[serde(default = "default_vae_tile_overlap")]
    vae_tile_overlap: u32,
}
fn default_backend() -> String {
    "auto".into()
}
fn default_color_correction() -> String {
    "wavelet".into()
}
fn default_tile_overlap() -> u32 {
    64
}
fn default_vae_tile_size() -> u32 {
    1024
}
fn default_vae_tile_overlap() -> u32 {
    128
}

fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(custom) = std::env::var_os("VIDEOMAXXING_SHARED_MODELS") {
        let path = PathBuf::from(custom);
        if !path.is_absolute() {
            return Err("VIDEOMAXXING_SHARED_MODELS must be an absolute path".into());
        }
        return Ok(path.join("vosr"));
    }
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("shared")
        .join("vosr"))
}

fn runtime(root: &Path) -> PathBuf {
    root.join("runtimes").join(VERSION)
}
fn python(root: &Path) -> PathBuf {
    environment_python(&runtime(root).join("env"))
}

fn environment_python(environment: &Path) -> PathBuf {
    environment.join(if cfg!(windows) {
        "Scripts/python.exe"
    } else {
        "bin/python"
    })
}
fn fingerprint() -> String {
    format!(
        "{:x}",
        Sha256::digest(format!("{VERSION}\n{RUNNER}\n{REQUIREMENTS}\n{XFORMERS}"))
    )
}
fn models_ready(root: &Path) -> bool {
    let models = root.join("models").join(MODEL_REVISION);
    [
        "VOSR2/args.json",
        "VOSR2/checkpoints/ema_model.safetensors",
        "Qwen-Image-vae-2d/config.json",
        "Qwen-Image-vae-2d/diffusion_pytorch_model.safetensors",
        "torch_cache/checkpoints/dinov2_vitl14_pretrain.pth",
    ]
    .iter()
    .all(|file| fs::metadata(models.join(file)).is_ok_and(|m| m.len() > 0))
}
fn ready(root: &Path) -> bool {
    python(root).is_file()
        && root.join("code/inference_vosr_onestep.py").is_file()
        && root.join("dino/hubconf.py").is_file()
        && models_ready(root)
        && fs::read_to_string(runtime(root).join("ready")).is_ok_and(|value| value == fingerprint())
}

fn configure(command: &mut Command, root: &Path) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
        .env("UV_PYTHON_INSTALL_DIR", root.join("python"))
        .env("UV_CACHE_DIR", root.join("cache/uv"))
        // CUDA wheels are large; simultaneous transfers can starve individual
        // streams long enough to hit uv's default 30-second read timeout.
        .env("UV_HTTP_TIMEOUT", "300")
        .env("UV_HTTP_RETRIES", "5")
        .env("UV_CONCURRENT_DOWNLOADS", "2")
        .env("HF_HOME", root.join("cache/huggingface"))
        .env("TORCH_HOME", root.join("cache/torch"))
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONNOUSERSITE", "1")
        .env("HF_HUB_DISABLE_TELEMETRY", "1")
        .env("XFORMERS_DISABLED", "1")
        .env("CUDA_DEVICE_ORDER", "PCI_BUS_ID")
        .env_remove("CUDA_VISIBLE_DEVICES")
        .env_remove("PYTHONPATH")
        .env_remove("PYTHONHOME");
}

fn lock(root: &Path) -> Result<fs::File, String> {
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let file = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(root.join("operation.lock"))
        .map_err(|e| e.to_string())?;
    file.try_lock().map_err(|_| {
        "VOSR is busy in this or another checkout. Wait for it to finish.".to_string()
    })?;
    Ok(file)
}

fn worker(root: &Path, mode: &str) -> Command {
    let mut command = Command::new(python(root));
    command
        .arg(runtime(root).join("worker.py"))
        .arg(mode)
        .arg("--root")
        .arg(root);
    configure(&mut command, root);
    if mode != "prepare" {
        command
            .env("HF_HUB_OFFLINE", "1")
            .env("TRANSFORMERS_OFFLINE", "1");
    }
    command
}

pub(crate) fn status(app: &tauri::AppHandle) -> Result<Status, String> {
    let root = root(app)?;
    let models = models_ready(&root);
    let installed = ready(&root);
    let mut runtime_ready = false;
    let mut cuda = false;
    let mut cuda_devices = Vec::new();
    let mut message = "Install VOSR 2.0 to upscale photos. The environment and models are shared across checkouts.".to_string();
    if installed {
        let mut probe = worker(&root, "probe");
        match probe.output() {
            Ok(output) if output.status.success() => {
                let data = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .rev()
                    .find_map(|line| serde_json::from_str::<Value>(line).ok())
                    .unwrap_or(json!({}));
                runtime_ready = data["runtimeReady"].as_bool() == Some(true);
                cuda = data["cudaReady"].as_bool() == Some(true);
                cuda_devices =
                    serde_json::from_value(data["cudaDevices"].clone()).unwrap_or_default();
                message = if cuda { "VOSR 2.0 is ready. Models are available offline." }
                    else { "VOSR is installed. An NVIDIA CUDA GPU with a compatible driver is required to run it." }.into();
            }
            _ => message =
                "VOSR needs repair. Use Repair installation to verify its dependencies and models."
                    .into(),
        }
    } else if root.exists() {
        message = "VOSR setup is incomplete or belongs to a different app version. Install to resume or repair it.".into();
    }
    Ok(Status {
        state: if runtime_ready && models {
            "installed"
        } else if root.exists() {
            "needs_setup"
        } else {
            "missing"
        },
        path: root.display().to_string(),
        environment_path: runtime(&root).join("env").display().to_string(),
        model_path: root
            .join("models")
            .join(MODEL_REVISION)
            .display()
            .to_string(),
        runtime_ready,
        models_ready: models,
        cuda_ready: cuda,
        cuda_devices,
        message,
    })
}

fn run(
    app: &tauri::AppHandle,
    command: &mut Command,
    stage: &str,
    log: &mut String,
) -> Result<(), String> {
    run_worker(app, command, "VOSR 2.0", stage, log)
}

fn run_worker(
    app: &tauri::AppHandle,
    command: &mut Command,
    model: &str,
    stage: &str,
    log: &mut String,
) -> Result<(), String> {
    if CANCEL.load(Ordering::SeqCst) {
        return Err("VOSR cancelled.".into());
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
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
    let mut child = command.spawn().map_err(|e| format!("{stage}: {e}"))?;
    let (send, receive) = mpsc::channel();
    let mut readers = Vec::new();
    if let Some(stdout) = child.stdout.take() {
        let send = send.clone();
        readers.push(thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let _ = send.send(line);
            }
        }));
    }
    if let Some(stderr) = child.stderr.take() {
        let send = send.clone();
        readers.push(thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let _ = send.send(line);
            }
        }));
    }
    drop(send);
    let mut heartbeat = Instant::now();
    let mut last_output = Instant::now();
    let result = loop {
        for line in receive.try_iter() {
            last_output = Instant::now();
            emit_progress_detail(app, model, line.clone(), None, Some(stage));
            log.push_str(&line);
            log.push('\n');
        }
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
            emit_progress_detail(
                app,
                model,
                "Cancelled".into(),
                Some(0.0),
                Some("Cancelled"),
            );
            break Err("VOSR cancelled.".to_string());
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                break if status.success() {
                    Ok(())
                } else {
                    Err(format!("{stage} failed."))
                }
            }
            Ok(None) => {}
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(error.to_string());
            }
        }
        if heartbeat.elapsed() >= Duration::from_secs(15)
            && last_output.elapsed() >= Duration::from_secs(15)
        {
            emit_progress_detail(
                app,
                model,
                format!(
                    "Worker is running; no progress update for {}s.",
                    last_output.elapsed().as_secs()
                ),
                None,
                Some(stage),
            );
            heartbeat = Instant::now();
        }
        thread::sleep(Duration::from_millis(100));
    };
    for reader in readers {
        let _ = reader.join();
    }
    for line in receive.try_iter() {
        log.push_str(&line);
        log.push('\n');
    }
    result.map_err(|message| {
        format!(
            "{message}\n{}",
            log.lines()
                .rev()
                .take(20)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n")
        )
    })
}

pub(crate) fn installer(app: &tauri::AppHandle, root: &Path) -> Result<PathBuf, String> {
    let (asset, binary, hash) = match (std::env::consts::OS, std::env::consts::ARCH) {
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
                "VOSR installation supports Windows and Linux x86-64 with NVIDIA CUDA.".into(),
            )
        }
    };
    let directory = root.join("installer");
    let executable = directory.join(binary);
    if executable.is_file() {
        return Ok(executable);
    }
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let archive = directory.join(asset);
    download_with_progress(
        app,
        "VOSR Python installer",
        &format!("https://github.com/astral-sh/uv/releases/download/0.9.10/{asset}"),
        &archive,
    )?;
    let actual = format!(
        "{:x}",
        Sha256::digest(fs::read(&archive).map_err(|e| e.to_string())?)
    );
    if actual != hash {
        let _ = fs::remove_file(&archive);
        return Err("Python installer checksum verification failed. Retry installation.".into());
    }
    extract_archive(&archive, &directory)?;
    let _ = fs::remove_file(archive);
    if !executable.is_file() {
        return Err("Python installer executable is missing.".into());
    }
    Ok(executable)
}

#[tauri::command]
pub(crate) async fn install_vosr(app: tauri::AppHandle) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = root(&app)?;
        let _guard = lock(&root)?;
        CANCEL.store(false, Ordering::SeqCst);
        let runtime = runtime(&root);
        fs::create_dir_all(&runtime).map_err(|e| e.to_string())?;
        let _ = fs::remove_file(runtime.join("ready"));
        fs::write(runtime.join("worker.py"), RUNNER).map_err(|e| e.to_string())?;
        fs::write(runtime.join("requirements.txt"), REQUIREMENTS).map_err(|e| e.to_string())?;
        let uv = installer(&app, &root)?;
        let mut log = String::new();
        if !python(&root).is_file() {
            let mut command = Command::new(&uv);
            command
                .args(["venv", "--python", "3.11", "--managed-python"])
                .arg(runtime.join("env"));
            configure(&mut command, &root);
            run(
                &app,
                &mut command,
                "Creating dedicated environment",
                &mut log,
            )?;
        }
        let mut torch = Command::new(&uv);
        emit_progress_detail(
            &app,
            "VOSR 2.0",
            "Downloading GPU packages: 2 simultaneous downloads, 300-second read timeout, up to 5 retries. Completed downloads are reused.".into(),
            None,
            Some("Installing GPU runtime"),
        );
        torch
            .args(["pip", "install", "--python"])
            .arg(python(&root))
            .args([
                "--index-url",
                "https://download.pytorch.org/whl/cu128",
                "torch==2.8.0",
                "torchvision==0.23.0",
            ]);
        configure(&mut torch, &root);
        run(&app, &mut torch, "Installing GPU runtime", &mut log)?;
        // Optional optimization: a failed wheel install must not prevent PyTorch inference.
        let mut acceleration = Command::new(&uv);
        acceleration.args(["pip", "install", "--python"]).arg(python(&root))
            .args(["--no-deps", "--only-binary", ":all:", "--index-url",
                "https://download.pytorch.org/whl/cu128", XFORMERS]);
        configure(&mut acceleration, &root);
        if let Err(error) = run(&app, &mut acceleration, "Installing optional xFormers", &mut log) {
            if CANCEL.load(Ordering::SeqCst) { return Err(error); }
            emit_progress_detail(&app, "VOSR 2.0", "xFormers could not be installed. PyTorch remains available.".into(), None, Some("PyTorch fallback"));
        }
        let mut dependencies = Command::new(&uv);
        dependencies
            .args(["pip", "install", "--python"])
            .arg(python(&root))
            .arg("-r")
            .arg(runtime.join("requirements.txt"));
        configure(&mut dependencies, &root);
        run(
            &app,
            &mut dependencies,
            "Installing image libraries",
            &mut log,
        )?;
        run(
            &app,
            &mut worker(&root, "prepare"),
            "Downloading and verifying models",
            &mut log,
        )?;
        fs::write(runtime.join("ready"), fingerprint()).map_err(|e| e.to_string())?;
        emit_progress_detail(
            &app,
            "VOSR 2.0",
            "Installation complete".into(),
            Some(100.0),
            Some("Complete"),
        );
        status(&app)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) fn cancel_vosr() {
    CANCEL.store(true, Ordering::SeqCst);
}

fn valid_cuda_device(device: &str) -> bool {
    device.is_empty()
        || device.parse::<u32>().is_ok()
        || device.strip_prefix("GPU-").is_some_and(|uuid| {
            uuid.len() == 36
                && uuid.bytes().enumerate().all(|(index, byte)| {
                    if [8, 13, 18, 23].contains(&index) {
                        byte == b'-'
                    } else {
                        byte.is_ascii_hexdigit()
                    }
                })
        })
}

fn validate(options: &Options) -> Result<(), String> {
    if ![1, 2, 4].contains(&options.upscale) || ![256, 512].contains(&options.tile_size) {
        return Err("Choose a supported upscale factor and tile size.".into());
    }
    if !["auto", "pytorch", "xformers"].contains(&options.backend.as_str())
        || !["wavelet", "adain", "nofix"].contains(&options.color_correction.as_str())
        || ![0, 32, 64, 128].contains(&options.tile_overlap)
        || options.tile_overlap >= options.tile_size
        || ![0, 512, 1024, 2048].contains(&options.vae_tile_size)
        || ![0, 64, 128, 256].contains(&options.vae_tile_overlap)
        || (options.vae_tile_size > 0 && options.vae_tile_overlap >= options.vae_tile_size)
    {
        return Err(
            "Choose supported VOSR advanced settings and overlaps smaller than each tile.".into(),
        );
    }
    if !valid_cuda_device(&options.device) {
        return Err("Choose an NVIDIA GPU or Auto.".into());
    }
    if !Path::new(&options.input_path).is_file() {
        return Err("Choose an existing image file.".into());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn run_vosr_image_job(
    app: tauri::AppHandle,
    options: Options,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate(&options)?;
        let root = root(&app)?;
        let _guard = lock(&root)?;
        if !ready(&root) {
            return Err("Install VOSR 2.0 in Settings → Image → Editing first.".into());
        }
        CANCEL.store(false, Ordering::SeqCst);
        let output = output_dir_for(OutputKind::Image)?;
        let path = output.join(output_image_name(
            &options.output_name,
            Path::new(&options.input_path),
            "vosr2",
        ));
        if path.exists() {
            return Err(
                "An output with that name already exists. Choose another output name.".into(),
            );
        }
        // Stage on the destination filesystem; failed/cancelled jobs never publish an image.
        let staging = tempfile::Builder::new()
            .prefix(".vosr-")
            .tempdir_in(&output)
            .map_err(|e| e.to_string())?;
        let staged = staging.path().join("output.png");
        let mut command = worker(&root, "run");
        command
            .arg("--input")
            .arg(&options.input_path)
            .arg("--output")
            .arg(&staged)
            .arg("--upscale")
            .arg(options.upscale.to_string())
            .arg("--tile-size")
            .arg(options.tile_size.to_string())
            .arg("--seed")
            .arg(options.seed.to_string())
            .arg("--backend")
            .arg(&options.backend)
            .arg("--color-correction")
            .arg(&options.color_correction)
            .arg("--tile-overlap")
            .arg(options.tile_overlap.to_string())
            .arg("--vae-tile-size")
            .arg(options.vae_tile_size.to_string())
            .arg("--vae-tile-overlap")
            .arg(options.vae_tile_overlap.to_string());
        if !options.device.is_empty() {
            command.env("CUDA_VISIBLE_DEVICES", &options.device);
        }
        emit_progress_detail(
            &app,
            "VOSR 2.0",
            "Loading models".into(),
            Some(5.0),
            Some("Upscaling image"),
        );
        let mut log = String::new();
        run(&app, &mut command, "Upscaling image", &mut log)?;
        if CANCEL.load(Ordering::SeqCst) {
            return Err("VOSR cancelled.".into());
        }
        publish_image(&app, &output, &staged, &path, "VOSR")?;
        emit_progress_detail(
            &app,
            "VOSR 2.0",
            format!("Output: {}", path.display()),
            Some(100.0),
            Some("Complete"),
        );
        Ok(JobResult {
            output_path: path.display().to_string(),
            log,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn publish_image(
    app: &tauri::AppHandle,
    output: &Path,
    staged: &Path,
    path: &Path,
    model: &str,
) -> Result<(), String> {
    if !staged.is_file() {
        return Err(format!("{model} did not create an output image."));
    }
    let mut published = tempfile::NamedTempFile::new_in(output).map_err(|e| e.to_string())?;
    std::io::copy(
        &mut fs::File::open(staged).map_err(|e| e.to_string())?,
        &mut published,
    )
    .map_err(|e| e.to_string())?;
    published
        .persist_noclobber(path)
        .map_err(|e| format!("Could not save {model} output: {e}"))?;
    // Expose only the completed image, including in user-selected output folders.
    app.asset_protocol_scope().allow_file(path).map_err(|e| {
        format!("{model} saved {}, but could not enable its preview: {e}", path.display())
    })
}

type SkinCrop = [f64; 4];

fn valid_skin_crop([left, top, right, bottom]: SkinCrop) -> bool {
    0.0 <= left && left < right && right <= 1.0 && 0.0 <= top && top < bottom && bottom <= 1.0
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum SkinDetectionMode {
    Fast,
    Detail,
}

impl SkinDetectionMode {
    fn long_edge(&self) -> &'static str {
        match self {
            Self::Fast => "512",
            Self::Detail => "1024",
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SkinMask {
    data_url: String,
    bounds: SkinCrop,
}

fn skin_mask_python(
    app: &tauri::AppHandle,
    root: &Path,
    log: &mut String,
) -> Result<PathBuf, String> {
    let setup = root.join("runtimes/stars-speck-v1");
    let environment = setup.join("env");
    let interpreter = environment_python(&environment);
    let ready = setup.join("ready");
    if interpreter.is_file()
        && fs::read_to_string(&ready).is_ok_and(|contents| contents == SKIN_MASK_REQUIREMENTS)
    {
        return Ok(interpreter);
    }

    fs::create_dir_all(&setup).map_err(|e| e.to_string())?;
    let uv = installer(app, root)?;
    if !interpreter.is_file() {
        let mut command = Command::new(&uv);
        configure(&mut command, root);
        command
            .args(["venv", "--python"])
            .arg(python(root))
            .arg(&environment);
        run_worker(
            app,
            &mut command,
            "Detect skin",
            "Creating skin mask environment",
            log,
        )?;
    }
    let requirements = setup.join("requirements.txt");
    fs::write(&requirements, SKIN_MASK_REQUIREMENTS).map_err(|e| e.to_string())?;
    let mut command = Command::new(&uv);
    configure(&mut command, root);
    command
        .args(["pip", "install", "--python"])
        .arg(&interpreter)
        .args(["--only-binary", ":all:", "-r"])
        .arg(requirements);
    run_worker(
        app,
        &mut command,
        "Detect skin",
        "Installing the Stars Speck CPU runtime",
        log,
    )?;
    fs::write(ready, SKIN_MASK_REQUIREMENTS).map_err(|e| e.to_string())?;
    Ok(interpreter)
}

#[tauri::command]
pub(crate) async fn detect_vosr_skin_mask(
    app: tauri::AppHandle,
    input_path: PathBuf,
    mode: SkinDetectionMode,
    crop: Option<SkinCrop>,
) -> Result<SkinMask, String> {
    tauri::async_runtime::spawn_blocking(move || {
        check_vosr_png(&input_path)?;
        if crop.is_some_and(|bounds| !valid_skin_crop(bounds)) {
            return Err("Draw a valid skin detection crop.".into());
        }
        let root = root(&app)?;
        let _guard = lock(&root)?;
        let downloader = runtime(&root).join("worker.py");
        if !python(&root).is_file() || !downloader.is_file() {
            return Err(
                "Install VOSR 2.0 in Settings → Image → Editing to set up the image runtime."
                    .into(),
            );
        }
        CANCEL.store(false, Ordering::SeqCst);
        emit_progress_detail(
            &app,
            "Detect skin",
            "Preparing Stars Speck skin detection".into(),
            Some(5.0),
            Some("Detect skin"),
        );
        let mut log = String::new();
        let interpreter = skin_mask_python(&app, &root, &mut log)?;
        let staging = tempfile::Builder::new()
            .prefix(".skin-mask-")
            .tempdir_in(&root)
            .map_err(|e| e.to_string())?;
        let script = staging.path().join("worker.py");
        let mask = staging.path().join("mask.png");
        let bounds_file = staging.path().join("bounds.json");
        fs::write(&script, SKIN_MASK_WORKER).map_err(|e| e.to_string())?;
        let mut command = Command::new(interpreter);
        configure(&mut command, &root);
        command
            .arg(script)
            .arg("--input")
            .arg(input_path)
            .arg("--output")
            .arg(&mask)
            .arg("--bounds")
            .arg(&bounds_file)
            .arg("--long-edge")
            .arg(mode.long_edge())
            .arg("--models")
            .arg(root.join("models/stars-speck"))
            .arg("--downloader")
            .arg(downloader);
        if let Some(bounds) = crop {
            command
                .arg("--crop")
                .args(bounds.map(|edge| edge.to_string()));
        }
        run_worker(
            &app,
            &mut command,
            "Detect skin",
            "Detecting skin on CPU",
            &mut log,
        )?;
        if CANCEL.load(Ordering::SeqCst) {
            return Err("Skin detection cancelled.".into());
        }
        let bytes =
            fs::read(mask).map_err(|e| format!("Could not read the detected skin mask: {e}"))?;
        let bounds = serde_json::from_slice(&fs::read(bounds_file).map_err(|e| e.to_string())?)
            .map_err(|e| format!("Could not read the detected mask bounds: {e}"))?;
        emit_progress_detail(
            &app,
            "Detect skin",
            "Skin mask ready".into(),
            Some(100.0),
            Some("Complete"),
        );
        Ok(SkinMask {
            data_url: format!(
                "data:image/png;base64,{}",
                general_purpose::STANDARD.encode(bytes)
            ),
            bounds,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn check_vosr_png(input: &Path) -> Result<(), String> {
    if !input.is_file()
        || !input
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("png"))
    {
        return Err("Choose an existing VOSR PNG result.".into());
    }
    Ok(())
}

fn decode_skin_mask(data_url: &str) -> Result<Vec<u8>, String> {
    let encoded = data_url
        .strip_prefix("data:image/png;base64,")
        .filter(|data| data.len() <= 4 * 1024 * 1024)
        .ok_or("The detected skin mask is invalid.")?;
    general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| "The detected skin mask is invalid.".into())
}

#[derive(Deserialize, Serialize)]
pub(crate) struct SkinStroke {
    width: f32,
    erase: bool,
    points: Vec<[f32; 2]>,
}

#[tauri::command]
pub(crate) async fn run_vosr_skin_job(
    app: tauri::AppHandle,
    input_path: PathBuf,
    device: String,
    strokes: Vec<SkinStroke>,
    auto_mask: Option<String>,
    mask_bounds: Option<SkinCrop>,
    mask_coverage: Option<u8>,
) -> Result<JobResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !valid_cuda_device(&device) {
            return Err("Choose an NVIDIA GPU or Auto.".into());
        }
        check_vosr_png(&input_path)?;
        let mask_coverage = mask_coverage.unwrap_or(50);
        if !(1..=99).contains(&mask_coverage)
            || mask_bounds.is_some_and(|bounds| !valid_skin_crop(bounds))
        {
            return Err("The detected skin mask is invalid.".into());
        }
        let auto_mask = auto_mask.as_deref().map(decode_skin_mask).transpose()?;
        if auto_mask.is_none()
            && !strokes
                .iter()
                .any(|stroke| !stroke.erase && !stroke.points.is_empty())
        {
            return Err("Paint some skin before running Skin Enhance.".into());
        }
        if strokes
            .iter()
            .map(|stroke| stroke.points.len())
            .sum::<usize>()
            > 100_000
            || strokes.iter().any(|stroke| {
                !(0.0 < stroke.width && stroke.width <= 1.0)
                    || stroke.points.is_empty()
                    || stroke
                        .points
                        .iter()
                        .flatten()
                        .any(|value| !(0.0..=1.0).contains(value))
            })
        {
            return Err("The skin mask is invalid or too complex.".into());
        }
        let root = root(&app)?;
        let _guard = lock(&root)?;
        let downloader = runtime(&root).join("worker.py");
        if !python(&root).is_file() || !downloader.is_file() {
            return Err(
                "Install VOSR 2.0 in Settings → Image → Editing to set up the image runtime."
                    .into(),
            );
        }
        CANCEL.store(false, Ordering::SeqCst);
        let output = output_dir_for(OutputKind::Image)?;
        let path = unique_output_path(&output, &output_image_name("", &input_path, "skincontrast"));
        let staging = tempfile::Builder::new()
            .prefix(".skincontrast-")
            .tempdir_in(&output)
            .map_err(|e| e.to_string())?;
        let script = staging.path().join("worker.py");
        let mask = staging.path().join("strokes.json");
        let staged = staging.path().join("output.png");
        fs::write(&script, SKIN_WORKER).map_err(|e| e.to_string())?;
        fs::write(
            &mask,
            serde_json::to_vec(&strokes).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        let mut command = Command::new(python(&root));
        configure(&mut command, &root);
        command
            .arg(script)
            .arg("--input")
            .arg(input_path)
            .arg("--output")
            .arg(&staged)
            .arg("--strokes")
            .arg(mask)
            .arg("--weights")
            .arg(root.join("models/skincontrast"))
            .arg("--downloader")
            .arg(downloader);
        if let Some(bytes) = auto_mask {
            let base_mask = staging.path().join("detected-mask.png");
            fs::write(&base_mask, bytes).map_err(|e| e.to_string())?;
            command
                .arg("--auto-mask")
                .arg(base_mask)
                .arg("--mask-coverage")
                .arg(mask_coverage.to_string());
            if let Some(bounds) = mask_bounds {
                command
                    .arg("--mask-bounds")
                    .args(bounds.map(|edge| edge.to_string()));
            }
        }
        if !device.is_empty() {
            command.env("CUDA_VISIBLE_DEVICES", device);
        }
        emit_progress_detail(
            &app,
            "Skin Enhance",
            "Preparing skin enhancement".into(),
            Some(5.0),
            Some("Skin Enhance"),
        );
        let mut log = String::new();
        run_worker(
            &app,
            &mut command,
            "Skin Enhance",
            "Skin enhancement",
            &mut log,
        )?;
        if CANCEL.load(Ordering::SeqCst) {
            return Err("Skin enhancement cancelled.".into());
        }
        publish_image(&app, &output, &staged, &path, "Skin Enhance")?;
        emit_progress_detail(
            &app,
            "Skin Enhance",
            format!("Output: {}", path.display()),
            Some(100.0),
            Some("Complete"),
        );
        Ok(JobResult {
            output_path: path.display().to_string(),
            log,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn incomplete_install_cannot_be_reported_ready() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path();
        fs::create_dir_all(runtime(root)).unwrap();
        fs::write(runtime(root).join("ready"), fingerprint()).unwrap();
        assert!(!ready(root));
        assert!(!models_ready(root));
    }
    #[test]
    fn checkout_operations_share_an_exclusive_lock() {
        let temporary = tempfile::tempdir().unwrap();
        let first = lock(temporary.path()).unwrap();
        assert!(lock(temporary.path()).is_err());
        drop(first);
        assert!(lock(temporary.path()).is_ok());
    }
    #[test]
    fn advanced_defaults_and_validation_match_older_clients() {
        let file = tempfile::NamedTempFile::new().unwrap();
        let mut options: Options = serde_json::from_value(json!({
            "inputPath": file.path(), "outputName": "test", "upscale": 2,
            "tileSize": 512, "seed": 42, "device": ""
        }))
        .unwrap();
        assert_eq!(options.backend, "auto");
        assert_eq!(options.color_correction, "wavelet");
        assert_eq!(options.tile_overlap, 64);
        assert_eq!(options.vae_tile_size, 1024);
        assert_eq!(options.vae_tile_overlap, 128);
        assert!(validate(&options).is_ok());
        options.backend = "unknown".into();
        assert!(validate(&options).is_err());
        options.backend = "xformers".into();
        options.color_correction = "unknown".into();
        assert!(validate(&options).is_err());
        options.color_correction = "nofix".into();
        options.vae_tile_overlap = 1024;
        assert!(validate(&options).is_err());
        options.vae_tile_overlap = 128;
        options.vae_tile_size = 0;
        assert!(validate(&options).is_ok());
    }
    #[test]
    fn rejects_invalid_options_before_launch() {
        let file = tempfile::NamedTempFile::new().unwrap();
        let mut options = Options {
            input_path: file.path().display().to_string(),
            output_name: "photo".into(),
            upscale: 2,
            tile_size: 512,
            seed: 42,
            device: "".into(),
            backend: default_backend(),
            color_correction: default_color_correction(),
            tile_overlap: default_tile_overlap(),
            vae_tile_size: default_vae_tile_size(),
            vae_tile_overlap: default_vae_tile_overlap(),
        };
        assert!(validate(&options).is_ok());
        options.device = "-1".into();
        assert!(validate(&options).is_err());
        options.device = "GPU-8c4fc32f-55b8-cba4-b97b-195ae9820734".into();
        assert!(validate(&options).is_ok());
        options.device = "GPU-not-a-valid-id".into();
        assert!(validate(&options).is_err());
        options.device = "0".into();
        options.upscale = 16;
        assert!(validate(&options).is_err());
    }
}
