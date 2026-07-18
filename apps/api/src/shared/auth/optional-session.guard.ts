import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from '../../modules/auth/auth.service';
import type { AuthenticatedRequest } from './request-auth';

/**
 * Adds session context to a public route when a valid token is present while
 * preserving anonymous access. Invalid or expired tokens are treated as an
 * anonymous request; protected mutations continue to use SessionGuard.
 */
@Injectable()
export class OptionalSessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.authService.getSessionFromRequest(request);

    if (session) {
      request.authSession = session;
      request.authToken = this.authService.extractToken(request) ?? undefined;
    }

    return true;
  }
}
