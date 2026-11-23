use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, io::Read, path::PathBuf, sync::Mutex, time::Duration};
use tauri::Manager;
static LOCK: Mutex<()> = Mutex::new(());
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FontFile {
    pub file: String,
    pub weight: u16,
    pub unicode_range: Option<String>,
}
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalFont {
    pub id: String,
    pub family: String,
    pub license: String,
    pub files: Vec<FontFile>,
    #[serde(default)]
    pub desktop_files: Vec<String>,
    #[serde(default)]
    pub system_installed: bool,
}
fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let p = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("subtitle-fonts");
    fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 100
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}
fn safe_family(family: &str) -> bool {
    !family.trim().is_empty()
        && family.len() <= 128
        && !family
            .chars()
            .any(|c| c.is_control() || ",{}\\\"".contains(c))
}
fn get(url: &str, max: u64) -> Result<Vec<u8>, String> {
    let config = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(60)))
        .build();
    let mut response = ureq::Agent::new_with_config(config)
        .get(url)
        .call()
        .map_err(|e| format!("Fontsource request failed: {e}"))?;
    let mut bytes = Vec::new();
    response
        .body_mut()
        .as_reader()
        .take(max + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > max {
        return Err("Font download is too large.".into());
    }
    Ok(bytes)
}
fn list(app: &tauri::AppHandle) -> Result<Vec<LocalFont>, String> {
    let mut fonts = Vec::new();
    for item in fs::read_dir(root(app)?).map_err(|e| e.to_string())? {
        let path = item.map_err(|e| e.to_string())?.path().join("font.json");
        if let Ok(bytes) = fs::read(path) {
            if let Ok(mut font) = serde_json::from_slice::<LocalFont>(&bytes) {
                font.system_installed = font.system_installed
                    && crate::system_fonts::installed(&font.id, &font.desktop_files);
                fonts.push(font);
            }
        }
    }
    fonts.sort_by(|a, b| a.family.cmp(&b.family));
    Ok(fonts)
}
#[tauri::command]
pub(crate) fn list_subtitle_fonts(app: tauri::AppHandle) -> Result<Vec<LocalFont>, String> {
    list(&app)
}
#[tauri::command]
pub(crate) async fn fontsource_catalog(
    app: tauri::AppHandle,
    refresh: bool,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = root(&app)?.join("catalog.json");
        if !refresh {
            if let Ok(bytes) = fs::read(&path) {
                if let Ok(value) = serde_json::from_slice::<Value>(&bytes) {
                    if value["family"].as_str().is_some_and(safe_family)
                        && value["weight"]
                            .as_str()
                            .and_then(|w| w.parse::<u16>().ok())
                            .is_some()
                        && value["encoded"].as_str().is_some_and(|encoded| {
                            encoded.len() < 16_000_000
                                && STANDARD
                                    .decode(encoded)
                                    .is_ok_and(|bytes| bytes.starts_with(b"wOF2"))
                        })
                    {
                        return Ok(value);
                    }
                }
            }
        }
        let bytes = get("https://api.fontsource.org/v1/fonts", 8_000_000)?;
        let value: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        if !value.is_array() {
            return Err("Invalid Fontsource catalogue.".into());
        }
        fs::write(path, bytes).map_err(|e| e.to_string())?;
        Ok(value)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn install_subtitle_font(
    app: tauri::AppHandle,
    id: String,
) -> Result<LocalFont, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let directory = root(&app)?;
        let mut font = install_into(directory.clone(), id)?;
        let _guard = LOCK.lock().map_err(|e| e.to_string())?;
        enable_system(&directory, &mut font)?;
        Ok(font)
    })
    .await
    .map_err(|e| e.to_string())?
}
fn install_into(directory: PathBuf, id: String) -> Result<LocalFont, String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    if !valid_id(&id) {
        return Err("Invalid font identifier.".into());
    }
    let info: Value = serde_json::from_slice(&get(
        &format!("https://api.fontsource.org/v1/fonts/{id}"),
        2_000_000,
    )?)
    .map_err(|e| e.to_string())?;
    let family = info["family"]
        .as_str()
        .ok_or("Missing font family")?
        .to_string();
    if !safe_family(&family) {
        return Err("Invalid font family.".into());
    }
    let license = info["license"].as_str().unwrap_or("");
    if !matches!(
        license,
        "OFL-1.1" | "Apache-2.0" | "MIT" | "Ubuntu-font-1.0"
    ) {
        return Err(format!("This font's licence ({license}) needs review before distribution. Import it manually if appropriate."));
    }
    let version = info["npmVersion"].as_str().ok_or("Missing font version")?;
    if !version
        .bytes()
        .all(|b| b.is_ascii_digit() || b == b'.' || b == b'-')
    {
        return Err("Invalid font version".into());
    }
    let licence_bytes = get(
        &format!("https://cdn.jsdelivr.net/npm/@fontsource/{id}@{version}/LICENSE"),
        200_000,
    )?;
    let temp = tempfile::Builder::new()
        .prefix("download-")
        .tempdir_in(&directory)
        .map_err(|e| e.to_string())?;
    fs::write(temp.path().join("LICENSE"), licence_bytes).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    let variants = info["variants"]
        .as_object()
        .ok_or("No downloadable font variants")?;
    let preferred = if variants.contains_key("400") {
        "400"
    } else {
        variants.keys().next().ok_or("No font weights")?
    };
    let mut weights = vec![preferred];
    if preferred != "700" {
        weights.push("700");
    }
    for weight in weights {
        let Some(subsets) = info["variants"][weight]["normal"].as_object() else {
            continue;
        };
        for (subset, item) in subsets {
            if !valid_id(subset) {
                continue;
            }
            let Some(url) = item["url"]["woff2"].as_str() else {
                continue;
            };
            if !url.starts_with("https://cdn.jsdelivr.net/fontsource/fonts/") {
                return Err("Unexpected font download host.".into());
            }
            let bytes = get(url, 10_000_000)?;
            if !bytes.starts_with(b"wOF2") {
                return Err("Invalid WOFF2 font.".into());
            }
            let file = format!("{subset}-{weight}.woff2");
            fs::write(temp.path().join(&file), bytes).map_err(|e| e.to_string())?;
            files.push(FontFile {
                file,
                weight: weight.parse().unwrap_or(400),
                unicode_range: info["unicodeRange"][subset].as_str().map(str::to_string),
            });
        }
    }
    if files.is_empty() {
        return Err("No supported normal font files are available.".into());
    }
    let font = LocalFont {
        id: id.clone(),
        family,
        license: license.into(),
        files,
        desktop_files: Vec::new(),
        system_installed: false,
    };
    fs::write(
        temp.path().join("font.json"),
        serde_json::to_vec(&font).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let target = directory.join(&id);
    if target.exists() {
        return Err("This font is already downloaded. Remove it before downloading again.".into());
    }
    fs::rename(temp.path(), target).map_err(|e| e.to_string())?;
    Ok(font)
}

#[tauri::command]
pub(crate) async fn import_subtitle_font(
    app: tauri::AppHandle,
    path: String,
    family: String,
) -> Result<LocalFont, String> {
    tauri::async_runtime::spawn_blocking(move || import_font(&app, path, family))
        .await
        .map_err(|e| e.to_string())?
}
fn import_font(app: &tauri::AppHandle, path: String, family: String) -> Result<LocalFont, String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    if !safe_family(&family) {
        return Err("Enter a font family name without punctuation or control characters.".into());
    }
    let path = PathBuf::from(path);
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !matches!(ext.as_str(), "ttf" | "otf") {
        return Err("Choose a TTF or OTF font.".into());
    }
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 20_000_000 {
        return Err("Font must be smaller than 20 MB.".into());
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if !(bytes.starts_with(&[0, 1, 0, 0])
        || bytes.starts_with(b"OTTO")
        || bytes.starts_with(b"true"))
    {
        return Err("Invalid font file.".into());
    }
    use sha2::{Digest, Sha256};
    let id = format!("local-{:x}", Sha256::digest(&bytes));
    let directory = root(&app)?.join(&id);
    if directory.exists() {
        return Err("This font is already imported.".into());
    }
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let file = format!("font.{ext}");
    fs::write(directory.join(&file), bytes).map_err(|e| e.to_string())?;
    let mut font = LocalFont {
        id,
        family,
        license: "User supplied".into(),
        files: vec![FontFile {
            file,
            weight: 400,
            unicode_range: None,
        }],
        desktop_files: Vec::new(),
        system_installed: false,
    };
    fs::write(
        directory.join("font.json"),
        serde_json::to_vec(&font).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    enable_system(directory.parent().ok_or("Missing font storage")?, &mut font)?;
    Ok(font)
}
#[tauri::command]
pub(crate) fn read_subtitle_font(
    app: tauri::AppHandle,
    id: String,
    file: String,
) -> Result<String, String> {
    if !valid_id(&id) || file.contains(['/', '\\']) || file.starts_with('.') {
        return Err("Invalid font path.".into());
    }
    let bytes = fs::read(root(&app)?.join(id).join(file)).map_err(|e| e.to_string())?;
    if bytes.len() > 20_000_000 {
        return Err("Font is too large.".into());
    }
    Ok(STANDARD.encode(bytes))
}
#[tauri::command]
pub(crate) async fn remove_subtitle_font(app: tauri::AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || remove_font(&app, id))
        .await
        .map_err(|e| e.to_string())?
}
fn remove_font(app: &tauri::AppHandle, id: String) -> Result<(), String> {
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    if !valid_id(&id) {
        return Err("Invalid font identifier.".into());
    }
    let directory = root(&app)?.join(&id);
    let font: LocalFont =
        serde_json::from_slice(&fs::read(directory.join("font.json")).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    if !font.desktop_files.is_empty() {
        crate::system_fonts::uninstall(&id, &font.desktop_files)?;
    }
    fs::remove_dir_all(directory).map_err(|e| e.to_string())
}

fn enable_system(root: &std::path::Path, font: &mut LocalFont) -> Result<(), String> {
    let directory = root.join(&font.id);
    if font.system_installed && crate::system_fonts::installed(&font.id, &font.desktop_files) {
        return Ok(());
    }
    if font.id.starts_with("local-") {
        font.desktop_files = font.files.iter().map(|file| file.file.clone()).collect();
    } else {
        let info: Value = serde_json::from_slice(&get(
            &format!("https://api.fontsource.org/v1/fonts/{}", font.id),
            2_000_000,
        )?)
        .map_err(|e| e.to_string())?;
        let mut files = Vec::new();
        for file in &font.files {
            let subset = file
                .file
                .strip_suffix(&format!("-{}.woff2", file.weight))
                .ok_or("Invalid font subset")?;
            let url = info["variants"][file.weight.to_string()]["normal"][subset]["url"]["ttf"]
                .as_str()
                .ok_or("No desktop TTF download is available for this font")?;
            if !url.starts_with("https://cdn.jsdelivr.net/fontsource/fonts/") {
                return Err("Unexpected desktop font download host".into());
            }
            let name = format!("{subset}-{}.ttf", file.weight);
            if !directory.join(&name).exists() {
                let bytes = get(url, 20_000_000)?;
                if !(bytes.starts_with(&[0, 1, 0, 0])
                    || bytes.starts_with(b"OTTO")
                    || bytes.starts_with(b"true"))
                {
                    return Err("Invalid desktop font download".into());
                }
                fs::write(directory.join(&name), bytes).map_err(|e| e.to_string())?;
            }
            files.push(name);
        }
        font.desktop_files = files;
    }
    // Retain the managed file inventory even if OS registration needs a retry.
    fs::write(
        directory.join("font.json"),
        serde_json::to_vec(font).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    crate::system_fonts::install(&directory, &font.id, &font.desktop_files)
        .map_err(|e| format!("Font is saved in the app, but desktop installation failed: {e}"))?;
    font.system_installed = true;
    fs::write(
        directory.join("font.json"),
        serde_json::to_vec(font).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) async fn install_subtitle_font_system(
    app: tauri::AppHandle,
    id: String,
) -> Result<LocalFont, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK.lock().map_err(|e| e.to_string())?;
        if !valid_id(&id) {
            return Err("Invalid font identifier".into());
        }
        let root = root(&app)?;
        let mut font: LocalFont = serde_json::from_slice(
            &fs::read(root.join(&id).join("font.json")).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        if font.id != id {
            return Err("Invalid saved font identifier".into());
        }
        enable_system(&root, &mut font)?;
        Ok(font)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn preview_subtitle_font(
    app: tauri::AppHandle,
    id: String,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !valid_id(&id) {
            return Err("Invalid font identifier".into());
        }
        let cache = root(&app)?.join("previews");
        let cached = cache.join(format!("{id}.json"));
        if fs::metadata(&cached)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|time| time.elapsed().ok())
            .is_some_and(|age| age.as_secs() < 7 * 24 * 3600)
        {
            if let Ok(bytes) = fs::read(&cached) {
                if let Ok(value) = serde_json::from_slice::<Value>(&bytes) {
                    if value["family"].as_str().is_some_and(safe_family)
                        && value["weight"]
                            .as_str()
                            .and_then(|w| w.parse::<u16>().ok())
                            .is_some()
                        && value["encoded"].as_str().is_some_and(|encoded| {
                            encoded.len() < 16_000_000
                                && STANDARD
                                    .decode(encoded)
                                    .is_ok_and(|bytes| bytes.starts_with(b"wOF2"))
                        })
                    {
                        return Ok(value);
                    }
                }
            }
        }
        let info: Value = serde_json::from_slice(&get(
            &format!("https://api.fontsource.org/v1/fonts/{id}"),
            2_000_000,
        )?)
        .map_err(|e| e.to_string())?;
        let family = info["family"].as_str().ok_or("Missing font family")?;
        if !safe_family(family) {
            return Err("Invalid font family".into());
        }
        let variants = info["variants"].as_object().ok_or("No font variants")?;
        let weight = if variants.contains_key("400") {
            "400"
        } else {
            variants.keys().next().ok_or("No font weights")?
        };
        let subsets = info["variants"][weight]["normal"]
            .as_object()
            .ok_or("No normal font variant")?;
        let subset = info["defSubset"].as_str().unwrap_or("latin");
        let variant = subsets
            .get(subset)
            .or_else(|| subsets.values().next())
            .ok_or("No font subsets")?;
        let url = variant["url"]["woff2"].as_str().ok_or("No WOFF2 preview")?;
        if !url.starts_with("https://cdn.jsdelivr.net/fontsource/fonts/") {
            return Err("Unexpected font download host".into());
        }
        let bytes = get(url, 10_000_000)?;
        if !bytes.starts_with(b"wOF2") {
            return Err("Invalid font preview".into());
        }
        let value = json!({"family":family,"weight":weight,"encoded":STANDARD.encode(bytes)});
        if fs::create_dir_all(&cache).is_ok() {
            let _ = fs::write(&cached, serde_json::to_vec(&value).unwrap_or_default());
            if let Ok(entries) = fs::read_dir(&cache) {
                let mut files: Vec<_> = entries
                    .flatten()
                    .filter_map(|entry| {
                        entry
                            .metadata()
                            .ok()
                            .and_then(|m| m.modified().ok())
                            .map(|time| (time, entry.path()))
                    })
                    .collect();
                files.sort_by_key(|(time, _)| *time);
                let excess = files.len().saturating_sub(200);
                for (_, path) in files.into_iter().take(excess) {
                    let _ = fs::remove_file(path);
                }
            }
        }
        Ok(value)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn font_names_and_identifiers_cannot_escape_storage_or_ass_fields() {
        for id in ["../font", "/tmp/font", "font.ttf", ""] {
            assert!(!valid_id(id));
        }
        assert!(valid_id("noto-sans-42"));
        assert!(!safe_family("Arial,Injected"));
        assert!(!safe_family("Font\nStyle:"));
        assert!(safe_family("League Spartan"));
    }
    #[test]
    #[ignore = "downloads Fontsource files; run explicitly with network access"]
    fn downloads_font_and_retains_licence() {
        let directory = tempfile::tempdir().unwrap();
        let font = install_into(directory.path().to_path_buf(), "anton".into()).unwrap();
        assert_eq!(font.family, "Anton");
        assert!(!font.files.is_empty());
        assert!(fs::read_to_string(directory.path().join("anton/LICENSE"))
            .unwrap()
            .contains("SIL OPEN FONT LICENSE"));
        for file in font.files {
            assert!(fs::read(directory.path().join("anton").join(file.file))
                .unwrap()
                .starts_with(b"wOF2"));
        }
    }
    #[cfg(target_os = "linux")]
    #[test]
    #[ignore = "downloads a font and tests desktop registration in isolated XDG directories"]
    fn desktop_install_and_uninstall_are_visible_to_fontconfig() {
        let temp = tempfile::tempdir().unwrap();
        std::env::set_var("XDG_DATA_HOME", temp.path().join("data"));
        std::env::set_var("XDG_CACHE_HOME", temp.path().join("cache"));
        let storage = temp.path().join("app-fonts");
        fs::create_dir_all(&storage).unwrap();
        let mut font = install_into(storage.clone(), "anton".into()).unwrap();
        enable_system(&storage, &mut font).unwrap();
        assert!(font.system_installed);
        assert!(crate::system_fonts::installed(
            &font.id,
            &font.desktop_files
        ));
        let installed = std::process::Command::new("fc-list")
            .arg(":family=Anton")
            .arg("file")
            .output()
            .unwrap();
        let path = crate::system_fonts::directory(&font.id).unwrap();
        assert!(
            String::from_utf8_lossy(&installed.stdout).contains(path.to_str().unwrap()),
            "fontconfig did not discover the installed desktop fonts"
        );
        crate::system_fonts::uninstall(&font.id, &font.desktop_files).unwrap();
        assert!(!crate::system_fonts::installed(
            &font.id,
            &font.desktop_files
        ));
        assert!(storage.join("anton/font.json").exists());
    }
}
