import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  Res,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { AccountActivationService } from './account-activation.service';
import { env } from '../../shared/config/env';
import { SessionGuard } from '../../shared/auth/session.guard';
import type { AuthenticatedRequest } from '../../shared/auth/request-auth';
import { CsrfGuard } from '../../shared/auth/csrf.guard';
import { RateLimit } from '../../shared/security/rate-limit.guard';
import type { CognitoSurface } from './cognito-auth.service';

const loginSchema = z.object({
  username: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(512),
  remember: z.boolean().optional().default(false),
});

const newPasswordSchema = z.object({
  flowId: z.string().uuid(),
  newPassword: z.string().min(8).max(256),
});

const forgotPasswordSchema = z.object({
  username: z.string().trim().min(1).max(128),
});

const confirmPasswordSchema = forgotPasswordSchema.extend({
  code: z.string().trim().min(4).max(16),
  newPassword: z.string().min(8).max(256),
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      code: 'AUTH_INVALID_INPUT',
      message: '입력한 내용을 확인해 주세요.',
    });
  }
  return parsed.data;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const allowedCredentialOrigins = new Set(
  env.CORS_ORIGINS.map(normalizeOrigin).filter((origin): origin is string => origin !== null),
);

export function assertTrustedCredentialRequest(request: Request): void {
  const contentType = firstHeaderValue(request.headers['content-type'])
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();

  if (contentType !== 'application/json') {
    throw new UnsupportedMediaTypeException({
      code: 'AUTH_JSON_REQUIRED',
      message: 'JSON 형식의 요청만 허용됩니다.',
    });
  }

  if (firstHeaderValue(request.headers['sec-fetch-site'])?.toLowerCase() === 'cross-site') {
    throw new ForbiddenException({
      code: 'AUTH_CROSS_SITE_REQUEST_BLOCKED',
      message: '허용되지 않은 사이트에서 보낸 요청입니다.',
    });
  }

  const rawOrigin = firstHeaderValue(request.headers.origin);
  if (!rawOrigin) return;

  const origin = normalizeOrigin(rawOrigin);
  if (!origin || !allowedCredentialOrigins.has(origin)) {
    throw new ForbiddenException({
      code: 'AUTH_ORIGIN_NOT_ALLOWED',
      message: '허용되지 않은 사이트에서 보낸 요청입니다.',
    });
  }
}

export function inferCognitoSurface(
  request: Pick<Request, 'hostname' | 'headers'>,
): CognitoSurface {
  const inferFromUrl = (value: string): CognitoSurface => {
    try {
      const url = new URL(value.includes('://') ? value : `http://${value}`);
      if (url.hostname.startsWith('admin-') || url.hostname.startsWith('admin.')) return 'admin';
      if (url.hostname === 'localhost' && url.port === '5174') return 'admin';
    } catch {
      // Malformed headers use the public client instead of guessing.
    }

    return 'web';
  };

  const origin = firstHeaderValue(request.headers.origin);
  if (origin) return inferFromUrl(origin);

  const host = firstHeaderValue(request.headers.host);
  if (host) return inferFromUrl(host);

  return request.hostname.startsWith('admin-') || request.hostname.startsWith('admin.')
    ? 'admin'
    : 'web';
}

const cookieBaseOptions = (request: Request) => {
  const isLocalhost = ['localhost', '127.0.0.1'].includes(request.hostname);
  const useHostOnlyCookie = env.SESSION_COOKIE_HOST_ONLY || env.AUTH_MODE === 'cognito';

  return {
    domain:
      useHostOnlyCookie || isLocalhost || env.SESSION_COOKIE_DOMAIN === 'localhost'
        ? undefined
        : env.SESSION_COOKIE_DOMAIN,
    path: '/',
    secure: isLocalhost ? false : env.SESSION_COOKIE_SECURE,
    sameSite: (useHostOnlyCookie || isLocalhost || !env.SESSION_COOKIE_SECURE ? 'lax' : 'none') as
      'none' | 'lax',
  };
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountActivationService: AccountActivationService,
  ) {}

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
      ...cookieBaseOptions(request),
      httpOnly: false,
    });

    return { csrfToken };
  }

  @Post('login')
  @RateLimit({ max: 10, windowSeconds: 60 })
  async login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertTrustedCredentialRequest(request);
    const input = parseBody(loginSchema, body);
    const result = await this.authService.login({
      username: input.username,
      password: input.password,
      remember: input.remember,
      surface: inferCognitoSurface(request),
    });

    if (result.status === 'NEW_PASSWORD_REQUIRED') {
      return result;
    }

    this.setSessionCookies(request, response, result);

    return { status: 'AUTHENTICATED' as const, session: result.session };
  }

  @Post('challenges/new-password')
  @RateLimit({ max: 10, windowSeconds: 900 })
  async completeNewPassword(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertTrustedCredentialRequest(request);
    const input = parseBody(newPasswordSchema, body);
    const result = await this.authService.completeNewPassword(
      input.flowId,
      input.newPassword,
      inferCognitoSurface(request),
    );

    if (result.status !== 'AUTHENTICATED') {
      throw new BadRequestException({
        code: 'AUTH_FLOW_EXPIRED',
        message: '비밀번호 변경 절차를 다시 시작해 주세요.',
      });
    }

    this.setSessionCookies(request, response, result);
    return { status: 'AUTHENTICATED' as const, session: result.session };
  }

  @Post('password/forgot')
  @RateLimit({ max: 5, windowSeconds: 900 })
  forgotPassword(@Body() body: unknown, @Req() request: Request) {
    assertTrustedCredentialRequest(request);
    const input = parseBody(forgotPasswordSchema, body);
    return this.authService.requestPasswordReset(input.username, inferCognitoSurface(request));
  }

  @Post('password/confirm')
  @RateLimit({ max: 10, windowSeconds: 900 })
  confirmPassword(@Body() body: unknown, @Req() request: Request) {
    assertTrustedCredentialRequest(request);
    const input = parseBody(confirmPasswordSchema, body);
    return this.authService.confirmPasswordReset({
      ...input,
      surface: inferCognitoSurface(request),
    });
  }

  @Post('account-activation/complete')
  @RateLimit({ max: 5, windowSeconds: 900 })
  completeAccountActivation(@Body() body: unknown, @Req() request: Request) {
    assertTrustedCredentialRequest(request);
    return this.accountActivationService.complete(body, inferCognitoSurface(request));
  }

  private setSessionCookies(
    request: Request,
    response: Response,
    result: Extract<Awaited<ReturnType<AuthService['login']>>, { status: 'AUTHENTICATED' }>,
  ) {
    response.cookie(env.IAM_COOKIE_NAME, result.token, {
      ...cookieBaseOptions(request),
      httpOnly: true,
      ...(result.persistent ? { maxAge: env.IAM_REMEMBER_TOKEN_TTL_SECONDS * 1000 } : {}),
    });

    response.cookie(env.CSRF_COOKIE_NAME, result.csrfToken, {
      ...cookieBaseOptions(request),
      httpOnly: false,
    });
  }

  @Post('logout')
  @UseGuards(SessionGuard, CsrfGuard)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = this.authService.extractToken(request);

    if (token) {
      await this.authService.logout(token);
    }

    response.clearCookie(env.IAM_COOKIE_NAME, {
      ...cookieBaseOptions(request),
      httpOnly: true,
    });

    response.clearCookie(env.CSRF_COOKIE_NAME, {
      ...cookieBaseOptions(request),
      httpOnly: false,
    });

    return { ok: true };
  }
}
