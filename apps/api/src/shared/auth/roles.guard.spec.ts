import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RolesGuard } from './roles.guard';

function contextWithSession(session: { roles: string[]; permissions: string[] }) {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ authSession: session }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('accepts an assigned role', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['system_admin']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(
      guard.canActivate(contextWithSession({ roles: ['system_admin'], permissions: [] })),
    ).toBe(true);
  });

  it('does not treat a permission string as a role', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['system_admin']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = contextWithSession({ roles: ['student'], permissions: ['system_admin'] });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
