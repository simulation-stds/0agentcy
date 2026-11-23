use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    thread,
    time::Duration,
};
use tauri::Manager;

static PREVIEW_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static PREVIEW_LOCK: Mutex<()> = Mutex::new(());
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct VideoEffects {
    pub enabled: bool,
    pub dither: String,
    pub palette: String,
    pub pattern_scale: u8,
    pub custom_colors: Vec<String>,
    pub color_count: u16,
    pub noise_strength: f64,
    pub brightness: f64,
    pub contrast: f64,
    pub saturation: f64,
    pub monochrome: bool,
    pub posterize: u16,
    pub pixel_size: u16,
    pub grain: f64,
    pub scanlines: f64,
    pub vignette: f64,
    pub affect_subtitles: bool,
}
impl Default for VideoEffects {
    fn default() -> Self {
        Self {
            enabled: false,
            dither: "none".into(),
            palette: "rgb64".into(),
            pattern_scale: 2,
            color_count: 16,
            custom_colors: vec!["#000000".into(), "#ffffff".into()],
            noise_strength: 1.0,
            brightness: 0.0,
            contrast: 1.0,
            saturation: 1.0,
            monochrome: false,
            posterize: 256,
            pixel_size: 1,
            grain: 0.0,
            scanlines: 0.0,
            vignette: 0.0,
            affect_subtitles: false,
        }
    }
}
impl VideoEffects {
    pub fn validate(&self) -> Result<(), String> {
        let range = |n: f64, a: f64, b: f64| n.is_finite() && n >= a && n <= b;
        if !matches!(
            self.dither.as_str(),
            "none" | "bayer" | "floyd_steinberg" | "sierra2_4a" | "blue_noise"
        ) || !matches!(
            self.palette.as_str(),
            "mono" | "gray" | "gameboy" | "cga" | "rgb8" | "rgb64" | "rgb256" | "custom"
        ) || !(2..=256).contains(&self.color_count)
            || self.custom_colors.len() < 2
            || self.custom_colors.len() > 32
            || !self.custom_colors.iter().all(|c| {
                c.len() == 7 && c.starts_with('#') && c[1..].bytes().all(|b| b.is_ascii_hexdigit())
            })
            || !range(self.noise_strength, 0.0, 2.0)
            || self.pattern_scale > 5
            || !range(self.brightness, -1.0, 1.0)
            || !range(self.contrast, 0.0, 3.0)
            || !range(self.saturation, 0.0, 3.0)
            || !(2..=256).contains(&self.posterize)
            || !(1..=32).contains(&self.pixel_size)
            || !range(self.grain, 0.0, 50.0)
            || !range(self.scanlines, 0.0, 1.0)
            || !range(self.vignette, 0.0, 1.0)
        {
            return Err("Invalid video effect settings".into());
        }
        Ok(())
    }
    pub fn needs_palette(&self) -> bool {
        self.enabled && self.dither != "none"
    }
    pub fn graph(
        &self,
        input: &str,
        output: &str,
        palette: &str,
        width: u32,
        height: u32,
    ) -> String {
        if !self.enabled {
            return format!("[{input}]null[{output}]");
        }
        let mut graph = format!("[{input}]{}[fxcolor]", self.color_filters(width, height));
        let mut current = "fxcolor";
        if self.dither == "blue_noise" {
            let noise = palette
                .split(':')
                .next()
                .and_then(|v| v.parse::<usize>().ok())
                .unwrap_or(2)
                + 1;
            let count = if self.palette == "custom" {
                usize::from(self.color_count)
            } else {
                self.colors().len()
            };
            let amplitude = if count <= 2 {
                255.0
            } else if count <= 4 {
                128.0
            } else if count <= 8 {
                96.0
            } else if count <= 16 {
                64.0
            } else if count <= 64 {
                85.0
            } else {
                48.0
            };
            graph+=&format!(";[fxcolor]format=gbrp[fxrgb];[{noise}:v]format=gbrp[fxnoise];[fxrgb][fxnoise]blend=all_expr='clip(A+(B-127.5)*{},0,255)'[fxblue]",amplitude*self.noise_strength/255.0);
            current = "fxblue";
        }
        if self.needs_palette() {
            graph += &format!(
                ";[{current}][{palette}]paletteuse=dither={}:bayer_scale={}[fxpalette]",
                if self.dither == "blue_noise" {
                    "none"
                } else {
                    &self.dither
                },
                self.pattern_scale
            );
            current = "fxpalette";
        }
        // Quantize on the reduced grid, then enlarge whole dither pixels sharply.
        if self.pixel_size > 1 {
            graph += &format!(";[{current}]scale={width}:{height}:flags=neighbor[fxsized]");
            current = "fxsized";
        }
        let mut texture = Vec::new();
        if self.grain > 0.0 {
            texture.push(format!("noise=alls={}:allf=u:all_seed=431", self.grain));
        }
        if self.scanlines > 0.0 {
            texture.push(format!(
                "geq=lum='lum(X,Y)*(1-{}*eq(mod(Y,4),0))':cb='cb(X,Y)':cr='cr(X,Y)'",
                self.scanlines
            ));
        }
        if self.vignette > 0.0 {
            texture.push(format!("vignette=angle={}:dither=0", self.vignette * 1.2));
        }
        if texture.is_empty() {
            texture.push("null".into());
        }
        graph += &format!(";[{current}]{}[{output}]", texture.join(","));
        graph
    }
    pub(crate) fn color_filters(&self, width: u32, height: u32) -> String {
        let mut filters = vec![format!(
            "eq=brightness={}:contrast={}:saturation={}",
            self.brightness,
            self.contrast,
            if self.monochrome {
                0.0
            } else {
                self.saturation
            }
        )];
        if self.posterize < 256 {
            let step = 255.0 / f64::from(self.posterize - 1);
            filters.push(format!("lutrgb=r='floor(val/{step}+0.5)*{step}':g='floor(val/{step}+0.5)*{step}':b='floor(val/{step}+0.5)*{step}'"));
        }
        if self.pixel_size > 1 {
            filters.push(format!(
                "scale={}:{}:flags=area",
                (width / u32::from(self.pixel_size)).max(1),
                (height / u32::from(self.pixel_size)).max(1)
            ));
        }
        filters.join(",")
    }
    fn colors(&self) -> Vec<[u8; 3]> {
        match self.palette.as_str() {
            "custom" => Vec::new(),
            "mono" => vec![[0, 0, 0], [255, 255, 255]],
            "gray" => (0..16).map(|n| [n * 17, n * 17, n * 17]).collect(),
            "gameboy" => vec![[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]],
            "cga" => (0..16)
                .map(|n| {
                    let low = if n & 8 != 0 { 85 } else { 0 };
                    let mut c = [
                        if n & 4 != 0 { 170 + low } else { low },
                        if n & 2 != 0 { 170 + low } else { low },
                        if n & 1 != 0 { 170 + low } else { low },
                    ];
                    if n == 6 {
                        c[1] = 85;
                    }
                    c
                })
                .collect(),
            _ => {
                let (r, g, b) = match self.palette.as_str() {
                    "rgb8" => (2, 2, 2),
                    "rgb64" => (4, 4, 4),
                    _ => (8, 8, 4),
                };
                let mut values = Vec::new();
                for rr in 0..r {
                    for gg in 0..g {
                        for bb in 0..b {
                            values.push([
                                (rr * 255 / (r - 1)) as u8,
                                (gg * 255 / (g - 1)) as u8,
                                (bb * 255 / (b - 1)) as u8,
                            ]);
                        }
                    }
                }
                values
            }
        }
    }
    pub fn prepare_assets(
        &self,
        directory: &Path,
        width: u32,
        height: u32,
        source: &Path,
        cache: &Path,
        cancel: &dyn Fn() -> bool,
    ) -> Result<(), String> {
        if self.palette == "custom" {
            let colors = crate::adaptive_palette::source_colors(
                source,
                &self.color_filters(width, height),
                self.color_count,
                cache,
                cancel,
            )?;
            write_palette(&directory.join("palette.bmp"), &colors)?;
        } else {
            self.palette_file(&directory.join("palette.bmp"))?;
        }
        if self.dither == "blue_noise" {
            let tile: Vec<u8> = serde_json::from_str(include_str!("../../src/lib/blue-noise.json"))
                .map_err(|e| e.to_string())?;
            // Noise pixels must match the same reduced grid as palette quantization.
            let width = (width / u32::from(self.pixel_size)).max(1);
            let height = (height / u32::from(self.pixel_size)).max(1);
            let stride = (width * 3 + 3) & !3;
            let size = 54 + stride * height;
            let mut bytes = vec![0u8; size as usize];
            bytes[0..2].copy_from_slice(b"BM");
            bytes[2..6].copy_from_slice(&size.to_le_bytes());
            bytes[10..14].copy_from_slice(&54u32.to_le_bytes());
            bytes[14..18].copy_from_slice(&40u32.to_le_bytes());
            bytes[18..22].copy_from_slice(&width.to_le_bytes());
            bytes[22..26].copy_from_slice(&height.to_le_bytes());
            bytes[26..28].copy_from_slice(&1u16.to_le_bytes());
            bytes[28..30].copy_from_slice(&24u16.to_le_bytes());
            for row in 0..height {
                for x in 0..width {
                    let value = tile[(((height - 1 - row) % 32) * 32 + x % 32) as usize];
                    let index = (54 + row * stride + x * 3) as usize;
                    bytes[index..index + 3].fill(value);
                }
            }
            fs::write(directory.join("blue-noise.bmp"), bytes).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    pub fn palette_file(&self, path: &Path) -> Result<(), String> {
        let colors = self.colors();
        write_palette(path, &colors)
    }
}
fn write_palette(path: &Path, colors: &[[u8; 3]]) -> Result<(), String> {
    if colors.is_empty() {
        return Err("Adaptive palettes require source video analysis".into());
    }
    // Uncompressed 16×16 BMP: no image library, stable palette across every frame.
    let mut bytes = vec![0u8; 54];
    bytes[0..2].copy_from_slice(b"BM");
    bytes[2..6].copy_from_slice(&(54u32 + 768).to_le_bytes());
    bytes[10..14].copy_from_slice(&54u32.to_le_bytes());
    bytes[14..18].copy_from_slice(&40u32.to_le_bytes());
    bytes[18..22].copy_from_slice(&16u32.to_le_bytes());
    bytes[22..26].copy_from_slice(&16u32.to_le_bytes());
    bytes[26..28].copy_from_slice(&1u16.to_le_bytes());
    bytes[28..30].copy_from_slice(&24u16.to_le_bytes());
    for index in 0..256 {
        let c = colors[index % colors.len()];
        bytes.extend_from_slice(&[c[2], c[1], c[0]]);
    }
    fs::write(path, bytes).map_err(|e| e.to_string())
}

pub(crate) fn palette_cache(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("video-effects-palettes"))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreviewOptions {
    source: String,
    time: f64,
    width: u32,
    height: u32,
    effects: VideoEffects,
    caption: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreviewResult {
    original: String,
    effected: String,
    time: f64,
}
#[tauri::command]
pub(crate) fn cancel_video_effect_preview() {
    PREVIEW_SEQUENCE.fetch_add(1, Ordering::SeqCst);
}
#[tauri::command]
pub(crate) async fn preview_video_effects(
    app: tauri::AppHandle,
    options: PreviewOptions,
) -> Result<PreviewResult, String> {
    preview_with_cache(options, palette_cache(&app)?).await
}
async fn preview_with_cache(
    options: PreviewOptions,
    cache: PathBuf,
) -> Result<PreviewResult, String> {
    options.effects.validate()?;
    if !options.time.is_finite()
        || options.time < 0.0
        || options.width == 0
        || options.height == 0
        || options.width > 8192
        || options.height > 8192
        || u64::from(options.width) * u64::from(options.height) > 33_554_432
    {
        return Err("Invalid effect preview dimensions or time".into());
    }
    let sequence = PREVIEW_SEQUENCE.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn_blocking(move||{
 let _guard=PREVIEW_LOCK.lock().map_err(|e|e.to_string())?;if PREVIEW_SEQUENCE.load(Ordering::SeqCst)!=sequence{return Err("Preview superseded".into());}
 let directory=tempfile::tempdir().map_err(|e|e.to_string())?;let ffmpeg=crate::find_tool("ffmpeg").ok_or("Install FFmpeg in Settings → Must haves first")?;
 let mut command=Command::new(ffmpeg);command.current_dir(directory.path()).args(["-nostdin","-v","error","-y","-filter_complex_threads","1","-ss"]).arg(options.time.to_string()).arg("-i").arg(fs::canonicalize(&options.source).map_err(|e|e.to_string())?);
 let caption=if let Some(png)=options.caption {if png.len()>48_000_000{return Err("Caption preview is too large".into());}let bytes=STANDARD.decode(png).map_err(|e|e.to_string())?;if !bytes.starts_with(b"\x89PNG\r\n\x1a\n"){return Err("Invalid caption preview".into());}fs::write(directory.path().join("caption.png"),bytes).map_err(|e|e.to_string())?;command.args(["-i","caption.png"]);true}else{false};
 let palette=if caption{"2:v"}else{"1:v"};if options.effects.needs_palette(){options.effects.prepare_assets(directory.path(),options.width,options.height,Path::new(&options.source),&cache,&||PREVIEW_SEQUENCE.load(Ordering::SeqCst)!=sequence)?;command.args(["-i","palette.bmp"]);if options.effects.dither=="blue_noise"{command.args(["-i","blue-noise.bmp"]);}}
 let shrink="scale=w='min(960,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease";
 let fx=options.effects.graph(if caption&&options.effects.affect_subtitles{"composed"}else{"source"},"effected",palette,options.width,options.height);
 let graph=if caption&&options.effects.affect_subtitles{format!("[0:v][1:v]overlay=format=auto[composed0];[composed0]split[composed][original];{fx};[original]{shrink}[left];[effected]{shrink}[right]")}else if caption{format!("[0:v]split[source][original0];[original0][1:v]overlay=format=auto[original];{fx};[effected][1:v]overlay=format=auto[effectedcaption];[original]{shrink}[left];[effectedcaption]{shrink}[right]")}else{format!("[0:v]split[source][original];{fx};[original]{shrink}[left];[effected]{shrink}[right]")};
 command.args(["-filter_complex",&graph,"-map","[left]","-frames:v","1","original.png","-map","[right]","-frames:v","1","effected.png"]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::from(fs::File::create(directory.path().join("error.log")).map_err(|e|e.to_string())?));
 #[cfg(windows)]{use std::os::windows::process::CommandExt;command.creation_flags(0x08000000);}
 let mut child=command.spawn().map_err(|e|e.to_string())?;let status=loop{if PREVIEW_SEQUENCE.load(Ordering::SeqCst)!=sequence{let _=child.kill();let _=child.wait();return Err("Preview superseded".into());}match child.try_wait(){Ok(Some(status))=>break status,Ok(None)=>thread::sleep(Duration::from_millis(30)),Err(error)=>{let _=child.kill();let _=child.wait();return Err(error.to_string());}}};
 if !status.success(){return Err(format!("Effect preview failed: {}",fs::read_to_string(directory.path().join("error.log")).unwrap_or_default()));}
 Ok(PreviewResult{original:STANDARD.encode(fs::read(directory.path().join("original.png")).map_err(|e|e.to_string())?),effected:STANDARD.encode(fs::read(directory.path().join("effected.png")).map_err(|e|e.to_string())?),time:options.time})
 }).await.map_err(|e|e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    static TEST_PREVIEW: std::sync::Mutex<()> = std::sync::Mutex::new(());
    fn fixture(directory: &Path) -> Option<(String, String)> {
        let ffmpeg = crate::find_tool("ffmpeg")?;
        let path = directory.join("source.mp4");
        assert!(Command::new(&ffmpeg)
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=s=128x72:r=10:d=1",
                "-c:v",
                "libx264",
                "-y"
            ])
            .arg(&path)
            .status()
            .unwrap()
            .success());
        Some((ffmpeg, path.to_string_lossy().into()))
    }
    #[test]
    fn rejects_unsupported_effects_and_nonfinite_ranges() {
        let mut s = VideoEffects::default();
        assert!(s.validate().is_ok());
        s.brightness = f64::NAN;
        assert!(s.validate().is_err());
        s.brightness = 0.0;
        s.dither = "injected;movie=file".into();
        assert!(s.validate().is_err());
    }
    #[test]
    fn renders_dither_color_and_texture_and_respects_caption_order() {
        let _guard = TEST_PREVIEW.lock().unwrap();
        let directory = tempfile::tempdir().unwrap();
        let Some((ffmpeg, source)) = fixture(directory.path()) else {
            return;
        };
        let mut effects = VideoEffects {
            enabled: true,
            brightness: 0.05,
            contrast: 1.2,
            saturation: 0.8,
            posterize: 16,
            pixel_size: 3,
            grain: 8.0,
            scanlines: 0.3,
            vignette: 0.4,
            ..Default::default()
        };
        for dither in [
            "none",
            "bayer",
            "floyd_steinberg",
            "sierra2_4a",
            "blue_noise",
        ] {
            effects.dither = dither.into();
            let result = tauri::async_runtime::block_on(preview_with_cache(
                PreviewOptions {
                    source: source.clone(),
                    time: 0.2,
                    width: 128,
                    height: 72,
                    effects: effects.clone(),
                    caption: None,
                },
                directory.path().join("palette-cache"),
            ))
            .unwrap();
            assert_ne!(result.original, result.effected);
            assert!(STANDARD
                .decode(result.effected)
                .unwrap()
                .starts_with(b"\x89PNG\r\n\x1a\n"));
        }
        let caption = directory.path().join("red.png");
        assert!(Command::new(&ffmpeg)
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=red:s=128x72",
                "-frames:v",
                "1",
                "-y"
            ])
            .arg(&caption)
            .status()
            .unwrap()
            .success());
        let png = STANDARD.encode(fs::read(caption).unwrap());
        fn pixel(ffmpeg: &str, png: &str) -> Vec<u8> {
            let mut child = Command::new(ffmpeg)
                .args([
                    "-v",
                    "error",
                    "-i",
                    "pipe:0",
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
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .spawn()
                .unwrap();
            child
                .stdin
                .take()
                .unwrap()
                .write_all(&STANDARD.decode(png).unwrap())
                .unwrap();
            let result = child.wait_with_output().unwrap();
            assert!(result.status.success());
            result.stdout
        }
        for affect in [false, true] {
            let result = tauri::async_runtime::block_on(preview_with_cache(
                PreviewOptions {
                    source: source.clone(),
                    time: 0.0,
                    width: 128,
                    height: 72,
                    effects: VideoEffects {
                        enabled: true,
                        monochrome: true,
                        affect_subtitles: affect,
                        ..Default::default()
                    },
                    caption: Some(png.clone()),
                },
                directory.path().join("palette-cache"),
            ))
            .unwrap();
            let rgb = pixel(&ffmpeg, &result.effected);
            if affect {
                assert!((i32::from(rgb[0]) - i32::from(rgb[1])).abs() < 5);
                assert!((i32::from(rgb[1]) - i32::from(rgb[2])).abs() < 5);
            } else {
                assert!(
                    rgb[0] > 200 && rgb[1] < 30 && rgb[2] < 30,
                    "subtitle color was changed: {rgb:?}"
                );
            }
        }
    }
    #[test]
    fn pixel_size_enlarges_complete_dither_blocks() {
        let Some(ffmpeg) = crate::find_tool("ffmpeg") else {
            return;
        };
        let directory = tempfile::tempdir().unwrap();
        for dither in [
            "none",
            "bayer",
            "floyd_steinberg",
            "sierra2_4a",
            "blue_noise",
        ] {
            let effects = VideoEffects {
                enabled: true,
                dither: dither.into(),
                palette: "mono".into(),
                pixel_size: 4,
                ..Default::default()
            };
            effects
                .prepare_assets(
                    directory.path(),
                    96,
                    64,
                    Path::new("unused"),
                    directory.path(),
                    &|| false,
                )
                .unwrap();
            let mut command = Command::new(&ffmpeg);
            command.current_dir(directory.path()).args([
                "-v",
                "error",
                "-filter_complex_threads",
                "1",
                "-f",
                "lavfi",
                "-i",
                "nullsrc=s=96x64,geq=lum='128+80*sin(X/11)*cos(Y/9)':cb=128:cr=128",
            ]);
            if effects.needs_palette() {
                command.args(["-i", "palette.bmp"]);
            }
            if dither == "blue_noise" {
                command.args(["-i", "blue-noise.bmp"]);
            }
            let result = command
                .args([
                    "-filter_complex",
                    &effects.graph("0:v", "out", "1:v", 96, 64),
                    "-map",
                    "[out]",
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
            assert!(
                result.status.success(),
                "{dither}: {}",
                String::from_utf8_lossy(&result.stderr)
            );
            assert_eq!(result.stdout.len(), 96 * 64 * 3);
            for y in 0..64usize {
                for x in 0..96usize {
                    let actual = (y * 96 + x) * 3;
                    let origin = ((y / 4 * 4) * 96 + x / 4 * 4) * 3;
                    assert_eq!(
                        &result.stdout[actual..actual + 3],
                        &result.stdout[origin..origin + 3],
                        "{dither}: dither pixel split inside a 4x4 block at {x},{y}"
                    );
                }
            }
            assert!(
                result
                    .stdout
                    .chunks_exact(3)
                    .any(|pixel| pixel != &result.stdout[..3]),
                "fixture must contain different blocks"
            );
        }
    }
    #[test]
    fn creates_stable_fixed_palette_files() {
        let directory = tempfile::tempdir().unwrap();
        for palette in ["mono", "gray", "gameboy", "cga", "rgb8", "rgb64", "rgb256"] {
            let s = VideoEffects {
                palette: palette.into(),
                ..Default::default()
            };
            let path = directory.path().join("palette.bmp");
            s.palette_file(&path).unwrap();
            let a = fs::read(&path).unwrap();
            assert_eq!(a.len(), 822);
            s.palette_file(&path).unwrap();
            assert_eq!(a, fs::read(path).unwrap());
        }
    }
    #[test]
    fn validates_and_renders_custom_palette_with_blue_noise() {
        let _guard = TEST_PREVIEW.lock().unwrap();
        let directory = tempfile::tempdir().unwrap();
        let Some((_, source)) = fixture(directory.path()) else {
            return;
        };
        let effects = VideoEffects {
            enabled: true,
            dither: "blue_noise".into(),
            palette: "custom".into(),
            color_count: 23,
            ..Default::default()
        };
        effects.validate().unwrap();
        effects
            .prepare_assets(
                directory.path(),
                128,
                72,
                Path::new(&source),
                &directory.path().join("palette-cache"),
                &|| false,
            )
            .unwrap();
        assert!(directory.path().join("palette.bmp").exists());
        let result = tauri::async_runtime::block_on(preview_with_cache(
            PreviewOptions {
                source,
                time: 0.0,
                width: 128,
                height: 72,
                effects: effects.clone(),
                caption: None,
            },
            directory.path().join("palette-cache"),
        ))
        .unwrap();
        assert_ne!(result.original, result.effected);
        let invalid = VideoEffects {
            color_count: 257,
            ..effects
        };
        assert!(invalid.validate().is_err());
    }
}
