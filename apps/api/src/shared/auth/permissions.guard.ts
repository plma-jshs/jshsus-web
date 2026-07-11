import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './auth.decorators';
import type { AuthenticatedRequest } from './request-auth';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) {
      return true;
    }

    const session = context.switchToHttp().getRequest<AuthenticatedRequest>().authSession;
    if (!session) {
      throw new ForbiddenException('Session is missing.');
    }

    if (session.roles?.includes('system_admin')) {
      return true;
    }

    const granted = new Set(session.permissions ?? []);
    if (!required.every((permission) => granted.has(permission))) {
      throw new ForbiddenException('Insufficient permissions.');
    }

    return true;
  }
}
