import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CONFIG_DIR } from '../config/loader.js';
import { SandboxError } from '../errors/index.js';

const CONTAINER_SECRET_PATH = '/run/secrets/anthropic-api-key';

// Stable path — no timestamp. The file persists while the container exists so
// Docker can re-mount it on stop/start cycles. It is overwritten on each `start`
// with the current key value.
const KEY_FILE = 'api-key';

export interface SecretMount {
  /** Bind spec string for Dockerode HostConfig.Binds */
  bindSpec: string;
  /** Delete the key file — call only when the container is being permanently removed */
  cleanup: () => void;
}

export function injectApiKey(): SecretMount | null {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    // Pro/Max users authenticate via OAuth credentials in ~/.claude/ (already mounted).
    // API key is only required for API-tier access.
    return null;
  }

  mkdirSync(CONFIG_DIR, { recursive: true });
  const keyPath = join(CONFIG_DIR, KEY_FILE);
  writeFileSync(keyPath, apiKey, { mode: 0o600, encoding: 'utf-8' });

  const cleanup = () => {
    try {
      if (existsSync(keyPath)) unlinkSync(keyPath);
    } catch {
      // Best-effort cleanup — do not throw on cleanup failure
    }
  };

  return {
    bindSpec: `${keyPath}:${CONTAINER_SECRET_PATH}:ro`,
    cleanup,
  };
}
