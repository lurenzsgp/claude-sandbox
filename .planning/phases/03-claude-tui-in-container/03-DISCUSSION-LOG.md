# Phase 3: Claude TUI in Container - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 03-claude-tui-in-container
**Areas discussed:** Symptoms & scope, Fix approach

---

## Symptoms & scope

| Option | Description | Selected |
|--------|-------------|----------|
| TUI doesn't launch at all | claude crashes on startup or exits immediately — no interactive UI appears | ✓ |
| TUI renders broken/garbled | UI appears but layout is wrong — lines overlap, borders broken, colors missing | |
| TUI works but feels off | Mostly functional but degraded — missing colors, wrong terminal size | |
| Haven't tested yet | Phase is speculative — set up the right environment proactively | |

**User's choice:** TUI doesn't launch at all

---

## Symptom detail

| Option | Description | Selected |
|--------|-------------|----------|
| Error about terminal/TTY | "not a tty", "no terminal", or terminal capability errors | |
| Node.js / dependency error | Missing native modules, shared libraries, compatibility issues | |
| Auth / API key error | Claude starts but fails because it can't find auth config | |
| Silent exit with no output | Process starts and immediately exits — nothing printed | |

**User's choice:** Free text — "nothing at all, I need to manually close the TTY"

**Notes:** The process hangs with no output. User must manually close the TTY. Not a crash — a hang. Classic React Ink terminal initialization issue.

---

## Fix approach

| Option | Description | Selected |
|--------|-------------|----------|
| Rebase on devcontainer spec | Use Anthropic's .devcontainer/Dockerfile as reference, align our setup to match | ✓ |
| Cherry-pick nezhar + devcontainer | Read both sources, extract minimum fixes, apply to existing Dockerfile | |
| Incremental diagnosis first | Add debug tooling, identify specific failure point, then fix | |

**User's choice:** Rebase on devcontainer spec

---

## Adoption depth

| Option | Description | Selected |
|--------|-------------|----------|
| Adopt it wholesale | Use devcontainer's base image, packages, env setup as-is, layer sandbox config on top | ✓ |
| Extract the essentials | Read devcontainer, identify minimum diffs, apply to existing node:22-bookworm base | |

**User's choice:** Adopt it wholesale

---

## Validation scope

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — full smoke test | Verify claude --version, TUI opens, basic interaction works | ✓ |
| TUI rendering only | Scope to rendering correctness, auth already covered by prior phases | |

**User's choice:** Full smoke test

---

## Auth fallback

**User's note (free text):** "If porting the user auth in the container generate issues we can perform authentication in the container"

**Captured decision:** If the devcontainer migration changes `~/.claude/` config paths and breaks host auth, fallback is in-container authentication (run `claude` auth flow interactively inside the container).

---

## User-referenced docs during discussion

- `https://github.com/anthropics/claude-code/blob/main/.devcontainer/Dockerfile` — Added as primary canonical ref
- `https://github.com/nezhar/claude-container/tree/main/` — Added as secondary canonical ref

---

## Claude's Discretion

- Whether to retain `node:22-bookworm` as an intermediate layer or replace it entirely
- Exact environment variable additions beyond the devcontainer spec
- Whether `shell.ts` needs any changes

## Deferred Ideas

None.
