# Phase 2: Project Configuration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 02-project-configuration
**Areas discussed:** Mount target location, Conflict handling

---

## Mount Target Location

| Option | Description | Selected |
|--------|-------------|----------|
| /workspace/CLAUDE.md | At the workspace root — applies to all mounted repos. Claude Code reads it as a parent-dir CLAUDE.md for everything under /workspace/. Simple and global. | ✓ |
| /workspace/<first-repo>/CLAUDE.md | Colocated with the first mounted repo. Scoped to that repo only. Gets messy if multiple repos are mounted, and conflicts with an existing repo-level CLAUDE.md. | |
| User-configurable via flag | Add a --claude-md-target flag to let the user specify the container path explicitly. More flexible, more surface area to get wrong. | |

**User's choice:** /workspace/CLAUDE.md (Recommended)
**Notes:** Simple and global — applies to all mounted repos via parent-dir traversal.

---

## Conflict Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Warn and proceed | Print a notice like "Note: CLAUDE.md is already accessible via /workspace/project/CLAUDE.md" then mount it at /workspace/CLAUDE.md anyway. User gets global scope, and knows why. | ✓ |
| Silently proceed | Just mount it — no warning. User asked for it, that's enough. | |
| Error — require explicit --force | Block with an error if the source overlaps a mounted repo. User must pass --force to allow it. Most strict, most friction. | |

**User's choice:** Warn and proceed (Recommended)
**Notes:** Informative without being blocking.

---

## Claude's Discretion

- Mount mode (read-only) — consistent with ~/.claude/ pattern, no discussion needed
- State persistence — store in state.json like mounts, auto-remount on restart
- Flag optionality — --claude-md is optional, sandbox works without it

