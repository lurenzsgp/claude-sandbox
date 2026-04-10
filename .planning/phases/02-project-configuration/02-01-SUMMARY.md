---
phase: 02-project-configuration
plan: "01"
subsystem: docker-mounts, state-manager
tags: [mounts, state, typescript, tdd]
dependency_graph:
  requires: []
  provides: [resolveClaudeMdMount, SandboxState.claudeMd]
  affects: [src/commands/start.ts]
tech_stack:
  added: []
  patterns: [TDD red-green, optional-field backward-compat]
key_files:
  created: []
  modified:
    - src/docker/mounts.ts
    - src/docker/mounts.test.ts
    - src/state/manager.ts
    - src/state/manager.test.ts
decisions:
  - "containerPath for CLAUDE.md is /workspace/CLAUDE.md — container working directory per D-01"
  - "claudeMd field is optional (?) and typed string | null to support three states: absent (old files), set (mounted), null (explicitly cleared)"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-10"
  tasks_completed: 2
  files_modified: 4
---

# Phase 02 Plan 01: Foundation — resolveClaudeMdMount and SandboxState.claudeMd Summary

**One-liner:** `resolveClaudeMdMount()` in mounts.ts resolves host CLAUDE.md path to `/workspace/CLAUDE.md:ro` bind spec; `claudeMd?: string | null` added to SandboxState interface with backward-compatible JSON persistence.

## What Was Built

### Task 1: resolveClaudeMdMount() in mounts.ts

Added `export function resolveClaudeMdMount(hostPathRaw: string): MountSpec` to `src/docker/mounts.ts`, following the exact same pattern as `resolveClaudeConfigMount()`.

- Resolves relative paths to absolute via `resolve()`
- Returns `MountSpec` with `bindSpec = "${hostPath}:/workspace/CLAUDE.md:ro"`, `containerPath = '/workspace/CLAUDE.md'`
- Throws `SandboxError` with message containing "CLAUDE.md not found" when file does not exist
- No new imports required — `resolve`, `existsSync`, and `SandboxError` were already present

### Task 2: claudeMd field on SandboxState

Extended `SandboxState` interface in `src/state/manager.ts` with:

```typescript
/** Resolved absolute path to project CLAUDE.md, or null if not mounted (D-05) */
claudeMd?: string | null;
```

No changes to `readState()`, `writeState()`, or `reconcileState()` — they already handle optional fields via JSON serialization/deserialization.

## Tests Added

**mounts.test.ts** — 4 new tests in `describe('resolveClaudeMdMount')`:
1. Returns ro bind spec targeting `/workspace/CLAUDE.md` with correct `bindSpec`, `containerPath`, `hostPath`
2. Resolves relative paths to absolute (hostPath starts with `/`)
3. Throws `SandboxError` when file does not exist
4. Error message contains "CLAUDE.md not found"

**manager.test.ts** — 3 new tests in `describe('SandboxState claudeMd persistence')`:
1. Persists `claudeMd` string through write/read round-trip
2. Persists `claudeMd: null` through write/read round-trip (returns `null`, not `undefined`)
3. State without `claudeMd` field deserializes without error (backward compat — field is `undefined`)

**Full test suite:** 30/30 tests pass (7 new + 23 existing). `npm run build` exits 0.

## Verification

```
Test Files  4 passed (4)
      Tests  30 passed (30)
```

TypeScript compilation: `Build complete: dist/claude-sandbox.cjs`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all functions return concrete values and tests assert against real behavior.

## Self-Check: PASSED

- `src/docker/mounts.ts` contains `export function resolveClaudeMdMount` — FOUND
- `src/docker/mounts.ts` contains `/workspace/CLAUDE.md` — FOUND
- `src/docker/mounts.test.ts` contains `describe('resolveClaudeMdMount'` — FOUND
- `src/state/manager.ts` contains `claudeMd?: string | null` — FOUND
- `src/state/manager.test.ts` contains `describe('SandboxState claudeMd persistence'` — FOUND
- Commits c42e376 and 46db02f exist — FOUND
