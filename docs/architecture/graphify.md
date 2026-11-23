# Graphify historical setup notes

For the current checkout-local coding workflow, see `docs/GRAPHIFY_WORKFLOW.md`.

The checkout-local workflow below supersedes the historical setup notes later in this file. The global Graphify MCP connection already exists; do not install or duplicate it for this repository.

From the intended checkout, run `./scripts/graphify.ps1 check` (`--json` is available) before relying on the graph. The check reports checkout, branch, commit, graph path, and new/changed/deleted/excluded files using Graphify's own discovery and content hashes. Code and document/semantic freshness are distinct. `refresh` does local code-only extraction and clustering without LLM calls or HTML; `build` additionally generates visual reports. The extraction cache is probed for write access before either operation. Set `GRAPHIFY_PYTHON` if Graphify is installed outside uv's standard tool location.

Search exact identifiers, errors, filenames, and configuration keys first. Use Graphify for callers, connections, dependencies, and impact. Start MCP `query_graph` at depth 1 and about 1500 tokens, always with this checkout's absolute `project_path`. Narrow by node or relation if output is truncated before raising the budget. Read current definitions, consumers, contracts, and tests before acting; absent graph edges are not proof of absent dependencies. Refresh after a branch switch, merge, or structural edit. Consult current documents for semantic changes.

Graph, manifest, and cache state are ignored and local to each checkout. Do not share `GRAPHIFY_OUT` with another checkout or use a default MCP graph. The historical graph may contain files from before exclusions were tightened. No embeddings, rerankers, or second context service are part of this workflow.

## Historical setup notes

Graphify gives Codex a persistent map of this repo. It indexes code/docs into `graphify-out/graph.json`, then Codex can query that graph instead of repeatedly rereading the whole project.

## Project Setup

Graphify is installed once in the user Python environment:

```powershell
python -m pip install --user graphifyy
python -m pip install --user openai
```

The `openai` package is still needed for Graphify's DeepSeek and Ollama backends because both use OpenAI-compatible API clients.

This repo also has a project-scoped Codex install:

```powershell
& "$env:APPDATA\Python\Python310\Scripts\graphify.exe" install --project --platform codex
```

That created:

- `AGENTS.md`
- `.agents/skills/graphify/SKILL.md`
- `.codex/hooks.json`
- `.codex/graphify-hook.ps1`

The hook is non-blocking. If Graphify is unavailable, it exits cleanly.

## Local Config

Use `.env.local` for real local config and API keys. It is ignored by git.

Start from:

```powershell
Copy-Item .env.example .env.local
```

Then load it in each PowerShell session before running Graphify:

```powershell
.\scripts\load-graphify-env.ps1
```

This sets `GRAPHIFY_EXE`, backend variables, and model variables for the current shell only.

## Models We Used

### Ollama

Local model used:

```text
qwen2.5-coder:7b
```

Config:

```env
GRAPHIFY_BACKEND=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen2.5-coder:7b
OLLAMA_API_KEY=ollama
```

Run:

```powershell
.\scripts\load-graphify-env.ps1
& $env:GRAPHIFY_EXE extract . --out . --backend ollama --model qwen2.5-coder:7b --max-concurrency 1 --api-timeout 900
```

Notes:

- Runs locally through Ollama.
- Cheap/free after model download.
- `qwen2.5-coder:7b` handled the repo, but sometimes returned invalid JSON and Graphify had to split/retry chunks.
- Use `--max-concurrency 1` for local stability.

### DeepSeek

Remote model used:

```text
deepseek-v4-flash
```

Config:

```env
GRAPHIFY_BACKEND=deepseek
DEEPSEEK_API_KEY=your_key_here
GRAPHIFY_DEEPSEEK_MODEL=deepseek-v4-flash
```

Run into a test folder first:

```powershell
.\scripts\load-graphify-env.ps1
& $env:GRAPHIFY_EXE extract . --out temp\graphify-deepseek-fresh --backend deepseek --model $env:GRAPHIFY_DEEPSEEK_MODEL --max-concurrency 1 --api-timeout 900
```

Run into the normal project graph:

```powershell
.\scripts\load-graphify-env.ps1
& $env:GRAPHIFY_EXE extract . --out . --backend deepseek --model $env:GRAPHIFY_DEEPSEEK_MODEL --max-concurrency 1 --api-timeout 900
```

Notes:

- DeepSeek is better for clean semantic extraction than the local 7B model.
- `deepseek-v4-flash` is the preferred first choice for cost.
- Graphify estimated the DeepSeek/Ollama test costs in the terminal output. Keep an eye on token counts when doing full rebuilds.

## Useful Commands

Explain a concept:

```powershell
& $env:GRAPHIFY_EXE explain "FaceFusion" --graph graphify-out\graph.json
```

Find a path between concepts:

```powershell
& $env:GRAPHIFY_EXE path "VideoSidebar" "run_facefusion_job" --graph graphify-out\graph.json
```

Ask a graph query:

```powershell
& $env:GRAPHIFY_EXE query "Where is FaceFusion wired into the app?" --graph graphify-out\graph.json --budget 2000
```

Generate a browsable HTML tree:

```powershell
& $env:GRAPHIFY_EXE tree --graph graphify-out\graph.json --output graphify-out\GRAPH_TREE.html --label "Simulation Studio"
```

Keep the graph fresh after code edits:

```powershell
.\scripts\load-graphify-env.ps1
& $env:GRAPHIFY_EXE update .
```

## What To Commit

Commit workflow scripts, instructions, and ignore rules when reviewed. Keep `graphify-out/` local to each checkout, including `graph.json`, `manifest.json`, extraction caches, and visual reports.

## Indexing Boundaries

Do not index runtime folders or downloaded tools. The app keeps large local binaries, Conda environments, generated previews, exports, and model caches under:

- `input/`
- `output/`
- `temp/`
- `tools/`
- `app/node_modules/`
- `app/src-tauri/target/`
- `app_settings.local.json`
- `.env.local`

Those paths are listed in `.graphifyignore`.
