# Phase 2: Project Configuration - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `--claude-md <path>` flag to `claude-sandbox start`. Mount the specified CLAUDE.md file into the container at `/workspace/CLAUDE.md` so Claude Code reads it as a project-root instruction file applying to all mounted repos.

Scope: `--claude-md` flag on `start`, corresponding mount function in `mounts.ts`, state persistence in `state.json`, conflict detection when source overlaps a mounted repo.

Out of scope: multiple CLAUDE.md files, per-repo targeting, writable CLAUDE.md mount.

</domain>

<decisions>
## Implementation Decisions

### Mount Target
- **D-01:** CLAUDE.md mounts at `/workspace/CLAUDE.md` — the container working directory. This makes it a parent-level CLAUDE.md that applies to all repos mounted under `/workspace/`. Claude Code reads it automatically because it walks up from cwd and its parent directories.
- **D-02:** Mount is read-only (`:ro`), consistent with `~/.claude/` mount pattern. User's project CLAUDE.md should not be modified from inside the sandbox.

### Conflict Detection
- **D-03:** If the `--claude-md` source path falls inside an already-mounted repo (i.e., the file is accessible via `/workspace/<repo-name>/...`), print a notice: `"Note: CLAUDE.md is already accessible via /workspace/<repo-name>/CLAUDE.md — also mounting at /workspace/CLAUDE.md for global scope."` Then proceed with the mount anyway.
- **D-04:** Detection logic: check if the resolved absolute path of `--claude-md` starts with the resolved absolute path of any `--mount` directory. If so, trigger the warning.

### State Persistence
- **D-05:** The resolved absolute path of `--claude-md` is stored in `state.json` alongside `mounts`. Field name: `claudeMd` (string | null). When `restart` or `start` re-uses an existing state, the saved `claudeMd` is re-mounted automatically — user does not need to re-specify it.
- **D-06:** `--claude-md` is optional on `start`. If not provided and no saved `claudeMd` in state, no project CLAUDE.md is mounted (sandbox works exactly as Phase 1).
- **D-07:** If `start --recreate` is used, `claudeMd` in state is cleared unless `--claude-md` is provided in the new invocation.

### Claude's Discretion
- Exact wording of the conflict warning message
- Whether to show the claude-md path in `status` output (alongside mounts)
- Error message format if the specified CLAUDE.md path does not exist

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Scope
- `.planning/REQUIREMENTS.md` — CLI-06 and MNT-03 are the two Phase 2 requirements. These are the acceptance criteria.
- `.planning/PROJECT.md` — Core value and active requirement: "Project-level CLAUDE.md files are picked up automatically (they live inside the mounted repos)".

### Existing Implementation
- `src/commands/start.ts` — Entry point. Add `--claude-md` option here, call `resolveClaudeMdMount()`, detect overlap with repo mounts, pass to `HostConfig.Binds`, persist in state.
- `src/docker/mounts.ts` — Where `resolveMount()` and `resolveClaudeConfigMount()` live. Add `resolveClaudeMdMount(hostPath: string): MountSpec` following the same pattern.
- `src/state/manager.ts` — `SandboxState` interface must gain `claudeMd?: string | null`. `writeState` and `readState` already handle JSON serialization.
- `.planning/phases/01-sandbox-isolation/01-CONTEXT.md` — Phase 1 decisions (mount patterns, state design, error patterns) — follow established conventions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolveClaudeConfigMount()` in `mounts.ts` — Direct template for `resolveClaudeMdMount()`. Same pattern: resolve host path, define container path, return `MountSpec` with bind spec string.
- `MountSpec` interface — Already typed for reuse. No new types needed.
- `SandboxState` interface — Extend with `claudeMd?: string | null`. Existing `readState`/`writeState` functions handle serialization unchanged.

### Established Patterns
- Bind mounts use `bindSpec` string for `HostConfig.Binds` array
- Read-only mounts use `:ro` suffix (see `resolveClaudeConfigMount`)
- State reconciliation happens at the top of `start` — new field follows the same path
- Errors thrown as `SandboxError` with a hint string

### Integration Points
- `start.ts` action handler: after resolving `repoMounts` and `claudeMount`, add `claudeMdMount` if `--claude-md` is provided; push its `bindSpec` into the `binds` array alongside the others
- `SandboxState.claudeMd` feeds back into `start.ts` when restarting a stopped container (same `mountsMatch` logic path)
- `status.ts` may optionally display `claudeMd` from state (Claude's discretion)

</code_context>

<specifics>
## Specific Ideas

- The overlap detection in D-04 should use `resolve()` on both paths before comparing, to handle relative paths and symlinks consistently.
- The `resolveClaudeMdMount` function should validate that the source file exists before returning a spec (same as `resolveMount` validates directories). Throw `SandboxError` with hint if not found.
- `status` command could show something like: `CLAUDE.md: /path/to/project/CLAUDE.md → /workspace/CLAUDE.md` alongside the mounts list.

</specifics>

<deferred>
## Deferred Ideas

- Writable `~/.claude/` mount (`--read-write-claude` flag) — mentioned in Phase 1 pitfalls, still deferred
- Multiple `--claude-md` flags for multi-project overlays — this phase is single-file only
- Auto-detecting CLAUDE.md from mounted repos (instead of explicit flag) — out of scope for Phase 2

</deferred>

---

*Phase: 02-project-configuration*
*Context gathered: 2026-04-09*
