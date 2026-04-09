import { Command } from 'commander';
import { registerStart } from './commands/start.js';
import { registerStop } from './commands/stop.js';
import { registerRestart } from './commands/restart.js';
import { registerStatus } from './commands/status.js';
import { registerShell } from './commands/shell.js';

const program = new Command();

program
  .name('claude-sandbox')
  .description('Run Claude Code in an isolated Docker sandbox with selective repo access')
  .version('0.1.0');

registerStart(program);
registerStop(program);
registerRestart(program);
registerStatus(program);
registerShell(program);

program.parseAsync(process.argv).catch((err: Error) => {
  console.error('Error:', err.message);
  if ('fix' in err && (err as Error & { fix?: string }).fix) {
    console.error('Fix:', (err as Error & { fix?: string }).fix);
  }
  process.exit(1);
});
