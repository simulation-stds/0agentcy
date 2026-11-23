# Video effects

Choose **Video effects** in the video **Action** dropdown. Its controls appear
on the left. Selecting another action disables the effects preview. Settings are
kept per source during the current app session; subtitle project JSON does not
currently store them. **Reset video effects** restores neutral settings.

## Controls

- Dithering: off, ordered Bayer, blue noise, Floyd–Steinberg or Sierra Lite.
- Palettes: black/white, grayscale, Game Boy, CGA, RGB and **Custom color count**.
  Enter any whole number from 2 to 256. Adaptive reduction extracts up to that
  many representative colors from the full source video, preserving its hues
  instead of generating an unrelated RGB palette. Sources with fewer distinct
  colors may use fewer colors. Individual swatches are not required.
- Color: brightness, contrast, saturation, monochrome and posterization.
- Texture: pixel size, fixed-seed grain, scanlines and vignette. Pixel size reduces
  the working resolution before dithering, then enlarges the quantized result
  with nearest-neighbor scaling. Dither dots therefore grow with the pixel size
  in both previews and exports. Grain, scanlines and vignette are applied afterward.

Blue noise is available in both image and video dithering. A shared 32×32
void-and-cluster rank tile, generated with seed 23 by
`scripts/generate_blue_noise.py`, supplies a stable pattern. Video preview and export tile
this mask at the reduced working resolution before palette quantization. Image dithering
retains its noise-scale and noise-seed controls; video exposes noise strength.
One palette is reused across every frame, including selection exports. For custom
counts, an initial analysis samples a small frame each second across the complete
video after color adjustments and pixelation, before dithering, textures and
captions. Preview and export share the cached palette. Changing the source, color
adjustments or color count invalidates it; seeking, changing the selection or
dithering algorithm does not. Analysis can be cancelled and incomplete palettes
are not cached. Fixed presets retain their existing colors.

Textures after quantization may add
intermediate colors. These effects do not require an additional model download.

## Paused-frame preview and comparison

Effects previews are rendered by FFmpeg, using the same filter pipeline and full
source resolution as MP4 exports, then downscaled to fit the preview. There is
no live GPU video rendering. Pause, seek or change settings to render the current
frame automatically after a short debounce. Play/pause, mute, loop and timeline
controls keep working; playback shows the original video and live captions.
The static effects preview is hidden immediately during playback and restored
with an updated frame on pause. Stale/superseded render requests are cancelled.

**Compare original** places the original frame on the left and the processed
frame on the right. Drag the divider directly over the preview (or use keyboard
arrows) to change the split. Video zoom, pan, zoom buttons and wheel-zoom handlers
are removed. Turning comparison off displays just the processed paused frame.
The rendered frame's timestamp is shown in a small label, without a comparison
footer or extra range slider. Rendering failures leave original playback visible
and report the error instead of covering it with a blank canvas.

All dithering algorithms, including error diffusion, use their actual FFmpeg
implementation for paused-frame previews. Video export still composites effects
before subtitles by default.

## Subtitles and MP4

By default effects process the source before subtitles are composited. **Apply
effects to subtitles too** instead processes the whole composition. **Include
subtitles in comparison and MP4** controls caption inclusion in this panel's
paused preview and export. Captions use the existing shared renderer and word timing;
text edits, grouping, speaker labels and saved transcripts are not changed.

**Export effects MP4** writes a new H.264/AAC MP4, retaining source audio when
present. It exports the full source, or the current trim selection when **Export
selection only** is enabled. Subtitle timing is clipped to the same selection.
Progress, cancellation and temporary-file cleanup use the existing captioned
video export pipeline. Enabled effects are also included in captioned-video
exports from Subtitle options. Other Action operations retain their existing behavior, including AI tools
and their own resizing settings.

Export never replaces the source. A failed or cancelled encode does not publish
an incomplete output. Source dimensions are retained (odd dimensions are padded
for MP4); this panel does not add an output-resolution control. Effects and
subtitle compositing require re-encoding.

Native tests render every algorithm with color/texture settings and verify both
subtitle orderings. MP4 tests check dithering, caption ordering, audio retention,
timed overlay changes and preservation of existing output on cancellation.

Adaptive-palette tests check source hues, scenes across the full timeline, shared
preview/export assets, cache invalidation and cancellation.
