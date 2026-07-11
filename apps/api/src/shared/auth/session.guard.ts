import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../modules/auth/auth.service';
import type { AuthenticatedRequest } from './request-auth';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.authService.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Login is required.');
    }

    const session = await this.authService.getSessionFromToken(token);

    if (!session) {
      throw new UnauthorizedException('Session is invalid or expired.');
    }

    request.authToken = token;
    request.authSession = session;

    return true;
  }
}
