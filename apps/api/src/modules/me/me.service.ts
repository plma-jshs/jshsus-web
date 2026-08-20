import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as schema from '@jshsus/db';
import type { ActivityRequestSummary, PointRecord, StudentSelfStatus } from '@jshsus/types';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AuthService, type AuthSession } from '../auth/auth.service';
import { CognitoAuthError, CognitoAuthService } from '../auth/cognito-auth.service';
import { AuthDeliveryService } from '../messaging/auth-delivery.service';
import { DatabaseService } from '../database/database.service';
import { meritPointBalanceSql, penaltyPointBalanceSql } from '../points/point-balance.query';
import { RedisService } from '../redis/redis.service';
import { env } from '../../shared/config/env';

const CONTACT_VERIFICATION_TTL_SECONDS = 300;

function toDateOnly(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function deviceCaseIdsForClass(grade: number, classNo: number) {
  if (grade < 1 || grade > 3 || classNo < 1 || classNo > 4) return [];
  const firstId = ((grade - 1) * 4 + (classNo - 1)) * 2 + 1;
  return [firstId, firstId + 1];
}

function deviceCaseLabel(id: number) {
  const pairIndex = Math.floor((id - 1) / 2);
  const grade = Math.floor(pairIndex / 4) + 1;
  const classNo = (pairIndex % 4) + 1;
  return `${grade}-${classNo} (${id % 2 === 1 ? '상' : '하'})`;
}

function toActivitySummary(row: {
  id: number;
  createdAt: Date;
  studentNo: number;
  studentName: string;
  teacherName: string | null;
  location: string;
  startsAt: Date;
  endsAt: Date;
  purpose: string;
  status: ActivityRequestSummary['status'];
  issuedNumber: string | null;
  rejectionReason: string | null;
}): ActivityRequestSummary {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    studentNo: row.studentNo,
    studentName: row.studentName,
    teacherName: row.teacherName ?? undefined,
    location: row.location,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    purpose: row.purpose,
    status: row.status,
    issuedNumber: row.issuedNumber ?? undefined,
    rejectionReason: row.rejectionReason ?? undefined,
  };
}
const profileUpdateSchema = z.object({
  nickname: z.string().trim().max(16),
});

const contactUpdateSchema = z.discriminatedUnion('field', [
  z.object({
    field: z.literal('email'),
    value: z.string().trim().email().max(255),
    currentPassword: z.string().min(1).max(128),
    verificationCode: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
  }),
  z.object({
    field: z.literal('phone'),
    value: z
      .string()
      .transform((value) => value.replace(/\D/g, ''))
      .refine((value) => /^010\d{8}$/.test(value), '전화번호를 확인해 주세요.'),
    verificationCode: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
    currentPassword: z.string().min(1).max(128),
  }),
]);

const contactVerificationRequestSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('email'), value: z.string().trim().email().max(255) }),
  z.object({
    field: z.literal('phone'),
    value: z
      .string()
      .transform((value) => value.replace(/\D/g, ''))
      .refine((value) => /^010\d{8}$/.test(value), '전화번호를 확인해 주세요.'),
  }),
]);

@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly auth: AuthService,
    private readonly cognito: CognitoAuthService,
    private readonly redis: RedisService,
    private readonly authDelivery: AuthDeliveryService,
  ) {}

  async status(session?: AuthSession): Promise<StudentSelfStatus> {
    if (!session) {
      throw new UnauthorizedException('Student session is required.');
    }

    return this.database.query('me.status', async (db) => {
      const persistedUserId =
        session.userId && session.userId > 0
          ? session.userId
          : session.iamId && session.iamId > 0
            ? session.iamId
            : 0;
      if (!persistedUserId) {
        throw new UnauthorizedException('A persisted student session is required.');
      }

      const [account] = await db
        .select({
          studentNo: schema.users.studentNo,
          nickname: schema.users.nickname,
          email: schema.users.email,
          phone: schema.users.phone,
        })
        .from(schema.users)
        .where(eq(schema.users.id, persistedUserId))
        .limit(1);
      const identifierStudentNo =
        session.identityType === 'student' && /^\d+$/.test(session.identifier ?? '')
          ? Number(session.identifier)
          : undefined;
      const studentNo = session.stuid ?? identifierStudentNo ?? account?.studentNo ?? undefined;
      // Cognito 전환 전 생성된 학생 행에는 이전 users.id가 남아 있을 수 있다.
      // 인증된 세션의 학번은 Cognito 계정과 users 호환 필드에서 검증해 만든 값이므로,
      // 이 경우에도 학번으로 학생 프로필을 찾을 수 있어야 한다.
      const studentIdentityCondition = studentNo
        ? eq(schema.students.studentNo, studentNo)
        : undefined;
      const [studentRow] = await db
        .select({
          id: schema.students.id,
          userId: schema.students.userId,
          studentNo: schema.students.studentNo,
          name: schema.students.name,
          grade: schema.students.grade,
          classNo: schema.students.classNo,
          number: schema.students.number,
          currentPoint: schema.students.currentPoint,
        })
        .from(schema.students)
        .where(
          studentIdentityCondition
            ? or(eq(schema.students.userId, persistedUserId), studentIdentityCondition)
            : eq(schema.students.userId, persistedUserId),
        )
        .limit(1);
      const student = studentRow ? { ...studentRow, nickname: account?.nickname ?? null } : null;

      if (!student) {
        throw new BadRequestException('Student profile is not linked to this session.');
      }

      const classDeviceCaseIds = deviceCaseIdsForClass(student.grade, student.classNo);
      const [pointTotals, pointRows, dormRows, deviceRows, profileRows, activityRows] =
        await Promise.all([
          db
            .select({
              meritPoint: meritPointBalanceSql(),
              penaltyPoint: penaltyPointBalanceSql(),
            })
            .from(schema.pointRecords)
            .innerJoin(
              schema.pointReasons,
              eq(schema.pointRecords.reasonId, schema.pointReasons.id),
            )
            .where(
              and(
                eq(schema.pointRecords.studentId, student.id),
                isNull(schema.pointRecords.canceledAt),
              ),
            ),
          db
            .select({
              id: schema.pointRecords.id,
              studentId: schema.students.id,
              studentNo: schema.students.studentNo,
              studentName: schema.students.name,
              teacherName: schema.users.name,
              reason: schema.pointReasons.comment,
              point: schema.pointRecords.point,
              comment: schema.pointRecords.comment,
              baseDate: schema.pointRecords.baseDate,
            })
            .from(schema.pointRecords)
            .innerJoin(schema.students, eq(schema.pointRecords.studentId, schema.students.id))
            .leftJoin(schema.users, eq(schema.pointRecords.teacherId, schema.users.id))
            .innerJoin(
              schema.pointReasons,
              eq(schema.pointRecords.reasonId, schema.pointReasons.id),
            )
            .where(
              and(
                eq(schema.pointRecords.studentId, student.id),
                isNull(schema.pointRecords.canceledAt),
              ),
            )
            .orderBy(desc(schema.pointRecords.baseDate), desc(schema.pointRecords.id))
            .limit(20),
          (student.userId ?? persistedUserId)
            ? db
                .select({
                  roomName: schema.dormRooms.name,
                  dormName: schema.dormRooms.dormName,
                  year: schema.dormAssignments.year,
                  semester: schema.dormAssignments.semester,
                  bedPosition: schema.dormAssignments.bedPosition,
                })
                .from(schema.dormAssignments)
                .innerJoin(schema.dormRooms, eq(schema.dormAssignments.roomId, schema.dormRooms.id))
                .where(eq(schema.dormAssignments.userId, student.userId ?? persistedUserId))
                .orderBy(desc(schema.dormAssignments.year), desc(schema.dormAssignments.semester))
                .limit(1)
            : Promise.resolve([]),
          classDeviceCaseIds.length
            ? db
                .select({
                  id: schema.deviceCases.id,
                  isConnected: schema.deviceCases.isConnected,
                  isOpen: schema.deviceCases.isOpen,
                  lastSeenAt: schema.deviceCases.lastSeenAt,
                })
                .from(schema.deviceCases)
                .where(inArray(schema.deviceCases.id, classDeviceCaseIds))
                .orderBy(schema.deviceCases.id)
            : Promise.resolve([]),
          persistedUserId
            ? db
                .select({ id: schema.files.id })
                .from(schema.files)
                .where(
                  and(
                    eq(schema.files.targetType, 'profile'),
                    eq(schema.files.targetId, persistedUserId),
                    eq(schema.files.visibility, 'public'),
                  ),
                )
                .orderBy(desc(schema.files.uploadedAt), desc(schema.files.id))
                .limit(1)
            : Promise.resolve([]),
          db
            .select({
              id: schema.activityRequests.id,
              createdAt: schema.activityRequests.createdAt,
              studentNo: schema.students.studentNo,
              studentName: schema.students.name,
              teacherName: schema.users.name,
              location: schema.activityRequests.location,
              startsAt: schema.activityRequests.startsAt,
              endsAt: schema.activityRequests.endsAt,
              purpose: schema.activityRequests.purpose,
              status: schema.activityRequests.status,
              issuedNumber: schema.activityRequests.issuedNumber,
              rejectionReason: schema.activityRequests.rejectionReason,
            })
            .from(schema.activityRequests)
            .innerJoin(
              schema.activityRequestParticipants,
              eq(schema.activityRequestParticipants.activityRequestId, schema.activityRequests.id),
            )
            .innerJoin(
              schema.students,
              eq(schema.activityRequests.representativeStudentId, schema.students.id),
            )
            .leftJoin(schema.users, eq(schema.activityRequests.advisorTeacherId, schema.users.id))
            .where(eq(schema.activityRequestParticipants.studentId, student.id))
            .orderBy(desc(schema.activityRequests.startsAt), desc(schema.activityRequests.id))
            .limit(2),
        ]);

      const records: PointRecord[] = pointRows.map((row) => ({
        ...row,
        teacherName: row.teacherName ?? '이관 데이터',
        baseDate: toDateOnly(row.baseDate),
      }));
      const dorm = dormRows[0];
      const deviceCase = deviceRows[0];
      const deviceCaseSummaries = deviceRows.map((row) => ({
        ...row,
        isConnected: true,
        label: deviceCaseLabel(row.id),
        lastSeenAt: row.lastSeenAt.toISOString(),
      }));

      return {
        student: {
          id: student.id,
          studentNo: student.studentNo,
          name: student.name,
          nickname: student.nickname ?? undefined,
          profileImageUrl: profileRows[0]
            ? '/api/files/' + profileRows[0].id + '/content'
            : undefined,
          email: account?.email ?? undefined,
          phone: account?.phone ?? undefined,
          grade: student.grade,
          classNo: student.classNo,
          number: student.number,
        },
        points: {
          currentPoint: student.currentPoint,
          meritPoint: pointTotals[0]?.meritPoint ?? 0,
          penaltyPoint: pointTotals[0]?.penaltyPoint ?? 0,
          records,
        },
        dorm: dorm
          ? {
              roomName: dorm.roomName,
              dormName: dorm.dormName,
              year: dorm.year,
              semester: dorm.semester,
              bedPosition: dorm.bedPosition,
            }
          : undefined,
        deviceCase: deviceCase
          ? {
              ...deviceCase,
              isConnected: true,
              lastSeenAt: deviceCase.lastSeenAt.toISOString(),
            }
          : undefined,
        deviceCases: deviceCaseSummaries,
        latestActivityRequests: activityRows.map(toActivitySummary),
        latestActivityRequest: activityRows[0] ? toActivitySummary(activityRows[0]) : undefined,
      };
    });
  }

  async updateProfile(session: AuthSession | undefined, body: unknown) {
    if (!session?.userId || session.userId <= 0) {
      throw new UnauthorizedException('A persisted student session is required.');
    }

    const parsed = profileUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const nickname = parsed.data.nickname || null;
    if (nickname && (nickname.length < 2 || !/^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9_]+$/.test(nickname))) {
      throw new BadRequestException('닉네임은 한글, 영문, 숫자, 밑줄로 2~16자까지 입력해 주세요.');
    }

    await this.database.db
      .update(schema.users)
      .set({ nickname, updatedAt: new Date() })
      .where(eq(schema.users.id, session.userId));
    await this.database.writeAudit({
      actorId: session.userId,
      action: 'me.profile.update',
      targetType: 'users',
      targetId: session.userId,
    });

    return { ok: true as const, nickname: nickname ?? undefined };
  }

  async updateContact(session: AuthSession | undefined, body: unknown) {
    if (!session?.userId || session.userId <= 0) {
      throw new UnauthorizedException('A persisted student session is required.');
    }

    const parsed = contactUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const [cognitoAccount] = await this.database.db
      .select({ subject: schema.authAccounts.providerAccountId })
      .from(schema.authAccounts)
      .where(
        and(
          eq(schema.authAccounts.userId, session.userId),
          eq(schema.authAccounts.provider, 'cognito'),
        ),
      )
      .limit(1);
    const [currentContact] = await this.database.db
      .select({ email: schema.users.email, phone: schema.users.phone })
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .limit(1);

    if (!currentContact) {
      throw new UnauthorizedException('The current student account could not be found.');
    }

    const value =
      parsed.data.field === 'email'
        ? parsed.data.value.toLocaleLowerCase('en-US')
        : parsed.data.value;
    await this.assertContactVerification(
      session.userId,
      parsed.data.field,
      value,
      parsed.data.verificationCode,
    );
    await this.auth.verifyCurrentPassword(session, parsed.data.currentPassword);
    if (cognitoAccount?.subject) {
      try {
        await this.cognito.updateContactAttributes({
          subject: cognitoAccount.subject,
          fallbackUsername: session.identifier ?? String(session.stuid ?? ''),
          ...(parsed.data.field === 'email'
            ? { email: value, emailVerified: true }
            : { phone: value }),
        });
      } catch (error) {
        if (error instanceof CognitoAuthError) {
          if (error.code === 'AUTH_CONTACT_ALREADY_IN_USE') {
            throw new ConflictException({
              code: 'CONTACT_ALREADY_IN_USE',
              message: '이미 다른 통합로그인 계정에서 사용 중인 연락처입니다.',
            });
          }
          this.logger.warn(
            `Contact provider update failed: field=${parsed.data.field} cause=${
              error.causeName ?? 'unknown'
            }`,
          );
          throw new ServiceUnavailableException({
            code: 'CONTACT_PROVIDER_UPDATE_FAILED',
            message: '통합로그인 연락처를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.',
          });
        }
        throw error;
      }
    }

    await this.database.db
      .update(schema.users)
      .set({ [parsed.data.field]: value, updatedAt: new Date() })
      .where(eq(schema.users.id, session.userId));
    await this.database.writeAudit({
      actorId: session.userId,
      action: `me.contact.${parsed.data.field}.update`,
      targetType: 'users',
      targetId: session.userId,
    });

    await this.redis.delete(this.contactVerificationFlowKey(session.userId, parsed.data.field));

    await this.sendContactChangedNotification(parsed.data.field, currentContact.email);

    return { ok: true as const, field: parsed.data.field };
  }

  private async sendContactChangedNotification(
    field: 'email' | 'phone',
    previousEmail: string | null,
  ) {
    if (!previousEmail) return;

    try {
      await this.authDelivery.sendContactChangedNotice({
        email: previousEmail,
        field,
      });
    } catch (error) {
      // The contact update has already succeeded. A delivery outage must not
      // turn a successful update into a misleading 500 response.
      this.logger.warn(
        `Previous contact notification failed: field=${field} cause=${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }

  async requestContactVerification(session: AuthSession | undefined, body: unknown) {
    if (!session?.userId || session.userId <= 0) {
      throw new UnauthorizedException('A persisted student session is required.');
    }
    const parsed = contactVerificationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const field = parsed.data.field;
    const value =
      field === 'email' ? parsed.data.value.toLocaleLowerCase('en-US') : parsed.data.value;
    const code = String(randomInt(100_000, 1_000_000));
    const flowKey = this.contactVerificationFlowKey(session.userId, field);
    await this.redis.setJson(
      flowKey,
      {
        field,
        value,
        codeHash: this.hashContactVerificationCode(session.userId, field, value, code),
        attemptCount: 0,
      },
      CONTACT_VERIFICATION_TTL_SECONDS,
    );

    try {
      if (field === 'phone') {
        await this.authDelivery.sendVerificationCode({
          channel: 'phone',
          code,
          phone: value,
          purpose: 'contact-change',
        });
      } else {
        await this.authDelivery.sendVerificationCode({
          channel: 'email',
          code,
          email: value,
          purpose: 'contact-change',
        });
      }
    } catch (error) {
      await this.redis.delete(flowKey);
      throw error;
    }
    return { ok: true as const };
  }

  private contactVerificationFlowKey(userId: number, field: 'email' | 'phone') {
    return `me:contact-verification:${userId}:${field}`;
  }

  private hashContactVerificationCode(
    userId: number,
    field: 'email' | 'phone',
    value: string,
    code: string,
  ) {
    return createHmac('sha256', env.CSRF_SECRET)
      .update(`contact-verification:${userId}:${field}:${value}:${code.trim()}`)
      .digest('hex');
  }

  private async assertContactVerification(
    userId: number,
    field: 'email' | 'phone',
    value: string,
    code: string,
  ) {
    const flowKey = this.contactVerificationFlowKey(userId, field);
    const rawFlow = await this.redis.get(flowKey);
    const decoded: unknown = (() => {
      try {
        return rawFlow ? JSON.parse(rawFlow) : null;
      } catch {
        return null;
      }
    })();
    const parsed = z
      .object({
        field: z.enum(['email', 'phone']),
        value: z.string(),
        codeHash: z.string(),
        attemptCount: z.number().int().nonnegative(),
      })
      .safeParse(decoded);
    if (!parsed.success || parsed.data.field !== field || parsed.data.value !== value) {
      throw new BadRequestException(
        `${field === 'email' ? '이메일' : '전화번호'} 인증을 다시 진행해 주세요.`,
      );
    }

    const expected = Buffer.from(
      this.hashContactVerificationCode(userId, field, value, code),
      'hex',
    );
    const actual = Buffer.from(parsed.data.codeHash, 'hex');
    const matches = expected.length === actual.length && timingSafeEqual(expected, actual);
    if (!matches) {
      const attemptCount = parsed.data.attemptCount + 1;
      if (attemptCount >= 5) {
        await this.redis.delete(flowKey);
      } else {
        await this.redis.setJson(
          flowKey,
          { ...parsed.data, attemptCount },
          CONTACT_VERIFICATION_TTL_SECONDS,
        );
      }
      throw new BadRequestException(
        `${field === 'email' ? '이메일' : '전화번호'} 인증번호를 확인해 주세요.`,
      );
    }
  }
}
