# Claude Sandbox

## What This Is

A CLI tool that launches a persistent Docker container giving Claude Code an isolated environment with access only to the repos you explicitly choose. It protects your monorepo from unintended access while preserving your full Claude configuration (global `~/.claude/` and project-level `CLAUDE.md` files).

## Core Value

Claude gets exactly the repos and configuration you give it — nothing more, nothing less.

## Requirements

### Validated

- [x] Docker-based container that isolates Claude from the host filesystem — Validated in Phase 1: sandbox-isolation
- [x] CLI tool to start/stop/exec into the container with repo selection — Validated in Phase 1: sandbox-isolation
- [x] Selective bind-mounts: specified repos mounted as volumes inside the container — Validated in Phase 1: sandbox-isolation
- [x] `~/.claude/` mounted from host so global Claude settings are available inside the container — Validated in Phase 1: sandbox-isolation
- [x] `ANTHROPIC_API_KEY` injected from host env at launch via secrets file — Validated in Phase 1: sandbox-isolation
- [x] Persistent container — state survives across sessions — Validated in Phase 1: sandbox-isolation
- [x] Claude CLI pre-installed and ready to run inside the container — Validated in Phase 1: sandbox-isolation

### Active

- [x] User can supply a custom project `CLAUDE.md` via `--claude-md <path>` and have it mounted read-only at `/workspace/CLAUDE.md` inside the sandbox — Validated in Phase 2: project-configuration

### Out of Scope

- Full monorepo mount — the whole point is selective access
- GUI / web UI — terminal-only interface (docker exec / attach)
- Network isolation — not required; only filesystem access is being constrained
- Per-sandbox config profiles separate from host — user wants the same `~/.claude/` setup

## Context

- The user works in a monorepo and wants to use Claude Code without exposing the entire codebase
- The existing `composer-cli/` directory in the workspace may be related context or prior work
- The sandbox should feel like using Claude normally on the host, just with a narrower view of the filesystem
- The `~/.claude/` mount gives Claude access to custom commands, GSD, memory, hooks — the full local setup

## Constraints

- **Platform**: Docker must be available on the host (macOS primary target)
- **Auth**: `ANTHROPIC_API_KEY` must be set in the host environment before launching
- **Persistence**: Container must retain its state between `stop` / `start` cycles — not `--rm`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Bind-mount repos (not copy) | Changes made inside container reflect immediately on host | — Pending |
| Persistent container (not ephemeral) | User wants to return to the same environment across sessions | — Pending |
| Mount `~/.claude/` from host | Keeps Claude config in sync with host setup without duplication | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-10 — Phase 2 complete*
