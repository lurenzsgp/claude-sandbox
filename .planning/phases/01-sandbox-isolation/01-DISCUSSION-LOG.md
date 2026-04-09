# Phase 1: Sandbox Isolation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 01-sandbox-isolation
**Areas discussed:** --mount path resolution, Mount safety (.claude-sandbox-ignore), First-run image build, Repo change handling, shell working directory

---

## --mount Path Resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Absolute paths only | Simple, unambiguous. Fails clearly if relative path given. | |
| Absolute + relative to cwd | Also resolve ./relative paths. Slightly more ergonomic but context-dependent. | ✓ |
| Absolute + relative + home expansion | Also expand ~/... — most ergonomic. | |

**User's choice:** Absolute + relative to cwd

---

## Path Validation (missing path)

| Option | Description | Selected |
|--------|-------------|----------|
| Hard error, abort start | Fail immediately with clear message. | |
| Warning, continue with valid mounts | Warn but start with valid ones. | |
| Error with suggestions | Fail AND scan nearby dirs to suggest similar paths. | ✓ |

**User's choice:** Error with suggestions

---

## Mount Safety (.claude-sandbox-ignore)

**User clarification:** The tool is used inside a monorepo where not all content should be exposed. The opt-out file should live at the project root and specify subpaths to block (gitignore syntax), not block the entire mount.

| Option | Description | Selected |
|--------|-------------|----------|
| .claude-sandbox-ignore | gitignore-style at project root, blocked subdirs shadowed with empty tmpfs. | ✓ |
| .sandboxignore | Shorter name, same behavior. | |
| Custom name in config | Configurable filename. | |

**User's choice:** `.claude-sandbox-ignore`

| Scope option | Description | Selected |
|-------------|-------------|----------|
| Exact mounted path only | Only check in the root of --mount path. | |
| Walk up to find ignore files | Also check parent directories up to monorepo root. | ✓ |

**User's choice:** Walk up to find ignore files

**Notes:** Enforcement mechanism: shadow blocked subpaths with empty read-only tmpfs mounts on top of the bind mount. Claude sees an empty folder, not an error.

---

## First-Run Image Build

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-build on first `start` | If no image exists, start builds automatically with progress indicator. | ✓ |
| Require explicit `claude-sandbox build` first | Transparent, but adds friction. | |
| Auto-build with full Docker output | Same as auto-build but streams raw Docker output. | |

**User's choice:** Auto-build on first `start`

| Image source | Description | Selected |
|-------------|-------------|----------|
| Build locally from bundled Dockerfile | No registry dependency. | |
| Pull from registry if available, build locally as fallback | Faster if registry exists, resilient. | ✓ |

**User's choice:** Pull from registry if available, build locally as fallback

| Progress style | Description | Selected |
|---------------|-------------|----------|
| Friendly progress summary | "Pulling base image... Installing dependencies... Done." | ✓ |
| Raw Docker build output | Full layer-by-layer output. | |
| Spinner only, raw output on failure | Minimal during success, verbose on error. | |

**User's choice:** Friendly progress summary

---

## Repo Change Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Recreate container automatically | Detect mismatch, warn, recreate. | |
| Error: require explicit --recreate flag | Fail with old vs new mounts shown, user confirms with --recreate. | ✓ |
| Ignore new mounts, use existing | Start with original mounts, warn. | |

**User's choice:** Error requiring `--recreate` flag

| Same-mounts behavior | Description | Selected |
|---------------------|-------------|----------|
| Start existing container silently | Just restart, output "Sandbox started." | ✓ |
| Show mounts on every start | Always print mounted repos on start. | |

**User's choice:** Silent restart (happy path)

---

## Shell Working Directory

| Option | Description | Selected |
|--------|-------------|----------|
| /workspace | All repos visible at top level. Predictable. | ✓ |
| First mounted repo | Land in first --mount path. | |
| Configurable default | Default /workspace, allow config override. | |

**User's choice:** `/workspace`

| Shell indicator | Description | Selected |
|----------------|-------------|----------|
| Yes — CLAUDE_SANDBOX=1 + PS1 marker | Env var + prompt shows [sandbox] $. | ✓ |
| No — plain shell | No indicator. | |

**User's choice:** Yes, set `CLAUDE_SANDBOX=1` and customize PS1

---

## Claude's Discretion

- Exact format of path suggestions in error messages
- PS1 marker style and color
- Status command output format (plain text vs table)
- Dockerfile layer ordering optimizations

## Deferred Ideas

- Registry push/pull beyond "try pull, fall back"
- `--read-write-claude` flag for writable ~/.claude/ mount
- Image staleness warnings (>30 days)
- Crash detection and auto-restart
- Named multi-sandbox support
