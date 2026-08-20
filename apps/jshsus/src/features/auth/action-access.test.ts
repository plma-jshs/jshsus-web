import { describe, expect, it } from 'vitest';
import { ApiError } from '../../shared/api/http';
import { authActionRequiresLogin } from './action-access';

describe('public detail authenticated actions', () => {
  it('routes guests to login before a protected mutation is attempted', () => {
    expect(authActionRequiresLogin({ isLogined: false })).toBe(true);
    expect(authActionRequiresLogin(undefined)).toBe(true);
  });

  it('keeps an authenticated action available unless the API reports an expired session', () => {
    const session = {
      isLogined: true as const,
      iamId: 1,
      userId: 1,
      plmaId: 1,
      permissions: [],
    };

    expect(authActionRequiresLogin(session)).toBe(false);
    expect(authActionRequiresLogin(session, new ApiError('expired', 401))).toBe(true);
    expect(authActionRequiresLogin(session, new ApiError('failed', 500))).toBe(false);
  });
});
