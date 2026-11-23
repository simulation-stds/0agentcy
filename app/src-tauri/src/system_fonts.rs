//! Per-user OS font installation, shared with other desktop applications.
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
fn owned_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('.')
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
        && matches!(
            Path::new(name).extension().and_then(|s| s.to_str()),
            Some("ttf" | "otf")
        )
}
pub(crate) fn directory(id: &str) -> Result<PathBuf, String> {
    if id.is_empty()
        || !id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
    {
        return Err("Invalid font identifier".into());
    }
    #[cfg(target_os = "linux")]
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| std::env::var_os("HOME").map(|p| PathBuf::from(p).join(".local/share")))
        .ok_or("Could not locate the user font folder")?
        .join("fonts");
    #[cfg(target_os = "windows")]
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .ok_or("Could not locate the user font folder")?
        .join("Microsoft/Windows/Fonts");
    #[cfg(target_os = "macos")]
    let base = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or("Could not locate the user font folder")?
        .join("Library/Fonts");
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    return Err("Desktop font installation is not supported on this platform".into());
    #[cfg(any(target_os = "linux", target_os = "windows", target_os = "macos"))]
    Ok(base.join("SimulationStudio").join(id))
}
fn copy_owned(source: &Path, target: &Path, files: &[String]) -> Result<Vec<PathBuf>, String> {
    fs::create_dir_all(target)
        .map_err(|e| format!("Could not create the user font folder: {e}"))?;
    let mut created = Vec::new();
    let result = (|| {
        for name in files {
            if !owned_name(name) {
                return Err("Invalid desktop font filename".into());
            }
            let bytes = fs::read(source.join(name)).map_err(|e| e.to_string())?;
            if !(bytes.starts_with(&[0, 1, 0, 0])
                || bytes.starts_with(b"OTTO")
                || bytes.starts_with(b"true"))
            {
                return Err("Invalid desktop font data".into());
            }
            let path = target.join(name);
            if path.exists() {
                if fs::read(&path).map_err(|e| e.to_string())? != bytes {
                    return Err("A different font file already exists at the installation path; it was not replaced.".into());
                }
                continue;
            }
            use std::io::Write;
            let mut file = tempfile::NamedTempFile::new_in(target).map_err(|e| e.to_string())?;
            file.write_all(&bytes).map_err(|e| e.to_string())?;
            file.persist_noclobber(&path).map_err(|e| e.to_string())?;
            created.push(path);
        }
        Ok(())
    })();
    if let Err(error) = result {
        for path in &created {
            let _ = fs::remove_file(path);
        }
        return Err(error);
    }
    Ok(created)
}
fn refresh(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let result = Command::new("fc-cache")
            .arg("-f")
            .arg(path)
            .output()
            .map_err(|e| format!("Could not refresh desktop fonts: {e}"))?;
        if !result.status.success() {
            return Err(format!(
                "Could not refresh desktop fonts: {}",
                String::from_utf8_lossy(&result.stderr)
            ));
        }
    }
    #[cfg(not(target_os = "linux"))]
    let _ = path;
    Ok(())
}
#[cfg(windows)]
fn register(id: &str, path: &Path, remove: bool) -> Result<(), String> {
    use std::os::windows::{ffi::OsStrExt, process::CommandExt};
    #[link(name = "gdi32")]
    extern "system" {
        fn AddFontResourceExW(path: *const u16, flags: u32, reserved: *mut std::ffi::c_void)
            -> i32;
        fn RemoveFontResourceExW(
            path: *const u16,
            flags: u32,
            reserved: *mut std::ffi::c_void,
        ) -> i32;
    }
    #[link(name = "user32")]
    extern "system" {
        fn SendMessageTimeoutW(
            hwnd: *mut std::ffi::c_void,
            msg: u32,
            wparam: usize,
            lparam: isize,
            flags: u32,
            timeout: u32,
            result: *mut usize,
        ) -> isize;
    }
    let name = format!(
        "SimulationStudio-{id}-{}",
        path.file_name().unwrap().to_string_lossy()
    );
    let mut command = Command::new("reg.exe");
    command.creation_flags(0x08000000);
    let key = "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts";
    if remove {
        command.args(["delete", key, "/v", &name, "/f"]);
    } else {
        command
            .args(["add", key, "/v", &name, "/t", "REG_SZ", "/d"])
            .arg(path)
            .arg("/f");
    }
    let result = command.output().map_err(|e| e.to_string())?;
    if !result.status.success() {
        return Err(format!(
            "Could not {} the desktop font registration",
            if remove { "remove" } else { "save" }
        ));
    }
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {
        if remove {
            RemoveFontResourceExW(wide.as_ptr(), 0, std::ptr::null_mut());
        } else if AddFontResourceExW(wide.as_ptr(), 0, std::ptr::null_mut()) == 0 {
            let _ = Command::new("reg.exe")
                .args(["delete", key, "/v", &name, "/f"])
                .creation_flags(0x08000000)
                .output();
            return Err("Windows could not load the font".into());
        }
        SendMessageTimeoutW(
            0xffffusize as *mut _,
            0x001d,
            0,
            0,
            2,
            1000,
            std::ptr::null_mut(),
        );
    }
    Ok(())
}
pub(crate) fn installed(id: &str, files: &[String]) -> bool {
    !files.is_empty()
        && directory(id).is_ok_and(|root| {
            files
                .iter()
                .all(|file| owned_name(file) && root.join(file).is_file())
        })
}
pub(crate) fn install(source: &Path, id: &str, files: &[String]) -> Result<(), String> {
    if files.is_empty() {
        return Err("No desktop font files were downloaded".into());
    }
    let target = directory(id)?;
    let created = copy_owned(source, &target, files)?;
    let result = (|| {
        #[cfg(windows)]
        for name in files {
            register(id, &target.join(name), false)?;
        }
        refresh(&target)
    })();
    if let Err(error) = result {
        for path in created {
            #[cfg(windows)]
            let _ = register(id, &path, true);
            let _ = fs::remove_file(path);
        }
        let _ = fs::remove_dir(&target);
        return Err(error);
    }
    Ok(())
}
pub(crate) fn uninstall(id: &str, files: &[String]) -> Result<(), String> {
    let target = directory(id)?;
    for name in files {
        if !owned_name(name) {
            return Err("Invalid desktop font filename".into());
        }
        let path = target.join(name);
        if !path.exists() {
            continue;
        }
        #[cfg(windows)]
        register(id, &path, true)?;
        fs::remove_file(path).map_err(|e| format!("Could not remove the desktop font: {e}"))?;
    }
    if target.exists() {
        let _ = fs::remove_dir(&target);
    }
    if let Some(parent) = target.parent() {
        if parent.exists() {
            refresh(parent)?;
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn never_replaces_an_unrelated_font() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        let target = temp.path().join("target");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("font.ttf"), b"\0\x01\0\0new font").unwrap();
        fs::write(target.join("font.ttf"), b"existing font").unwrap();
        assert!(copy_owned(&source, &target, &["font.ttf".into()]).is_err());
        assert_eq!(fs::read(target.join("font.ttf")).unwrap(), b"existing font");
    }
    #[test]
    fn rejects_paths_and_rolls_back_partial_copies() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("font.ttf"), b"\0\x01\0\0test font").unwrap();
        let target = temp.path().join("installed");
        assert!(copy_owned(
            temp.path(),
            &target,
            &["font.ttf".into(), "../other.ttf".into()]
        )
        .is_err());
        assert!(!target.join("font.ttf").exists());
    }
}
