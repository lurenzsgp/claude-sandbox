# Domain Pitfalls

**Project:** Claude Sandbox CLI  
**Domain:** Docker-based developer sandbox on macOS/Linux  
**Researched:** 2026-04-08  
**Confidence:** HIGH (pitfalls verified across Docker, macOS Docker Desktop, and container security research)

---

## Critical Pitfalls

Mistakes that cause major rewrites, data corruption, or security breaches.

### Pitfall 1: UID/GID Mismatch (File Permission Hell)

**What goes wrong:**
Files created inside the container (by root, UID=0) can't be accessed by the host user (UID=1000). User tries to edit a file in mounted repo → "Permission denied" error.

```
Inside container (as root):
$ touch /mnt/repos/payments/test.txt
→ File created with UID=0, GID=0

On host:
$ ls -la ~/workspace/payments/test.txt
-rw-r--r-- 1 root root 0 Apr  8 12:34 test.txt
$ cat test.txt
cat: permission denied
```

**Why it happens:**
Docker runs as root inside container. When binding `/mnt/repos` to `~/workspace/foo` on host, permission checks use container's root identity, not host's user.

**Consequences:**
- Workflow broken: changes made via Claude CLI inside container are inaccessible on host
- Users get frustrated and disable mounting, defeating the sandbox's purpose
- Requires manual `sudo chown` fixes

**Prevention (DO THIS):**

**Option A: Docker Desktop Handles It (macOS)**
On macOS, Docker Desktop 4.0+ automatically maps UID/GID between host and VM. This usually works transparently.

**Option B: Match Container User to Host User**
Build container image with user matching host UID/GID:

```dockerfile
FROM node:22-bookworm

# Get host user ID at build time (or use default 1000)
ARG UID=1000
ARG GID=1000

# Create user with matching UID/GID
RUN groupadd -g ${GID} appuser && \
    useradd -m -u ${UID} -g ${GID} appuser

# Switch to that user
USER appuser

# Install Claude Code CLI as non-root
RUN npm install -g @anthropic-sdk/claude-code

WORKDIR /mnt/repos
```

Then pass UID at runtime:
```typescript
// In Docker manager
const hostUser = require('os').userInfo();
const imageName = 'claude-sandbox:latest';

// Build image with matching UID/GID
await docker.buildImage({
  dockerfile: 'Dockerfile',
  t: imageName,
  buildargs: {
    UID: hostUser.uid,
    GID: hostUser.gid,
  }
});

// Or: pull pre-built image and run with --user flag
await container.create({
  Image: imageName,
  User: `${hostUser.uid}:${hostUser.gid}`,
});
```

**Option C: Use Named Volumes (Docker Handles Permissions)**
Instead of bind mounts, use Docker volumes:

```typescript
const hostConfig = {
  Mounts: [
    {
      Type: 'volume',
      Source: 'claude-sandbox-data',
      Target: '/mnt/repos',
    },
  ],
};
```

Docker automatically maps permissions. Downside: changes in container take 1-2 sec to reflect on host (not instant).

**Detection (Warning Signs):**
- `Error: EACCES: permission denied` when trying to read container-created files
- `ls -la` shows `root root` ownership on newly created files
- Users can't git commit files created by Claude inside container

**When to Address:**
- **Phase 1 (MVP):** Implement Option B (match UID/GID in Dockerfile) — this is non-negotiable
- Test matrix: Run on macOS + Linux to verify permissions work both ways

---

### Pitfall 2: Accidental Credential Exposure via `~/.claude/` Mount

**What goes wrong:**
`~/.claude/` contains:
- `ANTHROPIC_API_KEY` (if stored as file, which users might do)
- Custom GSD commands with embedded API keys
- Memory files with conversation history
- Auth tokens for external services

Mounted as bind mount → visible to any process in container → if container is compromised, attacker reads `~/.claude/`.

```
Host: ~/.claude/config.json contains:
  { "apiKey": "sk-ant-..." }

Container: /root/.claude/config.json is readable
$ cat /root/.claude/.claude-memory/file.txt
→ Contains conversation history with sensitive data
```

**Why it happens:**
Users don't think about container as untrusted. They assume "it's my machine, so it's safe." But if Claude code is malicious (or a future Claude Code version is compromised), it can read `~/.claude/`.

**Consequences:**
- API key theft (attacker can call Anthropic APIs on victim's dime)
- Credential leakage (if auth tokens stored in memory)
- Privacy breach (conversation history exposed)

**Prevention:**

**Option A: Mount `~/.claude/` as Read-Only**
```typescript
const bindings = [
  // Read-only: Container can read Claude config but can't modify
  `${process.env.HOME}/.claude:/root/.claude:ro`,
  
  // Read-write: Mounted repos
  `${process.env.HOME}/workspace/foo:/mnt/repos/foo:rw`,
];
```

Downside: Claude can't write to memory or cache files. Solution: create a separate writable volume for `.claude/cache`:

```typescript
{
  Mounts: [
    {
      Type: 'bind',
      Source: `${process.env.HOME}/.claude`,
      Target: '/root/.claude',
      ReadOnly: true,
    },
    {
      Type: 'volume',
      Source: 'claude-sandbox-claude-cache',
      Target: '/root/.claude/cache',
    },
  ],
}
```

**Option B: Never Store Secrets as Files**
Use `ANTHROPIC_API_KEY` env var only. Document: "Don't commit API keys to `~/.claude/config.json`. Use env vars."

```typescript
// At container start, inject env var from host
await container.create({
  Env: [
    `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`,
    ...otherEnvVars,
  ],
});
```

**Option C: Sanitize Home Directory Before Mount**
Create a minimal `~/.claude/` with only safe data (commands, hooks, non-secret config). Exclude memory, cache, auth files.

```typescript
// Instead of mounting all of ~/.claude
// Create a temporary directory with safe subset
const safeClaudeDir = await createSafeClaude();
// Copy only public commands
// Exclude ~/.claude/memory, ~/.claude/.auth-tokens, etc.
```

**Detection (Warning Signs):**
- User stores API key in `~/.claude/config.json` (ask them not to)
- Check container's `/root/.claude/` for `.auth-tokens` or `memory/` directory
- Run `docker exec container env | grep API_KEY` to see if exposed

**When to Address:**
- **Phase 1 (MVP):** Implement Option A (read-only mount) as default. Warn in docs.
- **Phase 2:** Add `--read-write-claude` flag if user explicitly wants writable cache
- **Phase 3:** Security audit of what data is exposed

---

### Pitfall 3: macOS Docker Desktop Bind Mount Performance

**What goes wrong:**
User mounts a large monorepo (`~/workspace/payments` = 50K files) into container. Running `ls -la` inside container takes 30 seconds instead of 0.5 seconds. IDE autocomplete hangs. Tests crawl.

```bash
# Outside container (on host):
$ time ls -la ~/workspace/payments | wc -l
real    0m0.2s

# Inside container (after mount):
$ time ls -la /mnt/repos/payments | wc -l
real    0m30.1s   ← 150x slower!
```

**Why it happens:**
Docker Desktop on macOS runs Docker in a VM. File access goes: Host → Hypervisor → VM → Docker → filesystem. Each layer adds latency. Bind mounts are slower than local volumes because they go through network-like passthrough.

Docker attempted to fix this with `VirtioFS` (2023), but it's still 3-5x slower than native, and there's a regression in Docker 4.67.0+ (Tahoe release) where nested bind mounts are broken entirely.

**Consequences:**
- Claude Code inside container crawls when traversing large repos
- User experience: "This is unusable"
- Workflow disruption: users disable mounting, defeating sandbox purpose

**Prevention:**

**Option A: Hybrid Approach (Recommended)**
Mount only active working directories as bind mounts, keep large static dirs in volumes:

```typescript
// Project files being edited: bind mount (instant feedback)
`${process.env.HOME}/workspace/payments:/mnt/payments:cached`,

// Node modules, build artifacts: Docker volume (fast)
{
  Type: 'volume',
  Source: 'claude-sandbox-nm',
  Target: '/mnt/payments/node_modules',
}
```

Users feel snappy response in working dirs, slow I/O only in build artifacts.

**Option B: Docker's Paid Synchronized File Sharing**
Docker for Desktop offers "Synchronized file sharing" (paid feature, uses Mutagen library). Claims 59% faster than bind mounts. Works well but costs money.

**Option C: Warn Users on Large Repos**
Detect repo size, warn before mounting:

```typescript
const repoSize = du(`~/workspace/foo`);
if (repoSize > 10_000_000) { // 10GB+
  console.warn(`
    ⚠️  Repo '${repo}' is large (${repoSize}MB).
    Bind mounts on macOS are slow for large repos.
    
    Options:
    1. Use --performance=cached (allow stale data)
    2. Use Docker Synchronized file sharing (paid)
    3. Mount only subdirectories with --subdir
  `);
}
```

**Option D: Use Consistency Flags**
Tell Docker to cache reads:

```typescript
// "cached" = container reads are cached, host writes visible after delay
`${process.env.HOME}/workspace/foo:/mnt/repos/foo:cached`,
```

Tradeoff: Files edited on host take 1-5 sec to be visible in container, but reads are instant. Good for one-way workflows (host edits, container reads).

**Detection (Warning Signs):**
- `docker exec container ls -la /mnt/repos` hangs
- Running `git status` inside container takes > 5 seconds
- Test suite runs 5-10x slower inside container vs. host

**When to Address:**
- **Phase 1 (MVP):** Document the issue in README. Recommend `--consistency=cached`.
- **Phase 2:** Implement hybrid approach or mount size detection + warnings
- **Phase 3:** Evaluate OrbStack or Lima as Docker Desktop alternatives for users

**Reference Issue:**
- [Docker Desktop bind mount regression (4.67.0)](https://github.com/docker/desktop-feedback/issues/279)
- [CNCF: Docker on macOS is slow](https://www.cncf.io/blog/2023/02/02/docker-on-macos-is-slow-and-how-to-fix-it/)

---

### Pitfall 4: API Key Security — Environment Variable Exposure

**What goes wrong:**
`ANTHROPIC_API_KEY` is set at container launch via env var. Anyone with access to the running container can read it:

```bash
# Inside container or via docker inspect:
$ docker exec container env | grep API_KEY
ANTHROPIC_API_KEY=sk-ant-...

# Or:
$ docker inspect container | grep -i env
  "Env": ["ANTHROPIC_API_KEY=sk-ant-...", ...]

# Or if Claude Code runs as root and a user has /bin/bash access:
$ cat /proc/self/environ | tr '\0' '\n' | grep API_KEY
ANTHROPIC_API_KEY=sk-ant-...
```

**Why it happens:**
Environment variables are the simplest way to pass secrets to containers. Docker's `inspect` output shows them in plaintext for debugging. Process `/proc/self/environ` is readable by any process on same user.

**Consequences:**
- Attacker inside container (or with `docker inspect` access on host) steals API key
- Attacker calls Anthropic APIs on victim's account, burning quota and incurring charges
- No way to rotate key without restarting container

**Prevention:**

**Option A: Use Docker Secrets (Docker Swarm Only)**
Store secret in Docker daemon, mount as file in container:

```typescript
// Requires Docker Swarm mode (overkill for local dev)
await swarm.createSecret({
  Name: 'anthropic-api-key',
  Data: Buffer.from(process.env.ANTHROPIC_API_KEY).toString('base64'),
});

await container.create({
  Secrets: [
    {
      File: {
        Name: 'anthropic-api-key',
        UID: '0',
        GID: '0',
        Mode: 0o400,
      },
      SecretID: secretId,
    },
  ],
});

// Inside container:
// File is at /run/secrets/anthropic-api-key
```

Downside: Requires Swarm mode; overkill for single container.

**Option B: Volume-Mount Secret File (Recommended)**
Write API key to a temporary file on host, mount read-only into container, delete after container starts:

```typescript
const fs = require('fs');
const secretFile = `${process.env.HOME}/.claude-sandbox/temp-key-${Date.now()}`;

// Write key to temp file (readable only by user)
fs.writeFileSync(secretFile, process.env.ANTHROPIC_API_KEY, {
  mode: 0o600,
});

// Mount as read-only
const bindings = [
  `${secretFile}:/run/secrets/anthropic-api-key:ro`,
];

try {
  await container.create({ HostConfig: { Binds: bindings } });
  
  // Inside container: export $(cat /run/secrets/anthropic-api-key | tr '\n' '=')
  // Or: read from file in Claude CLI
} finally {
  // Clean up after container is created
  fs.unlinkSync(secretFile);
}

// Inside container entrypoint:
// source /run/secrets/anthropic-api-key
// # Now ANTHROPIC_API_KEY env var is set
```

**Option C: Use Vault or External Secrets Manager (Production)**
For team/org scenarios, use HashiCorp Vault or AWS Secrets Manager. Out of scope for MVP but document the path.

**Option D: Clear Sensitive Env Vars from Process Listing**
Container entrypoint can read env var once, then unset it:

```bash
#!/bin/bash
# In container entrypoint
export ANTHROPIC_API_KEY=$(cat /run/secrets/anthropic-api-key)

# Now the env var is set, but hidden from /proc/self/environ
# (This is a best effort; committed scripts can still log it)
unset ANTHROPIC_API_KEY

# Or use it once and store result
export CLAUDE_TOKEN=$(curl -H "Authorization: Bearer ${ANTHROPIC_API_KEY}" ...)
unset ANTHROPIC_API_KEY
```

**Detection (Warning Signs):**
- `docker inspect container` shows API key in plaintext
- User logs contain API key (from debug output)
- API key appears in container image (if committed to Dockerfile)

**When to Address:**
- **Phase 1 (MVP):** Use Option B (volume-mount). Document in security section.
- **Phase 2:** Add health check to detect if key is exposed in logs
- **Phase 3:** Integrate with Vault for team deployments

---

### Pitfall 5: Docker Socket Exposure (If Mounting /var/run/docker.sock)

**What goes wrong:**
Some users want Docker-in-Docker: they need to run Docker commands inside the sandbox to build containers. This requires mounting `/var/run/docker.sock`:

```typescript
const bindings = [
  `/var/run/docker.sock:/var/run/docker.sock`,
];
```

Problem: Anyone in that container becomes equivalent to root on the host. They can:
- Create privileged containers
- Mount host filesystem
- Execute arbitrary commands as root
- Steal all data on the host

**Why it happens:**
Docker socket is the primary API endpoint. Access = full Docker daemon access = full host access.

**Consequences:**
- Complete host compromise if container is malicious or Claude Code is exploited
- Attacker can `docker exec host-bash whoami` and get root

**Prevention:**

**Option A: Don't Expose Docker Socket (Recommended)**
Make this an explicit anti-feature. Document: "claude-sandbox does not support Docker-in-Docker. Run `docker build` on the host instead."

For users who need it, offer: "Mount the socket at your own risk. Read the security implications."

**Option B: Use rootless Docker (Experimental)**
Run Docker daemon in rootless mode so socket access doesn't grant host root. Still risky, but mitigated.

**Option C: Use Docker BuildKit Remote Builder**
Instead of mounting socket, use Docker's remote builder:

```bash
# On host, enable BuildKit
docker buildx create --driver-opt network=host

# Inside container, use remote builder
docker buildx build --builder=remote ...
```

**Detection (Warning Signs):**
- User passes `--mount-docker-socket` or similar flag
- Container runs `docker ps` successfully
- Check: `docker inspect container | grep docker.sock`

**When to Address:**
- **Phase 1 (MVP):** Reject Docker socket mounting. Add validation:
  ```typescript
  if (mounts.some(m => m.includes('docker.sock'))) {
    throw new Error('Docker socket mounting is disabled for security reasons.');
  }
  ```
- **Phase 2:** If demand exists, add `--insecure-mount-docker-socket` flag with huge warning
- **Phase 3:** Document risk if users insist

---

## Moderate Pitfalls

### Pitfall 6: Container Image Staleness & Drift

**What goes wrong:**
User builds `claude-sandbox` image once. 6 months later, they run `start`. Base image (`node:22-bookworm`) has 50 security patches, new Node LTS is released, Claude Code CLI is 5 versions old. But their cached local image is stale.

Docker doesn't auto-pull updates for images you already have locally. Users get outdated, vulnerable sandbox.

**Prevention:**

Add version tracking and staleness warnings:

```typescript
// In config/state
{
  "imageDigest": "sha256:abc123...",
  "imagePulledAt": "2026-03-08T00:00:00Z",
  "imageAgeDay": 31,
}

// On `start`, check age:
const imageAge = Date.now() - state.imagePulledAt;
if (imageAge > 30 * 24 * 60 * 60 * 1000) {
  console.warn(`
    ⚠️  Sandbox image is ${Math.floor(imageAge / (24 * 60 * 60 * 1000))} days old.
    Security patches may be available.
    
    Rebuild: claude-sandbox image-rebuild
    Or add --force-rebuild to start command
  `);
}

// Rebuild image with weekly CI job
// Tag as: claude-sandbox:2026-04-08
```

**When to Address:**
- **Phase 2:** Add image age tracking and warnings
- **Phase 3:** Automatic weekly rebuilds

---

### Pitfall 7: Container State Drift & Crashed Containers

**What goes wrong:**
Container crashes or exits unexpectedly. User runs `claude-sandbox exec "ls"` → fails because container isn't running. User doesn't know why, thinks tool is broken.

**Prevention:**

```typescript
// On exec command, check container state
const container = docker.getContainer(id);
const inspect = await container.inspect();

if (inspect.State.Running === false) {
  const reason = inspect.State.Error || 'Unknown';
  throw new Error(`
    Container exited unexpectedly: ${reason}
    
    Debug: claude-sandbox logs
    Restart: claude-sandbox start --restart
  `);
}
```

Add `logs` command to help debugging:

```bash
claude-sandbox logs --tail 50
```

**When to Address:**
- **Phase 2:** Add crash detection in `status` command
- **Phase 3:** Auto-restart with `--auto-restart` flag

---

### Pitfall 8: Claude Code Inside Docker — Interactive Mode Issues

**What goes wrong:**
Claude Code relies on interactive terminal (stdin/stdout/stderr streams). User runs `claude-sandbox shell`, then `claude code refactor auth/login.ts` inside the container. But:
- TTY not allocated correctly → Claude can't read user input
- Terminal resize events not propagated → Claude's output wraps weirdly
- SIGWINCH (window resize) not handled → Garbled output

**Why it happens:**
Docker `exec` with `-it` flags should handle this, but there are edge cases:
- Some shells don't propagate resize signals
- TTY allocation has race conditions
- Non-interactive mode (piped input) doesn't work with Claude Code

**Prevention:**

Use Dockerode's `attachStream` correctly:

```typescript
// Correct way to allocate PTY and stream I/O
const exec = await container.exec({
  Cmd: ['/bin/bash'],
  Tty: true,
  AttachStdin: true,
  AttachStdout: true,
  AttachStderr: true,
});

const stream = await exec.start({
  Tty: true,
  stream: true,
});

// Propagate terminal signals
process.stdin.setRawMode(true);
stream.pipe(process.stdout);
process.stdin.pipe(stream);

// Handle window resize
process.stdout.on('resize', () => {
  exec.resize({
    h: process.stdout.rows,
    w: process.stdout.columns,
  });
});
```

Test thoroughly on macOS + Linux.

**When to Address:**
- **Phase 1 (MVP):** Test Claude Code interactivity in container. Fix TTY issues before release.
- **Phase 2:** Add `--no-tty` flag for non-interactive exec

---

## Minor Pitfalls

### Pitfall 9: Home Directory Conflicts

**What goes wrong:**
Container's root user has home dir `/root`, but user's `~/.claude/` is mounted at `/root/.claude/`. If Claude Code or tools try to write to `/root/.bashrc`, `/root/.ssh/config`, etc., they conflict or fail.

**Prevention:**
Mount `~/.claude/` only. Don't mount full home dir. Keep container's `/root/` isolated.

Document: "Only `~/.claude/` is mirrored. Other home dir files are not shared."

---

### Pitfall 10: Network Blocking by Firewall

**What goes wrong:**
Organization blocks outbound Docker traffic. User's container can't pull base image. `start` command fails.

**Prevention:**
Detect and provide clear error:

```typescript
try {
  await docker.pull('node:22-bookworm');
} catch (e) {
  if (e.message.includes('network') || e.message.includes('Timeout')) {
    throw new Error(`
      Failed to pull Docker image. Likely causes:
      1. Docker daemon not running
      2. No internet connectivity
      3. Firewall blocking Docker registries
      
      For corporate networks: ask IT to allow docker.io and registry.npmjs.org
    `);
  }
}
```

---

### Pitfall 11: Monorepo Path Discovery Mistakes

**What goes wrong:**
User runs `claude-sandbox start --repo auth` assuming the tool will auto-find `~/workspace/auth` or `~/projects/auth`. But the tool doesn't know where monorepos are stored. Fails with "repo not found."

**Prevention:**
Smart path resolver:

```typescript
const searchPaths = [
  `${process.env.HOME}/workspace`,
  `${process.env.HOME}/projects`,
  `${process.env.HOME}/code`,
  process.cwd(),
];

function resolveRepo(name: string) {
  for (const base of searchPaths) {
    const candidate = `${base}/${name}`;
    if (fs.existsSync(candidate)) return candidate;
  }
  
  // Offer suggestion
  const allRepos = searchPaths
    .flatMap(p => fs.readdirSync(p).filter(f => fs.isDirectorySync(`${p}/${f}`)))
    .filter(name => name.includes(requested));
  
  throw new Error(`Repo '${requested}' not found. Did you mean: ${allRepos.join(', ')}?`);
}
```

---

## Phase-Specific Warning Matrix

| Phase | Topic | Pitfall | Mitigation Approach |
|-------|-------|---------|-------------------|
| Phase 1 | File permissions | UID/GID mismatch | Match container UID to host; test on macOS + Linux |
| Phase 1 | Security | API key exposure | Volume-mount secret file, don't use env vars |
| Phase 1 | Security | Docker socket | Reject socket mounting in validation layer |
| Phase 1 | Usability | Interactive mode | Test Claude Code TTY allocation thoroughly |
| Phase 1 | Performance | macOS slowness | Document `:cached` consistency flag |
| Phase 2 | Image mgmt | Staleness | Add image age tracking, warn users > 30 days |
| Phase 2 | State mgmt | Crash recovery | Detect crashed containers, offer logs + restart |
| Phase 2 | Credentials | ~/.claude/ access | Read-only mount as default |
| Phase 3 | Security | Socket demand | Add `--insecure-mount-docker-socket` with warnings |
| Phase 3 | Scaling | Multi-sandbox | Namespace containers by user/project |

---

## Summary: What to Prioritize

**Phase 1 (MVP) — Must Fix Before Release:**
1. ✅ UID/GID matching (no broken file access)
2. ✅ API key not in plaintext env var (secure by default)
3. ✅ Docker socket rejection (prevent privilege escalation)
4. ✅ TTY allocation for interactive Claude Code (works as expected)
5. ✅ Performance warning for large repos (set expectations)

**Phase 2 — Add for Production Readiness:**
1. Image staleness warnings + rebuild mechanism
2. Crash detection and recovery
3. Read-only `~/.claude/` mount
4. Smart repo path discovery

**Phase 3+ — Nice to Have:**
1. Vault integration for team deployments
2. Alternative image solutions (OrbStack)
3. Multi-sandbox resource management

---

## Sources

- [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
- [Docker Security Documentation](https://docs.docker.com/engine/security/)
- [Quarkslab: Why Docker Socket Exposure is Dangerous](https://blog.quarkslab.com/why-is-exposing-the-docker-socket-a-really-bad-idea.html)
- [Docker Container File Permissions Guide](https://eastondev.com/blog/en/posts/dev/20251217-docker-mount-permissions-guide/)
- [Nick Janetakis: Running Docker as Non-Root](https://nickjanetakis.com/blog/running-docker-containers-as-a-non-root-user-with-a-custom-uid-and-gid/)
- [DigitalOcean: Secure Environment Variables in Docker](https://www.digitalocean.com/community/questions/how-can-i-securely-store-environment-variables-like-api-keys-in-my-docker-containers/)
- [Doppler: Environment Variables for Secrets in 2026](https://www.doppler.com/blog/environment-variable-secrets-2026)
- [Docker Secrets Best Practices](https://www.wiz.io/academy/container-security/docker-secrets)
- [CNCF: Docker on macOS is Slow](https://www.cncf.io/blog/2023/02/02/docker-on-macos-is-slow-and-how-to-fix-it/)
- [Paolo Mainardi: Docker on macOS Performance 2025](https://www.paolomainardi.com/posts/docker-performance-macos-2025/)
- [Docker Desktop Performance Guide for Mac 2025](https://m.academy/articles/docker-desktop-performance-guide-mac/)
- [Docker Desktop Issue: Nested Bind Mounts Broken (4.67.0)](https://github.com/docker/desktop-feedback/issues/279)
- [Docker Image Lifecycle Management](https://www.atatus.com/blog/docker-container-lifecycle-management/)
- [Avoiding Stale Docker Images](https://devops.datenkollektiv.de/avoiding-stale-docker-images.html)
- [Docker Hardened Images](https://www.docker.com/blog/the-next-evolution-of-docker-hardened-images/)
- [Claude Code Sandboxing Docs](https://code.claude.com/docs/en/sandboxing)
