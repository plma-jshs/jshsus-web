import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as schema from '@jshsus/db';
import type { ActivityRequestSummary, PointRecord, StudentSelfStatus } from '@jshsus/types';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { AuthSession } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';

function toDateOnly(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
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

@Injectable()
export class MeService {
  constructor(private readonly database: DatabaseService) {}

  async status(session?: AuthSession): Promise<StudentSelfStatus> {
    if (!session) {
      throw new UnauthorizedException('Student session is required.');
    }

    return this.database.query('me.status', async (db) => {
      const [student] = await db
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
          session.userId && session.userId > 0
            ? eq(schema.students.userId, session.userId)
            : eq(schema.students.studentNo, session.stuid ?? 0),
        )
        .limit(1);

      if (!student) {
        throw new BadRequestException('Student profile is not linked to this session.');
      }

      const [pointTotals, pointRows, dormRows, deviceRows, activityRows] = await Promise.all([
        db
          .select({
            meritPoint:
              sql<number>`coalesce(sum(case when ${schema.pointRecords.point} > 0 then ${schema.pointRecords.point} else 0 end), 0)`.mapWith(
                Number,
              ),
            penaltyPoint:
              sql<number>`abs(coalesce(sum(case when ${schema.pointRecords.point} < 0 then ${schema.pointRecords.point} else 0 end), 0))`.mapWith(
                Number,
              ),
          })
          .from(schema.pointRecords)
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
          .innerJoin(schema.users, eq(schema.pointRecords.teacherId, schema.users.id))
          .innerJoin(schema.pointReasons, eq(schema.pointRecords.reasonId, schema.pointReasons.id))
          .where(
            and(
              eq(schema.pointRecords.studentId, student.id),
              isNull(schema.pointRecords.canceledAt),
            ),
          )
          .orderBy(desc(schema.pointRecords.baseDate), desc(schema.pointRecords.id))
          .limit(20),
        student.userId
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
              .where(eq(schema.dormAssignments.userId, student.userId))
              .orderBy(desc(schema.dormAssignments.year), desc(schema.dormAssignments.semester))
              .limit(1)
          : Promise.resolve([]),
        db
          .select({
            id: schema.deviceCases.id,
            isConnected: schema.deviceCases.isConnected,
            isOpen: schema.deviceCases.isOpen,
            lastSeenAt: schema.deviceCases.lastSeenAt,
          })
          .from(schema.deviceCases)
          .where(eq(schema.deviceCases.id, student.number))
          .limit(1),
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
          .innerJoin(schema.students, eq(schema.activityRequests.studentId, schema.students.id))
          .leftJoin(schema.users, eq(schema.activityRequests.teacherId, schema.users.id))
          .where(eq(schema.activityRequests.studentId, student.id))
          .orderBy(desc(schema.activityRequests.startsAt), desc(schema.activityRequests.id))
          .limit(1),
      ]);

      const records: PointRecord[] = pointRows.map((row) => ({
        ...row,
        baseDate: toDateOnly(row.baseDate),
      }));
      const dorm = dormRows[0];
      const deviceCase = deviceRows[0];

      return {
        student: {
          id: student.id,
          studentNo: student.studentNo,
          name: student.name,
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
              lastSeenAt: deviceCase.lastSeenAt.toISOString(),
            }
          : undefined,
        latestActivityRequest: activityRows[0] ? toActivitySummary(activityRows[0]) : undefined,
      };
    });
  }
}
