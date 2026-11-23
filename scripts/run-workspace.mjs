import { spawn } from "node:child_process";
import { constants, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [mode = "dev", portArg = mode === "staging" ? "1425" : "1420", ...extra] = process.argv.slice(2);
const port = Number(portArg);
if (!["dev", "staging"].includes(mode) || !/^\d+$/.test(portArg) || port < 1024 || port > 65534 || extra.length) {
  console.error("Usage: node scripts/run-workspace.mjs [dev|staging] [port]");
  process.exit(2);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const app = join(root, "app");
const config = { build: { devUrl: `http://localhost:${port}` } };
const env = {
  ...process.env,
  VIDEOMAXXING_DEV_PORT: String(port),
  CARGO_TARGET_DIR: join(app, "src-tauri", "target", process.platform, mode),
};
delete env.VIDEOMAXXING_STAGING_PROFILE;

if (mode === "staging") {
  const profile = join(root, "profiles", "staging.local.json");
  try {
    copyFileSync(join(root, "profiles", "staging.example.json"), profile, constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const modelRoot = join(root, "tools", "staging-models");
  mkdirSync(modelRoot, { recursive: true });
  env.VIDEOMAXXING_STAGING_PROFILE = profile;
  env.VIDEOMAXXING_SHARED_MODELS = modelRoot;
  config.identifier = "com.w2ds.videomaxxxing.staging";
  config.productName = "Simulation Studio Staging";
  config.app = { windows: [{
    title: "Simulation Studio Staging", width: 1280, height: 780, minWidth: 980, minHeight: 680,
  }] };
}

const child = spawn(process.execPath, [
  join(app, "node_modules", "@tauri-apps", "cli", "tauri.js"),
  "dev", "--config", JSON.stringify(config), "--", "--locked",
], { cwd: app, env, stdio: "inherit" });
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
