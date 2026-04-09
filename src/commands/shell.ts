import type { Command } from 'commander';
import { createDockerClient } from '../docker/client.js';
import { readState, reconcileState } from '../state/manager.js';

export function registerShell(program: Command): void {
  program
    .command('shell')
    .description('Open an interactive shell inside the Claude sandbox container')
    .action(async () => {
      const docker = createDockerClient();
      const raw = readState();
      if (!raw) {
        console.error('No sandbox container found. Run `claude-sandbox start --mount <path>` first.');
        process.exit(1);
      }

      const state = await reconcileState(raw, docker);
      if (state.status !== 'running') {
        console.error(`Sandbox is ${state.status}. Run \`claude-sandbox start\` to start it.`);
        process.exit(1);
      }

      const container = docker.getContainer(state.containerId);

      // Allocate a real PTY (PITFALL 4: must have Tty: true + AttachStdin/Stdout/Stderr)
      const exec = await container.exec({
        Cmd: ['/bin/bash'],
        Tty: true,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: '/workspace', // D-12: open at /workspace
      });

      // hijack: true gives us the raw socket for bidirectional PTY I/O.
      // Without it Dockerode returns a one-way stream and stdin is ignored.
      const stream = await exec.start({ hijack: true, stdin: true } as any);

      // Put host stdin into raw mode so Claude Code's interactive TUI works correctly
      process.stdin.setRawMode(true);
      process.stdin.resume();

      // Pipe bidirectionally: container stdout → host stdout, host stdin → container stdin
      stream.pipe(process.stdout);
      process.stdin.pipe(stream as any);

      // Propagate terminal resize events to the container (PITFALL 4: SIGWINCH)
      const resize = () => {
        exec.resize({ h: process.stdout.rows ?? 24, w: process.stdout.columns ?? 80 }).catch(() => {
          // Ignore resize errors (container may be exiting)
        });
      };
      process.stdout.on('resize', resize);
      resize(); // Set initial terminal size immediately

      // Clean exit: restore stdin and exit the process
      stream.on('end', () => {
        process.stdout.removeListener('resize', resize);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.exit(0);
      });

      stream.on('error', (err: Error) => {
        process.stdout.removeListener('resize', resize);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        console.error('\nShell connection error:', err.message);
        process.exit(1);
      });
    });
}
