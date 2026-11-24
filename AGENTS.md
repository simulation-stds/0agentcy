# Videomaxxing

Follow the [workspace workflow](docs/WORKSPACE.md) for task branches, worktrees, validation, staging, and retirement. The [architecture guide](docs/ARCHITECTURE.md) describes application responsibilities and source locations.

Use the [shared Linux runtime store](docs/WORKSPACE.md#shared-linux-tool-installations) for new Linux tool installers. Resolve the same versioned installation for setup, status, and execution, and keep staging installs and user data isolated.

Use the [Graphify workflow](docs/GRAPHIFY_WORKFLOW.md) to check graph freshness and navigate relationships in the current checkout. Verify results against source and tests before making changes.
