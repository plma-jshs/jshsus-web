import type { UploadedFileSummary } from '@jshsus/types';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthSession } from '../auth/auth.service';
import type { DatabaseService } from '../database/database.service';
import { FilesService } from './files.service';

const privateFile: UploadedFileSummary = {
  id: 1,
  originalName: 'private.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 10,
  visibility: 'private',
  url: '/api/files/1/download',
  inlineUrl: '/api/files/1/content',
  uploadedAt: new Date(0).toISOString(),
};

const memberSession: AuthSession = {
  isLogined: true,
  iamId: 1,
  userId: 1,
  plmaId: 0,
  roles: ['student'],
  permissions: [],
};

type FilesServiceInternals = {
  assertCanAttach: (...args: unknown[]) => Promise<void>;
  store: (...args: unknown[]) => Promise<void>;
  queueUploadCompensation: (
    input: {
      fileId?: number | null;
      objectKey: string;
      targetType?: string | null;
      targetId?: number | null;
      reason: 'upload_compensation';
    },
    transactionError: unknown,
  ) => Promise<void>;
  enqueueCleanup: (...args: unknown[]) => Promise<void>;
  claimCleanupJobs: (...args: unknown[]) => Promise<
    Array<{
      id: number;
      fileId: number | null;
      objectKey: string;
      targetType: string | null;
      targetId: number | null;
      reason: string;
      attempts: number;
    }>
  >;
  deleteStoredObject: (objectKey: string) => Promise<void>;
  deleteClaimedCleanupJob: (jobId: number) => Promise<void>;
  fileObjectExists: (objectKey: string) => Promise<boolean>;
  logger: { error: (message: string) => void };
};

function internals(service: FilesService) {
  return service as unknown as FilesServiceInternals;
}

function selectChain(rows: unknown[]) {
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

describe('FilesService access policy', () => {
  it('rejects image MIME spoofing before storing an upload', async () => {
    const service = new FilesService({} as DatabaseService);
    await expect(
      service.upload({
        originalName: 'fake.png',
        mimeType: 'image/png',
        bytes: Buffer.from('not a png'),
        targetType: 'post',
        targetId: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts only image MIME types for profile uploads', async () => {
    const service = new FilesService({} as DatabaseService);
    await expect(
      service.uploadProfile(
        {
          originalName: 'profile.pdf',
          mimeType: 'application/pdf',
          bytes: Buffer.from('%PDF'),
        },
        memberSession,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects profile images over 5MB before storing them', async () => {
    const service = new FilesService({} as DatabaseService);
    await expect(
      service.uploadProfile(
        {
          originalName: 'profile.png',
          mimeType: 'image/png',
          bytes: Buffer.alloc(5 * 1024 * 1024 + 1),
        },
        memberSession,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects anonymous access to private files', async () => {
    const service = new FilesService({} as DatabaseService);
    vi.spyOn(service, 'getById').mockResolvedValue(privateFile);

    await expect(service.getAccessibleById(1, null)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows an authenticated member to access private files', async () => {
    const service = new FilesService({} as DatabaseService);
    vi.spyOn(service, 'getById').mockResolvedValue(privateFile);
    vi.spyOn(service, 'getAccessOwnerId').mockResolvedValue(1);
    await expect(service.getAccessibleById(1, memberSession)).resolves.toEqual(privateFile);
  });

  it('rejects access to another account private file', async () => {
    const service = new FilesService({} as DatabaseService);
    vi.spyOn(service, 'getById').mockResolvedValue(privateFile);
    vi.spyOn(service, 'getAccessOwnerId').mockResolvedValue(2);
    await expect(service.getAccessibleById(1, memberSession)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it.each([
    {
      label: 'a hidden board post',
      file: { ...privateFile, visibility: 'public' as const, targetType: 'post', targetId: 41 },
      target: { authorId: 1, status: 'published', isHidden: true, boardVisibility: 'public' },
    },
    {
      label: 'a hidden lost item',
      file: {
        ...privateFile,
        visibility: 'public' as const,
        targetType: 'lost_item',
        targetId: 31,
      },
      target: { status: 'hidden' },
    },
  ])('returns 404 for a public file attached to $label', async ({ file, target }) => {
    const database = {
      db: { select: vi.fn().mockReturnValue(selectChain([target])) },
    } as unknown as DatabaseService;
    const service = new FilesService(database);
    vi.spyOn(service, 'getById').mockResolvedValue(file);

    await expect(service.getAccessibleById(file.id, null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('allows a community manager to inspect a hidden board file', async () => {
    const file = {
      ...privateFile,
      visibility: 'public' as const,
      targetType: 'post',
      targetId: 41,
    };
    const database = {
      db: {
        select: vi
          .fn()
          .mockReturnValue(
            selectChain([
              { authorId: 2, status: 'published', isHidden: true, boardVisibility: 'public' },
            ]),
          ),
      },
    } as unknown as DatabaseService;
    const service = new FilesService(database);
    vi.spyOn(service, 'getById').mockResolvedValue(file);

    await expect(
      service.getAccessibleById(file.id, {
        ...memberSession,
        roles: ['teacher'],
        permissions: ['community.manage'],
      }),
    ).resolves.toEqual(file);
  });

  it.each([
    { visibility: 'public', session: null },
    { visibility: 'members', session: memberSession },
    {
      visibility: 'staff',
      session: { ...memberSession, roles: ['teacher'] } satisfies AuthSession,
    },
  ] as const)(
    'does not expose a scheduled $visibility notice attachment to an otherwise-authorized non-manager',
    async ({ visibility, session }) => {
      const file = {
        ...privateFile,
        visibility: 'public' as const,
        targetType: 'notice',
        targetId: 51,
      };
      const database = {
        db: {
          select: vi
            .fn()
            .mockReturnValue(
              selectChain([{ visibility, publishedAt: new Date(Date.now() + 60 * 60 * 1000) }]),
            ),
        },
      } as unknown as DatabaseService;
      const service = new FilesService(database);
      vi.spyOn(service, 'getById').mockResolvedValue(file);

      await expect(service.getAccessibleById(file.id, session)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    },
  );

  it.each([
    { visibility: 'public', session: null },
    { visibility: 'members', session: memberSession },
    {
      visibility: 'staff',
      session: { ...memberSession, roles: ['teacher'] } satisfies AuthSession,
    },
  ] as const)(
    'does not expose an unpublished $visibility notice attachment to an otherwise-authorized non-manager',
    async ({ visibility, session }) => {
      const file = {
        ...privateFile,
        visibility: 'public' as const,
        targetType: 'notice',
        targetId: 51,
      };
      const database = {
        db: {
          select: vi.fn().mockReturnValue(selectChain([{ visibility, publishedAt: null }])),
        },
      } as unknown as DatabaseService;
      const service = new FilesService(database);
      vi.spyOn(service, 'getById').mockResolvedValue(file);

      await expect(service.getAccessibleById(file.id, session)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    },
  );

  it('does not expose an admin notice attachment to a non-manager', async () => {
    const file = {
      ...privateFile,
      visibility: 'public' as const,
      targetType: 'notice',
      targetId: 51,
    };
    const database = {
      db: {
        select: vi
          .fn()
          .mockReturnValue(
            selectChain([{ visibility: 'admin', publishedAt: new Date(Date.now() - 60_000) }]),
          ),
      },
    } as unknown as DatabaseService;
    const service = new FilesService(database);
    vi.spyOn(service, 'getById').mockResolvedValue(file);

    await expect(service.getAccessibleById(file.id, memberSession)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each([
    { visibility: 'public', session: null },
    { visibility: 'members', session: memberSession },
    {
      visibility: 'staff',
      session: { ...memberSession, roles: ['teacher'] } satisfies AuthSession,
    },
  ] as const)(
    'allows the appropriate audience to access a published $visibility notice attachment',
    async ({ visibility, session }) => {
      const file = {
        ...privateFile,
        visibility: 'public' as const,
        targetType: 'notice',
        targetId: 51,
      };
      const database = {
        db: {
          select: vi
            .fn()
            .mockReturnValue(
              selectChain([{ visibility, publishedAt: new Date(Date.now() - 60 * 60 * 1000) }]),
            ),
        },
      } as unknown as DatabaseService;
      const service = new FilesService(database);
      vi.spyOn(service, 'getById').mockResolvedValue(file);

      await expect(service.getAccessibleById(file.id, session)).resolves.toEqual(file);
    },
  );

  it.each(['public', 'members', 'staff', 'admin'] as const)(
    'keeps scheduled $visibility notice attachments available to notice managers',
    async (visibility) => {
      const file = {
        ...privateFile,
        visibility: 'public' as const,
        targetType: 'notice',
        targetId: 51,
      };
      const database = {
        db: {
          select: vi
            .fn()
            .mockReturnValue(
              selectChain([{ visibility, publishedAt: new Date(Date.now() + 60 * 60 * 1000) }]),
            ),
        },
      } as unknown as DatabaseService;
      const service = new FilesService(database);
      vi.spyOn(service, 'getById').mockResolvedValue(file);

      await expect(
        service.getAccessibleById(file.id, {
          ...memberSession,
          roles: ['teacher'],
          permissions: ['notices.manage'],
        }),
      ).resolves.toEqual(file);
    },
  );

  it('does not let a community manager cross the notice boundary', async () => {
    const file = {
      ...privateFile,
      visibility: 'public' as const,
      targetType: 'notice',
      targetId: 51,
    };
    const database = {
      db: {
        select: vi
          .fn()
          .mockReturnValue(
            selectChain([
              { visibility: 'admin', publishedAt: new Date(Date.now() + 60 * 60 * 1000) },
            ]),
          ),
      },
    } as unknown as DatabaseService;
    const service = new FilesService(database);
    vi.spyOn(service, 'getById').mockResolvedValue(file);

    await expect(
      service.getAccessibleById(file.id, {
        ...memberSession,
        permissions: ['community.manage'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('compensates the stored object when the file or audit transaction fails', async () => {
    const fileInsert = {
      values: vi.fn(),
      $returningId: vi.fn().mockResolvedValue([{ id: 5 }]),
    };
    fileInsert.values.mockReturnValue(fileInsert);
    const auditFailure = new Error('audit insert failed');
    const auditInsert = { values: vi.fn().mockRejectedValue(auditFailure) };
    const transaction = vi.fn(
      async (work: (value: { insert: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
        const tx = {
          insert: vi.fn().mockReturnValueOnce(fileInsert).mockReturnValueOnce(auditInsert),
        };
        return work(tx);
      },
    );
    const service = new FilesService({ db: { transaction } } as unknown as DatabaseService);
    const assertCanAttach = vi
      .spyOn(internals(service), 'assertCanAttach')
      .mockResolvedValue(undefined);
    vi.spyOn(internals(service), 'store').mockResolvedValue(undefined);
    const queueCompensation = vi
      .spyOn(internals(service), 'queueUploadCompensation')
      .mockResolvedValue(undefined);
    const deleteObject = vi
      .spyOn(internals(service), 'deleteStoredObject')
      .mockResolvedValue(undefined);

    await expect(
      service.upload(
        {
          originalName: 'document.pdf',
          mimeType: 'application/pdf',
          bytes: Buffer.from('pdf'),
          visibility: 'private',
          targetType: 'post',
          targetId: 41,
        },
        memberSession,
      ),
    ).rejects.toBe(auditFailure);
    expect(transaction).toHaveBeenCalledOnce();
    expect(assertCanAttach).toHaveBeenCalledTimes(2);
    expect(assertCanAttach.mock.calls[1]?.at(-1)).toBe(true);
    expect(auditInsert.values).toHaveBeenCalledOnce();
    expect(queueCompensation).toHaveBeenCalledWith(
      {
        objectKey: expect.stringMatching(/^post\//),
        targetType: 'post',
        targetId: 41,
        reason: 'upload_compensation',
      },
      auditFailure,
    );
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('never exposes a bucket URL in public file metadata', async () => {
    const database = {
      db: {
        select: vi.fn().mockReturnValue(
          selectChain([
            {
              id: 7,
              originalName: 'inline.png',
              objectKey: 'post/inline.png',
              mimeType: 'image/png',
              sizeBytes: 100,
              visibility: 'public',
              targetType: null,
              targetId: null,
              uploadedAt: new Date(0),
            },
          ]),
        ),
      },
    } as unknown as DatabaseService;

    await expect(new FilesService(database).getById(7)).resolves.toMatchObject({
      url: '/api/files/7/download',
      inlineUrl: '/api/files/7/content',
    });
  });
});

describe('FilesService cleanup outbox', () => {
  it('idempotently enqueues file and target context before storage cleanup', async () => {
    const rows = [
      { id: 10, objectKey: 'post/first.png' },
      { id: 11, objectKey: 'post/second.pdf' },
    ];
    const insert = {
      values: vi.fn(),
      onDuplicateKeyUpdate: vi.fn().mockResolvedValue(undefined),
    };
    insert.values.mockReturnValue(insert);
    const database = {
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(rows) }),
        }),
        insert: vi.fn().mockReturnValue(insert),
      },
    } as unknown as DatabaseService;
    const service = new FilesService(database);

    await expect(service.enqueueForTarget('post', 41, 'draft_delete')).resolves.toBe(2);
    expect(insert.values).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fileId: 10,
        objectKey: 'post/first.png',
        targetType: 'post',
        targetId: 41,
        reason: 'draft_delete',
      }),
    );
    expect(insert.values).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ fileId: 11, objectKey: 'post/second.pdf' }),
    );
    expect(insert.onDuplicateKeyUpdate).toHaveBeenCalledTimes(2);
  });

  it('queues an upload compensation without eagerly deleting the object', async () => {
    const insert = {
      values: vi.fn(),
      onDuplicateKeyUpdate: vi.fn().mockResolvedValue(undefined),
    };
    insert.values.mockReturnValue(insert);
    const service = new FilesService({
      db: { insert: vi.fn().mockReturnValue(insert) },
    } as unknown as DatabaseService);
    const deleteObject = vi
      .spyOn(internals(service), 'deleteStoredObject')
      .mockResolvedValue(undefined);

    await internals(service).queueUploadCompensation(
      {
        objectKey: 'post/orphan.png',
        targetType: 'post',
        targetId: 41,
        reason: 'upload_compensation',
      },
      new Error('transaction failed'),
    );

    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: null,
        objectKey: 'post/orphan.png',
        targetType: 'post',
        targetId: 41,
        reason: 'upload_compensation',
      }),
    );
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('logs the original transaction error and preserves the object when enqueue fails', async () => {
    const insert = {
      values: vi.fn(),
      onDuplicateKeyUpdate: vi.fn().mockRejectedValue(new Error('database unavailable')),
    };
    insert.values.mockReturnValue(insert);
    const service = new FilesService({
      db: { insert: vi.fn().mockReturnValue(insert) },
    } as unknown as DatabaseService);
    const deleteObject = vi
      .spyOn(internals(service), 'deleteStoredObject')
      .mockResolvedValue(undefined);
    const loggerError = vi.spyOn(internals(service).logger, 'error').mockImplementation(() => {});

    await expect(
      internals(service).queueUploadCompensation(
        {
          objectKey: 'post/commit-uncertain.png',
          targetType: 'post',
          targetId: 41,
          reason: 'upload_compensation',
        },
        new Error('commit acknowledgement lost'),
      ),
    ).resolves.toBeUndefined();

    expect(deleteObject).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('original transaction error: commit acknowledgement lost'),
    );
    expect(loggerError).toHaveBeenCalledWith(expect.stringContaining('object preserved'));
  });

  it('preserves a commit-uncertain object when its file row exists and removes only the job', async () => {
    const service = new FilesService({ db: {} } as unknown as DatabaseService);
    vi.spyOn(internals(service), 'claimCleanupJobs').mockResolvedValue([
      {
        id: 92,
        fileId: null,
        objectKey: 'post/commit-uncertain.png',
        targetType: 'post',
        targetId: 41,
        reason: 'upload_compensation',
        attempts: 0,
      },
    ]);
    const exists = vi.spyOn(internals(service), 'fileObjectExists').mockResolvedValue(true);
    const deleteJob = vi
      .spyOn(internals(service), 'deleteClaimedCleanupJob')
      .mockResolvedValue(undefined);
    const deleteObject = vi
      .spyOn(internals(service), 'deleteStoredObject')
      .mockResolvedValue(undefined);

    await expect(service.processCleanupBatch()).resolves.toEqual({
      claimed: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(exists).toHaveBeenCalledWith('post/commit-uncertain.png');
    expect(deleteJob).toHaveBeenCalledWith(92);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('deletes a rolled-back upload object when no file row exists', async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const transaction = vi.fn(
      async (work: (value: { delete: ReturnType<typeof vi.fn> }) => Promise<unknown>) =>
        work({ delete: vi.fn().mockReturnValue({ where: deleteWhere }) }),
    );
    const service = new FilesService({ db: { transaction } } as unknown as DatabaseService);
    vi.spyOn(internals(service), 'claimCleanupJobs').mockResolvedValue([
      {
        id: 93,
        fileId: null,
        objectKey: 'post/rolled-back.png',
        targetType: 'post',
        targetId: 41,
        reason: 'upload_compensation',
        attempts: 0,
      },
    ]);
    const exists = vi.spyOn(internals(service), 'fileObjectExists').mockResolvedValue(false);
    const deleteObject = vi
      .spyOn(internals(service), 'deleteStoredObject')
      .mockResolvedValue(undefined);

    await expect(service.processCleanupBatch()).resolves.toEqual({
      claimed: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(exists).toHaveBeenCalledWith('post/rolled-back.png');
    expect(deleteObject).toHaveBeenCalledWith('post/rolled-back.png');
    expect(deleteWhere).toHaveBeenCalledOnce();
  });

  it('deletes the object, file row, and job on successful retry', async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const transaction = vi.fn(
      async (work: (value: { delete: ReturnType<typeof vi.fn> }) => Promise<unknown>) =>
        work({ delete: vi.fn().mockReturnValue({ where: deleteWhere }) }),
    );
    const service = new FilesService({ db: { transaction } } as unknown as DatabaseService);
    vi.spyOn(internals(service), 'claimCleanupJobs').mockResolvedValue([
      {
        id: 90,
        fileId: 10,
        objectKey: 'post/first.png',
        targetType: 'post',
        targetId: 41,
        reason: 'draft_delete',
        attempts: 1,
      },
    ]);
    const deleteObject = vi
      .spyOn(internals(service), 'deleteStoredObject')
      .mockResolvedValue(undefined);

    await expect(service.processCleanupBatch()).resolves.toEqual({
      claimed: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(deleteObject).toHaveBeenCalledWith('post/first.png');
    expect(deleteWhere).toHaveBeenCalledTimes(2);
  });

  it('records retry state and continues a partially successful batch', async () => {
    const successDeleteWhere = vi.fn().mockResolvedValue(undefined);
    const transaction = vi.fn(
      async (work: (value: { delete: ReturnType<typeof vi.fn> }) => Promise<unknown>) =>
        work({ delete: vi.fn().mockReturnValue({ where: successDeleteWhere }) }),
    );
    const retryWhere = vi.fn().mockResolvedValue(undefined);
    const retrySet = vi.fn().mockReturnValue({ where: retryWhere });
    const database = {
      db: { transaction, update: vi.fn().mockReturnValue({ set: retrySet }) },
    } as unknown as DatabaseService;
    const service = new FilesService(database);
    vi.spyOn(internals(service), 'claimCleanupJobs').mockResolvedValue([
      {
        id: 90,
        fileId: 10,
        objectKey: 'post/first.png',
        targetType: 'post',
        targetId: 41,
        reason: 'draft_delete',
        attempts: 0,
      },
      {
        id: 91,
        fileId: 11,
        objectKey: 'post/unavailable.png',
        targetType: 'post',
        targetId: 41,
        reason: 'draft_delete',
        attempts: 2,
      },
    ]);
    vi.spyOn(internals(service), 'deleteStoredObject').mockImplementation(async (objectKey) => {
      if (objectKey.includes('unavailable')) throw new Error('storage unavailable');
    });

    await expect(service.processCleanupBatch()).resolves.toEqual({
      claimed: 2,
      succeeded: 1,
      failed: 1,
    });
    expect(retrySet).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 3,
        lastError: 'storage unavailable',
        lockedBy: null,
        lockedAt: null,
        nextAttemptAt: expect.any(Date),
      }),
    );
    expect(successDeleteWhere).toHaveBeenCalledTimes(2);
  });

  it('claims due jobs with row locking and skip-locked concurrency protection', async () => {
    const rows = [
      {
        id: 90,
        fileId: 10,
        objectKey: 'post/first.png',
        targetType: 'post',
        targetId: 41,
        reason: 'draft_delete',
        attempts: 0,
      },
    ];
    const select = {
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      for: vi.fn().mockResolvedValue(rows),
    };
    select.from.mockReturnValue(select);
    select.where.mockReturnValue(select);
    select.orderBy.mockReturnValue(select);
    select.limit.mockReturnValue(select);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const tx = {
      select: vi.fn().mockReturnValue(select),
      update: vi.fn().mockReturnValue({ set: updateSet }),
    };
    const database = {
      db: { transaction: vi.fn((work: (value: typeof tx) => unknown) => work(tx)) },
    } as unknown as DatabaseService;
    const service = new FilesService(database);

    await expect(internals(service).claimCleanupJobs(5)).resolves.toEqual(rows);
    expect(select.for).toHaveBeenCalledWith('update', { skipLocked: true });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ lockedBy: expect.any(String), lockedAt: expect.any(Date) }),
    );
  });

  it('reports target cleanup as partial while one queued file remains', async () => {
    const first = { from: vi.fn() };
    first.from.mockReturnValue({
      where: vi.fn().mockResolvedValue([{ id: 10 }, { id: 11 }]),
    });
    const second = { from: vi.fn() };
    second.from.mockReturnValue({ where: vi.fn().mockResolvedValue([{ id: 11 }]) });
    const database = {
      db: { select: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second) },
    } as unknown as DatabaseService;
    const service = new FilesService(database);
    const enqueue = vi.spyOn(service, 'enqueueForTarget').mockResolvedValue(2);
    const process = vi.spyOn(service, 'processCleanupBatch').mockResolvedValue({
      claimed: 2,
      succeeded: 1,
      failed: 1,
    });

    await expect(service.deleteForTarget('post', 41)).resolves.toEqual({ deleted: 1, failed: 1 });
    expect(enqueue).toHaveBeenCalledWith('post', 41);
    expect(process).toHaveBeenCalledWith(2, { targetType: 'post', targetId: 41 });
  });
});
