export class SandboxError extends Error {
  constructor(message: string, public readonly fix?: string) {
    super(message);
    this.name = 'SandboxError';
  }
}

export class MountValidationError extends SandboxError {
  constructor(path: string, reason: string, fix?: string) {
    super(`Mount validation failed for '${path}': ${reason}`, fix);
    this.name = 'MountValidationError';
  }
}

export class ContainerNotFoundError extends SandboxError {
  constructor(containerId: string) {
    super(
      `Container '${containerId}' not found — it may have been deleted outside of claude-sandbox.`,
      'Run `claude-sandbox start` to create a new container.'
    );
    this.name = 'ContainerNotFoundError';
  }
}

export class ConfigError extends SandboxError {
  constructor(message: string) {
    super(`Configuration error: ${message}`, 'Check ~/.claude-sandbox/config.json for syntax errors.');
    this.name = 'ConfigError';
  }
}
