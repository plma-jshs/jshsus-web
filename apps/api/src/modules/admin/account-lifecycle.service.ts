import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as schema from '@jshsus/db';
import { and, eq, ne, sql } from 'drizzle-orm';
import { AuthService } from '../auth/auth.service';
import { CognitoAuthService } from '../auth/cognito-auth.service';
import { DatabaseService } from '../database/database.service';
import { FilesService } from '../files/files.service';

export type ManagedUserStatus = 'active' | 'graduated' | 'deleted';
export type ManagedIdentityType = 'student' | 'staff' | null;

const MASKED_AUTHOR_NAME = '탈퇴한 사용자';
const MASKED_THANKS_AUTHOR = '익명';
const COGNITO_GRACE_DAYS = 30;

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

export function assertManagedStatusMatchesIdentity(
  identityType: ManagedIdentityType,
  status: ManagedUserStatus,
) {
  if (identityType === 'student' && status === 'deleted') {
    throw new BadRequestException('학생 계정은 active 또는 graduated 상태만 사용할 수 있습니다.');
  }
  if (identityType === 'staff' && status === 'graduated') {
    throw new BadRequestException('교직원 계정은 active 또는 deleted 상태만 사용할 수 있습니다.');
  }
  if (!identityType && status === 'graduated') {
    throw new BadRequestException('학생 프로필이 없는 계정은 graduated 상태를 사용할 수 없습니다.');
  }
}

@Injectable()
export class AccountLifecycleService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auth: AuthService,
    private readonly cognito: CognitoAuthService,
    private readonly files: FilesService,
  ) {}

  async changeStatus(input: {
    userId: number;
    nextStatus: ManagedUserStatus;
    actorId?: number | null;
  }) {
    const identity = await this.loadIdentity(input.userId);
    this.assertStatusMatchesIdentity(identity, input.nextStatus);
    if (
      identity.status === input.nextStatus &&
      (input.nextStatus === 'active' || identity.deactivatedAt)
    ) {
      return {
        ok: true as const,
        userId: input.userId,
        status: input.nextStatus,
        unchanged: true,
        cognitoPending: false,
      };
    }
    if (input.nextStatus === 'active') {
      throw new BadRequestException(
        '비활성화된 계정의 복구는 명단 재반영과 계정 재발급 절차로 진행해야 합니다.',
      );
    }

    const now = new Date();
    const cognitoDeleteAfter = identity.cognitoSubject ? addDays(now, COGNITO_GRACE_DAYS) : null;
    const counts = await this.database.db.transaction(async (tx) => {
      const [contentCounts, authCounts] = await Promise.all([
        tx
          .select({
            posts:
              sql<number>`cast((select count(*) from ${schema.posts} where ${schema.posts.authorId} = ${input.userId}) as unsigned)`.mapWith(
                Number,
              ),
            comments:
              sql<number>`cast((select count(*) from ${schema.comments} where ${schema.comments.authorId} = ${input.userId}) as unsigned)`.mapWith(
                Number,
              ),
            thanks:
              identity.studentNo == null
                ? sql<number>`0`.mapWith(Number)
                : sql<number>`cast((select count(*) from ${schema.thanksMessages} where ${schema.thanksMessages.schoolNumber} = ${String(identity.studentNo)}) as unsigned)`.mapWith(
                    Number,
                  ),
          })
          .from(schema.users)
          .where(eq(schema.users.id, input.userId))
          .limit(1),
        tx
          .select({
            localAccounts:
              sql<number>`cast((select count(*) from ${schema.authAccounts} where ${schema.authAccounts.userId} = ${input.userId} and ${schema.authAccounts.provider} <> 'cognito') as unsigned)`.mapWith(
                Number,
              ),
            roles:
              sql<number>`cast((select count(*) from ${schema.userRoles} where ${schema.userRoles.userId} = ${input.userId}) as unsigned)`.mapWith(
                Number,
              ),
            permissions:
              sql<number>`cast((select count(*) from ${schema.userPermissions} where ${schema.userPermissions.userId} = ${input.userId}) as unsigned)`.mapWith(
                Number,
              ),
          })
          .from(schema.users)
          .where(eq(schema.users.id, input.userId))
          .limit(1),
      ]);

      await tx
        .update(schema.users)
        .set({
          status: input.nextStatus,
          statusChangedAt: now,
          deactivatedAt: now,
          cognitoDeleteAfter,
          email: null,
          phone: null,
          nickname: null,
          gender: null,
          grade: null,
          classNo: null,
          number: null,
          updatedAt: now,
        })
        .where(eq(schema.users.id, input.userId));

      if (identity.studentId) {
        await tx
          .update(schema.studentEnrollments)
          .set({ status: 'graduated', statusChangedAt: now, updatedAt: now })
          .where(eq(schema.studentEnrollments.studentId, identity.studentId));
      }

      await Promise.all([
        tx
          .delete(schema.authAccounts)
          .where(
            and(
              eq(schema.authAccounts.userId, input.userId),
              ne(schema.authAccounts.provider, 'cognito'),
            ),
          ),
        tx.delete(schema.userRoles).where(eq(schema.userRoles.userId, input.userId)),
        tx.delete(schema.userPermissions).where(eq(schema.userPermissions.userId, input.userId)),
        tx
          .update(schema.posts)
          .set({ authorId: null, authorName: MASKED_AUTHOR_NAME, updatedAt: now })
          .where(eq(schema.posts.authorId, input.userId)),
        tx
          .update(schema.comments)
          .set({ authorId: null, authorName: MASKED_AUTHOR_NAME, updatedAt: now })
          .where(eq(schema.comments.authorId, input.userId)),
      ]);

      if (identity.identityNumber != null && identity.identityType) {
        await tx
          .delete(schema.accountActivationCodes)
          .where(
            and(
              eq(schema.accountActivationCodes.identityType, identity.identityType),
              eq(schema.accountActivationCodes.identityNumber, identity.identityNumber),
            ),
          );
      }
      if (identity.studentNo != null) {
        await tx
          .update(schema.thanksMessages)
          .set({ schoolNumber: MASKED_THANKS_AUTHOR, updatedAt: now })
          .where(eq(schema.thanksMessages.schoolNumber, String(identity.studentNo)));
      }

      const statusChangeKey = now.toISOString();
      const erasureJobs: Array<typeof schema.privacyErasureJobs.$inferInsert> = [
        {
          policyKey: 'account_profile',
          dedupeKey: `account-profile:${input.userId}:${statusChangeKey}`,
          targetUserId: input.userId,
          mode: 'apply',
          status: 'completed',
          scheduledFor: now,
          cutoffAt: now,
          startedAt: now,
          completedAt: now,
          resultCounts: {
            users: 1,
            localAuthAccounts: authCounts[0]?.localAccounts ?? 0,
            roles: authCounts[0]?.roles ?? 0,
            permissions: authCounts[0]?.permissions ?? 0,
          },
        },
        {
          policyKey: 'community_authorship',
          dedupeKey: `community-authorship:${input.userId}:${statusChangeKey}`,
          targetUserId: input.userId,
          mode: 'apply',
          status: 'completed',
          scheduledFor: now,
          cutoffAt: now,
          startedAt: now,
          completedAt: now,
          resultCounts: {
            posts: contentCounts[0]?.posts ?? 0,
            comments: contentCounts[0]?.comments ?? 0,
          },
        },
        {
          policyKey: 'thanks_authorship',
          dedupeKey: `thanks-authorship:${input.userId}:${statusChangeKey}`,
          targetUserId: input.userId,
          mode: 'apply',
          status: 'completed',
          scheduledFor: now,
          cutoffAt: now,
          startedAt: now,
          completedAt: now,
          resultCounts: { messages: contentCounts[0]?.thanks ?? 0 },
        },
      ];
      if (cognitoDeleteAfter) {
        erasureJobs.push({
          policyKey: 'cognito_accounts',
          dedupeKey: `cognito-delete:${input.userId}:${cognitoDeleteAfter.toISOString()}`,
          targetUserId: input.userId,
          mode: 'apply',
          status: 'pending',
          scheduledFor: cognitoDeleteAfter,
          cutoffAt: now,
        });
      }
      await tx.insert(schema.privacyErasureJobs).values(erasureJobs);

      return {
        posts: contentCounts[0]?.posts ?? 0,
        comments: contentCounts[0]?.comments ?? 0,
        thanks: contentCounts[0]?.thanks ?? 0,
      };
    });

    await this.auth.invalidateUserSessions(input.userId);
    const profileCleanup = await this.files.deleteForTarget('profile', input.userId);

    let cognitoPending = false;
    if (identity.cognitoSubject) {
      try {
        await this.cognito.disableAndScrubUser({
          subject: identity.cognitoSubject,
          fallbackUsername: String(identity.identityNumber ?? ''),
        });
      } catch {
        // The DB state is already fail-closed and the daily retention job will
        // retry this idempotent Cognito operation without restoring access.
        cognitoPending = true;
      }
    }

    await this.database.writeAudit({
      actorId: input.actorId,
      action: 'admin.account.deactivate',
      targetType: identity.identityType === 'student' ? 'students' : 'staff_profiles',
      targetId: identity.studentId ?? identity.staffId ?? input.userId,
    });

    return {
      ok: true as const,
      userId: input.userId,
      status: input.nextStatus,
      unchanged: false,
      cognitoPending,
      cleanupPending: profileCleanup.failed > 0,
      anonymized: counts,
      cognitoDeleteAfter: cognitoDeleteAfter?.toISOString(),
    };
  }

  private async loadIdentity(userId: number) {
    const [identity] = await this.database.db
      .select({
        userId: schema.users.id,
        status: schema.users.status,
        deactivatedAt: schema.users.deactivatedAt,
        studentId: schema.students.id,
        studentNo: schema.students.studentNo,
        staffId: schema.staffProfiles.id,
        staffNo: schema.staffProfiles.staffNo,
        cognitoSubject: schema.authAccounts.providerAccountId,
      })
      .from(schema.users)
      .leftJoin(schema.students, eq(schema.students.userId, schema.users.id))
      .leftJoin(schema.staffProfiles, eq(schema.staffProfiles.userId, schema.users.id))
      .leftJoin(
        schema.authAccounts,
        and(
          eq(schema.authAccounts.userId, schema.users.id),
          eq(schema.authAccounts.provider, 'cognito'),
        ),
      )
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!identity) throw new NotFoundException('User not found.');

    return {
      ...identity,
      identityType: identity.studentId
        ? ('student' as const)
        : identity.staffId
          ? ('staff' as const)
          : null,
      identityNumber: identity.studentNo ?? identity.staffNo ?? null,
    };
  }

  private assertStatusMatchesIdentity(
    identity: Awaited<ReturnType<AccountLifecycleService['loadIdentity']>>,
    status: ManagedUserStatus,
  ) {
    assertManagedStatusMatchesIdentity(identity.identityType, status);
  }
}
