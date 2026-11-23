import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function load(name) {
  const source = await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { ToolCheckCache } = await load("tool-check-cache");
const { actionTools, settingsTools } = await load("tool-loading");

test("idle startup and browser-only image tools do not probe native runtimes", () => {
  assert.deepEqual(actionTools("video", "trim_mp4", false), []);
  assert.deepEqual(actionTools("image", "dither", false), []);
  assert.deepEqual(actionTools("image", "palette", false), []);
  assert.deepEqual(settingsTools("general", "folders"), []);
});
test("actions request only their dependencies", () => {
  assert.deepEqual(actionTools("video", "trim_mp4", true), ["ffmpeg", "ffprobe"]);
  assert.deepEqual(actionTools("video", "wan21_generate", false), ["wan21"]);
  assert.deepEqual(actionTools("image", "flux2", false), ["flux2"]);
  assert.deepEqual(actionTools("image", "vosr", false), ["vosr"]);
  assert.deepEqual(actionTools("image", "compress", false, "avif"), ["imagemagick", "libavif"]);
  assert.deepEqual(settingsTools("video", "editing"), ["realesrgan", "rife"]);
  assert.deepEqual(settingsTools("image", "generative"), ["flux2"]);
  assert.deepEqual(settingsTools("image", "editing"), ["vosr", "oxipng", "libavif", "libwebp", "mozjpeg"]);
});
test("concurrent requests and revisits share one successful probe", async () => {
  const cache = new ToolCheckCache();
  let calls = 0;
  const probe = async () => { calls++; };
  await Promise.all([cache.run("flux2", probe), cache.run("flux2", probe)]);
  await cache.run("flux2", probe);
  assert.equal(calls, 1);
  assert.deepEqual(cache.keys(), ["flux2"]);
});
test("failed probes can be retried", async () => {
  const cache = new ToolCheckCache();
  await assert.rejects(cache.run("rife", async () => { throw new Error("probe failed"); }));
  let calls = 0;
  await cache.run("rife", async () => { calls++; });
  assert.equal(calls, 1);
});
test("mutation refresh waits for old results and deduplicates concurrent refreshes", async () => {
  const cache = new ToolCheckCache();
  let release;
  const events = [];
  const initial = cache.run("supir", async () => {
    await new Promise(resolve => { release = resolve; });
    events.push("old");
  });
  await Promise.resolve();
  const refresh = () => cache.run("supir", async () => { events.push("new"); }, true);
  const a = refresh(); const b = refresh();
  release();
  await Promise.all([initial, a, b]);
  assert.deepEqual(events, ["old", "new"]);
});
test("refreshing one tool keeps unrelated results cached", async () => {
  const cache = new ToolCheckCache();
  let flux = 0;
  await cache.run("flux2", async () => { flux++; });
  await cache.run("rife", async () => {});
  await cache.run("rife", async () => {}, true);
  await cache.run("flux2", async () => { flux++; });
  assert.equal(flux, 1);
});

test("VOSR offers only CUDA device identifiers, without Vulkan favourites or guessed devices", async () => {
  const { vosrDeviceOptions } = await load("vosr-devices");
  assert.deepEqual(vosrDeviceOptions([]), [{ value: "", label: "Auto" }]);
  const id = "GPU-8c4fc32f-55b8-cba4-b97b-195ae9820734";
  assert.deepEqual(vosrDeviceOptions([{ id, name: "RTX 4070" }]), [
    { value: "", label: "Auto" }, { value: id, label: "RTX 4070" },
  ]);
});
