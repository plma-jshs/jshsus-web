import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service';
import { NotificationsService } from './notifications.service';

function createInsertDatabase(id = 41) {
  const returningId = vi.fn().mockResolvedValue([{ id }]);
  const values = vi.fn().mockReturnValue({ $returningId: returningId });
  const insert = vi.fn().mockReturnValue({ values });
  const database = {
    db: { insert },
    query: vi.fn(),
  } as unknown as DatabaseService;
  return { database, insert, values, returningId };
}

describe('NotificationsService', () => {
  it('creates a user-scoped, seven-day notification with an optional link', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-17T03:00:00.000Z'));
    try {
      const { database, values } = createInsertDatabase();
      const service = new NotificationsService(database);

      await expect(
        service.createForUser({
          userId: 12,
          type: 'point_awarded',
          title: '새로운 상점(+3점)이 부여되었습니다.',
          body: '사유: 급식실 질서 지도',
          link: null,
          dedupeKey: 'point-record:41',
        }),
      ).resolves.toMatchObject({
        id: 41,
        isRead: false,
        expiresAt: '2026-07-24T03:00:00.000Z',
      });
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 12,
          dedupeKey: '12:point-record:41',
          link: null,
          expiresAt: new Date('2026-07-24T03:00:00.000Z'),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns the existing notification when a dedupe retry races', async () => {
    const duplicate = Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
    const values = vi.fn().mockReturnValue({
      $returningId: vi.fn().mockRejectedValue(duplicate),
    });
    const row = {
      id: 8,
      type: 'activity_request_approved',
      title: '탐구활동서가 승인되었습니다.',
      body: null,
      link: '/activity-requests/7',
      metadata: null,
      readAt: null,
      createdAt: new Date('2026-07-17T03:00:00.000Z'),
      expiresAt: new Date('2026-07-24T03:00:00.000Z'),
    };
    const limit = vi.fn().mockResolvedValue([row]);
    const database = {
      db: {
        insert: vi.fn().mockReturnValue({ values }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ limit }),
          }),
        }),
      },
      query: vi.fn(),
    } as unknown as DatabaseService;
    const service = new NotificationsService(database);

    await expect(
      service.createForUser({
        userId: 12,
        type: 'activity_request_approved',
        title: row.title,
        dedupeKey: 'activity-request:7:approved',
      }),
    ).resolves.toMatchObject({ id: 8, isRead: false });
    expect(limit).toHaveBeenCalledWith(1);
  });

  it('lists at most 30 active notifications and reports all unread items', async () => {
    const rows = [
      {
        id: 2,
        type: 'point_awarded',
        title: '새로운 벌점(-1점)이 부여되었습니다.',
        body: '사유: 지각',
        link: '/points',
        metadata: { point: -1 },
        readAt: null,
        createdAt: new Date('2026-07-17T03:00:00.000Z'),
        expiresAt: new Date('2026-07-24T03:00:00.000Z'),
      },
    ];
    const limit = vi.fn().mockResolvedValue(rows);
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({ limit }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 4 }]),
        }),
      });
    const db = { select };
    const database = {
      db,
      query: vi.fn((_label: string, operation: (value: typeof db) => unknown) => operation(db)),
    } as unknown as DatabaseService;
    const service = new NotificationsService(database);

    await expect(service.listForUser(12)).resolves.toMatchObject({
      unreadCount: 4,
      items: [{ id: 2, isRead: false, metadata: { point: -1 } }],
    });
    expect(limit).toHaveBeenCalledWith(30);
  });

  it('does not expose another user or an expired notification as readable', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      update: vi.fn(),
    };
    const database = {
      db,
      query: vi.fn((_label: string, operation: (value: typeof db) => unknown) => operation(db)),
    } as unknown as DatabaseService;
    const service = new NotificationsService(database);

    await expect(service.markRead(7, 12)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('requires an authenticated recipient for member operations', async () => {
    const { database } = createInsertDatabase();
    const service = new NotificationsService(database);

    await expect(service.listForUser()).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.markAllRead(0)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
