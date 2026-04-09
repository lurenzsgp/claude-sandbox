import { build } from 'esbuild';

await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'dist/claude-sandbox.js',
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: [], // bundle everything including deps
});

console.log('Build complete: dist/claude-sandbox.js');
