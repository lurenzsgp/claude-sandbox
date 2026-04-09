import type { Command } from 'commander';
import { createDockerClient } from '../docker/client.js';
import { readState, writeState, reconcileState } from '../state/manager.js';

export function registerStop(program: Command): void {
  program
    .command('stop')
    .description('Stop the Claude sandbox container')
    .action(async () => {
      const docker = createDockerClient();
      const raw = readState();
      if (!raw) {
        console.error('No sandbox container found. Run `claude-sandbox start` first.');
        process.exit(1);
      }
      const state = await reconcileState(raw, docker);
      if (state.status === 'not_found') {
        console.error('Container not found — it may have been deleted. Run `claude-sandbox start` to create a new one.');
        process.exit(1);
      }
      if (state.status === 'stopped') {
        console.log('Sandbox is already stopped.');
        return;
      }
      const container = docker.getContainer(state.containerId);
      await container.stop();
      writeState({ ...state, status: 'stopped' });
      console.log('Sandbox stopped.');
    });
}
