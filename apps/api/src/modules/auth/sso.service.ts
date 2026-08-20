import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../shared/config/env';
import { RedisService } from '../redis/redis.service';
import { AuthService, type AuthSession } from './auth.service';

export type SsoClient = 'web' | 'admin';

const ADMIN_ACCESS_PERMISSIONS = new Set([
  'content.manage',
  'notices.manage',
  'school_events.manage',
  'community.manage',
  'lost_items.manage',
  'petitions.answer',
  'activity.review',
  'points.issue',
  'points.manage',
  'dorm.manage',
  'devices.manage',
  'wake_songs.review',
  'jbs.publish',
  'users.manage',
  'iam.manage',
  'audit.read',
]);

const requestSchema = z.object({
  client: z.enum(['web', 'admin']),
  callbackOrigin: z.string().url(),
  returnTo: z.string(),
  state: z.string().min(32),
  browserBindingHash: z.string().length(64),
  createdAt: z.number().int().positive(),
});

const codeSchema = z.object({
  client: z.enum(['web', 'admin']),
  callbackOrigin: z.string().url(),
  returnTo: z.string(),
  state: z.string().min(32),
  browserBindingHash: z.string().length(64),
  centralSessionToken: z.string().min(1),
});

type SsoRequest = z.infer<typeof requestSchema>;
type SsoCode = z.infer<typeof codeSchema>;

function safeTextEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function safeReturnTo(value: string | undefined): string {
  // Browsers and URL parsers normalize backslashes as path separators. A value
  // such as `/\\evil.example` therefore becomes a protocol-relative URL when
  // the client navigates to it, despite appearing to start with a single slash.
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/';
  }
  return value.slice(0, 1_000);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class SsoService {
  private readonly publicOrigin = new URL(env.SSO_PUBLIC_ORIGIN).origin;
  private readonly webOrigins = new Set(env.SSO_WEB_ORIGINS.map((value) => new URL(value).origin));
  private readonly adminOrigins = new Set(
    env.SSO_ADMIN_ORIGINS.map((value) => new URL(value).origin),
  );

  constructor(
    private readonly redis: RedisService,
    private readonly authService: AuthService,
  ) {}

  getConfig(origin: string | null) {
    const normalizedOrigin = this.normalizeOrigin(origin);
    return {
      authOrigin: this.publicOrigin,
      defaultServiceOrigin: this.webOrigins.values().next().value ?? null,
      isAuthOrigin: normalizedOrigin === this.publicOrigin,
      client: normalizedOrigin ? this.resolveClient(normalizedOrigin, false) : null,
    };
  }

  async start(origin: string, returnTo?: string) {
    const normalizedOrigin = this.requireOrigin(origin);
    const client = this.resolveClient(normalizedOrigin, true);
    const requestId = randomUUID();
    const browserBinding = randomBytes(32).toString('base64url');
    const request: SsoRequest = {
      client,
      callbackOrigin: normalizedOrigin,
      returnTo: safeReturnTo(returnTo),
      state: randomBytes(32).toString('base64url'),
      browserBindingHash: sha256(browserBinding),
      createdAt: Date.now(),
    };

    await this.redis.setJson(this.requestKey(requestId), request, env.SSO_REQUEST_TTL_SECONDS);

    const authorizationUrl = new URL('/api/auth/sso/authorize-request', this.publicOrigin);
    authorizationUrl.searchParams.set('sso', requestId);

    return { authorizationUrl: authorizationUrl.toString(), browserBinding };
  }

  async describeRequest(requestId: string) {
    const request = await this.readRequest(requestId);
    return {
      client: request.client,
      serviceName: request.client === 'admin' ? '학생부 전산시스템' : '과구리',
    };
  }

  async continue(requestId: string, centralSessionToken: string) {
    const storedRequest = await this.readRequestWithRaw(requestId);
    const request = storedRequest.value;
    const centralSession = await this.authService.getSessionFromToken(centralSessionToken);
    if (!centralSession || centralSession.userId <= 0) {
      throw new BadRequestException({
        code: 'SSO_SESSION_EXPIRED',
        message: '통합로그인 세션이 만료되었습니다. 다시 로그인해 주세요.',
      });
    }

    if (request.client === 'admin' && !this.canAccessAdmin(centralSession)) {
      throw new ForbiddenException({
        code: 'SSO_ADMIN_ACCESS_DENIED',
        message: '학생부 전산망에 접근할 권한이 없습니다.',
      });
    }

    const code = randomBytes(32).toString('base64url');
    const codePayload: SsoCode = {
      client: request.client,
      callbackOrigin: request.callbackOrigin,
      returnTo: request.returnTo,
      state: request.state,
      browserBindingHash: request.browserBindingHash,
      centralSessionToken,
    };

    const consumedRequest = await this.redis.takeIfValue(
      this.requestKey(requestId),
      storedRequest.raw,
    );
    if (!consumedRequest) {
      throw new BadRequestException({
        code: 'SSO_REQUEST_EXPIRED',
        message: '로그인 요청이 만료되었거나 이미 처리되었습니다. 다시 시작해 주세요.',
      });
    }

    await this.redis.setJson(this.codeKey(code), codePayload, env.SSO_CODE_TTL_SECONDS);

    const redirectUrl = new URL('/api/auth/sso/callback', request.callbackOrigin);
    redirectUrl.searchParams.set('code', code);
    redirectUrl.searchParams.set('state', request.state);
    return { redirectUrl: redirectUrl.toString() };
  }

  async exchange(origin: string, code: string, state: string, browserBinding: string) {
    const normalizedOrigin = this.requireOrigin(origin);
    const codeKey = this.codeKey(code);
    const raw = await this.redis.get(codeKey);
    if (!raw) {
      throw new BadRequestException({
        code: 'SSO_CODE_EXPIRED',
        message: '로그인 확인 코드가 만료되었거나 이미 사용되었습니다.',
      });
    }

    const parsed = this.parseStored(codeSchema, raw);
    if (
      parsed.callbackOrigin !== normalizedOrigin ||
      !safeTextEqual(parsed.state, state) ||
      !safeTextEqual(parsed.browserBindingHash, sha256(browserBinding)) ||
      this.resolveClient(normalizedOrigin, true) !== parsed.client
    ) {
      throw new ForbiddenException({
        code: 'SSO_EXCHANGE_REJECTED',
        message: '로그인 요청을 확인할 수 없습니다. 처음부터 다시 시도해 주세요.',
      });
    }

    const centralSession = await this.authService.getSessionFromToken(parsed.centralSessionToken);
    if (!centralSession || centralSession.userId <= 0) {
      throw new BadRequestException({
        code: 'SSO_SESSION_EXPIRED',
        message: '통합로그인 세션이 만료되었습니다. 다시 로그인해 주세요.',
      });
    }
    if (parsed.client === 'admin' && !this.canAccessAdmin(centralSession)) {
      throw new ForbiddenException({
        code: 'SSO_ADMIN_ACCESS_DENIED',
        message: '학생부 전산망에 접근할 권한이 없습니다.',
      });
    }

    const consumedCode = await this.redis.takeIfValue(codeKey, raw);
    if (!consumedCode) {
      throw new BadRequestException({
        code: 'SSO_CODE_EXPIRED',
        message: '로그인 확인 코드가 만료되었거나 이미 사용되었습니다.',
      });
    }

    return {
      returnTo: parsed.returnTo,
      result: await this.authService.issueDelegatedSession(centralSession),
    };
  }

  assertAuthOrigin(origin: string | null): void {
    if (this.normalizeOrigin(origin) !== this.publicOrigin) {
      throw new ForbiddenException({
        code: 'SSO_AUTH_ORIGIN_REQUIRED',
        message: '통합로그인 페이지에서만 처리할 수 있는 요청입니다.',
      });
    }
  }

  validateLogoutTarget(value: string | undefined): string {
    if (!value) return this.webOrigins.values().next().value ?? '/';
    try {
      const target = new URL(value);
      if (!this.webOrigins.has(target.origin) && !this.adminOrigins.has(target.origin)) {
        throw new Error('untrusted origin');
      }
      target.username = '';
      target.password = '';
      target.hash = '';
      return target.toString();
    } catch {
      throw new BadRequestException({
        code: 'SSO_LOGOUT_TARGET_INVALID',
        message: '로그아웃 후 이동할 서비스를 확인할 수 없습니다.',
      });
    }
  }

  private canAccessAdmin(session: AuthSession): boolean {
    return (
      session.roles.some((role) =>
        ['system_admin', 'student_affairs_head', 'teacher'].includes(String(role)),
      ) ||
      session.permissions.some((permission) => ADMIN_ACCESS_PERMISSIONS.has(String(permission)))
    );
  }

  private resolveClient(origin: string, required: true): SsoClient;
  private resolveClient(origin: string, required: false): SsoClient | null;
  private resolveClient(origin: string, required: boolean): SsoClient | null {
    if (this.webOrigins.has(origin)) return 'web';
    if (this.adminOrigins.has(origin)) return 'admin';
    if (required) {
      throw new ForbiddenException({
        code: 'SSO_CLIENT_NOT_ALLOWED',
        message: '통합로그인을 사용할 수 없는 서비스입니다.',
      });
    }
    return null;
  }

  private requireOrigin(value: string | null): string {
    const origin = this.normalizeOrigin(value);
    if (!origin) {
      throw new ForbiddenException({
        code: 'SSO_ORIGIN_REQUIRED',
        message: '요청한 서비스를 확인할 수 없습니다.',
      });
    }
    return origin;
  }

  private normalizeOrigin(value: string | null): string | null {
    if (!value) return null;
    try {
      return new URL(value).origin;
    } catch {
      return null;
    }
  }

  private async readRequest(requestId: string): Promise<SsoRequest> {
    const key = this.requestKey(requestId);
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new BadRequestException({
        code: 'SSO_REQUEST_EXPIRED',
        message: '로그인 요청이 만료되었습니다. 이용할 서비스에서 다시 시작해 주세요.',
      });
    }
    return this.parseStored(requestSchema, raw);
  }

  private async readRequestWithRaw(requestId: string): Promise<{ value: SsoRequest; raw: string }> {
    const raw = await this.redis.get(this.requestKey(requestId));
    if (!raw) {
      throw new BadRequestException({
        code: 'SSO_REQUEST_EXPIRED',
        message: '로그인 요청이 만료되었습니다. 이용할 서비스에서 다시 시작해 주세요.',
      });
    }
    return { value: this.parseStored(requestSchema, raw), raw };
  }

  private parseStored<T>(schema: z.ZodType<T>, raw: string): T {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      value = null;
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'SSO_REQUEST_INVALID',
        message: '로그인 요청을 확인할 수 없습니다. 처음부터 다시 시도해 주세요.',
      });
    }
    return parsed.data;
  }

  private requestKey(requestId: string): string {
    return `sso:request:${requestId}`;
  }

  private codeKey(code: string): string {
    return `sso:code:${sha256(code)}`;
  }
}
