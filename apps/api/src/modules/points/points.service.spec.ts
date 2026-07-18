import { ConflictException } from '@nestjs/common';
import { MySqlDialect } from 'drizzle-orm/mysql-core';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service';
import type { NotificationsService } from '../notifications/notifications.service';
import {
  calculateCurrentPointCategoryBalances,
  SYSTEM_MERIT_HALF_REASON,
  SYSTEM_PENALTY_HALF_REASON,
} from './point-lifecycle.policy';
import {
  PointsService,
  studentMeritPointSql,
  studentPenaltyPointSql,
  studentSearchRankSql,
} from './points.service';

function limitedSelect(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function lockingSelect(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    for: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

function whereSelect(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  return chain;
}

function updateChain() {
  const chain = {
    set: vi.fn(),
    where: vi.fn().mockResolvedValue(undefined),
  };
  chain.set.mockReturnValue(chain);
  return chain;
}

function returningInsertChain(id: number) {
  const chain = {
    values: vi.fn(),
    $returningId: vi.fn().mockResolvedValue([{ id }]),
  };
  chain.values.mockReturnValue(chain);
  return chain;
}

function notificationService() {
  return {
    createForUser: vi.fn().mockResolvedValue({ id: 1 }),
  } as unknown as NotificationsService;
}

function transactionDatabase(transactionDb: object): DatabaseService {
  const operationDb = {
    transaction: vi.fn(async (work: (value: object) => unknown) => work(transactionDb)),
  };
  return {
    query: vi.fn(async (_name: string, work: (value: typeof operationDb) => unknown) =>
      work(operationDb),
    ),
  } as unknown as DatabaseService;
}

describe('PointsService lifecycle composition', () => {
  it('qualifies the correlated student id in category balance subqueries', () => {
    const dialect = new MySqlDialect();
    const meritQuery = dialect.sqlToQuery(studentMeritPointSql()).sql;
    const penaltyQuery = dialect.sqlToQuery(studentPenaltyPointSql()).sql;

    expect(meritQuery).toContain('pr.student_id = students.id');
    expect(penaltyQuery).toContain('pr.student_id = students.id');
    expect(meritQuery).not.toMatch(/pr\.student_id = `?id`?/);
    expect(penaltyQuery).not.toMatch(/pr\.student_id = `?id`?/);
  });

  it('ranks exact and prefix student numbers ahead of substring matches', () => {
    const dialect = new MySqlDialect();
    const query = dialect.sqlToQuery(studentSearchRankSql('12'));

    expect(query.sql).toContain('case');
    expect(query.sql).toContain('cast(`students`.`student_no` as char) = ?');
    expect(query.sql).toContain('cast(`students`.`student_no` as char) like ?');
    expect(query.params).toEqual(['12', '12%', '12', '12%']);
  });

  it('creates the student notification in the same transaction as a point record', async () => {
    const recordInsert = returningInsertChain(31);
    const auditInsert = { values: vi.fn().mockResolvedValue(undefined) };
    const transactionDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(limitedSelect([{ type: 'PLUS', isActive: true }]))
        .mockReturnValueOnce(limitedSelect([{ id: 9, userId: 120 }])),
      insert: vi.fn().mockReturnValueOnce(recordInsert).mockReturnValueOnce(auditInsert),
      update: vi.fn().mockReturnValue(updateChain()),
    };
    const notifications = notificationService();
    const service = new PointsService(transactionDatabase(transactionDb), notifications);

    await service.createRecord(
      {
        studentId: 9,
        reasonId: 4,
        point: 3,
        reasonText: '급식실 질서 지도',
        baseDate: '2026-07-17',
      },
      7,
    );

    expect(notifications.createForUser).toHaveBeenCalledWith(
      {
        userId: 120,
        type: 'point_awarded',
        title: '새로운 상점(+3점)이 부여되었습니다.',
        body: '사유: 급식실 질서 지도',
        link: '/points',
        metadata: { recordId: 31, point: 3, reasonType: 'PLUS' },
        dedupeKey: 'point-record:31:awarded',
      },
      transactionDb,
    );
  });

  it('skips a point notification when the student has no linked user account', async () => {
    const recordInsert = returningInsertChain(32);
    const auditInsert = { values: vi.fn().mockResolvedValue(undefined) };
    const transactionDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(limitedSelect([{ type: 'ETC', isActive: true }]))
        .mockReturnValueOnce(limitedSelect([{ id: 9, userId: null }])),
      insert: vi.fn().mockReturnValueOnce(recordInsert).mockReturnValueOnce(auditInsert),
      update: vi.fn().mockReturnValue(updateChain()),
    };
    const notifications = notificationService();
    const service = new PointsService(transactionDatabase(transactionDb), notifications);

    await service.createRecord(
      {
        studentId: 9,
        reasonId: 4,
        point: 0,
        reasonText: '시스템 조정',
        baseDate: '2026-07-17',
      },
      7,
    );

    expect(notifications.createForUser).not.toHaveBeenCalled();
  });

  it('creates one notification for each newly inserted batch point record', async () => {
    const recordInsert = returningInsertChain(44);
    const auditInsert = { values: vi.fn().mockResolvedValue(undefined) };
    const transactionDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(limitedSelect([]))
        .mockReturnValueOnce(whereSelect([{ id: 4, type: 'MINUS', isActive: true }]))
        .mockReturnValueOnce(whereSelect([{ id: 9, userId: 120 }])),
      insert: vi.fn().mockReturnValueOnce(recordInsert).mockReturnValueOnce(auditInsert),
      update: vi.fn().mockReturnValue(updateChain()),
    };
    const notifications = notificationService();
    const service = new PointsService(transactionDatabase(transactionDb), notifications);

    await service.createRecordBatch(
      {
        idempotencyKey: 'batch:20260717:1',
        records: [
          {
            studentId: 9,
            reasonId: 4,
            point: -1,
            reasonText: '지각',
            baseDate: '2026-07-17',
          },
        ],
      },
      7,
    );

    expect(notifications.createForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 120,
        type: 'point_awarded',
        title: '새로운 벌점(-1점)이 부여되었습니다.',
        body: '사유: 지각',
        dedupeKey: 'point-record:44:awarded',
      }),
      transactionDb,
    );
  });

  it('does not create a batch notification when the idempotency key is replayed', async () => {
    const transactionDb = {
      select: vi.fn().mockReturnValue(limitedSelect([{ id: 91 }])),
    };
    const notifications = notificationService();
    const service = new PointsService(transactionDatabase(transactionDb), notifications);

    await expect(
      service.createRecordBatch(
        {
          idempotencyKey: 'batch:20260717:replay',
          records: [
            {
              studentId: 9,
              reasonId: 4,
              point: 3,
              reasonText: '급식실 질서 지도',
              baseDate: '2026-07-17',
            },
          ],
        },
        7,
      ),
    ).resolves.toEqual({ ok: true, replayed: true, recordIds: [] });
    expect(notifications.createForUser).not.toHaveBeenCalled();
  });

  it('excludes a completed departure student from a later semester half operation', async () => {
    const inserted: unknown[] = [];
    const insertValues = vi.fn((value: unknown) => {
      inserted.push(value);
      return {
        onDuplicateKeyUpdate: vi.fn().mockResolvedValue(undefined),
      };
    });
    const transactionDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(limitedSelect([]))
        .mockReturnValueOnce(limitedSelect([{ id: 900 }]))
        .mockReturnValueOnce(whereSelect([{ studentId: 1 }]))
        .mockReturnValueOnce(
          whereSelect([
            { studentId: 1, type: 'PLUS', reason: '상점', point: 10 },
            { studentId: 1, type: 'MINUS', reason: '벌점', point: -30 },
            { studentId: 2, type: 'PLUS', reason: '상점', point: 5 },
            { studentId: 2, type: 'MINUS', reason: '벌점', point: -5 },
          ]),
        )
        .mockReturnValueOnce(limitedSelect([{ id: 11 }]))
        .mockReturnValueOnce(limitedSelect([{ id: 12 }])),
      insert: vi.fn().mockReturnValue({ values: insertValues }),
      update: vi.fn().mockReturnValue(updateChain()),
    };
    const service = new PointsService(transactionDatabase(transactionDb), notificationService());

    const result = await service.applySemesterHalf(
      { schoolYear: 2026, semester: 2, baseDate: '2026-08-20' },
      7,
    );

    const recordValues = inserted.filter(
      (value): value is { studentId: number; point: number; reasonId: number } =>
        typeof value === 'object' && value !== null && 'studentId' in value,
    );
    expect(recordValues).toEqual([
      expect.objectContaining({ studentId: 2, point: -3, reasonId: 11 }),
      expect.objectContaining({ studentId: 2, point: 3, reasonId: 12 }),
    ]);
    expect(recordValues.some((value) => value.studentId === 1)).toBe(false);
    expect(result).toMatchObject({ adjustedStudentCount: 1, recordCount: 2 });
  });

  it('rejects canceling a system adjustment before mutating the ledger projection', async () => {
    const transactionDb = {
      select: vi.fn().mockReturnValue(
        lockingSelect([
          {
            studentId: 1,
            point: -3,
            canceledAt: null,
            teacherStudentNo: -900_001,
            reason: SYSTEM_MERIT_HALF_REASON,
          },
        ]),
      ),
      update: vi.fn(),
      insert: vi.fn(),
    };
    const service = new PointsService(transactionDatabase(transactionDb), notificationService());

    await expect(service.cancelRecord(31, { reason: '개별 취소 시도' }, 7)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transactionDb.update).not.toHaveBeenCalled();
    expect(transactionDb.insert).not.toHaveBeenCalled();
  });

  it('allows changing a used reason because records keep their own snapshots', async () => {
    const update = updateChain();
    const auditValues = vi.fn().mockResolvedValue(undefined);
    const transactionDb = {
      select: vi
        .fn()
        .mockReturnValue(
          lockingSelect([
            { id: 4, type: 'PLUS', point: 5, comment: '생활관 정리 우수', isActive: true },
          ]),
        ),
      update: vi.fn().mockReturnValue(update),
      insert: vi.fn().mockReturnValue({ values: auditValues }),
    };
    const service = new PointsService(transactionDatabase(transactionDb), notificationService());

    await expect(service.updateReason(4, { type: 'MINUS', point: -5 }, 7)).resolves.toEqual({
      ok: true,
      id: 4,
    });
    expect(update.set).toHaveBeenCalledWith({ type: 'MINUS', point: -5 });
  });

  it('still allows changing the label and active state of a used human reason', async () => {
    const update = updateChain();
    const auditValues = vi.fn().mockResolvedValue(undefined);
    const transactionDb = {
      select: vi
        .fn()
        .mockReturnValue(
          lockingSelect([
            { id: 4, type: 'PLUS', point: 5, comment: '생활관 정리 우수', isActive: true },
          ]),
        ),
      update: vi.fn().mockReturnValue(update),
      insert: vi.fn().mockReturnValue({ values: auditValues }),
    };
    const service = new PointsService(transactionDatabase(transactionDb), notificationService());

    await expect(
      service.updateReason(4, { comment: '생활관 정리 및 봉사 우수', isActive: false }, 7),
    ).resolves.toEqual({ ok: true, id: 4 });
    expect(update.set).toHaveBeenCalledWith({
      comment: '생활관 정리 및 봉사 우수',
      isActive: false,
    });
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'points.reason.update', targetId: '4' }),
    );
  });

  it('keeps general ETC outside category balances while retaining half adjustment semantics', () => {
    const entries = [
      { type: 'PLUS' as const, point: 5, reason: '상점' },
      { type: 'MINUS' as const, point: -5, reason: '벌점' },
      { type: 'ETC' as const, point: -3, reason: SYSTEM_MERIT_HALF_REASON },
      { type: 'ETC' as const, point: 3, reason: SYSTEM_PENALTY_HALF_REASON },
      { type: 'ETC' as const, point: 20, reason: '퇴사 외 일반 조정' },
    ];
    const net = entries.reduce((total, entry) => total + entry.point, 0);

    expect(calculateCurrentPointCategoryBalances(entries)).toEqual({
      meritPoint: 2,
      penaltyPoint: 2,
    });
    expect(net).toBe(20);
  });
});
