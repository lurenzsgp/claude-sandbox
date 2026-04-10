import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { CONFIG_DIR } from '../config/loader.js';
import type Dockerode from 'dockerode';

export const STATE_PATH = join(CONFIG_DIR, 'state.json');

export type ContainerStatus = 'running' | 'stopped' | 'not_found';

export interface SandboxState {
  version: '1';
  containerId: string;
  status: ContainerStatus;
  /** Absolute host paths of mounted repos */
  mounts: string[];
  /** Resolved absolute path to project CLAUDE.md, or null if not mounted (D-05) */
  claudeMd?: string | null;
  createdAt: string;
  lastStartedAt: string;
}

export function readState(): SandboxState | null {
  if (!existsSync(STATE_PATH)) return null;
  try {
    const raw = readFileSync(STATE_PATH, 'utf-8');
    return JSON.parse(raw) as SandboxState;
  } catch {
    return null;
  }
}

export function writeState(state: SandboxState): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), { encoding: 'utf-8' });
}

export async function reconcileState(
  state: SandboxState,
  docker: Dockerode
): Promise<SandboxState> {
  try {
    const container = docker.getContainer(state.containerId);
    const info = await container.inspect();
    const dockerStatus: ContainerStatus = info.State.Running ? 'running' : 'stopped';
    const updated = { ...state, status: dockerStatus };
    if (state.status !== dockerStatus) {
      writeState(updated);
    }
    return updated;
  } catch (e: unknown) {
    const err = e as { statusCode?: number };
    if (err.statusCode === 404) {
      const updated = { ...state, status: 'not_found' as ContainerStatus };
      writeState(updated);
      return updated;
    }
    throw e;
  }
}
