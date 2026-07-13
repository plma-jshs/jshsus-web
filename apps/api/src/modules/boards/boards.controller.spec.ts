import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { BoardsController } from './boards.controller';
import type { BoardsService } from './boards.service';

function memberRequest(userId: number) {
  return {
    authSession: { userId },
  } as unknown as AuthenticatedRequest;
}

describe('BoardsController member write contract', () => {
  it('delegates published posts to the member-board service boundary', () => {
    const createMemberPost = vi.fn().mockReturnValue({ ok: true });
    const controller = new BoardsController({ createMemberPost } as unknown as BoardsService);
    const body = { title: 'title', content: 'content' };

    expect(controller.createBoardPost('free', body, memberRequest(12))).toEqual({ ok: true });
    expect(createMemberPost).toHaveBeenCalledWith('free', body, 12);
  });

  it('delegates drafts to the same member-board service boundary', () => {
    const createMemberDraft = vi.fn().mockReturnValue({ ok: true });
    const controller = new BoardsController({ createMemberDraft } as unknown as BoardsService);
    const body = { title: 'draft' };

    expect(controller.createBoardPostDraft('free', body, memberRequest(12))).toEqual({ ok: true });
    expect(createMemberDraft).toHaveBeenCalledWith('free', body, 12);
  });
});
