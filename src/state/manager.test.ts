import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readState, writeState, reconcileState, type SandboxState } from './manager.js';
import { existsSync, unlinkSync } from 'fs';
import { STATE_PATH } from './manager.js';

const SAMPLE_STATE: SandboxState = {
  version: '1',
  containerId: 'abc123',
  status: 'running',
  mounts: ['/tmp/repo1'],
  createdAt: '2026-04-09T10:00:00.000Z',
  lastStartedAt: '2026-04-09T10:00:00.000Z',
};

describe('readState', () => {
  it('returns null when state.json does not exist', () => {
    // Remove state file if it exists
    try { unlinkSync(STATE_PATH); } catch { /* ok */ }
    expect(readState()).toBeNull();
  });
});

describe('reconcileState', () => {
  it('sets status to not_found when Docker returns 404', async () => {
    const mockDocker = {
      getContainer: () => ({
        inspect: async () => { const e: any = new Error('Not found'); e.statusCode = 404; throw e; }
      })
    } as any;
    const result = await reconcileState({ ...SAMPLE_STATE, status: 'running' }, mockDocker);
    expect(result.status).toBe('not_found');
  });

  it('updates status from running to stopped based on Docker state', async () => {
    const mockDocker = {
      getContainer: () => ({
        inspect: async () => ({ State: { Running: false } })
      })
    } as any;
    const result = await reconcileState({ ...SAMPLE_STATE, status: 'running' }, mockDocker);
    expect(result.status).toBe('stopped');
  });
});
