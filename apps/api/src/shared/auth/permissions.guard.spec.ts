import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { PermissionsGuard } from './permissions.guard';

function contextWithSession(session: { roles: string[]; permissions: string[] }) {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ authSession: session }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const guardFor = (...permissions: string[]) =>
    new PermissionsGuard({
      getAllAndOverride: vi.fn().mockReturnValue(permissions),
    } as unknown as Reflector);

  it('accepts an explicitly granted permission', () => {
    const guard = guardFor('points.issue');
    expect(
      guard.canActivate(contextWithSession({ roles: ['teacher'], permissions: ['points.issue'] })),
    ).toBe(true);
  });

  it('allows the system administrator override', () => {
    const guard = guardFor('permission.added.after-session-issued');
    expect(
      guard.canActivate(contextWithSession({ roles: ['system_admin'], permissions: [] })),
    ).toBe(true);
  });

  it('rejects a session without the required permission', () => {
    const guard = guardFor('points.manage');
    expect(() =>
      guard.canActivate(contextWithSession({ roles: ['teacher'], permissions: [] })),
    ).toThrow(ForbiddenException);
  });

  it('does not treat the legacy broad content grant as a split permission', () => {
    const guard = guardFor('notices.manage');
    expect(() =>
      guard.canActivate(
        contextWithSession({ roles: ['teacher'], permissions: ['content.manage'] }),
      ),
    ).toThrow(ForbiddenException);
  });
});
