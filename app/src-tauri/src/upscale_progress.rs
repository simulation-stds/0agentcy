use std::collections::HashSet;

pub struct UpscaleFrameProgress {
    total: usize,
    completed: HashSet<usize>,
}

impl UpscaleFrameProgress {
    pub fn new(total: usize) -> Self {
        Self {
            total,
            completed: HashSet::new(),
        }
    }

    pub fn update(&mut self, line: &str) -> Option<(String, Option<f64>)> {
        let trimmed = line.trim();
        // Real-ESRGAN prints tile percentages that restart for every image.
        if trimmed
            .strip_suffix('%')
            .and_then(|value| value.parse::<f64>().ok())
            .is_some()
        {
            return None;
        }

        let frame = trimmed
            .strip_suffix(" done")
            .and_then(|value| value.rsplit_once(" -> "))
            .map(|(_, output)| output)
            .and_then(|output| output.rsplit(['/', '\\']).next())
            .and_then(|name| name.strip_prefix("frame_"))
            .and_then(|name| name.strip_suffix(".png"))
            .filter(|number| !number.is_empty() && number.bytes().all(|byte| byte.is_ascii_digit()))
            .and_then(|number| number.parse::<usize>().ok())
            .filter(|frame| *frame > 0 && *frame <= self.total);

        if let Some(frame) = frame {
            if !self.completed.insert(frame) {
                return None;
            }
            let fraction = self.completed.len() as f64 / self.total as f64;
            return Some((format!("Upscaling frame: {frame}"), Some(fraction)));
        }

        Some((line.to_string(), None))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_saved_frame_ids_and_counts_out_of_order_completions() {
        let mut progress = UpscaleFrameProgress::new(1252);
        for (index, frame) in [1250, 1252, 1251].into_iter().enumerate() {
            let line = format!(
                r"D:\input folder\frame_{frame:08}.png -> D:\output folder\frame_{frame:08}.png done"
            );
            let (message, fraction) = progress.update(&line).unwrap();
            assert_eq!(message, format!("Upscaling frame: {frame}"));
            assert_eq!(fraction, Some((index + 1) as f64 / 1252.0));
            assert!(progress.update(&line).is_none());
        }
    }

    #[test]
    fn suppresses_tile_percentages_but_preserves_errors() {
        let mut progress = UpscaleFrameProgress::new(2);
        for line in ["0.00%", "99.80%", " 100.00% "] {
            assert!(progress.update(line).is_none());
        }
        for line in [
            "encode image frame_00000001.png failed",
            "GPU error at 50%",
            "Cancelled",
        ] {
            assert_eq!(progress.update(line), Some((line.to_string(), None)));
        }
    }

    #[test]
    fn rejects_invalid_completions_and_finishes_at_one() {
        let mut progress = UpscaleFrameProgress::new(2);
        for name in [
            "frame_00000000.png",
            "frame_00000003.png",
            "frame_x.png",
            "other.png",
        ] {
            let line = format!("in.png -> /out/{name} done");
            assert_eq!(progress.update(&line), Some((line, None)));
        }
        assert_eq!(
            progress
                .update("in.png -> /out/frame_00000001.png done")
                .unwrap()
                .1,
            Some(0.5)
        );
        assert_eq!(
            progress
                .update("in.png -> /out/frame_00000002.png done")
                .unwrap()
                .1,
            Some(1.0)
        );
    }
}
