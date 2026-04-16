import type { Command } from 'commander';
import { resolve } from 'path';
import { createDockerClient, validateMounts } from '../docker/client.js';
import { resolveMount, resolveClaudeConfigMount, resolveClaudeConfigJsonMount, readSandboxConfig, resolveWhitelistMasks, resolveClaudeMdMount, type MountSpec } from '../docker/mounts.js';
import { ensureImage, IMAGE_TAG } from '../docker/image.js';
import { injectApiKey } from '../secrets/injector.js';
import { readState, writeState, reconcileState, type SandboxState } from '../state/manager.js';

const CONTAINER_NAME = 'claude-sandbox';

function mountsMatch(stored: string[], requested: string[]): boolean {
  const normalize = (p: string[]) => [...p].map(x => resolve(x)).sort().join('|');
  return normalize(stored) === normalize(requested);
}

export function registerStart(program: Command): void {
  program
    .command('start')
    .description('Start the Claude sandbox container')
    .requiredOption(
      '-m, --mount <path>',
      'Host directory to mount (can be specified multiple times)',
      (val: string, prev: string[]) => [...prev, val],
      [] as string[]
    )
    .option('--recreate', 'Recreate the container even if it already exists (resets container state)')
    .option('--claude-md <path>', 'Path to project CLAUDE.md to mount at /workspace/CLAUDE.md (read-only)')
    .action(async (opts: { mount: string[]; recreate?: boolean; claudeMd?: string }) => {
      const docker = createDockerClient();
      const requestedPaths = opts.mount.map(p => resolve(p));

      // Validate mounts before any Docker call (CONT-03, D-06)
      validateMounts(requestedPaths);

      // Resolve mount specs (MNT-01, MNT-02)
      const repoMounts = requestedPaths.map(resolveMount);
      const claudeMount = resolveClaudeConfigMount();
      const claudeJsonMount = resolveClaudeConfigJsonMount();

      // Whitelist-based masking: read .claude-sandbox.yml from each repo root,
      // tmpfs all subdirectories not in the include list (preserves tree structure).
      const tmpfsMounts = repoMounts.flatMap(m => {
        const sandboxConfig = readSandboxConfig(m.hostPath);
        return resolveWhitelistMasks(m, sandboxConfig.include);
      });

      // Resolve optional CLAUDE.md mount (CLI-06, D-01, D-02)
      let claudeMdMount: MountSpec | null = null;
      if (opts.claudeMd) {
        claudeMdMount = resolveClaudeMdMount(opts.claudeMd);
        // Conflict detection (D-03, D-04): warn if CLAUDE.md is inside a mounted repo
        for (const repo of repoMounts) {
          if (claudeMdMount.hostPath.startsWith(repo.hostPath + '/')) {
            console.log(
              `Note: CLAUDE.md is already accessible via ${repo.containerPath}/CLAUDE.md — also mounting at /workspace/CLAUDE.md for global scope.`
            );
            break;
          }
        }
      }

      // Ensure the image exists (build if first run — D-07, D-08)
      await ensureImage(docker);

      // Handle existing container state
      let existingState = readState();
      if (existingState) {
        const state = await reconcileState(existingState, docker);

        if (state.status !== 'not_found') {
          // Check if mounts match (D-10, D-11)
          if (!mountsMatch(state.mounts, requestedPaths)) {
            if (!opts.recreate) {
              console.error('Mount mismatch!');
              console.error('  Current mounts:', state.mounts.join(', '));
              console.error('  Requested mounts:', requestedPaths.join(', '));
              console.error('\nRun `claude-sandbox start --recreate` to rebuild with new mounts (container state will be lost).');
              process.exit(1);
            }
            // --recreate: remove existing container
            const existing = docker.getContainer(state.containerId);
            try { await existing.stop(); } catch { /* already stopped */ }
            await existing.remove();
            existingState = null;
          } else if (opts.recreate) {
            // --recreate with same mounts (e.g. changing --claude-md)
            const existing = docker.getContainer(state.containerId);
            try { await existing.stop(); } catch { /* already stopped */ }
            await existing.remove();
            existingState = null;
          } else if (state.status === 'running') {
            console.log('Sandbox is already running.');
            return;
          } else {
            // Same mounts, container stopped — restart it silently (D-11)
            const existing = docker.getContainer(state.containerId);
            await existing.start();
            const now = new Date().toISOString();
            writeState({ ...state, status: 'running', lastStartedAt: now });
            console.log('Sandbox started.');
            return;
          }
        } else {
          // Container was deleted externally — proceed to create fresh
          existingState = null;
        }
      }

      // Inject API key via secrets file when available (AUTH-01).
      // Returns null for Pro/Max users who authenticate via ~/.claude/ OAuth.
      const secret = injectApiKey();
      let started = false;
      try {
        const binds = [
          ...repoMounts.map(m => m.bindSpec),
          claudeMount.bindSpec,
          ...(claudeJsonMount ? [claudeJsonMount.bindSpec] : []),
          ...(claudeMdMount ? [claudeMdMount.bindSpec] : []),
          ...(secret ? [secret.bindSpec] : []),
        ];

        const container = await docker.createContainer({
          Image: IMAGE_TAG,
          name: CONTAINER_NAME,
          WorkingDir: '/workspace',
          Tty: true,
          OpenStdin: true,
          Env: [
            'CLAUDE_SANDBOX=1',
            // PS1 is set in entrypoint; also set here as a fallback (D-13)
            'PS1=[sandbox] \\u@\\h:\\w\\$ ',
          ],
          HostConfig: {
            Binds: binds,
            Mounts: tmpfsMounts,
            SecurityOpt: ['no-new-privileges:true'],
          },
        });

        await container.start();
        started = true;

        const now = new Date().toISOString();
        const state: SandboxState = {
          version: '1',
          containerId: container.id,
          status: 'running',
          mounts: requestedPaths,
          claudeMd: claudeMdMount ? claudeMdMount.hostPath : null,  // D-05
          createdAt: now,
          lastStartedAt: now,
        };
        writeState(state);
        console.log('Sandbox started.');

      } finally {
        // Only clean up on failure — key file must persist while container exists
        // so Docker can re-mount it after stop/start cycles.
        if (!started) secret?.cleanup();
      }
    });
}
