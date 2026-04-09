# Phase 1: Sandbox Isolation - Research

**Researched:** 2026-04-09
**Domain:** Docker-based CLI tool (Node.js/TypeScript) — container lifecycle management, bind mounts, secrets injection, TTY handling
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** `--mount <path>` accepts absolute paths and paths relative to cwd. Both are normalized to absolute before any validation.

**D-02:** If a path doesn't exist after resolution, fail hard with an error AND scan adjacent directories to suggest similar paths (e.g. "Did you mean /workspace/payments-v2?").

**D-03:** Each mounted project can include a `.claude-sandbox-ignore` file at its root (gitignore-style syntax). Listed subpaths are blocked from Claude's view inside the container.

**D-04:** Blocked subpaths are enforced by shadowing them with empty read-only `tmpfs` mounts on top of the bind mount. Claude sees an empty directory — not an error, not missing content.

**D-05:** Walk up parent directories when resolving ignore files. A `.claude-sandbox-ignore` at a monorepo root applies to all subprojects mounted from beneath it. Stop walking at filesystem root or at a configurable monorepo root.

**D-06:** System directory blocking (/, /etc, /System, /private, /var, etc.) is also applied regardless of ignore files.

**D-07:** Auto-build on first `start` if no local image exists. No explicit `build` step required.

**D-08:** Image source strategy: try pulling from a registry first (if configured); fall back to building locally from the bundled Dockerfile. For Phase 1, local build is the effective default.

**D-09:** Progress display during build: friendly step-by-step summary. Not raw Docker layer output. On build failure: dump full Docker build log.

**D-10:** If `start` is called with `--mount` paths that differ from existing container's mounts: hard error. Show old vs new mounts. Require `--recreate` flag.

**D-11:** If `start` is called with same mounts as existing stopped container: silently restart. Output: "Sandbox started."

**D-12:** `claude-sandbox shell` opens a terminal at `/workspace`. All repos visible immediately.

**D-13:** Set `CLAUDE_SANDBOX=1` env var inside container. Customize PS1 to show sandbox marker.

### Claude's Discretion

- Exact format of path suggestions in error messages
- PS1 marker style (exact wording/color)
- Whether to show mount list on `status` as plain text or table
- Dockerfile layer ordering optimizations

### Deferred Ideas (OUT OF SCOPE)

- Registry push/pull for the sandbox image (beyond "try pull, fallback to build")
- `--read-write-claude` flag for writable `~/.claude/` mount
- Image staleness warnings (>30 days)
- Crash detection and auto-restart
- Per-sandbox named instances — single `claude-sandbox` container for Phase 1
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLI-01 | `claude-sandbox start --mount <path>` launches persistent container | Commander.js subcommand + `docker create` / `docker start` via Dockerode |
| CLI-02 | `claude-sandbox stop` stops the container | Dockerode `container.stop()` |
| CLI-03 | `claude-sandbox status` shows container ID, uptime, mounted paths | State file + Dockerode `container.inspect()` reconciliation |
| CLI-04 | `claude-sandbox restart` restarts the container | `container.stop()` + `container.start()` sequence |
| CLI-05 | `claude-sandbox shell` drops into interactive terminal | Dockerode exec with `Tty:true`, PTY allocation, SIGWINCH propagation |
| CONT-01 | Container is persistent across stop/start cycles (not --rm) | `docker create` (not `docker run --rm`); state tracked in `~/.claude-sandbox/state.json` |
| CONT-02 | Container UID/GID matches host user | Dockerfile `ARG UID/GID` + `useradd`; pass `os.userInfo()` at build time |
| CONT-03 | Docker socket mounting is blocked | Validation layer rejects mounts containing `docker.sock` |
| CONT-04 | Claude Code CLI is pre-installed in container image | `npm install -g @anthropic-ai/claude-code@latest` in Dockerfile |
| MNT-01 | `--mount <path>` bind-mounts to `/workspace/<folder-name>` | Volume Mount Resolver; Dockerode HostConfig.Binds |
| MNT-02 | `~/.claude/` mounted read-only | Bind with `ro` flag; path expanded via `os.homedir()` |
| AUTH-01 | `ANTHROPIC_API_KEY` injected via secrets file, not plain env var | Write temp file to `~/.claude-sandbox/`, bind-mount into `/run/secrets/`, read in container entrypoint |
</phase_requirements>

---

## Summary

Phase 1 builds a Node.js/TypeScript CLI tool (`claude-sandbox`) that manages a persistent Docker container. The entire implementation rests on three pillars: **Dockerode** for Docker API communication, **Commander.js** for the CLI surface, and a carefully ordered set of **bind mounts** for repo and configuration access.

The project's research artifacts (ARCHITECTURE.md, STACK.md, PITFALLS.md) are thorough and accurate. This research phase confirms those recommendations, verifies current package versions, and surfaces two new concerns the prior research did not fully address: (1) a macOS Docker Desktop nested bind mount regression in Engine 29.3.1+ on macOS Tahoe that could affect the `.claude-sandbox-ignore` tmpfs-shadow mechanism (D-04), and (2) the correct Claude Code CLI package name (`@anthropic-ai/claude-code`, not `@anthropic-sdk/claude-code`).

**Primary recommendation:** Follow the ARCHITECTURE.md component order. Build the Config Layer and State Manager first (pure filesystem), then the Docker Client Wrapper, then orchestrate them in the Lifecycle Manager. Address the tmpfs-shadow mechanism (D-04) last and validate it empirically on the target machine.

---

## Project Constraints (from CLAUDE.md)

The CLAUDE.md in this workspace contains only Git/PR workflow rules. These apply to any commits and PRs created during implementation:

| Directive | Rule |
|-----------|------|
| Branch naming | `<type>/<description>-<jira-issue>` |
| Commit format | `<type>[(scope)]: <description> <jira-issue>` |
| PR title | Same format as commit |
| PR template | Use `.github/PULL_REQUEST_TEMPLATE/` matching PR type |
| Merge to develop | Squash and merge (single task) |
| Labels | `bot/merge` / `bot/skip`; `migration` label required for migration PRs |

No coding conventions, testing mandates, or security requirements are specified in CLAUDE.md beyond git workflow.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | 14.0.3 | CLI argument parsing, subcommands | Zero deps, 500M+ weekly downloads, used by Vercel/Heroku |
| dockerode | 4.0.10 | Docker daemon API client | Native Docker Remote API, promise-based, best error handling |
| ignore | 7.0.5 | Parse `.claude-sandbox-ignore` gitignore-style files | Used by ESLint, Prettier; correct spec implementation |
| typescript | 6.0.2 | Type safety for Docker API calls and config parsing | Standard modern Node.js |
| esbuild | 0.28.0 | Bundle CLI into single distributable | 10-100x faster than webpack |
| tsx | 4.21.0 | Run TypeScript in development without compile step | Dev iteration speed |
| vitest | 4.1.4 | Unit/integration tests | TS-native, ESM-first |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/node | 25.5.2 | Node.js type definitions | Always — TypeScript project |
| @types/dockerode | 4.0.1 | Dockerode type definitions | Always — TypeScript project |

### Container Image
| Component | Value | Why |
|-----------|-------|-----|
| Base image | `node:22-bookworm` | Node 22 LTS, Debian 12 stable, broad tool compatibility |
| Claude Code | `@anthropic-ai/claude-code@latest` | Correct package name (verified via npm); current version 2.1.97 |

**Important:** The prior research references `@anthropic-sdk/claude-code` — this package does not exist on npm. The correct package is `@anthropic-ai/claude-code`.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dockerode | child_process + docker CLI | Worse error handling, harder to test, shell-injection risk |
| commander | yargs | +7 dependencies, 85ms vs 18ms startup |
| ignore | Manual regex | Missing edge cases (negation, escaped patterns, order sensitivity) |
| node:22-bookworm | alpine:3.20 | Alpine lacks system packages users may need (python, make, gcc) |

**Installation:**
```bash
npm install commander dockerode ignore
npm install -D typescript tsx esbuild vitest @types/node @types/dockerode
```

**Version verification:** All versions above were confirmed via `npm view <package> version` on 2026-04-09.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── cli.ts               # Entry point, Commander setup, shebang
├── commands/
│   ├── start.ts         # start subcommand handler
│   ├── stop.ts          # stop subcommand handler
│   ├── restart.ts       # restart subcommand handler
│   ├── status.ts        # status subcommand handler
│   └── shell.ts         # shell subcommand handler
├── config/
│   ├── loader.ts        # Load/merge config.json from ~/.claude-sandbox/
│   └── schema.ts        # Config type definitions
├── docker/
│   ├── client.ts        # Dockerode wrapper (create, start, stop, exec, inspect)
│   ├── image.ts         # Image check, build, progress display
│   └── mounts.ts        # Volume Mount Resolver + .claude-sandbox-ignore logic
├── state/
│   └── manager.ts       # state.json read/write, Docker reconciliation
├── secrets/
│   └── injector.ts      # Temp file write, bind mount spec, cleanup
└── errors/
    └── index.ts         # Typed errors with "what went wrong" + "how to fix"

Dockerfile                # In project root, bundled with CLI
~/.claude-sandbox/
├── config.json           # Global user config
└── state.json            # Container ID, mounts, timestamps
```

### Pattern 1: Persistent Container Lifecycle (create once, start/stop repeatedly)
**What:** Use `docker create` + `docker start`/`docker stop`, never `docker run --rm`
**When to use:** All lifecycle operations
**Example:**
```typescript
// Source: Dockerode API + ARCHITECTURE.md
// Create (first time only)
const container = await docker.createContainer({
  Image: 'claude-sandbox:latest',
  name: 'claude-sandbox',
  WorkingDir: '/workspace',
  Env: ['CLAUDE_SANDBOX=1'],
  HostConfig: {
    Binds: [
      `${repoHostPath}:/workspace/${repoName}:rw,cached`,
      `${homedir()}/.claude:/root/.claude:ro`,
    ],
  },
  Tty: true,
  OpenStdin: true,
});
await container.start();

// Subsequent runs: just start the existing container
const container = docker.getContainer(state.containerId);
await container.start();
```

### Pattern 2: Secrets File Injection (AUTH-01)
**What:** Write API key to temp file, bind-mount read-only, read in entrypoint, clean up temp file
**When to use:** `ANTHROPIC_API_KEY` injection — never pass as plain env var
**Example:**
```typescript
// Source: PITFALLS.md Option B
import { writeFileSync, unlinkSync } from 'fs';
import { homedir } from 'os';

const secretPath = `${homedir()}/.claude-sandbox/tmp-key-${Date.now()}`;
writeFileSync(secretPath, process.env.ANTHROPIC_API_KEY!, { mode: 0o600 });

const binds = [
  ...repoBinds,
  `${secretPath}:/run/secrets/anthropic-api-key:ro`,
];

try {
  const container = await docker.createContainer({ HostConfig: { Binds: binds } });
  // container created — secret file no longer needed
} finally {
  unlinkSync(secretPath); // clean up regardless of success/failure
}
```
Container entrypoint reads the key:
```bash
#!/bin/bash
export ANTHROPIC_API_KEY=$(cat /run/secrets/anthropic-api-key)
exec "$@"
```

### Pattern 3: UID/GID Matching at Image Build Time (CONT-02)
**What:** Pass host UID/GID as Docker `--build-arg`, create matching user in Dockerfile
**When to use:** Image build phase
**Example:**
```typescript
// Source: PITFALLS.md Option B
import { userInfo } from 'os';
const { uid, gid } = userInfo();

await docker.buildImage(
  { context: dockerfilePath, src: ['Dockerfile'] },
  { t: 'claude-sandbox:latest', buildargs: { UID: String(uid), GID: String(gid) } }
);
```
```dockerfile
FROM node:22-bookworm
ARG UID=1000
ARG GID=1000
RUN groupadd -g ${GID} sandbox && \
    useradd -m -u ${UID} -g ${GID} sandbox
USER sandbox
RUN npm install -g @anthropic-ai/claude-code
WORKDIR /workspace
CMD ["/bin/bash"]
```

### Pattern 4: Interactive Shell with TTY/PTY and Resize (CLI-05)
**What:** Allocate a real PTY via `docker exec`, pipe stdin/stdout, propagate SIGWINCH
**When to use:** `claude-sandbox shell` command
**Example:**
```typescript
// Source: PITFALLS.md + Dockerode README
const exec = await container.exec({
  Cmd: ['/bin/bash'],
  Tty: true,
  AttachStdin: true,
  AttachStdout: true,
  AttachStderr: true,
});
const stream = await exec.start({ Tty: true, stream: true });

process.stdin.setRawMode(true);
process.stdin.resume();
stream.pipe(process.stdout);
process.stdin.pipe(stream);

// Propagate terminal resize
const resize = () => exec.resize({ h: process.stdout.rows, w: process.stdout.columns });
process.stdout.on('resize', resize);
resize(); // Set initial size

stream.on('end', () => {
  process.stdin.setRawMode(false);
  process.exit(0);
});
```

### Pattern 5: State Reconciliation (always Docker is source of truth)
**What:** Query Docker daemon before trusting local `state.json`
**When to use:** Before every command that reads container status
**Example:**
```typescript
// Source: ARCHITECTURE.md Pattern 2
async function reconcile(state: LocalState): Promise<ContainerState> {
  try {
    const container = docker.getContainer(state.containerId);
    const info = await container.inspect();
    const dockerStatus = info.State.Running ? 'running' : 'stopped';
    if (state.status !== dockerStatus) {
      await writeState({ ...state, status: dockerStatus });
    }
    return { ...state, status: dockerStatus };
  } catch (e: any) {
    if (e.statusCode === 404) {
      // Container was deleted externally
      await writeState({ ...state, status: 'not_found' });
      return { ...state, status: 'not_found' };
    }
    throw e;
  }
}
```

### Pattern 6: Mount Diff Check for --recreate (D-10)
**What:** Compare normalized absolute mount paths between stored state and new `start` invocation
**When to use:** Every `start` call when a container already exists
**Example:**
```typescript
function mountsMatch(stored: string[], requested: string[]): boolean {
  const normalize = (p: string[]) => [...p].map(x => path.resolve(x)).sort().join('|');
  return normalize(stored) === normalize(requested);
}

if (!mountsMatch(state.mounts, requestedMounts)) {
  if (!flags.recreate) {
    console.error('Mount mismatch. Old:', state.mounts, 'New:', requestedMounts);
    console.error('Run `claude-sandbox start --recreate` to rebuild (container state will be lost).');
    process.exit(1);
  }
  await container.stop();
  await container.remove();
  // proceed to create new container
}
```

### Pattern 7: .claude-sandbox-ignore with tmpfs Shadow (D-03, D-04, D-05)

**WARNING — macOS regression:** Docker Desktop Engine 29.3.1+ on macOS Tahoe has a confirmed regression where **nested bind mounts via Docker Compose** do not work correctly. However, issue reports indicate that `docker run` / `docker create` with direct `-v` flags are NOT affected by this regression. This project uses the direct Docker API (Dockerode), not Docker Compose, so the mechanism should work — but **must be validated empirically** before Phase 1 is considered complete.

The host machine is running macOS 26.3.1 (Tahoe) with Docker Engine 29.2.1. The regression report specifically targets Engine 29.3.1 — the installed version (29.2.1) predates the regression. However, this needs a live test once an image is pullable.

**What:** Parse `.claude-sandbox-ignore` at project root and parent directories up to monorepo root; mount a tmpfs over blocked subdirectories so they appear as empty directories inside the container
**Example:**
```typescript
import ignore from 'ignore';
import path from 'path';

function findIgnoreFiles(mountHostPath: string, monorepoRoot: string): string[] {
  const files: string[] = [];
  let dir = mountHostPath;
  while (dir !== monorepoRoot && dir !== path.dirname(dir)) {
    const candidate = path.join(dir, '.claude-sandbox-ignore');
    if (existsSync(candidate)) files.push(candidate);
    dir = path.dirname(dir);
  }
  return files;
}

function resolveBlockedPaths(
  mountHostPath: string,
  mountContainerPath: string,
  monorepoRoot: string
): { source: 'tmpfs'; target: string }[] {
  const ig = ignore();
  for (const f of findIgnoreFiles(mountHostPath, monorepoRoot)) {
    ig.add(readFileSync(f, 'utf-8'));
  }
  // Walk mount dir, find subpaths that match
  const blocked: string[] = walkDir(mountHostPath)
    .filter(relPath => ig.ignores(relPath))
    .filter(relPath => statSync(path.join(mountHostPath, relPath)).isDirectory());

  return blocked.map(relPath => ({
    source: 'tmpfs' as const,
    target: path.join(mountContainerPath, relPath),
  }));
}
```
Then add to `Mounts` array in Dockerode `createContainer`:
```typescript
HostConfig: {
  Binds: repoBinds,
  Mounts: blockedPaths.map(({ target }) => ({
    Type: 'tmpfs',
    Target: target,
    TmpfsOptions: { Mode: 0o555 },  // read-only empty dir
  })),
}
```

### Anti-Patterns to Avoid
- **Using `docker run --rm`:** Destroys container state on each run. Use `docker create` + `docker start`.
- **Passing `ANTHROPIC_API_KEY` as a Docker `Env` field:** Exposes key in `docker inspect` output. Use secrets file mount.
- **Mounting `/var/run/docker.sock`:** Full host compromise. Reject in validation with clear error.
- **Trusting local `state.json` without reconciliation:** Container may have been deleted externally.
- **Using `@anthropic-sdk/claude-code` in Dockerfile:** Wrong package name. Use `@anthropic-ai/claude-code`.
- **Building image on every `start`:** Cache the image name and check locally first with `docker images`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| gitignore-style pattern matching | Custom regex parser | `ignore` v7.0.5 | Handles negation, path separators, order sensitivity, escape chars — all spec-correct |
| Docker API communication | Child process + `docker` CLI | `dockerode` v4.0.10 | Typed errors, streaming, no shell injection risk |
| CLI argument parsing | Manual `process.argv` | `commander` v14.0.3 | Help generation, subcommands, flag coercion |
| Path tilde expansion | `str.replace('~', homedir())` | `os.homedir()` + `path.resolve()` | Handles edge cases, works on Windows if ever needed |
| TTY/PTY handling | Raw stream piping without resize | `exec.resize()` + SIGWINCH handler | Without resize, Claude's interactive TUI renders incorrectly |

**Key insight:** The gitignore spec has ~15 edge cases (trailing spaces, negation order, `**` semantics) that are extremely easy to get wrong. Using the `ignore` package is non-negotiable.

---

## Common Pitfalls

### Pitfall 1: Wrong Claude Code Package Name
**What goes wrong:** `npm install -g @anthropic-sdk/claude-code` fails silently or installs the wrong package.
**Why it happens:** Prior research artifacts contain the wrong package name.
**How to avoid:** Use `@anthropic-ai/claude-code` in the Dockerfile. Verified correct as of 2026-04-09 (v2.1.97).
**Warning signs:** `claude` command not found inside container after image build.

### Pitfall 2: UID/GID Mismatch (File Permission Hell)
**What goes wrong:** Files created by Claude inside container are owned by root on host; host user cannot edit or git-commit them.
**Why it happens:** Docker containers default to running as root (UID=0).
**How to avoid:** Pass `os.userInfo().uid` and `.gid` as `--build-arg` when building the image. Create matching user in Dockerfile. On macOS, Docker Desktop 4.0+ helps but explicit matching is more reliable.
**Warning signs:** `ls -la` shows `root root` on files created inside container.

### Pitfall 3: API Key Visible in `docker inspect`
**What goes wrong:** `docker inspect claude-sandbox` shows `ANTHROPIC_API_KEY=sk-ant-...` in plaintext.
**Why it happens:** Passing secrets via Docker `Env` field is the default naive approach.
**How to avoid:** Write key to a temp file (`chmod 600`), bind-mount read-only to `/run/secrets/`, read in container entrypoint, delete temp file in `finally` block.
**Warning signs:** `docker inspect claude-sandbox | grep -i api_key` returns a result.

### Pitfall 4: Interactive Shell Broken (No PTY)
**What goes wrong:** `claude-sandbox shell` opens but Claude's interactive TUI renders as garbled text; arrow keys produce escape sequences instead of cursor movement; terminal resize causes layout corruption.
**Why it happens:** Shell opened without `Tty: true` + proper PTY allocation and SIGWINCH forwarding.
**How to avoid:** Use the exec pattern from Pattern 4 above. Always call `exec.resize()` once immediately and on every `process.stdout.on('resize')` event.
**Warning signs:** Running `tty` inside the container returns "not a tty".

### Pitfall 5: Nested tmpfs Shadow on macOS (D-04)
**What goes wrong:** tmpfs mounts intended to shadow `.claude-sandbox-ignore` subdirectories show the original bind-mounted content instead of being empty.
**Why it happens:** Docker Desktop Engine 29.3.1+ has a confirmed regression with nested mounts on macOS Tahoe. The regression is Compose-specific (not direct API), but the exact scope needs validation.
**How to avoid:** Test the tmpfs-shadow mechanism on the actual target machine with a real container before shipping. The host machine runs Docker 29.2.1 (pre-regression engine); the mechanism should work.
**Warning signs:** Files that should be blocked by `.claude-sandbox-ignore` are still visible inside the container.

### Pitfall 6: `~/.claude/` Write Failures
**What goes wrong:** Claude Code tries to write memory, cache, or session files to `/root/.claude/` inside the container, fails with EACCES because it's mounted read-only.
**Why it happens:** `~/.claude/` is intentionally mounted `ro` (MNT-02), but Claude Code writes to it at runtime.
**How to avoid:** The Phase 1 decision is read-only mount. If Claude Code fails to start due to write errors, add an overlay writable Docker volume over `.claude/cache/` as a secondary mount. This is noted as a Phase 2 item (`--read-write-claude`), but may need to be addressed in Phase 1 if Claude Code crashes on startup.
**Warning signs:** `claude` inside container exits immediately with a permission error referencing `~/.claude/`.

### Pitfall 7: Build Progress Display
**What goes wrong:** Docker build output is raw layer-by-layer JSON that confuses users; OR build progress is completely hidden, making the 5-minute first build look like a hang.
**Why it happens:** `docker.buildImage()` returns a stream of JSON progress objects — not human-readable text.
**How to avoid:** Parse the Dockerode build stream. Each JSON chunk has a `stream`, `error`, or `status` field. Aggregate steps and print summaries. Dump full log only on error.
```typescript
docker.buildImage(ctx, opts, (err, response) => {
  response?.on('data', (chunk: Buffer) => {
    const data = JSON.parse(chunk.toString());
    if (data.stream) process.stdout.write(data.stream);
    if (data.error) { fullLog.push(data.error); }
  });
});
```

---

## Code Examples

### Dockerode Container Create (Full Config)
```typescript
// Source: Dockerode API + ARCHITECTURE.md + PITFALLS.md
const container = await docker.createContainer({
  Image: 'claude-sandbox:latest',
  name: 'claude-sandbox',
  WorkingDir: '/workspace',
  Tty: true,
  OpenStdin: true,
  Env: [
    'CLAUDE_SANDBOX=1',
    `PS1=[sandbox] \\u@\\h:\\w\\$ `,
  ],
  HostConfig: {
    Binds: [
      `/host/path/to/repo:/workspace/repo-name:rw,cached`,
      `${homedir()}/.claude:/root/.claude:ro`,
      `${secretFilePath}:/run/secrets/anthropic-api-key:ro`,
    ],
    Mounts: [
      // tmpfs shadows for .claude-sandbox-ignore entries
      { Type: 'tmpfs', Target: '/workspace/repo-name/secrets', TmpfsOptions: { Mode: 0o555 } },
    ],
    SecurityOpt: ['no-new-privileges:true'],
  },
});
```

### State File Schema
```json
{
  "version": "1",
  "containerId": "abc123...",
  "status": "running",
  "mounts": ["/abs/path/to/repo1", "/abs/path/to/repo2"],
  "createdAt": "2026-04-09T10:00:00.000Z",
  "lastStartedAt": "2026-04-09T10:00:00.000Z"
}
```

### Docker Build with Progress Parsing
```typescript
// Source: Dockerode README + PITFALLS.md D-09
async function buildImageWithProgress(dockerfilePath: string, tag: string, buildArgs: Record<string, string>) {
  return new Promise<void>((resolve, reject) => {
    const fullLog: string[] = [];
    docker.buildImage(
      { context: dockerfilePath, src: ['Dockerfile'] },
      { t: tag, buildargs: buildArgs },
      (err, stream) => {
        if (err) return reject(err);
        stream!.on('data', (chunk: Buffer) => {
          try {
            const data = JSON.parse(chunk.toString());
            if (data.stream) {
              const line = data.stream.trim();
              if (line) fullLog.push(line);
              // Show friendly progress, not raw layers
              if (line.startsWith('Step ')) console.log(`  ${line}`);
            }
            if (data.error) {
              fullLog.push(`ERROR: ${data.error}`);
              console.error('\nBuild failed. Full log:');
              console.error(fullLog.join('\n'));
              reject(new Error(data.error));
            }
          } catch { /* non-JSON chunk, ignore */ }
        });
        stream!.on('end', resolve);
        stream!.on('error', reject);
      }
    );
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@anthropic-sdk/claude-code` | `@anthropic-ai/claude-code` | ~2024 | Wrong package name in prior research — must use correct name |
| `docker run --rm` for dev tools | `docker create` + persistent lifecycle | Standard practice | State survives sessions |
| Plain `Env` for secrets | Secrets file bind-mount | Security best practice | `docker inspect` doesn't reveal key |
| `node:22-alpine` | `node:22-bookworm` | Ongoing | Alpine lacks system packages; Bookworm is safer for dev sandboxes |

**Deprecated/outdated:**
- `cached` / `delegated` / `consistent` consistency flags: Docker Desktop with VirtioFS (default since 4.x) ignores these flags — they are no-ops. Document this but don't remove the flag (it's harmless and communicates intent).

---

## Open Questions

1. **Will `~/.claude/` read-only mount break Claude Code at startup?**
   - What we know: Claude Code writes to `~/.claude/` (memory, cache, session data) at runtime.
   - What's unclear: Whether any write is in the startup critical path vs. background/optional.
   - Recommendation: Build the image and test `claude --version` inside the container with a read-only `~/.claude/` mount before planning any workaround. If it fails, add a secondary writable tmpfs or Docker volume over `.claude/cache/`.

2. **Does the tmpfs shadow mechanism (D-04) work reliably on this host?**
   - What we know: Docker Desktop Engine 29.3.1+ has a confirmed Compose-specific regression with nested mounts on macOS Tahoe. The host uses Docker Engine 29.2.1 (pre-regression) via direct Docker API.
   - What's unclear: Whether any nested mount ordering issues affect `docker create` (not Compose) on macOS 26.3.1.
   - Recommendation: Implement D-04 and add an integration test: create a container with a bind mount + tmpfs overlay, verify the shadowed path is empty inside the container.

3. **Should the entrypoint be a shell script or CMD directly?**
   - What we know: The secrets file approach requires an entrypoint script to `export ANTHROPIC_API_KEY=$(cat /run/secrets/...)`.
   - What's unclear: Whether to bake this into a Dockerfile `ENTRYPOINT` or handle it via Dockerode `Cmd` injection.
   - Recommendation: Use a dedicated `entrypoint.sh` script baked into the image. Cleaner separation of concerns; avoids injecting multi-statement bash into Docker's `Cmd` array.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker daemon | All container operations | YES | Engine 29.2.1 | None — hard requirement |
| Node.js | CLI build and development | YES | v18.18.0 | None — must be >=18 for ESM |
| npm | Package installation | YES | 9.8.1 | None |
| `@anthropic-ai/claude-code` (npm) | CONT-04 (image build) | YES (npm registry) | 2.1.97 | None |
| `node:22-bookworm` (Docker Hub) | Image build base | NOT CACHED (requires pull) | 22.x | Build will require internet access |
| Docker registry access | Image base pull | BLOCKED (token expired) | — | Must refresh Docker Hub credentials before first build |

**Missing dependencies with no fallback:**
- Docker Hub registry access is currently blocked (personal access token expired). The first image build will fail unless credentials are refreshed. Planner should include a step to verify registry access or pre-pull the base image.

**Missing dependencies with fallback:**
- Node.js v18.18.0 is installed. Node 22 LTS is preferred for production parity with the container. Development can proceed on v18 since CLI code uses features available in Node 18+ (no Node 22-specific APIs required).

---

## Sources

### Primary (HIGH confidence)
- `.planning/research/ARCHITECTURE.md` — Component architecture, data flow, build order
- `.planning/research/STACK.md` — Technology choices with rationale
- `.planning/research/PITFALLS.md` — Critical pitfalls and mitigations (Phase 1 must-fix list)
- `.planning/phases/01-sandbox-isolation/01-CONTEXT.md` — Locked decisions D-01 through D-13
- `npm view <package> version` (live) — All versions verified 2026-04-09

### Secondary (MEDIUM confidence)
- [Dockerode GitHub README](https://github.com/apocas/dockerode) — exec/resize API patterns, build stream handling
- [Docker tmpfs mounts documentation](https://docs.docker.com/engine/storage/tmpfs/) — tmpfs mount behavior
- [Docker nested bind mount regression issue #279](https://github.com/docker/desktop-feedback/issues/279) — macOS Tahoe specific (open as of 2026-04-07); Compose-specific regression, direct API not confirmed affected
- [node-ignore GitHub](https://github.com/kaelzhang/node-ignore) — gitignore spec implementation
- [PITFALLS.md macOS Docker Desktop performance section](https://github.com/docker/for-mac/issues/7853) — `:cached` flag is a no-op with VirtioFS

### Tertiary (LOW confidence)
- WebSearch results on macOS nested mount workarounds — suggests OrbStack or gRPC Fuse as alternatives if D-04 fails; not yet validated on this specific machine + Docker version combination

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions live-verified via `npm view`; correct Claude Code package name confirmed
- Architecture: HIGH — fully defined in ARCHITECTURE.md; patterns are standard Docker patterns
- Pitfalls: HIGH — verified against official Docker docs and GitHub issue tracker
- D-04 tmpfs shadow: MEDIUM — mechanism is correct in theory; macOS regression scope needs empirical validation

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable stack; Docker regression status may change sooner)
