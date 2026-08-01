import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as schema from '@jshsus/db';
import type { ActivityRequestSummary, PointRecord, StudentSelfStatus } from '@jshsus/types';
import { and, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthSession } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import { meritPointBalanceSql, penaltyPointBalanceSql } from '../points/point-balance.query';

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

@Injectable()
export class MeService {
  constructor(private readonly database: DatabaseService) {}

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
        .select({ studentNo: schema.users.studentNo, nickname: schema.users.nickname })
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
            .limit(1),
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

    if (nickname) {
      const [duplicate] = await this.database.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.nickname, nickname), ne(schema.users.id, session.userId)))
        .limit(1);
      if (duplicate) {
        throw new ConflictException('이미 사용 중인 닉네임입니다.');
      }
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
}
