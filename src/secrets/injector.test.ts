import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { injectApiKey } from './injector.js';
import { SandboxError } from '../errors/index.js';
import { statSync } from 'fs';

describe('injectApiKey', () => {
  const originalKey = process.env['ANTHROPIC_API_KEY'];

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env['ANTHROPIC_API_KEY'] = originalKey;
    } else {
      delete process.env['ANTHROPIC_API_KEY'];
    }
  });

  it('throws SandboxError when ANTHROPIC_API_KEY is not set', () => {
    delete process.env['ANTHROPIC_API_KEY'];
    expect(() => injectApiKey()).toThrow(SandboxError);
  });

  it('returns a bindSpec containing the container secret path', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key';
    const { bindSpec, cleanup } = injectApiKey();
    expect(bindSpec).toContain('/run/secrets/anthropic-api-key:ro');
    cleanup();
  });

  it('creates a temp file with mode 0o600', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key';
    const { bindSpec, cleanup } = injectApiKey();
    // Extract the host path from bindSpec (format: hostPath:containerPath:ro)
    const hostPath = bindSpec.split(':')[0];
    const stats = statSync(hostPath!);
    // Mode 0o100600 = regular file with 600 permissions
    expect(stats.mode & 0o777).toBe(0o600);
    cleanup();
  });

  it('cleanup() removes the temp file', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key';
    const { bindSpec, cleanup } = injectApiKey();
    const hostPath = bindSpec.split(':')[0]!;
    cleanup();
    const { existsSync } = await import('fs');
    expect(existsSync(hostPath)).toBe(false);
  });

  it('cleanup() does not throw if called twice', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key';
    const { cleanup } = injectApiKey();
    cleanup();
    expect(() => cleanup()).not.toThrow();
  });
});
