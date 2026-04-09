import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join, basename, resolve, dirname } from 'path';
import ignore from 'ignore';
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
 * Returns the bind spec for ~/.claude/ as a read-only mount (MNT-02).
 * Container path is /home/sandbox/.claude — the sandbox user's home directory
 * (Dockerfile sets USER sandbox, HOME=/home/sandbox). Using /root/.claude would
 * cause Claude Code to miss its config because the container does not run as root.
 */
export function resolveClaudeConfigMount(): MountSpec {
  const hostPath = join(homedir(), '.claude');
  const containerPath = '/home/sandbox/.claude';
  return {
    bindSpec: `${hostPath}:${containerPath}:ro`,
    hostPath,
    containerPath,
  };
}

/**
 * Walk up from mountHostPath to monorepoRoot (or fs root if null),
 * collecting .claude-sandbox-ignore files (D-05).
 */
function findIgnoreFiles(mountHostPath: string, monorepoRoot: string | null): string[] {
  const files: string[] = [];
  let dir = mountHostPath;
  while (true) {
    const candidate = join(dir, '.claude-sandbox-ignore');
    if (existsSync(candidate)) files.push(candidate);
    const parent = dirname(dir);
    // Stop at monorepoRoot (if configured) or filesystem root
    if (monorepoRoot !== null && dir === monorepoRoot) break;
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  return files;
}

/**
 * Walk a directory recursively, returning relative paths of all entries.
 */
function walkDir(root: string, prefix = ''): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(root)) {
    const relPath = prefix ? `${prefix}/${name}` : name;
    const abs = join(root, name);
    entries.push(relPath);
    try {
      if (statSync(abs).isDirectory()) {
        entries.push(...walkDir(abs, relPath));
      }
    } catch {
      // Skip unreadable entries
    }
  }
  return entries;
}

/**
 * Resolve blocked subpaths from .claude-sandbox-ignore files into tmpfs mount specs (D-03, D-04, D-05).
 * Returns an array of TmpfsSpec objects for Dockerode HostConfig.Mounts.
 */
export function resolveBlockedPaths(
  mount: MountSpec,
  monorepoRoot: string | null
): TmpfsSpec[] {
  const ignoreFiles = findIgnoreFiles(mount.hostPath, monorepoRoot);
  if (ignoreFiles.length === 0) return [];

  const ig = ignore();
  for (const filePath of ignoreFiles) {
    ig.add(readFileSync(filePath, 'utf-8'));
  }

  // Find all subdirectories under the mount that match the ignore rules
  const allRelPaths = walkDir(mount.hostPath);
  const blocked = allRelPaths.filter(relPath => {
    try {
      return (
        ig.ignores(relPath) &&
        statSync(join(mount.hostPath, relPath)).isDirectory()
      );
    } catch {
      return false;
    }
  });

  return blocked.map(relPath => ({
    Type: 'tmpfs' as const,
    Target: join(mount.containerPath, relPath),
    TmpfsOptions: { Mode: 0o555 },
  }));
}
