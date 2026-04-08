# Roadmap: Claude Sandbox

**Milestone:** v1.0
**Granularity:** Coarse
**Total phases:** 2
**Requirements:** 14 v1 requirements

## Phase 1 — Sandbox Isolation

**Goal:** Users can launch Claude Code in an isolated Docker container with access only to specified repos, with global Claude configuration and secure API key injection.

**Requirements:** CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CONT-01, CONT-02, CONT-03, CONT-04, MNT-01, MNT-02, AUTH-01

### Success Criteria
- [ ] User can start a persistent sandbox container with selected repos using `claude-sandbox start --mount <path> --mount <path>`
- [ ] User can interact with Claude Code inside the sandbox via `claude-sandbox shell` (interactive terminal)
- [ ] User can check sandbox state with `claude-sandbox status` and restart with `claude-sandbox restart`
- [ ] Global Claude config from `~/.claude/` is available inside the sandbox (read-only)
- [ ] API key is securely injected from host environment (not exposed in `docker inspect`)
- [ ] Container state persists across `stop` / `start` cycles without losing files or state
- [ ] Files created inside container are editable on host (UID/GID match)
- [ ] Sandbox cannot access Docker socket or other host resources (isolation enforced)

---

## Phase 2 — Project Configuration

**Goal:** Users can bring project-level Claude configuration into the sandbox alongside global settings.

**Requirements:** CLI-06, MNT-03

### Success Criteria
- [ ] User can mount a project-level `CLAUDE.md` file via `claude-sandbox start --claude-md <path>`
- [ ] Project-specific Claude configuration is available inside the sandbox at a location Claude reads automatically
- [ ] Both global `~/.claude/` and project `CLAUDE.md` are active inside the sandbox without conflicts
