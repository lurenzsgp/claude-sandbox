# Claude Sandbox

## What This Is

A CLI tool that launches a persistent Docker container giving Claude Code an isolated environment with access only to the repos you explicitly choose. Users authenticate fresh per container via `claude /login` — no host session state leaks in.

## Core Value

Claude gets exactly the repos and configuration you give it — nothing more, nothing less.

## Requirements

### Validated

- ✓ Docker-based container that isolates Claude from the host filesystem — v1.0
- ✓ CLI tool to start/stop/exec into the container with repo selection — v1.0
- ✓ Selective bind-mounts: specified repos mounted as volumes inside the container — v1.0
- ✓ `ANTHROPIC_API_KEY` injected from host env at launch via secrets file — v1.0
- ✓ Persistent container — state survives across sessions — v1.0
- ✓ Claude CLI pre-installed and ready to run inside the container — v1.0
- ✓ User can supply a custom project `CLAUDE.md` via `--claude-md <path>` — v1.0
- ✓ Claude Code TUI renders correctly inside the container — v1.0
- ✓ Interactive session fully usable via `claude-sandbox shell` — v1.0

### Active

_(next milestone requirements go here)_

### Out of Scope

- Full monorepo mount — the whole point is selective access
- GUI / web UI — terminal-only interface
- Network isolation — only filesystem access is being constrained
- `~/.claude/` mount from host — causes TUI issues (session state collision); users start fresh per container
- Per-sandbox config profiles separate from host — fresh session covers this

## Context

- Shipped v1.0 with ~880 LOC TypeScript (5 source files + 4 test files)
- Tech stack: Node.js 18+, Commander.js, Dockerode, esbuild (CJS bundle), vitest
- Dockerfile rebased on Anthropic devcontainer spec — full apt package set ensures React Ink TUI works
- Key operational pattern: `DEVCONTAINER=true` + `COLORTERM/LINES/COLUMNS` injected per exec session
- Auth: `ANTHROPIC_API_KEY` via secrets file bind-mount (Pro/Max users: `claude /login` inside container)

## Constraints

- **Platform**: Docker must be available on the host (macOS primary target)
- **Auth**: `ANTHROPIC_API_KEY` must be set in the host environment before launching (or use OAuth via `claude /login`)
- **Persistence**: Container must retain its state between `stop` / `start` cycles — not `--rm`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Bind-mount repos (not copy) | Changes inside container reflect immediately on host | ✓ Good |
| Persistent container (not ephemeral) | User wants to return to the same environment across sessions | ✓ Good |
| No `~/.claude/` mount | Host session state causes React Ink TUI hang; fresh login per container is cleaner | ✓ Good |
| CJS esbuild output | Avoids ESM/CJS interop errors with commander@14 on Node 18 | ✓ Good |
| `hijack:true` in Dockerode exec | `Tty:true` alone returns read-only stream; hijack required for bidirectional PTY | ✓ Good |
| `sleep infinity` as PID 1 | `/bin/bash` as PID 1 creates orphaned PTY master breaking `setRawMode` | ✓ Good |
| `DEVCONTAINER=true` env var | Claude Code checks this to choose full TUI vs fallback renderer | ✓ Good |
| Secrets file bind-mount | API key not visible in `docker inspect` env array | ✓ Good |

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
*Last updated: 2026-04-19 — v1.0 milestone complete*
