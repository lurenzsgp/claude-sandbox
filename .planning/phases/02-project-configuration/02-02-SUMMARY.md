---
phase: 02-project-configuration
plan: "02"
subsystem: cli-commands
tags: [cli, docker-mounts, state, start-command, status-command]
dependency_graph:
  requires: [resolveClaudeMdMount, SandboxState.claudeMd]
  provides: [--claude-md CLI option, claudeMd state persistence, claudeMd status display]
  affects: [src/commands/start.ts, src/commands/status.ts]
tech_stack:
  added: []
  patterns: [optional-flag integration, bind-spec injection, state-spread preservation]
key_files:
  created: []
  modified:
    - src/commands/start.ts
    - src/commands/status.ts
decisions:
  - "--claude-md option placed after --recreate; resolveClaudeMdMount called before ensureImage so validation errors fail fast before Docker I/O"
  - "Conflict detection uses startsWith(repo.hostPath + '/') to warn (not error) when CLAUDE.md is inside a mounted repo"
  - "Restart path relies on object spread ({ ...state, status, lastStartedAt }) to preserve claudeMd — no explicit reassignment needed since Docker bind is fixed at container creation time"
  - "writeState uses claudeMd: null when no --claude-md provided, matching the three-state type (string | null | undefined) from Plan 01"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-10"
  tasks_completed: 2
  files_modified: 2
---

# Phase 02 Plan 02: Wire --claude-md into start and status commands Summary

**One-liner:** `--claude-md <path>` option wired into start command — resolves path via `resolveClaudeMdMount()`, detects repo overlap, injects bind spec into container `HostConfig.Binds`, persists host path in `state.json`; status command prints `CLAUDE.md: <host-path> → /workspace/CLAUDE.md` when set.

## What Was Built

### Task 1: --claude-md option in start.ts

Made the following changes to `src/commands/start.ts`:

1. **Updated import** — added `resolveClaudeMdMount` and `type MountSpec` to the import from `../docker/mounts.js`
2. **Added CLI option** — `.option('--claude-md <path>', 'Path to project CLAUDE.md to mount at /workspace/CLAUDE.md (read-only)')` after `--recreate`
3. **Updated action signature** — added `claudeMd?: string` to the opts type
4. **Early resolution with conflict detection** — after `resolveBlockedPaths`, resolves `claudeMdMount` and warns if the CLAUDE.md path falls inside a mounted repo directory
5. **Bind spec injection** — `claudeMdMount.bindSpec` spread into the `binds` array between `claudeMount.bindSpec` and `secret.bindSpec`
6. **State persistence** — `claudeMd: claudeMdMount ? claudeMdMount.hostPath : null` in the `writeState` call
7. **Restart path** — verified that `{ ...state, status: 'running', lastStartedAt: now }` spread already preserves `claudeMd` (no change needed)
8. **Recreate path** — verified that `existingState = null` path flows to new container creation using `claudeMdMount` from `opts.claudeMd` (no change needed)

### Task 2: claudeMd display in status.ts

Added three lines after the existing `Mounts:` loop in `src/commands/status.ts`:

```typescript
if (state.claudeMd) {
  console.log(`CLAUDE.md:  ${state.claudeMd} → /workspace/CLAUDE.md`);
}
```

## Verification

All 30 tests pass (unchanged from Plan 01 baseline — no test files modified in this plan):

```
Test Files  4 passed (4)
      Tests  30 passed (30)
```

TypeScript compilation: `Build complete: dist/claude-sandbox.cjs`

Smoke test: `node dist/claude-sandbox.cjs start --help | grep claude-md` output:
```
  --claude-md <path>  Path to project CLAUDE.md to mount at /workspace/CLAUDE.md
```

## Deviations from Plan

None — plan executed exactly as written. All 8 sub-steps from Task 1 and the Task 2 change applied as specified. Both code paths verified (restart spreads state, recreate flows to new creation).

## Known Stubs

None — all integration points are wired end-to-end: CLI option parsed, path resolved, bind spec injected, state persisted, status displays the value.

## Self-Check: PASSED

- `src/commands/start.ts` contains `resolveClaudeMdMount` — FOUND
- `src/commands/start.ts` contains `.option('--claude-md` — FOUND
- `src/commands/start.ts` contains `claudeMdMount` — FOUND
- `src/commands/start.ts` contains `claudeMdMount ? [claudeMdMount.bindSpec]` — FOUND
- `src/commands/start.ts` contains `claudeMd:` in writeState call — FOUND
- `src/commands/start.ts` contains conflict detection notice — FOUND
- `src/commands/status.ts` contains `state.claudeMd` — FOUND
- `src/commands/status.ts` contains `/workspace/CLAUDE.md` — FOUND
- Commit a6d5d07 (Task 1) exists — FOUND
- Commit b9d4721 (Task 2) exists — FOUND
