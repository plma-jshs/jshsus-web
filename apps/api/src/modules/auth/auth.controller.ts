import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { UserRole } from '@jshsus/types';
import { AuthService } from './auth.service';
import { env } from '../../shared/config/env';
import { SessionGuard } from '../../shared/auth/session.guard';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { CsrfGuard } from '../../shared/auth/csrf.guard';

const cookieBaseOptions = () => ({
  domain: env.SESSION_COOKIE_DOMAIN === 'localhost' ? undefined : env.SESSION_COOKIE_DOMAIN,
  path: '/',
  secure: env.SESSION_COOKIE_SECURE,
  sameSite: (env.SESSION_COOKIE_SECURE ? 'none' : 'lax') as 'none' | 'lax',
});

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('session')
  async session(@Req() request: Request) {
    const session = await this.authService.getSessionFromRequest(request);
    return session ?? { isLogined: false };
  }

  @Get('csrf')
  @UseGuards(SessionGuard)
  csrf(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    const token = request.authToken ?? '';
    const csrfToken = this.authService.createCsrfToken(token);

    response.cookie(env.CSRF_COOKIE_NAME, csrfToken, {
      ...cookieBaseOptions(),
      httpOnly: false,
    });

    return { csrfToken };
  }

  @Post('login')
  async login(
    @Body() body: { username?: string; password?: string; role?: UserRole },
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login({
      username: body.username ?? 'local-admin',
      password: body.password ?? '',
      devRole: body.role,
    });

    response.cookie(env.IAM_COOKIE_NAME, result.token, {
      ...cookieBaseOptions(),
      httpOnly: true,
    });

    response.cookie(env.CSRF_COOKIE_NAME, result.csrfToken, {
      ...cookieBaseOptions(),
      httpOnly: false,
    });

    return result.session;
  }

  @Post('logout')
  @UseGuards(SessionGuard, CsrfGuard)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = this.authService.extractToken(request);

    if (token) {
      await this.authService.logout(token);
    }

    response.clearCookie(env.IAM_COOKIE_NAME, {
      ...cookieBaseOptions(),
      httpOnly: true,
    });

    response.clearCookie(env.CSRF_COOKIE_NAME, {
      ...cookieBaseOptions(),
      httpOnly: false,
    });

    return { ok: true };
  }
}
