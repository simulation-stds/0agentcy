use base64::{engine::general_purpose, Engine as _};
use std::process::Command;

#[tauri::command]
pub(crate) async fn generate_video_waveform(
    path: String,
    duration: f64,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !duration.is_finite() || duration <= 0.0 {
            return Err("Invalid video duration for waveform.".into());
        }
        // Silent videos have no waveform; other probe errors should remain visible.
        match super::probe_audio(path.clone()) {
            Ok(_) => {}
            Err(error) if error == "No audio stream found." => return Ok(None),
            Err(error) => return Err(error),
        }
        let ffmpeg = super::find_tool("ffmpeg").ok_or("FFmpeg was not found.")?;
        // Use the video timebase, including leading/trailing silence, so the
        // waveform and trim positions agree even for offset/short audio tracks.
        let filter = format!(
            "[0:a:0]aformat=channel_layouts=mono,aresample=8000:async=1:first_pts=0,apad,atrim=duration={duration},showwavespic=s=1800x64:colors=0x92d455:draw=full:filter=peak:scale=sqrt[wave]"
        );
        let mut command = Command::new(ffmpeg);
        command.args(["-v", "error", "-nostdin", "-i"])
            .arg(path)
            .args(["-filter_complex", &filter, "-map", "[wave]", "-frames:v", "1",
                "-c:v", "png", "-f", "image2pipe", "pipe:1"]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let output = command.output().map_err(|error| error.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        if output.stdout.is_empty() {
            return Err("FFmpeg returned an empty waveform.".into());
        }
        Ok(Some(format!("data:image/png;base64,{}",
            general_purpose::STANDARD.encode(output.stdout))))
    })
    .await
    .map_err(|error| error.to_string())?
}
