import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function load(name) {
  const source = await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { regroupSubtitles, undoSubtitleGrouping, canUndoGrouping } = await load("subtitle-grouping");
const { validProject, exportSubtitles } = await load("subtitles");
const options = { maxWords: 2, maxLines: 2, breakOnPunctuation: false };
const makeProject = cues => ({ version: 1, source: "/clip.wav", model: "small", language: "en", rangeStart: 0, rangeEnd: 30, speakers: { a: "Alice", b: "Bob" }, recognizedSegments: [], cues });
const text = p => p.cues.map(c => c.text.trim()).join(" ").replace(/\s+/g, " ");
const wordCount = c => c.text.match(/\S+/g)?.length ?? 0;
function freeze(value) { Object.freeze(value); for (const child of Object.values(value)) if (child && typeof child === "object" && !Object.isFrozen(child)) freeze(child); return value; }

test("aligned captions split at word boundaries without rerunning recognition or mutating their source", () => {
  const words = ["one", "two", "three", "four", "five", "six"].map((word, i) => ({ word, start: i * .5, end: i * .5 + .4, speaker: "a" }));
  const original = freeze(makeProject([{ id: "old", text: "one two three four five six", start: 0, end: 3, speaker: "a", words }]));
  const result = regroupSubtitles(original, options);
  assert.equal(result.project.cues.length, 3);
  assert.equal(result.estimatedBlocks, 0);
  assert.deepEqual(result.project.cues.map(c => [c.start, c.end]), [[0,.9],[1,1.9],[2,3]]);
  assert.ok(result.project.cues.every(c => c.speaker === "a" && wordCount(c) <= 2));
  assert.equal(text(result.project), text(original));
  assert.equal(result.project.recognizedSegments, original.recognizedSegments);
  assert.equal(result.project.groupingSourceCues, original.cues);
  assert.ok(validProject(JSON.parse(JSON.stringify(result.project))));
});

test("corrected dialogue is kept verbatim apart from layout, with honest estimated timing and archived original alignment", () => {
  const original = makeProject([{ id: "edit", start: 1, end: 5, speaker: "a", text: "I corrected every single word here.", words: [{ word: "Wrong", start: 1, end: 2, speaker: "b" }] }]);
  const result = regroupSubtitles(original, options);
  assert.equal(text(result.project), original.cues[0].text);
  assert.equal(result.estimatedBlocks, 1);
  assert.ok(result.project.cues.every(c => c.speaker === "a" && c.timingEstimated && !c.words && c.end > c.start));
  assert.equal(result.project.cues[0].start, 1);
  assert.equal(result.project.cues.at(-1).end, 5);
  assert.deepEqual(result.project.groupingSourceCues[0].words, original.cues[0].words);
});

test("speaker labels, deliberate unassignment, long pauses and overlapping source cues survive regrouping", () => {
  const original = makeProject([
    { id: "a", start: 0, end: 1, text: "Alice speaks", speaker: "a" },
    { id: "b", start: 1, end: 2, text: "Bob replies", speaker: "b" },
    { id: "c", start: 2, end: 3, text: "Unassigned words", words: [{ word: "Unassigned", start: 2, end: 2.4, speaker: "b" }, { word: "words", start: 2.5, end: 3, speaker: "b" }] },
    { id: "d", start: 10, end: 12, text: "After pause" },
    { id: "e", start: 11, end: 13, text: "Overlapping speech" },
  ]);
  const result = regroupSubtitles(original, { ...options, maxWords: 50 });
  assert.deepEqual(result.project.cues.map(c => c.speaker), ["a", "b", undefined, undefined, undefined]);
  assert.equal(text(result.project), text(original));
});

test("same-speaker blocks merge up to the limit and punctuation and line limits remain optional constraints", () => {
  const original = makeProject([{ id: "1", start: 0, end: 1, speaker: "a", text: "Hello there." }, { id: "2", start: 1, end: 2, speaker: "a", text: "How are you?" }]);
  assert.equal(regroupSubtitles(original, { ...options, maxWords: 8 }).project.cues.length, 1);
  assert.equal(regroupSubtitles(original, { ...options, maxWords: 8, breakOnPunctuation: true }).project.cues.length, 2);
  const long = makeProject([{ id: "long", start: 0, end: 5, text: "extraordinary terminology remarkable illustration exceptional vocabulary" }]);
  const result = regroupSubtitles(long, { ...options, maxWords: 12, maxLines: 1 });
  assert.ok(result.project.cues.length > 1);
  assert.ok(result.project.cues.every(c => !c.text.includes("\n")));
});

test("undo restores exact cue text, timing and assignments while retaining subsequent speaker renames", () => {
  const before = makeProject([{ id: "original", start: 0, end: 3, speaker: "a", text: "This is my corrected dialogue." }]);
  const applied = regroupSubtitles(before, options).project;
  const renamed = { ...applied, speakers: { ...applied.speakers, a: "Interview host" } };
  const undo = { before, applied };
  assert.ok(canUndoGrouping(renamed, undo));
  const restored = undoSubtitleGrouping(renamed, undo);
  assert.deepEqual(restored.cues, before.cues);
  assert.equal(restored.speakers.a, "Interview host");
  assert.equal(restored.recognizedSegments, before.recognizedSegments);
  const edited = { ...applied, cues: applied.cues.map((c, i) => i ? c : { ...c, text: "Further correction" }) };
  assert.ok(!canUndoGrouping(edited, undo));
  assert.throws(() => undoSubtitleGrouping(edited, undo), /protect those edits/);
});

test("invalid settings and unsplittable timing never replace source data", () => {
  const project = makeProject([{ id: "short", start: 0, end: .001, text: "one two three four" }]);
  for (const maxWords of [0, -1, 1.5, 51, NaN]) assert.throws(() => regroupSubtitles(project, { ...options, maxWords }));
  assert.throws(() => regroupSubtitles(project, options), /millisecond precision/);
  assert.equal(project.cues[0].text, "one two three four");
  assert.ok(!validProject({ ...project, groupingSourceCues: [null] }));
});

test("Unicode, punctuation and empty captions are retained and exported with the selected grouping", () => {
  const original = makeProject([{ id: "u", start: 0, end: 3, text: "¡Hola! Café 👋 don't stop." }, { id: "empty", start: 4, end: 5, text: "" }]);
  const result = regroupSubtitles(original, { ...options, maxWords: 1 }).project;
  assert.equal(text(result).trim(), text(original).trim());
  assert.equal(result.cues.at(-1).text, "");
  assert.equal(new Set(result.cues.map(c => c.id)).size, result.cues.length);
  assert.match(exportSubtitles(result, "srt"), /¡Hola!/);
  const chinese = { ...makeProject([{ id: "cn", start: 0, end: 4, text: "你好，世界！这是字幕。" }]), language: "zh" };
  assert.equal(regroupSubtitles(chinese, options).project.cues.map(c => c.text.replace(/\s/g, "")).join(""), chinese.cues[0].text);
});

test("word limits preserve every edited word across a range of grouping sizes", () => {
  const original = makeProject(Array.from({ length: 12 }, (_, i) => ({ id: String(i), start: i * 2, end: i * 2 + 1.8, speaker: i % 3 ? "a" : "b", text: `edited${i} words${i} remain${i} intact${i}` })));
  for (const maxWords of [1,2,3,5,8,12,50]) {
    const result = regroupSubtitles(original, { ...options, maxWords }).project;
    assert.equal(text(result), text(original));
    assert.ok(result.cues.every(c => wordCount(c) <= maxWords && c.end > c.start));
    assert.ok(validProject(result));
  }
});

test("mixed-language blocks keep boundaries between Latin words when merged", () => {
  const project = { ...makeProject([{ id: "1", start: 0, end: 1, text: "hello" }, { id: "2", start: 1, end: 2, text: "world" }]), language: "zh" };
  assert.equal(regroupSubtitles(project, { ...options, maxWords: 5 }).project.cues[0].text, "hello world");
});
