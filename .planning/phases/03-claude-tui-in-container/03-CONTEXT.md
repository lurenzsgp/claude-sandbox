# Phase 3: Claude TUI in Container - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the Claude Code TUI so it launches and runs correctly inside the sandbox container. Currently, running `claude` inside the container results in a hang with no output — the user must manually close the TTY. The fix involves rebasing the Dockerfile on the Anthropic official devcontainer spec, then validating the full end-to-end experience.

Scope: Dockerfile changes, environment setup, and smoke-test validation. The `shell.ts` invocation approach (docker exec -it with stdio: inherit) is not in scope unless it turns out to be the root cause.

</domain>

<decisions>
## Implementation Decisions

### Symptoms
- **D-01:** The TUI hangs on launch with no output — process starts but produces nothing, and the user must manually close the TTY.
- **D-02:** Root cause is likely missing system packages or environment variables required by React Ink (Claude Code's TUI framework). The current `node:22-bookworm` base is minimal and likely lacks ncurses/libtinfo or terminal-related system packages.

### Fix approach
- **D-03:** Rebase the Dockerfile on the Anthropic official devcontainer spec: `https://github.com/anthropics/claude-code/blob/main/.devcontainer/Dockerfile`.
- **D-04:** Adopt the devcontainer spec wholesale — use its base image, system packages, and environment setup. Then layer sandbox-specific configuration on top (UID/GID matching, secrets injection, repo mounts, stty sane wrapper).
- **D-05:** The nezhar/claude-container (`https://github.com/nezhar/claude-container/tree/main/`) is available as a secondary reference if the devcontainer spec alone is insufficient.

### Validation scope
- **D-06:** Phase is not complete until a full smoke test passes inside the container: `claude --version` runs cleanly, the TUI opens and renders correctly, and a basic interaction completes successfully.
- **D-07:** Auth must also be validated as part of the smoke test. If the devcontainer migration changes `~/.claude/` config paths and breaks host auth, the fallback is in-container authentication (`claude` auth flow run interactively inside the container).

### Preserved invariants
- **D-08:** UID/GID build args (CONT-02) must survive the Dockerfile rebase. Files created inside the container must remain accessible on the host.
- **D-09:** Secrets injection via `entrypoint.sh` and `.bashrc` must survive the base image change.
- **D-10:** The `stty sane` wrapper in `.bashrc` should be preserved (restores TTY after Claude exits raw mode).

### Claude's Discretion
- Whether to retain `node:22-bookworm` as an intermediate layer or replace the base entirely
- Exact environment variable additions (TERM, COLORTERM, LINES, COLUMNS) beyond what the devcontainer spec includes
- Whether shell.ts needs any changes (only if devcontainer changes the shell path or user home)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Official Claude Code environment spec
- `https://github.com/anthropics/claude-code/blob/main/.devcontainer/Dockerfile` — Anthropic's official devcontainer Dockerfile. Defines the correct base image, system packages, and environment setup for Claude Code TUI. **Primary reference — adopt this spec wholesale.**

### Community reference
- `https://github.com/nezhar/claude-container/tree/main/` — Community Claude container implementation. Use as secondary reference if devcontainer spec alone doesn't resolve the TUI hang.

### Files to modify
- `Dockerfile` — Current sandbox Dockerfile (`node:22-bookworm` base). Will be rebased on devcontainer spec while preserving sandbox-specific layers.
- `src/commands/shell.ts` — Shell command, currently uses `spawn('docker', ['exec', '-it', ...], { stdio: 'inherit' })`. In scope only if the root cause turns out to be the invocation method.
- `src/docker/image.ts` — Image build helper. May need updates if build args or base image reference changes.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `entrypoint.sh` — secrets injection script, must be preserved in the new Dockerfile
- `.bashrc` fragments in Dockerfile — API key injection + `stty sane` wrapper, must survive the rebase
- `src/docker/image.ts` — passes `--build-arg UID/GID` at build time; this must remain

### Established Patterns
- UID/GID matching via `--build-arg` at image build time (CONT-02) — non-negotiable, must be preserved
- Secrets file at `/run/secrets/anthropic-api-key` — injected by `entrypoint.sh`, read in `.bashrc`
- PTY delegation: `spawn('docker', ['exec', '-it', ...], { stdio: 'inherit' })` — keeps Node.js out of PTY mux business; only change if proven to be the cause

### Integration Points
- `src/docker/image.ts` builds the image using the `Dockerfile` at project root — the new Dockerfile must remain at the same path
- `~/.claude/` is mounted read-only from host at `/home/sandbox/.claude` inside the container — if the devcontainer changes the user home or Claude config path, this mount target must be updated in `src/commands/start.ts`

</code_context>

<specifics>
## Specific Ideas

- The devcontainer spec is the primary reference because Anthropic maintains it and it reflects exactly what Claude Code needs to run correctly.
- If host auth breaks after the rebase (e.g., config path mismatch), perform authentication interactively inside the container as a one-time setup rather than blocking the fix.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-claude-tui-in-container*
*Context gathered: 2026-04-17*
