# Retrospective

## Milestone: v1.0 — MVP

**Shipped:** 2026-04-19
**Phases:** 3 | **Plans:** 8 | **Timeline:** 11 days

### What Was Built

- Full CLI sandbox: `start / stop / restart / status / shell` with persistent Docker container
- Selective repo exposure via `.claude-sandbox.yml` include lists + tmpfs masking
- API key injection via secrets file bind-mount (not exposed in `docker inspect`)
- Interactive PTY shell via Dockerode `hijack:true` with SIGWINCH resize
- `--claude-md <path>` for project-level Claude configuration
- Devcontainer-spec Dockerfile with full apt package set — React Ink TUI works correctly

### What Worked

- **Goal-backward planning** — each phase had clear success criteria that drove what to build
- **Human verification checkpoints** — caught real issues (PTY hang, TUI hang) before phase close
- **Incremental complexity** — Phase 1 foundation made Phase 2 a trivial extension
- **Reading Anthropic's devcontainer spec** — solved TUI hang in one plan instead of guessing at packages

### What Was Inefficient

- **MNT-02 rework at milestone close** — `~/.claude/` mount was planned, implemented, tested, then removed after audit. The session-state collision with TUI should have been caught during Phase 3 investigation instead of after. Cost: 2 plans worth of implementation that was deleted.
- **SUMMARY frontmatter schema** — Phase 2 summaries used functional descriptions instead of REQ-IDs; caused partial audit scores. Minor but preventable.

### Patterns Established

- **Secrets via bind-mount, not env**: write key to `/tmp` file, bind-mount into `/run/secrets/`, read in entrypoint.sh
- **`sleep infinity` as PID 1**: exec sessions each get fresh PTY; bash as PID 1 breaks setRawMode
- **Static + dynamic env split**: `TERM/COLORTERM` baked into `createContainer`, `LINES/COLUMNS` injected per exec session only
- **`DEVCONTAINER=true`**: required for React Ink full TUI path — without it, Claude falls back to a non-interactive renderer

### Key Lessons

- Mount `~/.claude/` only when you fully understand which subdirs are safe — host session state and container paths are incompatible
- `hijack:true` is required for bidirectional PTY in Dockerode; `Tty:true` alone gives read-only stream
- The devcontainer apt package list is the authoritative source for "what Claude Code needs" — use it rather than trial-and-error
- Fresh session per container (no host config bleed) is the right default for isolation tools

## Cross-Milestone Trends

| Metric | v1.0 |
|--------|------|
| Phases | 3 |
| Plans | 8 |
| Timeline | 11 days |
| Rework | 1 feature removed post-audit (MNT-02) |
| Human checkpoints passed | All |
