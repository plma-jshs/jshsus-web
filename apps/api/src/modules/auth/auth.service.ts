import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as schema from '@jshsus/db';
import type { Request } from 'express';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { UserRole } from '@jshsus/types';
import { argon2id, hash as hashArgon2, verify as verifyArgon2 } from 'argon2';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { env } from '../../shared/config/env';

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

export function resolveSessionIdentity(input: {
  studentNo?: number | null;
  legacyStudentNo?: number | null;
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
  if (input.legacyStudentNo) {
    return {
      identifier: String(input.legacyStudentNo),
      identityType: 'student',
      stuid: input.legacyStudentNo,
    };
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

  async createDevelopmentSession(input: {
    username: string;
    password: string;
    role?: UserRole;
    ttlSeconds?: number;
  }): Promise<{ token: string; session: AuthSession; csrfToken: string }> {
    if (!env.ALLOW_DEV_AUTH || env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Development login is disabled.');
    }

    if (input.password !== env.DEV_AUTH_PASSWORD) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const token = randomUUID();
    const role = input.role ?? 'system_admin';
    const ttlSeconds = input.ttlSeconds ?? env.IAM_TOKEN_TTL_SECONDS;
    const now = Date.now();
    const session: AuthSession = {
      iamId: 0,
      userId: 0,
      plmaId: 0,
      roles: [role],
      permissions: [role],
      expiresAt: now + ttlSeconds * 1000,
      name: input.username || 'local-admin',
      isLogined: true,
    };

    await this.redis.setJson(`iam_token:${token}`, session, ttlSeconds);

    return {
      token,
      session,
      csrfToken: this.createCsrfToken(token),
    };
  }

  async login(input: {
    username: string;
    password: string;
    devRole?: UserRole;
    remember?: boolean;
  }): Promise<{ token: string; session: AuthSession; csrfToken: string }> {
    const ttlSeconds = input.remember
      ? env.IAM_REMEMBER_TOKEN_TTL_SECONDS
      : env.IAM_TOKEN_TTL_SECONDS;

    try {
      return await this.createPasswordSession(input.username, input.password, ttlSeconds);
    } catch (error) {
      if (
        env.ALLOW_DEV_AUTH &&
        env.NODE_ENV !== 'production' &&
        input.password === env.DEV_AUTH_PASSWORD
      ) {
        return this.createDevelopmentSession({
          username: input.username,
          password: input.password,
          role: input.devRole,
          ttlSeconds,
        });
      }

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid credentials.');
    }
  }

  async createPasswordSession(
    username: string,
    password: string,
    ttlSeconds = env.IAM_TOKEN_TTL_SECONDS,
  ): Promise<{ token: string; session: AuthSession; csrfToken: string }> {
    const account = await this.findPasswordAccount(username);

    if (
      !account?.passwordHash ||
      account.status !== 'active' ||
      !(await this.verifyPassword(password, account.passwordHash, account.passwordAlgorithm))
    ) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (account.passwordAlgorithm === 'legacy-sha512' && env.PASSWORD_REHASH_ON_LOGIN) {
      const passwordHash = await hashArgon2(password, { type: argon2id });
      await this.database.db
        .update(schema.authAccounts)
        .set({ passwordHash, passwordAlgorithm: 'argon2id', updatedAt: new Date() })
        .where(eq(schema.authAccounts.id, account.authAccountId));
    }

    const identity = resolveSessionIdentity({
      studentNo: account.studentProfileNo,
      legacyStudentNo: account.staffNo ? undefined : account.legacyStudentNo,
      staffNo: account.staffNo,
      providerAccountId: account.providerAccountId,
      username,
    });
    const grants = await this.getGrantsForUser(account.userId, identity.stuid ?? account.staffNo);
    const token = randomUUID();
    const now = Date.now();
    const session: AuthSession = {
      iamId: account.legacyIamId ?? account.userId,
      userId: account.userId,
      plmaId: account.legacyPlmaId ?? 0,
      roles: grants.roles,
      permissions: grants.permissions,
      expiresAt: now + ttlSeconds * 1000,
      ...(identity.stuid ? { stuid: identity.stuid } : {}),
      identifier: identity.identifier,
      identityType: identity.identityType,
      name: account.name,
      jshsus: account.legacyJshsusId ?? identity.identifier,
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

  private async findPasswordAccount(username: string) {
    const normalized = username.trim();

    if (!normalized) {
      return null;
    }

    const [account] = await this.database.db
      .select({
        userId: schema.users.id,
        authAccountId: schema.authAccounts.id,
        legacyIamId: schema.users.legacyIamId,
        legacyPlmaId: schema.users.legacyPlmaId,
        legacyJshsusId: schema.users.legacyJshsusId,
        providerAccountId: schema.authAccounts.providerAccountId,
        legacyStudentNo: schema.users.studentNo,
        studentProfileNo: schema.students.studentNo,
        staffNo: schema.staffProfiles.staffNo,
        name: schema.users.name,
        status: schema.users.status,
        passwordHash: schema.authAccounts.passwordHash,
        passwordAlgorithm: schema.authAccounts.passwordAlgorithm,
      })
      .from(schema.authAccounts)
      .innerJoin(schema.users, eq(schema.authAccounts.userId, schema.users.id))
      .leftJoin(schema.students, eq(schema.students.userId, schema.users.id))
      .leftJoin(schema.staffProfiles, eq(schema.staffProfiles.userId, schema.users.id))
      .where(
        and(
          eq(schema.authAccounts.provider, 'local'),
          eq(schema.authAccounts.providerAccountId, normalized),
        ),
      )
      .limit(1);

    return account ?? null;
  }

  private async verifyPassword(
    password: string,
    passwordHash: string,
    algorithm: string,
  ): Promise<boolean> {
    if (algorithm === 'argon2id') {
      try {
        return await verifyArgon2(passwordHash, password);
      } catch {
        return false;
      }
    }

    if (algorithm !== 'legacy-sha512') {
      return false;
    }

    const expected = createHash('sha512').update(password).digest('base64');

    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(passwordHash));
    } catch {
      return false;
    }
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
