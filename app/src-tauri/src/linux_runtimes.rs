//! Shared Linux installations, published only after the tool verifies a generation.
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    process::Command,
};

const APP_ID: &str = "com.w2ds.videomaxxxing";

fn user_dir(variable: &str, fallback: &str) -> Result<PathBuf, String> {
    std::env::var_os(variable)
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(fallback)))
        .ok_or_else(|| format!("Neither {variable} nor HOME identifies a user directory."))
}

pub fn store() -> Result<PathBuf, String> {
    let config = user_dir("XDG_CONFIG_HOME", ".config")?
        .join(APP_ID)
        .join("runtime-root");
    match fs::read_to_string(&config) {
        Ok(value) => {
            let path = PathBuf::from(value.trim());
            if !path.is_absolute() || !path.is_dir() {
                return Err(format!(
                    "The Xtudio runtime store is unavailable at {}. Mount the drive or update {}.",
                    path.display(),
                    config.display()
                ));
            }
            Ok(path)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            Ok(user_dir("XDG_DATA_HOME", ".local/share")?
                .join(APP_ID)
                .join("runtime-store"))
        }
        Err(error) => Err(format!("Cannot read {}: {error}", config.display())),
    }
}

pub fn migration_source() -> Option<PathBuf> {
    std::env::args_os().skip(1).find_map(|arg| {
        let arg = arg.to_str()?;
        arg.strip_prefix("--migrate-linux-runtimes=")
            .map(PathBuf::from)
    })
}

pub fn offline_import() -> bool {
    migration_source().is_some()
}

pub fn legacy_checkout() -> PathBuf {
    migration_source()
        .or_else(|| {
            fs::read_to_string(store().ok()?.join("legacy-checkout"))
                .ok()
                .map(PathBuf::from)
        })
        .filter(|path| path.is_absolute() && path.join("tools").is_dir())
        .unwrap_or_else(crate::workspace_root)
}

pub fn staging() -> bool {
    std::env::var_os("VIDEOMAXXING_STAGING_PROFILE").is_some()
}

fn profile_id() -> String {
    let workspace = crate::workspace_root();
    let canonical = workspace.canonicalize().unwrap_or(workspace);
    digest(canonical.as_os_str().as_encoded_bytes())
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn preference_path(name: &str) -> Result<PathBuf, String> {
    Ok(store()?
        .join("profiles")
        .join(profile_id())
        .join(if staging() { "staging" } else { "dev" })
        .join(name))
}

pub fn preference(name: &str) -> Option<String> {
    fs::read_to_string(preference_path(name).ok()?).ok()
}

pub fn write_preference(name: &str, value: &str) -> Result<(), String> {
    atomic(&preference_path(name)?, value.as_bytes())
}

pub fn profile_data(tool: &str, recipe: &str) -> Result<PathBuf, String> {
    Ok(preference_path(tool)?.join(digest(recipe.as_bytes())))
}

pub fn whisperx_assets() -> Result<PathBuf, String> {
    Ok(store()?.join("assets/whisperx-public"))
}

pub fn configure_uv(command: &mut Command) -> Result<(), String> {
    let root = store()?;
    command
        .env("UV_CACHE_DIR", root.join("uv/cache"))
        .env("UV_PYTHON_INSTALL_DIR", root.join("uv/python"))
        .env("UV_LINK_MODE", "hardlink");
    if offline_import() {
        command
            .env("UV_OFFLINE", "1")
            .env("HF_HUB_OFFLINE", "1")
            .env("TRANSFORMERS_OFFLINE", "1")
            .env("XTUDIO_OFFLINE_IMPORT", "1");
    }
    Ok(())
}

pub fn file_lock(path: &Path) -> Result<File, String> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .map_err(|e| format!("Cannot open {}: {e}", path.display()))?;
    file.try_lock()
        .map_err(|_| format!("A tool operation is already using {}.", path.display()))?;
    Ok(file)
}

pub struct Runtime {
    primary: PathBuf,
    profile: PathBuf,
    staging: bool,
}

impl Runtime {
    pub fn new(tool: &str, recipe: &str) -> Result<Self, String> {
        Ok(Self::at(&store()?, &profile_id(), staging(), tool, recipe))
    }

    fn at(root: &Path, profile: &str, staging: bool, tool: &str, recipe: &str) -> Self {
        let platform = format!("linux-{}", std::env::consts::ARCH);
        let relative = PathBuf::from(platform)
            .join(tool)
            .join(digest(recipe.as_bytes()));
        Self {
            primary: root.join("tools").join(&relative),
            profile: root
                .join("profiles")
                .join(profile)
                .join(if staging { "staging" } else { "dev" })
                .join(relative),
            staging,
        }
    }

    pub fn available(&self) -> bool {
        generation(&self.primary).is_some()
    }

    pub fn selected(&self, legacy: &Path) -> PathBuf {
        if self.profile.join("detached").exists() {
            return self.profile.join("uninstalled");
        }
        let candidate = self.staging.then(|| generation(&self.profile)).flatten();
        candidate
            .or_else(|| generation(&self.primary))
            .unwrap_or_else(|| {
                if self.staging {
                    self.profile.join("uninstalled")
                } else {
                    legacy.to_owned()
                }
            })
    }

    fn destination(&self) -> &Path {
        if self.staging {
            &self.profile
        } else {
            &self.primary
        }
    }

    pub fn detach(&self) -> Result<(), String> {
        let location = self.destination();
        fs::create_dir_all(location).map_err(|e| e.to_string())?;
        let _lock = file_lock(&location.join("install.lock"))?;
        atomic(&self.profile.join("detached"), b"")
    }

    pub fn begin(&self) -> Result<Installation, String> {
        let location = self.destination();
        let generations = location.join("generations");
        fs::create_dir_all(&generations).map_err(|e| format!("{}: {e}", generations.display()))?;
        let lock = file_lock(&location.join("install.lock"))?;
        let directory = match referenced_generation(location, "pending") {
            Some(path) if generation(location).as_ref() != Some(&path) => path,
            _ => {
                let directory = tempfile::Builder::new()
                    .prefix("install-")
                    .tempdir_in(&generations)
                    .map_err(|e| e.to_string())?
                    .keep();
                atomic(
                    &location.join("pending"),
                    directory.file_name().unwrap().as_encoded_bytes(),
                )?;
                directory
            }
        };
        Ok(Installation {
            location: location.to_owned(),
            detached: self.profile.join("detached"),
            directory,
            _lock: lock,
        })
    }
}

fn generation(location: &Path) -> Option<PathBuf> {
    referenced_generation(location, "active").filter(|path| path.join(".verified").is_file())
}

fn referenced_generation(location: &Path, pointer: &str) -> Option<PathBuf> {
    let name = fs::read_to_string(location.join(pointer)).ok()?;
    let name = name.trim();
    if !name.starts_with("install-")
        || !name
            .bytes()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == b'-')
    {
        return None;
    }
    let path = location.join("generations").join(name);
    path.is_dir().then_some(path)
}

pub struct Installation {
    location: PathBuf,
    detached: PathBuf,
    directory: PathBuf,
    _lock: File,
}

impl Installation {
    pub fn path(&self) -> &Path {
        &self.directory
    }

    pub fn publish(self) -> Result<PathBuf, String> {
        for dir in ["models", "checkpoints"] {
            seal_weights(&self.path().join(dir))?;
        }
        atomic(&self.path().join(".verified"), b"")?;
        let name = self.path().file_name().unwrap().to_owned();
        let path = self.directory;
        atomic(&self.location.join("active"), name.as_encoded_bytes())?;
        match fs::remove_file(self.detached) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
        Ok(path)
    }
}

pub fn atomic(path: &Path, content: &[u8]) -> Result<(), String> {
    let parent = path.parent().unwrap();
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temp.write_all(content).map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Copy inputs into an independent generation. Symlinked directories are skipped.
pub fn seed(source: &Path, target: &Path, entries: &[&str]) -> Result<(), String> {
    for entry in entries {
        if *entry == "." {
            copy_entry(source, target)?;
        } else {
            copy_entry(&source.join(entry), &target.join(entry))?;
        }
    }
    Ok(())
}

fn copy_entry(source: &Path, target: &Path) -> Result<(), String> {
    let metadata = match fs::symlink_metadata(source) {
        Ok(metadata) => metadata,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(format!("Cannot read {}: {e}", source.display())),
    };
    if metadata.is_dir() {
        fs::create_dir_all(target)
            .map_err(|e| format!("Cannot create {}: {e}", target.display()))?;
        for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            copy_entry(&entry.path(), &target.join(entry.file_name()))?;
        }
    } else if source.is_file() && !target.exists() {
        fs::create_dir_all(target.parent().unwrap()).map_err(|e| e.to_string())?;
        let temporary = tempfile::NamedTempFile::new_in(target.parent().unwrap()).map_err(|e| {
            format!(
                "Cannot create a temporary file for {}: {e}",
                target.display()
            )
        })?;
        fs::copy(source, temporary.path())
            .map_err(|e| format!("Cannot reuse {}: {e}", source.display()))?;
        match temporary.persist_noclobber(target) {
            Ok(_) => {}
            Err(e) if e.error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(e) => return Err(format!("Cannot publish {}: {e}", target.display())),
        }
    }
    Ok(())
}

pub fn require_probe(log: &str, flags: &[&str]) -> Result<(), String> {
    let probe = log
        .lines()
        .rev()
        .find_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .ok_or("The Linux runtime returned no verification result.")?;
    for flag in flags {
        if probe[*flag].as_bool() != Some(true) {
            return Err(format!(
                "Linux runtime verification failed ({flag}). Previous installs remain available."
            ));
        }
    }
    Ok(())
}

fn file_digest(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let size = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if size == 0 {
            return Ok(format!("{:x}", hasher.finalize()));
        }
        hasher.update(&buffer[..size]);
    }
}

fn store_blob(source: &Path, hash: &str) -> Result<PathBuf, String> {
    let dir = store()?.join("assets/sha256");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(hash);
    if path.is_file() {
        if file_digest(&path)? != hash {
            return Err(format!(
                "The cached model failed checksum verification at {}.",
                path.display()
            ));
        }
    } else {
        use std::os::unix::fs::PermissionsExt;
        let mut temporary = tempfile::NamedTempFile::new_in(&dir).map_err(|e| e.to_string())?;
        io::copy(
            &mut File::open(source).map_err(|e| e.to_string())?,
            &mut temporary,
        )
        .map_err(|e| e.to_string())?;
        temporary
            .as_file()
            .set_permissions(fs::Permissions::from_mode(0o400))
            .map_err(|e| e.to_string())?;
        temporary.as_file().sync_all().map_err(|e| e.to_string())?;
        match temporary.persist_noclobber(&path) {
            Ok(_) => {}
            Err(e) if e.error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(path)
}

fn seal_weights(dir: &Path) -> Result<(), String> {
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        if ty.is_dir() {
            seal_weights(&path)?;
        } else if ty.is_file()
            && matches!(
                path.extension().and_then(|ext| ext.to_str()),
                Some("safetensors" | "ckpt" | "pth" | "onnx" | "bin")
            )
        {
            seal_weight(&path)?;
        }
    }
    Ok(())
}

pub fn seal_weight(path: &Path) -> Result<(), String> {
    let hash = file_digest(path)?;
    let blob = store_blob(path, &hash)?;
    let temporary = tempfile::tempdir_in(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let link = temporary.path().join("weight");
    fs::hard_link(blob, &link).map_err(|e| e.to_string())?;
    fs::rename(link, path).map_err(|e| e.to_string())
}

pub fn validate_uv(path: &Path) -> Result<(), String> {
    const LINUX_X64_UV: &str = "040491bf5feb28ce7409dfc2f9aa1532aeb569aba70f61bd4d3ddb2386d13350";
    if file_digest(path)? != LINUX_X64_UV {
        return Err(format!(
            "The shared uv installer failed verification at {}.",
            path.display()
        ));
    }
    Ok(())
}

fn import_assets(source: &Path) -> Result<(), String> {
    if !source.is_absolute() || !source.join("tools").is_dir() {
        return Err("Provide an absolute path to the original Xtudio checkout.".into());
    }
    let root = store()?;
    let local = user_dir("XDG_DATA_HOME", ".local/share")?.join(APP_ID);
    let caches = user_dir("XDG_CACHE_HOME", ".cache")?;
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let _guard = file_lock(&root.join("migration.lock"))?;
    atomic(
        &root.join("legacy-checkout"),
        source.as_os_str().as_encoded_bytes(),
    )?;
    for runtime in [
        local.join("shared/vosr"),
        local.join("shared/supir"),
        local.join("transcription"),
    ] {
        seed(&runtime.join("python"), &root.join("uv/python"), &["."])?;
        for candidate in [runtime.join("cache/uv"), runtime.join("cache")] {
            import_uv_cache(&candidate, &root.join("uv/cache"))?;
        }
    }
    seed(
        &user_dir("XDG_DATA_HOME", ".local/share")?.join("uv/python"),
        &root.join("uv/python"),
        &["."],
    )?;
    import_uv_cache(&caches.join("uv"), &root.join("uv/cache"))?;
    let speech = whisperx_assets()?;
    seed(
        &local.join("transcription"),
        &speech,
        &["models", "alignment", "torch", "nltk"],
    )?;
    restrict_directory_tree(&speech.join("nltk"))?;
    atomic(&speech.join(".imported"), b"")?;
    let uv_path = "uv-x86_64-unknown-linux-gnu/uv";
    for candidate in [
        local.join("shared/vosr/installer"),
        local.join("transcription/installer"),
    ] {
        if validate_uv(&candidate.join(uv_path)).is_ok() {
            seed(&candidate, &root.join("uv/0.9.10"), &[uv_path])?;
            break;
        }
    }
    let wan = source.join("tools/wan21/models/Wan2.1-T2V-1.3B/models_t5_umt5-xxl-enc-bf16.pth");
    const WAN_ENCODER: &str = "7cace0da2b446bbbbc57d031ab6cf163a3d59b366da94e5afe36745b746fd81d";
    if wan.is_file() {
        if file_digest(&wan)? != WAN_ENCODER {
            return Err(format!(
                "Wan text encoder checksum did not match: {}",
                wan.display()
            ));
        }
        let blob = store_blob(&wan, WAN_ENCODER)?;
        let name = root.join("assets/wan/models_t5_umt5-xxl-enc-bf16.pth");
        fs::create_dir_all(name.parent().unwrap()).map_err(|e| e.to_string())?;
        if !name.exists() {
            fs::hard_link(blob, &name).map_err(|e| e.to_string())?;
        }
        eprintln!("Verified shared Wan text encoder at {}", name.display());
    }
    Ok(())
}

// NLTK checks every directory below NLTK_DATA for privileged writes.
fn restrict_directory_tree(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    if !path.is_dir() {
        return Ok(());
    }
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|e| format!("Cannot secure {}: {e}", path.display()))?;
    for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            restrict_directory_tree(&entry.path())?;
        }
    }
    Ok(())
}

/// Bandit's old cache was written by the user's uv. During offline import
/// only, use that same cache reader when available. New setups use the pinned
/// shared bootstrap.
pub fn previous_uv() -> Option<PathBuf> {
    if offline_import() {
        crate::find_tool("uv").map(PathBuf::from).or_else(|| {
            std::env::var_os("HOME")
                .map(|home| PathBuf::from(home).join(".local/bin/uv"))
                .filter(|path| path.is_file())
        })
    } else {
        None
    }
}

fn import_uv_cache(source: &Path, target: &Path) -> Result<(), String> {
    if !source.join("archive-v0").is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        if entry.file_type().map_err(|e| e.to_string())?.is_dir()
            && !name.as_encoded_bytes().starts_with(b".")
        {
            copy_entry(&entry.path(), &target.join(name))?;
        }
    }
    Ok(())
}

pub async fn migrate(app: tauri::AppHandle, source: PathBuf) -> Result<(), String> {
    if staging() {
        return Err("Run migration outside the staging profile.".into());
    }
    tauri::async_runtime::spawn_blocking(move || import_assets(&source))
        .await
        .map_err(|error| error.to_string())??;
    let mut deferred = Vec::new();
    for (name, device) in [
        ("DeepFilterNet", None),
        ("Bandit CUDA", Some(crate::audio_models::BanditDevice::Cuda)),
    ] {
        let model = if device.is_some() {
            crate::audio_models::AudioModel::Bandit
        } else {
            crate::audio_models::AudioModel::Deepfilter
        };
        report(
            name,
            crate::audio_models::manage_audio_model(app.clone(), model, false, device).await,
            &mut deferred,
        );
    }
    let handle = app.clone();
    let result =
        tauri::async_runtime::spawn_blocking(move || crate::realesrgan::install(&handle, &[]))
            .await
            .map_err(|e| e.to_string())?;
    report("Real-ESRGAN", result, &mut deferred);
    for device in ["cpu", "cuda"] {
        report(
            &format!("WhisperX {device}"),
            crate::transcription::setup_transcription(
                app.clone(),
                device.into(),
                "turbo".into(),
                "en".into(),
            )
            .await,
            &mut deferred,
        );
    }
    report(
        "VOSR",
        crate::vosr::install_vosr(app.clone()).await,
        &mut deferred,
    );
    let result = tauri::async_runtime::spawn_blocking(move || crate::supir::install(&app))
        .await
        .map_err(|e| e.to_string())?;
    report("SUPIR", result, &mut deferred);
    if deferred.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Existing installations retained for: {}.",
            deferred.join(", ")
        ))
    }
}

fn report<T>(name: &str, result: Result<T, String>, deferred: &mut Vec<String>) {
    match result {
        Ok(_) => eprintln!("Verified and published {name}."),
        Err(error) => {
            eprintln!("{name} could not be imported offline: {error}");
            deferred.push(name.into());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn concurrent_and_interrupted_installs_keep_the_active_generation() {
        let disk = tempfile::tempdir().unwrap();
        let tool = Runtime::at(disk.path(), "main", false, "bandit", "cuda-a");
        let legacy = disk.path().join("legacy");
        let first = tool.begin().unwrap();
        assert!(tool.begin().is_err());
        assert_eq!(tool.selected(&legacy), legacy);
        let active = first.publish().unwrap();
        let second = tool.begin().unwrap();
        assert_eq!(tool.selected(&legacy), active);
        let pending = second.path().to_owned();
        drop(second);
        assert_eq!(tool.begin().unwrap().path(), pending);
        let other = Runtime::at(disk.path(), "other", false, "bandit", "cuda-a");
        assert_eq!(other.selected(&legacy), active);
        let cpu = Runtime::at(disk.path(), "main", false, "bandit", "cpu-a");
        assert_eq!(cpu.selected(&legacy), legacy);
    }

    #[test]
    fn staging_does_not_replace_primary_publication() {
        let disk = tempfile::tempdir().unwrap();
        let primary = Runtime::at(disk.path(), "main", false, "bandit", "cuda-a");
        let staging = Runtime::at(disk.path(), "staging", true, "bandit", "cuda-a");
        let legacy = disk.path().join("legacy");
        let original = primary.begin().unwrap().publish().unwrap();
        assert_eq!(staging.selected(&legacy), original);
        let candidate = staging.begin().unwrap().publish().unwrap();
        assert_eq!(staging.selected(&legacy), candidate);
        staging.detach().unwrap();
        assert!(!staging.selected(&legacy).exists());
        assert!(candidate.exists());
        assert_eq!(primary.selected(&legacy), original);
    }
}
