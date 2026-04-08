# Project State — Claude Sandbox

## Project Reference
See: .planning/PROJECT.md (updated 2026-04-08)

**Core value:** Claude gets exactly the repos and configuration you give it — nothing more, nothing less.

**Current focus:** Phase 1 — Sandbox Isolation

## Current Status
Phase 1 ready to plan.

## Phase Status
| Phase | Name | Status |
|-------|------|--------|
| 1 | Sandbox Isolation | Not Started |
| 2 | Project Configuration | Pending Phase 1 |

## Accumulated Context

### Key Decisions
- **Persistent container:** Not ephemeral; state survives `stop`/`start` cycles
- **Selective mounting:** Only specified repos exposed; full monorepo mount not allowed
- **UID/GID matching:** Container user must match host to ensure file permissions work
- **Secret injection:** `ANTHROPIC_API_KEY` via secrets file, not plain env var
- **Docker socket blocked:** Explicit anti-feature; validation rejects attempts
- **CLI framework:** Commander.js for robustness and zero dependencies

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
