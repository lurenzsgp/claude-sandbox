# Milestones

## v1.0 MVP (Shipped: 2026-04-19)

**Phases completed:** 3 phases, 8 plans
**Timeline:** 2026-04-08 → 2026-04-19 (11 days)
**LOC:** ~880 TypeScript source

**Key accomplishments:**

- TypeScript CLI scaffold: Commander.js with 5 commands, esbuild CJS bundle, Dockerfile with UID/GID build-args and secrets injection via bind-mount
- Core infrastructure: typed errors, Dockerode client wrapper, state manager (JSON persistence), and API key injector
- Volume mount resolver: repo bind-mounts with whitelist-based tmpfs masking via `.claude-sandbox.yml` include lists
- Lifecycle commands: `start / stop / restart / status` fully wired to Dockerode with persistent container semantics
- Interactive PTY shell: Dockerode `hijack:true`, SIGWINCH resize propagation, clean stdin/stdout/exit — full `claude-sandbox shell` working
- `--claude-md <path>`: project CLAUDE.md mounted read-only at `/workspace/CLAUDE.md` inside sandbox
- Devcontainer rebase: full apt package set + `DEVCONTAINER=true` + `COLORTERM/LINES/COLUMNS` per exec session — React Ink TUI hang resolved and human-verified

**Scope note:** `~/.claude/` bind mount removed post-audit — host session state caused TUI issues; users authenticate fresh per container via `claude /login`.

---
