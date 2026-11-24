use std::{
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Manager;

use crate::{
    add_trim_args, audio_output_name, download_with_progress, emit_progress_detail, find_tool,
    output_dir_for, probe_audio, workspace_root, AudioJobOptions, OutputKind,
};

const BANDIT_PACKAGE: &str = "bandit-infer[audio] @ https://github.com/openmirlab/bandit-infer/archive/96ea0ec12aeb444f379c2f5145fb8ee58b58cf19.tar.gz";
const BANDIT_MODEL: &str = "checkpoint-multi.ckpt";
const BANDIT_HASH: &str = "abcfccf65446752a057f4a302c941479a54b7560ebf8d7bca039d2ea98e64cfc";
const BANDIT_URL: &str =
    "https://zenodo.org/api/records/12701995/files/checkpoint-multi.ckpt/content";
const DEEP_RELEASE: &str = "https://github.com/Rikorose/DeepFilterNet/releases/download/v0.5.6";
static AUDIO_MODEL_LOCK: Mutex<()> = Mutex::new(());
static CANCEL_MODEL_JOB: AtomicBool = AtomicBool::new(false);
#[derive(Default)]
pub(crate) struct VideoAudioPreview(Mutex<Option<tempfile::TempPath>>);

const BANDIT_STEMS: [(&str, &str); 3] = [
    ("speech.wav", "Dialogue"),
    ("music.wav", "Music"),
    ("effects.wav", "Effects"),
];

const CLEAN_VOICE_STEMS: [(&str, &str); 2] =
    [("original.wav", "Original"), ("cleaned.wav", "Cleaned")];

fn stem_file_name(label: &str) -> String {
    if label == "Cleaned" {
        "Clean Voice.wav".into()
    } else {
        format!("{label}.wav")
    }
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum AudioModel {
    Bandit,
    Deepfilter,
}

impl AudioModel {
    fn stems(self) -> &'static [(&'static str, &'static str)] {
        match self {
            Self::Bandit => &BANDIT_STEMS,
            Self::Deepfilter => &CLEAN_VOICE_STEMS,
        }
    }

    fn legacy_directory(self) -> PathBuf {
        #[cfg(target_os = "linux")]
        let workspace = crate::linux_runtimes::legacy_checkout();
        #[cfg(not(target_os = "linux"))]
        let workspace = workspace_root();
        workspace.join("tools").join(match self {
            Self::Bandit => "bandit",
            Self::Deepfilter => "deepfilternet",
        })
    }

    fn label(self) -> &'static str {
        match self {
            Self::Bandit => "Bandit v2",
            Self::Deepfilter => "DeepFilterNet",
        }
    }
}

#[derive(Clone, Copy, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum BanditDevice {
    #[default]
    Cpu,
    Cuda,
}

impl BanditDevice {
    fn argument(self) -> &'static str {
        match self {
            Self::Cpu => "cpu",
            Self::Cuda => "cuda",
        }
    }

    fn torch_install_args(self) -> Result<[&'static str; 3], String> {
        if self == Self::Cpu {
            return Ok([
                "--index-url",
                "https://download.pytorch.org/whl/cpu",
                "torch==2.8.0",
            ]);
        }
        let wheel = match (std::env::consts::OS, std::env::consts::ARCH) {
            ("linux", "x86_64") => "https://download.pytorch.org/whl/cu126/torch-2.8.0%2Bcu126-cp312-cp312-manylinux_2_28_x86_64.whl",
            ("windows", "x86_64") => "https://download.pytorch.org/whl/cu126/torch-2.8.0%2Bcu126-cp312-cp312-win_amd64.whl",
            _ => return Err("Bandit CUDA setup supports x86-64 Linux and Windows.".into()),
        };
        // The CUDA torch wheel is pinned separately so its dependencies resolve from PyPI.
        Ok(["--index-url", "https://pypi.org/simple", wheel])
    }

    fn env_dir(self, root: &Path) -> PathBuf {
        root.join(match self {
            Self::Cpu => "env",
            Self::Cuda => "env-cuda",
        })
    }

    fn runtime_marker(self, root: &Path) -> PathBuf {
        root.join(match self {
            Self::Cpu => "runtime-ready",
            Self::Cuda => "runtime-ready-cuda",
        })
    }

    fn ready_marker(self, root: &Path) -> PathBuf {
        root.join(match self {
            Self::Cpu => "ready",
            Self::Cuda => "ready-cuda",
        })
    }
}

fn active_bandit_device(root: &Path) -> BanditDevice {
    if fs::read_to_string(root.join("device")).is_ok_and(|value| value == "cuda") {
        BanditDevice::Cuda
    } else {
        BanditDevice::Cpu
    }
}

#[cfg(target_os = "linux")]
fn managed(model: AudioModel, device: BanditDevice) -> Result<crate::linux_runtimes::Runtime, String> {
    use crate::linux_runtimes::Runtime;
    match model {
        AudioModel::Bandit => Runtime::new("bandit", &format!(
            "v1:{}:python3.12:{:?}:{BANDIT_PACKAGE}:{BANDIT_HASH}:numpy2.2.6:soundfile0.13.1",
            device.argument(), device.torch_install_args()?
        )),
        AudioModel::Deepfilter => Runtime::new("deepfilternet", deep_asset()?.1),
    }
}

fn audio_directory(model: AudioModel) -> Result<PathBuf, String> {
    let legacy = model.legacy_directory();
    #[cfg(target_os = "linux")]
    {
        let preferred = match model {
            AudioModel::Bandit => match crate::linux_runtimes::preference("bandit-device").as_deref() {
                Some("cuda") => BanditDevice::Cuda,
                Some("cpu") => BanditDevice::Cpu,
                _ => active_bandit_device(&legacy),
            },
            AudioModel::Deepfilter => BanditDevice::Cpu,
        };
        let preferred_root = managed(model, preferred)?.selected(&legacy);
        if matches!(model, AudioModel::Bandit) && !status(model, &preferred_root).installed {
            let other = if preferred == BanditDevice::Cpu { BanditDevice::Cuda } else { BanditDevice::Cpu };
            if let Ok(runtime) = managed(model, other) {
                let other_root = runtime.selected(&legacy);
                if status(model, &other_root).installed {
                    return Ok(other_root);
                }
            }
        }
        return Ok(preferred_root);
    }
    #[cfg(not(target_os = "linux"))]
    Ok(legacy)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AudioModelStatus {
    runtime_ready: bool,
    model_ready: bool,
    installed: bool,
    bandit_device: Option<BanditDevice>,
    has_files: bool,
    path: String,
}

fn bandit_python(root: &Path, device: BanditDevice) -> PathBuf {
    device.env_dir(root).join(if cfg!(windows) {
        "python.exe"
    } else {
        "bin/python"
    })
}

fn deep_binary(root: &Path) -> PathBuf {
    root.join(if cfg!(windows) {
        "deep-filter.exe"
    } else {
        "deep-filter"
    })
}

fn status(model: AudioModel, root: &Path) -> AudioModelStatus {
    let device = active_bandit_device(root);
    let (runtime_ready, model_ready, ready_marker, bandit_device) = match model {
        AudioModel::Bandit => (
            bandit_python(root, device).is_file() && device.runtime_marker(root).is_file(),
            fs::metadata(root.join(BANDIT_MODEL)).is_ok_and(|file| file.len() == 446_680_129),
            device.ready_marker(root),
            Some(device),
        ),
        AudioModel::Deepfilter => {
            let ready = deep_binary(root).is_file();
            (ready, ready, root.join("ready"), None)
        }
    };
    AudioModelStatus {
        runtime_ready,
        model_ready,
        installed: runtime_ready && model_ready && ready_marker.is_file(),
        bandit_device,
        has_files: root.exists(),
        path: root.display().to_string(),
    }
}

#[tauri::command]
pub(crate) fn audio_model_status(model: AudioModel) -> Result<AudioModelStatus, String> {
    Ok(status(model, &audio_directory(model)?))
}

#[tauri::command]
pub(crate) async fn manage_audio_model(
    app: tauri::AppHandle,
    model: AudioModel,
    uninstall: bool,
    bandit_device: Option<BanditDevice>,
) -> Result<AudioModelStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = AUDIO_MODEL_LOCK
            .try_lock()
            .map_err(|_| "An audio model is busy.")?;
        #[cfg(target_os = "linux")]
        return manage_linux(&app, model, uninstall, bandit_device);
        #[cfg(not(target_os = "linux"))]
        {
            let root = model.legacy_directory();
            if uninstall {
                remove_install(&root)?;
            } else {
                let ffmpeg =
                    find_tool("ffmpeg").ok_or("Install FFmpeg in Settings → Must haves first.")?;
                install(
                    model,
                    &root,
                    &ffmpeg,
                    bandit_device.unwrap_or_else(|| active_bandit_device(&root)),
                    None,
                    |url, path| download_with_progress(&app, model.label(), url, path),
                    |message| emit_progress_detail(&app, model.label(), message.into(), None, None),
                )?;
            }
            Ok(status(model, &root))
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(target_os = "linux")]
fn manage_linux(
    app: &tauri::AppHandle,
    model: AudioModel,
    uninstall: bool,
    device: Option<BanditDevice>,
) -> Result<AudioModelStatus, String> {
    let source = audio_directory(model)?;
    if uninstall {
        managed(model, BanditDevice::Cpu)?.detach()?;
        if matches!(model, AudioModel::Bandit) {
            if let Ok(cuda) = managed(model, BanditDevice::Cuda) {
                cuda.detach()?;
            }
        }
        return audio_model_status(model);
    }
    let device = device.unwrap_or_else(|| active_bandit_device(&source));
    let runtime = managed(model, device)?;
    if crate::linux_runtimes::offline_import() && runtime.available() {
        return Ok(status(model, &runtime.selected(&source)));
    }
    let installation = runtime.begin()?;
    let ffmpeg = find_tool("ffmpeg").ok_or("Install FFmpeg using the system package manager.")?;
    let legacy = model.legacy_directory();
    let asset = match model {
        AudioModel::Bandit => BANDIT_MODEL,
        AudioModel::Deepfilter => "deep-filter",
    };
    crate::linux_runtimes::seed(&source, installation.path(), &[asset])?;
    crate::linux_runtimes::seed(&legacy, installation.path(), &[asset])?;
    let uv = match model {
        AudioModel::Bandit => Some(match crate::linux_runtimes::previous_uv() {
            Some(existing) => existing,
            None => crate::vosr::installer(app, installation.path())?,
        }),
        AudioModel::Deepfilter => None,
    };
    install(
        model, installation.path(), &ffmpeg, device, uv.as_deref(),
        |url, path| download_with_progress(app, model.label(), url, path),
        |message| emit_progress_detail(app, model.label(), message.into(), None, None),
    )?;
    if matches!(model, AudioModel::Bandit) {
        crate::linux_runtimes::seal_weight(&installation.path().join(BANDIT_MODEL))?;
    }
    let path = installation.publish()?;
    if matches!(model, AudioModel::Bandit) {
        crate::linux_runtimes::write_preference("bandit-device", device.argument())?;
    }
    Ok(status(model, &path))
}

fn remove_install(root: &Path) -> Result<(), String> {
    match fs::remove_dir_all(root) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn install(
    model: AudioModel,
    root: &Path,
    ffmpeg: &str,
    bandit_device: BanditDevice,
    uv: Option<&Path>,
    download: impl Fn(&str, &Path) -> Result<(), String>,
    report: impl Fn(&str),
) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|error| error.to_string())?;
    let ready_marker = match model {
        AudioModel::Bandit => bandit_device.ready_marker(root),
        AudioModel::Deepfilter => root.join("ready"),
    };
    if ready_marker.exists() {
        fs::remove_file(&ready_marker).map_err(|error| error.to_string())?;
    }
    match model {
        AudioModel::Bandit => {
            report(match bandit_device {
                BanditDevice::Cpu => "Checking Bandit CPU runtime",
                BanditDevice::Cuda => "Checking Bandit NVIDIA CUDA runtime",
            });
            ensure_bandit_runtime(root, bandit_device, uv)?;
            if !matches_sha256(&root.join(BANDIT_MODEL), BANDIT_HASH) {
                install_asset(
                    &download,
                    BANDIT_URL,
                    BANDIT_HASH,
                    &root.join(BANDIT_MODEL),
                    false,
                )?;
            }
            report("Loading and validating the Bandit checkpoint");
            checked(&mut bandit_command(root, bandit_device))?;
        }
        AudioModel::Deepfilter => {
            let (asset, digest) = deep_asset()?;
            let binary = deep_binary(root);
            if !matches_sha256(&binary, digest) {
                install_asset(
                    &download,
                    &format!("{DEEP_RELEASE}/{asset}"),
                    digest,
                    &binary,
                    true,
                )?;
            }
            report("Testing voice cleanup");
            let scratch = tempfile::tempdir_in(root).map_err(|error| error.to_string())?;
            let input = scratch.path().join("probe.wav");
            let result = scratch.path().join("enhanced.wav");
            checked(
                Command::new(ffmpeg)
                    .args([
                        "-v",
                        "error",
                        "-f",
                        "lavfi",
                        "-i",
                        "sine=frequency=440:sample_rate=48000",
                        "-t",
                        "1",
                        "-ac",
                        "2",
                    ])
                    .arg(&input),
            )?;
            clean_voice(root, ffmpeg, &input, &result, checked)?;
            verify_wav(&result)?;
            let duration = probe_audio(result.display().to_string())?.duration;
            if (duration - 1.0).abs() > 1.0 / 48_000.0 {
                return Err("DeepFilterNet smoke test returned the wrong duration.".into());
            }
        }
    }
    fs::write(ready_marker, b"").map_err(|error| error.to_string())?;
    if matches!(model, AudioModel::Bandit) {
        let mut device_file =
            tempfile::NamedTempFile::new_in(root).map_err(|error| error.to_string())?;
        std::io::Write::write_all(&mut device_file, bandit_device.argument().as_bytes())
            .map_err(|error| error.to_string())?;
        device_file
            .persist(root.join("device"))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn ensure_bandit_runtime(root: &Path, device: BanditDevice, installer: Option<&Path>) -> Result<(), String> {
    let torch_args = device.torch_install_args()?;
    let python = bandit_python(root, device);
    let marker = device.runtime_marker(root);
    if marker.is_file() && check_bandit_runtime(&python, device).is_ok() {
        return Ok(());
    }
    if device == BanditDevice::Cuda {
        if let Some(nvidia_smi) = find_tool("nvidia-smi") {
            checked(Command::new(nvidia_smi).arg("-L")).map_err(|error| {
                format!(
                    "NVIDIA CUDA requires a GPU visible to the app and a working driver. {error}"
                )
            })?;
        }
    }
    if marker.exists() {
        fs::remove_file(&marker).map_err(|error| error.to_string())?;
    }
    let env_dir = device.env_dir(root);
    remove_install(&env_dir)?;

    if cfg!(windows) {
        let conda =
            find_tool("conda").ok_or("Install Miniforge in Settings → Must haves first.")?;
        checked(
            Command::new(conda)
                .args(["create", "--yes", "--prefix"])
                .arg(&env_dir)
                .args([
                    "--override-channels",
                    "-c",
                    "conda-forge",
                    "python=3.12",
                    "pip",
                ]),
        )?;
        checked(
            Command::new(&python)
                .env("PIP_DEFAULT_TIMEOUT", "180")
                .args(["-m", "pip", "install"])
                .args(torch_args),
        )?;
        checked(Command::new(&python).args([
            "-m",
            "pip",
            "install",
            BANDIT_PACKAGE,
            "numpy==2.2.6",
            "soundfile==0.13.1",
        ]))?;
    } else {
        let uv = installer.map(Path::to_owned).or_else(|| find_tool("uv").map(PathBuf::from))
            .ok_or("The Python installer is unavailable.")?;
        let mut create = Command::new(&uv);
        let mut torch = Command::new(&uv);
        let mut dependencies = Command::new(&uv);
        #[cfg(target_os = "linux")]
        if installer.is_some() {
            for command in [&mut create, &mut torch, &mut dependencies] {
                crate::linux_runtimes::configure_uv(command)?;
            }
        }
        checked(create.args(["venv", "--python", "3.12"]).arg(&env_dir))?;
        checked(torch.args(["pip", "install", "--python"]).arg(&python)
            .env("UV_HTTP_TIMEOUT", "180").args(torch_args))?;
        checked(dependencies.args(["pip", "install", "--python"]).arg(&python)
            .args([BANDIT_PACKAGE, "numpy==2.2.6", "soundfile==0.13.1"]))?;
    }
    check_bandit_runtime(&python, device)?;
    fs::write(marker, b"").map_err(|error| error.to_string())
}

fn check_bandit_runtime(python: &Path, device: BanditDevice) -> Result<(), String> {
    let imports = "import soundfile, torch; from bandit_infer import BanditSession";
    let cuda_probe = format!(
        "{imports}; assert torch.version.cuda, 'CUDA PyTorch is required'; torch.zeros(1, device='cuda').item()"
    );
    checked(Command::new(python).args([
        "-I",
        "-c",
        if device == BanditDevice::Cuda {
            &cuda_probe
        } else {
            imports
        },
    ]))
}

fn bandit_command(root: &Path, device: BanditDevice) -> Command {
    let mut command = Command::new(bandit_python(root, device));
    command
        .args(["-I", "-B", "-c", include_str!("bandit_audio.py")])
        .arg(root.join(BANDIT_MODEL))
        .arg(BANDIT_HASH)
        .arg(device.argument());
    command
}

fn clean_voice(
    root: &Path,
    ffmpeg: &str,
    input: &Path,
    output: &Path,
    run: impl Fn(&mut Command) -> Result<(), String>,
) -> Result<(), String> {
    let duration = probe_audio(input.display().to_string())?.duration;
    if duration <= 0.0 {
        return Err("Could not determine the input audio duration.".into());
    }

    let scratch = tempfile::tempdir_in(output.parent().ok_or("Missing output directory.")?)
        .map_err(|error| error.to_string())?;
    let padded_input = scratch.path().join("padded.wav");
    let enhanced = scratch.path().join("enhanced");
    fs::create_dir(&enhanced).map_err(|error| error.to_string())?;

    // Delay compensation removes samples at the end. Pad first to retain the full selection.
    run(Command::new(ffmpeg)
        .args(["-v", "error", "-i"])
        .arg(input)
        .args(["-af", "apad=pad_dur=0.1"])
        .arg(&padded_input))?;
    run(Command::new(deep_binary(root))
        .args(["--compensate-delay", "--output-dir"])
        .arg(&enhanced)
        .arg(&padded_input))?;
    run(Command::new(ffmpeg)
        .args(["-v", "error", "-i"])
        .arg(enhanced.join("padded.wav"))
        .args(["-t", &format!("{duration:.6}")])
        .arg(output))
}

fn deep_asset() -> Result<(&'static str, &'static str), String> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("linux", "x86_64") => Ok((
            "deep-filter-0.5.6-x86_64-unknown-linux-musl",
            "70775e251eee44c0f2451a1e833326cf8bcbbe304d3e7cd12851e6fce72ef7da",
        )),
        ("windows", "x86_64") => Ok((
            "deep-filter-0.5.6-x86_64-pc-windows-msvc.exe",
            "75e11fa16445f560cb6b021521ddb89e89270d13b83089705d98776f58fd7915",
        )),
        _ => Err("The managed DeepFilterNet installer supports x86-64 Linux and Windows.".into()),
    }
}

fn matches_sha256(path: &Path, expected: &str) -> bool {
    fs::File::open(path)
        .and_then(|mut file| {
            let mut hash = Sha256::new();
            io::copy(&mut file, &mut hash)?;
            Ok(format!("{:x}", hash.finalize()) == expected)
        })
        .unwrap_or(false)
}

fn install_asset(
    download: impl Fn(&str, &Path) -> Result<(), String>,
    url: &str,
    digest: &str,
    destination: &Path,
    executable: bool,
) -> Result<(), String> {
    let root = destination.parent().ok_or("Missing install directory.")?;
    let staged = tempfile::NamedTempFile::new_in(root).map_err(|error| error.to_string())?;
    download(url, staged.path())?;
    if !matches_sha256(staged.path(), digest) {
        return Err(format!(
            "{} download did not match its SHA-256 checksum.",
            destination.display()
        ));
    }
    #[cfg(unix)]
    if executable {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(staged.path(), fs::Permissions::from_mode(0o755))
            .map_err(|error| error.to_string())?;
    }
    #[cfg(not(unix))]
    let _ = executable;
    staged
        .persist(destination)
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn checked(command: &mut Command) -> Result<(), String> {
    let output = command
        .output()
        .map_err(|error| format!("{:?}: {error}", command.get_program()))?;
    if output.status.success() {
        return Ok(());
    }
    let message = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let tail = message.lines().rev().take(12).collect::<Vec<_>>();
    Err(tail.into_iter().rev().collect::<Vec<_>>().join("\n"))
}

fn verify_wav(path: &Path) -> Result<(), String> {
    if fs::metadata(path).is_ok_and(|file| file.is_file() && file.len() > 44) {
        Ok(())
    } else {
        Err(format!("Missing or empty output: {}", path.display()))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AudioModelOutput {
    label: &'static str,
    path: String,
}

#[tauri::command]
pub(crate) async fn run_audio_model(
    app: tauri::AppHandle,
    model: AudioModel,
    options: AudioJobOptions,
    selection: bool,
) -> Result<AudioModelResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = AUDIO_MODEL_LOCK
            .try_lock()
            .map_err(|_| "An audio model is busy.")?;
        CANCEL_MODEL_JOB.store(false, Ordering::SeqCst);
        run_model(&app, model, options, selection)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[derive(Deserialize, Serialize)]
struct AudioProjectManifest {
    version: u32,
    name: String,
    stems: Vec<String>,
}

#[derive(Serialize)]
pub(crate) struct OpenedAudioProject {
    name: String,
    outputs: Vec<AudioModelOutput>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AudioModelResult {
    outputs: Vec<AudioModelOutput>,
    project_path: String,
}

fn write_audio_project(folder: &Path, name: &str, model: AudioModel) -> Result<PathBuf, String> {
    let project = AudioProjectManifest {
        version: 1,
        name: name.to_string(),
        stems: model
            .stems()
            .iter()
            .map(|(_, label)| stem_file_name(label))
            .collect(),
    };
    let path = folder.join(format!("{name}.audio-project.json"));
    let json = serde_json::to_vec_pretty(&project).map_err(|error| error.to_string())?;
    fs::write(&path, json).map_err(|error| error.to_string())?;
    Ok(path)
}

fn read_audio_project(path: &Path) -> Result<OpenedAudioProject, String> {
    let folder = path.parent().ok_or("Missing audio project folder.")?;
    let folder = fs::canonicalize(folder).map_err(|error| error.to_string())?;
    let file = fs::File::open(path).map_err(|error| error.to_string())?;
    let project: AudioProjectManifest = serde_json::from_reader(file.take(64 * 1024))
        .map_err(|error| format!("Invalid audio project: {error}"))?;
    if project.version != 1 {
        return Err("Unsupported audio project version.".into());
    }
    let model = [AudioModel::Bandit, AudioModel::Deepfilter]
        .into_iter()
        .find(|model| {
            model
                .stems()
                .iter()
                .map(|(_, label)| stem_file_name(label))
                .eq(project.stems.iter().cloned())
        })
        .ok_or("The project must reference the exported Bandit or Clean Voice WAV files.")?;

    let mut outputs = Vec::with_capacity(project.stems.len());
    for (&(_, label), file) in model.stems().iter().zip(project.stems) {
        let stem_path = fs::canonicalize(folder.join(&file))
            .map_err(|error| format!("Could not find {file} beside the audio project: {error}"))?;
        if stem_path.parent() != Some(folder.as_path()) {
            return Err(format!("{file} must be stored beside the audio project."));
        }
        verify_wav(&stem_path)?;
        outputs.push(AudioModelOutput {
            label,
            path: stem_path.display().to_string(),
        });
    }
    Ok(OpenedAudioProject {
        name: project.name,
        outputs,
    })
}

#[tauri::command]
pub(crate) async fn open_audio_project(
    app: tauri::AppHandle,
    path: String,
) -> Result<OpenedAudioProject, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let project = read_audio_project(Path::new(&path))?;
        let scope = app.asset_protocol_scope();
        for output in &project.outputs {
            scope
                .allow_file(&output.path)
                .map_err(|error| error.to_string())?;
        }
        Ok(project)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) fn cancel_audio_model() {
    CANCEL_MODEL_JOB.store(true, Ordering::SeqCst);
}

fn run_model(
    app: &tauri::AppHandle,
    model: AudioModel,
    options: AudioJobOptions,
    selection: bool,
) -> Result<AudioModelResult, String> {
    let root = audio_directory(model)?;
    if !status(model, &root).installed {
        return Err(format!(
            "Install or repair {} in Settings → Audio → Editing.",
            model.label()
        ));
    }
    let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
    if selection
        && (!options.trim_start.is_finite()
            || !options.trim_end.is_finite()
            || options.trim_end - options.trim_start < 0.001)
    {
        return Err("Select at least one millisecond of audio.".into());
    }

    let output_root = output_dir_for(OutputKind::Audio)?;
    let scratch = tempfile::tempdir_in(&output_root).map_err(|error| error.to_string())?;
    let input = scratch.path().join("input.wav");
    let original = Path::new(&options.input_path);
    emit_progress_detail(
        app,
        "Audio",
        "Preparing audio".into(),
        Some(5.0),
        Some("Preparing audio"),
    );
    let range = selection.then_some((options.trim_start, options.trim_end));
    run_child(&mut decode_audio(&ffmpeg, original, &input, range, false))?;
    verify_wav(&input)?;

    let results = scratch.path().join("results");
    fs::create_dir(&results).map_err(|error| error.to_string())?;
    let device = if matches!(model, AudioModel::Bandit) {
        active_bandit_device(&root)
    } else {
        BanditDevice::Cpu
    };
    emit_progress_detail(
        app,
        "Audio",
        format!(
            "Running {} on {}",
            model.label(),
            device.argument().to_uppercase()
        ),
        Some(15.0),
        Some("Processing audio"),
    );
    match model {
        AudioModel::Bandit => {
            run_child(bandit_command(&root, device).arg(&input).arg(&results))?;
        }
        AudioModel::Deepfilter => {
            clean_voice(
                &root,
                &ffmpeg,
                &input,
                &results.join("cleaned.wav"),
                run_child,
            )?;
            fs::rename(&input, results.join("original.wav")).map_err(|error| error.to_string())?;
        }
    }

    let output_name = audio_output_name(&options.output_name, original, "wav");
    let prefix = Path::new(&output_name)
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("audio");
    let publish = tempfile::Builder::new()
        .prefix(&format!("{prefix}_"))
        .tempdir_in(output_root)
        .map_err(|error| error.to_string())?;
    let mut outputs = Vec::with_capacity(model.stems().len());
    for &(file, label) in model.stems() {
        let source = results.join(file);
        verify_wav(&source)?;
        let destination = publish.path().join(stem_file_name(label));
        fs::rename(source, &destination).map_err(|error| error.to_string())?;
        app.asset_protocol_scope()
            .allow_file(&destination)
            .map_err(|error| error.to_string())?;
        outputs.push(AudioModelOutput {
            label,
            path: destination.display().to_string(),
        });
    }
    if CANCEL_MODEL_JOB.load(Ordering::SeqCst) {
        return Err("Audio job cancelled.".into());
    }
    let project_path = write_audio_project(publish.path(), prefix, model)?
        .display()
        .to_string();
    let _ = publish.keep();
    emit_progress_detail(
        app,
        "Audio",
        "Complete".into(),
        Some(100.0),
        Some("Complete"),
    );
    Ok(AudioModelResult {
        outputs,
        project_path,
    })
}

fn decode_audio(
    ffmpeg: &str,
    source: &Path,
    output: &Path,
    range: Option<(f64, f64)>,
    preserve_channels: bool,
) -> Command {
    let mut decode = Command::new(ffmpeg);
    decode.args(["-v", "error", "-nostdin", "-y"]);
    if let Some((start, end)) = range {
        add_trim_args(&mut decode, start, end);
    }
    decode
        .arg("-i")
        .arg(source)
        .args(["-map", "0:a:0", "-ar", "48000"]);
    if !preserve_channels {
        decode.args(["-af", "aformat=channel_layouts=mono|stereo"]);
    }
    decode.args(["-c:a", "pcm_s16le"]).arg(output);
    decode
}

#[tauri::command]
pub(crate) async fn audio_playback_url(
    app: tauri::AppHandle,
    path: String,
) -> Result<Option<String>, String> {
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(|error| error.to_string())?;
    #[cfg(target_os = "linux")]
    {
        crate::video_preview_stream::audio_url(PathBuf::from(path))
            .await
            .map(Some)
            .map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(None)
    }
}

#[tauri::command]
pub(crate) async fn prepare_video_audio(
    app: tauri::AppHandle,
    path: String,
    preserve_channels: Option<bool>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = AUDIO_MODEL_LOCK
            .try_lock()
            .map_err(|_| "An audio model is busy.")?;
        let ffmpeg = find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
        let temp_root = workspace_root().join(crate::get_app_settings()?.temp_folder);
        fs::create_dir_all(&temp_root).map_err(|error| error.to_string())?;
        let output = tempfile::Builder::new()
            .suffix(".wav")
            .tempfile_in(temp_root)
            .map_err(|error| error.to_string())?
            .into_temp_path();
        checked(&mut decode_audio(
            &ffmpeg,
            Path::new(&path),
            &output,
            None,
            preserve_channels.unwrap_or_default(),
        ))?;
        verify_wav(&output)?;
        app.asset_protocol_scope()
            .allow_file(&output)
            .map_err(|error| error.to_string())?;
        let display_path = output.display().to_string();
        *app.state::<VideoAudioPreview>()
            .0
            .lock()
            .map_err(|_| "Video audio preview is unavailable.")? = Some(output);
        Ok(display_path)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn run_child(command: &mut Command) -> Result<(), String> {
    let mut log = tempfile::tempfile().map_err(|error| error.to_string())?;
    let stderr = log.try_clone().map_err(|error| error.to_string())?;
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(stderr)
        .spawn()
        .map_err(|error| format!("{:?}: {error}", command.get_program()))?;
    loop {
        if CANCEL_MODEL_JOB.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Audio job cancelled.".into());
        }
        match child.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(()),
            Ok(Some(status)) => {
                use std::io::{Seek, SeekFrom};
                let start = log
                    .metadata()
                    .map(|file| file.len().saturating_sub(4096))
                    .unwrap_or(0);
                let _ = log.seek(SeekFrom::Start(start));
                let mut bytes = Vec::new();
                let _ = log.read_to_end(&mut bytes);
                return Err(format!(
                    "{:?} exited with {status}: {}",
                    command.get_program(),
                    String::from_utf8_lossy(&bytes).trim()
                ));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error.to_string());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_project_reopens_after_moving_and_reports_missing_stem() {
        let root = tempfile::tempdir().unwrap();
        let original = root.path().join("original");
        let moved = root.path().join("moved");
        fs::create_dir(&original).unwrap();
        for (_, label) in BANDIT_STEMS {
            fs::write(original.join(format!("{label}.wav")), [0; 64]).unwrap();
        }
        let manifest = write_audio_project(&original, "sample", AudioModel::Bandit).unwrap();
        fs::rename(&original, &moved).unwrap();
        let manifest = moved.join(manifest.file_name().unwrap());
        let reopened = read_audio_project(&manifest).unwrap();
        assert_eq!(reopened.name, "sample");
        assert_eq!(
            reopened
                .outputs
                .iter()
                .map(|stem| stem.label)
                .collect::<Vec<_>>(),
            ["Dialogue", "Music", "Effects"]
        );
        assert!(reopened
            .outputs
            .iter()
            .all(|stem| Path::new(&stem.path).starts_with(&moved.canonicalize().unwrap())));
        fs::remove_file(moved.join("Music.wav")).unwrap();
        assert!(read_audio_project(&manifest)
            .err()
            .unwrap()
            .contains("Music.wav"));
    }

    #[test]
    fn clean_voice_project_reopens_original_and_cleaned() {
        let folder = tempfile::tempdir().unwrap();
        for (_, label) in CLEAN_VOICE_STEMS {
            fs::write(folder.path().join(stem_file_name(label)), [0; 64]).unwrap();
        }
        let manifest =
            write_audio_project(folder.path(), "dialogue", AudioModel::Deepfilter).unwrap();
        let reopened = read_audio_project(&manifest).unwrap();
        assert_eq!(
            reopened
                .outputs
                .iter()
                .map(|track| track.label)
                .collect::<Vec<_>>(),
            ["Original", "Cleaned"]
        );
        assert!(reopened.outputs[1].path.ends_with("Clean Voice.wav"));
        fs::remove_file(folder.path().join("Original.wav")).unwrap();
        assert!(read_audio_project(&manifest)
            .err()
            .unwrap()
            .contains("Original.wav"));
    }

    // Supply the unmodified upstream Linux assets in VIDEOMAXXING_AUDIO_TEST_ASSETS.
    // The Bandit case provisions the same isolated Python runtime used by Settings.
    fn exercise_install(model: AudioModel, asset_name: &str, installed_file: &str) {
        let assets = PathBuf::from(std::env::var_os("VIDEOMAXXING_AUDIO_TEST_ASSETS").unwrap());
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().join("tool");
        let ffmpeg = find_tool("ffmpeg").unwrap();
        let downloads = std::cell::Cell::new(0);
        let download = |_url: &str, path: &Path| {
            downloads.set(downloads.get() + 1);
            fs::copy(assets.join(asset_name), path)
                .map(|_| ())
                .map_err(|error| error.to_string())
        };
        let report = |message: &str| eprintln!("{message}");

        assert!(!status(model, &root).has_files);
        let bad_download = |_: &str, path: &Path| {
            fs::write(path, b"partial download").map_err(|error| error.to_string())
        };
        let error = install(
            model,
            &root,
            &ffmpeg,
            BanditDevice::Cpu,
            None,
            bad_download,
            report,
        )
        .unwrap_err();
        assert!(error.contains("checksum"), "{error}");
        assert!(!status(model, &root).installed);
        assert!(!root.join(installed_file).exists());

        install(model, &root, &ffmpeg, BanditDevice::Cpu, None, download, report).unwrap();
        assert!(status(model, &root).installed);
        assert_eq!(downloads.get(), 1);

        fs::write(root.join(installed_file), b"damaged asset").unwrap();
        install(model, &root, &ffmpeg, BanditDevice::Cpu, None, download, report).unwrap();
        assert!(status(model, &root).installed);
        assert_eq!(downloads.get(), 2);

        remove_install(&root).unwrap();
        assert!(!status(model, &root).has_files);
        remove_install(&root).unwrap();
    }

    #[test]
    #[ignore = "requires the official Bandit weight fixture and access to runtime packages"]
    fn bandit_install_repair_uninstall() {
        exercise_install(AudioModel::Bandit, BANDIT_MODEL, BANDIT_MODEL);
    }

    #[test]
    #[ignore = "requires the official Linux DeepFilterNet binary fixture"]
    fn deepfilter_install_repair_uninstall() {
        exercise_install(AudioModel::Deepfilter, "deep-filter", "deep-filter");
    }

    #[test]
    #[ignore = "requires NVIDIA CUDA and the official Bandit weight fixture"]
    fn bandit_cuda_separates_video_audio_into_three_stems() {
        let assets = PathBuf::from(std::env::var_os("VIDEOMAXXING_AUDIO_TEST_ASSETS").unwrap());
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().join("tool");
        let ffmpeg = find_tool("ffmpeg").unwrap();
        install(
            AudioModel::Bandit,
            &root,
            &ffmpeg,
            BanditDevice::Cuda,
            None,
            |url, path| {
                assert_eq!(url, BANDIT_URL);
                fs::copy(assets.join(BANDIT_MODEL), path)
                    .map(|_| ())
                    .map_err(|error| error.to_string())
            },
            |message| eprintln!("{message}"),
        )
        .unwrap();
        let installed = status(AudioModel::Bandit, &root);
        assert!(installed.installed && installed.bandit_device == Some(BanditDevice::Cuda));
        assert!(!BanditDevice::Cpu.env_dir(&root).exists());

        let video = temporary.path().join("test.mp4");
        checked(
            Command::new(&ffmpeg)
                .args([
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "color=s=160x90:r=10",
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=frequency=440:sample_rate=44100",
                    "-map",
                    "0:v:0",
                    "-map",
                    "1:a:0",
                    "-t",
                    "1",
                    "-c:v",
                    "mpeg4",
                    "-c:a",
                    "aac",
                    "-ac",
                    "2",
                ])
                .arg(&video),
        )
        .unwrap();
        let audio = temporary.path().join("input.wav");
        checked(&mut decode_audio(&ffmpeg, &video, &audio, None, false)).unwrap();
        let input = probe_audio(audio.display().to_string()).unwrap();
        assert_eq!(input.sample_rate, 48_000);
        assert_eq!(input.channels, 2);
        let results = temporary.path().join("results");
        fs::create_dir(&results).unwrap();
        let start = std::time::Instant::now();
        checked(
            bandit_command(&root, BanditDevice::Cuda)
                .arg(&audio)
                .arg(&results),
        )
        .unwrap();

        let mut distinct_stems = std::collections::HashSet::new();
        for (file, label) in BANDIT_STEMS {
            let path = results.join(file);
            let stem = probe_audio(path.display().to_string()).unwrap();
            assert_eq!(stem.sample_rate, input.sample_rate, "{label}");
            assert_eq!(stem.channels, input.channels, "{label}");
            assert!(
                (stem.duration - input.duration).abs() <= 1.0 / 48_000.0,
                "{label}"
            );
            verify_wav(&path).unwrap();
            distinct_stems.insert(Sha256::digest(fs::read(path).unwrap()));
            eprintln!(
                "{label}: {} Hz, {} channels, {:.3}s",
                stem.sample_rate, stem.channels, stem.duration
            );
        }
        assert_eq!(distinct_stems.len(), BANDIT_STEMS.len());
        eprintln!(
            "CUDA separation completed in {:.2}s",
            start.elapsed().as_secs_f64()
        );
        remove_install(&root).unwrap();
        assert!(!status(AudioModel::Bandit, &root).has_files);
    }
}
