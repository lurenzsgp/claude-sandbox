---
phase: 01-sandbox-isolation
plan: "03"
subsystem: docker/mounts
tags: [mounts, docker, tmpfs, ignore-files, path-normalization]
dependency_graph:
  requires:
    - 01-01 (project scaffold, package.json with ignore@7.0.5, SandboxError)
  provides:
    - MountSpec interface
    - TmpfsSpec interface
    - resolveMount() function
    - resolveClaudeConfigMount() function
    - resolveBlockedPaths() function
  affects:
    - 01-04 (lifecycle manager will consume resolveMount, resolveClaudeConfigMount, resolveBlockedPaths)
tech_stack:
  added:
    - ignore@7.0.5 (gitignore-style pattern matching for .claude-sandbox-ignore files)
  patterns:
    - TDD (RED → GREEN) with Vitest
    - path.resolve() for absolute path normalization
    - upward directory walk for ignore file discovery
    - tmpfs shadowing for blocked subpaths
key_files:
  created:
    - src/docker/mounts.ts
    - src/docker/mounts.test.ts
  modified: []
decisions:
  - Container path for ~/.claude is /home/sandbox/.claude (not /root/.claude) — Dockerfile USER is sandbox, not root
  - ignore@7.0.5 used for .claude-sandbox-ignore parsing (not custom regex) — handles negation, **, escaping
  - resolveBlockedPaths returns TmpfsSpec[] with Mode 0o555 (read-only empty directory)
  - findIgnoreFiles walks UP from mountHostPath, stops at monorepoRoot (if set) or filesystem root
metrics:
  duration_seconds: 1970
  completed_date: "2026-04-09"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 2
---

# Phase 01 Plan 03: Volume Mount Resolver Summary

Volume mount resolver with gitignore-based tmpfs shadow mechanism: `resolveMount()`, `resolveClaudeConfigMount()`, `resolveBlockedPaths()` using `ignore@7.0.5` for spec-correct pattern matching.

## What Was Built

`src/docker/mounts.ts` provides the complete mount resolution layer for Dockerode:

- **`resolveMount(hostPathRaw)`** — normalizes path via `path.resolve()` (handles relative paths, trailing slashes), throws `SandboxError` with adjacent-directory suggestions if path missing, returns `MountSpec` with `bindSpec: 'hostPath:/workspace/<name>:rw,cached'`
- **`resolveClaudeConfigMount()`** — returns `MountSpec` with `bindSpec: '~/.claude:/home/sandbox/.claude:ro'` targeting the sandbox user's home (not root)
- **`resolveBlockedPaths(mount, monorepoRoot)`** — walks up to `monorepoRoot` or fs root collecting `.claude-sandbox-ignore` files, uses `ignore` package to match patterns, returns `TmpfsSpec[]` with `Type: 'tmpfs'` and `TmpfsOptions: { Mode: 0o555 }` for empty read-only shadow

## Exported Interface Contracts

```typescript
export interface MountSpec {
  bindSpec: string;      // 'hostPath:containerPath:rw,cached' or ':ro'
  hostPath: string;      // absolute host path
  containerPath: string; // absolute container path
}

export interface TmpfsSpec {
  Type: 'tmpfs';
  Target: string;                 // absolute container path
  TmpfsOptions: { Mode: number }; // 0o555 = read-only empty dir
}

export function resolveMount(hostPathRaw: string): MountSpec
export function resolveClaudeConfigMount(): MountSpec
export function resolveBlockedPaths(mount: MountSpec, monorepoRoot: string | null): TmpfsSpec[]
```

## Test Coverage

8 Vitest tests across 3 describe blocks, all passing:

| Describe | Test | Status |
|----------|------|--------|
| resolveMount | resolves existing absolute path to workspace bind spec | PASS |
| resolveMount | throws SandboxError for nonexistent path | PASS |
| resolveMount | strips trailing slashes | PASS |
| resolveClaudeConfigMount | ro bind spec targeting /home/sandbox/.claude | PASS |
| resolveClaudeConfigMount | host path ends with .claude | PASS |
| resolveBlockedPaths | empty array when no .claude-sandbox-ignore | PASS |
| resolveBlockedPaths | tmpfs specs for directories in .claude-sandbox-ignore | PASS |
| resolveBlockedPaths | all specs have Type: tmpfs and Mode: 0o555 | PASS |

Total test suite: 23 tests across 4 files — all pass.

## Edge Cases Discovered

1. **monorepoRoot null handling**: `findIgnoreFiles` correctly handles `null` monorepoRoot (stops only at filesystem root) — tested via passing `null` in all `resolveBlockedPaths` tests.

2. **Unreadable directory entries**: `walkDir` wraps `statSync` in try/catch to skip entries that become unreadable mid-scan.

3. **Ignore patterns matching files vs directories**: `resolveBlockedPaths` filters `ig.ignores(relPath)` results to directories only — a file entry matching the pattern would not produce a tmpfs spec (correct behavior: only directories can be shadowed with tmpfs).

## macOS tmpfs Regression Caveat (from RESEARCH.md)

Docker Desktop Engine 29.3.1+ has a confirmed regression where nested bind mounts via Docker Compose fail on macOS Tahoe. However:
- The regression is **Compose-specific** — direct `docker run` / `docker create` via Docker API (which this tool uses via Dockerode) is not confirmed affected
- The host machine runs Docker Engine **29.2.1** (pre-regression)
- **Empirical validation is required** before Plan 04 (lifecycle) is considered complete: create a container with a bind mount + tmpfs overlay and verify the shadowed path appears empty inside the container

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- src/docker/mounts.ts: FOUND
- src/docker/mounts.test.ts: FOUND
- test commit 95ac9e6: FOUND
- feat commit eb8229b: FOUND
- npm test: 23/23 passing
- npm run build: exits 0
