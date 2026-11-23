# Videomaxxing workspace

Use `main` as the integration branch. Keep a primary checkout on `main` and open a focused `codex/<task>` branch for each feature or fix.

```text
Videomaxxing/
  AGENTS.md                     Repository guidance
  README.md                     Overview and launch instructions
  docs/WORKSPACE.md              Branches, testing, and release workflow
  docs/ARCHITECTURE.md           Application responsibilities and code map
  app/{src,src-tauri,tests}/     Frontend, backend, and tests
  scripts/                      Development and launch tools
  Identity/                     Reviewed identity assets
  design/                       Reviewed references and local captures
  run_app.sh                    Ubuntu source launcher
  run_app.bat                   Windows source launcher
  Launch Videomaxxing.desktop   Ubuntu desktop shortcut
  profiles/staging.example.json Tracked staging settings template
  profiles/staging.local.json   Ignored staging settings
  app_settings.local.json       Ignored development settings
  shared-runtimes.local.json    Ignored shared runtime configuration
  input/ output/ temp/ tools/   Local media, exports, scratch data, and tools
  private-test-evidence/        Ignored validation files
  graphify-out/                 Checkout-local Graphify data
  graphify-out-windows/         Local archive of the previous Windows graph
  worktrees/<task>/             Ignored linked checkouts
```

## Start and review a task

Check `git status --short` before switching branches. Keep pending work on its branch or capture a verified backup if it needs to move. With the primary checkout ready, run `git switch main`, `git fetch origin`, and `git merge --ff-only origin/main`. Use `git switch -c codex/<task>` for a task in the current folder. For parallel work, dependency isolation, or a running preview, keep the primary checkout on main and run the following from its root.

```sh
git worktree add -b codex/<task> worktrees/<task> main
```

Replace `<task>` throughout these examples. Install dependencies inside the task checkout with `cd app` and `npm ci`. Each checkout keeps its own `node_modules`, Cargo target, local settings, inputs, outputs, scratch files, and Graphify state. Use `./run_app.sh` on Ubuntu or `.\run_app.bat` on Windows. For a concurrent preview, run `node scripts/run-workspace.mjs dev 1422` from the task root and choose a free port. The standard source launch uses 1420.

Review with `git diff --ignore-space-at-eol` and `git diff --cached`. Stage specific paths or hunks, then commit. Push with `git push -u origin codex/<task>` and open a PR against `main`. Include the checks performed, any runtime or OS still unverified, and the staging result for the candidate commit.

## Validate and stage

From the checkout root, run the relevant checks. Install the Tauri system prerequisites for the platform and make FFmpeg and FFprobe available to the app.

```sh
cd app
npm run build
node --test tests/*.test.mjs
python3 -B -m unittest discover -s tests -p 'test_*.py'
cargo test --locked --lib --manifest-path src-tauri/Cargo.toml
```

On Windows use `npm.cmd` if PowerShell selects an unavailable script shim, and `py -3` for Python when needed. Review skipped tests and run the relevant model, GPU, credential, or codec checks when their prerequisites are available. Check native playback and seeking, a trim export, and the affected feature on both supported platforms.

Create a staging worktree at the exact candidate commit from the primary checkout. Use `git worktree add --detach worktrees/staging <commit>`, then install dependencies in that checkout. From its root run `node scripts/run-workspace.mjs staging`. The launcher copies the sanitized template to `profiles/staging.local.json` on first run and uses that profile and port 1425. Pass a different free port as the final argument when needed.

The staging window has its own Tauri identifier. The template sends exports to `output/staging`, puts configured scratch work in `temp/staging`, and disables completion sounds. Code paths that use `temp/` directly still stay inside the staging checkout. Staging uses `tools/staging-models` for VOSR and SUPIR and separate app data for runtime installers that use the Tauri app-data path. Leave the optional shared Conda manifest unset in staging unless its target is explicitly approved for the test. Shared OS tools and any external model services still use the machine or account configured for the test. Record those targets when validating the feature. WhisperX staging credentials use a separate keyring entry. Use test credentials and test media, and keep transcripts, logs, and screenshots under `private-test-evidence/` or a private store. This app has no central database or external notification service to configure today.

Record the exact commit, OS, checks, and artifacts. After staging approval and the repository's merge approval, update primary main with `git fetch origin` and `git merge --ff-only origin/main`. If the merge changes the release candidate's source, validate that commit before promotion. Build the desktop bundle on each target OS with `npm run tauri build -- -- --locked` from `app/`. Smoke-test the generated installers in a test account or VM before distributing the tested artifacts. Keep private inputs, credentials, and environment files out of release assets.

## Retire completed work

Check `git log main..codex/<task>` and the merged PR before cleaning up, especially after a squash merge. In each linked checkout inspect `git status --short --ignored=matching`, active previews or builds, and references from releases or staging. Confirm how to recover any unique commits, local settings, untracked files, or ignored evidence. Present the specific branch and worktree removals for approval. Use `git worktree remove` and `git branch -d` after those checks. Request a separate decision for force removal, remote-branch deletion, or disposal of private data.
