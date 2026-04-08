# Architecture: Docker-Based Claude Code Sandbox

**Project:** Claude Sandbox CLI  
**Domain:** Docker-based developer sandbox for Claude Code  
**Researched:** 2026-04-08  
**Confidence:** HIGH (pattern-validated across Docker Sandboxes, Vercel, ddev, and Gemini CLI)

---

## Recommended Architecture

### System Overview

```
Host Machine                    Docker Daemon                    Container
┌─────────────────────┐         ┌──────────────┐               ┌──────────────┐
│ CLI Tool (Node.js)  │────────→│ Dockerode    │──────────────→│ Container    │
│                     │ Remote  │ API Client   │ Docker        │ (node:22)    │
│ - commander.js      │ API     │              │ Socket        │              │
│ - parseArgs         │ Calls   │ Creates,     │               │ - Claude CLI │
│ - Docker mgmt       │         │ starts,      │               │ - Repos      │
│ - Config loading    │         │ stops,       │               │ - ~/.claude/ │
│ - Volume resolution │         │ execs        │               │ - Env vars   │
└─────────────────────┘         │              │               │              │
                                │              │               └──────────────┘
                                └──────────────┘
                                     ║
                        /var/run/docker.sock (macOS via Docker Desktop)
                                     ║
                            Docker Engine / Daemon
```

### Data Flow: `start` Command

```
User Input: "claude-sandbox start --repo payments --repo auth"
    │
    ▼
┌──────────────────────────────────────┐
│ 1. CLI Entry Point                   │
│    - Parse args (commander.js)       │
│    - Route to 'start' handler        │
│    - Validate basic syntax           │
└──────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────┐
│ 2. Config Layer                      │
│    - Load ~/.claude-sandbox/config   │
│    - Load ./.claude-sandbox.json     │
│    - Merge: CLI args > project > global
│    - Validate repo names exist       │
└──────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────┐
│ 3. State Manager                     │
│    - Check if container exists       │
│    - Query Docker daemon             │
│    - Decide: create vs. start        │
└──────────────────────────────────────┘
    │
    ├─ Container doesn't exist?
    │  └─▼
    │   ┌──────────────────────────────┐
    │   │ 4. Container Image Manager   │
    │   │    - Check local image       │
    │   │    - Build if needed         │
    │   │    - Verify image exists     │
    │   └──────────────────────────────┘
    │
    ├─▼
    │ ┌──────────────────────────────┐
    │ │ 5. Volume Mount Resolver     │
    │ │    - payments → /workspace/  │
    │ │    - auth → /workspace/      │
    │ │    - ~/.claude → /root/      │
    │ │    - Validate paths exist    │
    │ └──────────────────────────────┘
    │
    ├─▼
    │ ┌──────────────────────────────┐
    │ │ 6. Env Var Injector          │
    │ │    - ANTHROPIC_API_KEY       │
    │ │    - NODE_ENV, LOG_LEVEL     │
    │ │    - Validate required vars  │
    │ └──────────────────────────────┘
    │
    ├─▼
    │ ┌──────────────────────────────┐
    │ │ 7. Docker Client             │
    │ │    - docker create with:     │
    │ │      - Image: claude-sandbox │
    │ │      - Mounts: repos + conf  │
    │ │      - Env: injected vars    │
    │ │      - Name: claude-sandbox  │
    │ │    - Store container ID      │
    │ └──────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────┐
│ 8. Docker Client                     │
│    - docker start container          │
│    - Wait for container ready        │
└──────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────┐
│ 9. State Manager                     │
│    - Update state.json               │
│    - Log container ID, repos, ts     │
└──────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────┐
│ 10. CLI Output                       │
│     "Sandbox started. Attach with:"  │
│     "claude-sandbox shell"           │
└──────────────────────────────────────┘
```

---

## Component Boundaries

### 1. CLI Entry Point & Router

**Responsibility:**
- Parse command-line arguments using commander.js
- Route to appropriate handler (start, stop, exec, list, clean)
- Provide help, usage, version info
- Catch errors and surface to user

**Communicates With:**
- Config Layer (validate repo selections)
- State Manager (check container existence)
- All subcommand handlers
- User output (stdout/stderr)

**Error Handling:**
- Missing required args → show usage
- Docker not accessible → helpful error about Docker Desktop
- Container not found → suggest `start` command

---

### 2. Config Layer

**Responsibility:**
- Load global config: `~/.claude-sandbox/config.yaml`
- Load project config: `./.claude-sandbox.yaml` (if present)
- Merge configs: CLI args > project config > global config
- Validate all repo names exist at expected paths
- Provide repo → path mappings to other components

**Communicates With:**
- Filesystem (read config files, verify paths)
- Volume Mount Resolver (provide definitions)
- CLI Entry Point (validation feedback)

**Config File Schema (`~/.claude-sandbox/config.yaml`):**

```yaml
# Container identity
container_name: claude-sandbox
image: claude-sandbox:latest

# Repo definitions
repos:
  payments:
    path: ~/workspace/payments
    description: "Payments service and APIs"
  auth:
    path: ~/workspace/auth
    description: "Authentication and authorization"
  shared:
    path: ~/workspace/shared-libs
    description: "Shared utility libraries"

# Global defaults
defaults:
  repos: [shared]              # Always mount these
  workdir: /workspace          # Container working dir

# Non-secret environment variables
env:
  NODE_ENV: development
  LOG_LEVEL: debug

# Optional: mount configuration
mount_mode: rw                 # read-write for all repos
```

**Project Config (`./.claude-sandbox.yaml`):**

```yaml
# Local overrides for this project
repos:
  local-service:
    path: ./services/local-only
    description: "Service only for this project"

# Add to defaults without replacing
env:
  DEBUG: "payments:*"
```

---

### 3. State Manager

**Responsibility:**
- Track container existence and status (created, running, stopped)
- Store container metadata: ID, mounted repos, session info
- Persist state to `~/.claude-sandbox/state.json`
- Query Docker daemon to verify state (reconciliation)
- Update state on lifecycle events

**Communicates With:**
- Filesystem (read/write state.json)
- Docker Client (query container state)
- CLI Entry Point (report status)
- All other components (after operations: update state)

**State File (`~/.claude-sandbox/state.json`):**

```json
{
  "version": "1.0",
  "containers": {
    "claude-sandbox": {
      "id": "abc123def456789abcdef...",
      "status": "running",
      "image_digest": "sha256:abc123...",
      "created_at": "2026-04-08T14:23:00.000Z",
      "last_started": "2026-04-08T14:23:05.000Z",
      "mounted_repos": ["payments", "auth", "shared"],
      "mount_paths": {
        "payments": "/Users/user/workspace/payments",
        "auth": "/Users/user/workspace/auth",
        "shared": "/Users/user/workspace/shared-libs"
      },
      "env_vars_injected": ["ANTHROPIC_API_KEY", "NODE_ENV"],
      "session_id": "sess_20260408_142305"
    }
  }
}
```

**State Reconciliation Logic:**
1. Before any operation, query Docker daemon with `docker inspect`
2. Compare against local state.json
3. If mismatch: update local state from Docker (Docker is source of truth)
4. Handle edge cases: container deleted externally, image missing, socket not accessible

---

### 4. Docker Client Wrapper

**Responsibility:**
- Abstract Docker daemon communication via Dockerode library
- Create, start, stop, remove containers
- Execute commands inside containers (`docker exec`)
- Query container state and logs
- Handle Docker API errors gracefully

**Communicates With:**
- Docker daemon (via `/var/run/docker.sock`)
- State Manager (notify of state changes)
- Container Image Manager (for build/pull ops)
- Volume Mount Resolver (receive mount specs)
- Environment Variable Injector (receive env var list)

**Key Operations:**

```typescript
class DockerClient {
  async createContainer(config: {
    image: string;
    name: string;
    mounts: VolumeBinding[];
    env: string[];
    workdir: string;
  }): Promise<string>  // returns container ID

  async startContainer(containerId: string): Promise<void>
  async stopContainer(containerId: string): Promise<void>
  async removeContainer(containerId: string): Promise<void>

  async execCommand(
    containerId: string,
    cmd: string[],
    options?: { attach?: boolean; tty?: boolean }
  ): Promise<ExecOutput>

  async getContainerState(
    containerId: string
  ): Promise<ContainerState>

  async attachTerminal(containerId: string): Promise<void>
}
```

---

### 5. Container Image Manager

**Responsibility:**
- Check if image exists locally
- Build image from Dockerfile if needed
- Tag image appropriately (latest, dated versions)
- Track image digest to detect when rebuild is needed
- Optional: pull from registry if configured

**Communicates With:**
- Filesystem (read Dockerfile, store metadata)
- Docker Client (build/pull operations)
- State Manager (log image digest)

**Design: Build Locally vs. Pull**

For MVP, **build locally**:
- No dependency on external registry
- Faster (cached locally)
- User sees build output (transparency)
- Easier iteration

**Dockerfile Strategy:**

```dockerfile
FROM node:22-bookworm

# System dependencies for diverse monorepos
RUN apt-get update && apt-get install -y \
    git curl wget openssh-client \
    python3 python3-pip build-essential \
    jq vim nano \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-sdk/claude-code

# Create mount points
RUN mkdir -p /workspace /root/.claude

# Set working directory
WORKDIR /workspace

# Default shell
CMD ["/bin/bash"]
```

---

### 6. Volume Mount Resolver

**Responsibility:**
- Translate repo names to absolute host paths
- Validate paths exist on host before mounting
- Generate Docker volume binding specifications
- Handle special case: `~/.claude/` mount
- Determine mount order and consistency mode

**Communicates With:**
- Config Layer (get repo → path mappings)
- Filesystem (verify paths exist)
- Docker Client (pass volume specs)

**Mount Algorithm:**

```typescript
function resolveMounts(repos: string[]): VolumeBinding[] {
  const bindings: VolumeBinding[] = [];

  // 1. Validate and mount requested repos
  for (const repo of repos) {
    const hostPath = config.repos[repo]?.path;
    if (!hostPath) {
      throw new Error(`Unknown repo: ${repo}`);
    }

    const expanded = expandPath(hostPath);  // ~/ → /Users/...
    if (!fileExists(expanded)) {
      throw new Error(`Repo path not found: ${expanded}`);
    }

    bindings.push({
      host: expanded,
      container: `/workspace/${repo}`,
      mode: 'rw',  // read-write to allow changes on host
      consistency: 'cached',  // faster on macOS
    });
  }

  // 2. Mount ~/.claude/ (read-only to protect config)
  const claudePath = expandPath('~/.claude');
  if (fileExists(claudePath)) {
    bindings.push({
      host: claudePath,
      container: '/root/.claude',
      mode: 'ro',  // read-only for safety
      consistency: 'consistent',
    });
  }

  return bindings;
}

// Convert to Docker format
const dockerBinds = bindings.map((b) =>
  `${b.host}:${b.container}:${b.mode}`
);
```

**Mount Result Inside Container:**

```
/workspace/
  ├── payments/          # from host ~/workspace/payments
  ├── auth/              # from host ~/workspace/auth
  └── shared/            # from host ~/workspace/shared-libs

/root/.claude/          # from host ~/.claude/
  ├── commands/
  ├── hooks/
  ├── memory/
  └── config
```

---

### 7. Environment Variable Injector

**Responsibility:**
- Gather env vars from:
  - Host environment (`ANTHROPIC_API_KEY`, `USER`, etc.)
  - Config file defaults (NODE_ENV, LOG_LEVEL, etc.)
  - CLI flags (`--env KEY=VALUE`)
- Validate required vars are set (e.g., ANTHROPIC_API_KEY)
- Use whitelist approach (don't expose all host env)
- Build env var list for Docker container

**Communicates With:**
- Config Layer (read defaults from config)
- CLI Entry Point (read CLI-provided vars)
- Host environment (read ANTHROPIC_API_KEY, USER)
- Docker Client (pass env list to create)

**Whitelist Strategy:**

```typescript
const ENV_WHITELIST = [
  'ANTHROPIC_API_KEY',  // REQUIRED
  'USER',
  'HOME',
  'PATH',               // container has its own PATH, override if needed
  'NODE_ENV',
  'LOG_LEVEL',
  'DEBUG',
];

function injectEnvVars(cliOverrides?: Record<string, string>): string[] {
  const env: Record<string, string> = {};

  // 1. Load from config file
  for (const [key, value] of Object.entries(config.env || {})) {
    env[key] = value;
  }

  // 2. Override with host environment (if whitelisted)
  for (const key of ENV_WHITELIST) {
    if (process.env[key]) {
      env[key] = process.env[key];
    }
  }

  // 3. Override with CLI flags
  if (cliOverrides) {
    Object.assign(env, cliOverrides);
  }

  // 4. Validate required variables
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY not set in environment. ' +
      'Set it in your shell: export ANTHROPIC_API_KEY=...'
    );
  }

  // 5. Convert to Docker format
  return Object.entries(env).map(([k, v]) => `${k}=${v}`);
}
```

---

### 8. Container Lifecycle Manager

**Responsibility:**
- Orchestrate multi-step operations (start, stop, restart, remove)
- Ensure idempotent operations (start when already running = no-op)
- Coordinate between components in correct dependency order
- Handle failures and rollbacks

**Communicates With:**
- All other components (coordinates them)
- State Manager (verify/update state)
- CLI Entry Point (report results)

**State Machine:**

```
[Not Created]
    │
    ├─ start() ───→ [Created] ──→ [Running]
    │              └─ start()  ↗
    │
[Running] ←─ start(if_stopped) ─ [Stopped]
    │
    ├─ stop() ────→ [Stopped]
    │
    └─ remove() ──→ [Not Created]
```

**Idempotent Operations:**

```typescript
async function start(repos: string[]): Promise<void> {
  // Query current state
  const state = await stateManager.getState();

  if (state.containers['claude-sandbox']?.status === 'running') {
    console.log('✓ Sandbox already running. Run: claude-sandbox shell');
    return;  // Idempotent: no error
  }

  if (state.containers['claude-sandbox']?.status === 'stopped') {
    // Container exists but stopped, just start it
    await dockerClient.startContainer(state.containers['claude-sandbox'].id);
    console.log('✓ Sandbox started.');
    return;
  }

  // Container doesn't exist, create it
  // ... rest of creation logic
}
```

---

## Data Flow Details

### CLI Command: `start --repo payments --repo auth`

```
1. CLI Parser
   └─ Parses: { repos: ['payments', 'auth'], ... }

2. Config Layer
   ├─ Load ~/.claude-sandbox/config.yaml
   ├─ Load ./.claude-sandbox.yaml (if exists)
   ├─ Validate repos 'payments' and 'auth' exist
   └─ Fails if either not found

3. State Manager
   ├─ Query: `docker inspect claude-sandbox`
   ├─ Check local state.json
   ├─ Reconcile if mismatch
   └─ Decide: create vs. start

4. [IF CREATE NEEDED]
   Container Image Manager
   ├─ Check: image exists?
   ├─ If not: build from Dockerfile
   └─ Verify image ready

5. Volume Mount Resolver
   ├─ Resolve: payments → ~/.../workspace/payments
   ├─ Resolve: auth → ~/.../workspace/auth
   ├─ Resolve: ~/.claude → ~/.claude
   └─ Generate Docker --volume specs

6. Environment Variable Injector
   ├─ Read: ANTHROPIC_API_KEY from host
   ├─ Read: NODE_ENV from config
   └─ Generate Docker --env list

7. Docker Client
   ├─ docker create with:
   │  ├─ Image: claude-sandbox:latest
   │  ├─ Name: claude-sandbox
   │  ├─ Mounts: [payments, auth, ~/.claude]
   │  └─ Env: [ANTHROPIC_API_KEY=..., NODE_ENV=...]
   └─ Store container ID

8. Docker Client
   └─ docker start <container_id>

9. State Manager
   ├─ Update state.json with:
   │  ├─ Container ID
   │  ├─ Status: running
   │  ├─ Mounted repos
   │  └─ Timestamp
   └─ Log image digest

10. CLI Output
    └─ "Sandbox started. Run: claude-sandbox shell"
```

### CLI Command: `exec "npm test"`

```
1. CLI Parser
   └─ Parses: { cmd: "npm test" }

2. State Manager
   ├─ Check: container exists?
   ├─ Check: container running?
   └─ Fails if not running

3. Docker Client
   ├─ docker exec <container_id> npm test
   ├─ Stream stdout/stderr to terminal
   └─ Return exit code

4. CLI Output
   └─ Command output printed to console
```

---

## Component Dependencies & Build Order

### Dependency Graph

```
┌─ Config Layer ──┐
│    (no deps)    │
└─────────────────┘
        │
        ├─────→ Volume Mount Resolver
        │
        ├─────→ Environment Variable Injector
        │
        └─────→ CLI Entry Point
                  │
                  ├─────→ State Manager
                  │         ├─ Filesystem utils
                  │         └─ Docker Client
                  │            ├─ Container Image Manager
                  │            └─ Volume Mount Resolver
                  │
                  ├─────→ Container Lifecycle Manager
                  │         └─ All components above
                  │
                  └─────→ Docker Client Wrapper
```

### Recommended Build Order

**Phase 1: Foundation (Weeks 1-2)**
1. Filesystem utilities (path resolution, validation)
2. Config Layer (load, parse, merge configurations)
3. State Manager skeleton (JSON file I/O)

**Phase 2: Docker Integration (Weeks 2-3)**
4. Docker Client Wrapper (create, start, stop using Dockerode)
5. Container Image Manager (build Dockerfile locally)
6. Volume Mount Resolver (generate mount specs)
7. Environment Variable Injector (gather and validate env)

**Phase 3: Orchestration (Weeks 3-4)**
8. State Manager (full reconciliation logic)
9. Container Lifecycle Manager (multi-step operations)
10. Error Handler (comprehensive error messages)

**Phase 4: CLI & UX (Weeks 4-5)**
11. CLI Entry Point & Router (command parsing and dispatch)
12. Stream Handler (attach terminal, stream output)
13. Help system (documentation, usage info)

**Phase 5: Polish (Weeks 5-6)**
14. Logging and debugging
15. Integration tests
16. Edge case handling

---

## Patterns to Follow

### Pattern 1: Idempotent Operations
**What:** Running start when already running = no-op with message, not error  
**When:** `start`, `stop`, `restart` commands  
**Why:** Better UX, easier scripting

```typescript
async function start(repos: string[]): Promise<void> {
  const existing = await stateManager.getState();
  if (existing.status === 'running') {
    console.log('✓ Already running.');
    return;  // not an error
  }
  // ... proceed with start
}
```

### Pattern 2: State Reconciliation
**What:** Query Docker daemon before trusting local state file  
**When:** Before any operation that checks status  
**Why:** Handle external changes (someone deleted container, etc.)

```typescript
async function verifyState(): Promise<ContainerState> {
  const local = await stateManager.read();
  const docker = await dockerClient.inspect(containerId);

  if (local.status !== docker.status) {
    await stateManager.update({ ...local, status: docker.status });
    return docker;  // Docker is source of truth
  }

  return local;
}
```

### Pattern 3: Mount Precedence
**What:** Later mounts override earlier ones if paths overlap  
**When:** Configuring volumes  
**Order:** Explicit repo mounts first, `~/.claude` last (highest precedence)

### Pattern 4: Error Context
**What:** Every error includes "what went wrong" + "how to fix it"  
**When:** All error paths  
**Example:**
```
Error: Docker socket not accessible
Fix: Ensure Docker Desktop is running (macOS) or systemctl start docker (Linux)
```

### Pattern 5: Async Waterfall
**What:** Each step depends on previous step's output  
**When:** Multi-step operations  
**Code:** Use async/await with clear error handling at each stage

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Ephemeral Containers
**What:** Creating new container each time (`docker run` instead of `create` + `start`)  
**Why Bad:**
- State lost between sessions (Claude can't remember context)
- Rebuild on every start is slow
- No session continuity

**Instead:** Use `docker create` once, `docker start`/`stop` for lifecycle

### Anti-Pattern 2: Copying Files Into Container
**What:** COPY commands or manual file sync  
**Why Bad:**
- Files become stale (no real-time sync)
- Image bloats
- Changes in container don't reflect on host

**Instead:** Bind mounts only (read/write directly from host filesystem)

### Anti-Pattern 3: Environment Variable Sprawl
**What:** Passing entire host environment to container  
**Why Bad:**
- Exposes secrets accidentally (DB passwords, tokens, etc.)
- Non-deterministic (depends on host setup)
- Hard to debug what's available in container

**Instead:** Whitelist approach, explicitly list each variable needed

### Anti-Pattern 4: Ignoring State Reconciliation
**What:** Trust local state.json without querying Docker  
**Why Bad:**
- Stale data if container deleted externally
- Commands fail with confusing errors
- No recovery path

**Instead:** Always reconcile with Docker daemon before operations

### Anti-Pattern 5: Hardcoded Paths
**What:** Hardcoding `/home/user/monorepo` in code  
**Why Bad:**
- Non-portable (breaks on different systems)
- No flexibility for monorepo relocation
- Config layer becomes useless

**Instead:** All paths come from config.yaml, validate in startup

### Anti-Pattern 6: Silent Failures
**What:** Swallowing errors without logging  
**Why Bad:**
- User confused why it doesn't work
- No audit trail

**Instead:** Log all operations, show errors clearly

---

## Scalability Considerations

| Concern | Single Repo | 5-10 Repos | 50+ Repos |
|---------|-----------|----------|-----------|
| **Mount overhead** | <100ms | ~500ms | ~2-5s |
| **Container startup** | ~2-3s | ~3-5s | ~5-10s |
| **State file size** | <1KB | <5KB | <50KB |
| **Config complexity** | Simple YAML | Organized sections | YAML includes / inheritance |
| **Recommended approach** | Direct mounts | User selects subset | Mount facade / symlinks |

**For MVP:** Assume 5-10 repos, accept 3-5s startup time.

---

## Suggested Implementation Notes

### Image Rebuild Detection

Don't rebuild on every start. Track Dockerfile hash:

```typescript
const dockerfile = await fs.readFile('Dockerfile', 'utf-8');
const hash = crypto.createHash('sha256').update(dockerfile).digest('hex');

if (state.dockerfile_hash !== hash) {
  console.log('Dockerfile changed, rebuilding image...');
  await imageManager.build();
  state.dockerfile_hash = hash;
}
```

### Container Naming

Use simple name for MVP: `claude-sandbox`

If scaling to multi-user:
- `claude-sandbox-{username}`
- Or with project: `claude-sandbox-{project}-{username}`

### Port Mapping

Out of scope for MVP (terminal-only tool). If future web UI needed:
- Map ports in HostConfig: `PortBindings: { '3000/tcp': [{ HostPort: '3000' }] }`

### Health Checks

Optional for MVP, recommended for production:

```typescript
{
  HealthCheck: {
    Test: ['CMD', 'test', '-S', '/var/run/docker.sock'],
    Interval: 30_000_000_000,  // nanoseconds
    Timeout: 10_000_000_000,
    Retries: 3,
  },
}
```

---

## Sources

- [Docker Container Lifecycle](https://docs.docker.com/engine/reference/commandline/container/)
- [Dockerode Node.js Library](https://github.com/apocas/dockerode)
- [Docker Volume Mounts](https://docs.docker.com/storage/bind-mounts/)
- [Docker Environment Variables](https://docs.docker.com/engine/reference/commandline/run/#env)
- [Docker Labels & Metadata](https://docs.docker.com/config/labels-custom-metadata/)
- [ddev: Development Environments](https://ddev.readthedocs.io/en/latest/users/architecture/)
- [Vercel Sandbox Architecture](https://vercel.com/docs/vercel-sandbox)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
