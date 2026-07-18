import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthSession } from '../auth/auth.service';
import type { DatabaseService } from '../database/database.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { ActivityRequestsService } from './activity-requests.service';

function selectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
    then: <TResult1 = unknown[], TResult2 = never>(
      onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(rows).then(onfulfilled, onrejected),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
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

function returningInsertChain(id: number) {
  const chain = {
    values: vi.fn(),
    $returningId: vi.fn().mockResolvedValue([{ id }]),
  };
  chain.values.mockReturnValue(chain);
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

function deleteChain() {
  return { where: vi.fn().mockResolvedValue(undefined) };
}

function notificationService() {
  return {
    createForUser: vi.fn().mockResolvedValue({ id: 1 }),
  } as unknown as NotificationsService;
}

const studentSession: AuthSession = {
  isLogined: true,
  iamId: 10,
  userId: 20,
  plmaId: 30,
  roles: ['student'],
  permissions: [],
};

const activityRow = {
  id: 14,
  createdAt: new Date('2026-07-13T00:00:00Z'),
  createdById: null,
  representativeStudentId: 9,
  studentNo: 9999,
  studentName: '테스트',
  advisorTeacherId: null,
  reviewedById: null,
  location: '과학관',
  startsAt: new Date('2026-07-14T00:00:00Z'),
  endsAt: new Date('2026-07-14T01:00:00Z'),
  purpose: '연구 활동',
  status: 'submitted' as const,
  issuedNumber: null,
  issuedAt: null,
  rejectionReason: null,
};

describe('ActivityRequestsService participant contract', () => {
  it('allows every participant to read the complete request', async () => {
    const operationDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(selectChain([{ id: 9 }]))
        .mockReturnValueOnce(selectChain([{ activityRequestId: 14 }]))
        .mockReturnValueOnce(selectChain([activityRow]))
        .mockReturnValueOnce(
          selectChain([
            {
              activityRequestId: 14,
              studentId: 9,
              studentNo: 9999,
              studentName: '테스트',
            },
          ]),
        ),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (db: typeof operationDb) => unknown) =>
        work(operationDb),
      ),
    } as unknown as DatabaseService;

    const result = await new ActivityRequestsService(database, notificationService()).getMyRequest(
      14,
      studentSession,
    );

    expect(result).toMatchObject({
      id: 14,
      studentNo: 9999,
      participants: [{ studentNo: 9999, isRepresentative: true }],
    });
  });

  it('returns 404 when the signed-in student is not a participant', async () => {
    const operationDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(selectChain([{ id: 9 }]))
        .mockReturnValueOnce(selectChain([])),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (db: typeof operationDb) => unknown) =>
        work(operationDb),
      ),
    } as unknown as DatabaseService;

    await expect(
      new ActivityRequestsService(database, notificationService()).getMyRequest(14, studentSession),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ActivityRequestsService student create authorization', () => {
  it('uses the signed-in student as representative and persists all participants atomically', async () => {
    const requestInsert = returningInsertChain(14);
    const participantInsert = { values: vi.fn().mockResolvedValue(undefined) };
    const eventInsert = { values: vi.fn().mockResolvedValue(undefined) };
    const transactionDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(selectChain([{ id: 9 }]))
        .mockReturnValueOnce(selectChain([{ studentNo: 9999, name: '테스트' }]))
        .mockReturnValueOnce(
          selectChain([
            { id: 9, studentNo: 9999 },
            { id: 10, studentNo: 1101 },
          ]),
        )
        .mockReturnValueOnce(selectChain([{ userId: 30 }])),
      insert: vi
        .fn()
        .mockReturnValueOnce(requestInsert)
        .mockReturnValueOnce(participantInsert)
        .mockReturnValueOnce(eventInsert),
    };
    const operationDb = {
      transaction: vi.fn(async (work: (db: typeof transactionDb) => unknown) =>
        work(transactionDb),
      ),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (db: typeof operationDb) => unknown) =>
        work(operationDb),
      ),
    } as unknown as DatabaseService;

    const notifications = notificationService();
    const result = await new ActivityRequestsService(database, notifications).create(
      {
        studentId: 999_999,
        advisorTeacherId: 30,
        participantStudentNos: [1101],
        location: '과학관',
        startsAt: '2026-07-18T09:00:00+09:00',
        endsAt: '2026-07-18T10:40:00+09:00',
        purpose: '연구 활동',
      },
      studentSession,
    );

    expect(requestInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({ representativeStudentId: 9, createdById: 20 }),
    );
    expect(participantInsert.values).toHaveBeenCalledWith([
      { activityRequestId: 14, studentId: 9 },
      { activityRequestId: 14, studentId: 10 },
    ]);
    expect(result.request.studentId).toBe(9);
    expect(notifications.createForUser).toHaveBeenCalledWith(
      {
        userId: 30,
        type: 'activity_request_submitted',
        title: '9999 테스트 님이 새로운 탐구활동서를 제출했습니다.',
        metadata: {
          activityRequestId: 14,
          representativeStudentId: 9,
        },
        dedupeKey: 'activity-request:14:submitted',
      },
      transactionDb,
    );
  });
});

describe('ActivityRequestsService pending request updates', () => {
  it('lets the representative replace pending request details and participants atomically', async () => {
    const requestUpdate = updateChain();
    const participantDelete = deleteChain();
    const participantInsert = { values: vi.fn().mockResolvedValue(undefined) };
    const transactionDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(selectChain([{ id: 9 }]))
        .mockReturnValueOnce(
          lockingSelectChain([{ id: 14, status: 'submitted', representativeStudentId: 9 }]),
        )
        .mockReturnValueOnce(selectChain([{ studentNo: 9999 }]))
        .mockReturnValueOnce(
          selectChain([
            { id: 9, studentNo: 9999 },
            { id: 10, studentNo: 1101 },
          ]),
        )
        .mockReturnValueOnce(selectChain([{ userId: 30 }])),
      update: vi.fn().mockReturnValue(requestUpdate),
      delete: vi.fn().mockReturnValue(participantDelete),
      insert: vi.fn().mockReturnValue(participantInsert),
    };
    const operationDb = {
      transaction: vi.fn(async (work: (db: typeof transactionDb) => unknown) =>
        work(transactionDb),
      ),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (db: typeof operationDb) => unknown) =>
        work(operationDb),
      ),
    } as unknown as DatabaseService;

    await expect(
      new ActivityRequestsService(database, notificationService()).update(
        14,
        {
          advisorTeacherId: 30,
          participantStudentNos: [1101],
          location: '생명과학실',
          startsAt: '2026-07-11T09:00:00+09:00',
          endsAt: '2026-07-11T10:40:00+09:00',
          purpose: '수정한 연구 활동',
        },
        studentSession,
      ),
    ).resolves.toEqual({ ok: true, id: 14, status: 'submitted' });

    expect(requestUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        advisorTeacherId: 30,
        location: '생명과학실',
        purpose: '수정한 연구 활동',
      }),
    );
    expect(participantInsert.values).toHaveBeenCalledWith([
      { activityRequestId: 14, studentId: 9 },
      { activityRequestId: 14, studentId: 10 },
    ]);
  });
});

describe('ActivityRequestsService staff issuance', () => {
  it('uses the signed-in teacher as advisor and issues a number immediately', async () => {
    const requestInsert = returningInsertChain(14);
    const issuedNumberUpdate = updateChain();
    const participantInsert = { values: vi.fn().mockResolvedValue(undefined) };
    const eventInsert = { values: vi.fn().mockResolvedValue(undefined) };
    const auditInsert = { values: vi.fn().mockResolvedValue(undefined) };
    const transactionDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          selectChain([
            { id: 9, studentNo: 9999 },
            { id: 10, studentNo: 1101 },
          ]),
        )
        .mockReturnValueOnce(selectChain([{ id: 9, userId: 120 }]))
        .mockReturnValueOnce(selectChain([{ userId: 20 }])),
      insert: vi
        .fn()
        .mockReturnValueOnce(requestInsert)
        .mockReturnValueOnce(participantInsert)
        .mockReturnValueOnce(eventInsert)
        .mockReturnValueOnce(auditInsert),
      update: vi.fn().mockReturnValue(issuedNumberUpdate),
    };
    const operationDb = {
      transaction: vi.fn(async (work: (db: typeof transactionDb) => unknown) =>
        work(transactionDb),
      ),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (db: typeof operationDb) => unknown) =>
        work(operationDb),
      ),
    } as unknown as DatabaseService;

    const notifications = notificationService();
    const result = await new ActivityRequestsService(database, notifications).adminCreate(
      {
        representativeStudentNo: 9999,
        participantStudentNos: [1101],
        advisorTeacherId: 30,
        location: '과학관',
        startsAt: '2026-07-18T09:00:00+09:00',
        endsAt: '2026-07-18T10:40:00+09:00',
        purpose: '연구 활동',
      },
      20,
    );

    expect(requestInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        createdById: 20,
        advisorTeacherId: 20,
        reviewedById: 20,
        status: 'approved',
      }),
    );
    expect(issuedNumberUpdate.set).toHaveBeenCalledWith({
      issuedNumber: expect.stringMatching(/^AR-\d{8}-0014$/),
    });
    expect(result).toMatchObject({
      ok: true,
      request: {
        id: 14,
        status: 'approved',
        issuedNumber: expect.stringMatching(/^AR-\d{8}-0014$/),
      },
    });
    expect(notifications.createForUser).toHaveBeenCalledWith(
      {
        userId: 120,
        type: 'activity_request_approved',
        title: "'과학관' 탐구활동서가 승인되었습니다.",
        link: '/activity-requests/14',
        metadata: {
          activityRequestId: 14,
          location: '과학관',
        },
        dedupeKey: 'activity-request:14:approved',
      },
      transactionDb,
    );
  });
});

describe('ActivityRequestsService review notifications', () => {
  it('notifies the representative after approval', async () => {
    const transactionDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          lockingSelectChain([
            { status: 'submitted', representativeStudentId: 9, location: '물리실' },
          ]),
        )
        .mockReturnValueOnce(selectChain([{ userId: 120 }])),
      update: vi.fn().mockReturnValue(updateChain()),
      insert: vi
        .fn()
        .mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) })
        .mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) }),
    };
    const operationDb = {
      transaction: vi.fn(async (work: (db: typeof transactionDb) => unknown) =>
        work(transactionDb),
      ),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (db: typeof operationDb) => unknown) =>
        work(operationDb),
      ),
    } as unknown as DatabaseService;
    const notifications = notificationService();

    await new ActivityRequestsService(database, notifications).approve(14, 30);

    expect(notifications.createForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 120,
        type: 'activity_request_approved',
        title: "'물리실' 탐구활동서가 승인되었습니다.",
        link: '/activity-requests/14',
        dedupeKey: 'activity-request:14:approved',
      }),
      transactionDb,
    );
  });

  it('notifies the representative after rejection', async () => {
    const transactionDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          lockingSelectChain([
            { status: 'submitted', representativeStudentId: 9, location: '화학실' },
          ]),
        )
        .mockReturnValueOnce(selectChain([{ userId: 120 }])),
      update: vi.fn().mockReturnValue(updateChain()),
      insert: vi
        .fn()
        .mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) })
        .mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) }),
    };
    const operationDb = {
      transaction: vi.fn(async (work: (db: typeof transactionDb) => unknown) =>
        work(transactionDb),
      ),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (db: typeof operationDb) => unknown) =>
        work(operationDb),
      ),
    } as unknown as DatabaseService;
    const notifications = notificationService();

    await new ActivityRequestsService(database, notifications).reject(
      14,
      { reason: '활동 시간 확인 필요' },
      30,
    );

    expect(notifications.createForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 120,
        type: 'activity_request_rejected',
        title: "'화학실' 탐구활동서가 반려되었습니다.",
        link: '/activity-requests/14',
        dedupeKey: 'activity-request:14:rejected',
      }),
      transactionDb,
    );
  });

  it('skips the approval notification when no user account is linked', async () => {
    const transactionDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          lockingSelectChain([
            { status: 'submitted', representativeStudentId: 9, location: '생명과학실' },
          ]),
        )
        .mockReturnValueOnce(selectChain([{ userId: null }])),
      update: vi.fn().mockReturnValue(updateChain()),
      insert: vi
        .fn()
        .mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) })
        .mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) }),
    };
    const operationDb = {
      transaction: vi.fn(async (work: (db: typeof transactionDb) => unknown) =>
        work(transactionDb),
      ),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (db: typeof operationDb) => unknown) =>
        work(operationDb),
      ),
    } as unknown as DatabaseService;
    const notifications = notificationService();

    await new ActivityRequestsService(database, notifications).approve(14, 30);

    expect(notifications.createForUser).not.toHaveBeenCalled();
  });
});

describe('ActivityRequestsService cancel contract', () => {
  it('keeps a non-submitted request unchanged after locking it', async () => {
    const lockedRequest = lockingSelectChain([
      { id: 14, status: 'approved', representativeStudentId: 9 },
    ]);
    const transactionDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(selectChain([{ id: 9 }]))
        .mockReturnValueOnce(lockedRequest),
      update: vi.fn(),
      insert: vi.fn(),
    };
    const operationDb = {
      transaction: vi.fn(async (work: (db: typeof transactionDb) => unknown) =>
        work(transactionDb),
      ),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (db: typeof operationDb) => unknown) =>
        work(operationDb),
      ),
    } as unknown as DatabaseService;

    await expect(
      new ActivityRequestsService(database, notificationService()).cancel(14, studentSession),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transactionDb.update).not.toHaveBeenCalled();
  });

  it('cancels the representative request and records the event in one transaction', async () => {
    const lockedRequest = lockingSelectChain([
      { id: 14, status: 'submitted', representativeStudentId: 9 },
    ]);
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
      transaction: vi.fn(async (work: (db: typeof transactionDb) => unknown) =>
        work(transactionDb),
      ),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (db: typeof operationDb) => unknown) =>
        work(operationDb),
      ),
    } as unknown as DatabaseService;

    await expect(
      new ActivityRequestsService(database, notificationService()).cancel(14, studentSession),
    ).resolves.toEqual({ ok: true, id: 14, status: 'canceled' });
    expect(eventInsert.values).toHaveBeenCalledWith({
      activityRequestId: 14,
      actorId: 20,
      type: 'canceled',
      note: '학생 취소',
    });
  });
});

describe('ActivityRequestsService today print batch', () => {
  it('returns every approved document with participants and separated actors', async () => {
    const approvedRow = {
      ...activityRow,
      createdById: 20,
      advisorTeacherId: 30,
      reviewedById: 40,
      status: 'approved' as const,
      issuedNumber: 'AR-20260714-0014',
      issuedAt: new Date('2026-07-14T00:10:00Z'),
    };
    const eventInsert = { values: vi.fn().mockResolvedValue(undefined) };
    const auditInsert = { values: vi.fn().mockResolvedValue(undefined) };
    const transactionDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(selectChain([approvedRow]))
        .mockReturnValueOnce(
          selectChain([
            {
              activityRequestId: 14,
              studentId: 9,
              studentNo: 9999,
              studentName: '테스트',
            },
            {
              activityRequestId: 14,
              studentId: 10,
              studentNo: 1101,
              studentName: '참여학생',
            },
          ]),
        )
        .mockReturnValueOnce(
          selectChain([
            { id: 20, name: '작성 교사' },
            { id: 30, name: '담당 교사' },
            { id: 40, name: '승인 교사' },
          ]),
        ),
      insert: vi.fn().mockReturnValueOnce(eventInsert).mockReturnValueOnce(auditInsert),
    };
    const operationDb = {
      transaction: vi.fn(async (work: (db: typeof transactionDb) => unknown) =>
        work(transactionDb),
      ),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (db: typeof operationDb) => unknown) =>
        work(operationDb),
      ),
    } as unknown as DatabaseService;

    const result = await new ActivityRequestsService(database, notificationService()).printToday(
      { date: '2026-07-14' },
      40,
    );

    expect(result).toMatchObject({
      date: '2026-07-14',
      documents: [
        {
          id: 14,
          status: 'approved',
          creatorName: '작성 교사',
          advisorTeacherName: '담당 교사',
          reviewerName: '승인 교사',
          participants: [
            { studentNo: 9999, isRepresentative: true },
            { studentNo: 1101, isRepresentative: false },
          ],
        },
      ],
    });
    expect(eventInsert.values).toHaveBeenCalledWith([
      expect.objectContaining({ activityRequestId: 14, note: '2026-07-14 일괄 인쇄' }),
    ]);
  });

  it('rejects an invalid print date before querying the database', async () => {
    const database = { query: vi.fn() } as unknown as DatabaseService;
    await expect(
      new ActivityRequestsService(database, notificationService()).printToday(
        { date: '2026-99-99' },
        40,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.query).not.toHaveBeenCalled();
  });
});
