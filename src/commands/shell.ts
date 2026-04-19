import { spawn } from 'child_process';
import type { Command } from 'commander';
import { readState, reconcileState } from '../state/manager.js';
import { createDockerClient } from '../docker/client.js';

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

      // Use `docker exec -it` via a child process with stdio:inherit.
      //
      // Why not Dockerode container.exec() with hijack:true?
      // Dockerode gives us a TCP socket (duplex stream) which we manually pipe
      // to/from process.stdin/stdout. This works for plain bash but breaks
      // Claude Code's React Ink TUI: Ink calls process.stdin.setRawMode() and
      // isatty() which require a genuine kernel-level PTY file descriptor — not
      // a Node.js stream wrapper over a socket. The result is a silent hang.
      //
      // With stdio:'inherit', the docker subprocess inherits fd 0/1/2 directly
      // from the host process. Docker CLI negotiates a real PTY with the daemon
      // and the container process gets an isatty()=true PTY — identical to what
      // `docker exec -it` produces when run manually in a terminal.
      const child = spawn(
        'docker',
        ['exec', '-it', state.containerId, '/bin/bash'],
        {
          stdio: 'inherit',
          // Pass host environment so TERM, COLORTERM, etc. reach docker CLI.
          env: process.env,
        },
      );

      child.on('exit', (code, signal) => {
        if (signal) {
          process.kill(process.pid, signal);
        } else {
          process.exit(code ?? 0);
        }
      });

      child.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          console.error('Error: `docker` CLI not found in PATH. Please install Docker Desktop or the Docker CLI.');
        } else {
          console.error('Shell error:', err.message);
        }
        process.exit(1);
      });
    });
}
