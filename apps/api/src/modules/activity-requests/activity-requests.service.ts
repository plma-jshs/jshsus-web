import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as schema from '@jshsus/db';
import type { ActivityRequestSummary } from '@jshsus/types';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthSession } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';

const createActivityRequestSchema = z.object({
  studentId: z.coerce.number().int().positive().optional(),
  teacherId: z.coerce.number().int().positive().optional(),
  location: z.string().min(1).max(160),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  purpose: z.string().min(1).max(500),
});

const rejectSchema = z.object({
  reason: z.string().max(500).optional().default(''),
});

function issueNumber(id: number) {
  return `AR-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(id).padStart(4, '0')}`;
}

function toSummary(row: {
  id: number;
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
export class ActivityRequestsService {
  constructor(private readonly database: DatabaseService) {}

  async myRequests(session?: AuthSession): Promise<ActivityRequestSummary[]> {
    return this.database.query('activity-requests.me', async (db) => {
      const studentId = await this.resolveStudentId(session);
      const rows = await db
        .select({
          id: schema.activityRequests.id,
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
        .where(eq(schema.activityRequests.studentId, studentId))
        .orderBy(desc(schema.activityRequests.startsAt), desc(schema.activityRequests.id));

      return rows.map(toSummary);
    });
  }

  async adminList(): Promise<ActivityRequestSummary[]> {
    return this.database.query('activity-requests.admin-list', async (db) => {
      const rows = await db
        .select({
          id: schema.activityRequests.id,
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
        .orderBy(desc(schema.activityRequests.startsAt), desc(schema.activityRequests.id))
        .limit(200);

      return rows.map(toSummary);
    });
  }

  async create(body: unknown, session?: AuthSession) {
    const parsed = createActivityRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    if (parsed.data.startsAt >= parsed.data.endsAt) {
      throw new BadRequestException('Activity end time must be later than start time.');
    }

    return this.database.query('activity-requests.create', async (db) => {
      const studentId = parsed.data.studentId ?? (await this.resolveStudentId(session));
      const [result] = await db
        .insert(schema.activityRequests)
        .values({
          studentId,
          teacherId: parsed.data.teacherId,
          location: parsed.data.location,
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
          purpose: parsed.data.purpose,
          status: 'submitted',
          updatedAt: new Date(),
        })
        .$returningId();

      await db.insert(schema.activityRequestEvents).values({
        activityRequestId: result.id,
        actorId: session?.userId && session.userId > 0 ? session.userId : null,
        type: 'submitted',
        note: '학생 신청',
      });

      return {
        ok: true,
        request: {
          id: result.id,
          status: 'submitted',
          ...parsed.data,
          studentId,
        },
      };
    });
  }

  async cancel(id: number, session?: AuthSession) {
    return this.database.query('activity-requests.cancel', async (db) => {
      const studentId = await this.resolveStudentId(session);
      const [request] = await db
        .select({ id: schema.activityRequests.id, status: schema.activityRequests.status })
        .from(schema.activityRequests)
        .where(
          and(eq(schema.activityRequests.id, id), eq(schema.activityRequests.studentId, studentId)),
        )
        .limit(1);

      if (!request) {
        throw new BadRequestException('Activity request does not exist.');
      }

      if (request.status !== 'submitted') {
        throw new BadRequestException('Only submitted activity requests can be canceled.');
      }

      await db
        .update(schema.activityRequests)
        .set({
          status: 'canceled',
          updatedAt: new Date(),
        })
        .where(eq(schema.activityRequests.id, id));

      await db.insert(schema.activityRequestEvents).values({
        activityRequestId: id,
        actorId: session?.userId && session.userId > 0 ? session.userId : null,
        type: 'canceled',
        note: '학생 취소',
      });

      return { ok: true, id, status: 'canceled' };
    });
  }

  async approve(id: number, actorId?: number | null) {
    const issuedNumber = issueNumber(id);

    return this.database.query('activity-requests.approve', async (db) => {
      if (!actorId || actorId <= 0) {
        throw new BadRequestException('A persisted approver account is required.');
      }

      return db.transaction(async (tx) => {
        const [request] = await tx
          .select({ status: schema.activityRequests.status })
          .from(schema.activityRequests)
          .where(eq(schema.activityRequests.id, id))
          .limit(1)
          .for('update');

        if (!request) {
          throw new NotFoundException('Activity request does not exist.');
        }

        if (request.status !== 'submitted') {
          throw new ConflictException('Only submitted activity requests can be approved.');
        }

        await tx
          .update(schema.activityRequests)
          .set({
            status: 'approved',
            teacherId: actorId,
            issuedNumber,
            issuedAt: new Date(),
            rejectionReason: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.activityRequests.id, id));
        await tx.insert(schema.activityRequestEvents).values({
          activityRequestId: id,
          actorId,
          type: 'approved',
          note: issuedNumber,
        });
        await tx.insert(schema.auditLogs).values({
          actorId,
          action: 'activity_request.approve',
          targetType: 'activity_requests',
          targetId: String(id),
        });

        return { ok: true, id, status: 'approved', issuedNumber };
      });
    });
  }

  async reject(id: number, body: unknown, actorId?: number | null) {
    const parsed = rejectSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    return this.database.query('activity-requests.reject', async (db) => {
      if (!actorId || actorId <= 0) {
        throw new BadRequestException('A persisted reviewer account is required.');
      }

      return db.transaction(async (tx) => {
        const [request] = await tx
          .select({ status: schema.activityRequests.status })
          .from(schema.activityRequests)
          .where(eq(schema.activityRequests.id, id))
          .limit(1)
          .for('update');

        if (!request) {
          throw new NotFoundException('Activity request does not exist.');
        }

        if (request.status !== 'submitted') {
          throw new ConflictException('Only submitted activity requests can be rejected.');
        }

        await tx
          .update(schema.activityRequests)
          .set({
            status: 'rejected',
            teacherId: actorId,
            rejectionReason: parsed.data.reason,
            updatedAt: new Date(),
          })
          .where(eq(schema.activityRequests.id, id));
        await tx.insert(schema.activityRequestEvents).values({
          activityRequestId: id,
          actorId,
          type: 'rejected',
          note: parsed.data.reason,
        });
        await tx.insert(schema.auditLogs).values({
          actorId,
          action: 'activity_request.reject',
          targetType: 'activity_requests',
          targetId: String(id),
        });

        return { ok: true, id, status: 'rejected', rejectionReason: parsed.data.reason };
      });
    });
  }

  async markPrinted(id: number, actorId?: number | null) {
    return this.database.query('activity-requests.print', async (db) => {
      const [request] = await db
        .select({ status: schema.activityRequests.status })
        .from(schema.activityRequests)
        .where(eq(schema.activityRequests.id, id))
        .limit(1);

      if (!request) {
        throw new NotFoundException('Activity request does not exist.');
      }

      if (request.status !== 'approved') {
        throw new ConflictException('Only approved activity requests can be printed.');
      }

      await db.insert(schema.activityRequestEvents).values({
        activityRequestId: id,
        actorId: actorId && actorId > 0 ? actorId : null,
        type: 'printed',
        note: '출력 화면 열람',
      });

      await this.database.writeAudit({
        actorId,
        action: 'activity_request.print',
        targetType: 'activity_requests',
        targetId: id,
      });

      return { ok: true, id };
    });
  }

  private async resolveStudentId(session?: AuthSession): Promise<number> {
    if (!session) {
      throw new BadRequestException('Student session is required.');
    }

    const [student] = await this.database.db
      .select({ id: schema.students.id })
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

    return student.id;
  }
}
