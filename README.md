# claude-sandbox

Run [Claude Code](https://github.com/anthropics/claude-code) inside an isolated Docker container with selective, whitelist-controlled access to your repositories.

The sandbox exposes only the subdirectories you explicitly allow, masking everything else with read-only tmpfs mounts. Your Claude Code credentials are forwarded into the container automatically — no manual configuration needed.

## How it works

When you run `claude-sandbox start`:

1. A Docker image is built on first run (takes ~5 minutes; subsequent starts are instant).
2. Your repository is bind-mounted into the container at `/workspace/<repo-name>`.
3. Subdirectories **not listed** in `.claude-sandbox.yml` are overlaid with empty, read-only tmpfs mounts — Claude Code cannot see or write to them.
4. Your `~/.claude/` directory and `~/.claude.json` are mounted read-only so Claude Code can authenticate immediately.
5. If `ANTHROPIC_API_KEY` is set in your environment, it is injected via a secrets file (never via `docker inspect`).

The container runs under your host UID/GID, so files written by Claude Code have the correct ownership.

## Prerequisites

- **Docker** — running daemon accessible at the default socket
- **Node.js 18+** and **npm**

## Installation

```bash
npm install
npm run build
npm link        # makes `claude-sandbox` available globally
```

Or run without installing:

```bash
npm run dev -- <command> [options]
```

## Quick start

**1. Add `.claude-sandbox.yml` to your repository root:**

```yaml
include:
  - src
  - proto
```

Only the listed subdirectories will be visible inside the container. All other top-level directories are masked.

**2. Start the sandbox:**

```bash
claude-sandbox start --mount /path/to/your/repo
```

The Docker image is built automatically on first run.

**3. Open a shell or launch Claude Code:**

```bash
claude-sandbox shell     # interactive bash session at /workspace
```

Inside the shell:

```bash
claude                   # launch Claude Code
```

## Commands

### `start`

```
claude-sandbox start -m <path> [-m <path> ...] [--recreate] [--claude-md <path>]
```

Start the sandbox container. At least one `--mount` path is required.

| Flag | Description |
|------|-------------|
| `-m, --mount <path>` | Host directory to mount (repeatable) |
| `--recreate` | Destroy and recreate the container (resets container state) |
| `--claude-md <path>` | Mount a CLAUDE.md file at `/workspace/CLAUDE.md` (read-only) |

If the container already exists with the same mounts it is simply restarted. If you request different mounts, `--recreate` is required.

### `stop`

```
claude-sandbox stop
```

Stop the running container. State is preserved — `start` will resume it.

### `restart`

```
claude-sandbox restart
```

Stop and immediately start the container.

### `status`

```
claude-sandbox status
```

Show container state, uptime, mounts, and CLAUDE.md path.

Example output:

```
Status:     running
Container:  a3f1c9d02b4e
Uptime:     12m
Created:    4/16/2026, 09:00:00 AM
Mounts:
  /Users/you/projects/my-repo
CLAUDE.md:  /Users/you/projects/my-repo/CLAUDE.md → /workspace/CLAUDE.md
```

### `shell`

```
claude-sandbox shell
```

Open an interactive bash session inside the running container. The working directory is `/workspace`. Terminal resize events are forwarded automatically.

## `.claude-sandbox.yml`

Each repository you mount must contain a `.claude-sandbox.yml` at its root. This file declares which subdirectories Claude Code is allowed to see.

```yaml
include:
  - src
  - proto
  - scripts
```

- Paths are relative to the repository root.
- Nested paths are supported (e.g. `projects/serviceA`). Sibling directories at the same level are masked; ancestor directories are kept so the tree structure remains intact.
- An empty or missing `include:` list is an error — the sandbox will not start.

### Monorepo example

```yaml
include:
  - projects/serviceA
  - proto
  - tools/linter
```

With this config, `projects/serviceB` is masked, `proto/` is fully accessible, and `projects/` itself remains visible as a directory (so Bazel/Gradle workspace files at the root are readable).

## Authentication

### Pro / Max (OAuth)

No additional setup required. Your `~/.claude/` directory and `~/.claude.json` are mounted read-only into the container at the same paths. Claude Code will pick up your existing session automatically.

### API key

Set `ANTHROPIC_API_KEY` in your shell before running `start`:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
claude-sandbox start --mount /path/to/repo
```

The key is written to `~/.claude-sandbox/api-key` (mode `0600`) and bind-mounted into the container at `/run/secrets/anthropic-api-key`. It is injected via the entrypoint script so it never appears in `docker inspect`.

## Security model

- The Docker socket is explicitly blocked — the container cannot access the host Docker daemon.
- System directories (`/`, `/etc`, `/usr`, etc.) cannot be mounted.
- Masked directories use `tmpfs` with mode `0555` — they appear as empty, read-only directories rather than being absent, preserving the directory tree shape.
- The container runs with `no-new-privileges`.
- The sandbox image is built with your host UID/GID so container processes never run as root relative to your host filesystem.

## Development

```bash
npm test          # run tests once
npm run test:watch  # watch mode
npm run build     # compile to dist/claude-sandbox.cjs
```

The source is TypeScript under `src/`. Tests use [Vitest](https://vitest.dev/).
