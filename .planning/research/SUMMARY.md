# Research Summary — Claude Sandbox

## Recommended Stack

- **Commander ^12.0.0** — CLI framework; 500M weekly downloads, zero dependencies, 18ms startup, battle-tested API
- **Dockerode ^3.4.0** — Native Node.js Docker API client; best error handling, full daemon control without shelling out
- **node:22-bookworm** — Container base image; Debian 12 stability, broad tool compatibility for diverse monorepos
- **TypeScript + tsx** — Type safety for Docker API calls, fast iteration without a build step during dev
- **JSON config** — Explicit, zero-dependency, schema-validatable; no YAML implicit type coercion surprises

## Table Stakes Features

- `start --repo <name>` — Launch persistent container with selected repos bind-mounted
- `stop` — Clean shutdown, state persists across sessions
- `status` — Container info (ID, uptime, mounted repos)
- `exec <cmd>` / `shell` — Run commands or drop into interactive terminal for Claude Code
- `~/.claude/` auto-mount (read-only) — Global Claude config, commands, memory available inside container
- `ANTHROPIC_API_KEY` injection from host env — No interactive login
- Persistent container — Not ephemeral; state survives `stop`/`start`

## Architecture Pattern

CLI (Commander) → Dockerode → Docker daemon → persistent container with selective bind mounts and injected env vars. State tracked in a local JSON file reconciled against Docker daemon on each command. All operations are idempotent — `start` when already running is a no-op.

## Top Pitfalls to Avoid

1. **UID/GID mismatch** — Files created in container (root) can't be edited on host. Fix: match container user UID to host user at build time via `--build-arg`.
2. **API key in env var** — Visible in `docker inspect`. Fix: volume-mount a secrets file (mode 0o600) instead of passing via `-e`.
3. **Docker socket mounting** — `var/run/docker.sock` = full host compromise. Fix: explicitly reject this in validation; make it an anti-feature.
4. **TTY allocation** — Claude Code requires interactive terminal; PTY allocation race conditions. Fix: allocate PTY with Dockerode correctly, propagate `SIGWINCH`.
5. **macOS bind mount performance** — 50–150x slower for large repos on Docker Desktop. Fix: use `:cached` consistency flag, warn on large repos at mount time.

## Phase Implications

**Phase 1 — MVP:** Build CLI skeleton + Docker lifecycle (start/stop/status/exec/shell), implement all 5 critical pitfall fixes, selective repo mounting, `~/.claude/` mount, env var injection. Result: user can sandbox Claude Code to specific repos.

**Phase 2 — Usability:** Config file support (`~/.claude-sandbox/config.json`), smart repo path discovery, image staleness warnings, crash recovery, `list` command. Result: power-user workflow, no need to pass flags every time.

**Phase 3 — Polish:** Automatic image updates, health checks, resource constraints, Windows/WSL2 support if demand warrants.

## Open Questions

- Container naming: single named sandbox per user, or multiple named sandboxes?
- Image lifecycle: build locally from Dockerfile, or publish to a registry?
- Repo path discovery: auto-detect from monorepo markers (package.json, go.mod) or require explicit config?
- Crash recovery: auto-restart silently, or detect-and-notify?
