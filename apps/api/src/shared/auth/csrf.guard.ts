import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../modules/auth/auth.service';
import { SKIP_CSRF_KEY } from './auth.decorators';
import type { AuthenticatedRequest } from './request-auth';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skip) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (safeMethods.has(request.method)) {
      return true;
    }

    const authToken = request.authToken;
    const csrfToken = request.header('x-csrf-token');

    if (!authToken || !csrfToken || !this.authService.verifyCsrfToken(authToken, csrfToken)) {
      throw new ForbiddenException('Invalid CSRF token.');
    }

    return true;
  }
}
