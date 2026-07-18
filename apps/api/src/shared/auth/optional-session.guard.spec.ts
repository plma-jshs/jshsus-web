import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthService } from '../../modules/auth/auth.service';
import { OptionalSessionGuard } from './optional-session.guard';
import type { AuthenticatedRequest } from './request-auth';

function contextFor(request: AuthenticatedRequest) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('OptionalSessionGuard', () => {
  it('keeps a public request anonymous when no valid session exists', async () => {
    const auth = {
      getSessionFromRequest: vi.fn().mockResolvedValue(null),
      extractToken: vi.fn(),
    };
    const request = {} as AuthenticatedRequest;
    const guard = new OptionalSessionGuard(auth as unknown as AuthService);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.authSession).toBeUndefined();
  });

  it('attaches the current user so public reads can report likedByMe', async () => {
    const session = { isLogined: true, userId: 12 };
    const auth = {
      getSessionFromRequest: vi.fn().mockResolvedValue(session),
      extractToken: vi.fn().mockReturnValue('token'),
    };
    const request = {} as AuthenticatedRequest;
    const guard = new OptionalSessionGuard(auth as unknown as AuthService);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.authSession).toBe(session);
    expect(request.authToken).toBe('token');
  });
});
