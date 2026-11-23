export const subtitleFonts = ["Arial", "Verdana", "Georgia", "Times New Roman", "Courier New", "DejaVu Sans"] as const;
export type SubtitleStyle = {
  font: string; size: number; color: string; outline: number;
  outlineColor?: string; backgroundColor?: string; bold?: boolean; uppercase?: boolean;
  padding?: number; radius?: number; backgroundMode?: "caption" | "words" | "active-word";
  highlightColor?: string; highlightTextColor?: string;
  backgroundOpacity: number; position: "top" | "center" | "bottom";
};
// Sizes use a 1920 × 1080 reference frame in both the preview and ASS export.
export const defaultSubtitleStyle: SubtitleStyle = { font: "Arial", size: 48, color: "#ffffff", outline: 2, backgroundOpacity: 65, position: "bottom" };
export function resolvedSubtitleStyle(style?: SubtitleStyle) {
  return { outlineColor: "#000000", backgroundColor: "#000000", bold: false, uppercase: false, padding: 8, radius: 4,
    backgroundMode: "caption" as "caption" | "words" | "active-word", highlightColor: "#facc15", highlightTextColor: "#000000", ...defaultSubtitleStyle, ...style };
}
export function validSubtitleStyle(value: unknown): value is SubtitleStyle {
  if (!value || typeof value !== "object") return false;
  const s = value as SubtitleStyle;
  const color = (v: unknown) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
  return typeof s.font === "string" && s.font.trim().length > 0 && s.font.length <= 128 && !/[\x00-\x1f,{}\\"]/.test(s.font) &&
    [s.outlineColor, s.backgroundColor, s.highlightColor, s.highlightTextColor].every(v => v === undefined || color(v)) &&
    [s.bold, s.uppercase].every(v => v === undefined || typeof v === "boolean") &&
    (s.padding === undefined || (Number.isFinite(s.padding) && s.padding >= 0 && s.padding <= 40)) &&
    (s.radius === undefined || (Number.isFinite(s.radius) && s.radius >= 0 && s.radius <= 40)) &&
    (s.backgroundMode === undefined || ["caption", "words", "active-word"].includes(s.backgroundMode)) && Number.isFinite(s.size) && s.size >= 12 && s.size <= 120 &&
    typeof s.color === "string" && /^#[0-9a-f]{6}$/i.test(s.color) && Number.isFinite(s.outline) && s.outline >= 0 && s.outline <= 8 &&
    Number.isFinite(s.backgroundOpacity) && s.backgroundOpacity >= 0 && s.backgroundOpacity <= 100 && ["top", "center", "bottom"].includes(s.position);
}

export type TranscriptWord = { word: string; start?: number; end?: number; score?: number; speaker?: string };
export type SubtitleGroupingOptions = { maxWords: number; maxLines: number; breakOnPunctuation: boolean };
export type SubtitleCue = { wordTimingEstimated?: boolean; timingEstimated?: boolean; id: string; start: number; end: number; text: string; speaker?: string; words?: TranscriptWord[] };
export type TranscriptProject = {
  version: 1; source: string; language: string; model: string; warnings?: string[];
  speakerDetection?: { model: string; count: number; turns: { start: number; end: number; speaker: string }[] };
  subtitleStyle?: SubtitleStyle;
  subtitleGrouping?: SubtitleGroupingOptions;
  groupingSourceCues?: SubtitleCue[];
  rangeStart: number; rangeEnd: number; cues: SubtitleCue[];
  recognizedSegments: SubtitleCue[]; speakers: Record<string, string>;
};

export function validProject(value: unknown): value is TranscriptProject {
  if (!value || typeof value !== "object") return false;
  const p = value as TranscriptProject;
  return (p.subtitleStyle === undefined || validSubtitleStyle(p.subtitleStyle)) && (p.speakerDetection === undefined || (!!p.speakerDetection && typeof p.speakerDetection.model === "string" &&
    Number.isInteger(p.speakerDetection.count) && p.speakerDetection.count >= 0 && Array.isArray(p.speakerDetection.turns) &&
    p.speakerDetection.turns.every(turn => !!turn && Number.isFinite(turn.start) && turn.start >= 0 && Number.isFinite(turn.end) && turn.end > turn.start && typeof turn.speaker === "string"))) &&
    (p.warnings === undefined || (Array.isArray(p.warnings) && p.warnings.every(w => typeof w === "string"))) &&
    p.version === 1 && typeof p.source === "string" && typeof p.language === "string" &&
    typeof p.model === "string" && Number.isFinite(p.rangeStart) && p.rangeStart >= 0 &&
    Number.isFinite(p.rangeEnd) && p.rangeEnd > p.rangeStart &&
    !!p.speakers && typeof p.speakers === "object" && !Array.isArray(p.speakers) &&
    Object.values(p.speakers).every(v => typeof v === "string") &&
    Array.isArray(p.cues) && Array.isArray(p.recognizedSegments) &&
    (p.groupingSourceCues === undefined || Array.isArray(p.groupingSourceCues)) &&
    (p.subtitleGrouping === undefined || (!!p.subtitleGrouping && Number.isInteger(p.subtitleGrouping.maxWords) && p.subtitleGrouping.maxWords >= 1 && p.subtitleGrouping.maxWords <= 50 && [1, 2].includes(p.subtitleGrouping.maxLines) && typeof p.subtitleGrouping.breakOnPunctuation === "boolean")) &&
    [p.cues, p.recognizedSegments, ...(p.groupingSourceCues ? [p.groupingSourceCues] : [])].every(cues => cues.every(c => !!c && typeof c === "object" && typeof c.id === "string" &&
      (c.wordTimingEstimated === undefined || typeof c.wordTimingEstimated === "boolean") && (c.timingEstimated === undefined || typeof c.timingEstimated === "boolean") && typeof c.text === "string" && Number.isFinite(c.start) && c.start >= 0 &&
      Number.isFinite(c.end) && c.end > c.start && (c.speaker === undefined || typeof c.speaker === "string") &&
      (c.words === undefined || (Array.isArray(c.words) && c.words.every(w => !!w && typeof w === "object" && typeof w.word === "string" &&
        (w.start === undefined || Number.isFinite(w.start)) && (w.end === undefined || Number.isFinite(w.end))))))) &&
    new Set(p.cues.map(c => c.id)).size === p.cues.length;
}

export function subtitleTimestamp(seconds: number, separator = ".") {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}${separator}${String(ms % 1000).padStart(3, "0")}`;
}

export function exportSubtitles(project: TranscriptProject, format: "srt" | "vtt" | "txt", shiftToZero = false, includeSpeakers = false) {
  const offset = shiftToZero ? project.rangeStart : 0;
  const cues = [...project.cues].filter(c => c.text.trim()).sort((a, b) => a.start - b.start);
  const text = (c: SubtitleCue) => {
    const label = c.speaker && (Object.entries(project.speakers).find(([id]) => id === c.speaker)?.[1] || c.speaker);
    // Export literal dialogue, never executable WebVTT markup.
    const raw = `${includeSpeakers && label ? `${label}: ` : ""}${c.text.trim().replace(/\r\n?/g, "\n").replace(/\n[ \t]*\n+/g, "\n")}`;
    return format === "vtt" ? raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : raw;
  };
  if (format === "txt") return cues.map(text).join("\n\n") + "\n";
  return (format === "vtt" ? "WEBVTT\n\n" : "") + cues.map((c, i) =>
    `${format === "srt" ? `${i + 1}\n` : ""}${subtitleTimestamp(c.start - offset, format === "srt" ? "," : ".")} --> ${subtitleTimestamp(c.end - offset, format === "srt" ? "," : ".")}\n${text(c)}\n`
  ).join("\n");
}


/** ASS uses inverse alpha, BGR colour order and centisecond timestamps. */
export function exportAss(project: TranscriptProject, shiftToZero = false, includeSpeakers = false, frame?: { width: number; height: number }) {
  const s = resolvedSubtitleStyle(project.subtitleStyle);
  if (!validSubtitleStyle(s)) throw new Error("Invalid subtitle style.");
  const color = `&H00${s.color.slice(5, 7)}${s.color.slice(3, 5)}${s.color.slice(1, 3)}`.toUpperCase();
  const assColor = (hex: string) => `${hex.slice(5,7)}${hex.slice(3,5)}${hex.slice(1,3)}`.toUpperCase();
  const box = `&H${Math.round(255 * (1 - s.backgroundOpacity / 100)).toString(16).padStart(2, "0")}${assColor(s.backgroundColor)}`.toUpperCase();
  const width = frame && Number.isFinite(frame.width) && Number.isFinite(frame.height) && frame.width > 0 && frame.height > 0 ? Math.max(1, Math.round(1080 * frame.width / frame.height)) : 1920;
  const margin = Math.round(width * .05);
  const alignment = { bottom: 2, center: 5, top: 8 }[s.position];
  const style = (name: string, border: number, outline: number, outlineColor: string) =>
    `Style: ${name},${s.font},${s.size},${color},${color},${outlineColor},&HFF000000,${s.bold ? -1 : 0},0,0,0,100,100,0,0,${border},${outline},0,${alignment},${margin},${margin},100,1`;
  const timestamp = (time: number) => {
    const cs = Math.max(0, Math.round(time * 100));
    return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
  };
  // Break ASS control sequences without allowing dialogue to inject override tags.
  const literal = (text: string) => text.replace(/\r\n?/g, "\n").replace(/\\/g, "\\\uFEFF").replace(/{/g, "\\{").replace(/}/g, "\\}").replace(/\n/g, "\\N").replace(/[\u0000-\u0008\u000b-\u001f]/g, "");
  const offset = shiftToZero ? project.rangeStart : 0;
  const events = [...project.cues].filter(c => c.text.trim()).sort((a, b) => a.start - b.start).flatMap(c => {
    const label = c.speaker && (Object.entries(project.speakers).find(([id]) => id === c.speaker)?.[1] || c.speaker);
    const text = literal(`${includeSpeakers && label ? `${label}: ` : ""}${s.uppercase ? c.text.trim().toLocaleUpperCase() : c.text.trim()}`);
    const start = Math.max(0, c.start - offset);
    const end = Math.max(start + .01, c.end - offset);
    const line = (layer: number, name: string) => `Dialogue: ${layer},${timestamp(start)},${timestamp(end)},${name},,0,0,0,,${text}`;
    // Separate box and text layers keep background opacity independent of the outline.
    return [...(s.backgroundOpacity > 0 ? [line(0, "Background")] : []), line(1, "Default")];
  });
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: 1080\nWrapStyle: 0\nScaledBorderAndShadow: yes\nYCbCr Matrix: TV.709\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${style("Default", 1, s.outline, `&H00${assColor(s.outlineColor)}`)}\n${style("Background", 3, s.padding, box)}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join("\n")}\n`;
}
