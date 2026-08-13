import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { BoardsService } from '../boards/boards.service';
import type { DatabaseService } from '../database/database.service';
import type { YouTubeDataApiService } from '../youtube/youtube-data-api.service';
import { JbsService } from './jbs.service';

describe('JbsService YouTube validation', () => {
  it('does not start a database operation when Data API validation fails', async () => {
    const database = { query: vi.fn() };
    const youtube = {
      inspect: vi.fn().mockRejectedValue(new BadRequestException('조회할 수 없는 영상입니다.')),
    };
    const service = new JbsService(
      database as unknown as DatabaseService,
      {} as BoardsService,
      youtube as unknown as YouTubeDataApiService,
      { claimIncrement: vi.fn() } as never,
    );

    await expect(
      service.createPost(
        {
          title: 'JBS 테스트',
          description: 'Data API 검증 실패 시 저장하지 않습니다.',
          youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
        },
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(youtube.inspect).toHaveBeenCalledTimes(1);
    expect(database.query).not.toHaveBeenCalled();
  });
});

describe('JbsService likes', () => {
  it('uses the JBS board boundary for post and comment toggles', async () => {
    const boards = {
      togglePostLike: vi.fn().mockResolvedValue({ liked: true, likeCount: 2 }),
      toggleCommentLike: vi.fn().mockResolvedValue({ liked: false, likeCount: 1 }),
    };
    const service = new JbsService(
      {} as DatabaseService,
      boards as unknown as BoardsService,
      {} as YouTubeDataApiService,
      { claimIncrement: vi.fn() } as never,
    );

    await expect(service.togglePostLike(41, 12)).resolves.toEqual({ liked: true, likeCount: 2 });
    await expect(service.toggleCommentLike(41, 7, 12)).resolves.toEqual({
      liked: false,
      likeCount: 1,
    });
    expect(boards.togglePostLike).toHaveBeenCalledWith('jbs', 41, 12);
    expect(boards.toggleCommentLike).toHaveBeenCalledWith('jbs', 41, 7, 12);
  });
});

describe('JbsService view count write boundary', () => {
  it('keeps the detail readable without a database update when Redis denies the claim', async () => {
    const select = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      leftJoin: vi.fn(),
      where: vi.fn(),
      limit: vi.fn().mockResolvedValue([
        {
          id: 41,
          title: 'video',
          description: 'description',
          authorId: 12,
          youtubeVideoId: 'dQw4w9WgXcQ',
          canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          authorName: 'student',
          viewCount: 5,
          commentCount: 0,
          likeCount: 0,
          likedByMe: 0,
          createdAt: new Date('2026-07-13T00:00:00Z'),
        },
      ]),
    };
    select.from.mockReturnValue(select);
    select.innerJoin.mockReturnValue(select);
    select.leftJoin.mockReturnValue(select);
    select.where.mockReturnValue(select);
    const db = { select: vi.fn().mockReturnValue(select), update: vi.fn() };
    const database = {
      query: vi.fn(async (_name: string, work: (value: typeof db) => unknown) => work(db)),
    } as unknown as DatabaseService;
    const service = new JbsService(
      database,
      {} as BoardsService,
      {} as YouTubeDataApiService,
      { claimIncrement: vi.fn().mockResolvedValue(false) } as never,
    );

    await expect(service.getPost(41, 12, 'user:12')).resolves.toEqual(
      expect.objectContaining({ id: 41, viewCount: 5 }),
    );
    expect(db.update).not.toHaveBeenCalled();
  });
});
