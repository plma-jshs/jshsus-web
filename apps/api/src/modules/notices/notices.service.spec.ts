import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service';
import type { FilesService } from '../files/files.service';
import { NoticesService } from './notices.service';

describe('NoticesService delete cleanup outbox', () => {
  it('commits cleanup intent, parent deletion, and audit before object cleanup', async () => {
    const events: string[] = [];
    const select = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
      for: vi.fn().mockResolvedValue([{ id: 51 }]),
    };
    select.from.mockReturnValue(select);
    select.where.mockReturnValue(select);
    select.limit.mockReturnValue(select);
    const tx = {
      select: vi.fn().mockReturnValue(select),
      delete: vi.fn().mockReturnValue({
        where: vi.fn(async () => {
          events.push('parent-delete');
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn(async () => {
          events.push('audit');
        }),
      }),
    };
    const db = {
      transaction: vi.fn(async (work: (value: typeof tx) => unknown) => {
        const result = await work(tx);
        events.push('commit');
        return result;
      }),
    };
    const database = {
      query: vi.fn(async (_label: string, work: (value: typeof db) => unknown) => work(db)),
    } as unknown as DatabaseService;
    const files = {
      enqueueForTarget: vi.fn(async () => {
        events.push('enqueue');
        return 2;
      }),
      deleteForTarget: vi.fn(async () => {
        events.push('cleanup');
        return { deleted: 1, failed: 1 };
      }),
    } as unknown as FilesService;

    await expect(new NoticesService(database, files).delete(51, 7)).resolves.toEqual({
      ok: true,
      id: 51,
      cleanupPending: true,
    });
    expect(files.enqueueForTarget).toHaveBeenCalledWith('notice', 51, 'notice_delete', tx);
    expect(files.deleteForTarget).toHaveBeenCalledWith('notice', 51);
    expect(events).toEqual(['enqueue', 'parent-delete', 'audit', 'commit', 'cleanup']);
  });
});
