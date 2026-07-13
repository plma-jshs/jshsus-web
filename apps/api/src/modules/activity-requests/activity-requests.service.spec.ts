import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthSession } from '../auth/auth.service';
import type { DatabaseService } from '../database/database.service';
import { ActivityRequestsService } from './activity-requests.service';

function selectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
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

function lockingSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    for: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
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

const studentSession: AuthSession = {
  isLogined: true,
  iamId: 10,
  userId: 20,
  plmaId: 30,
  roles: ['student'],
  permissions: [],
};

describe('ActivityRequestsService detail contract', () => {
  it('returns only the signed-in student request selected by id', async () => {
    const databaseDb = { select: vi.fn().mockReturnValue(selectChain([{ id: 9 }])) };
    const detailDb = {
      select: vi.fn().mockReturnValue(
        selectChain([
          {
            id: 14,
            createdAt: new Date('2026-07-13T00:00:00Z'),
            studentNo: 260101,
            studentName: '테스트 학생',
            teacherName: null,
            location: '과학관',
            startsAt: new Date('2026-07-14T00:00:00Z'),
            endsAt: new Date('2026-07-14T01:00:00Z'),
            purpose: '연구 활동',
            status: 'submitted' as const,
            issuedNumber: null,
            rejectionReason: null,
          },
        ]),
      ),
    };
    const database = {
      db: databaseDb,
      query: vi.fn(async (_name: string, work: (value: typeof detailDb) => unknown) =>
        work(detailDb),
      ),
    } as unknown as DatabaseService;

    const result = await new ActivityRequestsService(database).getMyRequest(14, studentSession);

    expect(result).toMatchObject({ id: 14, studentNo: 260101, purpose: '연구 활동' });
  });

  it('returns 404 when the id is not owned by the signed-in student', async () => {
    const databaseDb = { select: vi.fn().mockReturnValue(selectChain([{ id: 9 }])) };
    const detailDb = { select: vi.fn().mockReturnValue(selectChain([])) };
    const database = {
      db: databaseDb,
      query: vi.fn(async (_name: string, work: (value: typeof detailDb) => unknown) =>
        work(detailDb),
      ),
    } as unknown as DatabaseService;

    await expect(
      new ActivityRequestsService(database).getMyRequest(14, studentSession),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ActivityRequestsService student create authorization', () => {
  it('ignores a forged body studentId and persists the student linked to the session', async () => {
    const linkedStudentId = 9;
    const databaseDb = {
      select: vi.fn().mockReturnValue(selectChain([{ id: linkedStudentId }])),
    };
    const requestInsert = returningInsertChain(14);
    const eventInsert = { values: vi.fn().mockResolvedValue(undefined) };
    const operationDb = {
      insert: vi.fn().mockReturnValueOnce(requestInsert).mockReturnValueOnce(eventInsert),
    };
    const database = {
      db: databaseDb,
      query: vi.fn(async (_name: string, work: (value: typeof operationDb) => unknown) =>
        work(operationDb),
      ),
    } as unknown as DatabaseService;

    const result = await new ActivityRequestsService(database).create(
      {
        studentId: 999_999,
        location: 'science lab',
        startsAt: '2026-07-14T09:00:00+09:00',
        endsAt: '2026-07-14T10:00:00+09:00',
        purpose: 'research activity',
      },
      studentSession,
    );

    expect(requestInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: linkedStudentId }),
    );
    expect(requestInsert.values).not.toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 999_999 }),
    );
    expect(result.request.studentId).toBe(linkedStudentId);
  });
});

describe('ActivityRequestsService cancel contract', () => {
  it('returns 404 when the request is missing or belongs to another student', async () => {
    const lockedRequest = lockingSelectChain([]);
    const transactionDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(selectChain([{ id: 9 }]))
        .mockReturnValueOnce(lockedRequest),
    };
    const operationDb = {
      transaction: vi.fn(async (work: (value: typeof transactionDb) => unknown) =>
        work(transactionDb),
      ),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (value: typeof operationDb) => unknown) =>
        work(operationDb),
      ),
    } as unknown as DatabaseService;

    await expect(
      new ActivityRequestsService(database).cancel(14, studentSession),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(operationDb.transaction).toHaveBeenCalledOnce();
    expect(lockedRequest.for).toHaveBeenCalledWith('update');
  });

  it('keeps a non-submitted request unchanged after locking it', async () => {
    const lockedRequest = lockingSelectChain([{ id: 14, status: 'approved' }]);
    const update = updateChain();
    const transactionDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(selectChain([{ id: 9 }]))
        .mockReturnValueOnce(lockedRequest),
      update: vi.fn().mockReturnValue(update),
      insert: vi.fn(),
    };
    const operationDb = {
      transaction: vi.fn(async (work: (value: typeof transactionDb) => unknown) =>
        work(transactionDb),
      ),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (value: typeof operationDb) => unknown) =>
        work(operationDb),
      ),
    } as unknown as DatabaseService;

    await expect(
      new ActivityRequestsService(database).cancel(14, studentSession),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(lockedRequest.for).toHaveBeenCalledWith('update');
    expect(transactionDb.update).not.toHaveBeenCalled();
    expect(transactionDb.insert).not.toHaveBeenCalled();
  });

  it('locks, cancels, and records the event in one transaction', async () => {
    const lockedRequest = lockingSelectChain([{ id: 14, status: 'submitted' }]);
    const update = updateChain();
    const eventInsert = { values: vi.fn().mockResolvedValue(undefined) };
    const transactionDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(selectChain([{ id: 9 }]))
        .mockReturnValueOnce(lockedRequest),
      update: vi.fn().mockReturnValue(update),
      insert: vi.fn().mockReturnValue(eventInsert),
    };
    const operationDb = {
      transaction: vi.fn(async (work: (value: typeof transactionDb) => unknown) =>
        work(transactionDb),
      ),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (value: typeof operationDb) => unknown) =>
        work(operationDb),
      ),
    } as unknown as DatabaseService;

    await expect(new ActivityRequestsService(database).cancel(14, studentSession)).resolves.toEqual(
      { ok: true, id: 14, status: 'canceled' },
    );
    expect(operationDb.transaction).toHaveBeenCalledOnce();
    expect(lockedRequest.for).toHaveBeenCalledWith('update');
    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'canceled', updatedAt: expect.any(Date) }),
    );
    expect(eventInsert.values).toHaveBeenCalledWith({
      activityRequestId: 14,
      actorId: studentSession.userId,
      type: 'canceled',
      note: '학생 취소',
    });
  });

  it('propagates an event insert failure so the transaction can roll back the status change', async () => {
    const lockedRequest = lockingSelectChain([{ id: 14, status: 'submitted' }]);
    const update = updateChain();
    const eventFailure = new Error('event insert failed');
    const eventInsert = { values: vi.fn().mockRejectedValue(eventFailure) };
    const transactionDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(selectChain([{ id: 9 }]))
        .mockReturnValueOnce(lockedRequest),
      update: vi.fn().mockReturnValue(update),
      insert: vi.fn().mockReturnValue(eventInsert),
    };
    const operationDb = {
      transaction: vi.fn(async (work: (value: typeof transactionDb) => unknown) =>
        work(transactionDb),
      ),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (value: typeof operationDb) => unknown) =>
        work(operationDb),
      ),
    } as unknown as DatabaseService;

    await expect(new ActivityRequestsService(database).cancel(14, studentSession)).rejects.toBe(
      eventFailure,
    );
    expect(operationDb.transaction).toHaveBeenCalledOnce();
    expect(update.where).toHaveBeenCalledOnce();
    expect(eventInsert.values).toHaveBeenCalledOnce();
  });
});
