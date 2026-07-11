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
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(['points.manage']),
  } as unknown as Reflector;

  it('accepts an explicitly granted permission', () => {
    const guard = new PermissionsGuard(reflector);
    expect(
      guard.canActivate(contextWithSession({ roles: ['teacher'], permissions: ['points.manage'] })),
    ).toBe(true);
  });

  it('allows the system administrator override', () => {
    const guard = new PermissionsGuard(reflector);
    expect(
      guard.canActivate(contextWithSession({ roles: ['system_admin'], permissions: [] })),
    ).toBe(true);
  });

  it('rejects a session without the required permission', () => {
    const guard = new PermissionsGuard(reflector);
    expect(() =>
      guard.canActivate(contextWithSession({ roles: ['teacher'], permissions: [] })),
    ).toThrow(ForbiddenException);
  });
});
