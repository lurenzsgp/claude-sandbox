import type { Command } from 'commander';
import { createDockerClient } from '../docker/client.js';
import { readState, reconcileState } from '../state/manager.js';

function formatUptime(lastStartedAt: string): string {
  const diffMs = Date.now() - new Date(lastStartedAt).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just started';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m`;
  return `${Math.floor(diffHours / 24)}d ${diffHours % 24}h`;
}

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show the current state of the Claude sandbox container')
    .action(async () => {
      const docker = createDockerClient();
      const raw = readState();
      if (!raw) {
        console.log('No sandbox container. Run `claude-sandbox start --mount <path>` to create one.');
        return;
      }
      const state = await reconcileState(raw, docker);

      console.log(`Status:     ${state.status}`);
      console.log(`Container:  ${state.containerId.slice(0, 12)}`);
      if (state.status === 'running') {
        console.log(`Uptime:     ${formatUptime(state.lastStartedAt)}`);
      }
      console.log(`Created:    ${new Date(state.createdAt).toLocaleString()}`);
      console.log('Mounts:');
      for (const m of state.mounts) {
        console.log(`  ${m}`);
      }
    });
}
