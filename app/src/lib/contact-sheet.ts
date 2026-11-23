import { invoke } from "@tauri-apps/api/core";

export const maxContactSheetFrames = 48;
export const contactSheetResolutions = [
  { value: "320", label: "Compact (320 × 180)" },
  { value: "480", label: "Medium (480 × 270)" },
  { value: "640", label: "High (640 × 360)" },
];

export function validContactSheetFrameCount(count: number) {
  return Number.isInteger(count) && count >= 1 && count <= maxContactSheetFrames;
}

type ContactSheetOptions = {
  path: string;
  start: number;
  end: number;
  count: number;
  tileWidth: number;
  outputName: string;
};

type SampledFrame = {
  time: number;
  dataUrl: string;
};

function timestamp(seconds: number) {
  const centiseconds = Math.round(seconds * 100);
  return [
    Math.floor(centiseconds / 360000),
    Math.floor(centiseconds / 6000) % 60,
    Math.floor(centiseconds / 100) % 60,
  ].map((value) => String(value).padStart(2, "0")).join(":")
    + "." + String(centiseconds % 100).padStart(2, "0");
}

export async function exportContactSheet({ path, start, end, count, tileWidth, outputName }: ContactSheetOptions) {
  const frames = await invoke<SampledFrame[]>("sample_contact_sheet", { path, start, end, count, tileWidth });
  const columns = Math.min(count, Math.ceil(Math.sqrt(count * 4 / 3)));
  const rows = Math.ceil(count / columns);
  const frameHeight = tileWidth * 9 / 16;
  const labelHeight = Math.round(tileWidth * 30 / 320);
  const tileHeight = frameHeight + labelHeight;
  const gap = Math.round(tileWidth * 8 / 320);
  const canvas = document.createElement("canvas");
  canvas.width = columns * (tileWidth + gap) + gap;
  canvas.height = rows * (tileHeight + gap) + gap;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create a canvas for the contact sheet.");

  context.fillStyle = "#101010";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = `${Math.round(tileWidth * 16 / 320)}px monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const [index, frame] of frames.entries()) {
    const image = new Image();
    image.src = frame.dataUrl;
    await image.decode();
    const x = gap + (index % columns) * (tileWidth + gap);
    const y = gap + Math.floor(index / columns) * (tileHeight + gap);
    const scale = Math.min(tileWidth / image.naturalWidth, frameHeight / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.fillStyle = "#000";
    context.fillRect(x, y, tileWidth, frameHeight);
    context.drawImage(image, x + (tileWidth - width) / 2, y + (frameHeight - height) / 2, width, height);
    context.fillStyle = "#fff";
    context.fillText(timestamp(frame.time), x + tileWidth / 2, y + frameHeight + labelHeight / 2);
  }

  const stem = outputName.trim().replace(/\.[^./\\]+$/, "") || "contact-sheet";
  return invoke<{ outputPath: string; log: string }>("save_data_url_to_downloads", {
    outputName: `${stem}.png`,
    dataUrl: canvas.toDataURL("image/png"),
  });
}
