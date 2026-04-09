---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: Completed 01-03-PLAN.md
last_updated: "2026-04-09T20:03:50.727Z"
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 5
  completed_plans: 3
---

# Project State — Claude Sandbox

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-08)

**Core value:** Claude gets exactly the repos and configuration you give it — nothing more, nothing less.

**Current focus:** Phase 01 — sandbox-isolation

## Current Status

Phase 1, Plans 01-03 complete. Plan 04 ready to execute.

**Stopped at:** Completed 01-03-PLAN.md

## Phase Status

| Phase | Name | Status |
|-------|------|--------|
| 1 | Sandbox Isolation | In Progress (3/5 plans complete) |
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

### Critical Pitfalls Fixed in Phase 1

1. UID/GID mismatch — build-arg at image creation time
2. API key in env var — volume-mount secrets file instead
3. Docker socket mounting — validation rejection
4. TTY allocation — proper PTY handling with SIGWINCH propagation
5. macOS bind mount performance — `:cached` consistency flag

## Session Notes

Initialized 2026-04-08.

- 14 v1 requirements identified and grouped into 2 phases
- Coarse granularity applied: Phase 1 (12 reqs) handles core isolation, Phase 2 (2 reqs) handles project config
- Success criteria derived from goal-backward analysis
- 100% coverage validated
