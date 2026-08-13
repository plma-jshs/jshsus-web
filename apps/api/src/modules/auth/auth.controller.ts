import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
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
import { SsoService } from './sso.service';

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
  delivery: z.enum(['phone', 'email']).optional().default('phone'),
});

const confirmPasswordSchema = z.object({
  username: z.string().trim().min(1).max(128),
  resetToken: z.string().trim().min(32).max(256),
  newPassword: z.string().min(8).max(256),
});

const verifyPasswordResetSchema = z.object({
  username: z.string().trim().min(1).max(128),
  code: z.string().trim().min(4).max(16),
});

const ssoStartSchema = z.object({
  returnTo: z.string().max(1_000).optional(),
});

const ssoContinueSchema = z.object({
  requestId: z.string().uuid(),
});

const ssoExchangeSchema = z.object({
  code: z.string().min(32).max(256),
  state: z.string().min(32).max(256),
});

const ssoLogoutSchema = z.object({
  returnTo: z.string().url().max(1_000).optional(),
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

function requestOrigin(request: Request): string | null {
  const origin = firstHeaderValue(request.headers.origin);
  if (origin) return normalizeOrigin(origin);

  const host = firstHeaderValue(request.headers.host);
  if (!host) return null;
  const forwardedProto = firstHeaderValue(request.headers['x-forwarded-proto']);
  const protocol = forwardedProto?.split(',', 1)[0]?.trim() || request.protocol || 'http';
  return normalizeOrigin(`${protocol}://${host}`);
}

const allowedCredentialOrigins = new Set(
  [...env.CORS_ORIGINS, env.SSO_PUBLIC_ORIGIN]
    .map(normalizeOrigin)
    .filter((origin): origin is string => origin !== null),
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

function assertDevelopmentSessionRequest(request: Request): void {
  if (env.NODE_ENV !== 'development' || !env.DEV_AUTH_BYPASS) {
    throw new NotFoundException();
  }

  if (!['localhost', '127.0.0.1'].includes(request.hostname)) {
    throw new ForbiddenException({
      code: 'DEV_AUTH_LOCALHOST_REQUIRED',
      message: 'Development authentication is only available on localhost.',
    });
  }

  assertTrustedCredentialRequest(request);
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
  const requiresSecurePrefix = [env.IAM_COOKIE_NAME, env.CSRF_COOKIE_NAME].some(
    (name) => name.startsWith('__Host-') || name.startsWith('__Secure-'),
  );

  return {
    domain:
      useHostOnlyCookie || isLocalhost || env.SESSION_COOKIE_DOMAIN === 'localhost'
        ? undefined
        : env.SESSION_COOKIE_DOMAIN,
    path: '/',
    secure: requiresSecurePrefix || (!isLocalhost && env.SESSION_COOKIE_SECURE),
    sameSite: (useHostOnlyCookie || isLocalhost || !env.SESSION_COOKIE_SECURE ? 'lax' : 'none') as
      'none' | 'lax',
  };
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountActivationService: AccountActivationService,
    private readonly ssoService: SsoService,
  ) {}

  @Get('sso/config')
  ssoConfig(@Req() request: Request) {
    return this.ssoService.getConfig(requestOrigin(request));
  }

  @Post('sso/start')
  @RateLimit({ max: 20, windowSeconds: 60 })
  async startSso(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertTrustedCredentialRequest(request);
    const input = parseBody(ssoStartSchema, body);
    const result = await this.ssoService.start(requestOrigin(request) ?? '', input.returnTo);
    response.cookie(env.SSO_ATTEMPT_COOKIE_NAME, result.browserBinding, {
      ...cookieBaseOptions(request),
      httpOnly: true,
      maxAge: env.SSO_REQUEST_TTL_SECONDS * 1_000,
    });
    return { authorizationUrl: result.authorizationUrl };
  }

  @Get('sso/authorize')
  @RateLimit({ max: 20, windowSeconds: 60 })
  async redirectToSso(
    @Query('returnTo') returnTo: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const input = parseBody(ssoStartSchema, { returnTo });
    const result = await this.ssoService.start(requestOrigin(request) ?? '', input.returnTo);
    response.cookie(env.SSO_ATTEMPT_COOKIE_NAME, result.browserBinding, {
      ...cookieBaseOptions(request),
      httpOnly: true,
      maxAge: env.SSO_REQUEST_TTL_SECONDS * 1_000,
    });
    return response.redirect(302, result.authorizationUrl);
  }

  @Get('sso/requests/:requestId')
  describeSsoRequest(@Param('requestId') requestId: string, @Req() request: Request) {
    this.ssoService.assertAuthOrigin(requestOrigin(request));
    if (!z.string().uuid().safeParse(requestId).success) {
      throw new BadRequestException({
        code: 'SSO_REQUEST_INVALID',
        message: '로그인 요청을 확인할 수 없습니다.',
      });
    }
    return this.ssoService.describeRequest(requestId);
  }

  @Get('sso/authorize-request')
  @RateLimit({ max: 20, windowSeconds: 60 })
  async authorizeSsoRequest(
    @Query('sso') requestId: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    this.ssoService.assertAuthOrigin(requestOrigin(request));
    if (!z.string().uuid().safeParse(requestId).success) {
      throw new BadRequestException({
        code: 'SSO_REQUEST_INVALID',
        message: '로그인 요청을 확인할 수 없습니다.',
      });
    }

    const token = this.authService.extractToken(request);
    const session = token ? await this.authService.getSessionFromToken(token) : null;
    if (!token || !session?.userId) {
      const loginUrl = new URL('/login', env.SSO_PUBLIC_ORIGIN);
      loginUrl.searchParams.set('sso', String(requestId));
      return response.redirect(302, loginUrl.toString());
    }

    const continuation = await this.ssoService.continue(String(requestId), token);
    return response.redirect(302, continuation.redirectUrl);
  }

  @Post('sso/continue')
  @UseGuards(SessionGuard, CsrfGuard)
  async continueSso(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    this.ssoService.assertAuthOrigin(requestOrigin(request));
    const input = parseBody(ssoContinueSchema, body);
    return this.ssoService.continue(input.requestId, request.authToken ?? '');
  }

  @Post('sso/exchange')
  @RateLimit({ max: 20, windowSeconds: 60 })
  async exchangeSso(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertTrustedCredentialRequest(request);
    const input = parseBody(ssoExchangeSchema, body);
    const browserBinding = request.cookies?.[env.SSO_ATTEMPT_COOKIE_NAME];
    try {
      const exchange = await this.ssoService.exchange(
        requestOrigin(request) ?? '',
        input.code,
        input.state,
        typeof browserBinding === 'string' ? browserBinding : '',
      );
      this.setSessionCookies(request, response, exchange.result);
      return { status: 'AUTHENTICATED' as const, returnTo: exchange.returnTo };
    } finally {
      response.clearCookie(env.SSO_ATTEMPT_COOKIE_NAME, {
        ...cookieBaseOptions(request),
        httpOnly: true,
      });
    }
  }

  @Get('sso/callback')
  @RateLimit({ max: 20, windowSeconds: 60 })
  async exchangeSsoAndRedirect(
    @Query() query: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const input = parseBody(ssoExchangeSchema, query);
    const browserBinding = request.cookies?.[env.SSO_ATTEMPT_COOKIE_NAME];
    try {
      const exchange = await this.ssoService.exchange(
        requestOrigin(request) ?? '',
        input.code,
        input.state,
        typeof browserBinding === 'string' ? browserBinding : '',
      );
      this.setSessionCookies(request, response, exchange.result);
      response.clearCookie(env.SSO_ATTEMPT_COOKIE_NAME, {
        ...cookieBaseOptions(request),
        httpOnly: true,
      });
      return response.redirect(302, exchange.returnTo);
    } catch (error) {
      response.clearCookie(env.SSO_ATTEMPT_COOKIE_NAME, {
        ...cookieBaseOptions(request),
        httpOnly: true,
      });
      throw error;
    }
  }

  @Post('sso/logout')
  @RateLimit({ max: 20, windowSeconds: 60 })
  async logoutSso(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertTrustedCredentialRequest(request);
    this.ssoService.assertAuthOrigin(requestOrigin(request));
    const input = parseBody(ssoLogoutSchema, body);
    const token = this.authService.extractToken(request);
    if (token) {
      const session = await this.authService.getSessionFromToken(token);
      if (session?.userId) {
        await this.authService.invalidateUserSessions(session.userId);
      } else {
        await this.authService.logout(token);
      }
    }
    this.clearSessionCookies(request, response);
    return { redirectUrl: this.ssoService.validateLogoutTarget(input.returnTo) };
  }

  @Get('sso/logout-redirect')
  @RateLimit({ max: 20, windowSeconds: 60 })
  async logoutSsoAndRedirect(
    @Query('returnTo') returnTo: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    this.ssoService.assertAuthOrigin(requestOrigin(request));
    const input = parseBody(ssoLogoutSchema, { returnTo });
    // Service origins invalidate every server-side session through the
    // CSRF-protected POST /auth/logout before navigating here. This legacy GET
    // remains a passive, allowlisted redirect so cross-site navigation cannot
    // mutate authentication state.
    return response.redirect(302, this.ssoService.validateLogoutTarget(input.returnTo));
  }

  @Get('session')
  async session(@Req() request: Request) {
    const session = await this.authService.getSessionFromRequest(request);
    return session ?? { isLogined: false };
  }

  @Post('dev-session')
  @RateLimit({ max: 20, windowSeconds: 60 })
  async developmentSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertDevelopmentSessionRequest(request);
    const result = await this.authService.issueDevelopmentSession();
    this.setSessionCookies(request, response, result);
    return { status: 'AUTHENTICATED' as const, session: result.session };
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
    this.ssoService.assertAuthOrigin(requestOrigin(request));
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
    this.ssoService.assertAuthOrigin(requestOrigin(request));
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
    this.ssoService.assertAuthOrigin(requestOrigin(request));
    const input = parseBody(forgotPasswordSchema, body);
    return this.authService.requestPasswordReset(
      input.username,
      inferCognitoSurface(request),
      input.delivery,
    );
  }

  @Post('password/confirm')
  @RateLimit({ max: 10, windowSeconds: 900 })
  confirmPassword(@Body() body: unknown, @Req() request: Request) {
    assertTrustedCredentialRequest(request);
    this.ssoService.assertAuthOrigin(requestOrigin(request));
    const input = parseBody(confirmPasswordSchema, body);
    return this.authService.confirmPasswordReset({
      ...input,
      surface: inferCognitoSurface(request),
    });
  }

  @Post('password/verify')
  @RateLimit({ max: 10, windowSeconds: 900 })
  verifyPassword(@Body() body: unknown, @Req() request: Request) {
    assertTrustedCredentialRequest(request);
    this.ssoService.assertAuthOrigin(requestOrigin(request));
    const input = parseBody(verifyPasswordResetSchema, body);
    return this.authService.verifyPasswordResetCode({
      ...input,
      surface: inferCognitoSurface(request),
    });
  }

  @Post('account-activation/complete')
  @RateLimit({ max: 5, windowSeconds: 900 })
  completeAccountActivation(@Body() body: unknown, @Req() request: Request) {
    assertTrustedCredentialRequest(request);
    this.ssoService.assertAuthOrigin(requestOrigin(request));
    return this.accountActivationService.complete(body, inferCognitoSurface(request));
  }

  @Post('account-activation/lookup')
  @RateLimit({ max: 10, windowSeconds: 900 })
  lookupAccountActivation(@Body() body: unknown, @Req() request: Request) {
    assertTrustedCredentialRequest(request);
    this.ssoService.assertAuthOrigin(requestOrigin(request));
    return this.accountActivationService.lookup(body);
  }

  @Post('account-activation/phone/request')
  @RateLimit({ max: 5, windowSeconds: 900 })
  requestAccountActivationPhoneCode(@Body() body: unknown, @Req() request: Request) {
    assertTrustedCredentialRequest(request);
    this.ssoService.assertAuthOrigin(requestOrigin(request));
    return this.accountActivationService.requestPhoneVerification(body);
  }

  @Post('account-activation/email/request')
  @RateLimit({ max: 5, windowSeconds: 900 })
  requestAccountActivationEmailCode(@Body() body: unknown, @Req() request: Request) {
    assertTrustedCredentialRequest(request);
    this.ssoService.assertAuthOrigin(requestOrigin(request));
    return this.accountActivationService.requestEmailVerification(body);
  }

  @Post('account-activation/phone/verify')
  @RateLimit({ max: 10, windowSeconds: 900 })
  verifyAccountActivationPhoneCode(@Body() body: unknown, @Req() request: Request) {
    assertTrustedCredentialRequest(request);
    this.ssoService.assertAuthOrigin(requestOrigin(request));
    return this.accountActivationService.verifyPhoneVerification(body);
  }

  @Post('account-activation/email/verify')
  @RateLimit({ max: 10, windowSeconds: 900 })
  verifyAccountActivationEmailCode(@Body() body: unknown, @Req() request: Request) {
    assertTrustedCredentialRequest(request);
    this.ssoService.assertAuthOrigin(requestOrigin(request));
    return this.accountActivationService.verifyEmailVerification(body);
  }

  private setSessionCookies(
    request: Request,
    response: Response,
    result: { token: string; csrfToken: string; persistent: boolean },
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

  private clearSessionCookies(request: Request, response: Response) {
    response.clearCookie(env.IAM_COOKIE_NAME, {
      ...cookieBaseOptions(request),
      httpOnly: true,
    });

    response.clearCookie(env.CSRF_COOKIE_NAME, {
      ...cookieBaseOptions(request),
      httpOnly: false,
    });
  }

  @Post('logout')
  @UseGuards(SessionGuard, CsrfGuard)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = this.authService.extractToken(request);

    if (token) {
      const session = await this.authService.getSessionFromToken(token);
      if (session?.userId) {
        await this.authService.invalidateUserSessions(session.userId);
      } else {
        await this.authService.logout(token);
      }
    }

    this.clearSessionCookies(request, response);

    return { ok: true };
  }
}
