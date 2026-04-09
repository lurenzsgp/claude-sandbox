---
phase: "01"
plan: "02"
subsystem: core-infrastructure
tags: [typescript, errors, config, state, docker, secrets, vitest]
dependency_graph:
  requires:
    - 01-01 (package.json, tsconfig, node_modules, src/cli.ts)
  provides:
    - src/errors/index.ts — typed error hierarchy (SandboxError, MountValidationError, ContainerNotFoundError, ConfigError)
    - src/config/schema.ts — Config type + DEFAULT_CONFIG
    - src/config/loader.ts — loadConfig(), CONFIG_DIR, CONFIG_PATH
    - src/state/manager.ts — readState(), writeState(), reconcileState(), SandboxState, STATE_PATH
    - src/docker/client.ts — validateMounts(), createDockerClient()
    - src/secrets/injector.ts — injectApiKey(), SecretMount interface
  affects:
    - 01-04 (lifecycle commands import all of these)
    - 01-05 (shell command imports docker/client.ts and state/manager.ts)
tech_stack:
  added:
    - vitest@2.1.9 (downgraded from 4.1.4 for Node 18 compatibility)
  patterns:
    - TDD red-green cycle for all modules
    - ESM imports with .js extensions (required by "type":"module" project)
    - State reconciliation: Docker always source of truth, state.json is cache
    - Secrets injection via temp file at mode 0o600, not Docker Env
    - Mount validation guard at input boundary (validateMounts called before any Docker operation)
key_files:
  created:
    - src/errors/index.ts
    - src/config/schema.ts
    - src/config/loader.ts
    - src/state/manager.ts
    - src/state/manager.test.ts
    - src/docker/client.ts
    - src/docker/client.test.ts
    - src/secrets/injector.ts
    - src/secrets/injector.test.ts
  modified:
    - package.json (vitest version downgrade)
    - package-lock.json
decisions:
  - "vitest downgraded from 4.1.4 to 2.1.9: vitest 4.x uses node:util styleText which is only available in Node 20+; host runs Node 18.18.0"
  - "validateMounts() checks docker.sock by substring (not exact match) to catch any sock path variant"
  - "reconcileState() writes state to disk only when status differs (avoids unnecessary I/O)"
  - "cleanup() in injectApiKey() is best-effort: catches all errors silently to avoid masking primary errors in finally blocks"
metrics:
  duration: "~3 minutes"
  completed: "2026-04-09T16:10:27Z"
  tasks_completed: 2
  files_created: 9
---

# Phase 01 Plan 02: Core Infrastructure Summary

**One-liner:** Typed error hierarchy, config loader, state manager with Docker reconciliation, Dockerode mount-validation wrapper, and 0o600 secrets file injector — all tested with 15 passing Vitest tests.

## What Was Built

Six source modules (plus 3 test files) forming the complete infrastructure layer:

- **src/errors/index.ts** — `SandboxError` base class with optional `fix` hint; `MountValidationError` (invalid mount path), `ContainerNotFoundError` (Docker 404 on reconcile), `ConfigError` (malformed config.json)
- **src/config/schema.ts** — `Config` interface with `monorepoRoot: string | null` and `registryUrl: string | null`; `DEFAULT_CONFIG` constant (both null)
- **src/config/loader.ts** — `loadConfig()` merges `~/.claude-sandbox/config.json` with `DEFAULT_CONFIG`; returns defaults without error if file absent; throws `ConfigError` on parse failure
- **src/state/manager.ts** — `readState()` returns null if `state.json` absent; `writeState()` creates `~/.claude-sandbox/` if missing; `reconcileState()` queries Docker daemon, maps 404 → `not_found`, `Running: false` → `stopped`, writes updated state only when status changes
- **src/docker/client.ts** — `validateMounts()` rejects any path containing `docker.sock` (CONT-03) and blocks system directories `/`, `/etc`, `/System`, `/private`, `/var`, `/tmp`, `/bin`, `/usr`, `/lib`, `/sbin`, `/dev`, `/proc`, `/sys` (D-06); `createDockerClient()` returns a Dockerode instance
- **src/secrets/injector.ts** — `injectApiKey()` reads `ANTHROPIC_API_KEY` from environment, writes to `~/.claude-sandbox/tmp-key-{timestamp}` at mode `0o600`, returns `bindSpec` (`hostPath:/run/secrets/anthropic-api-key:ro`) and idempotent `cleanup()` function (AUTH-01)

## Test Results

| File | Tests | Result |
|------|-------|--------|
| src/state/manager.test.ts | 3 | PASS |
| src/docker/client.test.ts | 7 | PASS |
| src/secrets/injector.test.ts | 5 | PASS |
| **Total** | **15** | **ALL PASS** |

Key test cases:
- `reconcileState` 404 → status `not_found` — PASS
- `reconcileState` `Running: false` → status `stopped` — PASS
- `validateMounts` docker.sock → `MountValidationError` — PASS
- `validateMounts` `/` → `MountValidationError` — PASS
- `validateMounts` valid path → no throw — PASS
- `injectApiKey` no key → `SandboxError` — PASS
- `injectApiKey` temp file mode 0o600 — PASS
- `injectApiKey` cleanup removes file — PASS
- `injectApiKey` cleanup idempotent — PASS

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Downgraded vitest from 4.1.4 to 2.1.9 for Node 18 compatibility**
- **Found during:** Task 1, initial RED-phase test run
- **Issue:** `vitest@4.1.4` imports `styleText` from `node:util`, which was only added in Node 20. The host runs Node 18.18.0 (as documented in RESEARCH.md). Running `npm test` threw `SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'` immediately on vitest startup.
- **Fix:** `npm install -D vitest@2.1.9` — the last minor series with `^18.0.0 || >=20.0.0` engine requirement. Tests pass cleanly on Node 18.18.0.
- **Files modified:** `package.json`, `package-lock.json`
- **Commit:** 1c57c06

**Impact on downstream plans:** Any plan that relies on `vitest@4.x` features will be similarly blocked. The fix is in `package.json` and `package-lock.json`. Plans 03–05 should use `vitest@2.1.9`.

## TypeScript Compilation

`tsc --noEmit` produces one pre-existing error (from Plan 01 scaffold): `esbuild.config.ts` is not under `rootDir: src`. This error pre-exists and is out of scope. The new infrastructure modules have no TypeScript errors.

`npm run build` (esbuild) exits 0 — the CLI bundle compiles cleanly with all new modules.

## Interface Contracts for Plan 04 (lifecycle) and Plan 05 (shell)

```typescript
// Error types — import from '../errors/index.js'
import { SandboxError, MountValidationError, ContainerNotFoundError, ConfigError } from '../errors/index.js';

// Config — import from '../config/loader.js' or '../config/schema.js'
import { loadConfig, CONFIG_DIR, CONFIG_PATH } from '../config/loader.js';
import { type Config, DEFAULT_CONFIG } from '../config/schema.js';

// State — import from '../state/manager.js'
import { readState, writeState, reconcileState, type SandboxState, STATE_PATH } from '../state/manager.js';

// Docker client — import from '../docker/client.js'
import { createDockerClient, validateMounts } from '../docker/client.js';

// Secrets — import from '../secrets/injector.js'
import { injectApiKey, type SecretMount } from '../secrets/injector.js';
```

Call order for lifecycle commands:
1. `validateMounts(hostPaths)` — throws `MountValidationError` if invalid; call before any Docker operation
2. `injectApiKey()` — returns `{ bindSpec, cleanup }`; wrap container creation in `try/finally { cleanup() }`
3. `createDockerClient()` — get Dockerode instance
4. `readState()` → `reconcileState(state, docker)` — always reconcile before trusting local state

## Known Stubs

None — all modules implement real behavior with no placeholders.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 1c57c06 | feat(01-02): add typed errors, config schema/loader, and state manager |
| Task 2 | d6d4631 | feat(01-02): add Docker client wrapper with mount validation and secrets injector |

## Self-Check: PASSED

- [x] src/errors/index.ts — FOUND
- [x] src/config/schema.ts — FOUND
- [x] src/config/loader.ts — FOUND
- [x] src/state/manager.ts — FOUND
- [x] src/state/manager.test.ts — FOUND
- [x] src/docker/client.ts — FOUND
- [x] src/docker/client.test.ts — FOUND
- [x] src/secrets/injector.ts — FOUND
- [x] src/secrets/injector.test.ts — FOUND
- [x] Commit 1c57c06 — FOUND
- [x] Commit d6d4631 — FOUND
- [x] npm test exits 0, 15 tests pass — VERIFIED
- [x] npm run build exits 0 — VERIFIED
