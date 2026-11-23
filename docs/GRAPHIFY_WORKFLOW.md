# Graphify coding workflow

Graphify is a navigation aid. Current source, consumers, contracts, and tests are authoritative. This project reuses the existing global Graphify MCP connection; no project MCP configuration is needed.

## Select and check the checkout

Run from the intended development checkout:

```powershell
./scripts/graphify.ps1 check
./scripts/graphify.ps1 check --json
./scripts/graphify.ps1 refresh
./scripts/graphify.ps1 build
```

`check` reports the absolute checkout, branch, commit, graph path, and new/changed/deleted/excluded source files. It uses Graphify's discovery, ignore rules, and content hashes. Code freshness and document/semantic freshness are separate. A current code graph does not prove full language coverage or correct behavior. The underlying Python checker exits 0 for current code, 2 for stale or missing state, and 1 for invalid state; the PowerShell wrapper raises on nonzero.

`refresh` runs local code-only extraction and clustering without an LLM or HTML. It checks cache write access before extraction. `build` also generates HTML reports. Neither command re-extracts document semantics. Set `GRAPHIFY_PYTHON` to the Graphify Python interpreter if the default uv tool installation is unavailable. Refresh after a branch switch, merge, or structural edit.

The ignored `graphify-out/` directory holds graph, manifest, and extraction cache state for this checkout. Do not share `GRAPHIFY_OUT` or substitute another worktree's graph.

## Locate, connect, read, change, validate

```powershell
rg -n 'useVideoWorkspaceController' app/src
./scripts/graphify.ps1 query 'useVideoWorkspaceController' --budget 1500
./scripts/graphify.ps1 affected 'VideoWorkspace' --depth 1
```

Search exact identifiers, filenames, errors, and config keys first. Use Graphify for callers, dependencies, connections, and impact. For MCP `query_graph`, start with `depth=1` and `token_budget=1500`. Pass this checkout's **absolute** `project_path` on **every** MCP call. Narrow noisy or truncated output by node or relation before raising the budget. Inspect current definitions, consumers, contracts, and tests before editing. Absent graph edges do not prove absent relationships; expand with exact search.

The existing global MCP server offers `query_graph`, `get_node`, `get_neighbors`, `shortest_path`, `graph_stats`, `god_nodes`, and `get_community`. It reads saved graphs and does not refresh source. Do not use its default graph.

## Boundaries

`.graphifyignore` and repository ignore rules exclude credentials, runtime data, environments, generated output, and vendored/reference repositories. The older graph may include files indexed before these boundaries were tightened. No embeddings, rerankers, or second context service are part of this workflow.
