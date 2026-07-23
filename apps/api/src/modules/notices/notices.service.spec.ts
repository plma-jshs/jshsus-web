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

describe('NoticesService public author display', () => {
  it('returns the notice display author from department without an account author field', async () => {
    const countQuery = {
      from: vi.fn(),
      where: vi.fn().mockResolvedValue([{ total: 1 }]),
    };
    countQuery.from.mockReturnValue(countQuery);
    const itemsQuery = {
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      offset: vi.fn().mockResolvedValue([
        {
          id: 1,
          title: '방송 안내',
          department: '방송부',
          publishedAt: new Date('2026-07-15T00:00:00.000Z'),
          viewCount: 3,
        },
      ]),
    };
    itemsQuery.from.mockReturnValue(itemsQuery);
    itemsQuery.where.mockReturnValue(itemsQuery);
    itemsQuery.orderBy.mockReturnValue(itemsQuery);
    itemsQuery.limit.mockReturnValue(itemsQuery);
    const db = {
      select: vi.fn().mockReturnValueOnce(countQuery).mockReturnValueOnce(itemsQuery),
    };
    const database = {
      query: vi.fn(async (_label: string, work: (value: typeof db) => unknown) => work(db)),
    } as unknown as DatabaseService;

    const result = await new NoticesService(database, {} as FilesService).listPage({
      page: 1,
      pageSize: 10,
      q: '',
      field: 'title_content',
    });

    expect(result.items).toEqual([
      {
        id: 1,
        publicNumber: 1,
        title: '방송 안내',
        department: '방송부',
        pinned: false,
        publishedAt: '2026-07-15T00:00:00.000Z',
        viewCount: 3,
      },
    ]);
    expect(result.items[0]).not.toHaveProperty('authorName');
  });
});
