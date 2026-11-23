import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function createLog() {
  const source = await readFile(new URL("../src/hooks/use-log.ts", import.meta.url), "utf8");
  const states = [];
  const setters = [];
  const react = {
    useCallback: (callback) => callback,
    useState(initial) {
      const index = states.length;
      states.push(initial);
      setters.push((value) => {
        states[index] = typeof value === "function" ? value(states[index]) : value;
      });
      return [initial, setters[index]];
    },
  };
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  new Function("require", "exports", outputText)(() => react, exports);
  const { appendLog } = exports.useLog();
  return { appendLog, notification: () => states[1] };
}

test("audio success survives subsequent project and waveform log messages", async () => {
  const log = await createLog();
  for (const message of [
    "Audio complete: Dialogue.wav",
    "Audio complete: Music.wav",
    "Audio complete: Effects.wav",
    "Audio project saved: sample.audio-project.json",
    "Waveform ready.",
  ]) log.appendLog(message);
  assert.deepEqual(log.notification(), { id: 3, outcome: "success" });
});

test("every completed run triggers a new event, including repeated paths and failures", async () => {
  const log = await createLog();
  log.appendLog("Audio complete: Clean Voice.wav");
  log.appendLog("Audio complete: Clean Voice.wav");
  assert.deepEqual(log.notification(), { id: 2, outcome: "success" });
  log.appendLog("Audio failed: FFmpeg exited");
  log.appendLog("Waveform ready.");
  assert.deepEqual(log.notification(), { id: 3, outcome: "failure" });
});

test("video completion and failure keep using the shared notifications", async () => {
  const log = await createLog();
  log.appendLog("Done: video.mp4");
  assert.deepEqual(log.notification(), { id: 1, outcome: "success" });
  log.appendLog("Job failed: encoder error");
  assert.deepEqual(log.notification(), { id: 2, outcome: "failure" });
  log.appendLog("Audio load failed: unsupported input");
  assert.deepEqual(log.notification(), { id: 2, outcome: "failure" });
});
