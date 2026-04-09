import Dockerode from 'dockerode';
import { MountValidationError } from '../errors/index.js';

// System directories that must never be mounted (D-06)
const BLOCKED_SYSTEM_PATHS = ['/', '/etc', '/System', '/private', '/var', '/tmp', '/bin', '/usr', '/lib', '/sbin', '/dev', '/proc', '/sys'];

export function validateMounts(hostPaths: string[]): void {
  for (const p of hostPaths) {
    // Block docker.sock (CONT-03) — explicit anti-feature
    if (p.includes('docker.sock')) {
      throw new MountValidationError(
        p,
        'Docker socket mounting is blocked for security.',
        'Remove the docker.sock path and try again. The sandbox cannot access the host Docker daemon.'
      );
    }
    // Block system directories (D-06)
    if (BLOCKED_SYSTEM_PATHS.includes(p) || BLOCKED_SYSTEM_PATHS.some(sys => p.startsWith(sys + '/'))) {
      throw new MountValidationError(
        p,
        `'${p}' is a protected system directory.`,
        'Mount a specific project directory instead.'
      );
    }
  }
}

export function createDockerClient(): Dockerode {
  // Connects to Docker daemon via the default socket (/var/run/docker.sock on host)
  return new Dockerode();
}
