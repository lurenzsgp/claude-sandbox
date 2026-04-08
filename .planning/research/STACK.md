# Technology Stack

**Project:** Claude Sandbox CLI  
**Researched:** 2026-04-08  
**Confidence:** HIGH (verified with multiple authoritative sources)

## Recommended Stack

### CLI Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Commander** | ^12.0.0 | Parse arguments, define subcommands | Zero dependencies, fastest startup (~18ms), 500M weekly downloads. Ideal for this tool's moderate complexity (5-10 commands). Simple to learn, minimal overhead. |

**Alternative considered:** Yargs (more flexible but adds 7 dependencies), oclif (opinionated structure, 85ms startup—overkill for this use case).

**Confidence:** HIGH — Commander dominates Node.js CLI ecosystem; Vercel, Heroku, and major tools use it.

---

### Docker Interaction

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Dockerode** | ^3.4.0 | Programmatic Docker daemon communication | Native Node.js Docker Remote API client. Better error handling, streaming support, and promise-based workflows than shelling out. No subprocess overhead. |

**Alternative considered:** Child process + `docker exec` (shell-based, harder to debug, misses errors). Dockerode wraps the official Docker API.

**Confidence:** HIGH — Dockerode is the industry standard for Node.js Docker clients (4.5M weekly downloads).

---

### Container Base Image

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **node:22-bookworm** | 22.x LTS | Base OS + runtime | Bookworm (Debian 12) is the current stable base. Node 22 is LTS. Slim variant for prod (removes unnecessary packages), but Bookworm full image for dev sandbox (stability, compatibility with all CLI tools). |

**Rationale for Bookworm vs Alpine:** Alpine is 25% smaller but has fewer system packages; Bookworm ensures compatibility with diverse monorepo tools (Python, Go, Java, etc.) that users may need inside the sandbox.

**Install Claude Code CLI in image:** Include `npm install -g @anthropic-sdk/claude-code` in Dockerfile so Claude is ready immediately upon container start.

**Confidence:** MEDIUM-HIGH — Node.js team recommends Bookworm for stability; Alpine is narrower and riskier for a sandbox that may run diverse tooling.

---

### Configuration File Format

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **JSON** | Native | Store repo mounts, defaults, container state | JSON is native to Node.js (zero parsing library), human-readable, and validated by JSON Schema. No type-coercion surprises like YAML. `.claude-sandbox.json` in home directory or project root. |

**Alternative considered:** YAML (comments, human-friendly but implicit type coercion), TOML (clearer but less common in Node.js ecosystem).

**Config file location strategy:**
- Global: `~/.claude-sandbox/config.json` (user's default sandbox settings)
- Project: `.claude-sandbox.json` in repo root (project-specific overrides)

**Confidence:** HIGH — JSON is battle-tested for Node.js CLI configuration. No external parser needed.

---

### Package Manager

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **npm** | 10.x+ | Dependency management | Default, zero additional setup. Node.js ships with npm. |

**Consider pnpm in Phase 2** if monorepo support becomes complex (better for workspaces), but npm is sufficient for initial release.

**Confidence:** HIGH — npm is the standard; no reason to deviate early.

---

### Development & Bundling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **TypeScript** | ^5.3.0 | Type safety | Prevents entire classes of bugs in Docker API calls and config parsing. |
| **esbuild** | ^0.20.0 | Fast bundling | Bundles CLI into single executable. 10-100x faster than webpack/tsc. |
| **tsx** | ^4.0.0 | Development runner | Run TS directly in development without compilation step. |

**Confidence:** HIGH — Standard modern Node.js stack.

---

### Testing & Linting

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Vitest** | ^1.0.0 | Unit/integration tests | Fast, TypeScript-native, ESM-first. Better than Jest for this project's scope. |
| **ESLint** | ^8.0.0 | Code quality | Standard Node.js linter. |
| **Prettier** | ^3.0.0 | Code formatting | Opinionated, reduces style debates. |

**Confidence:** HIGH — Current best practices for Node.js development.

---

## Installation & Setup

```bash
# Create project
mkdir claude-sandbox && cd claude-sandbox
npm init -y

# Core dependencies
npm install commander dockerode

# Dev dependencies
npm install -D \
  typescript tsx esbuild \
  vitest @vitest/ui \
  eslint prettier \
  @types/node

# TypeScript config
npx tsc --init --strict

# Add bin entry to package.json
{
  "name": "claude-sandbox",
  "version": "0.1.0",
  "bin": {
    "claude-sandbox": "./dist/cli.js"
  }
}

# Create shebang in src/cli.ts
#!/usr/bin/env node
```

---

## What NOT to Use and Why

| Technology | Why Avoid |
|------------|-----------|
| **Docker-compose** (only) | Adds complexity for single container. Reserve for Phase 2 if multi-container support is needed. |
| **Alpine base image** | Too minimal for a dev sandbox; users may need system tools. Bookworm is safer. |
| **Shelljs or child_process shelling** | Poor error handling, inconsistent across platforms, harder to debug Docker state. Dockerode is superior. |
| **YAML for config** | Implicit type coercion (`yes` → boolean). JSON is explicit and native to Node.js. |
| **Yargs** | Over-featured for this CLI's scope. Adds 7 dependencies, slower startup. Commander is lean. |
| **Webpack/Rollup for bundling** | Overkill; esbuild is 10-100x faster and produces smaller bundles. |
| **Secrets files (.env)** | Never commit. Use env vars or Docker secrets in production. For dev, use per-machine setup. |

---

## Rationale & Confidence Summary

### Confidence by Category

| Category | Confidence | Reasoning |
|----------|------------|-----------|
| CLI Framework (Commander) | HIGH | 500M+ weekly downloads, zero deps, industry standard |
| Docker interaction (Dockerode) | HIGH | Native Docker API client, battle-tested, best error handling |
| Base image (node:22-bookworm) | MEDIUM-HIGH | Node team recommends; Bookworm balances size/compatibility |
| Config format (JSON) | HIGH | Native, explicit, no surprises. Schema-validatable. |
| Dev tooling (TS, esbuild, vitest) | HIGH | Current Node.js best practices |

### Phase Ordering Impact

- **Phase 1 (MVP):** Needs Commander, Dockerode, base image, JSON config. Core stack only.
- **Phase 2 (Enhancements):** May add docker-compose for complex multi-service sandboxes.
- **Phase 3 (Scaling):** Consider pnpm if monorepo tooling grows; otherwise no stack changes.

---

## Sources

- [npm-compare: Commander vs Oclif vs Yargs](https://npm-compare.com/commander,oclif,vorpal,yargs)
- [Grizzly Peak: CLI Framework Comparison](https://www.grizzlypeaksoftware.com/library/cli-framework-comparison-commander-vs-yargs-vs-oclif-utxlf9v9)
- [PkgPulse: Commander vs Yargs vs Oclif](https://www.pkgpulse.com/blog/how-to-build-a-cli-with-node.js-commander-yargs-oclif)
- [npm Trends: Commander, Oclif, Yargs](https://npmtrends.com/commander-vs-oclif-vs-yargs)
- [Dockerode GitHub](https://github.com/apocas/dockerode)
- [Dockerode npm](https://www.npmjs.com/package/dockerode)
- [iximiuz Labs: Node.js Docker Images](https://labs.iximiuz.com/tutorials/how-to-choose-nodejs-container-image)
- [Node.js Official Docker Images](https://hub.docker.com/_/node/)
- [Snyk: Choosing Node.js Docker Images](https://snyk.io/blog/choosing-the-best-node-js-docker-image/)
- [DEV Community: JSON vs YAML vs TOML in 2026](https://dev.to/jsontoall_tools/json-vs-yaml-vs-toml-which-configuration-format-should-you-use-in-2026-1hlf)
- [npm package.json Documentation](https://docs.npmjs.com/cli/v7/configuring-npm/package-json/)
- [npm scripts Documentation](https://docs.npmjs.com/cli/v8/using-npm/scripts/)
