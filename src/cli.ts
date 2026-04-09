import { Command } from 'commander';

const program = new Command();

program
  .name('claude-sandbox')
  .description('Run Claude Code in an isolated Docker sandbox with selective repo access')
  .version('0.1.0');

// Commands are registered in Plan 04 (lifecycle) and Plan 05 (shell)
// This skeleton is here so the build system can be verified independently

program.parse(process.argv);
