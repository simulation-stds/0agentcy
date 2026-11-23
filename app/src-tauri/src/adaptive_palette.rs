//! A single, cached source-derived palette for both previews and video export.
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{BufReader, Read, Write},
    path::Path,
    process::{Command, Stdio},
    sync::{Mutex, TryLockError},
    thread,
    time::{Duration, UNIX_EPOCH},
};
static ANALYSIS: Mutex<()> = Mutex::new(());
#[derive(Clone, Debug)]
struct Point {
    rgb: [u8; 3],
    count: u64,
}
fn fingerprint(source: &Path, filters: &str, count: u16) -> Result<String, String> {
    let path = fs::canonicalize(source).map_err(|e| e.to_string())?;
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    let modified = metadata
        .modified()
        .map_err(|e| e.to_string())?
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let key = serde_json::to_vec(&(
        "adaptive-median-cut-v1",
        path.to_string_lossy(),
        metadata.len(),
        modified.as_secs(),
        modified.subsec_nanos(),
        filters,
        count,
    ))
    .map_err(|e| e.to_string())?;
    Ok(format!("{:x}", Sha256::digest(key)))
}
fn cached(path: &Path, count: u16) -> Option<Vec<[u8; 3]>> {
    let colors: Vec<[u8; 3]> = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    (!colors.is_empty() && colors.len() <= usize::from(count)).then_some(colors)
}
pub(crate) fn source_colors(
    source: &Path,
    filters: &str,
    count: u16,
    cache: &Path,
    cancel: &dyn Fn() -> bool,
) -> Result<Vec<[u8; 3]>, String> {
    if !(2..=256).contains(&count) {
        return Err("Choose between 2 and 256 colors".into());
    }
    let key = fingerprint(source, filters, count)?;
    let path = cache.join(format!("{key}.json"));
    if cancel() {
        return Err("Color analysis cancelled".into());
    }
    if let Some(colors) = cached(&path, count) {
        return Ok(colors);
    }
    let _guard = loop {
        match ANALYSIS.try_lock() {
            Ok(guard) => break guard,
            Err(TryLockError::WouldBlock) => {
                if cancel() {
                    return Err("Color analysis cancelled".into());
                }
                thread::sleep(Duration::from_millis(25));
            }
            Err(error) => return Err(error.to_string()),
        }
    };
    if let Some(colors) = cached(&path, count) {
        return Ok(colors);
    }
    let colors = analyze(source, filters, count, cancel)?;
    if cancel() {
        return Err("Color analysis cancelled".into());
    }
    if fingerprint(source, filters, count)? != key {
        return Err("The video changed during color analysis. Retry the preview or export.".into());
    }
    fs::create_dir_all(cache)
        .map_err(|e| format!("Could not create the video palette cache: {e}"))?;
    let mut file = tempfile::NamedTempFile::new_in(cache).map_err(|e| e.to_string())?;
    file.write_all(&serde_json::to_vec(&colors).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    file.persist(&path).map_err(|e| e.to_string())?;
    // Palette files are small, but bound the number kept after repeated adjustments.
    if let Ok(entries) = fs::read_dir(cache) {
        let mut files: Vec<_> = entries
            .flatten()
            .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "json"))
            .filter_map(|entry| {
                entry
                    .metadata()
                    .ok()?
                    .modified()
                    .ok()
                    .map(|time| (time, entry.path()))
            })
            .collect();
        files.sort_by_key(|(time, _)| *time);
        let excess = files.len().saturating_sub(128);
        for (_, old) in files.into_iter().take(excess) {
            let _ = fs::remove_file(old);
        }
    }
    Ok(colors)
}
fn analyze(
    source: &Path,
    filters: &str,
    count: u16,
    cancel: &dyn Fn() -> bool,
) -> Result<Vec<[u8; 3]>, String> {
    let ffmpeg =
        crate::find_tool("ffmpeg").ok_or("Install FFmpeg in Settings → Must haves first")?;
    let directory = tempfile::tempdir().map_err(|e| e.to_string())?;
    let log = directory.path().join("analysis.log");
    // Decode the complete source, but collect a small frame per second. No seek or
    // selection is applied: every consumer analyzes the same full-video timeline.
    let filter=format!("fps=1:round=up,{filters},scale=w='min(256,iw)':h='min(144,ih)':force_original_aspect_ratio=decrease:flags=area,format=rgb24");
    let mut command = Command::new(ffmpeg);
    command
        .args(["-nostdin", "-v", "error", "-filter_threads", "1", "-i"])
        .arg(fs::canonicalize(source).map_err(|e| e.to_string())?)
        .args([
            "-map", "0:v:0", "-an", "-vf", &filter, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::from(
            fs::File::create(&log).map_err(|e| e.to_string())?,
        ));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not analyze video colors: {e}"))?;
    let out = child.stdout.take().ok_or("Missing color-analysis output")?;
    let histogram = thread::spawn(move || {
        let mut bins = vec![[0u64; 4]; 32768];
        let mut reader = BufReader::new(out);
        let mut pixel = [0u8; 3];
        loop {
            match reader.read_exact(&mut pixel) {
                Ok(()) => {
                    let index = ((usize::from(pixel[0]) >> 3) << 10)
                        | ((usize::from(pixel[1]) >> 3) << 5)
                        | (usize::from(pixel[2]) >> 3);
                    let bin = &mut bins[index];
                    bin[0] += 1;
                    for channel in 0..3 {
                        bin[channel + 1] += u64::from(pixel[channel]);
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => break,
                Err(error) => return Err(error.to_string()),
            }
        }
        Ok(bins)
    });
    let status = loop {
        if cancel() {
            let _ = child.kill();
            let _ = child.wait();
            break Err("Color analysis cancelled".to_string());
        }
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => thread::sleep(Duration::from_millis(40)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(error.to_string());
            }
        }
    };
    let bins = histogram
        .join()
        .map_err(|_| "Color analysis reader failed")??;
    let status = status?;
    if !status.success() {
        return Err(format!(
            "Video color analysis failed: {}",
            fs::read_to_string(log).unwrap_or_default()
        ));
    }
    let points: Vec<_> = bins
        .into_iter()
        .filter(|bin| bin[0] > 0)
        .map(|bin| Point {
            rgb: [
                ((bin[1] + bin[0] / 2) / bin[0]) as u8,
                ((bin[2] + bin[0] / 2) / bin[0]) as u8,
                ((bin[3] + bin[0] / 2) / bin[0]) as u8,
            ],
            count: bin[0],
        })
        .collect();
    if points.is_empty() {
        return Err("No video frames were available for color analysis".into());
    }
    Ok(quantize(&points, usize::from(count)))
}
fn bounds(points: &[Point], indices: &[usize]) -> ([u8; 3], [u8; 3], u64) {
    let mut lo = [255; 3];
    let mut hi = [0; 3];
    let mut weight = 0;
    for index in indices {
        let p = &points[*index];
        weight += p.count;
        for c in 0..3 {
            lo[c] = lo[c].min(p.rgb[c]);
            hi[c] = hi[c].max(p.rgb[c]);
        }
    }
    (lo, hi, weight)
}
fn quantize(points: &[Point], count: usize) -> Vec<[u8; 3]> {
    let mut boxes = vec![(0..points.len()).collect::<Vec<_>>()];
    while boxes.len() < count {
        let selected = boxes
            .iter()
            .enumerate()
            .filter(|(_, b)| b.len() > 1)
            .max_by_key(|(_, b)| {
                let (lo, hi, weight) = bounds(points, b);
                let range = (0..3).map(|c| u64::from(hi[c] - lo[c])).max().unwrap();
                range * range * weight
            })
            .map(|(i, _)| i);
        let Some(index) = selected else { break };
        let mut bucket = boxes.remove(index);
        let (lo, hi, total) = bounds(points, &bucket);
        let channel = (0..3).max_by_key(|c| hi[*c] - lo[*c]).unwrap();
        bucket.sort_by_key(|i| (points[*i].rgb[channel], points[*i].rgb));
        let mut weight = 0;
        let mut split = 1;
        for (i, index) in bucket.iter().enumerate() {
            weight += points[*index].count;
            split = i + 1;
            if weight >= total / 2 {
                break;
            }
        }
        split = split.clamp(1, bucket.len() - 1);
        let right = bucket.split_off(split);
        boxes.push(bucket);
        boxes.push(right);
    }
    let mut colors: Vec<[u8; 3]> = boxes
        .iter()
        .map(|bucket| {
            let mut sum = [0u64; 3];
            let mut weight = 0;
            for index in bucket {
                let p = &points[*index];
                weight += p.count;
                for c in 0..3 {
                    sum[c] += u64::from(p.rgb[c]) * p.count;
                }
            }
            [
                ((sum[0] + weight / 2) / weight) as u8,
                ((sum[1] + weight / 2) / weight) as u8,
                ((sum[2] + weight / 2) / weight) as u8,
            ]
        })
        .collect();
    colors.sort_unstable();
    colors.dedup();
    colors
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    fn fixture(directory: &Path) -> Option<PathBuf> {
        let ffmpeg = crate::find_tool("ffmpeg")?;
        let path = directory.join("greens.mp4");
        assert!(Command::new(ffmpeg).args(["-v","error","-f","lavfi","-i","color=c=0x062515:s=128x72:r=8:d=2","-vf","drawbox=x=0:y=0:w=iw/3:h=ih:color=0x4a6f2b:t=fill,drawbox=x=iw/3:y=0:w=iw/3:h=ih:color=0xbaff52:t=fill","-c:v","libx264","-pix_fmt","yuv420p","-y"]).arg(&path).status().unwrap().success());
        Some(path)
    }
    #[test]
    fn weighted_quantization_keeps_source_hues_and_does_not_invent_colors() {
        let points = [
            Point {
                rgb: [6, 37, 21],
                count: 100,
            },
            Point {
                rgb: [74, 111, 43],
                count: 200,
            },
            Point {
                rgb: [186, 255, 82],
                count: 100,
            },
        ];
        assert_eq!(
            quantize(&points, 3),
            vec![[6, 37, 21], [74, 111, 43], [186, 255, 82]]
        );
        assert_eq!(quantize(&points, 256).len(), 3);
    }
    #[test]
    fn shared_cache_preserves_greens_and_invalidates_color_changes() {
        let directory = tempfile::tempdir().unwrap();
        let Some(source) = fixture(directory.path()) else {
            return;
        };
        let cache = directory.path().join("cache");
        let effects = crate::video_effects::VideoEffects {
            enabled: true,
            dither: "bayer".into(),
            palette: "custom".into(),
            color_count: 3,
            ..Default::default()
        };
        let filters = effects.color_filters(128, 72);
        let colors = source_colors(&source, &filters, 3, &cache, &|| false).unwrap();
        assert_eq!(colors.len(), 3);
        assert!(
            colors.iter().all(|c| c[1] >= c[0] && c[1] >= c[2]),
            "unexpected non-green colors: {colors:?}"
        );
        assert!(colors.iter().any(|c| c[1] > 200));
        assert!(colors.iter().any(|c| c[1] < 80));
        let cached_path = cache.join(format!(
            "{}.json",
            fingerprint(&source, &filters, 3).unwrap()
        ));
        let modified = fs::metadata(&cached_path).unwrap().modified().unwrap();
        assert_eq!(
            colors,
            source_colors(&source, &filters, 3, &cache, &|| false).unwrap()
        );
        assert_eq!(
            modified,
            fs::metadata(&cached_path).unwrap().modified().unwrap()
        );
        let preview = directory.path().join("preview");
        let export = directory.path().join("export");
        fs::create_dir_all(&preview).unwrap();
        fs::create_dir_all(&export).unwrap();
        effects
            .prepare_assets(&preview, 128, 72, &source, &cache, &|| false)
            .unwrap();
        effects
            .prepare_assets(&export, 128, 72, &source, &cache, &|| false)
            .unwrap();
        assert_eq!(
            fs::read(preview.join("palette.bmp")).unwrap(),
            fs::read(export.join("palette.bmp")).unwrap()
        );
        assert_eq!(fs::read_dir(&cache).unwrap().count(), 1);
        let adjusted = crate::video_effects::VideoEffects {
            brightness: 0.2,
            ..effects
        };
        let changed = source_colors(
            &source,
            &adjusted.color_filters(128, 72),
            3,
            &cache,
            &|| false,
        )
        .unwrap();
        assert_ne!(changed, colors);
        assert_eq!(fs::read_dir(&cache).unwrap().count(), 2);
        let old_key = fingerprint(&source, &filters, 3).unwrap();
        let mut file = fs::OpenOptions::new().append(true).open(&source).unwrap();
        file.write_all(b"trailer").unwrap();
        assert_ne!(old_key, fingerprint(&source, &filters, 3).unwrap());
    }
    #[test]
    fn analyzes_scenes_across_the_whole_video_not_just_the_preview_frame() {
        let Some(ffmpeg) = crate::find_tool("ffmpeg") else {
            return;
        };
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("scenes.mp4");
        assert!(Command::new(ffmpeg)
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=green:s=64x64:r=8:d=1",
                "-f",
                "lavfi",
                "-i",
                "color=c=blue:s=64x64:r=8:d=1",
                "-filter_complex",
                "[0:v][1:v]concat=n=2:v=1:a=0[v]",
                "-map",
                "[v]",
                "-c:v",
                "libx264",
                "-y"
            ])
            .arg(&source)
            .status()
            .unwrap()
            .success());
        let colors = source_colors(
            &source,
            "eq=brightness=0:contrast=1:saturation=1",
            2,
            &directory.path().join("cache"),
            &|| false,
        )
        .unwrap();
        assert_eq!(colors.len(), 2);
        assert!(colors.iter().any(|c| c[1] > c[2] && c[1] > c[0]));
        assert!(colors.iter().any(|c| c[2] > c[1] && c[2] > c[0]));
    }
    #[test]
    fn cancellation_does_not_publish_a_partial_palette() {
        let directory = tempfile::tempdir().unwrap();
        let Some(source) = fixture(directory.path()) else {
            return;
        };
        let cache = directory.path().join("cancelled-cache");
        let checks = std::cell::Cell::new(0);
        let result = source_colors(
            &source,
            "eq=brightness=0:contrast=1:saturation=1",
            3,
            &cache,
            &|| {
                checks.set(checks.get() + 1);
                checks.get() > 2
            },
        );
        assert!(result.unwrap_err().contains("cancelled"));
        assert!(!cache.exists() || fs::read_dir(cache).unwrap().count() == 0);
    }
}
