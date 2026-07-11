import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as schema from '@jshsus/db';
import type { PointReason, PointRecord, PointSummary, StudentOption } from '@jshsus/types';
import { desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import {
  assertPointRecordCanBeCanceled,
  assertPointRecordCanBeRestored,
} from './point-record.policy';

const createPointRecordSchema = z.object({
  studentId: z.coerce.number().int().positive(),
  teacherId: z.coerce.number().int().positive().optional(),
  reasonId: z.coerce.number().int().positive(),
  point: z.coerce.number().int().optional(),
  comment: z.string().max(255).optional().default(''),
  baseDate: z.coerce.date().default(() => new Date()),
});

const createPointReasonSchema = z.object({
  type: z.enum(['PLUS', 'MINUS', 'ETC']),
  point: z.coerce.number().int(),
  comment: z.string().min(1).max(255),
});

const adjustmentSchema = z.object({
  reason: z.string().max(255).optional().default('관리자 처리'),
});

function toDateOnly(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

@Injectable()
export class PointsService {
  constructor(private readonly database: DatabaseService) {}

  async getStudents(): Promise<StudentOption[]> {
    return this.database.query('points.students', async (db) => {
      const rows = await db
        .select({
          id: schema.students.id,
          studentNo: schema.students.studentNo,
          name: schema.students.name,
          grade: schema.students.grade,
          classNo: schema.students.classNo,
          number: schema.students.number,
          currentPoint: schema.students.currentPoint,
        })
        .from(schema.students)
        .orderBy(schema.students.grade, schema.students.classNo, schema.students.number)
        .limit(500);

      return rows;
    });
  }

  async getReasons(): Promise<PointReason[]> {
    return this.database.query('points.reasons', async (db) => {
      const rows = await db
        .select({
          id: schema.pointReasons.id,
          type: schema.pointReasons.type,
          point: schema.pointReasons.point,
          comment: schema.pointReasons.comment,
          isActive: schema.pointReasons.isActive,
        })
        .from(schema.pointReasons)
        .orderBy(schema.pointReasons.type, schema.pointReasons.comment);

      return rows;
    });
  }

  async getRecords(limit = 200): Promise<PointRecord[]> {
    return this.database.query('points.records', async (db) => {
      const rows = await db
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
        .where(isNull(schema.pointRecords.canceledAt))
        .orderBy(desc(schema.pointRecords.baseDate), desc(schema.pointRecords.id))
        .limit(limit);

      return rows.map((row) => ({
        ...row,
        baseDate: toDateOnly(row.baseDate),
      }));
    });
  }

  async getSummary(): Promise<PointSummary> {
    return this.database.query('points.summary', async (db) => {
      const [studentCount] = await db
        .select({
          totalStudents: sql<number>`cast(count(*) as unsigned)`.mapWith(Number),
          totalMeritPoints:
            sql<number>`coalesce(sum(case when ${schema.students.currentPoint} > 0 then ${schema.students.currentPoint} else 0 end), 0)`.mapWith(
              Number,
            ),
          totalPenaltyPoints:
            sql<number>`abs(coalesce(sum(case when ${schema.students.currentPoint} < 0 then ${schema.students.currentPoint} else 0 end), 0))`.mapWith(
              Number,
            ),
          watchListCount:
            sql<number>`cast(sum(case when ${schema.students.currentPoint} <= -10 then 1 else 0 end) as unsigned)`.mapWith(
              Number,
            ),
        })
        .from(schema.students);

      return {
        totalStudents: studentCount?.totalStudents ?? 0,
        totalMeritPoints: studentCount?.totalMeritPoints ?? 0,
        totalPenaltyPoints: studentCount?.totalPenaltyPoints ?? 0,
        watchListCount: studentCount?.watchListCount ?? 0,
        records: await this.getRecords(50),
      };
    });
  }

  async createRecord(body: unknown, actorId?: number | null) {
    const parsed = createPointRecordSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    return this.database.query('points.records.create', async (db) => {
      const teacherId = parsed.data.teacherId ?? actorId;

      if (!teacherId || teacherId <= 0) {
        throw new BadRequestException('A persisted teacher account is required.');
      }

      return db.transaction(async (tx) => {
        const [reason] = await tx
          .select({ point: schema.pointReasons.point, isActive: schema.pointReasons.isActive })
          .from(schema.pointReasons)
          .where(eq(schema.pointReasons.id, parsed.data.reasonId))
          .limit(1);

        if (!reason?.isActive) {
          throw new BadRequestException('An active point reason is required.');
        }

        const point = parsed.data.point ?? reason.point;
        const [result] = await tx
          .insert(schema.pointRecords)
          .values({
            studentId: parsed.data.studentId,
            teacherId,
            reasonId: parsed.data.reasonId,
            point,
            comment: parsed.data.comment,
            baseDate: parsed.data.baseDate,
          })
          .$returningId();

        await tx
          .update(schema.students)
          .set({ currentPoint: sql`${schema.students.currentPoint} + ${point}` })
          .where(eq(schema.students.id, parsed.data.studentId));
        await tx.insert(schema.auditLogs).values({
          actorId: actorId && actorId > 0 ? actorId : teacherId,
          action: 'points.record.create',
          targetType: 'point_records',
          targetId: String(result.id),
        });

        return { ok: true, record: { id: result.id, ...parsed.data, teacherId, point } };
      });
    });
  }

  async createReason(body: unknown, actorId?: number | null) {
    const parsed = createPointReasonSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    return this.database.query('points.reasons.create', async (db) => {
      const [result] = await db.insert(schema.pointReasons).values(parsed.data).$returningId();
      await this.database.writeAudit({
        actorId,
        action: 'points.reason.create',
        targetType: 'point_reasons',
        targetId: result.id,
      });

      return { ok: true, reason: { id: result.id, isActive: true, ...parsed.data } };
    });
  }

  async cancelRecord(id: number, body: unknown, actorId?: number | null) {
    const parsed = adjustmentSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    return this.database.query('points.records.cancel', async (db) => {
      if (!actorId || actorId <= 0) {
        throw new BadRequestException('A persisted administrator account is required.');
      }

      return db.transaction(async (tx) => {
        const [record] = await tx
          .select({
            studentId: schema.pointRecords.studentId,
            point: schema.pointRecords.point,
            canceledAt: schema.pointRecords.canceledAt,
          })
          .from(schema.pointRecords)
          .where(eq(schema.pointRecords.id, id))
          .limit(1)
          .for('update');

        if (!record) {
          throw new NotFoundException('Point record does not exist.');
        }

        assertPointRecordCanBeCanceled(record.canceledAt);

        await tx
          .update(schema.pointRecords)
          .set({ canceledAt: new Date(), restoredAt: null })
          .where(eq(schema.pointRecords.id, id));
        await tx
          .update(schema.students)
          .set({ currentPoint: sql`${schema.students.currentPoint} - ${record.point}` })
          .where(eq(schema.students.id, record.studentId));
        await tx.insert(schema.pointAdjustments).values({
          pointRecordId: id,
          actorId,
          action: 'cancel',
          beforePoint: record.point,
          afterPoint: 0,
          reason: parsed.data.reason,
        });
        await tx.insert(schema.auditLogs).values({
          actorId,
          action: 'points.record.cancel',
          targetType: 'point_records',
          targetId: String(id),
        });

        return { ok: true, id, action: 'cancel', reason: parsed.data.reason };
      });
    });
  }

  async restoreRecord(id: number, body: unknown, actorId?: number | null) {
    const parsed = adjustmentSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    return this.database.query('points.records.restore', async (db) => {
      if (!actorId || actorId <= 0) {
        throw new BadRequestException('A persisted administrator account is required.');
      }

      return db.transaction(async (tx) => {
        const [record] = await tx
          .select({
            studentId: schema.pointRecords.studentId,
            point: schema.pointRecords.point,
            canceledAt: schema.pointRecords.canceledAt,
          })
          .from(schema.pointRecords)
          .where(eq(schema.pointRecords.id, id))
          .limit(1)
          .for('update');

        if (!record) {
          throw new NotFoundException('Point record does not exist.');
        }

        assertPointRecordCanBeRestored(record.canceledAt);

        await tx
          .update(schema.pointRecords)
          .set({ canceledAt: null, restoredAt: new Date() })
          .where(eq(schema.pointRecords.id, id));
        await tx
          .update(schema.students)
          .set({ currentPoint: sql`${schema.students.currentPoint} + ${record.point}` })
          .where(eq(schema.students.id, record.studentId));
        await tx.insert(schema.pointAdjustments).values({
          pointRecordId: id,
          actorId,
          action: 'restore',
          beforePoint: 0,
          afterPoint: record.point,
          reason: parsed.data.reason,
        });
        await tx.insert(schema.auditLogs).values({
          actorId,
          action: 'points.record.restore',
          targetType: 'point_records',
          targetId: String(id),
        });

        return { ok: true, id, action: 'restore', reason: parsed.data.reason };
      });
    });
  }
}
