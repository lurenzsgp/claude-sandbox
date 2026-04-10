---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Executing Phase 02
stopped_at: Completed 02-02-PLAN.md
last_updated: "2026-04-10T08:11:18.637Z"
progress:
  total_phases: 2
  completed_phases: 2
  total_plans: 7
  completed_plans: 7
---

# Project State — Claude Sandbox

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-08)

**Core value:** Claude gets exactly the repos and configuration you give it — nothing more, nothing less.

**Current focus:** Phase 02 — project-configuration

## Current Status

Phase 1 complete. All 5 plans executed and human-verified. Full 5-command CLI working end-to-end: start, stop, restart, status, shell. PTY shell verified with real TTY, secrets injection, Docker socket isolation.

**Stopped at:** Completed 02-02-PLAN.md

## Phase Status

| Phase | Name | Status |
|-------|------|--------|
| 1 | Sandbox Isolation | Complete (5/5 plans) |
| 2 | Project Configuration | Pending Phase 1 |

## Accumulated Context

### Key Decisions

- **Persistent container:** Not ephemeral; state survives `stop`/`start` cycles
- **Selective mounting:** Only specified repos exposed; full monorepo mount not allowed
- **UID/GID matching:** Container user must match host to ensure file permissions work
- **Secret injection:** `ANTHROPIC_API_KEY` via secrets file, not plain env var
- **Docker socket blocked:** Explicit anti-feature; validation rejects attempts
- **CLI framework:** Commander.js for robustness and zero dependencies
- **esbuild CJS format:** Changed from ESM to CJS output (`.cjs` extension) to avoid dynamic require interop errors with commander@14 on Node 18 (Plan 01-01)
- **CLI binary path:** `dist/claude-sandbox.cjs` instead of `dist/claude-sandbox.js` due to `"type": "module"` in package.json (Plan 01-01)
- **vitest version:** Downgraded from 4.1.4 to 2.1.9 for Node 18 compatibility (`styleText` not in `node:util` on Node 18) (Plan 01-02)
- **Container claude mount target:** `/home/sandbox/.claude` (not `/root/.claude`) — Dockerfile USER is `sandbox`, not root; wrong path would break Claude Code config lookup (Plan 01-03)
- **ignore@7.0.5 for .claude-sandbox-ignore:** Used over custom regex for spec-correct gitignore parsing (negation, **, escaping) (Plan 01-03)
- **__dirname over import.meta.url in image.ts:** esbuild CJS output makes import.meta.url empty; __dirname is correctly injected by esbuild for CJS bundles (Plan 01-04)
- **No duplicate shebang in cli.ts:** esbuild banner adds shebang; source file must not also have one or the built file gets two shebangs causing SyntaxError (Plan 01-04)
- **hijack:true in exec.start() for Dockerode PTY:** Tty:true alone returns a read-only stream; hijack:true is required for bidirectional stdin/stdout socket (Plan 01-05)
- **Stable secrets file path:** API key file must persist between stop/start cycles; timestamp-based temp files cause restart failures when deleted after container create (Plan 01-05)

### Critical Pitfalls Fixed in Phase 1

1. UID/GID mismatch — build-arg at image creation time
2. API key in env var — volume-mount secrets file instead
3. Docker socket mounting — validation rejection
4. TTY allocation — proper PTY handling with SIGWINCH propagation
5. macOS bind mount performance — `:cached` consistency flag

## Session Continuity

Last session: 2026-04-10T08:11:18.633Z
Stopped at: Session resumed, proceeding to execute Phase 2. Plans verified and ready.

## Session Notes

Initialized 2026-04-08.

- 14 v1 requirements identified and grouped into 2 phases
- Coarse granularity applied: Phase 1 (12 reqs) handles core isolation, Phase 2 (2 reqs) handles project config
- Success criteria derived from goal-backward analysis
- 100% coverage validated
