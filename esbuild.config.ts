import { build } from 'esbuild';

await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'dist/claude-sandbox.cjs',
  banner: {
    js: '#!/usr/bin/env node',
  },
  // Bundle all dependencies for single-file distribution
  // Output as CJS to avoid ESM/CJS interop issues with commander and dockerode
});

console.log('Build complete: dist/claude-sandbox.cjs');
