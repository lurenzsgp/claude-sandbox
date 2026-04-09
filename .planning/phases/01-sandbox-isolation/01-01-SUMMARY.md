---
phase: "01"
plan: "01"
subsystem: project-scaffold
tags: [typescript, esbuild, docker, cli, commander]
dependency_graph:
  requires: []
  provides:
    - package.json with bin field and all dependencies installed
    - tsconfig.json with bundler moduleResolution
    - esbuild.config.ts CJS bundle config
    - Dockerfile with ARG UID/GID and @anthropic-ai/claude-code
    - entrypoint.sh with secrets injection and CLAUDE_SANDBOX marker
    - src/cli.ts Commander.js skeleton
  affects:
    - All subsequent plans (depend on this foundation)
tech_stack:
  added:
    - commander@14.0.3 (CLI framework)
    - dockerode@4.0.10 (Docker API client)
    - ignore@7.0.5 (gitignore-style pattern matching)
    - esbuild@0.28.0 (bundler)
    - tsx@4.21.0 (TypeScript dev runner)
    - typescript@6.0.2 (type safety)
    - vitest@4.1.4 (test framework)
  patterns:
    - CJS output format for esbuild to avoid ESM/CJS interop issues
    - esbuild banner for shebang injection
    - Secrets file bind-mount pattern for API key injection
    - ARG UID/GID pattern for container user matching
key_files:
  created:
    - package.json
    - tsconfig.json
    - esbuild.config.ts
    - .gitignore
    - Dockerfile
    - entrypoint.sh
    - src/cli.ts
  modified: []
decisions:
  - "CJS output format for esbuild bundle: ESM format caused dynamic require errors when bundling commander@14 (CJS) into ESM context on Node 18; switched to format: 'cjs' with .cjs extension"
  - "Output path changed to dist/claude-sandbox.cjs (bin field updated accordingly) to avoid Node's 'type: module' treating .js files as ESM"
  - "No shebang in src/cli.ts: esbuild banner config adds it; double shebang in source caused SyntaxError"
metrics:
  duration: "~3 minutes"
  completed: "2026-04-09T16:04:50Z"
  tasks_completed: 3
  files_created: 7
---

# Phase 01 Plan 01: Project Scaffold Summary

**One-liner:** TypeScript CLI project scaffold with esbuild CJS bundling, Dockerfile with ARG UID/GID and @anthropic-ai/claude-code, and entrypoint.sh for secrets-file API key injection.

## What Was Built

Seven files created forming the complete project foundation:

- **package.json** — ESM module project with `bin` field pointing to `dist/claude-sandbox.cjs`, all production and dev dependencies pinned to exact versions
- **tsconfig.json** — TypeScript config targeting ES2022, ESNext modules, bundler moduleResolution for esbuild compatibility
- **esbuild.config.ts** — Bundles `src/cli.ts` to a single CJS file with shebang banner; all dependencies included
- **.gitignore** — Excludes `node_modules/`, `dist/`, and runtime state at `~/.claude-sandbox/`
- **Dockerfile** — `node:22-bookworm` base; installs `@anthropic-ai/claude-code@latest`; accepts `ARG UID` and `ARG GID` build args; creates `sandbox` user with matching IDs; ENTRYPOINT delegates to `entrypoint.sh`
- **entrypoint.sh** — Reads API key from `/run/secrets/anthropic-api-key`, exports `ANTHROPIC_API_KEY`; sets `CLAUDE_SANDBOX=1`; calls `exec "$@"` for CMD pass-through
- **src/cli.ts** — Commander.js program skeleton with name, description, version; no commands yet (registered in Plans 04–05)

`npm install` completed successfully with 124 packages installed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed shebang from src/cli.ts**
- **Found during:** Task 3 build verification
- **Issue:** src/cli.ts had `#!/usr/bin/env node` shebang AND esbuild.config.ts had a `banner.js` shebang. The bundle output started with two shebangs, causing `SyntaxError: Invalid or unexpected token` when Node tried to parse the file.
- **Fix:** Removed the shebang from `src/cli.ts`. The esbuild banner is the single canonical source of the shebang in the final bundle. For `tsx` development mode (`npm run dev`), the shebang is not needed.
- **Files modified:** `src/cli.ts`
- **Commit:** 1d8cead

**2. [Rule 1 - Bug] Changed esbuild output format from ESM to CJS**
- **Found during:** Task 3 build verification
- **Issue:** `format: 'esm'` caused `Error: Dynamic require of "node:events" is not supported` when running the bundle. commander@14 ships as CJS and uses `require("node:events")` internally. esbuild's ESM shim wraps CJS code with `__require2` but cannot handle built-in module requires in ESM context on Node 18.
- **Fix:** Changed `format: 'esm'` to `format: 'cjs'` and output file to `dist/claude-sandbox.cjs`. Updated `package.json` bin field from `dist/claude-sandbox.js` to `dist/claude-sandbox.cjs`. The `.cjs` extension tells Node to treat the file as CommonJS regardless of the `"type": "module"` package setting.
- **Files modified:** `esbuild.config.ts`, `package.json`
- **Commit:** 1d8cead

**Impact on downstream plans:** The bin entry point is `dist/claude-sandbox.cjs` instead of `dist/claude-sandbox.js`. Any plan referencing the output path must use the `.cjs` extension. The `must_haves.key_links` pattern `dist/claude-sandbox\.js` is technically superseded by `dist/claude-sandbox\.cjs`, but the contract (single bundled binary) is preserved.

## Verification Results

| Check | Result |
|-------|--------|
| `package.json` bin field | `dist/claude-sandbox.cjs` |
| commander@14.0.3 installed | PASS |
| dockerode@4.0.10 installed | PASS |
| ignore@7.0.5 installed | PASS |
| tsconfig.json moduleResolution | `bundler` |
| esbuild.config.ts outfile | `dist/claude-sandbox.cjs` |
| Dockerfile ARG UID/GID | PASS |
| Dockerfile @anthropic-ai/claude-code | PASS (not @anthropic-sdk) |
| Dockerfile useradd -m -u ${UID} | PASS |
| entrypoint.sh ANTHROPIC_API_KEY | PASS |
| entrypoint.sh CLAUDE_SANDBOX=1 | PASS |
| entrypoint.sh exec "$@" | PASS |
| entrypoint.sh executable | PASS (`-rwxr-xr-x`) |
| `npm run build` exits 0 | PASS |
| dist/claude-sandbox.cjs shebang | `#!/usr/bin/env node` |
| `node dist/claude-sandbox.cjs --version` | `0.1.0` |

## Interface Contracts for Downstream Plans

- **CLI binary:** `dist/claude-sandbox.cjs` (referenced via `bin` field as `claude-sandbox`)
- **Container name constant:** `"claude-sandbox"` (to be used in lifecycle plans)
- **Image tag constant:** `"claude-sandbox:latest"` (to be used in lifecycle plans)
- **State file schema:** `~/.claude-sandbox/state.json` (created in Plan 02)
- **Commander extension point:** `src/cli.ts` `program` object — later plans add subcommands via `program.command()`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 75101fb | Initialize project scaffold with package.json, tsconfig, esbuild config |
| Task 2 | 51a637d | Add Dockerfile with UID/GID matching and entrypoint.sh for API key injection |
| Task 3 | 1d8cead | Add CLI skeleton and verify build system (includes bug fixes) |

## Self-Check: PASSED

- [x] `package.json` exists — FOUND
- [x] `tsconfig.json` exists — FOUND
- [x] `esbuild.config.ts` exists — FOUND
- [x] `Dockerfile` exists — FOUND
- [x] `entrypoint.sh` exists — FOUND
- [x] `src/cli.ts` exists — FOUND
- [x] Commit 75101fb — FOUND
- [x] Commit 51a637d — FOUND
- [x] Commit 1d8cead — FOUND
