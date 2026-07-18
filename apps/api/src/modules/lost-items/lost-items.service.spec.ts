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
    orderBy: vi.fn(),
    for: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
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
            authorId: 100,
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

    const result = await new LostItemsService(database, files).getById(31, 100);

    expect(result.id).toBe(31);
    expect(result.attachments).toHaveLength(1);
    expect(result.status).toBe('PROCESSING');
    expect(result.canEdit).toBe(true);
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

  it('maps every legacy storage status to one of the two public states', async () => {
    const storedStatuses = ['open', 'matched', 'closed', 'hidden'] as const;
    const rows = storedStatuses.map((status, index) => ({
      id: index + 1,
      type: 'lost' as const,
      itemName: `물품 ${index + 1}`,
      location: null,
      occurredAt: null,
      description: null,
      status,
      authorId: 100,
      authorName: '작성자',
    }));
    const db = { select: vi.fn().mockReturnValue(selectChain(rows)) };
    const database = {
      query: vi.fn(async (_name: string, work: (value: typeof db) => unknown) => work(db)),
    } as unknown as DatabaseService;
    const files = {
      listForTargets: vi.fn().mockResolvedValue(new Map()),
    } as unknown as FilesService;

    const result = await new LostItemsService(database, files).list(10, true);

    expect(result.map((item) => item.status)).toEqual([
      'PROCESSING',
      'PROCESSING',
      'RETURNED',
      'RETURNED',
    ]);
  });

  it('rejects a status change by a different account', async () => {
    const update = vi.fn();
    const db = {
      select: vi.fn().mockReturnValue(selectChain([{ authorId: 200 }])),
      update,
    };
    const database = {
      query: vi.fn(async (_name: string, work: (value: typeof db) => unknown) => work(db)),
      writeAudit: vi.fn(),
    } as unknown as DatabaseService;
    const files = {} as FilesService;

    await expect(
      new LostItemsService(database, files).updateStatus(31, { status: 'RETURNED' }, 100),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
    expect(database.writeAudit).not.toHaveBeenCalled();
  });

  it('stores a returned owner status using the legacy closed value', async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where: updateWhere });
    const db = {
      select: vi.fn().mockReturnValue(selectChain([{ authorId: 100 }])),
      update: vi.fn().mockReturnValue({ set }),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (value: typeof db) => unknown) => work(db)),
      writeAudit: vi.fn().mockResolvedValue(undefined),
    } as unknown as DatabaseService;
    const files = {} as FilesService;

    const result = await new LostItemsService(database, files).updateStatus(
      31,
      { status: 'RETURNED' },
      100,
    );

    expect(set).toHaveBeenCalledWith({
      status: 'closed',
      updatedAt: expect.any(Date),
    });
    expect(updateWhere).toHaveBeenCalledOnce();
    expect(database.writeAudit).toHaveBeenCalledWith({
      actorId: 100,
      action: 'lost-item.status',
      targetType: 'lost_items',
      targetId: 31,
    });
    expect(result).toEqual({ ok: true, id: 31, status: 'RETURNED' });
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
        .mockReturnValue(selectChain([{ id: 31, authorId: 100, status: 'closed' as const }], true)),
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
      expect.objectContaining({ action: 'lost-item.delete', targetId: '31' }),
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
