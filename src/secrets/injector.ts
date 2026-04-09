import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CONFIG_DIR } from '../config/loader.js';
import { SandboxError } from '../errors/index.js';

const CONTAINER_SECRET_PATH = '/run/secrets/anthropic-api-key';

export interface SecretMount {
  /** Bind spec string for Dockerode HostConfig.Binds */
  bindSpec: string;
  /** Call in finally block to delete the temp file */
  cleanup: () => void;
}

export function injectApiKey(): SecretMount {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new SandboxError(
      'ANTHROPIC_API_KEY is not set in your environment.',
      'Set it with: export ANTHROPIC_API_KEY=sk-ant-...'
    );
  }

  mkdirSync(CONFIG_DIR, { recursive: true });
  const tempPath = join(CONFIG_DIR, `tmp-key-${Date.now()}`);
  writeFileSync(tempPath, apiKey, { mode: 0o600, encoding: 'utf-8' });

  const cleanup = () => {
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup — do not throw on cleanup failure
    }
  };

  return {
    bindSpec: `${tempPath}:${CONTAINER_SECRET_PATH}:ro`,
    cleanup,
  };
}
