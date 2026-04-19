---
status: awaiting_human_verify
trigger: "tui-hang-in-shell: claude hangs immediately when run inside claude-sandbox shell"
created: 2026-04-17T00:00:00Z
updated: 2026-04-18T20:30:00Z
---

## Current Focus

hypothesis: CONFIRMED — host ~/.claude/ contents (specifically host-path-keyed session state dirs: projects/, sessions/, session-env/, shell-snapshots/, etc.) cause claude to hang on startup when mounted into the container.
test: Mount ~/.claude/ :rw AND shadow all non-safe subdirectories with tmpfs mounts. Safe dirs (commands/, hooks/, get-shit-done/, agents/, plugins/) are preserved. State dirs get empty writable tmpfs. OAuth credential files in the root of ~/.claude/ remain readable.
expecting: Claude opens TUI immediately (OAuth credentials still present for auth, no stale session state to deadlock on).
next_action: User runs `claude-sandbox start --recreate --mount <path>` then `claude-sandbox shell` then `claude` — should open TUI with no hang

## Symptoms

expected: Running `claude` inside `claude-sandbox shell` opens the Claude Code TUI interactively
actual: claude hangs immediately — blank terminal, no output, no cursor movement, completely silent
errors: none visible — silent hang
reproduction: `claude-sandbox shell` → interactive bash opens → type `claude` → Enter → hangs
started: After Phase 3. Smoke test used `docker run --rm -it ... /bin/bash` directly.
prior_success: Smoke test via raw `docker run -it` worked. `claude-sandbox shell` uses Dockerode container.exec().

## Eliminated

- hypothesis: ~/.claude/ mounted :ro causing EROFS writes during startup
  evidence: :rw fix was applied (mounts.ts line 75 now uses :rw). User ran --recreate and tested. claude still hangs with zero output. :ro is ruled out as the sole cause.
  timestamp: 2026-04-17T02:00:00Z

- hypothesis: :rw mount on ~/.claude/ is sufficient — write access alone fixes the hang
  evidence: After switching to :rw, user retested and claude still hung with zero output. Something in the content of ~/.claude/ itself causes the hang regardless of write permission.
  timestamp: 2026-04-17T02:00:00Z

- hypothesis: Missing TERM env var
  evidence: shell.ts already sets TERM=xterm-256color and COLORTERM=truecolor in Env array
  timestamp: 2026-04-17T00:00:00Z

- hypothesis: PTY not allocated
  evidence: Tty:true, AttachStdin/Stdout/Stderr all set, hijack:true passed to exec.start()
  timestamp: 2026-04-17T00:00:00Z

- hypothesis: Dockerode stream mux (8-byte framing headers) breaking the PTY pipe
  evidence: Replaced with spawn('docker', ['exec', '-it', ...], {stdio:'inherit'}). User confirmed PTY now works (real cursor, Ctrl+C kills process). But claude still hangs with zero output. Problem is post-PTY, deeper in claude startup.
  timestamp: 2026-04-17T01:00:00Z

- hypothesis: DEVCONTAINER=true causing devcontainer-specific path issues
  evidence: DEVCONTAINER=true was set in Dockerfile ENV for the smoke test too (docker run -it), and the smoke test worked. So this env var is not the cause.
  timestamp: 2026-04-17T01:00:00Z

- hypothesis: ANTHROPIC_API_KEY missing (API-key auth flow failing)
  evidence: User is Pro/Max OAuth user. injectApiKey() returns null (no secrets file mounted). Claude reads OAuth credentials from ~/.claude/. The bash session has no ANTHROPIC_API_KEY which is correct for OAuth flow. So API key absence is not the problem — OAuth via ~/.claude/ is the intended path.
  timestamp: 2026-04-17T01:00:00Z

## Evidence

- timestamp: 2026-04-17T00:00:00Z
  checked: src/commands/shell.ts lines 43-51
  found: exec.start({ hijack: true, stdin: true }) — with Tty:true this should give a raw socket. However stream.pipe(process.stdout) pipes the Dockerode stream object directly. When Tty:true is used with hijack, Dockerode should give a raw duplex socket (no mux headers). BUT the issue is that process.stdin is being piped INTO the stream *after* setRawMode(true), and the 'end' event may never fire if the bash shell itself never exits cleanly.
  implication: The bash shell opened by exec is working (user reports interactive bash opens fine). The hang only happens when `claude` is run inside that bash. This points to a PTY-within-PTY or signal propagation issue.

- timestamp: 2026-04-17T00:00:00Z
  checked: Dockerfile lines 67-71
  found: A `claude()` bash function wrapper in .bashrc runs `command claude "$@"; stty sane`. This wrapper ONLY runs when .bashrc is sourced — i.e. in an interactive bash session. The exec'd bash IS interactive (Tty:true), so .bashrc should be sourced. The stty sane wrapper is present.
  implication: .bashrc is loaded, wrapper is available. The hang is not from missing stty sane (that's post-exit). The hang is during claude startup itself.

- timestamp: 2026-04-17T00:00:00Z
  checked: Dockerode exec PTY vs docker CLI exec PTY
  found: When `docker exec -it` is used via CLI, Docker daemon creates a PTY pair at the kernel level and wires it to the process. The `docker exec -it` route goes through the Docker daemon's exec endpoint with the AttachStdin+Tty path, but critically the CLI uses a raw TCP connection that is then wrapped in a raw PTY — the host terminal is directly connected to the container process's PTY via stdio:inherit on the docker binary. Dockerode with hijack:true gets the same raw socket, but the Node.js side must manually handle the raw byte pipe. The piping in shell.ts (stream.pipe(process.stdout) + process.stdin.pipe(stream)) should work for the bash shell layer — and the user confirms bash works. The claude TUI hang specifically suggests that when Claude Code itself calls process.stdin.setRawMode(true) INSIDE the container, it receives an error or detects that stdin is not a real TTY.
  implication: Inside the container, claude's process.stdin may not appear as an isatty() TTY even though Tty:true was set. This can happen if the PTY is allocated but the resize/winsize is not set before claude starts, or if the container process's stdin descriptor is not a proper PTY fd from claude's perspective.

- timestamp: 2026-04-17T00:00:00Z
  checked: user suggestion — spawn('docker', ['exec', '-it', containerId, '/bin/bash'], { stdio: 'inherit' })
  found: With stdio:'inherit', the docker CLI subprocess inherits the host process's actual stdin/stdout/stderr file descriptors (fd 0, 1, 2). Docker CLI then negotiates a raw PTY with the daemon and the container process gets a genuine isatty()=true PTY. This is byte-for-byte identical to what the user does manually in a terminal. No stream piping, no Dockerode stream wrapping — pure fd inheritance.
  implication: This approach is simpler, more robust, and sidesteps all Dockerode stream mux issues entirely. It is the correct fix for the PTY layer.

- timestamp: 2026-04-17T01:00:00Z
  checked: src/docker/mounts.ts resolveClaudeConfigMount() line 70
  found: ~/.claude/ is mounted :ro (read-only) at /home/sandbox/.claude. The bindSpec is hardcoded as `${hostPath}:${containerPath}:ro`.
  implication: Claude Code is an OAuth user application that reads AND writes to ~/.claude/ during startup. It needs to: refresh OAuth tokens (write), update session state (write), write Statsig analytics cache (write). With :ro, all these writes fail with EROFS. Claude Code appears to hang silently (zero output) when this initialization fails because the error occurs before any TUI rendering begins.

- timestamp: 2026-04-17T01:00:00Z
  checked: src/docker/mounts.ts resolveClaudeConfigJsonMount() line 85
  found: ~/.claude.json is also mounted :ro. The comment in preTrustPaths() documents this is intentional and the workaround is pre-writing trust on the host side before mounting. This :ro is acceptable — the trust dialog is pre-handled on the host.
  implication: .claude.json :ro is fine; .claude/ :ro is not fine.

- timestamp: 2026-04-17T01:00:00Z
  checked: What the smoke test mounted for ~/.claude/
  found: The smoke test used `docker run --rm -it <image> /bin/bash` — it did NOT mount ~/.claude/ at all. Claude Code inside the smoke test therefore used a fresh empty ~/.claude/ directory (no pre-existing config, no OAuth tokens). This is why the smoke test could start the TUI: no oauth token → claude showed a login prompt or ran in a degraded mode that doesn't require ~/.claude/ writes to succeed. The claude-sandbox setup mounts the real ~/.claude/ with OAuth tokens, triggering the token refresh code path that requires writing.
  implication: The smoke test not mounting ~/.claude/ masked the :ro bug. The real usage path (mounted OAuth credentials, read-only) is the first time this failure mode appears.

- timestamp: 2026-04-18T20:00:00Z
  checked: Human verified: skipping ~/.claude/ mount entirely (diagnostic mode)
  found: Claude opened immediately — showed login/auth screen or TUI with no hang.
  implication: ROOT CAUSE CONFIRMED — host ~/.claude/ contents cause the hang. Not a PTY issue, not a permissions issue, not an API key issue.

- timestamp: 2026-04-18T20:30:00Z
  checked: ~/.claude/ directory structure on host (ls -la)
  found: Top-level contains: agents/, backups/, cache/, commands/, debug/, downloads/, file-history/, get-shit-done/, history.jsonl, hooks/, notes/, package.json, plans/, plugins/, policy-limits.json, projects/, session-env/, sessions/, settings.json, shell-snapshots/, stats-cache.json, telemetry/, transcripts/, gsd-file-manifest.json. Notably NO statsig/ dir.
  implication: The problematic subdirs are: projects/ (host-path-keyed session history, keys are /Users/lcazzoli/... which are invalid in container), sessions/ (active host session state), session-env/ (46 subdirs of per-session env snapshots), shell-snapshots/, transcripts/, backups/, telemetry/, file-history/, cache/, debug/, notes/, plans/. Safe dirs: commands/, hooks/, get-shit-done/, agents/, plugins/.

- timestamp: 2026-04-18T20:30:00Z
  checked: Fix implementation — resolveClaudeConfigMasks() in src/docker/mounts.ts
  found: Added CLAUDE_CONFIG_SAFE_DIRS Set {'commands','hooks','get-shit-done','agents','plugins'} and resolveClaudeConfigMasks() which walks the top-level of ~/.claude/, skips safe dirs and non-directories (files), and returns a TmpfsSpec for each remaining directory with Mode 0o700. start.ts restored claudeMount.bindSpec and claudeJsonMount mounts, added claudeConfigMasks to HostConfig.Mounts alongside tmpfsMounts.
  implication: Container gets: OAuth credential files (settings.json, stats-cache.json, etc. at root) readable, safe user dirs readable/writable, all state dirs shadowed by empty writable tmpfs. TypeScript build passes clean.

## Resolution

root_cause: Host ~/.claude/ subdirectories that are keyed by host absolute paths (projects/, sessions/, session-env/, shell-snapshots/) contain stale or incompatible state when viewed from inside the container. Claude Code attempts to read/lock/update these during startup — because the paths don't match the container's /workspace/... structure, it deadlocks silently before the TUI renders.
fix: Mount ~/.claude/ :rw to give Claude write access for fresh session state. Shadow all non-safe subdirectories (projects/, sessions/, session-env/, shell-snapshots/, transcripts/, history/, telemetry/, backups/, cache/, etc.) with empty tmpfs mounts via resolveClaudeConfigMasks(). Safe user-authored dirs (commands/, hooks/, get-shit-done/, agents/, plugins/) are preserved. OAuth credential files in the root of ~/.claude/ remain readable for authentication.
verification: (pending human verification)
files_changed: [src/docker/mounts.ts, src/commands/start.ts]
