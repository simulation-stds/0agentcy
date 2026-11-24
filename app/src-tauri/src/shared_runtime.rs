//! Optional machine-local routing of managed Python tools to shared package storage.
use std::{path::Path, process::Command};
#[cfg(not(target_os = "linux"))]
use {serde_json::Value, std::fs};

#[cfg(target_os = "linux")]
pub fn configure(_: &Path, _: &mut Command) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "linux"))]
pub fn configure(workspace: &Path, command: &mut Command) -> Result<(), String> {
    let config_path = workspace.join("shared-runtimes.local.json");
    if !config_path.is_file() {
        return Ok(());
    }
    let args: Vec<_> = command
        .get_args()
        .map(|a| a.to_string_lossy().into_owned())
        .collect();
    if !matches!(
        args.first().map(String::as_str),
        Some("run" | "create" | "env")
    ) {
        return Ok(());
    }
    let Some(index) = args.iter().position(|a| a == "-n" || a == "--name") else {
        return Ok(());
    };
    let Some(profile) = args.get(index + 1) else {
        return Ok(());
    };
    let config: Value = serde_json::from_slice(&fs::read(&config_path).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Invalid shared runtime configuration: {e}"))?;
    let manifest_path = config["manifest"]
        .as_str()
        .ok_or("Shared runtime manifest path is missing")?;
    let manifest: Value =
        serde_json::from_slice(&fs::read(manifest_path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    if manifest["profiles"][profile]["enabled"].as_bool() != Some(true) {
        return Ok(());
    }
    let python = manifest["manager_python"]
        .as_str()
        .ok_or("Shared runtime manager Python is missing")?;
    let manager = manifest["manager_script"]
        .as_str()
        .ok_or("Shared runtime manager script is missing")?;
    if !Path::new(python).is_file() || !Path::new(manager).is_file() {
        return Err("Shared runtime manager is unavailable; restore its installation or disable this profile in the manifest".into());
    }
    let mut replacement = Command::new(python);
    replacement
        .arg(manager)
        .arg("--manifest")
        .arg(manifest_path)
        .arg("--conda")
        .args(&args);
    if let Some(dir) = command.get_current_dir() {
        replacement.current_dir(dir);
    }
    for (key, value) in command.get_envs() {
        if let Some(value) = value {
            replacement.env(key, value);
        } else {
            replacement.env_remove(key);
        }
    }
    *command = replacement;
    Ok(())
}
