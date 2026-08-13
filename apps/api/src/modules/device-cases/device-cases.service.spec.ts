import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service';
import { DeviceCasesService } from './device-cases.service';

describe('DeviceCasesService remote listing', () => {
  it('does not turn a GET list into heartbeat database updates', async () => {
    const rows = [{ id: 1, isOpen: false, lastSeenAt: new Date('2026-08-13T00:00:00.000Z') }];
    const select = {
      from: vi.fn(),
      orderBy: vi.fn().mockResolvedValue(rows),
    };
    select.from.mockReturnValue(select);
    const defaultCasesQuery = {
      from: vi.fn(),
      where: vi
        .fn()
        .mockResolvedValue(Array.from({ length: 24 }, (_, index) => ({ id: index + 1 }))),
    };
    defaultCasesQuery.from.mockReturnValue(defaultCasesQuery);
    const db = {
      select: vi.fn().mockReturnValue(select),
      update: vi.fn(),
    };
    const database = {
      db: {
        ...db,
        select: vi.fn().mockReturnValue(defaultCasesQuery),
        insert: vi.fn(),
      },
      query: vi.fn(async (_name: string, work: (value: typeof db) => unknown) => work(db)),
    } as unknown as DatabaseService;
    const service = new DeviceCasesService(database);

    await expect(service.remoteCases()).resolves.toEqual([
      expect.objectContaining({ id: 1, status: 0 }),
    ]);
    expect(db.update).not.toHaveBeenCalled();
    expect(database.db.insert).not.toHaveBeenCalled();
  });
});
