import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service';
import { ReportsService } from './reports.service';

function createService(returning: Promise<Array<{ id: number }>>) {
  const insert = {
    values: vi.fn(),
    $returningId: vi.fn().mockReturnValue(returning),
  };
  insert.values.mockReturnValue(insert);
  const database = {
    db: { insert: vi.fn().mockReturnValue(insert) },
    writeAudit: vi.fn().mockResolvedValue(undefined),
  } as unknown as DatabaseService;
  return { database, insert, service: new ReportsService(database) };
}

describe('ReportsService report deduplication', () => {
  it('stores an authenticated reporter-scoped dedupe key', async () => {
    const { database, insert, service } = createService(Promise.resolve([{ id: 31 }]));

    await expect(
      service.create({ targetType: 'post', targetId: 7, reason: '부적절한 게시글' }, 12),
    ).resolves.toMatchObject({ ok: true, report: { id: 31 } });
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: 'post',
        targetId: 7,
        reporterId: 12,
        dedupeKey: 'post:7:12',
      }),
    );
    expect(database.writeAudit).toHaveBeenCalledOnce();
  });

  it('returns a conflict when the unique dedupe key already exists', async () => {
    const duplicate = Object.assign(new Error('Duplicate entry'), {
      code: 'ER_DUP_ENTRY',
      errno: 1062,
    });
    const { database, service } = createService(Promise.reject(duplicate));

    await expect(
      service.create({ targetType: 'comment', targetId: 9, reason: '부적절한 댓글' }, 12),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(database.writeAudit).not.toHaveBeenCalled();
  });

  it('never creates anonymous reports through the service', async () => {
    const { database, service } = createService(Promise.resolve([{ id: 31 }]));

    await expect(
      service.create({ targetType: 'post', targetId: 7, reason: '부적절한 게시글' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(database.db.insert).not.toHaveBeenCalled();
  });
});
