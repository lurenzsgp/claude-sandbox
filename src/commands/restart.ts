import type { Command } from 'commander';
import { createDockerClient } from '../docker/client.js';
import { readState, writeState, reconcileState } from '../state/manager.js';

export function registerRestart(program: Command): void {
  program
    .command('restart')
    .description('Restart the Claude sandbox container')
    .action(async () => {
      const docker = createDockerClient();
      const raw = readState();
      if (!raw) {
        console.error('No sandbox container found. Run `claude-sandbox start` first.');
        process.exit(1);
      }
      const state = await reconcileState(raw, docker);
      if (state.status === 'not_found') {
        console.error('Container not found — run `claude-sandbox start` to create a new one.');
        process.exit(1);
      }
      const container = docker.getContainer(state.containerId);
      if (state.status === 'running') {
        await container.stop();
      }
      await container.start();
      const now = new Date().toISOString();
      writeState({ ...state, status: 'running', lastStartedAt: now });
      console.log('Sandbox restarted.');
    });
}
