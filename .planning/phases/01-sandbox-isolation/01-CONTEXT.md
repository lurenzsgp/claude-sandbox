# Phase 1: Sandbox Isolation - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a working CLI tool (`claude-sandbox`) that creates and manages a persistent Docker container running Claude Code. Users can mount specific repo paths, open an interactive shell, and trust that only what they explicitly named is visible inside the container.

Scope: `start`, `stop`, `restart`, `status`, `shell` commands. API key injection. Read-only `~/.claude/` mount. Mount safety validation.

Out of scope (Phase 2): `--claude-md` flag, project-level CLAUDE.md mounting.

</domain>

<decisions>
## Implementation Decisions

### Path Resolution
- **D-01:** `--mount <path>` accepts absolute paths and paths relative to cwd. Both are normalized to absolute before any validation.
- **D-02:** If a path doesn't exist after resolution, fail hard with an error AND scan adjacent directories to suggest similar paths (e.g. "Did you mean /workspace/payments-v2?").

### Mount Safety (`.claude-sandbox-ignore`)
- **D-03:** Each mounted project can include a `.claude-sandbox-ignore` file at its root (gitignore-style syntax). Listed subpaths are blocked from Claude's view inside the container.
- **D-04:** Blocked subpaths are enforced by shadowing them with empty read-only `tmpfs` mounts on top of the bind mount. Claude sees an empty directory — not an error, not missing content.
- **D-05:** Walk up parent directories when resolving ignore files. A `.claude-sandbox-ignore` at a monorepo root applies to all subprojects mounted from beneath it. Stop walking at filesystem root or at a configurable monorepo root.
- **D-06:** System directory blocking (/, /etc, /System, /private, /var, etc.) is also applied regardless of ignore files.

### First-Run Image Build
- **D-07:** Auto-build on first `start` if no local image exists. No explicit `build` step required.
- **D-08:** Image source strategy: try pulling from a registry first (if configured); fall back to building locally from the bundled Dockerfile. For Phase 1, local build is the effective default (no registry configured yet).
- **D-09:** Progress display during build: friendly step-by-step summary ("Pulling base image... Installing dependencies... Installing Claude Code... Done."). Not raw Docker layer output. On build failure: dump full Docker build log.

### Repo Change Handling
- **D-10:** If `start` is called with `--mount` paths that differ from the existing container's mounts: hard error. Show the old mounts vs new mounts clearly. Require `--recreate` flag to confirm container recreation (which resets container state).
- **D-11:** If `start` is called with the same mounts as the existing container (stopped): silently restart. Output: "Sandbox started."

### Shell Behavior
- **D-12:** `claude-sandbox shell` opens a terminal at `/workspace` — the top of the mounted repos directory. All repos are visible immediately.
- **D-13:** Set `CLAUDE_SANDBOX=1` env var inside the container. Customize PS1 to show a sandbox marker (e.g. `[sandbox] $`) so users can always tell they're inside.

### Claude's Discretion
- Exact format of path suggestions in error messages
- PS1 marker style (exact wording/color)
- Whether to show mount list on `status` as plain text or table
- Dockerfile layer ordering optimizations

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Vision
- `.planning/REQUIREMENTS.md` — Complete v1 requirement list with IDs (CLI-01..05, CONT-01..04, MNT-01..02, AUTH-01). Phase 1 requirements are the authoritative acceptance criteria.
- `.planning/PROJECT.md` — Core value, constraints, key decisions, and out-of-scope list.

### Research Artifacts
- `.planning/research/ARCHITECTURE.md` — Recommended component architecture: CLI Entry Point, Config Layer, State Manager, Docker Client Wrapper, Container Image Manager, Volume Mount Resolver, Environment Variable Injector, Container Lifecycle Manager. Build order and data flow diagrams included.
- `.planning/research/STACK.md` — Technology decisions: Commander.js (CLI), Dockerode (Docker API), node:22-bookworm (base image), TypeScript + esbuild, Vitest. Rationale and alternatives considered.
- `.planning/research/PITFALLS.md` — Critical pitfalls and mitigations: UID/GID mismatch (build-arg at image creation), API key exposure (volume-mount secrets file), Docker socket security (explicit rejection), TTY allocation for interactive Claude Code, macOS bind mount performance (`:cached` flag).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — fresh project, no existing code.

### Established Patterns
- None yet — this is the foundation phase. Patterns established here become the baseline for Phase 2.

### Integration Points
- CLI binary entry point: `src/cli.ts` (to be created), registered in `package.json` `bin` field as `claude-sandbox`.
- State file: `~/.claude-sandbox/state.json` — persists container ID, mounts, and session metadata.
- Config file: `~/.claude-sandbox/config.json` — global defaults (configurable monorepo root, registry URL if any).

</code_context>

<specifics>
## Specific Ideas

- The `.claude-sandbox-ignore` pattern walks up to a configurable monorepo root (not just filesystem root). This lets the user define `MONOREPO_ROOT` in config so the walk stops there rather than at `/`.
- Friendly build progress should clearly indicate first-run vs rebuild (e.g. "Building sandbox image for the first time — this takes ~5 minutes...").
- The `--recreate` flag on `start` is the intentional escape hatch when mounts need to change. Error message should mention it explicitly: "Run `claude-sandbox start --recreate` to rebuild with new mounts (container state will be lost)."

</specifics>

<deferred>
## Deferred Ideas

- Registry push/pull for the sandbox image (beyond "try pull, fallback to build") — Phase 2 or later.
- `--read-write-claude` flag for writable `~/.claude/` mount — PITFALLS.md Phase 2 item.
- Image staleness warnings (>30 days) — PITFALLS.md Phase 2 item.
- Crash detection and auto-restart — PITFALLS.md Phase 2 item.
- Per-sandbox named instances — single `claude-sandbox` container for Phase 1.

</deferred>

---

*Phase: 01-sandbox-isolation*
*Context gathered: 2026-04-09*
