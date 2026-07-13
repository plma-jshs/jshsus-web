import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service';
import type { FilesService } from '../files/files.service';
import { BoardsService } from './boards.service';

function selectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
    for: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return chain;
}

function createService(operationDb: object) {
  const database = {
    db: operationDb,
    query: vi.fn(async (_name: string, work: (value: typeof operationDb) => unknown) =>
      work(operationDb),
    ),
    writeAudit: vi.fn().mockResolvedValue(undefined),
  } as unknown as DatabaseService;
  const service = new BoardsService(database, {} as FilesService);
  return { database, service };
}

describe('BoardsService public comment target authorization', () => {
  it('lists comments only after resolving the post through its public board slug', async () => {
    const post = selectChain([{ id: 41 }]);
    const comments = selectChain([
      {
        id: 7,
        postId: 41,
        parentId: null,
        authorName: 'student',
        content: 'comment',
        isHidden: false,
        createdAt: new Date('2026-07-13T00:00:00Z'),
      },
    ]);
    const operationDb = {
      select: vi.fn().mockReturnValueOnce(post).mockReturnValueOnce(comments),
    };
    const { service } = createService(operationDb);

    await expect(service.listComments('free', 41)).resolves.toEqual([
      expect.objectContaining({ id: 7, postId: 41, content: 'comment' }),
    ]);
    expect(operationDb.select).toHaveBeenCalledTimes(2);
  });

  it.each(['a different board slug', 'a draft post', 'a hidden post', 'a non-public board'])(
    'returns 404 before reading comments for %s',
    async () => {
      const operationDb = {
        select: vi.fn().mockReturnValue(selectChain([])),
      };
      const { service } = createService(operationDb);

      await expect(service.listComments('free', 41)).rejects.toBeInstanceOf(NotFoundException);
      expect(operationDb.select).toHaveBeenCalledTimes(1);
    },
  );

  it('does not insert a comment when the slug/post is not publicly reachable', async () => {
    const operationDb = {
      select: vi.fn().mockReturnValue(selectChain([])),
      insert: vi.fn(),
    };
    const { database, service } = createService(operationDb);

    await expect(
      service.createComment('free', 41, { content: 'comment' }, 12),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(operationDb.insert).not.toHaveBeenCalled();
    expect(database.writeAudit).not.toHaveBeenCalled();
  });

  it('rejects a reply whose parent belongs to another post', async () => {
    const operationDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(selectChain([{ id: 41 }]))
        .mockReturnValueOnce(selectChain([])),
      insert: vi.fn(),
    };
    const { service } = createService(operationDb);

    await expect(
      service.createComment('free', 41, { content: 'reply', parentId: 99 }, 12),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(operationDb.insert).not.toHaveBeenCalled();
  });

  it('creates a top-level comment after public post validation', async () => {
    const insert = {
      values: vi.fn(),
      $returningId: vi.fn().mockResolvedValue([{ id: 8 }]),
    };
    insert.values.mockReturnValue(insert);
    const operationDb = {
      select: vi.fn().mockReturnValue(selectChain([{ id: 41 }])),
      insert: vi.fn().mockReturnValue(insert),
    };
    const { database, service } = createService(operationDb);

    await expect(service.createComment('free', 41, { content: 'comment' }, 12)).resolves.toEqual({
      ok: true,
      comment: { id: 8, postId: 41, content: 'comment' },
    });
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 41, authorId: 12, content: 'comment' }),
    );
    expect(database.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'board.comment.create', targetId: 8 }),
    );
  });
});

describe('BoardsService draft cleanup ordering', () => {
  it('commits the draft deletion before external cleanup and reports retained references', async () => {
    const events: string[] = [];
    const lockedRows = [
      {
        id: 41,
        authorId: 12,
        title: 'draft',
        content: '',
        contentJson: null,
        isAnonymous: false,
        status: 'draft',
      },
    ];
    const lockedPost = selectChain(lockedRows);
    lockedPost.limit.mockReturnValue({ for: vi.fn().mockResolvedValue(lockedRows) });
    const tx = {
      select: vi.fn().mockReturnValue(lockedPost),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    };
    const operationDb = {
      transaction: vi.fn(async (work: (value: typeof tx) => unknown) => {
        const result = await work(tx);
        events.push('commit');
        return result;
      }),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (value: typeof operationDb) => unknown) =>
        work(operationDb),
      ),
    } as unknown as DatabaseService;
    const files = {
      enqueueForTarget: vi.fn(async () => {
        events.push('enqueue');
        return 2;
      }),
      deleteForTarget: vi.fn(async () => {
        events.push('cleanup');
        return { deleted: 0, failed: 2 };
      }),
    } as unknown as FilesService;
    const service = new BoardsService(database, files);

    await expect(
      service.deleteDraft('free', 41, {
        isLogined: true,
        iamId: 12,
        userId: 12,
        plmaId: 0,
        roles: ['student'],
        permissions: [],
      }),
    ).resolves.toEqual({ ok: true, id: 41, cleanupPending: true });
    expect(events).toEqual(['enqueue', 'commit', 'cleanup']);
    expect(files.enqueueForTarget).toHaveBeenCalledWith('post', 41, 'draft_delete', tx);
    expect(files.deleteForTarget).toHaveBeenCalledWith('post', 41);
  });
});

describe('BoardsService member post board contract', () => {
  it.each(['createMemberPost', 'createMemberDraft'] as const)(
    'does not let %s create an arbitrary board from a route slug',
    async (method) => {
      const operationDb = {
        select: vi.fn(),
        insert: vi.fn(),
      };
      const { database, service } = createService(operationDb);

      await expect(
        service[method]('student-made-board', { title: 'title', content: 'content' }, 12),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(operationDb.select).not.toHaveBeenCalled();
      expect(operationDb.insert).not.toHaveBeenCalled();
      expect(database.writeAudit).not.toHaveBeenCalled();
    },
  );

  it('publishes to the existing public free board without creating a board', async () => {
    const postInsert = {
      values: vi.fn(),
      $returningId: vi.fn().mockResolvedValue([{ id: 51 }]),
    };
    postInsert.values.mockReturnValue(postInsert);
    const operationDb = {
      select: vi.fn().mockReturnValue(selectChain([{ id: 3, slug: 'free', visibility: 'public' }])),
      insert: vi.fn().mockReturnValue(postInsert),
    };
    const { database, service } = createService(operationDb);

    await expect(
      service.createMemberPost('free', { title: 'title', content: 'content' }, 12),
    ).resolves.toEqual({
      ok: true,
      post: expect.objectContaining({ id: 51, boardSlug: 'free', status: 'published' }),
    });
    expect(operationDb.insert).toHaveBeenCalledTimes(1);
    expect(postInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({ boardId: 3, authorId: 12, title: 'title' }),
    );
    expect(database.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'board.post.create', targetId: 51 }),
    );
  });

  it.each([
    ['missing', []],
    ['not public', [{ id: 3, slug: 'free', visibility: 'members' }]],
  ])('returns 404 when the free board is %s', async (_case, rows) => {
    const operationDb = {
      select: vi.fn().mockReturnValue(selectChain(rows)),
      insert: vi.fn(),
    };
    const { service } = createService(operationDb);

    await expect(
      service.createMemberPost('free', { title: 'title', content: 'content' }, 12),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(operationDb.insert).not.toHaveBeenCalled();
  });
});
