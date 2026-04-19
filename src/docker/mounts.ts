import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { join, basename, resolve, dirname } from 'path';
import { SandboxError } from '../errors/index.js';

export interface MountSpec {
  /** The bind spec string for Dockerode HostConfig.Binds */
  bindSpec: string;
  /** Absolute host path */
  hostPath: string;
  /** Absolute container path */
  containerPath: string;
}

export interface TmpfsSpec {
  Type: 'tmpfs';
  Target: string;
  TmpfsOptions: { Mode: number };
}

/**
 * Resolve a host repo path to a Dockerode bind spec.
 * Path is normalized to absolute (D-01). Container path is /workspace/<basename>.
 * Throws SandboxError if the resolved path does not exist (D-02).
 */
export function resolveMount(hostPathRaw: string): MountSpec {
  // Normalize: resolve relative paths against cwd, strip trailing slashes
  const hostPath = resolve(hostPathRaw);

  if (!existsSync(hostPath)) {
    // D-02: suggest adjacent directories
    const parent = dirname(hostPath);
    const suggestions = existsSync(parent)
      ? readdirSync(parent)
          .filter(name => name.startsWith(basename(hostPath).slice(0, 3)))
          .map(name => join(parent, name))
          .slice(0, 3)
      : [];

    const hint = suggestions.length > 0
      ? `Did you mean one of: ${suggestions.join(', ')}?`
      : `Parent directory '${parent}' does not exist.`;

    throw new SandboxError(
      `Path '${hostPath}' does not exist.`,
      hint
    );
  }

  const name = basename(hostPath);
  const containerPath = `/workspace/${name}`;

  return {
    bindSpec: `${hostPath}:${containerPath}:rw,cached`,
    hostPath,
    containerPath,
  };
}

/**
 * Resolve a host CLAUDE.md path to a Dockerode bind spec.
 * Mount target is /workspace/CLAUDE.md (container working directory — D-01).
 * Read-only mount, consistent with ~/.claude/ pattern (D-02).
 * Throws SandboxError if the source file does not exist.
 */
export function resolveClaudeMdMount(hostPathRaw: string): MountSpec {
  const hostPath = resolve(hostPathRaw);

  if (!existsSync(hostPath)) {
    throw new SandboxError(
      `CLAUDE.md not found at '${hostPath}'.`,
      `Check the path is correct and the file exists.`
    );
  }

  const containerPath = '/workspace/CLAUDE.md';
  return {
    bindSpec: `${hostPath}:${containerPath}:ro`,
    hostPath,
    containerPath,
  };
}

/**
 * Parse the `include:` list from a .claude-sandbox.yml file.
 * Only supports the `include:` key — no external YAML dependency needed.
 */
function parseSandboxYml(content: string): { include: string[] } {
  const include: string[] = [];
  let inInclude = false;
  for (const line of content.split('\n')) {
    if (line.trim() === 'include:') {
      inInclude = true;
      continue;
    }
    if (inInclude) {
      const match = line.match(/^\s+-\s+(.+)$/);
      if (match) {
        include.push(match[1]!.trim());
      } else if (line.trim() !== '' && !/^\s/.test(line)) {
        // New top-level key — stop reading include list
        inInclude = false;
      }
    }
  }
  return { include };
}

/**
 * Read .claude-sandbox.yml from a repo root. Throws SandboxError if the file
 * is missing or contains no 'include:' entries.
 */
export function readSandboxConfig(repoRoot: string): { include: string[] } {
  const configPath = join(repoRoot, '.claude-sandbox.yml');
  if (!existsSync(configPath)) {
    throw new SandboxError(
      `No .claude-sandbox.yml found in '${repoRoot}'.`,
      `Create a .claude-sandbox.yml with an 'include:' list of subdirectories to expose:\n\ninclude:\n  - projects/serviceA\n  - proto`
    );
  }
  const config = parseSandboxYml(readFileSync(configPath, 'utf-8'));
  if (config.include.length === 0) {
    throw new SandboxError(
      `.claude-sandbox.yml in '${repoRoot}' has no 'include:' entries.`,
      `Add at least one subdirectory to the 'include:' list.`
    );
  }
  return config;
}

/**
 * Compute tmpfs mask specs for all subdirectories of a mount that are NOT
 * covered by the whitelist. Walks the host path and masks any directory that
 * is neither an included path nor an ancestor of one.
 *
 * This preserves the full directory tree structure (e.g. Bazel WORKSPACE at
 * root) while hiding everything outside the whitelist.
 */
export function resolveWhitelistMasks(
  mount: MountSpec,
  include: string[]
): TmpfsSpec[] {
  const masks: TmpfsSpec[] = [];

  function walk(dir: string, relPath: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const childRel = relPath ? `${relPath}/${name}` : name;
      const childAbs = join(dir, name);
      let isDir: boolean;
      try {
        isDir = statSync(childAbs).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;

      const isExact = include.some(w => w === childRel);
      const isAncestor = include.some(w => w.startsWith(`${childRel}/`));

      if (isExact) {
        // Whitelisted exactly — keep all contents, stop recursing
      } else if (isAncestor) {
        // Ancestor of a whitelisted path — keep this dir, recurse to mask siblings
        walk(childAbs, childRel);
      } else {
        // Outside the whitelist — mask with tmpfs
        masks.push({
          Type: 'tmpfs' as const,
          Target: join(mount.containerPath, childRel),
          TmpfsOptions: { Mode: 0o555 },
        });
      }
    }
  }

  walk(mount.hostPath, '');
  return masks;
}
