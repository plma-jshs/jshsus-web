import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as schema from '@jshsus/db';
import type { Request } from 'express';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { UserRole } from '@jshsus/types';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { env } from '../../shared/config/env';
import { CognitoAuthError, CognitoAuthService, type CognitoSurface } from './cognito-auth.service';

const legacySessionSchema = z.object({
  iamId: z.number(),
  userId: z.number().optional().default(0),
  plmaId: z.number().optional().default(0),
  permissions: z.array(z.string()).optional().default([]),
  roles: z.array(z.string()).optional().default([]),
  expiresAt: z.number().optional(),
  stuid: z.number().optional(),
  identifier: z.string().optional(),
  identityType: z.enum(['student', 'staff', 'local']).optional(),
  name: z.string().optional(),
  jshsus: z.string().optional(),
});

export type AuthSession = z.infer<typeof legacySessionSchema> & {
  isLogined: true;
};

export type AuthLoginResult =
  | {
      status: 'AUTHENTICATED';
      token: string;
      session: AuthSession;
      csrfToken: string;
      persistent: boolean;
    }
  | {
      status: 'NEW_PASSWORD_REQUIRED';
      flowId: string;
    };

const cognitoChallengeFlowSchema = z.object({
  username: z.string().min(1),
  requiredAttributes: z.array(z.string()).optional().default([]),
  session: z.string().min(1),
  surface: z.enum(['web', 'admin']),
  remember: z.boolean(),
  expectedUserId: z.number().int().positive().optional(),
  expectedSubject: z.string().min(1).optional(),
});
type CognitoChallengeFlow = z.infer<typeof cognitoChallengeFlowSchema>;

type SessionAccountRecord = {
  userId: number;
  authAccountId: number;
  providerAccountId: string | null;
  studentProfileNo: number | null;
  staffNo: number | null;
  name: string;
  status: string;
};

export function resolveSessionIdentity(input: {
  studentNo?: number | null;
  staffNo?: number | null;
  providerAccountId?: string | null;
  username: string;
}): { identifier: string; identityType: 'student' | 'staff' | 'local'; stuid?: number } {
  if (input.studentNo) {
    return {
      identifier: String(input.studentNo),
      identityType: 'student',
      stuid: input.studentNo,
    };
  }
  if (input.staffNo) {
    return { identifier: String(input.staffNo), identityType: 'staff' };
  }
  return {
    identifier: input.providerAccountId ?? input.username.trim(),
    identityType: 'local',
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly redis: RedisService,
    private readonly database: DatabaseService,
    private readonly cognito: CognitoAuthService,
  ) {}

  extractToken(request: Request): string | null {
    const authorization = request.headers.authorization;

    if (authorization) {
      const [scheme, token] = authorization.split(' ');
      if (scheme === 'Bearer' && token) {
        return token;
      }
    }

    const cookieToken = request.cookies?.[env.IAM_COOKIE_NAME];
    return typeof cookieToken === 'string' && cookieToken.length > 0 ? cookieToken : null;
  }

  async getSessionFromRequest(request: Request): Promise<AuthSession | null> {
    const token = this.extractToken(request);

    if (!token) {
      return null;
    }

    return this.getSessionFromToken(token);
  }

  async getSessionFromToken(token: string): Promise<AuthSession | null> {
    const raw = await this.redis.get(`iam_token:${token}`);

    if (!raw) {
      return null;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      await this.logout(token);
      return null;
    }

    const parsed = legacySessionSchema.safeParse(payload);

    if (!parsed.success) {
      return null;
    }

    if (parsed.data.expiresAt && parsed.data.expiresAt < Date.now()) {
      await this.logout(token);
      return null;
    }

    return {
      ...parsed.data,
      isLogined: true,
    };
  }

  async login(input: {
    username: string;
    password: string;
    remember?: boolean;
    surface: CognitoSurface;
  }): Promise<AuthLoginResult> {
    await this.assertAccountRateLimit('login', input.username, 15, 300);
    return this.loginWithCognito(input);
  }

  private async issueSession(
    account: SessionAccountRecord,
    ttlSeconds: number,
    loginIdentifier: string,
  ): Promise<{ token: string; session: AuthSession; csrfToken: string }> {
    const identity = resolveSessionIdentity({
      studentNo: account.studentProfileNo,
      staffNo: account.staffNo,
      providerAccountId: account.providerAccountId,
      username: loginIdentifier,
    });
    const grants = await this.getGrantsForUser(account.userId, identity.stuid ?? account.staffNo);
    const token = randomUUID();
    const now = Date.now();
    const session: AuthSession = {
      iamId: account.userId,
      userId: account.userId,
      plmaId: 0,
      roles: grants.roles,
      permissions: grants.permissions,
      expiresAt: now + ttlSeconds * 1000,
      ...(identity.stuid ? { stuid: identity.stuid } : {}),
      identifier: identity.identifier,
      identityType: identity.identityType,
      name: account.name,
      jshsus: identity.identifier,
      isLogined: true,
    };

    await this.redis.setJson(`iam_token:${token}`, session, ttlSeconds);
    await this.redis.addToSet(`iam_user_sessions:${account.userId}`, token, ttlSeconds);
    await Promise.all([
      this.database.db
        .update(schema.users)
        .set({ lastLoginAt: new Date() })
        .where(eq(schema.users.id, account.userId)),
      this.database.writeAudit({
        actorId: account.userId,
        action: 'auth.login',
        targetType: 'users',
        targetId: account.userId,
      }),
    ]);

    return {
      token,
      session,
      csrfToken: this.createCsrfToken(token),
    };
  }

  private async loginWithCognito(
    input: {
      username: string;
      password: string;
      remember?: boolean;
      surface: CognitoSurface;
    },
    expected?: { expectedUserId: number; expectedSubject: string },
  ): Promise<AuthLoginResult> {
    const result = await this.cognito
      .authenticate(input.username.trim(), input.password, input.surface)
      .catch((error) => this.throwMappedCognitoError(error));

    if (result.kind === 'new-password-required') {
      const flowId = randomUUID();
      await this.redis.setJson(
        this.cognitoFlowKey(flowId),
        {
          username: result.username,
          requiredAttributes: result.requiredAttributes,
          session: result.session,
          surface: input.surface,
          remember: input.remember === true,
          ...expected,
        },
        env.COGNITO_FLOW_TTL_SECONDS,
      );

      return { status: 'NEW_PASSWORD_REQUIRED', flowId };
    }

    return {
      status: 'AUTHENTICATED',
      persistent: input.remember === true,
      ...(await this.createCognitoSession({
        subject: result.subject,
        username: result.username,
        remember: input.remember === true,
        ...expected,
      })),
    };
  }

  async completeNewPassword(
    flowId: string,
    newPassword: string,
    surface: CognitoSurface,
  ): Promise<AuthLoginResult> {
    const flowKey = this.cognitoFlowKey(flowId);
    const rawFlow = await this.redis.take(flowKey);

    if (!rawFlow) {
      throw new BadRequestException({
        code: 'AUTH_FLOW_EXPIRED',
        message: '비밀번호 변경 시간이 만료되었습니다. 다시 로그인해 주세요.',
      });
    }

    let decodedFlow: unknown;
    try {
      decodedFlow = JSON.parse(rawFlow);
    } catch {
      decodedFlow = null;
    }

    const parsedFlow = cognitoChallengeFlowSchema.safeParse(decodedFlow);
    if (!parsedFlow.success) {
      throw new BadRequestException({
        code: 'AUTH_FLOW_EXPIRED',
        message: '비밀번호 변경 절차를 다시 시작해 주세요.',
      });
    }

    if (parsedFlow.data.surface !== surface) {
      throw new BadRequestException({
        code: 'AUTH_FLOW_EXPIRED',
        message: '비밀번호 변경 절차를 다시 시작해 주세요.',
      });
    }

    let result: Awaited<ReturnType<CognitoAuthService['completeNewPassword']>>;
    try {
      result = await this.cognito.completeNewPassword({
        username: parsedFlow.data.username,
        newPassword,
        requiredAttributeValues: await this.resolveRequiredCognitoAttributes(parsedFlow.data),
        session: parsedFlow.data.session,
        surface: parsedFlow.data.surface,
      });
    } catch (error) {
      // Cognito normally keeps the challenge session usable when the proposed
      // password merely fails its policy. Restore it so the user can correct
      // the password without restarting the entire login.
      if (
        error instanceof CognitoAuthError &&
        error.code === 'AUTH_INVALID_PASSWORD' &&
        error.causeName === 'InvalidPasswordException'
      ) {
        await this.redis.setJson(flowKey, parsedFlow.data, env.COGNITO_FLOW_TTL_SECONDS);
      }

      if (
        error instanceof CognitoAuthError &&
        error.code === 'AUTH_INVALID_PASSWORD' &&
        error.causeName === 'InvalidParameterException'
      ) {
        throw new BadRequestException({
          code: 'AUTH_FLOW_EXPIRED',
          message: '비밀번호 변경 절차를 다시 시작해 주세요.',
        });
      }

      this.throwMappedCognitoError(error);
    }

    return {
      status: 'AUTHENTICATED',
      persistent: parsedFlow.data.remember,
      ...(await this.createCognitoSession({
        subject: result.subject,
        username: result.username,
        remember: parsedFlow.data.remember,
        expectedUserId: parsedFlow.data.expectedUserId,
        expectedSubject: parsedFlow.data.expectedSubject,
      })),
    };
  }

  async requestPasswordReset(username: string, surface: CognitoSurface): Promise<{ ok: true }> {
    await this.assertAccountRateLimit('forgot', username, 5, 900);
    try {
      await this.cognito.forgotPassword(username.trim(), surface);
    } catch (error) {
      // Unknown accounts intentionally receive the same response as existing
      // accounts so this endpoint cannot be used to enumerate school IDs.
      if (error instanceof CognitoAuthError && error.code === 'AUTH_INVALID_CREDENTIALS') {
        return { ok: true };
      }

      this.throwMappedCognitoError(error);
    }

    return { ok: true };
  }

  async confirmPasswordReset(input: {
    username: string;
    code: string;
    newPassword: string;
    surface: CognitoSurface;
  }): Promise<{ ok: true }> {
    await this.assertAccountRateLimit('confirm', input.username, 10, 900);
    try {
      await this.cognito.confirmForgotPassword({
        username: input.username.trim(),
        code: input.code.trim(),
        newPassword: input.newPassword,
        surface: input.surface,
      });
    } catch (error) {
      if (error instanceof CognitoAuthError && error.code === 'AUTH_INVALID_CREDENTIALS') {
        throw new BadRequestException({
          code: 'AUTH_CODE_MISMATCH',
          message: '인증 코드 또는 계정 정보를 확인해 주세요.',
        });
      }

      this.throwMappedCognitoError(error);
    }

    return { ok: true };
  }

  private async createCognitoSession(input: {
    subject: string;
    username: string;
    remember: boolean;
    expectedUserId?: number;
    expectedSubject?: string;
  }): Promise<{ token: string; session: AuthSession; csrfToken: string }> {
    if (input.expectedSubject && input.expectedSubject !== input.subject) {
      throw new UnauthorizedException({
        code: 'AUTH_ACCOUNT_LINK_MISMATCH',
        message: '연결된 통합로그인 계정을 확인해 주세요.',
      });
    }

    const account = await this.findCognitoAccountBySubject(input.subject);

    if (!account) {
      throw new UnauthorizedException({
        code: 'AUTH_ACCOUNT_NOT_LINKED',
        message: '통합로그인 계정이 과구리 계정과 연결되어 있지 않습니다.',
      });
    }

    // A user must have exactly one Cognito identity. This runtime guard also
    // protects Cognito-only logins until the database can safely add a unique
    // (user_id, provider) constraint after existing data has been audited.
    const canonicalLink = await this.findCognitoLinkForUser(account.userId);
    if (!canonicalLink || canonicalLink.subject !== input.subject) {
      throw new ServiceUnavailableException({
        code: 'AUTH_ACCOUNT_LINK_CONFLICT',
        message: '통합로그인 계정 연결을 학교 담당자에게 확인해 주세요.',
      });
    }

    if (
      account.status !== 'active' ||
      (input.expectedUserId !== undefined && account.userId !== input.expectedUserId)
    ) {
      throw new UnauthorizedException({
        code: 'AUTH_ACCOUNT_NOT_LINKED',
        message: '통합로그인 계정이 과구리 계정과 연결되어 있지 않습니다.',
      });
    }

    const ttlSeconds = input.remember
      ? env.IAM_REMEMBER_TOKEN_TTL_SECONDS
      : env.IAM_TOKEN_TTL_SECONDS;

    return this.issueSession(account, ttlSeconds, input.username);
  }

  private cognitoFlowKey(flowId: string): string {
    const digest = createHash('sha256').update(flowId).digest('hex');
    return `auth:cognito:challenge:${digest}`;
  }

  private async assertAccountRateLimit(
    action: string,
    identifier: string,
    max: number,
    windowSeconds: number,
  ): Promise<void> {
    const normalized = identifier.trim().toLocaleLowerCase('en-US');
    const digest = createHash('sha256').update(normalized).digest('hex');
    const count = await this.redis.incrementWithTtl(
      `rate:auth-account:${action}:${digest}`,
      windowSeconds,
    );

    if (count > max) {
      throw new HttpException(
        {
          code: 'AUTH_RATE_LIMITED',
          message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private throwMappedCognitoError(error: unknown): never {
    if (!(error instanceof CognitoAuthError)) {
      throw new ServiceUnavailableException({
        code: 'AUTH_PROVIDER_UNAVAILABLE',
        message: '인증 서버에 연결하지 못했습니다.',
      });
    }

    const payload = { code: error.code, message: error.message };

    switch (error.code) {
      case 'AUTH_INVALID_CREDENTIALS':
        throw new UnauthorizedException(payload);
      case 'AUTH_PASSWORD_RESET_REQUIRED':
      case 'AUTH_USER_NOT_CONFIRMED':
      case 'AUTH_PASSWORD_CHANGED_RELOGIN_REQUIRED':
      case 'AUTH_ACCOUNT_ATTRIBUTES_REQUIRED':
        throw new ConflictException(payload);
      case 'AUTH_CODE_MISMATCH':
      case 'AUTH_CODE_EXPIRED':
      case 'AUTH_INVALID_PASSWORD':
      case 'AUTH_UNSUPPORTED_CHALLENGE':
        throw new BadRequestException(payload);
      case 'AUTH_RATE_LIMITED':
        throw new HttpException(payload, HttpStatus.TOO_MANY_REQUESTS);
      default:
        throw new ServiceUnavailableException(payload);
    }
  }

  private async findCognitoLinkForUser(userId: number) {
    const accounts = await this.database.db
      .select({ subject: schema.authAccounts.providerAccountId })
      .from(schema.authAccounts)
      .where(
        and(eq(schema.authAccounts.userId, userId), eq(schema.authAccounts.provider, 'cognito')),
      )
      .limit(2);

    if (accounts.length > 1) {
      throw new ServiceUnavailableException({
        code: 'AUTH_ACCOUNT_LINK_CONFLICT',
        message: '통합로그인 계정 연결을 학교 담당자에게 확인해 주세요.',
      });
    }

    const [account] = accounts;
    return account?.subject ? { subject: account.subject } : null;
  }

  private async resolveRequiredCognitoAttributes(
    flow: CognitoChallengeFlow,
  ): Promise<Record<string, string>> {
    const values: Record<string, string> = {};

    for (const attribute of flow.requiredAttributes) {
      const responseName = attribute.startsWith('userAttributes.')
        ? attribute
        : `userAttributes.${attribute}`;

      if (responseName === 'userAttributes.email') {
        values[responseName] = await this.resolveCognitoEmail(flow);
        continue;
      }

      throw new ConflictException({
        code: 'AUTH_ACCOUNT_ATTRIBUTES_REQUIRED',
        message: '계정에 필요한 정보를 학교 담당자가 먼저 확인해야 합니다.',
      });
    }

    return values;
  }

  private async resolveCognitoEmail(flow: CognitoChallengeFlow): Promise<string> {
    const byUserId = flow.expectedUserId ? await this.findUserEmailById(flow.expectedUserId) : null;
    if (byUserId) return byUserId;

    const numericUsername = Number(flow.username);
    if (Number.isSafeInteger(numericUsername) && numericUsername > 0) {
      const [student] = await this.database.db
        .select({ email: schema.users.email })
        .from(schema.students)
        .innerJoin(schema.users, eq(schema.students.userId, schema.users.id))
        .where(eq(schema.students.studentNo, numericUsername))
        .limit(1);
      if (student?.email) return student.email;

      const [staff] = await this.database.db
        .select({ email: schema.users.email })
        .from(schema.staffProfiles)
        .innerJoin(schema.users, eq(schema.staffProfiles.userId, schema.users.id))
        .where(eq(schema.staffProfiles.staffNo, numericUsername))
        .limit(1);
      if (staff?.email) return staff.email;
    }

    return this.fallbackCognitoEmail(flow.username);
  }

  private async findUserEmailById(userId: number): Promise<string | null> {
    const [user] = await this.database.db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    return user?.email ?? null;
  }

  private fallbackCognitoEmail(username: string): string {
    const normalized = username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    if (normalized) return `${normalized}@jshsus.kr`;

    const digest = createHash('sha256').update(username).digest('hex').slice(0, 16);
    return `user-${digest}@jshsus.kr`;
  }

  private async findCognitoAccountBySubject(subject: string) {
    const [account] = await this.database.db
      .select({
        userId: schema.users.id,
        authAccountId: schema.authAccounts.id,
        providerAccountId: schema.authAccounts.providerAccountId,
        studentProfileNo: schema.students.studentNo,
        staffNo: schema.staffProfiles.staffNo,
        name: schema.users.name,
        status: schema.users.status,
      })
      .from(schema.authAccounts)
      .innerJoin(schema.users, eq(schema.authAccounts.userId, schema.users.id))
      .leftJoin(schema.students, eq(schema.students.userId, schema.users.id))
      .leftJoin(schema.staffProfiles, eq(schema.staffProfiles.userId, schema.users.id))
      .where(
        and(
          eq(schema.authAccounts.provider, 'cognito'),
          eq(schema.authAccounts.providerAccountId, subject),
        ),
      )
      .limit(1);

    return account ?? null;
  }

  private async getGrantsForUser(
    userId: number,
    legacyIdentifier?: number | null,
  ): Promise<{ roles: UserRole[]; permissions: string[] }> {
    const [roleRows, rolePermissionRows, userPermissionRows] = await Promise.all([
      this.database.db
        .select({ name: schema.roles.name })
        .from(schema.userRoles)
        .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
        .where(eq(schema.userRoles.userId, userId)),
      this.database.db
        .select({ name: schema.permissions.name })
        .from(schema.userRoles)
        .innerJoin(
          schema.rolePermissions,
          eq(schema.userRoles.roleId, schema.rolePermissions.roleId),
        )
        .innerJoin(
          schema.permissions,
          eq(schema.rolePermissions.permissionId, schema.permissions.id),
        )
        .where(eq(schema.userRoles.userId, userId)),
      this.database.db
        .select({
          name: schema.permissions.name,
          hasPermission: schema.userPermissions.hasPermission,
        })
        .from(schema.userPermissions)
        .innerJoin(
          schema.permissions,
          eq(schema.userPermissions.permissionId, schema.permissions.id),
        )
        .where(eq(schema.userPermissions.userId, userId)),
    ]);

    const roleSet = new Set(roleRows.map((row) => row.name as UserRole));
    const legacyId =
      legacyIdentifier === undefined || legacyIdentifier === null ? '' : String(legacyIdentifier);

    // Student-affairs authority is managed exclusively through IAM roles.
    // The system-admin allow-list remains only as an emergency legacy bridge.
    if (env.LEGACY_SYSTEM_ADMIN_STUIDS.includes(legacyId)) {
      roleSet.add('system_admin');
    }

    if (roleSet.size === 0) {
      roleSet.add('student');
    }

    const permissionSet = new Set(rolePermissionRows.map((row) => row.name));

    for (const permission of userPermissionRows) {
      if (permission.hasPermission) {
        permissionSet.add(permission.name);
      } else {
        permissionSet.delete(permission.name);
      }
    }

    return { roles: Array.from(roleSet), permissions: Array.from(permissionSet) };
  }

  createCsrfToken(sessionToken: string): string {
    return createHmac('sha256', env.CSRF_SECRET).update(sessionToken).digest('hex');
  }

  verifyCsrfToken(sessionToken: string, csrfToken: string): boolean {
    const expected = this.createCsrfToken(sessionToken);

    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(csrfToken));
    } catch {
      return false;
    }
  }

  async logout(token: string): Promise<void> {
    await this.redis.delete(`iam_token:${token}`);
  }

  async invalidateUserSessions(userId: number): Promise<void> {
    const indexKey = `iam_user_sessions:${userId}`;
    const tokens = await this.redis.setMembers(indexKey);
    await this.redis.deleteMany(tokens.map((token) => `iam_token:${token}`));
    await this.redis.delete(indexKey);
  }
}
