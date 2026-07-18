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
