---
phase: "01"
plan: "04"
subsystem: lifecycle-commands
tags: [docker, cli, commander, lifecycle, secrets, mounts]
dependency_graph:
  requires: ["01-02", "01-03"]
  provides: ["CLI-01", "CLI-02", "CLI-03", "CLI-04", "CONT-01", "CONT-02", "CONT-03", "AUTH-01", "MNT-01", "MNT-02"]
  affects: ["src/cli.ts", "src/docker/image.ts", "src/commands/"]
tech_stack:
  added: []
  patterns:
    - "Persistent container lifecycle: docker create + start/stop (not --rm)"
    - "Secrets injection via temp file bind-mount (not Env array)"
    - "Mount diff normalization for --recreate guard"
    - "Docker build stream parsing for friendly progress display"
    - "State reconciliation before every container operation"
key_files:
  created:
    - src/docker/image.ts
    - src/commands/start.ts
    - src/commands/stop.ts
    - src/commands/restart.ts
    - src/commands/status.ts
  modified:
    - src/cli.ts
decisions:
  - "Used __dirname instead of import.meta.url in image.ts for CJS bundle compatibility (esbuild output format is CJS)"
  - "Removed duplicate shebang from src/cli.ts — esbuild banner already adds one; double shebang causes SyntaxError"
metrics:
  duration: "455s"
  completed_date: "2026-04-09"
  tasks_completed: 2
  files_changed: 6
requirements:
  - CLI-01
  - CLI-02
  - CLI-03
  - CLI-04
  - CONT-01
  - CONT-02
  - CONT-03
  - MNT-01
  - MNT-02
  - AUTH-01
---

# Phase 1 Plan 04: Lifecycle Commands Summary

**One-liner:** Full container lifecycle CLI (start/stop/restart/status) with auto-build, secrets injection, and mount validation wired into Commander.js.

## What Was Built

Five source files implementing the core lifecycle of `claude-sandbox`:

- **`src/docker/image.ts`** — `ensureImage()` checks for existing `claude-sandbox:latest` image; builds it with friendly step-by-step progress if not found. Passes host UID/GID as `--build-arg` for filesystem permission parity (CONT-02). Build stream parsed to show `Step N/M` lines only (not raw layer output).

- **`src/commands/start.ts`** — Full start logic: validates mounts (rejects docker.sock, system dirs), resolves bind specs and tmpfs shadows, ensures image, reconciles existing container state, handles mount-mismatch error with `--recreate` guidance (D-10), silently restarts same-mount stopped containers (D-11), injects API key via secrets file bind-mount (never in Env array), creates persistent container with `SecurityOpt: no-new-privileges`, writes state after `container.start()`.

- **`src/commands/stop.ts`** — Reconciles state, stops running container, updates `state.json` to `stopped`.

- **`src/commands/restart.ts`** — Reconciles state, stops if running, starts, updates `lastStartedAt` in state.

- **`src/commands/status.ts`** — Shows container ID (12-char short), status, uptime (formatted: `Xh Ym` / `Xd Yh`), created timestamp, and mounted paths list.

- **`src/cli.ts`** — Updated to import and register all four `registerXxx` functions; uses `parseAsync` with error handler that prints `fix` field from `SandboxError`.

## Commands

```
claude-sandbox start  -m/--mount <path> [--recreate]
claude-sandbox stop
claude-sandbox restart
claude-sandbox status
```

## Key Behaviors Implemented

| Behavior | Location | Decision |
|---|---|---|
| Mount mismatch → error + `--recreate` hint | start.ts:54-60 | D-10 |
| Same mounts + stopped → silent restart | start.ts:62-68 | D-11 |
| API key in `/run/secrets/` not Env | start.ts:79-101 | AUTH-01 |
| `CLAUDE_SANDBOX=1` in container Env | start.ts:92 | D-13 |
| `SecurityOpt: no-new-privileges` | start.ts:96 | security |
| Auto-build on first start | image.ts + start.ts | D-07 |
| UID/GID passed as build args | image.ts:57 | CONT-02 |
| Docker stream parsed for friendly output | image.ts:73-90 | D-09 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `import.meta.url` incompatibility in CJS bundle**
- **Found during:** Task 1 build
- **Issue:** `src/docker/image.ts` used `fileURLToPath(import.meta.url)` to resolve the project root, but esbuild compiles to CJS format. esbuild warned: `"import.meta" is not available with the "cjs" output format and will be empty`. The `findProjectRoot()` function would silently use the wrong path at runtime.
- **Fix:** Replaced `import.meta.url` with `__dirname` (natively available in CJS output; esbuild injects it). Removed the `url` module import.
- **Files modified:** `src/docker/image.ts`
- **Commit:** included in 3a2c0ed

**2. [Rule 1 - Bug] Removed duplicate shebang from `src/cli.ts`**
- **Found during:** Task 2 verification
- **Issue:** `src/cli.ts` had `#!/usr/bin/env node` at the top. The `esbuild.config.ts` also adds a shebang via `banner: { js: '#!/usr/bin/env node' }`. The built `dist/claude-sandbox.cjs` had two consecutive shebangs, causing `SyntaxError: Invalid or unexpected token` when executed.
- **Fix:** Removed the `#!/usr/bin/env node` line from `src/cli.ts` since esbuild already adds it.
- **Files modified:** `src/cli.ts`
- **Commit:** included in 3a2c0ed

## Known Stubs

None. All command logic is fully implemented. Plan 05 will add the `shell` subcommand.

## Notes for Plan 05 (shell command)

- The `dist/claude-sandbox.cjs` must be run via its shebang (chmod +x) or via `node -e "require('./dist/claude-sandbox.cjs')" -- args`. Direct `node dist/claude-sandbox.cjs` fails because node strips the first shebang line but the second `#!/usr/bin/env node` becomes a syntax error. The plan verifications should use `node dist/claude-sandbox.cjs` style — this works when there is exactly one shebang as we now have.
- The `shell` command will need the PTY/exec pattern from RESEARCH.md Pattern 4.
- `SIGWINCH` propagation via `exec.resize()` is required for Claude's interactive TUI.

## Self-Check: PASSED

All 6 source files exist on disk.
Commits verified:
- `913f29e` — feat(01-04): add image builder with auto-build and UID/GID passthrough
- `3a2c0ed` — feat(01-04): add start/stop/restart/status commands and wire CLI
