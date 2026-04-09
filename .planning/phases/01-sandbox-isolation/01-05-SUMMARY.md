---
phase: "01"
plan: "05"
subsystem: shell-command
tags: [docker, cli, commander, pty, tty, exec, sigwinch, interactive]
dependency_graph:
  requires:
    - phase: "01-04"
      provides: "lifecycle commands, state manager, container runtime"
  provides:
    - "src/commands/shell.ts — PTY exec with SIGWINCH propagation and clean exit"
    - "Full 5-command CLI: start, stop, restart, status, shell"
    - "CLI-05: interactive shell subcommand"
  affects: ["Phase 2 project configuration"]
tech_stack:
  added: []
  patterns:
    - "Dockerode exec with hijack:true for bidirectional PTY I/O (not Tty:true alone)"
    - "SIGWINCH propagation via process.stdout 'resize' event + exec.resize()"
    - "stdin raw mode on open, restored on stream 'end' for clean exit"
    - "Stable secrets file path (CONFIG_DIR/api-key) for stop/start cycle persistence"
key_files:
  created:
    - src/commands/shell.ts
  modified:
    - src/cli.ts
    - src/commands/start.ts
    - src/secrets/injector.ts
key_decisions:
  - "hijack: true required in exec.start() for bidirectional stream — Tty: true alone makes stdin read-only with Dockerode"
  - "Stable secrets file path (~/.claude-sandbox/api-key) instead of timestamp-based temp file — temp file deleted after start caused restart failures"
patterns_established:
  - "Pattern: All Dockerode interactive exec must use hijack:true + stdin:true in start() options"
  - "Pattern: Cleanup handlers always check for null/undefined before setRawMode(false)"
requirements_completed:
  - CLI-05
duration: "~45min"
completed: "2026-04-09"
---

# Phase 1 Plan 05: Shell Command Summary

**Interactive bash shell via Dockerode PTY exec with hijack:true, SIGWINCH resize propagation, and clean exit — completing the full 5-command claude-sandbox CLI.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-04-09T20:18:32Z
- **Completed:** 2026-04-09
- **Tasks:** 1 auto + 1 human-verify checkpoint (approved)
- **Files modified:** 4

## Accomplishments

- `claude-sandbox shell` opens a real PTY bash session in the container at `/workspace`
- `tty` inside the container returns `/dev/pts/0` (not "not a tty") — confirmed real PTY allocation
- `CLAUDE_SANDBOX=1` environment variable present inside container
- `docker.sock` not accessible inside container (isolation confirmed)
- Terminal resize propagates correctly via SIGWINCH → `exec.resize()`
- Two bugs discovered and fixed during human checkpoint verification (see Deviations)
- Human checkpoint passed: all 8 verification steps approved by operator

## Task Commits

1. **Task 1: shell subcommand with PTY allocation and SIGWINCH propagation** - `e78c864` (feat)
2. **Fix: stable secrets path + hijack:true for PTY** - `807cee0` (fix)

## Files Created/Modified

- `src/commands/shell.ts` — `registerShell(program)` export; Dockerode exec with `Tty:true`, `AttachStdin/Stdout/Stderr:true`, `WorkingDir:'/workspace'`; `hijack:true` in `exec.start()`; SIGWINCH via `process.stdout.on('resize', resize)`; raw mode set/restored; clean exit on `stream.on('end')`
- `src/cli.ts` — Added `import { registerShell }` and `registerShell(program)` call; all 5 commands now registered
- `src/commands/start.ts` — Updated to use stable secrets file path (no longer passes `cleanup` to be called at stop; file persists for restart cycles)
- `src/secrets/injector.ts` — Changed from timestamp-based temp file to stable `~/.claude-sandbox/api-key` path; `cleanup()` is now a best-effort delete intended only for permanent container removal

## Decisions Made

- **`hijack: true` in `exec.start()`:** Dockerode requires `hijack: true` (not `Tty: true`) in the `start()` options to return a raw bidirectional socket. Without it, only a one-way stream is returned and stdin input is silently dropped.
- **Stable secrets file path:** The original plan called for a timestamp-based temp file. Discovery during checkpoint: the temp file was deleted immediately after container start, causing `docker stop` + `claude-sandbox restart` to fail with a missing bind-mount path. Changed to a stable `~/.claude-sandbox/api-key` path, overwritten on each `start` call with the current key value.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Dockerode PTY stdin not working — hijack:true required**
- **Found during:** Human checkpoint verification (Task 2)
- **Issue:** The plan specified `exec.start({ Tty: true, stdin: true })` based on RESEARCH.md Pattern 4. In practice, Dockerode returns a read-only stream with this option set — stdin input was silently discarded. The real PTY required `hijack: true` in `exec.start()` to obtain a raw bidirectional socket.
- **Fix:** Changed `exec.start({ Tty: true, stdin: true })` to `exec.start({ hijack: true, stdin: true })`
- **Files modified:** `src/commands/shell.ts`
- **Verification:** `tty` inside container returned `/dev/pts/0`; keystrokes forwarded correctly
- **Committed in:** `807cee0`

**2. [Rule 1 - Bug] Fixed restart failures caused by deleted secrets temp file**
- **Found during:** Human checkpoint Step 6 (stop/restart cycle)
- **Issue:** `src/secrets/injector.ts` originally wrote the API key to a timestamp-based temp file (e.g., `~/.claude-sandbox/api-key-1712620000000`) and called `cleanup()` at the end of `start.ts` after container creation. The cleanup deleted the file before the container could bind-mount it on restart. `claude-sandbox restart` failed because the bind path no longer existed.
- **Fix:** Changed secrets file to a stable path `~/.claude-sandbox/api-key` (no timestamp). File is overwritten on each `start` call; `cleanup()` is reserved for permanent container removal (not called during normal stop).
- **Files modified:** `src/secrets/injector.ts`, `src/commands/start.ts`
- **Verification:** `stop` → `restart` cycle succeeded; `echo $ANTHROPIC_API_KEY` inside container after restart returned the key
- **Committed in:** `807cee0`

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both fixes were essential for correct operation. The PTY fix was required for any interactive use; the secrets fix was required for stop/restart cycles. No scope creep.

## Issues Encountered

- RESEARCH.md Pattern 4 example code uses `Tty: true` in `exec.start()` — this was incorrect for Dockerode's actual API. `hijack: true` is the correct option to obtain a bidirectional socket. Documented in Key Decisions and patterns for future reference.

## Human Checkpoint Results

All verification steps passed (approved by operator):

| Step | Check | Result |
|------|-------|--------|
| `tty` inside container | Real PTY device | `/dev/pts/0` confirmed |
| `echo $CLAUDE_SANDBOX` | Env var injected | `1` returned |
| `ls /workspace` | Mounted directory visible | Host directory listed |
| `ls /var/run/docker.sock` | Docker socket blocked | `No such file` confirmed |
| `stop` / `restart` / `status` | Lifecycle cycle | All working |
| Secrets file stability | Restart preserves key | API key present after restart |

## Open Questions Resolved

- **Does `~/.claude/` read-only mount cause Claude Code startup failures?** Not verified in this phase — Phase 1 focused on PTY and lifecycle correctness. Claude Code binary was not executed during checkpoint; this remains an open concern for Phase 2 integration testing.
- **Does tmpfs shadow mechanism work on this host (macOS)?** The `start` command wires tmpfs shadows via mount resolver (Plan 03), but the checkpoint did not explicitly test write operations to shadowed paths. Assumed functional based on Plan 03 verification; full validation deferred to Phase 2.

## User Setup Required

None - no external service configuration required beyond `ANTHROPIC_API_KEY` already documented in Phase 1.

## Next Phase Readiness

Phase 1 is complete. All 5 CLI commands verified end-to-end:
- `claude-sandbox start --mount <path>` — builds image, creates container, injects secrets
- `claude-sandbox stop` — stops container, updates state
- `claude-sandbox restart` — stop + start with stable secrets path
- `claude-sandbox status` — shows container ID, status, uptime, mounts
- `claude-sandbox shell` — opens real PTY bash at `/workspace`

Phase 2 (Project Configuration) can begin. Prerequisite: operator must have `ANTHROPIC_API_KEY` set in host environment.

## Known Stubs

None. All shell command logic is fully implemented and human-verified.

## Self-Check: PASSED

Files verified:
- `src/commands/shell.ts` — exists, exports `registerShell`
- `src/cli.ts` — updated with `registerShell(program)`
- `src/secrets/injector.ts` — stable path `~/.claude-sandbox/api-key`

Commits verified:
- `e78c864` — feat(01-05): add shell subcommand with PTY allocation and SIGWINCH propagation CLI-05
- `807cee0` — fix(01-05): use stable secrets path and hijack:true for PTY stdin CLI-05

---
*Phase: 01-sandbox-isolation*
*Completed: 2026-04-09*
