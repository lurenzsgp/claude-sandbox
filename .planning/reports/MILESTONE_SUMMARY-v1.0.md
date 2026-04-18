# Milestone v1.0 — Project Summary

**Generated:** 2026-04-18
**Purpose:** Team onboarding and project review

---

## 1. Project Overview

**Claude Sandbox** is a CLI tool that launches a persistent Docker container giving Claude Code an isolated environment with access only to the repos you explicitly choose. It protects a monorepo from unintended access while preserving the full Claude configuration (global `~/.claude/` and project-level `CLAUDE.md` files).

**Core value:** Claude gets exactly the repos and configuration you give it — nothing more, nothing less.

**Target user:** A developer working in a monorepo who wants to use Claude Code without exposing the entire codebase to the AI agent.

**What it does:**
- `claude-sandbox start --mount <path> [--mount <path>]` — builds the container image, creates a persistent container, injects the API key, and mounts the specified repo subdirectories
- `claude-sandbox shell` — opens an interactive PTY bash session inside the container at `/workspace`; from there the user runs `claude` normally
- `claude-sandbox stop / restart / status` — lifecycle management; state survives stop/start cycles
- `claude-sandbox start --claude-md <path>` — mounts a project-level CLAUDE.md at `/workspace/CLAUDE.md`

All 3 milestone phases are complete and human-verified.

---

## 2. Architecture & Technical Decisions

### Runtime & Bundling
- **TypeScript + esbuild (CJS format)**
  - Why: esbuild is fast; CJS format avoids `dynamic require` errors when bundling commander@14 (a CJS package) into ESM context on Node 18
  - Phase: 1

- **Output: `dist/claude-sandbox.cjs` (not `.js`)**
  - Why: The project has `"type": "module"` in package.json; `.js` files would be treated as ESM. `.cjs` extension forces Node to treat the bundle as CommonJS regardless
  - Phase: 1

- **No shebang in `src/cli.ts`**
  - Why: esbuild's `banner` config injects the shebang into the bundle; having one in source as well produces a double shebang (`SyntaxError` at runtime)
  - Phase: 1

### CLI Framework
- **Commander.js v14**
  - Why: Robust, well-documented, zero runtime dependencies of its own. Subcommands registered via `program.command()` in separate files (`registerStart`, `registerShell`, etc.)
  - Phase: 1

### Docker Integration
- **Dockerode v4 for all Docker API calls**
  - Why: Native Node.js Docker API client; avoids shelling out to `docker` CLI, gives programmatic access to container lifecycle, exec, and stream management
  - Phase: 1

- **`hijack: true` in `exec.start()` for PTY sessions**
  - Why: `Tty: true` alone returns a one-way read-only stream; `hijack: true` returns a raw bidirectional socket required for interactive stdin. This was discovered and fixed during Phase 1 human checkpoint verification
  - Phase: 1

- **`sleep infinity` as container CMD**
  - Why: Running `/bin/bash` as PID 1 holds a PTY master that interferes with `setRawMode()` in exec sessions. `sleep infinity` keeps the container alive without holding a PTY; each `docker exec -it` gets a fresh, clean PTY
  - Phase: 3 (changed from `/bin/bash`)

### Security & Secrets
- **API key injected via secrets file, not env var**
  - Why: Env vars appear in `docker inspect` output, leaking the key. A bind-mounted file at `/run/secrets/anthropic-api-key` (mode 0600) is readable by the container but absent from `docker inspect Env`
  - Phase: 1

- **Stable secrets file path: `~/.claude-sandbox/api-key`**
  - Why: A timestamp-based temp file was deleted after container creation, causing `restart` failures because the bind-mount path no longer existed. Changed to a stable path overwritten on each `start`
  - Phase: 1 (bug fixed in Plan 05)

- **Docker socket explicitly blocked**
  - Why: If the container could access the Docker socket it could escape isolation by spawning new containers. Validation rejects any attempt to mount `/var/run/docker.sock`
  - Phase: 1

### Container Configuration
- **UID/GID matching via `--build-arg UID/GID`**
  - Why: Container runs as `sandbox` user with the same UID/GID as the host user. Without this, files created inside the container are owned by a foreign UID and appear read-only on the host
  - Phase: 1

- **Dockerfile rebased on Anthropic devcontainer spec**
  - Why: The minimal `node:22-bookworm` base was missing `ncurses`/`libtinfo` and other system packages required by Claude Code's React Ink TUI. Without the full package set the TUI hangs on launch
  - Phase: 3

- **`DEVCONTAINER=true` required**
  - Why: Claude Code checks this env var to decide between the full React Ink TUI renderer and a minimal fallback. Without it the TUI will not render correctly even with all packages present
  - Phase: 3

### Mounts
- **Selective bind-mounts (not copy) for repos**
  - Why: Changes made inside the container reflect immediately on the host filesystem — no sync step needed
  - Phase: 1

- **`~/.claude/` mounted read-only**
  - Why: Keeps global Claude settings, hooks, commands, and memory (including GSD) in sync with the host setup without duplication
  - Phase: 1

- **`--claude-md <path>` mounts at `/workspace/CLAUDE.md`**
  - Why: Claude Code automatically reads CLAUDE.md files found by walking up from `cwd`. Mounting at the `/workspace/` root makes it a global instruction file that applies to all mounted repos
  - Phase: 2

### Terminal / TUI
- **Static `TERM=xterm-256color` + `COLORTERM=truecolor` in container Env**
  - Why: Provides a baseline terminal description for all sessions; baked into `createContainer` Env
  - Phase: 3

- **Dynamic `LINES` + `COLUMNS` per exec session only**
  - Why: Terminal dimensions depend on the actual terminal size at exec time. Baking them statically would give wrong dimensions when the user resizes their terminal
  - Phase: 3

---

## 3. Phases Delivered

| Phase | Name | Status | One-Liner |
|-------|------|--------|-----------|
| 1 | Sandbox Isolation | ✅ Complete (5 plans) | Full 5-command CLI with PTY shell, secrets injection, selective bind-mounts, and UID/GID matching |
| 2 | Project Configuration | ✅ Complete (2 plans) | `--claude-md` flag mounts a project CLAUDE.md at `/workspace/CLAUDE.md` with conflict detection and state persistence |
| 3 | Claude TUI in Container | ✅ Complete (1 plan) | Dockerfile rebased on Anthropic devcontainer spec; `DEVCONTAINER=true` + full package set resolves TUI hang; human-verified |

---

## 4. Requirements Coverage

All 14 v1 requirements delivered and verified:

| ID | Requirement | Status |
|----|-------------|--------|
| CLI-01 | `claude-sandbox start --mount <path>` | ✅ Complete |
| CLI-02 | `claude-sandbox stop` | ✅ Complete |
| CLI-03 | `claude-sandbox status` (container ID, uptime, mounts) | ✅ Complete |
| CLI-04 | `claude-sandbox restart` | ✅ Complete |
| CLI-05 | `claude-sandbox shell` — interactive PTY terminal | ✅ Complete |
| CLI-06 | `--claude-md <path>` flag | ✅ Complete |
| CONT-01 | Persistent container — state survives stop/start | ✅ Complete |
| CONT-02 | Container UID/GID matches host user | ✅ Complete |
| CONT-03 | Docker socket mounting blocked | ✅ Complete |
| CONT-04 | Claude Code CLI pre-installed in image | ✅ Complete |
| MNT-01 | `--mount <path>` bind-mounts into `/workspace/<name>` | ✅ Complete |
| MNT-02 | `~/.claude/` mounted read-only inside container | ✅ Complete |
| MNT-03 | `--claude-md` path mounted at `/workspace/CLAUDE.md` | ✅ Complete |
| AUTH-01 | `ANTHROPIC_API_KEY` injected via secrets file (not plain env var) | ✅ Complete |

**v2 requirements** (CLI-V2-01–03, CONF-V2-01–02, OPS-V2-01–03) are defined in REQUIREMENTS.md but deferred to the next milestone.

---

## 5. Key Decisions Log

| ID | Decision | Phase | Rationale |
|----|----------|-------|-----------|
| — | esbuild CJS output format | 1 | commander@14 is CJS; ESM format caused `dynamic require` errors on Node 18 |
| — | Output: `dist/claude-sandbox.cjs` | 1 | `"type": "module"` in package.json; `.cjs` extension forces CJS interpretation |
| — | No shebang in `src/cli.ts` | 1 | esbuild banner injects it; two shebangs → SyntaxError |
| — | Dockerode `hijack: true` for PTY exec | 1 | `Tty: true` alone returns read-only stream; `hijack: true` gives bidirectional socket |
| — | Stable secrets file `~/.claude-sandbox/api-key` | 1 | Timestamp temp files deleted after start → restart failures |
| — | `sleep infinity` as container CMD | 3 | `/bin/bash` as PID 1 holds PTY master, breaks `setRawMode()` in exec sessions |
| — | `DEVCONTAINER=true` env var | 3 | Claude Code checks this to choose TUI renderer; fallback renderer doesn't support full TUI |
| — | Full Anthropic devcontainer apt package set | 3 | ncurses/libtinfo/terminal packages required by React Ink; missing from minimal `node:22-bookworm` base |
| — | `LINES`/`COLUMNS` per-exec only (not in `createContainer`) | 3 | Dynamic values depend on actual terminal size at exec time; static baking gives wrong dimensions |
| — | `ignore@7.0.5` for `.claude-sandbox-ignore` parsing | 1 | Spec-correct gitignore parsing (negation, `**`, escaping) over custom regex |
| — | Mount `~/.claude/` at `/home/sandbox/.claude` (not `/root/.claude`) | 1 | Container runs as `sandbox` user, not root; wrong path would break Claude Code config lookup |
| — | `__dirname` over `import.meta.url` in `image.ts` | 1 | esbuild CJS output makes `import.meta.url` empty; `__dirname` is correctly injected by esbuild |
| — | `claudeMd: null` in state when `--claude-md` not provided | 2 | Matches the `string | null | undefined` three-state type; explicit null distinguishes "not set" from "unknown" |
| — | Conflict detection warns (not errors) for repo overlap | 2 | CLAUDE.md inside a mounted repo is still accessible at two paths — not an error, just a notice |

---

## 6. Tech Debt & Deferred Items

### Known Issues

| Item | Severity | Notes |
|------|----------|-------|
| `esbuild.config.ts` not under `rootDir: src/` | Minor | Pre-existing TypeScript config issue; `tsc --noEmit` reports it but it doesn't affect the build. Fix: add `include` to tsconfig or move esbuild config under `src/` |

### Open Concerns from Phase 1

- **tmpfs shadow validation on macOS**: The `start` command wires tmpfs shadows via the mount resolver (`.claude-sandbox-ignore` patterns), but the Phase 1 checkpoint did not explicitly test write operations to shadowed paths. Functionality is assumed correct based on code review.

### Deferred to v2

- `claude-sandbox exec <cmd>` — one-off command without interactive shell (CLI-V2-01)
- `claude-sandbox logs` — container log viewing (CLI-V2-02)
- `claude-sandbox list` — list all sandbox instances (CLI-V2-03)
- Repo aliases in `~/.claude-sandbox/config.json` (CONF-V2-01)
- Auto-detection of monorepo repos (CONF-V2-02)
- Stale image warning after 30 days (OPS-V2-01)
- Force-rebuild with `--force` (OPS-V2-02)
- Unexpected exit detection and recovery (OPS-V2-03)

---

## 7. Getting Started

### Prerequisites

- Docker Desktop running on macOS
- `ANTHROPIC_API_KEY` set in your environment (`export ANTHROPIC_API_KEY=sk-ant-...`)
- Node.js 18+ (for building from source)

### Build & Install

```bash
git clone <repo>
cd claude-sandbox
npm install
npm run build
npm link        # makes `claude-sandbox` available globally
```

Or install directly via npm (if published):
```bash
npm install -g claude-sandbox
```

### Build the Container Image

The image is built automatically on first `start`. To build manually:

```bash
docker build --build-arg UID=$(id -u) --build-arg GID=$(id -g) -t claude-sandbox:latest .
```

The `--build-arg UID/GID` flags are critical — they ensure files created inside the container are owned by your host user.

### Basic Usage

```bash
# Start sandbox with one or more repo paths
claude-sandbox start --mount ~/workspace/my-service

# Start with a project CLAUDE.md
claude-sandbox start --mount ~/workspace/my-service --claude-md ~/workspace/my-service/CLAUDE.md

# Open interactive shell (then run `claude` inside)
claude-sandbox shell

# Check status
claude-sandbox status

# Stop / restart
claude-sandbox stop
claude-sandbox restart
```

### Key Directories

```
src/
  cli.ts                    — Commander.js entry point; registers all subcommands
  commands/
    start.ts                — Start command: image build, container create, secrets, mounts
    stop.ts                 — Stop command: container stop, state update
    restart.ts              — Restart command: stop → start cycle
    status.ts               — Status command: reads state.json, prints info
    shell.ts                — Shell command: Dockerode PTY exec with hijack:true + SIGWINCH
  docker/
    client.ts               — Dockerode wrapper (typed Docker API calls)
    image.ts                — Image build helper (passes --build-arg UID/GID)
    mounts.ts               — Mount resolver: repos, ~/.claude/, CLAUDE.md, tmpfs shadows
  secrets/
    injector.ts             — API key secrets file inject/cleanup
  state/
    manager.ts              — state.json read/write + Docker reconciliation
  config/
    claude-json.ts          — ~/.claude.json mount helper
Dockerfile                  — node:22-bookworm + Anthropic devcontainer packages + sandbox user
entrypoint.sh               — Reads API key from /run/secrets/, exports ANTHROPIC_API_KEY
```

### Tests

```bash
npm test        # vitest — 36 tests across 4 files
```

Test files:
- `src/docker/mounts.test.ts` — Mount resolver (18 tests)
- `src/docker/client.test.ts` — Docker client wrapper (7 tests)
- `src/secrets/injector.test.ts` — Secrets injection (5 tests)
- `src/state/manager.test.ts` — State manager (6 tests)

### Where to Look First

- **Adding a new CLI command**: see `src/commands/start.ts` as the reference pattern; register in `src/cli.ts`
- **Mount logic**: `src/docker/mounts.ts` — all bind-mount resolution happens here
- **Container lifecycle**: `src/commands/start.ts` (create/start) and `src/commands/stop.ts`
- **PTY/interactive exec**: `src/commands/shell.ts` — note the `hijack: true` requirement

---

## Stats

- **Timeline:** 2026-04-08 → 2026-04-18 (~10 days)
- **Phases:** 3 / 3 complete
- **Plans:** 8 / 8 complete
- **Commits:** 53
- **Files changed:** 60 (+11,554 / -58)
- **Contributors:** Lorenzo Cazzoli

---

*Generated by GSD milestone-summary workflow*
*Source artifacts: ROADMAP.md, PROJECT.md, STATE.md, 8× SUMMARY.md, 3× CONTEXT.md, 3× VERIFICATION.md*
