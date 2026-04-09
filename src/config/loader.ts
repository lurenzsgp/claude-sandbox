import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { DEFAULT_CONFIG, type Config } from './schema.js';
import { ConfigError } from '../errors/index.js';

export const CONFIG_DIR = join(homedir(), '.claude-sandbox');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Config>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (e: unknown) {
    throw new ConfigError(`Failed to parse config.json: ${(e as Error).message}`);
  }
}
