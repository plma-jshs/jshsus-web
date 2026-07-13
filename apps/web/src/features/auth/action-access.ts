import type { SessionUser } from '@jshsus/types';
import { ApiError } from '../../shared/api/http';

export function authActionRequiresLogin(
  session: SessionUser | undefined,
  error?: unknown,
): boolean {
  return !session?.isLogined || (error instanceof ApiError && error.status === 401);
}
