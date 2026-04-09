# Phase 2: Project Configuration - Research

**Researched:** 2026-04-09
**Domain:** Docker bind mounts, CLI options, application state persistence
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** CLAUDE.md mounts at `/workspace/CLAUDE.md` — the container working directory. This makes it a parent-level CLAUDE.md that applies to all repos mounted under `/workspace/`. Claude Code reads it automatically because it walks up from cwd and its parent directories.

**D-02:** Mount is read-only (`:ro`), consistent with `~/.claude/` mount pattern. User's project CLAUDE.md should not be modified from inside the sandbox.

**D-03:** If the `--claude-md` source path falls inside an already-mounted repo (i.e., the file is accessible via `/workspace/<repo-name>/...`), print a notice: `"Note: CLAUDE.md is already accessible via /workspace/<repo-name>/CLAUDE.md — also mounting at /workspace/CLAUDE.md for global scope."` Then proceed with the mount anyway.

**D-04:** Detection logic: check if the resolved absolute path of `--claude-md` starts with the resolved absolute path of any `--mount` directory. If so, trigger the warning.

**D-05:** The resolved absolute path of `--claude-md` is stored in `state.json` alongside `mounts`. Field name: `claudeMd` (string | null). When `restart` or `start` re-uses an existing state, the saved `claudeMd` is re-mounted automatically — user does not need to re-specify it.

**D-06:** `--claude-md` is optional on `start`. If not provided and no saved `claudeMd` in state, no project CLAUDE.md is mounted (sandbox works exactly as Phase 1).

**D-07:** If `start --recreate` is used, `claudeMd` in state is cleared unless `--claude-md` is provided in the new invocation.

### Claude's Discretion

- Exact wording of the conflict warning message
- Whether to show the claude-md path in `status` output (alongside mounts)
- Error message format if the specified CLAUDE.md path does not exist

### Deferred Ideas (OUT OF SCOPE)

- Writable `~/.claude/` mount (`--read-write-claude` flag)
- Multiple `--claude-md` flags for multi-project overlays
- Auto-detecting CLAUDE.md from mounted repos (instead of explicit flag)

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLI-06 | User can specify a path to a `CLAUDE.md` file via `--claude-md <path>` flag to mount it at a known location inside the container | Commander option + `resolveClaudeMdMount()` in mounts.ts + CLI integration in start.ts |
| MNT-03 | A `CLAUDE.md` file specified via `--claude-md <path>` is mounted into the container at the project root (or another well-known location Claude reads) | Bind mount to `/workspace/CLAUDE.md` (container working directory) + read-only `:ro` flag |

</phase_requirements>

---

## Summary

Phase 2 extends the `claude-sandbox start` command with a `--claude-md <path>` flag that allows users to mount a project-level CLAUDE.md file into the container. This file becomes available at `/workspace/CLAUDE.md`, which is the container's working directory and the location Claude Code walks up from when searching for project-level instructions.

The implementation is minimal and follows established Phase 1 patterns: a new resolver function (`resolveClaudeMdMount()` in `mounts.ts`), state persistence (`SandboxState.claudeMd` in `state/manager.ts`), conflict detection in the `start` command, and optional display in the `status` command.

**Primary recommendation:** Implement `resolveClaudeMdMount()` by copying the pattern from `resolveClaudeConfigMount()`, extend `SandboxState` interface with `claudeMd?: string | null`, add overlap detection in `start.ts`, and add the bind spec to the mounts array. No new patterns or libraries required — purely additive change leveraging existing code structure.

---

## Project Constraints (from CLAUDE.md)

The CLAUDE.md in this workspace contains only Git/PR workflow rules:

| Directive | Rule |
|-----------|-------|
| Branch naming | `<type>/<description>-<jira-issue>` |
| Commit format | `<type>[(scope)]: <description> <jira-issue>` |
| PR title | Same format as commit |
| PR template | Use `.github/PULL_REQUEST_TEMPLATE/` matching PR type |
| Merge to develop | Squash and merge (single task) |
| Labels | `bot/merge` / `bot/skip`; `migration` label required for migration PRs |

No coding conventions, testing mandates, or security requirements are specified in CLAUDE.md beyond git workflow.

---

## Standard Stack

### Core (Unchanged from Phase 1)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | 14.0.3 | CLI argument parsing, subcommands | Zero deps, 500M+ weekly downloads |
| dockerode | 4.0.10 | Docker daemon API client | Native Docker Remote API, promise-based |
| typescript | 6.0.2 | Type safety | Standard modern Node.js |

### Mount Resolution (Existing Pattern)
| Component | Value | Why |
|-----------|-------|-----|
| Path resolution | `path.resolve()` | Normalize relative paths to absolute; handles symlinks |
| Existence validation | `fs.existsSync()` | Check file/directory exists before mount |
| Bind spec format | `{hostPath}:{containerPath}:ro` | Read-only flag `:ro` matches `~/.claude/` pattern |

**No new dependencies required.** Phase 2 uses only built-in Node.js modules (`fs`, `path`, `os`) and existing project dependencies.

---

## Architecture Patterns

### Recommended Integration Points

#### 1. New Resolver in `src/docker/mounts.ts`
```typescript
/**
 * Resolve a host CLAUDE.md path to a Dockerode bind spec.
 * Mount target is /workspace/CLAUDE.md (container working directory).
 * Read-only mount, consistent with ~/.claude/ pattern.
 * Throws SandboxError if the source file does not exist.
 */
export function resolveClaudeMdMount(hostPathRaw: string): MountSpec {
  const hostPath = resolve(hostPathRaw);
  
  // Validate file exists
  if (!existsSync(hostPath)) {
    throw new SandboxError(
      `CLAUDE.md not found at '${hostPath}'.`,
      `Check the path is correct and the file exists.`
    );
  }
  
  const containerPath = '/workspace/CLAUDE.md';
  return {
    bindSpec: `${hostPath}:${containerPath}:ro`,
    hostPath,
    containerPath,
  };
}
```

#### 2. State Persistence in `src/state/manager.ts`
Extend `SandboxState` interface:
```typescript
export interface SandboxState {
  version: '1';
  containerId: string;
  status: ContainerStatus;
  mounts: string[];
  claudeMd?: string | null;  // NEW: resolved absolute path, or null
  createdAt: string;
  lastStartedAt: string;
}
```

Existing `readState()` and `writeState()` functions handle JSON serialization unchanged.

#### 3. CLI Integration in `src/commands/start.ts`
Add option:
```typescript
.option(
  '--claude-md <path>',
  'Path to project CLAUDE.md file to mount at /workspace/CLAUDE.md'
)
```

Integrate into command handler (after resolving repo mounts, before Docker API calls):
```typescript
// Resolve mounts
const repoMounts = requestedPaths.map(resolveMount);
const claudeMount = resolveClaudeConfigMount();
let claudeMdMount: MountSpec | null = null;

if (opts.claudeMd) {
  claudeMdMount = resolveClaudeMdMount(opts.claudeMd);
  
  // Detect overlap: is claudeMd inside an already-mounted repo?
  for (const repo of repoMounts) {
    if (claudeMdMount.hostPath.startsWith(repo.hostPath + '/')) {
      console.log(`Note: CLAUDE.md is already accessible via ${repo.containerPath}/CLAUDE.md — also mounting at /workspace/CLAUDE.md for global scope.`);
      break;
    }
  }
}

// Add to binds array
const binds = [
  ...repoMounts.map(m => m.bindSpec),
  claudeMount.bindSpec,
  ...(claudeMdMount ? [claudeMdMount.bindSpec] : []),
  secret.bindSpec,
];

// Persist in state
const state: SandboxState = {
  version: '1',
  containerId: container.id,
  status: 'running',
  mounts: requestedPaths,
  claudeMd: claudeMdMount ? claudeMdMount.hostPath : null,  // NEW
  createdAt: now,
  lastStartedAt: now,
};
```

Handle state restoration when `start` is called on existing stopped container:
```typescript
// After reconciling existing state
if (state.status === 'stopped' && mountsMatch(...)) {
  const existing = docker.getContainer(state.containerId);
  // When restarting, saved claudeMd is re-mounted automatically via Docker
  // (no need to call resolveClaudeMdMount again — state already has it)
  await existing.start();
  // ...
}
```

Handle `--recreate`:
```typescript
if (opts.recreate) {
  // Remove existing container
  existingState = null;  // Clears saved claudeMd
}
```

If new `--claude-md` is provided on `--recreate`, it overrides the old one.

#### 4. State Reconciliation
When `--recreate` is used without `--claude-md`:
```typescript
claudeMd: null  // Clear saved claudeMd
```

When `--recreate` is used WITH `--claude-md`:
```typescript
claudeMd: claudeMdMount.hostPath  // Use new path
```

#### 5. Optional Status Display (Claude's Discretion)
In `src/commands/status.ts`, optionally show CLAUDE.md:
```typescript
if (state.claudeMd) {
  console.log(`CLAUDE.md: ${state.claudeMd} → /workspace/CLAUDE.md`);
}
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path normalization | Custom relative-path logic | `path.resolve()` | Handles `.`, `..`, symlinks, platform differences |
| File existence checks | Try-catch wrapper | `fs.existsSync()` | Standard, atomic, cross-platform |
| Docker bind spec strings | Manual string concatenation | Existing `MountSpec` interface + `bindSpec` pattern | Prevents typos in mount format |
| State persistence | Custom JSON handling | Existing `readState()` / `writeState()` | Already tested, handles file creation, error cases |
| Overlap detection | Regex matching on paths | Direct `startsWith()` + `path.resolve()` on both sides | Handles symlinks, relative paths, edge cases |

**Key insight:** Path comparison for overlap detection MUST normalize both paths to absolute form first via `resolve()`, then use `startsWith()` with a trailing `/` check to avoid false positives (e.g., `/workspace/repo` should not match `/workspace/repo-backup`).

---

## Runtime State Inventory

**SKIP:** Phase 2 is a CLI flag + state persistence change, not a rename, refactor, or migration. No runtime state renaming occurs. No existing data needs to be migrated.

---

## Common Pitfalls

### Pitfall 1: Overlap Detection Missing Trailing Slash
**What goes wrong:** Checking `claudeMd.hostPath.startsWith(repo.hostPath)` without checking trailing slash causes false positives. A CLAUDE.md at `/workspace/repo-backup/CLAUDE.md` would falsely match repo at `/workspace/repo`.

**Why it happens:** Path prefix matching requires care to avoid substring collisions.

**How to avoid:** After `startsWith()` check, verify next character is `/` (or end of string). Better: normalize both paths with `resolve()`, then check `claudeMd.hostPath.startsWith(repo.hostPath + '/')`.

**Warning signs:** Overlap warning appears even though CLAUDE.md is in a different directory.

### Pitfall 2: State Persistence Forgetting claudeMd on Restart
**What goes wrong:** User runs `start --claude-md /path/A`, then stops container, then runs `start` without `--claude-md`. Expects the old file to be re-mounted, but it's not.

**Why it happens:** Forgetting to restore `claudeMd` from saved state when restarting.

**How to avoid:** When restarting a stopped container (same mounts, no `--recreate`), check `state.claudeMd`. If it exists and no new `--claude-md` flag provided, re-mount the saved path. Verify in the integration code that saved state's `claudeMdMount` is included in the `binds` array.

**Warning signs:** `status` shows CLAUDE.md was mounted, but `shell` inside container shows `/workspace/CLAUDE.md` is missing.

### Pitfall 3: File Existence Check Happens Too Late
**What goes wrong:** User specifies a nonexistent file path. The error is discovered only after Docker API calls, wasting time and leaving stale container state.

**Why it happens:** Validation should happen as early as possible, before mutating state.

**How to avoid:** Check `existsSync(hostPath)` immediately after path resolution, before any Docker calls. Throw `SandboxError` with a helpful hint.

**Warning signs:** User sees a cryptic Docker error instead of a clear file-not-found message.

### Pitfall 4: Bind Spec Format Typo
**What goes wrong:** Incorrect bind spec format (e.g., missing `:ro` flag, wrong container path) causes Docker to silently mount incorrectly or fail to mount read-only.

**Why it happens:** Manual string concatenation is error-prone.

**How to avoid:** Use the `MountSpec` interface consistently. Always construct bind specs using the same pattern: `${hostPath}:${containerPath}:{flags}`. Test the bind spec format once in a unit test, trust it thereafter.

**Warning signs:** Container starts but `/workspace/CLAUDE.md` is writable (should be read-only) or the file is not present.

---

## Code Examples

### Example 1: Resolver Function
```typescript
// Source: Established pattern from resolveClaudeConfigMount() in mounts.ts
export function resolveClaudeMdMount(hostPathRaw: string): MountSpec {
  const hostPath = resolve(hostPathRaw);

  if (!existsSync(hostPath)) {
    throw new SandboxError(
      `CLAUDE.md not found at '${hostPath}'.`,
      `Check the path is correct and the file exists.`
    );
  }

  const containerPath = '/workspace/CLAUDE.md';
  return {
    bindSpec: `${hostPath}:${containerPath}:ro`,
    hostPath,
    containerPath,
  };
}
```

### Example 2: Overlap Detection
```typescript
// Source: Phase 2 CONTEXT.md D-04
if (claudeMdMount) {
  for (const repo of repoMounts) {
    // Both paths are already resolved to absolute form
    if (claudeMdMount.hostPath.startsWith(repo.hostPath + '/')) {
      console.log(`Note: CLAUDE.md is already accessible via ${repo.containerPath}/CLAUDE.md — also mounting at /workspace/CLAUDE.md for global scope.`);
      break;
    }
  }
}
```

### Example 3: State Extension
```typescript
// Source: Existing pattern from SandboxState in state/manager.ts
export interface SandboxState {
  version: '1';
  containerId: string;
  status: ContainerStatus;
  mounts: string[];
  claudeMd?: string | null;  // NEW
  createdAt: string;
  lastStartedAt: string;
}
```

### Example 4: Restart with Saved claudeMd
```typescript
// Source: Existing restart logic in start.ts, adapted
if (state.status === 'stopped' && mountsMatch(state.mounts, requestedPaths)) {
  // Same mounts, container stopped — restart it silently
  const existing = docker.getContainer(state.containerId);
  
  // Build binds array including saved claudeMd
  const binds = [
    ...repoMounts.map(m => m.bindSpec),
    claudeMount.bindSpec,
    ...(state.claudeMd ? [resolveClaudeMdMount(state.claudeMd).bindSpec] : []),
    secret.bindSpec,
  ];
  
  // Update container binds if they changed (optional, depends on Docker API)
  // For now, assume binds don't change on restart — the container was created
  // with the correct binds and they persist.
  
  await existing.start();
  const now = new Date().toISOString();
  writeState({ ...state, status: 'running', lastStartedAt: now });
  console.log('Sandbox started.');
  return;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single global config file | Per-project CLAUDE.md + global ~/.claude/ | Introduced in Claude Code 2.x | Allows project-specific rules without duplicating global setup |
| CLAUDE.md inside repo | CLAUDE.md mounted at workspace root | Phase 2 (this phase) | Makes CLAUDE.md available as a "parent" config applying to all mounted repos |

**Deprecated/outdated:**
- None — Phase 2 is additive, not replacing any existing behavior.

---

## Open Questions

None identified. Phase 2 scope is well-defined in CONTEXT.md. The implementation is a straightforward extension of Phase 1 patterns.

---

## Environment Availability

**Step 2.6: SKIPPED** — Phase 2 has no external dependencies beyond those already validated in Phase 1 (Docker, Node.js runtime). The `--claude-md` flag operates on the host filesystem and passes a path to the CLI; no new tools, services, or runtimes are required.

---

## Validation Architecture

**Validation is DISABLED per `.planning/config.json`: `workflow.nyquist_validation: false`**

However, Phase 2 introduces testable behavior. Recommended test coverage (for informational purposes):

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 2.1.9 |
| Config file | `vitest.config.ts` (already exists) |
| Quick run command | `npm test` (via `vitest run`) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLI-06 | `--claude-md <path>` flag is accepted by `start` command | unit | `npm test -- src/commands/start.test.ts` | ❌ Wave 0 |
| CLI-06 | resolveClaudeMdMount() validates file exists | unit | `npm test -- src/docker/mounts.test.ts` | ❌ Wave 0 |
| CLI-06 | Overlap detection prints warning when CLAUDE.md is inside mounted repo | unit | `npm test -- src/commands/start.test.ts` | ❌ Wave 0 |
| MNT-03 | claudeMd is persisted in state.json | unit | `npm test -- src/state/manager.test.ts` | ❌ Wave 0 |
| MNT-03 | Saved claudeMd is restored on restart | unit | `npm test -- src/commands/start.test.ts` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `src/commands/start.test.ts` — CLI integration tests for `--claude-md` flag parsing, conflict detection, state persistence
- [ ] `src/docker/mounts.test.ts` — Update existing file with `resolveClaudeMdMount()` tests (file exists, validation, bind spec format)
- [ ] `src/state/manager.test.ts` — Update existing file with `claudeMd` persistence tests (read/write state with new field)

*(These are informational. Validation is disabled; planner may skip or include as desired.)*

---

## Sources

### Primary (HIGH confidence)
- **Phase 1 CONTEXT.md** — Established mount patterns: D-01, D-02 from Phase 1 applied to CLAUDE.md mount; `MountSpec` interface pattern verified
- **Phase 1 RESEARCH.md** — Confirmed `resolveClaudeConfigMount()` pattern and read-only mount syntax (`bindSpec` with `:ro` flag)
- **Existing codebase (src/docker/mounts.ts, src/state/manager.ts, src/commands/start.ts)** — Live implementation of Phase 1 patterns; copy-paste-adapt approach is safe
- **Phase 2 CONTEXT.md** — Locked decisions D-01 through D-07 are the specification; implementation details derived directly from these

### Secondary (MEDIUM confidence)
- **Node.js path module documentation** — `resolve()` and `startsWith()` behavior verified by code inspection in Phase 1
- **Docker API bind mount spec format** — Confirmed via Dockerode source and Phase 1 implementation (live production code in `mounts.ts`)

### Tertiary (LOW confidence)
- None — all recommendations are grounded in existing code and locked specifications.

---

## Metadata

**Confidence breakdown:**
- **Standard Stack:** HIGH — No new dependencies; only extending existing project infrastructure (Commander, Dockerode, Node.js fs/path)
- **Architecture:** HIGH — Implementation is straightforward extension of Phase 1 patterns; `resolveClaudeMdMount()` is a copy-paste-adapt of `resolveClaudeConfigMount()`
- **State Persistence:** HIGH — `SandboxState` interface extension is a simple addition; existing serialization (JSON) handles new optional field
- **Pitfalls:** HIGH — Pitfalls are derived from common path manipulation errors; solutions are standard practice (trailing slash checks, early validation)

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (30 days — stable domain, no external dependencies changing)
