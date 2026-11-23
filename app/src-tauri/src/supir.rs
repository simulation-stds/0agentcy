//! Ubuntu SUPIR runtime, isolated from VOSR and shared across checkouts.
use crate::{
    emit_progress_detail, output_dir_for, output_image_name, run_stage_with_heartbeat,
    workspace_root, JobProgressRange, JobResult, OutputKind, SupirImageOptions, SupirStatus,
    CANCEL_UPSCALE,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::Ordering,
    time::Duration,
};
use tauri::Manager;
const VERSION: &str = "supir-v0-linux-v1";
const WORKER: &str = include_str!("supir_runner.py");
const REQUIREMENTS: &str = include_str!("../supir/requirements.txt");
const CONSTRAINTS: &str = "torch==2.1.2+cu121\ntorchvision==0.16.2+cu121\nxformers==0.0.23.post1\n";

pub(crate) fn root() -> PathBuf {
    if let Some(path) = env::var_os("VIDEOMAXXING_SHARED_MODELS")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
    {
        return path.join("supir");
    }
    env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env::var_os("HOME").unwrap_or_default()).join(".local/share")
        })
        .join("com.w2ds.videomaxxxing/shared/supir")
}
fn runtime() -> PathBuf {
    root().join("runtimes").join(VERSION)
}
fn python() -> PathBuf {
    runtime().join("env/bin/python")
}
fn fingerprint() -> String {
    format!(
        "{:x}",
        Sha256::digest(format!(
            "{VERSION}\n{WORKER}\n{REQUIREMENTS}\n{CONSTRAINTS}"
        ))
    )
}
fn ready() -> bool {
    python().is_file()
        && root().join("repo/test.py").is_file()
        && fs::read_to_string(runtime().join("ready")).is_ok_and(|s| s == fingerprint())
}
fn lock() -> Result<fs::File, String> {
    fs::create_dir_all(root()).map_err(|e| e.to_string())?;
    let file = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(root().join("operation.lock"))
        .map_err(|e| e.to_string())?;
    file.try_lock()
        .map_err(|_| "SUPIR is busy in another job or checkout.".to_string())?;
    Ok(file)
}
fn configure(command: &mut Command) {
    command
        .env("UV_PYTHON_INSTALL_DIR", root().join("python"))
        .env("UV_CACHE_DIR", root().join("cache/uv"))
        .env("UV_HTTP_TIMEOUT", "300")
        .env("UV_HTTP_RETRIES", "5")
        .env("UV_CONCURRENT_DOWNLOADS", "2")
        .env("HF_HOME", root().join("cache/huggingface"))
        .env("TORCH_HOME", root().join("cache/torch"))
        .env("HF_HUB_DOWNLOAD_TIMEOUT", "300")
        .env("PYTHONNOUSERSITE", "1")
        .env("PYTHONUNBUFFERED", "1")
        .env("CUDA_DEVICE_ORDER", "PCI_BUS_ID")
        .env_remove("PYTHONPATH")
        .env_remove("PYTHONHOME")
        .env_remove("CUDA_VISIBLE_DEVICES")
        .env_remove("XFORMERS_DISABLED");
}
fn worker(mode: &str) -> Command {
    let mut command = Command::new(python());
    command
        .arg(runtime().join("worker.py"))
        .arg(mode)
        .arg("--root")
        .arg(root());
    configure(&mut command);
    if mode != "prepare" {
        command
            .env("HF_HUB_OFFLINE", "1")
            .env("TRANSFORMERS_OFFLINE", "1");
    }
    command
}
fn run(
    app: &tauri::AppHandle,
    command: &mut Command,
    label: &'static str,
    log: &mut String,
) -> Result<(), String> {
    run_stage_with_heartbeat(
        app,
        label,
        command,
        None,
        None,
        log,
        Some(Duration::from_secs(15)),
        Some(JobProgressRange::new(5.0, 95.0, label)),
    )
}
pub(crate) fn install(app: &tauri::AppHandle) -> Result<JobResult, String> {
    let _guard = lock()?;
    CANCEL_UPSCALE.store(false, Ordering::SeqCst);
    fs::create_dir_all(runtime()).map_err(|e| e.to_string())?;
    fs::write(runtime().join("worker.py"), WORKER).map_err(|e| e.to_string())?;
    fs::write(runtime().join("requirements.txt"), REQUIREMENTS).map_err(|e| e.to_string())?;
    fs::write(runtime().join("constraints.txt"), CONSTRAINTS).map_err(|e| e.to_string())?;
    let uv = crate::vosr::installer(app, &root())?;
    let mut log = String::new();
    if !python().is_file() {
        let mut command = Command::new(&uv);
        command
            .args(["venv", "--managed-python", "--python", "3.10"])
            .arg(runtime().join("env"));
        configure(&mut command);
        run(app, &mut command, "SUPIR Python environment", &mut log)?;
    }
    for (packages, index, no_deps) in [
        (
            vec!["torch==2.1.2+cu121", "torchvision==0.16.2+cu121"],
            "https://download.pytorch.org/whl/cu121",
            false,
        ),
        (
            vec!["xformers==0.0.23.post1"],
            "https://download.pytorch.org/whl/cu121",
            true,
        ),
    ] {
        let mut command = Command::new(&uv);
        command
            .args(["pip", "install", "--python"])
            .arg(python())
            .arg("--index-url")
            .arg(index)
            .args(packages);
        if no_deps {
            command.args(["--no-deps", "--only-binary", ":all:"]);
        }
        configure(&mut command);
        run(app, &mut command, "SUPIR GPU packages", &mut log)?;
    }
    let mut dependencies = Command::new(&uv);
    dependencies
        .args(["pip", "install", "--python"])
        .arg(python())
        .arg("-r")
        .arg(runtime().join("requirements.txt"))
        .arg("--constraint")
        .arg(runtime().join("constraints.txt"));
    configure(&mut dependencies);
    run(app, &mut dependencies, "SUPIR dependencies", &mut log)?;
    let mut prepare = worker("prepare");
    prepare
        .arg("--legacy")
        .arg(workspace_root().join("tools/supir"));
    run(
        app,
        &mut prepare,
        "SUPIR shared source and models",
        &mut log,
    )?;
    run(
        app,
        &mut worker("probe"),
        "SUPIR runtime verification",
        &mut log,
    )?;
    fs::write(runtime().join("ready"), fingerprint()).map_err(|e| e.to_string())?;
    Ok(JobResult {
        output_path: root().display().to_string(),
        log,
    })
}
pub(crate) fn status() -> SupirStatus {
    let mut data = json!({});
    let mut detail =
        "Install SUPIR to create its dedicated Ubuntu environment and import existing model files."
            .to_string();
    if ready() {
        match worker("probe").output() {
            Ok(result) if result.status.success() => {
                data = String::from_utf8_lossy(&result.stdout)
                    .lines()
                    .rev()
                    .find_map(|s| serde_json::from_str::<Value>(s).ok())
                    .unwrap_or(json!({}));
                detail = "SUPIR Ubuntu runtime verified. Low VRAM uses CPU offload and tiled VAE; LLaVA requires additional models and memory.".into();
            }
            Ok(result) => {
                detail = format!(
                    "SUPIR runtime needs repair: {}",
                    String::from_utf8_lossy(&result.stderr)
                        .chars()
                        .rev()
                        .take(600)
                        .collect::<String>()
                        .chars()
                        .rev()
                        .collect::<String>()
                )
            }
            Err(error) => detail = format!("SUPIR runtime could not start: {error}"),
        }
    }
    let checkpoints = root().join("checkpoints");
    let models = checkpoints
        .join("sd_xl_base_1.0_0.9vae.safetensors")
        .is_file()
        && ["SUPIR-v0Q.ckpt", "SUPIR-v0F.ckpt"]
            .iter()
            .any(|f| checkpoints.join(f).is_file());
    let cuda = data["cudaReady"].as_bool().unwrap_or(false);
    let xf = data["xformersReady"].as_bool().unwrap_or(false);
    if data["runtimeReady"] == true && !cuda {
        detail = "SUPIR's Python environment works, but its CUDA GPU test failed.".into();
    }
    if !models {
        detail.push_str(" Add the SDXL base and at least one SUPIR checkpoint.");
    }
    if cuda && !xf {
        detail =
            "SUPIR needs repair: its compatible xFormers CUDA operation is unavailable.".into();
    }
    SupirStatus {
        state: if cuda && xf && models {
            "installed"
        } else {
            "needs_setup"
        }
        .into(),
        repo_path: root().join("repo").display().to_string(),
        env_name: runtime().join("env").display().to_string(),
        checkpoint_path: checkpoints.display().to_string(),
        current_size_label: "Shared storage".into(),
        estimated_install_label:
            "Existing checkpoints are reused; dedicated Linux packages are installed separately."
                .into(),
        cuda_ready: cuda,
        checkpoints_ready: models,
        xformers_ready: xf,
        xformers_version: data["xformersVersion"].as_str().unwrap_or("").into(),
        xformers_message: data["xformersMessage"]
            .as_str()
            .unwrap_or("Install the Ubuntu runtime first")
            .into(),
        cuda_devices: Some(data["cudaDevices"].as_array().cloned().unwrap_or_default()),
        message: detail,
    }
}
pub(crate) fn xformers(app: &tauri::AppHandle, remove: bool) -> Result<JobResult, String> {
    let _guard = lock()?;
    CANCEL_UPSCALE.store(false, Ordering::SeqCst);
    if !python().is_file() {
        return Err("Install SUPIR's Ubuntu environment first.".into());
    }
    let uv = crate::vosr::installer(app, &root())?;
    let mut command = Command::new(uv);
    command
        .args([
            "pip",
            if remove { "uninstall" } else { "install" },
            "--python",
        ])
        .arg(python());
    if remove {
        command.arg("xformers");
    } else {
        command.args([
            "--no-deps",
            "--only-binary",
            ":all:",
            "--index-url",
            "https://download.pytorch.org/whl/cu121",
            "xformers==0.0.23.post1",
        ]);
    }
    configure(&mut command);
    let mut log = String::new();
    run(app, &mut command, "SUPIR xFormers", &mut log)?;
    Ok(JobResult {
        output_path: root().display().to_string(),
        log,
    })
}
fn validate(options: &SupirImageOptions) -> Result<(), String> {
    if !["SUPIR-v0Q", "SUPIR-v0F"].contains(&options.model.as_str())
        || !["quality", "fidelity", "low_vram"].contains(&options.preset.as_str())
        || !["1", "2", "4"].contains(&options.upscale.as_str())
        || !Path::new(&options.input_path).is_file()
    {
        return Err("Choose an existing still image and supported SUPIR options.".into());
    }
    let device = options.device.as_deref().unwrap_or("").trim();
    if !device.is_empty() && device.parse::<u32>().is_err() {
        return Err("Choose Auto or a device from SUPIR's CUDA list.".into());
    }
    Ok(())
}

pub(crate) fn run_image(
    app: tauri::AppHandle,
    options: SupirImageOptions,
) -> Result<JobResult, String> {
    validate(&options)?;
    let device = options.device.as_deref().unwrap_or("").trim();
    let _guard = lock()?;
    if !ready() {
        return Err("Install SUPIR's Ubuntu runtime in Settings first.".into());
    }
    let output = output_dir_for(OutputKind::Image)?;
    let path = output.join(output_image_name(
        &options.output_name,
        Path::new(&options.input_path),
        "supir",
    ));
    if path.exists() {
        return Err("An output with that name already exists. Choose another name.".into());
    }
    let staging = tempfile::tempdir_in(&output).map_err(|e| e.to_string())?;
    let staged = staging.path().join("result.png");
    let mut command = worker("run");
    command
        .arg("--input")
        .arg(&options.input_path)
        .arg("--output")
        .arg(&staged)
        .arg("--model")
        .arg(&options.model)
        .arg("--preset")
        .arg(&options.preset)
        .arg("--upscale")
        .arg(&options.upscale);
    if options.use_llava {
        command
            .arg("--llava")
            .env_remove("HF_HUB_OFFLINE")
            .env_remove("TRANSFORMERS_OFFLINE");
    }
    if !device.is_empty() {
        command.env("CUDA_VISIBLE_DEVICES", device);
    }
    CANCEL_UPSCALE.store(false, Ordering::SeqCst);
    let mut log = String::new();
    run(&app, &mut command, "SUPIR restore", &mut log)?;
    if CANCEL_UPSCALE.load(Ordering::SeqCst) {
        return Err("SUPIR cancelled.".into());
    }
    let mut result = tempfile::NamedTempFile::new_in(&output).map_err(|e| e.to_string())?;
    std::io::copy(
        &mut fs::File::open(&staged).map_err(|e| e.to_string())?,
        &mut result,
    )
    .map_err(|e| e.to_string())?;
    result.persist_noclobber(&path).map_err(|e| e.to_string())?;
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(|e| e.to_string())?;
    emit_progress_detail(
        &app,
        "SUPIR",
        format!("Output: {}", path.display()),
        Some(100.0),
        Some("Complete"),
    );
    Ok(JobResult {
        output_path: path.display().to_string(),
        log,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires the installed shared Ubuntu SUPIR runtime and an NVIDIA GPU"]
    fn installed_runtime_passes_native_probe() {
        let status = status();
        let detail = serde_json::to_string(&status).unwrap();
        assert_eq!(status.state, "installed", "{detail}");
        assert!(
            status.cuda_ready && status.xformers_ready && status.checkpoints_ready,
            "{detail}"
        );
        assert!(
            status
                .cuda_devices
                .as_ref()
                .is_some_and(|devices| !devices.is_empty()),
            "{detail}"
        );
        println!("{detail}");
    }
    #[test]
    fn rejects_vulkan_favourites_and_bad_jobs_before_touching_runtime() {
        let source = tempfile::NamedTempFile::new().unwrap();
        let mut options = SupirImageOptions {
            input_path: source.path().display().to_string(),
            output_name: "photo".into(),
            model: "SUPIR-v0F".into(),
            preset: "low_vram".into(),
            device: Some("".into()),
            upscale: "2".into(),
            use_llava: false,
        };
        assert!(validate(&options).is_ok());
        options.device = Some("favorite".into());
        assert!(validate(&options).is_err());
        options.device = Some("-1".into());
        assert!(validate(&options).is_err());
        options.device = Some("0".into());
        assert!(validate(&options).is_ok());
        options.upscale = "16".into();
        assert!(validate(&options).is_err());
        options.upscale = "2".into();
        options.input_path = "does-not-exist".into();
        assert!(validate(&options).is_err());
    }
}
