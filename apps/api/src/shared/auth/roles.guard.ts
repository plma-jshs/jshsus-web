import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@jshsus/types';
import { ROLES_KEY } from './auth.decorators';
import type { AuthenticatedRequest } from './request-auth';

const roleAliases: Partial<Record<UserRole, string[]>> = {
  system_admin: ['system_admin', 'admin', 'root', 'plma_admin'],
  student_affairs_head: ['student_affairs_head', 'student_affairs', 'points_admin'],
  teacher: ['teacher', 'staff'],
  student_council: ['student_council', 'council'],
  broadcast_club: ['broadcast_club', 'jbs'],
  student: ['student'],
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = request.authSession;

    if (!session) {
      throw new ForbiddenException('Session is missing.');
    }

    const roles = new Set(session.roles ?? []);
    const allowed = requiredRoles.some((role) =>
      (roleAliases[role] ?? [role]).some((alias) => roles.has(alias)),
    );

    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions.');
    }

    return true;
  }
}
