import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service';
import type { FilesService } from '../files/files.service';
import { LostItemsService } from './lost-items.service';

function selectChain(rows: unknown[], lockable = false) {
  const chain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    for: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  if (lockable) chain.limit.mockReturnValue(chain);
  else chain.limit.mockResolvedValue(rows);
  return chain;
}

describe('LostItemsService detail and compensation', () => {
  it('loads a single public detail with its attachments', async () => {
    const db = {
      select: vi.fn().mockReturnValue(
        selectChain([
          {
            id: 31,
            type: 'lost' as const,
            itemName: '학생증',
            location: '과학관',
            occurredAt: new Date('2026-07-13T00:00:00Z'),
            description: '파란 케이스',
            status: 'open' as const,
            authorName: '작성자',
          },
        ]),
      ),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (value: typeof db) => unknown) => work(db)),
    } as unknown as DatabaseService;
    const files = {
      listForTarget: vi.fn().mockResolvedValue([
        {
          id: 7,
          originalName: 'student-card.png',
          mimeType: 'image/png',
          sizeBytes: 100,
          visibility: 'public',
          url: '/api/files/7/download',
          inlineUrl: '/api/files/7/content',
          uploadedAt: new Date(0).toISOString(),
        },
      ]),
    } as unknown as FilesService;

    const result = await new LostItemsService(database, files).getById(31);

    expect(result.id).toBe(31);
    expect(result.attachments).toHaveLength(1);
  });

  it('uses 404 only when the visible row is absent', async () => {
    const db = { select: vi.fn().mockReturnValue(selectChain([])) };
    const database = {
      query: vi.fn(async (_name: string, work: (value: typeof db) => unknown) => work(db)),
    } as unknown as DatabaseService;
    const files = { listForTarget: vi.fn() } as unknown as FilesService;

    await expect(new LostItemsService(database, files).getById(31)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(files.listForTarget).not.toHaveBeenCalled();
  });

  it('rejects compensation deletion by a different account', async () => {
    const tx = {
      select: vi
        .fn()
        .mockReturnValue(selectChain([{ id: 31, authorId: 200, status: 'open' as const }], true)),
    };
    const db = { transaction: vi.fn((work: (value: typeof tx) => unknown) => work(tx)) };
    const database = {
      query: vi.fn(async (_name: string, work: (value: typeof db) => unknown) => work(db)),
    } as unknown as DatabaseService;
    const files = {
      enqueueForTarget: vi.fn(),
      deleteForTarget: vi.fn(),
    } as unknown as FilesService;

    await expect(new LostItemsService(database, files).discard(31, 100)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(files.enqueueForTarget).not.toHaveBeenCalled();
    expect(files.deleteForTarget).not.toHaveBeenCalled();
  });

  it('commits the owned row deletion before removing uploaded files', async () => {
    const events: string[] = [];
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const auditValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      select: vi
        .fn()
        .mockReturnValue(selectChain([{ id: 31, authorId: 100, status: 'open' as const }], true)),
      delete: vi.fn().mockReturnValue({ where: deleteWhere }),
      insert: vi.fn().mockReturnValue({ values: auditValues }),
    };
    const db = {
      transaction: vi.fn(async (work: (value: typeof tx) => unknown) => {
        const result = await work(tx);
        events.push('commit');
        return result;
      }),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (value: typeof db) => unknown) => work(db)),
    } as unknown as DatabaseService;
    const files = {
      enqueueForTarget: vi.fn(async () => {
        events.push('enqueue');
        return 1;
      }),
      deleteForTarget: vi.fn(async () => {
        events.push('cleanup');
        return { deleted: 1, failed: 0 };
      }),
    } as unknown as FilesService;

    const result = await new LostItemsService(database, files).discard(31, 100);

    expect(files.enqueueForTarget).toHaveBeenCalledWith('lost_item', 31, 'lost_item_discard', tx);
    expect(files.deleteForTarget).toHaveBeenCalledWith('lost_item', 31);
    expect(deleteWhere).toHaveBeenCalledOnce();
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'lost-item.discard', targetId: '31' }),
    );
    expect(events).toEqual(['enqueue', 'commit', 'cleanup']);
    expect(result).toEqual({ ok: true, id: 31, cleanupPending: false });
  });

  it('reports pending cleanup while preserving a failed object reference', async () => {
    const tx = {
      select: vi
        .fn()
        .mockReturnValue(selectChain([{ id: 31, authorId: 100, status: 'open' as const }], true)),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    };
    const db = { transaction: vi.fn((work: (value: typeof tx) => unknown) => work(tx)) };
    const database = {
      query: vi.fn(async (_name: string, work: (value: typeof db) => unknown) => work(db)),
    } as unknown as DatabaseService;
    const files = {
      enqueueForTarget: vi.fn().mockResolvedValue(1),
      deleteForTarget: vi.fn().mockResolvedValue({ deleted: 0, failed: 1 }),
    } as unknown as FilesService;

    await expect(new LostItemsService(database, files).discard(31, 100)).resolves.toEqual({
      ok: true,
      id: 31,
      cleanupPending: true,
    });
  });
});
