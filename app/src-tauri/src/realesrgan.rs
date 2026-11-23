//! Per-user Real-ESRGAN distribution, shared by all projects.
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Mutex, MutexGuard, OnceLock},
    thread,
    time::{Duration, Instant},
};
use tauri::Manager;

static ROOT: OnceLock<PathBuf> = OnceLock::new();
static LOCK: Mutex<()> = Mutex::new(());
static DEVICES: Mutex<Option<Vec<crate::RealEsrganDevice>>> = Mutex::new(None);
static HEALTH: Mutex<Option<(bool, Option<String>)>> = Mutex::new(None);
const RELEASE: &str = "v0.2.5.0";
pub(crate) const MODELS: &[&str] = &[
    "realesr-animevideov3-x2",
    "realesr-animevideov3-x3",
    "realesr-animevideov3-x4",
    "realesrgan-x4plus",
    "realesrgan-x4plus-anime",
];

pub(crate) fn init(app: &tauri::AppHandle) -> Result<(), String> {
    ROOT.set(
        app.path()
            .app_local_data_dir()
            .map_err(|e| e.to_string())?
            .join("realesrgan"),
    )
    .map_err(|_| "Real-ESRGAN storage already initialized".to_string())
}
pub(crate) fn root() -> Result<PathBuf, String> {
    ROOT.get()
        .cloned()
        .ok_or("Real-ESRGAN storage is not initialized".into())
}
pub(crate) fn lock() -> Result<MutexGuard<'static, ()>, String> {
    LOCK.try_lock()
        .map_err(|_| "Real-ESRGAN is busy. Wait for its current operation to finish.".into())
}
pub(crate) fn executable_name() -> &'static str {
    if cfg!(windows) {
        "realesrgan-ncnn-vulkan.exe"
    } else {
        "realesrgan-ncnn-vulkan"
    }
}
pub(crate) fn executable() -> Option<PathBuf> {
    let p = root().ok()?.join(executable_name());
    p.is_file().then_some(p)
}
pub(crate) fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}
pub(crate) fn model_ready(root: &Path, name: &str) -> bool {
    valid_name(name)
        && ["param", "bin"].iter().all(|ext| {
            fs::metadata(root.join("models").join(format!("{name}.{ext}")))
                .is_ok_and(|m| m.is_file() && m.len() > 0)
        })
}
pub(crate) fn invalidate() {
    if let Ok(mut devices) = DEVICES.lock() {
        *devices = None;
    }
    if let Ok(mut h) = HEALTH.lock() {
        *h = None;
    }
}
pub(crate) fn validate_model(name: &str) -> Result<(), String> {
    if model_ready(&root()?, name) {
        Ok(())
    } else {
        Err("Select a complete installed Real-ESRGAN model. Manage models in Settings → Video → Real-ESRGAN.".into())
    }
}
pub(crate) fn model_argument(name: &str) -> &str {
    if name.starts_with("realesr-animevideov3-x") {
        "realesr-animevideov3"
    } else {
        name
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Status {
    path: String,
    installed: bool,
    version: Option<String>,
    ready: Option<bool>,
    error: Option<String>,
}
#[tauri::command]
pub(crate) fn realesrgan_status() -> Result<Status, String> {
    let root = root()?;
    let health = HEALTH.lock().map_err(|e| e.to_string())?.clone();
    Ok(Status {
        path: root.to_string_lossy().into(),
        installed: executable().is_some(),
        version: fs::read_to_string(root.join("version.txt")).ok(),
        ready: health.as_ref().map(|h| h.0),
        error: health.and_then(|h| h.1),
    })
}
fn package(os: &str, arch: &str) -> Result<(&'static str, Option<&'static str>), String> {
    if arch != "x86_64" {
        return Err(
            "The bundled Real-ESRGAN runtime currently supports x86-64 machines only.".into(),
        );
    }
    match os {
        "linux" => Ok((
            "ubuntu",
            Some("e5aa6eb131234b87c0c51f82b89390f5e3e642b7b70f2b9bbe95b6a285a40c96"),
        )),
        "windows" => Ok(("windows", None)),
        "macos" => Ok(("macos", None)),
        _ => Err("No Real-ESRGAN runtime package is available for this platform.".into()),
    }
}
fn verify_archive(path: &Path, expected: Option<&str>) -> Result<(), String> {
    if let Some(expected) = expected {
        let mut reader = fs::File::open(path).map_err(|e| e.to_string())?;
        let mut hash = Sha256::new();
        let mut buffer = [0; 65536];
        loop {
            let n = reader.read(&mut buffer).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            hash.update(&buffer[..n]);
        }
        if format!("{:x}", hash.finalize()) != expected {
            return Err(
                "Real-ESRGAN download failed its integrity check. Retry installation.".into(),
            );
        }
    }
    Ok(())
}
fn make_executable(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
    }
    let result = run_timeout(Command::new(path).arg("-h"), Duration::from_secs(15))?;
    if !result.1.contains("Usage:") {
        return Err(format!("Real-ESRGAN could not start: {}", result.1));
    }
    Ok(())
}
// No pipe buffering deadlock; the timeout also covers broken Vulkan drivers.
fn run_timeout(command: &mut Command, timeout: Duration) -> Result<(bool, String), String> {
    let log = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
    let writer = log.reopen().map_err(|e| e.to_string())?;
    command
        .stdin(Stdio::null())
        .stdout(Stdio::from(writer.try_clone().map_err(|e| e.to_string())?))
        .stderr(Stdio::from(writer));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start Real-ESRGAN. Check Vulkan and GPU drivers: {e}"))?;
    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if start.elapsed() < timeout => thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(
                    "Real-ESRGAN check timed out. Check the Vulkan runtime and GPU driver.".into(),
                );
            }
        }
    };
    Ok((
        status.success(),
        fs::read_to_string(log.path()).unwrap_or_default(),
    ))
}
fn stage_package(root: &Path, archive: &Path, selected: &[String]) -> Result<(), String> {
    let parent = root.parent().ok_or("Invalid runtime directory")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temp = tempfile::tempdir_in(parent).map_err(|e| e.to_string())?;
    let extracted = temp.path().join("extracted");
    fs::create_dir(&extracted).map_err(|e| e.to_string())?;
    crate::unzip_archive(archive, &extracted)?;
    let binary = crate::find_file_by_name(&extracted, executable_name())
        .ok_or("The package does not contain the expected Real-ESRGAN executable")?;
    let package = binary.parent().ok_or("Invalid package")?;
    let staged = temp.path().join("staged");
    fs::create_dir(&staged).map_err(|e| e.to_string())?;
    fs::create_dir(staged.join("models")).map_err(|e| e.to_string())?;
    fs::copy(&binary, staged.join(executable_name())).map_err(|e| e.to_string())?;
    for name in [
        "README.md",
        "README_ubuntu.md",
        "README_windows.md",
        "README_macos.md",
        "LICENSE",
        "LICENSE.txt",
    ] {
        if package.join(name).is_file() {
            fs::copy(package.join(name), staged.join(name)).map_err(|e| e.to_string())?;
        }
    }
    // Keep installed models when adding a single new one or repairing the runtime.
    if let Ok(entries) = fs::read_dir(root.join("models")) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                if model_ready(root, name)
                    && matches!(
                        path.extension().and_then(|s| s.to_str()),
                        Some("param" | "bin")
                    )
                {
                    fs::copy(&path, staged.join("models").join(entry.file_name()))
                        .map_err(|e| e.to_string())?;
                }
            }
        }
    }
    let requested: Vec<String> = if selected.is_empty() {
        let installed: Vec<_> = MODELS
            .iter()
            .filter(|m| model_ready(root, m))
            .map(|m| m.to_string())
            .collect();
        if installed.is_empty() {
            vec![MODELS[0].into()]
        } else {
            installed
        }
    } else {
        selected.to_vec()
    };
    for name in &requested {
        if !MODELS.contains(&name.as_str()) {
            return Err(format!("Unsupported Real-ESRGAN model: {name}"));
        }
        if !model_ready(package, name) {
            return Err(format!(
                "The package is missing complete model files for {name}"
            ));
        }
        for ext in ["param", "bin"] {
            let file = format!("{name}.{ext}");
            fs::copy(
                package.join("models").join(&file),
                staged.join("models").join(file),
            )
            .map_err(|e| e.to_string())?;
        }
    }
    make_executable(&staged.join(executable_name()))?;
    fs::write(staged.join("version.txt"), format!("{RELEASE} / 20220424"))
        .map_err(|e| e.to_string())?;
    fs::write(staged.join("SOURCE.txt"), "Official Real-ESRGAN NCNN Vulkan distribution\nhttps://github.com/xinntao/Real-ESRGAN\nhttps://github.com/xinntao/Real-ESRGAN-ncnn-vulkan\n").map_err(|e|e.to_string())?;
    let backup = temp.path().join("previous");
    if root.exists() {
        fs::rename(root, &backup).map_err(|e| e.to_string())?;
    }
    if let Err(e) = fs::rename(&staged, root) {
        if backup.exists() {
            let _ = fs::rename(&backup, root);
        }
        return Err(format!("Could not activate Real-ESRGAN: {e}"));
    }
    invalidate();
    Ok(())
}
pub(crate) fn install(
    app: &tauri::AppHandle,
    selected: &[String],
) -> Result<crate::JobResult, String> {
    let _guard = lock()?;
    for name in selected {
        if !MODELS.contains(&name.as_str()) {
            return Err(format!("Unsupported Real-ESRGAN model: {name}"));
        }
    }
    let (platform, hash) = package(std::env::consts::OS, std::env::consts::ARCH)?;
    let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
    let archive = temp.path().join("runtime.zip");
    let url = format!("https://github.com/xinntao/Real-ESRGAN/releases/download/{RELEASE}/realesrgan-ncnn-vulkan-20220424-{platform}.zip");
    crate::emit_progress(
        app,
        "Real-ESRGAN installation",
        "Downloading the official runtime and selected models…".into(),
    );
    crate::download_with_progress(app, "Real-ESRGAN installation", &url, &archive)?;
    verify_archive(&archive, hash)?;
    let root = root()?;
    stage_package(&root, &archive, selected)?;
    crate::emit_progress(
        app,
        "Real-ESRGAN installation",
        "Checking GPU inference…".into(),
    );
    let result = checked_probe(&root);
    let health = match result {
        Ok(_) => (true, None),
        Err(e) => (false, Some(e)),
    };
    let log = if health.0 {
        "Real-ESRGAN installed and GPU inference verified.".into()
    } else {
        format!(
            "Real-ESRGAN installed. GPU check needs attention: {}",
            health.1.as_deref().unwrap_or_default()
        )
    };
    Ok(crate::JobResult {
        output_path: root.join(executable_name()).to_string_lossy().into(),
        log,
    })
}
pub(crate) fn devices() -> Result<Vec<crate::RealEsrganDevice>, String> {
    if let Some(devices) = DEVICES.lock().map_err(|e| e.to_string())?.clone() {
        return Ok(devices);
    }
    let _guard = lock()?;
    checked_probe(&root()?)
}
fn checked_probe(root: &Path) -> Result<Vec<crate::RealEsrganDevice>, String> {
    let result = probe_at(root);
    *HEALTH.lock().map_err(|e| e.to_string())? = Some(match &result {
        Ok(_) => (true, None),
        Err(e) => (false, Some(e.clone())),
    });
    *DEVICES.lock().map_err(|e| e.to_string())? = result.as_ref().ok().cloned();
    result
}
pub(crate) fn probe_at(root: &Path) -> Result<Vec<crate::RealEsrganDevice>, String> {
    let model = MODELS
        .iter()
        .find(|m| model_ready(root, m))
        .ok_or("Install a Real-ESRGAN model in Settings first")?;
    let ffmpeg = crate::find_tool("ffmpeg").ok_or("Install FFmpeg before checking Real-ESRGAN")?;
    let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
    let input = temp.path().join("input.png");
    let output = temp.path().join("output.png");
    let result = Command::new(ffmpeg)
        .args([
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=green:s=32x32",
            "-frames:v",
            "1",
            "-threads",
            "1",
            "-y",
        ])
        .arg(&input)
        .output()
        .map_err(|e| e.to_string())?;
    if !result.status.success() {
        return Err(format!(
            "Could not prepare GPU test: {}",
            String::from_utf8_lossy(&result.stderr)
        ));
    }
    let mut command = Command::new(root.join(executable_name()));
    command
        .current_dir(root)
        .arg("-i")
        .arg(input)
        .arg("-o")
        .arg(&output)
        .arg("-m")
        .arg(root.join("models"))
        .arg("-n")
        .arg(model_argument(model))
        .arg("-s")
        .arg(crate::realesrgan_model_scale(model))
        .args(["-t", "32", "-j", "1:1:1", "-f", "png"]);
    let (success, log) = run_timeout(&mut command, Duration::from_secs(60))?;
    if !success || !output.is_file() {
        return Err(format!(
            "GPU inference failed. Check the Vulkan runtime and GPU driver. {}",
            log.chars()
                .rev()
                .take(1800)
                .collect::<String>()
                .chars()
                .rev()
                .collect::<String>()
        ));
    }
    let png = fs::read(&output).map_err(|e| e.to_string())?;
    let scale = crate::realesrgan_model_scale(model)
        .parse::<u32>()
        .map_err(|e| e.to_string())?;
    if png.len() < 24
        || !png.starts_with(b"\x89PNG\r\n\x1a\n")
        || u32::from_be_bytes(png[16..20].try_into().unwrap()) != 32 * scale
        || u32::from_be_bytes(png[20..24].try_into().unwrap()) != 32 * scale
    {
        return Err("Real-ESRGAN did not produce a valid upscaled test image".into());
    }
    let mut devices = Vec::new();
    for line in log.lines() {
        if let Some((inside, _)) = line.strip_prefix('[').and_then(|r| r.split_once(']')) {
            if let Some((id, name)) = inside.split_once(' ') {
                if !id.is_empty()
                    && id.chars().all(|c| c.is_ascii_digit())
                    && !devices.iter().any(|d: &crate::RealEsrganDevice| d.id == id)
                {
                    devices.push(crate::RealEsrganDevice {
                        id: id.into(),
                        name: name.trim().into(),
                    });
                }
            }
        }
    }
    Ok(devices)
}
#[tauri::command]
pub(crate) async fn check_realesrgan() -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let _guard = lock()?;
        let root = root()?;
        let _ = checked_probe(&root);
        realesrgan_status()
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn uninstall_realesrgan() -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let _guard = lock()?;
        let root = root()?;
        if root.exists() {
            fs::remove_dir_all(root).map_err(|e| e.to_string())?;
        }
        invalidate();
        realesrgan_status()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    #[test]
    fn packages_and_model_arguments_match_the_platform_contract() {
        assert_eq!(package("linux", "x86_64").unwrap().0, "ubuntu");
        assert!(package("linux", "aarch64").is_err());
        for name in [
            "realesr-animevideov3-x2",
            "realesr-animevideov3-x3",
            "realesr-animevideov3-x4",
        ] {
            assert_eq!(model_argument(name), "realesr-animevideov3");
        }
        assert_eq!(model_argument("realesrgan-x4plus"), "realesrgan-x4plus");
        for name in ["../escape", "a/b", "a\\b", "", ".."] {
            assert!(!valid_name(name));
        }
    }
    #[test]
    fn incomplete_models_and_corrupt_downloads_are_rejected() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir(temp.path().join("models")).unwrap();
        let param = temp.path().join("models/realesr-animevideov3-x2.param");
        fs::write(&param, "param").unwrap();
        assert!(!model_ready(temp.path(), MODELS[0]));
        fs::write(param.with_extension("bin"), []).unwrap();
        assert!(!model_ready(temp.path(), MODELS[0]));
        fs::write(param.with_extension("bin"), "weights").unwrap();
        assert!(model_ready(temp.path(), MODELS[0]));
        assert!(verify_archive(&param, Some("wrong hash")).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn installs_per_user_preserves_models_and_rolls_back_invalid_packages() {
        let temp = tempfile::tempdir().unwrap();
        let archive = temp.path().join("package.zip");
        let mut zip = zip::ZipWriter::new(fs::File::create(&archive).unwrap());
        let opts = zip::write::SimpleFileOptions::default();
        zip.start_file(executable_name(), opts).unwrap();
        zip.write_all(b"#!/bin/sh\nprintf 'Usage: realesrgan-ncnn-vulkan\\n' >&2\nexit 255\n")
            .unwrap();
        for name in MODELS {
            for ext in ["param", "bin"] {
                zip.start_file(format!("models/{name}.{ext}"), opts)
                    .unwrap();
                zip.write_all(b"model data").unwrap();
            }
        }
        zip.finish().unwrap();
        let root = temp.path().join("user-data/realesrgan");
        stage_package(&root, &archive, &[MODELS[0].into()]).unwrap();
        assert!(model_ready(&root, MODELS[0]));
        assert!(!model_ready(&root, MODELS[1]));
        stage_package(&root, &archive, &[MODELS[1].into()]).unwrap();
        assert!(model_ready(&root, MODELS[0]) && model_ready(&root, MODELS[1]));
        stage_package(&root, &archive, &[]).unwrap();
        assert!(model_ready(&root, MODELS[0]) && model_ready(&root, MODELS[1]));
        let before = fs::read(root.join(executable_name())).unwrap();
        assert!(stage_package(&root, &archive, &["../escape".into()]).is_err());
        fs::write(&archive, b"broken archive").unwrap();
        assert!(stage_package(&root, &archive, &[]).is_err());
        assert_eq!(fs::read(root.join(executable_name())).unwrap(), before);
        assert!(model_ready(&root, MODELS[0]) && model_ready(&root, MODELS[1]));
        use std::os::unix::fs::PermissionsExt;
        assert_ne!(
            fs::metadata(root.join(executable_name()))
                .unwrap()
                .permissions()
                .mode()
                & 0o111,
            0
        );
    }
    #[test]
    #[ignore = "requires REAL_ESRGAN_ARCHIVE pointing to the official Linux package and a working Vulkan implementation"]
    fn official_linux_package_installs_and_upscales() {
        let archive = PathBuf::from(
            std::env::var_os("REAL_ESRGAN_ARCHIVE").expect("set REAL_ESRGAN_ARCHIVE"),
        );
        verify_archive(&archive, package("linux", "x86_64").unwrap().1).unwrap();
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("user-data/realesrgan");
        stage_package(&root, &archive, &[MODELS[0].into()]).unwrap();
        assert!(model_ready(&root, MODELS[0]));
        let devices = probe_at(&root).unwrap();
        assert!(!devices.is_empty());
    }
}
