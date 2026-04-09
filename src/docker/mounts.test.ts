import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import { resolveMount, resolveClaudeConfigMount, resolveBlockedPaths } from './mounts.js';
import { SandboxError } from '../errors/index.js';

describe('resolveMount', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `sandbox-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('resolves an existing absolute path to a workspace bind spec', () => {
    const result = resolveMount(testDir);
    expect(result.bindSpec).toMatch(/^\/.*:\/workspace\/.*:rw,cached$/);
    expect(result.containerPath).toBe(`/workspace/${basename(testDir)}`);
  });

  it('throws SandboxError for a path that does not exist', () => {
    expect(() => resolveMount('/nonexistent/path/to/nowhere')).toThrow(SandboxError);
  });

  it('strips trailing slashes from path', () => {
    const result1 = resolveMount(testDir);
    const result2 = resolveMount(testDir + '/');
    expect(result1.hostPath).toBe(result2.hostPath);
  });
});

describe('resolveClaudeConfigMount', () => {
  it('returns a ro bind spec targeting /home/sandbox/.claude', () => {
    const result = resolveClaudeConfigMount();
    expect(result.bindSpec).toMatch(/\.claude:\/home\/sandbox\/.claude:ro$/);
    expect(result.containerPath).toBe('/home/sandbox/.claude');
  });

  it('host path ends with .claude', () => {
    const result = resolveClaudeConfigMount();
    expect(result.hostPath).toMatch(/\/.claude$/);
  });
});

describe('resolveBlockedPaths', () => {
  let testRepo: string;

  beforeEach(() => {
    testRepo = join(tmpdir(), `sandbox-repo-${Date.now()}`);
    mkdirSync(join(testRepo, 'src'), { recursive: true });
    mkdirSync(join(testRepo, 'secrets'), { recursive: true });
    mkdirSync(join(testRepo, 'node_modules'), { recursive: true });
  });

  afterEach(() => {
    rmSync(testRepo, { recursive: true, force: true });
  });

  it('returns empty array when no .claude-sandbox-ignore file exists', () => {
    const mount = resolveMount(testRepo);
    const result = resolveBlockedPaths(mount, null);
    expect(result).toHaveLength(0);
  });

  it('returns tmpfs specs for directories listed in .claude-sandbox-ignore', () => {
    writeFileSync(join(testRepo, '.claude-sandbox-ignore'), 'secrets\nnode_modules\n');
    const mount = resolveMount(testRepo);
    const result = resolveBlockedPaths(mount, null);
    const targets = result.map(s => s.Target);
    expect(targets).toContain(`/workspace/${basename(testRepo)}/secrets`);
    expect(targets).toContain(`/workspace/${basename(testRepo)}/node_modules`);
    expect(targets).not.toContain(`/workspace/${basename(testRepo)}/src`);
  });

  it('all returned specs have Type: tmpfs and Mode: 0o555', () => {
    writeFileSync(join(testRepo, '.claude-sandbox-ignore'), 'secrets\n');
    const mount = resolveMount(testRepo);
    const result = resolveBlockedPaths(mount, null);
    for (const spec of result) {
      expect(spec.Type).toBe('tmpfs');
      expect(spec.TmpfsOptions.Mode).toBe(0o555);
    }
  });
});
