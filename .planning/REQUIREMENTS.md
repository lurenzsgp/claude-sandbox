# Requirements: Claude Sandbox

**Defined:** 2026-04-08
**Core Value:** Claude gets exactly the repos and configuration you give it — nothing more, nothing less.

## v1 Requirements

### CLI

- [ ] **CLI-01**: User can launch the sandbox by running `claude-sandbox start` with one or more `--mount <path>` flags specifying monorepo subfolder paths to expose
- [ ] **CLI-02**: User can stop the sandbox with `claude-sandbox stop`
- [ ] **CLI-03**: User can check sandbox state with `claude-sandbox status` (shows container ID, uptime, mounted paths)
- [ ] **CLI-04**: User can restart the sandbox with `claude-sandbox restart`
- [ ] **CLI-05**: User can open an interactive shell inside the sandbox with `claude-sandbox shell` (drops into terminal where they can run `claude`)
- [ ] **CLI-06**: User can specify a path to a `CLAUDE.md` file via `--claude-md <path>` flag to mount it at a known location inside the container

### Container

- [x] **CONT-01**: Container is persistent — state survives `stop` / `start` cycles (not `--rm`)
- [ ] **CONT-02**: Container user UID/GID matches host user so files created inside are accessible on the host
- [x] **CONT-03**: Docker socket mounting is blocked — the sandbox cannot access the host Docker daemon
- [ ] **CONT-04**: Claude Code CLI is pre-installed inside the container image

### Mounts

- [ ] **MNT-01**: Each `--mount <path>` flag bind-mounts the specified host directory into the container at a predictable path (e.g. `/workspace/<folder-name>`)
- [x] **MNT-02**: `~/.claude/` is mounted read-only inside the container so global Claude settings, hooks, commands, and memory are available
- [ ] **MNT-03**: A `CLAUDE.md` file specified via `--claude-md <path>` is mounted into the container at the project root (or another well-known location Claude reads)

### Auth

- [x] **AUTH-01**: `ANTHROPIC_API_KEY` from the host environment is injected into the container via a secrets file (not as a plain env var) to avoid exposure in `docker inspect`

## v2 Requirements

### CLI

- **CLI-V2-01**: User can run a one-off command inside the sandbox with `claude-sandbox exec <cmd>` without opening an interactive shell
- **CLI-V2-02**: User can view container logs with `claude-sandbox logs`
- **CLI-V2-03**: User can list all sandbox instances with `claude-sandbox list`

### Configuration

- **CONF-V2-01**: User can define repo path aliases in `~/.claude-sandbox/config.json` so they can use short names instead of full paths (`--mount payments` instead of `--mount /Users/lcazzoli/workspace/monorepo/payments`)
- **CONF-V2-02**: User can auto-detect available repos from a configured monorepo root

### Operations

- **OPS-V2-01**: User receives a warning if the container image is older than 30 days
- **OPS-V2-02**: User can force-rebuild the container image with `claude-sandbox build --force`
- **OPS-V2-03**: Sandbox detects unexpected container exit and shows recovery instructions

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full monorepo mount | Defeats the isolation purpose |
| GUI / web UI | Terminal-only tool by design |
| Network isolation | Only filesystem access is being constrained |
| Per-sandbox config profiles | User wants the same `~/.claude/` setup as host |
| Docker socket mounting | Security anti-feature — explicitly blocked |
| Multi-user / team sandboxes | Single-user local tool for now |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLI-01 | Phase 1 | Pending |
| CLI-02 | Phase 1 | Pending |
| CLI-03 | Phase 1 | Pending |
| CLI-04 | Phase 1 | Pending |
| CLI-05 | Phase 1 | Pending |
| CLI-06 | Phase 2 | Pending |
| CONT-01 | Phase 1 | Complete |
| CONT-02 | Phase 1 | Pending |
| CONT-03 | Phase 1 | Complete |
| CONT-04 | Phase 1 | Pending |
| MNT-01 | Phase 1 | Pending |
| MNT-02 | Phase 1 | Complete |
| MNT-03 | Phase 2 | Pending |
| AUTH-01 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0 ✓

---

*Requirements defined: 2026-04-08*
*Roadmap created: 2026-04-08*
