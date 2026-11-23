import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/subtitles.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { subtitleTimestamp, exportSubtitles, validProject } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const project = { version: 1, source: "/video.mp4", language: "en", model: "small", rangeStart: 80, rangeEnd: 90, speakers: { s1: "Alice" }, recognizedSegments: [], cues: [
  { id: "1", start: 81.234, end: 83.567, text: "Hello <world> & everyone", speaker: "s1" },
  { id: "2", start: 85, end: 86, text: "Second line" },
] };
test("subtitle timestamps preserve milliseconds and carry across minute and hour boundaries", () => {
  assert.equal(subtitleTimestamp(59.9996), "00:01:00.000");
  assert.equal(subtitleTimestamp(3601.234, ","), "01:00:01,234");
});
test("selection exports preserve source timing unless explicitly shifted", () => {
  assert.match(exportSubtitles(project, "srt"), /00:01:21,234 --> 00:01:23,567/);
  assert.match(exportSubtitles(project, "srt", true), /00:00:01,234 --> 00:00:03,567/);
  assert.equal(project.cues[0].start, 81.234);
});
test("WebVTT escapes dialogue markup and optionally includes speaker names", () => {
  const text = exportSubtitles(project, "vtt", false, true);
  assert.ok(text.startsWith("WEBVTT\n\n"));
  assert.match(text, /Alice: Hello &lt;world&gt; &amp; everyone/);
  assert.doesNotMatch(exportSubtitles(project, "srt"), /Alice:/);
});
test("edited cues export chronologically and empty cues do not produce blank captions", () => {
  const p = { ...project, cues: [{ ...project.cues[1] }, { ...project.cues[0] }, { id: "3", start: 87, end: 88, text: " " }] };
  assert.equal(exportSubtitles(p, "txt"), "Hello <world> & everyone\n\nSecond line\n");
  assert.match(exportSubtitles(p, "srt"), /^1\n00:01:21/);
});
test("project imports reject malformed times, duplicate identifiers and invalid speaker maps", () => {
  assert.ok(validProject(project));
  assert.ok(!validProject({ ...project, cues: [{ ...project.cues[0], start: NaN }] }));
  assert.ok(!validProject({ ...project, cues: [{ ...project.cues[0], end: 0 }] }));
  assert.ok(!validProject({ ...project, cues: [project.cues[0], project.cues[0]] }));
  assert.ok(!validProject({ ...project, speakers: [] }));
  assert.ok(!validProject({ ...project, recognizedSegments: null }));
});
test("detected speaker metadata survives project export and renamed speakers appear in subtitles", () => {
  const labeled = { ...project, speakerDetection: { model: "pyannote/speaker-diarization-community-1", count: 1,
    turns: [{ start: 81.234, end: 83.567, speaker: "s1" }] } };
  const reopened = JSON.parse(JSON.stringify(labeled));
  assert.ok(validProject(reopened));
  assert.match(exportSubtitles(reopened, "srt", false, true), /Alice: Hello/);
  assert.ok(!validProject({ ...labeled, speakerDetection: { ...labeled.speakerDetection, turns: [{ start: 83, end: 82, speaker: "s1" }] } }));
});
