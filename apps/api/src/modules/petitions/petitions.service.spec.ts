import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.service';
import { PetitionsService } from './petitions.service';

function selectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  return chain;
}

describe('PetitionsService detail contract', () => {
  it('stores both the validated document and its plain-text projection', async () => {
    const returningId = vi.fn().mockResolvedValue([{ id: 91 }]);
    const values = vi.fn().mockReturnValue({ $returningId: returningId });
    const db = { insert: vi.fn().mockReturnValue({ values }) };
    const database = {
      query: vi.fn(async (_name: string, work: (value: typeof db) => unknown) => work(db)),
      writeAudit: vi.fn().mockResolvedValue(undefined),
    } as unknown as DatabaseService;
    const contentDoc = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          content: [{ type: 'text' as const, text: '검색 가능한 본문' }],
        },
      ],
    };

    await new PetitionsService(database).create(
      {
        title: '문서 청원',
        contentDoc,
        endsAt: '2026-08-01T00:00:00+09:00',
      },
      10,
    );

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '문서 청원',
        content: '검색 가능한 본문',
        contentJson: contentDoc,
      }),
    );
  });

  it('loads one petition independently from the capped list and includes rich text', async () => {
    const petition = {
      id: 73,
      title: '상세 청원',
      content: '상세 본문',
      contentJson: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '상세 본문' }] }],
      },
      authorName: '작성자',
      participantCount: 12,
      startsAt: new Date('2026-07-01T00:00:00Z'),
      endsAt: new Date('2026-08-01T00:00:00Z'),
      status: 'open' as const,
      createdAt: new Date('2026-07-01T00:00:00Z'),
    };
    const answer = {
      petitionId: 73,
      content: '답변',
      authorName: '담당자',
      answeredAt: new Date('2026-07-10T00:00:00Z'),
    };
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(selectChain([petition]))
        .mockReturnValueOnce(selectChain([answer])),
    };
    const database = {
      query: vi.fn(async (_name: string, work: (value: typeof db) => unknown) => work(db)),
    } as unknown as DatabaseService;

    const result = await new PetitionsService(database).getById(73);

    expect(result.id).toBe(73);
    expect(result.contentDoc).toEqual(petition.contentJson);
    expect(result.answer?.content).toBe('답변');
  });

  it('uses a real 404 only when the public petition row is absent', async () => {
    const db = { select: vi.fn().mockReturnValue(selectChain([])) };
    const database = {
      query: vi.fn(async (_name: string, work: (value: typeof db) => unknown) => work(db)),
    } as unknown as DatabaseService;

    await expect(new PetitionsService(database).getById(73)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not translate database failures into a not-found response', async () => {
    const failure = new Error('database unavailable');
    const database = {
      query: vi.fn().mockRejectedValue(failure),
    } as unknown as DatabaseService;

    await expect(new PetitionsService(database).getById(73)).rejects.toBe(failure);
  });
});
