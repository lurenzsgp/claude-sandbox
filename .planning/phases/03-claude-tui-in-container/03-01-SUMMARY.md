---
phase: 03-claude-tui-in-container
plan: 01
subsystem: infra
tags: [docker, dockerfile, tui, react-ink, claude-code, terminal, ncurses, devcontainer]

requires:
  - phase: 01-sandbox-isolation
    provides: "Container image, entrypoint.sh, shell.ts, start.ts baseline"
  - phase: 02-project-configuration
    provides: "claudeMd mount, whitelist masking, secrets injection wiring"
provides:
  - "Dockerfile with full Anthropic devcontainer apt package set and DEVCONTAINER=true"
  - "shell.ts passing COLORTERM, LINES, COLUMNS per exec session via Dockerode Env array"
  - "start.ts baking TERM=xterm-256color and COLORTERM=truecolor into container Env"
affects: [03-claude-tui-in-container]

tech-stack:
  added: [less, git, procps, sudo, fzf, zsh, man-db, unzip, gnupg2, gh, iptables, ipset, iproute2, dnsutils, aggregate, jq, nano, vim]
  patterns:
    - "DEVCONTAINER=true env var triggers correct React Ink TUI code path in Claude Code"
    - "Per-exec terminal env vars (COLORTERM, LINES, COLUMNS) passed via Dockerode exec Env array"
    - "Static terminal baseline (TERM, COLORTERM) baked into createContainer Env; dynamic dimensions (LINES, COLUMNS) per-exec only"

key-files:
  created: []
  modified:
    - Dockerfile
    - src/commands/shell.ts
    - src/commands/start.ts

key-decisions:
  - "DEVCONTAINER=true required: Claude Code checks this env var to decide whether to use the full React Ink TUI or a fallback renderer — without it TUI will not work even with all packages present"
  - "Full Anthropic devcontainer apt package list adopted verbatim to guarantee TUI compatibility (ncurses/libtinfo pulled in transitively)"
  - "CMD changed from /bin/bash to sleep infinity: exec sessions each get their own fresh PTY, which is required for setRawMode() to work correctly"
  - "sudo granted to sandbox user for iptables capability (mirrors devcontainer pattern)"
  - "LINES/COLUMNS excluded from start.ts Env: dynamic values depend on actual terminal size at exec time; baking them statically would give wrong dimensions"
  - "shell.ts uses Dockerode container.exec() with Env array (not spawn -e flags): consistent with Phase 1 Plan 05 PTY exec pattern"

patterns-established:
  - "Devcontainer package list: less, git, procps, sudo, fzf, zsh, man-db, unzip, gnupg2, gh, iptables, ipset, iproute2, dnsutils, aggregate, jq, nano, vim"
  - "Terminal env injection: static TERM+COLORTERM in createContainer Env, dynamic LINES+COLUMNS per exec in container.exec() Env"
  - "NPM global prefix: /usr/local/share/npm-global to match devcontainer spec"

requirements-completed: []

duration: 15min
completed: 2026-04-17
---

# Phase 3 Plan 01: Rebase Dockerfile + Terminal Env Vars Summary

**Anthropic devcontainer apt package set (less, ncurses, procps, sudo, etc.) added to Dockerfile with DEVCONTAINER=true, and COLORTERM/LINES/COLUMNS injected per exec session to give React Ink a complete terminal description — TUI hang resolved and human-verified**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-17T16:02:34Z
- **Completed:** 2026-04-17T16:17:00Z
- **Tasks:** 3/3 (including human smoke test checkpoint)
- **Files modified:** 3

## Accomplishments

- Dockerfile rebased to install full Anthropic devcontainer apt package set, resolving missing ncurses/libtinfo/terminal packages that caused Claude Code TUI to hang on launch
- Set DEVCONTAINER=true to trigger correct React Ink TUI code path in Claude Code
- Set NPM_CONFIG_PREFIX and sudo for sandbox user, matching devcontainer spec
- Changed CMD to sleep infinity so each exec session gets a fresh PTY (critical for setRawMode)
- Added COLORTERM, LINES, COLUMNS to shell.ts per-exec Env and TERM+COLORTERM as static fallbacks in start.ts
- Preserved all invariants: UID/GID build args, sandbox user, entrypoint.sh, .bashrc secrets injection, stty sane wrapper
- Human smoke test approved: image builds cleanly, claude --version runs without hanging, ANTHROPIC_API_KEY injected correctly, TUI renders and is interactive (D-06, D-07 resolved)

## Task Commits

1. **Task 1: Rebase Dockerfile on devcontainer spec** - `6587fbb` (feat)
2. **Task 2: Add COLORTERM, LINES, COLUMNS env vars to shell.ts and start.ts** - `b64e8e3` (feat)
3. **Task 3: Smoke test — build image, validate TUI and auth** - `c0a5c3b` (chore, approved)

## Files Created/Modified

- `Dockerfile` - Full devcontainer package set, DEVCONTAINER=true, TZ ARG, NPM_CONFIG_PREFIX, sudo for sandbox, sleep infinity CMD, .bashrc fragments preserved
- `src/commands/shell.ts` - Dockerode container.exec() Env extended with COLORTERM, LINES, COLUMNS per exec session
- `src/commands/start.ts` - Added TERM=xterm-256color and COLORTERM=truecolor to createContainer Env

## Decisions Made

- **DEVCONTAINER=true is a hard requirement:** Claude Code checks this env var to decide whether to use the full React Ink TUI or a fallback renderer. Without it the TUI will not work correctly even with all packages present.
- **CMD changed from /bin/bash to sleep infinity:** exec sessions each get their own fresh PTY, which is required for setRawMode() to work. The previous /bin/bash CMD held a terminal that could interfere with exec PTY allocation.
- **LINES and COLUMNS are NOT added to start.ts Env:** They are dynamic values that depend on the actual terminal size at exec time. Baking them statically into the container would give wrong dimensions. They are correctly passed per-exec in shell.ts.
- **sudo granted to sandbox user:** Mirrors devcontainer pattern; required for iptables capability.

## Deviations from Plan

### Notable Difference: shell.ts uses Dockerode exec, not spawn

The plan describes the shell.ts change in terms of a `spawn` call with `-e` flags. The actual implementation from Phase 1 Plan 05 uses Dockerode `container.exec()` with an `Env` array (the PTY exec pattern). The equivalent change was applied correctly to the `Env` array in the Dockerode exec call. This is a documentation mismatch in the plan, not a real deviation — the intent was fully achieved.

### Pre-existing TS Error (Out of Scope)

`npx tsc --noEmit` reports a pre-existing error: `esbuild.config.ts` is not under `rootDir src/`. This error exists on the baseline commit before Task 1 and is unrelated to any changes in this plan. No new errors were introduced.

---

**Total deviations:** 0 auto-fixes needed
**Impact on plan:** Plan executed as specified. Shell.ts implementation difference was documentation vs reality, not a real deviation.

## Issues Encountered

- Pre-existing TypeScript rootDir error for esbuild.config.ts — logged as out-of-scope, not fixed.

## User Setup Required

None - smoke test was fully completed by the user as part of Task 3 checkpoint. No further external configuration required.

## Next Phase Readiness

- Phase 3 Plan 01 is fully complete. The TUI hang (D-01, D-02) is resolved.
- Dockerfile is now aligned with Anthropic's official devcontainer spec.
- Claude Code TUI renders correctly inside the sandbox container (human-verified).
- No further plans are scoped for Phase 3 at this time.

---
*Phase: 03-claude-tui-in-container*
*Completed: 2026-04-17*
