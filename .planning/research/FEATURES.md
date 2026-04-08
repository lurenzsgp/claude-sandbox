# Feature Landscape

**Project:** Claude Sandbox CLI  
**Domain:** Developer sandbox / container isolation  
**Researched:** 2026-04-08  
**Confidence:** HIGH (based on Windows Sandbox, Vercel Sandbox, Gemini CLI, Docker Sandboxes precedent)

---

## Table Stakes

Features users expect in a sandbox/container management CLI. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **`start` command** | Begin a sandbox session | Low | Launch persistent container with selected repos mounted |
| **`stop` command** | End a sandbox session cleanly | Low | Stop container without deletion (data persists) |
| **`status` command** | Check if sandbox is running | Low | Show container ID, running time, mounted repos, resource usage |
| **`exec` command** | Run commands inside the sandbox | Medium | Execute bash/zsh commands in running container; stream output back to terminal |
| **`shell` / attach mode** | Interactive terminal inside sandbox | Medium | `docker exec -it` interface; full terminal emulation for Claude CLI |
| **Selective repo mounting** | Core feature: mount only chosen repos | Medium | `--repo payments --repo auth` syntax to select which directories to mount |
| **`~/.claude/` auto-mount** | Access global Claude configuration | Low | Always mounted; contains API keys, commands, memory, hooks |
| **Environment variable injection** | `ANTHROPIC_API_KEY` passed through | Low | Read from host env, inject at container start (no interactive login) |
| **Persistent state** | Container survives across sessions | Low | Use `docker start` not `docker run --rm`; container retains filesystem changes |
| **Container lifecycle visibility** | Know what's in the sandbox | Low | `list` command shows all sandboxes; show creation time, last accessed |

**Rationale:** These are all standard in Windows Sandbox, Vercel Sandbox, and Gemini CLI. Users will expect them.

---

## Differentiators

Features that set this tool apart from raw `docker run` or `docker exec`. High value but not essential for MVP.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Smart repo path resolution** | Auto-discover monorepo structure, suggest repos | Medium | Scan `~/workspace` or user-defined monorepo root; parse directory layout to auto-suggest `--repo payments` instead of requiring full paths |
| **Config file support** | Save default sandbox setups | Medium | `~/.claude-sandbox/config.json` with default repos, container settings, image tag. Speeds up repeated invocations. |
| **Volume cleanup on stop** | Optional: remove named volumes on container stop | Low | Useful for ephemeral test sandboxes; opt-in via flag |
| **Multi-sandbox management** | Run multiple sandboxes concurrently | Medium | Different container names per sandbox, show all running via `list --all`. Allows parallel work on different tasks. |
| **Resource constraints flag** | Limit CPU/memory per sandbox | Low | `--cpu 2 --memory 4g` to prevent runaway sandboxes from starving host |
| **Health check reporting** | Show if container is stuck/unhealthy | Medium | Docker health status; report via `status` command with warnings |
| **Automatic image updates** | Check for new base image, prompt or auto-update | Medium | Weekly rebuild of image; warn if using stale base image (security patches available) |
| **Config validation** | Validate that mounted repos exist before starting | Low | Catch misconfiguration early; suggest alternatives if repo not found |
| **Session history** | Show what commands ran in each sandbox session | Low | Lightweight log of `exec` commands for auditability |
| **Copy files in/out** | `claude-sandbox cp host:/path container:/path` | Medium | `docker cp` wrapper; useful for sharing files without full mount |

**Rationale:** These improve usability and safety beyond raw Docker. Not MVP-blocking, but valuable in Phase 2.

---

## Anti-Features

Deliberately NOT building these to avoid scope creep and stay focused on filesystem isolation.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Full monorepo mount** | Defeats the entire purpose (isolation). Also hurts macOS bind mount performance | Use `--repo X --repo Y` to mount only what you need |
| **GUI / web dashboard** | Terminal-only is faster, scriptable, and aligns with Claude Code philosophy | Terminal UX; optionally parse JSON output for third-party dashboards |
| **Network isolation** | Out of scope; only filesystem access is being constrained. Network reach is fine. | Docker's default network settings are sufficient. No custom network rules needed. |
| **Per-sandbox Claude config profiles** | User wants one `~/.claude/` setup across all sandboxes | Mount `~/.claude/` from host. If per-sandbox config is needed later, store in mounted repo's `.claude.md` (already supported by Claude) |
| **Build custom images** | Too much complexity; use pre-built base images | Pre-build image with Claude Code pre-installed; users can extend via Dockerfile if they want |
| **Container image registry / push** | Not a container registry tool | Focus on local image management; users manage registries separately if needed |
| **Kubernetes support** | Out of scope; this is local dev tool | If users want K8s later, they can use this tool to build/test locally, then deploy via other means |
| **Windows native container support** | macOS primary target; Linux/WSL2 secondary. Windows Server containers are different paradigm | Document macOS/Linux; can add Windows support later if demand exists |
| **Secrets management system** | Docker Secrets or Vault are purpose-built | Use env vars for dev; document linking to external secrets managers for prod |

---

## Feature Dependencies

What must exist before what.

```
Core bootstrap:
  start → stop
  start → status
  start → exec
  start → shell

Configuration:
  start (requires repo paths)
    ↓
  config file support (optional convenience)

Advanced:
  status → health checks (build on status)
  exec → session history (audit what ran)
  
Multi-sandbox:
  stop (single sandbox)
    ↓
  list (multiple sandboxes)
    ↓
  multi-sandbox management (concurrent)

Image management:
  All commands ← base image setup (must exist first)
    ↓
  Automatic image updates (Phase 2+)
```

**Critical path:** `start` → `stop` → `status` → `exec` → `shell` (everything depends on container being runnable)

---

## MVP Recommendation

### Phase 1 (MVP) — Prioritize these

1. **`start --repo <name> [--repo <name>...]`** — Core feature, enables all else
2. **`stop`** — Container lifecycle  
3. **`status`** — Visibility into running state
4. **`exec <command>`** — Run Claude inside sandbox
5. **`shell`** — Interactive terminal for Claude CLI
6. **Environment injection** — `ANTHROPIC_API_KEY` from host
7. **`~/.claude/` mount** — Auto-mount from host

**Why:** These are the minimum set to satisfy "isolated Claude environment with repo selection."

### Phase 2 — Add these for usability

1. **Config file support** (`.claude-sandbox.json`)
2. **`list` command** for visibility
3. **Volume cleanup on stop** (optional)
4. **Resource constraints** (`--cpu`, `--memory`)
5. **Config validation** (catch missing repos early)
6. **Smart repo path resolution** (auto-discovery)

### Phase 3+ — Polish and scale

1. **Automatic image updates** with staleness warnings
2. **Health checks** and diagnostics
3. **Session history / audit logging**
4. **Copy files in/out** (`cp` command)
5. **Multi-sandbox management** improvements
6. **Windows / WSL2 support** (if demand exists)

---

## Open Questions for Phase-Specific Research

- **CLI UX:** Should `status` show live resource usage? Requires `docker stats` integration.
- **Repo resolution:** How to auto-discover monorepo structure? Need to scan for common markers (package.json, go.mod, Cargo.toml, etc.)
- **Container naming:** Single persistent container per user, or multiple named sandboxes? (Affects `list` and `exec` complexity)
- **Image versioning:** How to version the base image? Semver on the CLI tool, or independent image versioning?
- **Crash recovery:** If container exits unexpectedly, should `exec` auto-restart it?

---

## Sources

- [Windows Sandbox CLI Reference](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-cli)
- [Vercel Sandbox CLI Reference](https://vercel.com/docs/vercel-sandbox/cli-reference)
- [Gemini CLI Sandboxing](https://geminicli.com/docs/cli/sandbox/)
- [Docker Sandboxes Documentation](https://docs.docker.com/ai/sandboxes/)
- [Docker AI Sandboxes Architecture](https://docs.docker.com/ai/sandboxes/architecture/)
- [Claude Code Sandboxing Docs](https://code.claude.com/docs/en/sandboxing)
- [DataCamp: Claude Code Docker Tutorial](https://www.datacamp.com/tutorial/claude-code-docker)
- [Medium: Running Claude Code in Docker Containers](https://medium.com/rigel-computer-com/running-claude-code-in-docker-containers-one-project-one-container-1601042bf49c)
