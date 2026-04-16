import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import { resolveMount, resolveClaudeConfigMount, readSandboxConfig, resolveWhitelistMasks, resolveClaudeMdMount } from './mounts.js';
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

describe('readSandboxConfig', () => {
  let testRepo: string;

  beforeEach(() => {
    testRepo = join(tmpdir(), `sandbox-repo-${Date.now()}`);
    mkdirSync(testRepo, { recursive: true });
  });

  afterEach(() => {
    rmSync(testRepo, { recursive: true, force: true });
  });

  it('throws SandboxError when .claude-sandbox.yml is missing', () => {
    expect(() => readSandboxConfig(testRepo)).toThrow(SandboxError);
  });

  it('thrown error mentions .claude-sandbox.yml', () => {
    let caught: SandboxError | undefined;
    try { readSandboxConfig(testRepo); } catch (e) { caught = e as SandboxError; }
    expect(caught?.message).toContain('.claude-sandbox.yml');
  });

  it('throws SandboxError when include list is empty', () => {
    writeFileSync(join(testRepo, '.claude-sandbox.yml'), 'include:\n');
    expect(() => readSandboxConfig(testRepo)).toThrow(SandboxError);
  });

  it('parses a valid include list', () => {
    writeFileSync(join(testRepo, '.claude-sandbox.yml'), 'include:\n  - projects/serviceA\n  - proto\n');
    const config = readSandboxConfig(testRepo);
    expect(config.include).toEqual(['projects/serviceA', 'proto']);
  });

  it('stops reading include list at the next top-level key', () => {
    writeFileSync(join(testRepo, '.claude-sandbox.yml'), 'include:\n  - src\nother: value\n');
    const config = readSandboxConfig(testRepo);
    expect(config.include).toEqual(['src']);
  });
});

describe('resolveWhitelistMasks', () => {
  let testRepo: string;

  beforeEach(() => {
    testRepo = join(tmpdir(), `sandbox-repo-${Date.now()}`);
    // Structure: src/ (whitelisted), secrets/ (masked), node_modules/ (masked)
    mkdirSync(join(testRepo, 'src'), { recursive: true });
    mkdirSync(join(testRepo, 'secrets'), { recursive: true });
    mkdirSync(join(testRepo, 'node_modules'), { recursive: true });
  });

  afterEach(() => {
    rmSync(testRepo, { recursive: true, force: true });
  });

  it('masks directories not in the whitelist', () => {
    const mount = resolveMount(testRepo);
    const result = resolveWhitelistMasks(mount, ['src']);
    const targets = result.map(s => s.Target);
    expect(targets).toContain(`/workspace/${basename(testRepo)}/secrets`);
    expect(targets).toContain(`/workspace/${basename(testRepo)}/node_modules`);
    expect(targets).not.toContain(`/workspace/${basename(testRepo)}/src`);
  });

  it('returns empty array when all top-level dirs are whitelisted', () => {
    const mount = resolveMount(testRepo);
    const result = resolveWhitelistMasks(mount, ['src', 'secrets', 'node_modules']);
    expect(result).toHaveLength(0);
  });

  it('masks sibling directories while preserving ancestor paths', () => {
    mkdirSync(join(testRepo, 'projects', 'serviceA'), { recursive: true });
    mkdirSync(join(testRepo, 'projects', 'serviceB'), { recursive: true });
    const mount = resolveMount(testRepo);
    const result = resolveWhitelistMasks(mount, ['projects/serviceA']);
    const targets = result.map(s => s.Target);
    // serviceB should be masked
    expect(targets).toContain(`/workspace/${basename(testRepo)}/projects/serviceB`);
    // projects/ itself should NOT be masked (it's an ancestor)
    expect(targets).not.toContain(`/workspace/${basename(testRepo)}/projects`);
    // serviceA should NOT be masked
    expect(targets).not.toContain(`/workspace/${basename(testRepo)}/projects/serviceA`);
  });

  it('all returned specs have Type: tmpfs and Mode: 0o555', () => {
    const mount = resolveMount(testRepo);
    const result = resolveWhitelistMasks(mount, ['src']);
    for (const spec of result) {
      expect(spec.Type).toBe('tmpfs');
      expect(spec.TmpfsOptions.Mode).toBe(0o555);
    }
  });
});

describe('resolveClaudeMdMount', () => {
  let testFile: string;

  beforeEach(() => {
    testFile = join(tmpdir(), `claude-md-test-${Date.now()}.md`);
    writeFileSync(testFile, '# Test CLAUDE.md\n');
  });

  afterEach(() => {
    rmSync(testFile, { force: true });
  });

  it('returns a ro bind spec targeting /workspace/CLAUDE.md', () => {
    const result = resolveClaudeMdMount(testFile);
    expect(result.bindSpec).toBe(`${testFile}:/workspace/CLAUDE.md:ro`);
    expect(result.containerPath).toBe('/workspace/CLAUDE.md');
    expect(result.hostPath).toBe(testFile);
  });

  it('resolves relative paths to absolute', () => {
    // process.cwd() based relative path — use tmpdir absolute path as baseline
    const result = resolveClaudeMdMount(testFile);
    expect(result.hostPath).toMatch(/^\//);
  });

  it('throws SandboxError when file does not exist', () => {
    expect(() => resolveClaudeMdMount('/nonexistent/path/CLAUDE.md')).toThrow(SandboxError);
  });

  it('thrown SandboxError message contains "CLAUDE.md not found"', () => {
    let caught: SandboxError | undefined;
    try { resolveClaudeMdMount('/nonexistent/CLAUDE.md'); } catch (e) { caught = e as SandboxError; }
    expect(caught?.message).toContain('CLAUDE.md not found');
  });
});
