import { describe, it, expect } from 'vitest';
import { validateMounts } from './client.js';
import { MountValidationError } from '../errors/index.js';

describe('validateMounts', () => {
  it('throws MountValidationError for docker.sock', () => {
    expect(() => validateMounts(['/var/run/docker.sock'])).toThrow(MountValidationError);
  });

  it('throws MountValidationError for unix domain docker socket path', () => {
    expect(() => validateMounts(['/Users/me/.docker/run/docker.sock'])).toThrow(MountValidationError);
  });

  it('throws MountValidationError for filesystem root', () => {
    expect(() => validateMounts(['/'])).toThrow(MountValidationError);
  });

  it('throws MountValidationError for /etc', () => {
    expect(() => validateMounts(['/etc'])).toThrow(MountValidationError);
  });

  it('does not throw for a valid project path', () => {
    expect(() => validateMounts(['/Users/lcazzoli/workspace/myrepo'])).not.toThrow();
  });

  it('does not throw for multiple valid paths', () => {
    expect(() => validateMounts(['/Users/me/proj1', '/Users/me/proj2'])).not.toThrow();
  });

  it('throws if any one path in the list is invalid', () => {
    expect(() => validateMounts(['/Users/me/proj1', '/var/run/docker.sock'])).toThrow(MountValidationError);
  });
});
