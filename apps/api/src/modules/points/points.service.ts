import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as schema from '@jshsus/db';
import type { PointReason, PointRecord, PointSummary, StudentOption } from '@jshsus/types';
import { and, asc, count, desc, eq, gt, inArray, isNull, like, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService, type AppDatabase } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  calculateDepartureResetAdjustment,
  calculateCurrentPointCategoryBalances,
  calculateSemesterHalfAdjustment,
  classifyPointRisk,
  DEPARTURE_POINT_THRESHOLD,
  DEPARTURE_RISK_POINT_THRESHOLD,
  isSystemPointReason,
  isSystemPointRecord,
  SYSTEM_DEPARTURE_REASON,
  SYSTEM_MERIT_HALF_REASON,
  SYSTEM_PENALTY_HALF_REASON,
  SYSTEM_POINT_ACTOR_NAME,
  SYSTEM_POINT_REASON_PREFIX,
} from './point-lifecycle.policy';
import {
  assertPointRecordCanBeAdjusted,
  assertPointRecordCanBeCanceled,
  assertPointRecordCanBeRestored,
} from './point-record.policy';

const pointRecordInputSchema = z.object({
  studentId: z.coerce.number().int().positive(),
  reasonId: z.coerce.number().int().positive(),
  point: z.coerce.number().int().min(-100).max(100),
  reasonText: z.string().trim().min(1).max(255),
  baseDate: z.coerce.date().default(() => new Date()),
});

const createPointBatchSchema = z.object({
  idempotencyKey: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9_.:-]+$/),
  records: z.array(pointRecordInputSchema).min(1).max(500),
});

const importPreviewSchema = z.object({
  rows: z
    .array(
      z.object({
        rowNumber: z.coerce.number().int().positive(),
        studentNo: z.coerce.number().int().positive(),
        reasonId: z.coerce.number().int().positive(),
        point: z.coerce.number().int().min(-100).max(100),
        reasonText: z.string().trim().min(1).max(255),
        baseDate: z.coerce.date(),
      }),
    )
    .min(1)
    .max(500),
});

const pointReasonFields = {
  type: z.enum(['PLUS', 'MINUS', 'ETC']),
  point: z.coerce.number().int().min(-100).max(100),
  comment: z.string().trim().min(1).max(255),
};

const SYSTEM_POINT_AUTH_PROVIDER = 'system';
const SYSTEM_POINT_AUTH_ACCOUNT_ID = 'points';
type AppTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];

const pointReasonInputSchema = z.object(pointReasonFields).superRefine((value, context) => {
  if (value.type === 'PLUS' && value.point <= 0) {
    context.addIssue({ code: 'custom', path: ['point'], message: '상점은 1점 이상이어야 합니다.' });
  }
  if (value.type === 'MINUS' && value.point >= 0) {
    context.addIssue({ code: 'custom', path: ['point'], message: '벌점은 -1점 이하여야 합니다.' });
  }
});

const updatePointReasonSchema = z
  .object({ ...pointReasonFields, isActive: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, '변경할 내용을 입력해 주세요.');

const adjustmentSchema = z.object({
  reason: z.string().trim().min(1).max(255),
});

const bulkAdjustmentSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(100),
  reason: z.string().trim().min(1).max(255).default('관리자 일괄 삭제'),
});

const recordPageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(20).max(100).default(20),
  search: z.string().trim().max(80).optional(),
  type: z.enum(['PLUS', 'MINUS', 'ETC']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sortBy: z
    .enum(['baseDate', 'createdAt', 'studentNo', 'studentName', 'reasonId', 'point', 'teacherName'])
    .default('baseDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const studentPageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
  search: z.string().trim().max(80).optional(),
  grade: z.coerce.number().int().min(1).max(9).optional(),
  classNo: z.coerce.number().int().min(1).max(20).optional(),
  number: z.coerce.number().int().min(1).max(99).optional(),
  riskStatus: z.enum(['normal', 'risk', 'departure']).optional(),
  watchOnly: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((value) => value === true || value === 'true')
    .default(false),
  sortBy: z.enum(['studentNo', 'name', 'meritPoint', 'penaltyPoint']).default('studentNo'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

const reasonPageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(20).max(100).default(20),
  search: z.string().trim().max(80).optional(),
  type: z.enum(['PLUS', 'MINUS', 'ETC']).optional(),
  sortBy: z.enum(['id', 'point']).default('id'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

const departurePageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(20).max(100).default(20),
  search: z.string().trim().max(80).optional(),
  grade: z.coerce.number().int().min(1).max(9).optional(),
  classNo: z.coerce.number().int().min(1).max(20).optional(),
  riskStatus: z.enum(['risk', 'departure', 'all']).default('all'),
  sortBy: z
    .enum(['studentNo', 'name', 'meritPoint', 'penaltyPoint', 'currentPoint'])
    .default('currentPoint'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

const departureHistoryPageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(20).max(100).default(20),
  search: z.string().trim().max(80).optional(),
  grade: z.coerce.number().int().min(1).max(9).optional(),
  classNo: z.coerce.number().int().min(1).max(20).optional(),
  sortBy: z.enum(['studentNo', 'name', 'handledAt']).default('handledAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const departureCaseSchema = z.object({
  memo: z.string().trim().min(1).max(2_000),
  baseDate: z.coerce.date().default(() => new Date()),
});

const semesterHalfSchema = z.object({
  schoolYear: z.coerce.number().int().min(2020).max(2100),
  semester: z.coerce.number().int().min(1).max(2),
  baseDate: z.coerce.date().default(() => new Date()),
});

function toDateOnly(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function requireActor(actorId?: number | null): number {
  if (!actorId || actorId <= 0) {
    throw new BadRequestException('저장된 관리자 계정으로 로그인해야 합니다.');
  }
  return actorId;
}

function assertPointMatchesReasonType(type: 'PLUS' | 'MINUS' | 'ETC', point: number) {
  if (type === 'PLUS' && point <= 0) {
    throw new BadRequestException('상점은 1점 이상이어야 합니다.');
  }
  if (type === 'MINUS' && point >= 0) {
    throw new BadRequestException('벌점은 -1점 이하여야 합니다.');
  }
}

function pointNotificationTitle(type: 'PLUS' | 'MINUS' | 'ETC', point: number) {
  const label = type === 'PLUS' ? '상점' : type === 'MINUS' ? '벌점' : '기타';
  const signedPoint = point > 0 ? `+${point}` : String(point);
  return `새로운 ${label}(${signedPoint}점)이 부여되었습니다.`;
}

export function studentMeritPointSql() {
  return sql<number>`coalesce((
    select sum(case
      when coalesce(pr.reason_type, rr.point_reason_type) = 'PLUS'
        or coalesce(pr.reason_text, rr.comment) = ${SYSTEM_MERIT_HALF_REASON}
      then pr.point else 0 end)
    from point_records pr
    inner join point_reasons rr on rr.id = pr.reason_id
    where pr.student_id = students.id and pr.canceled_at is null
  ), 0)`.mapWith(Number);
}

export function studentPenaltyPointSql() {
  return sql<number>`abs(coalesce((
    select sum(case
      when coalesce(pr.reason_type, rr.point_reason_type) = 'MINUS'
        or coalesce(pr.reason_text, rr.comment) = ${SYSTEM_PENALTY_HALF_REASON}
      then pr.point else 0 end)
    from point_records pr
    inner join point_reasons rr on rr.id = pr.reason_id
    where pr.student_id = students.id and pr.canceled_at is null
  ), 0))`.mapWith(Number);
}

export function studentSearchRankSql(search: string) {
  const prefix = `${search}%`;
  return sql<number>`case
    when cast(${schema.students.studentNo} as char) = ${search} then 0
    when cast(${schema.students.studentNo} as char) like ${prefix} then 1
    when ${schema.students.name} = ${search} then 2
    when ${schema.students.name} like ${prefix} then 3
    else 4
  end`;
}

function excludeCompletedDeparturesSql() {
  return sql`not exists (
    select 1 from point_award_cases departure_case
    where departure_case.student_id = ${schema.students.id}
      and departure_case.type = 'dorm_departure'
      and departure_case.point_award_case_status = 'completed'
  )`;
}

@Injectable()
export class PointsService {
  private readonly idempotencyInFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  private runIdempotent<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const active = this.idempotencyInFlight.get(key);
    if (active) {
      return active as Promise<T>;
    }

    const pending = operation().finally(() => {
      this.idempotencyInFlight.delete(key);
    });
    this.idempotencyInFlight.set(key, pending);
    return pending;
  }

  private async ensureSystemPointActor(tx: AppTransaction): Promise<{ id: number }> {
    const [linkedActor] = await tx
      .select({ id: schema.users.id })
      .from(schema.authAccounts)
      .innerJoin(schema.users, eq(schema.authAccounts.userId, schema.users.id))
      .where(
        and(
          eq(schema.authAccounts.provider, SYSTEM_POINT_AUTH_PROVIDER),
          eq(schema.authAccounts.providerAccountId, SYSTEM_POINT_AUTH_ACCOUNT_ID),
        ),
      )
      .limit(1);

    if (linkedActor) {
      await tx
        .update(schema.users)
        .set({ studentNo: null, name: SYSTEM_POINT_ACTOR_NAME, status: 'active' })
        .where(eq(schema.users.id, linkedActor.id));
      return linkedActor;
    }

    const [createdActor] = await tx
      .insert(schema.users)
      .values({
        studentNo: null,
        name: SYSTEM_POINT_ACTOR_NAME,
        status: 'active',
      })
      .$returningId();
    await tx
      .insert(schema.authAccounts)
      .values({
        userId: createdActor.id,
        provider: SYSTEM_POINT_AUTH_PROVIDER,
        providerAccountId: SYSTEM_POINT_AUTH_ACCOUNT_ID,
      })
      .onDuplicateKeyUpdate({
        set: { updatedAt: new Date() },
      });
    const [linkedAfterInsert] = await tx
      .select({ id: schema.users.id })
      .from(schema.authAccounts)
      .innerJoin(schema.users, eq(schema.authAccounts.userId, schema.users.id))
      .where(
        and(
          eq(schema.authAccounts.provider, SYSTEM_POINT_AUTH_PROVIDER),
          eq(schema.authAccounts.providerAccountId, SYSTEM_POINT_AUTH_ACCOUNT_ID),
        ),
      )
      .limit(1);
    return linkedAfterInsert ?? { id: createdActor.id };
  }

  async getStudents(): Promise<StudentOption[]> {
    return this.database.query('points.students', async (db) =>
      db
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
        .limit(500),
    );
  }

  async getStudentPage(query: unknown) {
    const parsed = studentPageSchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const {
      page,
      pageSize,
      search,
      grade,
      classNo,
      number,
      riskStatus,
      watchOnly,
      sortBy,
      sortOrder,
    } = parsed.data;
    return this.database.query('points.students.page', async (db) => {
      const conditions = [excludeCompletedDeparturesSql()];
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(
            like(schema.students.name, pattern),
            sql`cast(${schema.students.studentNo} as char) like ${pattern}`,
          )!,
        );
      }
      if (grade) conditions.push(eq(schema.students.grade, grade));
      if (classNo) conditions.push(eq(schema.students.classNo, classNo));
      if (number) conditions.push(eq(schema.students.number, number));
      if (watchOnly) conditions.push(lte(schema.students.currentPoint, -10));
      if (riskStatus === 'normal') {
        conditions.push(gt(schema.students.currentPoint, DEPARTURE_RISK_POINT_THRESHOLD));
      }
      if (riskStatus === 'risk') {
        conditions.push(
          and(
            lte(schema.students.currentPoint, DEPARTURE_RISK_POINT_THRESHOLD),
            gt(schema.students.currentPoint, DEPARTURE_POINT_THRESHOLD),
          )!,
        );
      }
      if (riskStatus === 'departure') {
        conditions.push(lte(schema.students.currentPoint, DEPARTURE_POINT_THRESHOLD));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const meritPoint = studentMeritPointSql();
      const penaltyPoint = studentPenaltyPointSql();
      const sortExpression =
        sortBy === 'name'
          ? schema.students.name
          : sortBy === 'meritPoint'
            ? meritPoint
            : sortBy === 'penaltyPoint'
              ? penaltyPoint
              : schema.students.studentNo;
      const orderExpression = sortOrder === 'asc' ? asc(sortExpression) : desc(sortExpression);
      const searchRank = search ? studentSearchRankSql(search) : undefined;

      const [{ total }] = await db.select({ total: count() }).from(schema.students).where(where);
      const students = await db
        .select({
          id: schema.students.id,
          studentNo: schema.students.studentNo,
          name: schema.students.name,
          grade: schema.students.grade,
          classNo: schema.students.classNo,
          number: schema.students.number,
          currentPoint: schema.students.currentPoint,
          meritPoint,
          penaltyPoint,
        })
        .from(schema.students)
        .where(where)
        .orderBy(
          ...(searchRank
            ? [asc(searchRank), orderExpression, asc(schema.students.studentNo)]
            : [orderExpression, asc(schema.students.studentNo)]),
        )
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return {
        items: students.map((student) => ({
          ...student,
          isDepartureCandidate: student.currentPoint <= DEPARTURE_POINT_THRESHOLD,
          riskStatus: classifyPointRisk(student.currentPoint),
        })),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    });
  }

  async getReasons(): Promise<PointReason[]> {
    return this.database.query('points.reasons', async (db) => {
      const reasons = await db
        .select({
          id: schema.pointReasons.id,
          type: schema.pointReasons.type,
          point: schema.pointReasons.point,
          comment: schema.pointReasons.comment,
          isActive: schema.pointReasons.isActive,
        })
        .from(schema.pointReasons)
        .where(eq(schema.pointReasons.isActive, true))
        .orderBy(asc(schema.pointReasons.id));

      return reasons;
    });
  }

  async getReasonPage(query: unknown) {
    const parsed = reasonPageSchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    const { page, pageSize, search, type, sortBy, sortOrder } = parsed.data;

    return this.database.query('points.reasons.page', async (db) => {
      const conditions = [eq(schema.pointReasons.isActive, true)];
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(
            like(schema.pointReasons.comment, pattern),
            sql`cast(${schema.pointReasons.id} as char) like ${pattern}`,
          )!,
        );
      }
      if (type) conditions.push(eq(schema.pointReasons.type, type));
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const sortExpression =
        sortBy === 'point' ? schema.pointReasons.point : schema.pointReasons.id;
      const orderExpression = sortOrder === 'asc' ? asc(sortExpression) : desc(sortExpression);

      const [{ total }] = await db
        .select({ total: count() })
        .from(schema.pointReasons)
        .where(where);
      const items = await db
        .select({
          id: schema.pointReasons.id,
          type: schema.pointReasons.type,
          point: schema.pointReasons.point,
          comment: schema.pointReasons.comment,
          isActive: schema.pointReasons.isActive,
        })
        .from(schema.pointReasons)
        .where(where)
        .orderBy(orderExpression, asc(schema.pointReasons.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return {
        items: items.map((item) => ({
          ...item,
          isSystem: isSystemPointReason(item.comment),
        })),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
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
          reason: sql<string>`coalesce(${schema.pointRecords.reasonText}, ${schema.pointReasons.comment})`,
          point: schema.pointRecords.point,
          comment: schema.pointRecords.comment,
          baseDate: schema.pointRecords.baseDate,
        })
        .from(schema.pointRecords)
        .innerJoin(schema.students, eq(schema.pointRecords.studentId, schema.students.id))
        .leftJoin(schema.users, eq(schema.pointRecords.teacherId, schema.users.id))
        .innerJoin(schema.pointReasons, eq(schema.pointRecords.reasonId, schema.pointReasons.id))
        .where(isNull(schema.pointRecords.canceledAt))
        .orderBy(desc(schema.pointRecords.baseDate), desc(schema.pointRecords.id))
        .limit(limit);

      return rows.map((row) => ({
        ...row,
        teacherName: row.teacherName ?? '이관 데이터',
        baseDate: toDateOnly(row.baseDate),
      }));
    });
  }

  async getRecordPage(query: unknown) {
    const parsed = recordPageSchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    const { page, pageSize, search, type, from, to, sortBy, sortOrder } = parsed.data;

    return this.database.query('points.records.page', async (db) => {
      const conditions = [isNull(schema.pointRecords.canceledAt)];
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(
            like(schema.students.name, pattern),
            sql`coalesce(${schema.pointRecords.reasonText}, ${schema.pointReasons.comment}) like ${pattern}`,
            sql`cast(${schema.students.studentNo} as char) like ${pattern}`,
            like(schema.users.name, pattern),
            sql`cast(${schema.users.studentNo} as char) like ${pattern}`,
          )!,
        );
      }
      if (type) {
        conditions.push(
          sql`coalesce(${schema.pointRecords.reasonType}, ${schema.pointReasons.type}) = ${type}`,
        );
      }
      if (from) conditions.push(sql`${schema.pointRecords.baseDate} >= ${toDateOnly(from)}`);
      if (to) conditions.push(sql`${schema.pointRecords.baseDate} <= ${toDateOnly(to)}`);
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const reasonType = sql<string>`coalesce(${schema.pointRecords.reasonType}, ${schema.pointReasons.type})`;
      const reasonText = sql<string>`coalesce(${schema.pointRecords.reasonText}, ${schema.pointReasons.comment})`;
      const sortExpression =
        sortBy === 'createdAt'
          ? schema.pointRecords.createdAt
          : sortBy === 'studentNo'
            ? schema.students.studentNo
            : sortBy === 'studentName'
              ? schema.students.name
              : sortBy === 'reasonId'
                ? schema.pointRecords.reasonId
                : sortBy === 'point'
                  ? schema.pointRecords.point
                  : sortBy === 'teacherName'
                    ? schema.users.name
                    : schema.pointRecords.baseDate;
      const orderExpression = sortOrder === 'asc' ? asc(sortExpression) : desc(sortExpression);

      const baseQuery = db
        .select({ total: count() })
        .from(schema.pointRecords)
        .innerJoin(schema.students, eq(schema.pointRecords.studentId, schema.students.id))
        .leftJoin(schema.users, eq(schema.pointRecords.teacherId, schema.users.id))
        .innerJoin(schema.pointReasons, eq(schema.pointRecords.reasonId, schema.pointReasons.id))
        .where(where);
      const [{ total }] = await baseQuery;
      const rows = await db
        .select({
          id: schema.pointRecords.id,
          studentId: schema.students.id,
          studentNo: schema.students.studentNo,
          studentName: schema.students.name,
          teacherName: schema.users.name,
          teacherStudentNo: schema.users.studentNo,
          reasonId: schema.pointRecords.reasonId,
          reason: reasonText,
          reasonType,
          point: schema.pointRecords.point,
          baseDate: schema.pointRecords.baseDate,
          createdAt: schema.pointRecords.createdAt,
          canceledAt: schema.pointRecords.canceledAt,
          restoredAt: schema.pointRecords.restoredAt,
        })
        .from(schema.pointRecords)
        .innerJoin(schema.students, eq(schema.pointRecords.studentId, schema.students.id))
        .leftJoin(schema.users, eq(schema.pointRecords.teacherId, schema.users.id))
        .innerJoin(schema.pointReasons, eq(schema.pointRecords.reasonId, schema.pointReasons.id))
        .where(where)
        .orderBy(orderExpression, desc(schema.pointRecords.createdAt), desc(schema.pointRecords.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return {
        items: rows.map(({ teacherStudentNo, ...row }) => ({
          ...row,
          teacherName: row.teacherName ?? '이관 데이터',
          isSystemGenerated: isSystemPointRecord({
            teacherStudentNo,
            reason: row.reason,
          }),
          baseDate: toDateOnly(row.baseDate),
          createdAt: row.createdAt.toISOString(),
          canceledAt: row.canceledAt?.toISOString(),
          restoredAt: row.restoredAt?.toISOString(),
        })),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    });
  }

  async getSummary(): Promise<PointSummary> {
    return this.database.query('points.summary', async (db) => {
      const [studentCount] = await db
        .select({
          totalStudents: count(),
          watchListCount:
            sql<number>`cast(sum(case when ${schema.students.currentPoint} <= -10 then 1 else 0 end) as unsigned)`.mapWith(
              Number,
            ),
        })
        .from(schema.students);

      return {
        totalStudents: studentCount?.totalStudents ?? 0,
        // Deprecated compatibility fields. Global merit/penalty totals are intentionally not calculated.
        totalMeritPoints: 0,
        totalPenaltyPoints: 0,
        watchListCount: studentCount?.watchListCount ?? 0,
        records: await this.getRecords(50),
      };
    });
  }

  async createRecord(body: unknown, actorId?: number | null) {
    const parsed = pointRecordInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    const actor = requireActor(actorId);

    return this.database.query('points.records.create', async (db) =>
      db.transaction(async (tx) => {
        const [reason] = await tx
          .select({ type: schema.pointReasons.type, isActive: schema.pointReasons.isActive })
          .from(schema.pointReasons)
          .where(eq(schema.pointReasons.id, parsed.data.reasonId))
          .limit(1);
        if (!reason?.isActive) {
          throw new BadRequestException('활성화된 사유를 선택해 주세요.');
        }
        assertPointMatchesReasonType(reason.type, parsed.data.point);

        const [student] = await tx
          .select({ id: schema.students.id, userId: schema.students.userId })
          .from(schema.students)
          .where(eq(schema.students.id, parsed.data.studentId))
          .limit(1);
        if (!student) throw new NotFoundException('학생을 찾을 수 없습니다.');

        const [result] = await tx
          .insert(schema.pointRecords)
          .values({
            ...parsed.data,
            teacherId: actor,
            reasonType: reason.type,
            comment: '',
          })
          .$returningId();
        await tx
          .update(schema.students)
          .set({ currentPoint: sql`${schema.students.currentPoint} + ${parsed.data.point}` })
          .where(eq(schema.students.id, parsed.data.studentId));
        await tx.insert(schema.auditLogs).values({
          actorId: actor,
          action: 'points.record.create',
          targetType: 'point_records',
          targetId: String(result.id),
        });

        if (student.userId) {
          await this.notifications.createForUser(
            {
              userId: student.userId,
              type: 'point_awarded',
              title: pointNotificationTitle(reason.type, parsed.data.point),
              body: `사유: ${parsed.data.reasonText}`,
              link: '/points',
              metadata: {
                recordId: result.id,
                point: parsed.data.point,
                reasonType: reason.type,
              },
              dedupeKey: `point-record:${result.id}:awarded`,
            },
            tx,
          );
        }

        return {
          ok: true,
          record: { id: result.id, ...parsed.data, teacherId: actor, reasonType: reason.type },
        };
      }),
    );
  }

  async createRecordBatch(body: unknown, actorId?: number | null) {
    const parsed = createPointBatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    const actor = requireActor(actorId);
    const { idempotencyKey, records } = parsed.data;
    const lockKey = `${actor}:point-batch:${idempotencyKey}`;

    return this.runIdempotent(lockKey, () =>
      this.database.query('points.records.batch-create', async (db) =>
        db.transaction(async (tx) => {
          const [existing] = await tx
            .select({ id: schema.auditLogs.id })
            .from(schema.auditLogs)
            .where(
              and(
                eq(schema.auditLogs.actorId, actor),
                eq(schema.auditLogs.action, 'points.record.batch-create'),
                eq(schema.auditLogs.targetType, 'point_batches'),
                eq(schema.auditLogs.targetId, idempotencyKey),
              ),
            )
            .limit(1);
          if (existing) return { ok: true, replayed: true, recordIds: [] as number[] };

          const reasonIds = [...new Set(records.map((record) => record.reasonId))];
          const studentIds = [...new Set(records.map((record) => record.studentId))];
          const reasons = await tx
            .select({
              id: schema.pointReasons.id,
              type: schema.pointReasons.type,
              isActive: schema.pointReasons.isActive,
            })
            .from(schema.pointReasons)
            .where(inArray(schema.pointReasons.id, reasonIds));
          const students = await tx
            .select({ id: schema.students.id, userId: schema.students.userId })
            .from(schema.students)
            .where(inArray(schema.students.id, studentIds));
          if (reasons.length !== reasonIds.length || reasons.some((reason) => !reason.isActive)) {
            throw new BadRequestException(
              '비활성화되었거나 존재하지 않는 사유가 포함되어 있습니다.',
            );
          }
          if (students.length !== studentIds.length) {
            throw new BadRequestException('존재하지 않는 학생이 포함되어 있습니다.');
          }

          const reasonById = new Map(reasons.map((reason) => [reason.id, reason]));
          const studentById = new Map(students.map((student) => [student.id, student]));
          const recordIds: number[] = [];
          for (const record of records) {
            const reason = reasonById.get(record.reasonId);
            if (!reason) throw new BadRequestException('사유 점수를 확인할 수 없습니다.');
            assertPointMatchesReasonType(reason.type, record.point);
            const [result] = await tx
              .insert(schema.pointRecords)
              .values({
                ...record,
                teacherId: actor,
                reasonType: reason.type,
                comment: '',
              })
              .$returningId();
            recordIds.push(result.id);
            await tx
              .update(schema.students)
              .set({ currentPoint: sql`${schema.students.currentPoint} + ${record.point}` })
              .where(eq(schema.students.id, record.studentId));
            const recipientUserId = studentById.get(record.studentId)?.userId;
            if (recipientUserId) {
              await this.notifications.createForUser(
                {
                  userId: recipientUserId,
                  type: 'point_awarded',
                  title: pointNotificationTitle(reason.type, record.point),
                  body: `사유: ${record.reasonText}`,
                  link: '/points',
                  metadata: {
                    recordId: result.id,
                    point: record.point,
                    reasonType: reason.type,
                  },
                  dedupeKey: `point-record:${result.id}:awarded`,
                },
                tx,
              );
            }
          }
          await tx.insert(schema.auditLogs).values({
            actorId: actor,
            action: 'points.record.batch-create',
            targetType: 'point_batches',
            targetId: idempotencyKey,
          });

          return { ok: true, replayed: false, recordIds };
        }),
      ),
    );
  }

  async previewRecordImport(body: unknown) {
    const parsed = importPreviewSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    return this.database.query('points.records.import-preview', async (db) => {
      const studentNumbers = [...new Set(parsed.data.rows.map((row) => row.studentNo))];
      const reasonIds = [...new Set(parsed.data.rows.map((row) => row.reasonId))];
      const students = await db
        .select({
          id: schema.students.id,
          studentNo: schema.students.studentNo,
          name: schema.students.name,
        })
        .from(schema.students)
        .where(inArray(schema.students.studentNo, studentNumbers));
      const reasons = await db
        .select({
          id: schema.pointReasons.id,
          comment: schema.pointReasons.comment,
          type: schema.pointReasons.type,
          point: schema.pointReasons.point,
          isActive: schema.pointReasons.isActive,
        })
        .from(schema.pointReasons)
        .where(inArray(schema.pointReasons.id, reasonIds));
      const studentByNumber = new Map(students.map((student) => [student.studentNo, student]));
      const reasonById = new Map(reasons.map((reason) => [reason.id, reason]));

      const rows = parsed.data.rows.map((row) => {
        const student = studentByNumber.get(row.studentNo);
        const reason = reasonById.get(row.reasonId);
        const errors: string[] = [];
        if (!student) errors.push('등록되지 않은 학번입니다.');
        if (!reason) errors.push('등록되지 않은 사유입니다.');
        if (reason && !reason.isActive) errors.push('비활성화된 사유입니다.');
        if (reason) {
          if (reason.type === 'PLUS' && row.point <= 0) errors.push('상점은 양수여야 합니다.');
          if (reason.type === 'MINUS' && row.point >= 0) errors.push('벌점은 음수여야 합니다.');
        }
        return {
          rowNumber: row.rowNumber,
          studentId: student?.id,
          studentNo: row.studentNo,
          studentName: student?.name,
          reasonId: row.reasonId,
          reason: row.reasonText,
          point: row.point,
          baseDate: toDateOnly(row.baseDate),
          errors,
        };
      });

      return {
        valid: rows.every((row) => row.errors.length === 0),
        validCount: rows.filter((row) => row.errors.length === 0).length,
        errorCount: rows.filter((row) => row.errors.length > 0).length,
        rows,
      };
    });
  }

  async createReason(body: unknown, actorId?: number | null) {
    const parsed = pointReasonInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    if (parsed.data.comment.startsWith(SYSTEM_POINT_REASON_PREFIX)) {
      throw new BadRequestException('시스템 전용 사유 접두사는 사용할 수 없습니다.');
    }
    const actor = requireActor(actorId);

    return this.database.query('points.reasons.create', async (db) => {
      const [result] = await db.insert(schema.pointReasons).values(parsed.data).$returningId();
      await this.database.writeAudit({
        actorId: actor,
        action: 'points.reason.create',
        targetType: 'point_reasons',
        targetId: result.id,
      });
      return { ok: true, reason: { id: result.id, isActive: true, ...parsed.data } };
    });
  }

  async updateReason(id: number, body: unknown, actorId?: number | null) {
    const parsed = updatePointReasonSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const actor = requireActor(actorId);

    return this.database.query('points.reasons.update', async (db) =>
      db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(schema.pointReasons)
          .where(eq(schema.pointReasons.id, id))
          .limit(1)
          .for('update');
        if (!current) throw new NotFoundException('사유를 찾을 수 없습니다.');
        if (isSystemPointReason(current.comment)) {
          throw new ConflictException('시스템 사유는 직접 수정할 수 없습니다.');
        }
        if (parsed.data.comment?.startsWith(SYSTEM_POINT_REASON_PREFIX)) {
          throw new BadRequestException('시스템 전용 사유 접두사는 사용할 수 없습니다.');
        }

        const candidate = { ...current, ...parsed.data };
        const validated = pointReasonInputSchema.safeParse(candidate);
        if (!validated.success)
          throw new BadRequestException(validated.error.flatten().fieldErrors);

        await tx.update(schema.pointReasons).set(parsed.data).where(eq(schema.pointReasons.id, id));
        await tx.insert(schema.auditLogs).values({
          actorId: actor,
          action: 'points.reason.update',
          targetType: 'point_reasons',
          targetId: String(id),
        });
        return { ok: true, id };
      }),
    );
  }

  private async cancelRecordInTransaction(
    tx: AppTransaction,
    id: number,
    reason: string,
    actor: number,
  ) {
    const [record] = await tx
      .select({
        studentId: schema.pointRecords.studentId,
        point: schema.pointRecords.point,
        canceledAt: schema.pointRecords.canceledAt,
        teacherStudentNo: schema.users.studentNo,
        reason: sql<string>`coalesce(${schema.pointRecords.reasonText}, ${schema.pointReasons.comment})`,
      })
      .from(schema.pointRecords)
      .leftJoin(schema.users, eq(schema.pointRecords.teacherId, schema.users.id))
      .innerJoin(schema.pointReasons, eq(schema.pointRecords.reasonId, schema.pointReasons.id))
      .where(eq(schema.pointRecords.id, id))
      .limit(1)
      .for('update');
    if (!record) throw new NotFoundException('상벌점 기록을 찾을 수 없습니다.');
    assertPointRecordCanBeAdjusted(record);
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
      actorId: actor,
      action: 'cancel',
      beforePoint: record.point,
      afterPoint: 0,
      reason,
    });
    await tx.insert(schema.auditLogs).values({
      actorId: actor,
      action: 'points.record.cancel',
      targetType: 'point_records',
      targetId: String(id),
    });
    return { ok: true, id, action: 'cancel' as const, reason };
  }

  async cancelRecord(id: number, body: unknown, actorId?: number | null) {
    const parsed = adjustmentSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const actor = requireActor(actorId);

    return this.database.query('points.records.cancel', async (db) =>
      db.transaction((tx) => this.cancelRecordInTransaction(tx, id, parsed.data.reason, actor)),
    );
  }

  async cancelRecords(body: unknown, actorId?: number | null) {
    const parsed = bulkAdjustmentSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const actor = requireActor(actorId);
    const ids = [...new Set(parsed.data.ids)];

    return this.database.query('points.records.cancel-batch', async (db) =>
      db.transaction(async (tx) => {
        const canceledIds: number[] = [];
        for (const id of ids) {
          const result = await this.cancelRecordInTransaction(tx, id, parsed.data.reason, actor);
          canceledIds.push(result.id);
        }
        return { ok: true, canceled: canceledIds.length, ids: canceledIds };
      }),
    );
  }

  async restoreRecord(id: number, body: unknown, actorId?: number | null) {
    const parsed = adjustmentSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const actor = requireActor(actorId);

    return this.database.query('points.records.restore', async (db) =>
      db.transaction(async (tx) => {
        const [record] = await tx
          .select({
            studentId: schema.pointRecords.studentId,
            point: schema.pointRecords.point,
            canceledAt: schema.pointRecords.canceledAt,
            teacherStudentNo: schema.users.studentNo,
            reason: sql<string>`coalesce(${schema.pointRecords.reasonText}, ${schema.pointReasons.comment})`,
          })
          .from(schema.pointRecords)
          .leftJoin(schema.users, eq(schema.pointRecords.teacherId, schema.users.id))
          .innerJoin(schema.pointReasons, eq(schema.pointRecords.reasonId, schema.pointReasons.id))
          .where(eq(schema.pointRecords.id, id))
          .limit(1)
          .for('update');
        if (!record) throw new NotFoundException('상벌점 기록을 찾을 수 없습니다.');
        assertPointRecordCanBeAdjusted(record);
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
          actorId: actor,
          action: 'restore',
          beforePoint: 0,
          afterPoint: record.point,
          reason: parsed.data.reason,
        });
        await tx.insert(schema.auditLogs).values({
          actorId: actor,
          action: 'points.record.restore',
          targetType: 'point_records',
          targetId: String(id),
        });
        return { ok: true, id, action: 'restore', reason: parsed.data.reason };
      }),
    );
  }

  async syncDepartureCandidates(actorId?: number | null) {
    const actor = requireActor(actorId);
    return this.database.query('points.departure-cases.sync', async (db) =>
      db.transaction(async (tx) => {
        const candidates = await tx
          .select({ id: schema.students.id })
          .from(schema.students)
          .where(lte(schema.students.currentPoint, DEPARTURE_POINT_THRESHOLD));
        const existing = await tx
          .select({ studentId: schema.pointAwardCases.studentId })
          .from(schema.pointAwardCases)
          .where(
            and(
              eq(schema.pointAwardCases.type, 'dorm_departure'),
              inArray(schema.pointAwardCases.status, ['pending', 'processing']),
            ),
          );
        const existingIds = new Set(existing.map((item) => item.studentId));
        const newCandidates = candidates.filter((item) => !existingIds.has(item.id));
        if (newCandidates.length > 0) {
          await tx.insert(schema.pointAwardCases).values(
            newCandidates.map((candidate) => ({
              studentId: candidate.id,
              type: 'dorm_departure',
              thresholdPoint: DEPARTURE_POINT_THRESHOLD,
            })),
          );
        }
        await tx.insert(schema.auditLogs).values({
          actorId: actor,
          action: 'points.departure-cases.sync',
          targetType: 'point_award_cases',
          targetId: String(newCandidates.length),
        });
        return { ok: true, createdCount: newCandidates.length };
      }),
    );
  }

  async getDepartureCases() {
    return this.database.query('points.departure-cases', async (db) => {
      const rows = await db
        .select({
          id: schema.pointAwardCases.id,
          studentId: schema.students.id,
          studentNo: schema.students.studentNo,
          studentName: schema.students.name,
          grade: schema.students.grade,
          classNo: schema.students.classNo,
          number: schema.students.number,
          currentPoint: schema.students.currentPoint,
          thresholdPoint: schema.pointAwardCases.thresholdPoint,
          status: schema.pointAwardCases.status,
          handledBy: schema.users.name,
          handledAt: schema.pointAwardCases.handledAt,
          memo: schema.pointAwardCases.memo,
          createdAt: schema.pointAwardCases.createdAt,
        })
        .from(schema.pointAwardCases)
        .innerJoin(schema.students, eq(schema.pointAwardCases.studentId, schema.students.id))
        .leftJoin(schema.users, eq(schema.pointAwardCases.handledById, schema.users.id))
        .where(eq(schema.pointAwardCases.type, 'dorm_departure'))
        .orderBy(
          sql`case ${schema.pointAwardCases.status} when 'pending' then 0 when 'processing' then 1 else 2 end`,
          asc(schema.students.currentPoint),
        );
      return rows.map((row) => ({
        ...row,
        handledAt: row.handledAt?.toISOString(),
        createdAt: row.createdAt.toISOString(),
      }));
    });
  }

  async getDeparturePage(query: unknown) {
    const parsed = departurePageSchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    const { page, pageSize, search, grade, classNo, riskStatus, sortBy, sortOrder } = parsed.data;

    return this.database.query('points.departure-candidates.page', async (db) => {
      const conditions = [
        lte(schema.students.currentPoint, DEPARTURE_RISK_POINT_THRESHOLD),
        excludeCompletedDeparturesSql(),
      ];
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(
            like(schema.students.name, pattern),
            sql`cast(${schema.students.studentNo} as char) like ${pattern}`,
          )!,
        );
      }
      if (grade) conditions.push(eq(schema.students.grade, grade));
      if (classNo) conditions.push(eq(schema.students.classNo, classNo));
      if (riskStatus === 'risk') {
        conditions.push(gt(schema.students.currentPoint, DEPARTURE_POINT_THRESHOLD));
      }
      if (riskStatus === 'departure') {
        conditions.push(lte(schema.students.currentPoint, DEPARTURE_POINT_THRESHOLD));
      }
      const where = and(...conditions);
      const meritPoint = studentMeritPointSql();
      const penaltyPoint = studentPenaltyPointSql();
      const sortExpression =
        sortBy === 'studentNo'
          ? schema.students.studentNo
          : sortBy === 'name'
            ? schema.students.name
            : sortBy === 'meritPoint'
              ? meritPoint
              : sortBy === 'penaltyPoint'
                ? penaltyPoint
                : schema.students.currentPoint;
      const orderExpression = sortOrder === 'asc' ? asc(sortExpression) : desc(sortExpression);
      const searchRank = search ? studentSearchRankSql(search) : undefined;

      const [{ total }] = await db.select({ total: count() }).from(schema.students).where(where);
      const students = await db
        .select({
          id: schema.students.id,
          studentNo: schema.students.studentNo,
          name: schema.students.name,
          grade: schema.students.grade,
          classNo: schema.students.classNo,
          number: schema.students.number,
          currentPoint: schema.students.currentPoint,
          meritPoint,
          penaltyPoint,
        })
        .from(schema.students)
        .where(where)
        .orderBy(
          ...(searchRank
            ? [asc(searchRank), orderExpression, asc(schema.students.studentNo)]
            : [orderExpression, asc(schema.students.studentNo)]),
        )
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const ids = students.map((student) => student.id);
      const cases =
        ids.length === 0
          ? []
          : await db
              .select({
                id: schema.pointAwardCases.id,
                studentId: schema.pointAwardCases.studentId,
                status: schema.pointAwardCases.status,
                handledBy: schema.users.name,
                handledAt: schema.pointAwardCases.handledAt,
                memo: schema.pointAwardCases.memo,
              })
              .from(schema.pointAwardCases)
              .leftJoin(schema.users, eq(schema.pointAwardCases.handledById, schema.users.id))
              .where(
                and(
                  eq(schema.pointAwardCases.type, 'dorm_departure'),
                  inArray(schema.pointAwardCases.studentId, ids),
                ),
              )
              .orderBy(desc(schema.pointAwardCases.id));
      const caseByStudent = new Map<number, (typeof cases)[number]>();
      for (const item of cases) {
        if (!caseByStudent.has(item.studentId)) caseByStudent.set(item.studentId, item);
      }

      return {
        items: students.map((student) => {
          const departureCase = caseByStudent.get(student.id);
          return {
            ...student,
            riskStatus: classifyPointRisk(student.currentPoint),
            caseId: departureCase?.id,
            caseStatus: departureCase?.status,
            handledBy: departureCase?.handledBy ?? undefined,
            handledAt: departureCase?.handledAt?.toISOString(),
            memo: departureCase?.memo ?? undefined,
          };
        }),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    });
  }

  async getDepartureHistoryPage(query: unknown) {
    const parsed = departureHistoryPageSchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    const { page, pageSize, search, grade, classNo, sortBy, sortOrder } = parsed.data;

    return this.database.query('points.departure-history.page', async (db) => {
      const conditions = [
        eq(schema.pointAwardCases.type, 'dorm_departure'),
        eq(schema.pointAwardCases.status, 'completed'),
      ];
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(
            like(schema.students.name, pattern),
            sql`cast(${schema.students.studentNo} as char) like ${pattern}`,
          )!,
        );
      }
      if (grade) conditions.push(eq(schema.students.grade, grade));
      if (classNo) conditions.push(eq(schema.students.classNo, classNo));
      const where = and(...conditions);
      const sortExpression =
        sortBy === 'studentNo'
          ? schema.students.studentNo
          : sortBy === 'name'
            ? schema.students.name
            : schema.pointAwardCases.handledAt;
      const orderExpression = sortOrder === 'asc' ? asc(sortExpression) : desc(sortExpression);
      const searchRank = search ? studentSearchRankSql(search) : undefined;

      const [{ total }] = await db
        .select({ total: count() })
        .from(schema.pointAwardCases)
        .innerJoin(schema.students, eq(schema.pointAwardCases.studentId, schema.students.id))
        .where(where);
      const items = await db
        .select({
          id: schema.pointAwardCases.id,
          studentId: schema.students.id,
          studentNo: schema.students.studentNo,
          name: schema.students.name,
          handledBy: schema.users.name,
          handledAt: schema.pointAwardCases.handledAt,
          memo: schema.pointAwardCases.memo,
        })
        .from(schema.pointAwardCases)
        .innerJoin(schema.students, eq(schema.pointAwardCases.studentId, schema.students.id))
        .leftJoin(schema.users, eq(schema.pointAwardCases.handledById, schema.users.id))
        .where(where)
        .orderBy(
          ...(searchRank
            ? [asc(searchRank), orderExpression, desc(schema.pointAwardCases.id)]
            : [orderExpression, desc(schema.pointAwardCases.id)]),
        )
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return {
        items: items.map((item) => ({
          ...item,
          handledAt: item.handledAt?.toISOString(),
        })),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    });
  }

  async dismissDepartureCase(id: number, body: unknown, actorId?: number | null) {
    const parsed = departureCaseSchema.pick({ memo: true }).safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const actor = requireActor(actorId);
    return this.database.query('points.departure-cases.dismiss', async (db) => {
      const [record] = await db
        .select({ id: schema.pointAwardCases.id })
        .from(schema.pointAwardCases)
        .where(eq(schema.pointAwardCases.id, id))
        .limit(1);
      if (!record) throw new NotFoundException('퇴사 후보를 찾을 수 없습니다.');
      await db
        .update(schema.pointAwardCases)
        .set({
          status: 'dismissed',
          handledById: actor,
          handledAt: new Date(),
          memo: parsed.data.memo,
        })
        .where(eq(schema.pointAwardCases.id, id));
      await this.database.writeAudit({
        actorId: actor,
        action: 'points.departure-case.dismiss',
        targetType: 'point_award_cases',
        targetId: id,
      });
      return { ok: true, id, status: 'dismissed' as const };
    });
  }

  async completeDepartureCase(id: number, body: unknown, actorId?: number | null) {
    const parsed = departureCaseSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const actor = requireActor(actorId);

    return this.database.query('points.departure-cases.complete', async (db) =>
      db.transaction(async (tx) => {
        const [awardCase] = await tx
          .select({
            id: schema.pointAwardCases.id,
            studentId: schema.pointAwardCases.studentId,
            status: schema.pointAwardCases.status,
          })
          .from(schema.pointAwardCases)
          .where(eq(schema.pointAwardCases.id, id))
          .limit(1)
          .for('update');
        if (!awardCase) throw new NotFoundException('퇴사 후보를 찾을 수 없습니다.');
        if (awardCase.status === 'completed')
          throw new ConflictException('이미 퇴사 처리된 학생입니다.');

        const [student] = await tx
          .select({ currentPoint: schema.students.currentPoint })
          .from(schema.students)
          .where(eq(schema.students.id, awardCase.studentId))
          .limit(1)
          .for('update');
        if (!student) throw new NotFoundException('학생을 찾을 수 없습니다.');
        if (student.currentPoint > DEPARTURE_POINT_THRESHOLD) {
          throw new ConflictException('현재 순합계가 -20점보다 높아 퇴사 처리할 수 없습니다.');
        }

        const systemActor = await this.ensureSystemPointActor(tx);

        let [systemReason] = await tx
          .select({ id: schema.pointReasons.id })
          .from(schema.pointReasons)
          .where(
            and(
              eq(schema.pointReasons.type, 'ETC'),
              eq(schema.pointReasons.comment, SYSTEM_DEPARTURE_REASON),
            ),
          )
          .limit(1);
        if (!systemReason) {
          const [created] = await tx
            .insert(schema.pointReasons)
            .values({ type: 'ETC', point: 0, comment: SYSTEM_DEPARTURE_REASON, isActive: false })
            .$returningId();
          systemReason = { id: created.id };
        }

        const adjustment = calculateDepartureResetAdjustment(student.currentPoint);
        if (adjustment !== 0) {
          await tx.insert(schema.pointRecords).values({
            studentId: awardCase.studentId,
            teacherId: systemActor.id,
            reasonId: systemReason.id,
            reasonType: 'ETC',
            reasonText: SYSTEM_DEPARTURE_REASON,
            point: adjustment,
            comment: parsed.data.memo,
            baseDate: parsed.data.baseDate,
          });
        }
        await tx
          .update(schema.students)
          .set({ currentPoint: 0 })
          .where(eq(schema.students.id, awardCase.studentId));
        await tx
          .update(schema.pointAwardCases)
          .set({
            status: 'completed',
            handledById: actor,
            handledAt: new Date(),
            memo: parsed.data.memo,
          })
          .where(eq(schema.pointAwardCases.id, id));
        await tx.insert(schema.auditLogs).values([
          {
            actorId: actor,
            action: 'points.departure-case.requested',
            targetType: 'point_award_cases',
            targetId: String(id),
          },
          {
            actorId: systemActor.id,
            action: 'points.departure-case.complete',
            targetType: 'point_award_cases',
            targetId: String(id),
          },
        ]);

        return { ok: true, id, status: 'completed' as const, adjustment };
      }),
    );
  }

  async approveDepartureStudent(studentId: number, body: unknown, actorId?: number | null) {
    const parsed = departureCaseSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const actor = requireActor(actorId);

    const caseId = await this.database.query('points.departure-cases.prepare', async (db) =>
      db.transaction(async (tx) => {
        const [student] = await tx
          .select({ id: schema.students.id, currentPoint: schema.students.currentPoint })
          .from(schema.students)
          .where(eq(schema.students.id, studentId))
          .limit(1)
          .for('update');
        if (!student) throw new NotFoundException('학생을 찾을 수 없습니다.');
        if (student.currentPoint > DEPARTURE_POINT_THRESHOLD) {
          throw new ConflictException('순합계가 -20점 이하인 학생만 퇴사 처리할 수 있습니다.');
        }

        const [existing] = await tx
          .select({ id: schema.pointAwardCases.id })
          .from(schema.pointAwardCases)
          .where(
            and(
              eq(schema.pointAwardCases.studentId, studentId),
              eq(schema.pointAwardCases.type, 'dorm_departure'),
              inArray(schema.pointAwardCases.status, ['pending', 'processing']),
            ),
          )
          .orderBy(desc(schema.pointAwardCases.id))
          .limit(1);
        if (existing) return existing.id;

        const [created] = await tx
          .insert(schema.pointAwardCases)
          .values({
            studentId,
            type: 'dorm_departure',
            thresholdPoint: DEPARTURE_POINT_THRESHOLD,
            status: 'pending',
          })
          .$returningId();
        return created.id;
      }),
    );

    return this.completeDepartureCase(caseId, parsed.data, actor);
  }

  async previewSemesterHalf(body: unknown) {
    const parsed = semesterHalfSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const operationId = `${parsed.data.schoolYear}-${parsed.data.semester}`;

    return this.database.query('points.semester-half.preview', async (db) => {
      const [existing] = await db
        .select({ id: schema.auditLogs.id })
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.action, 'points.semester-half.apply'),
            eq(schema.auditLogs.targetType, 'point_semester_halves'),
            eq(schema.auditLogs.targetId, operationId),
          ),
        )
        .limit(1);

      const completedDepartures = await db
        .select({ studentId: schema.pointAwardCases.studentId })
        .from(schema.pointAwardCases)
        .where(
          and(
            eq(schema.pointAwardCases.type, 'dorm_departure'),
            eq(schema.pointAwardCases.status, 'completed'),
          ),
        );
      const excludedStudentIds = new Set(completedDepartures.map((item) => item.studentId));

      const students = await db
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
        .orderBy(schema.students.grade, schema.students.classNo, schema.students.number);
      const entries = await db
        .select({
          studentId: schema.pointRecords.studentId,
          type: sql<
            'PLUS' | 'MINUS' | 'ETC'
          >`coalesce(${schema.pointRecords.reasonType}, ${schema.pointReasons.type})`,
          reason: sql<string>`coalesce(${schema.pointRecords.reasonText}, ${schema.pointReasons.comment})`,
          point: schema.pointRecords.point,
        })
        .from(schema.pointRecords)
        .innerJoin(schema.pointReasons, eq(schema.pointRecords.reasonId, schema.pointReasons.id))
        .where(isNull(schema.pointRecords.canceledAt));
      const entriesByStudent = new Map<number, typeof entries>();
      for (const entry of entries) {
        const studentEntries = entriesByStudent.get(entry.studentId) ?? [];
        studentEntries.push(entry);
        entriesByStudent.set(entry.studentId, studentEntries);
      }

      const items = students
        .filter((student) => !excludedStudentIds.has(student.id))
        .map((student) => {
          const balances = calculateCurrentPointCategoryBalances(
            entriesByStudent.get(student.id) ?? [],
          );
          const adjustment = calculateSemesterHalfAdjustment([
            { type: 'PLUS', point: balances.meritPoint },
            { type: 'MINUS', point: -balances.penaltyPoint },
          ]);
          const delta = adjustment.meritAdjustment + adjustment.penaltyAdjustment;
          return {
            studentId: student.id,
            studentNo: student.studentNo,
            name: student.name,
            grade: student.grade,
            classNo: student.classNo,
            number: student.number,
            currentPoint: student.currentPoint,
            afterPoint: student.currentPoint + delta,
            ...adjustment,
          };
        })
        .filter((item) => item.meritAdjustment !== 0 || item.penaltyAdjustment !== 0);

      return {
        operationId,
        alreadyApplied: Boolean(existing),
        adjustedStudentCount: items.length,
        recordCount: items.reduce(
          (total, item) =>
            total + Number(item.meritAdjustment !== 0) + Number(item.penaltyAdjustment !== 0),
          0,
        ),
        items,
      };
    });
  }

  async applySemesterHalf(body: unknown, actorId?: number | null) {
    const parsed = semesterHalfSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const actor = requireActor(actorId);
    const operationId = `${parsed.data.schoolYear}-${parsed.data.semester}`;

    return this.runIdempotent(`points:semester-half:${operationId}`, () =>
      this.database.query('points.semester-half', async (db) =>
        db.transaction(async (tx) => {
          const [existing] = await tx
            .select({ id: schema.auditLogs.id })
            .from(schema.auditLogs)
            .where(
              and(
                eq(schema.auditLogs.action, 'points.semester-half.apply'),
                eq(schema.auditLogs.targetType, 'point_semester_halves'),
                eq(schema.auditLogs.targetId, operationId),
              ),
            )
            .limit(1);
          if (existing)
            return { ok: true, replayed: true, adjustedStudentCount: 0, recordCount: 0 };

          const systemActor = await this.ensureSystemPointActor(tx);

          const completedDepartures = await tx
            .select({ studentId: schema.pointAwardCases.studentId })
            .from(schema.pointAwardCases)
            .where(
              and(
                eq(schema.pointAwardCases.type, 'dorm_departure'),
                eq(schema.pointAwardCases.status, 'completed'),
              ),
            );
          const completedDepartureStudentIds = new Set(
            completedDepartures.map((item) => item.studentId),
          );

          const entries = await tx
            .select({
              studentId: schema.pointRecords.studentId,
              type: sql<
                'PLUS' | 'MINUS' | 'ETC'
              >`coalesce(${schema.pointRecords.reasonType}, ${schema.pointReasons.type})`,
              reason: sql<string>`coalesce(${schema.pointRecords.reasonText}, ${schema.pointReasons.comment})`,
              point: schema.pointRecords.point,
            })
            .from(schema.pointRecords)
            .innerJoin(
              schema.pointReasons,
              eq(schema.pointRecords.reasonId, schema.pointReasons.id),
            )
            .where(isNull(schema.pointRecords.canceledAt));
          const entriesByStudent = new Map<number, typeof entries>();
          for (const entry of entries) {
            // 퇴사 완료 시점의 ETC 초기화 원장을 보존하면서도 이후 반감으로 0점이
            // 되돌아가지 않도록 완료 학생은 학기 반감 대상에서 안전하게 제외한다.
            if (completedDepartureStudentIds.has(entry.studentId)) continue;
            const current = entriesByStudent.get(entry.studentId) ?? [];
            current.push(entry);
            entriesByStudent.set(entry.studentId, current);
          }

          const findOrCreateSystemReason = async (comment: string) => {
            let [reason] = await tx
              .select({ id: schema.pointReasons.id })
              .from(schema.pointReasons)
              .where(
                and(eq(schema.pointReasons.type, 'ETC'), eq(schema.pointReasons.comment, comment)),
              )
              .limit(1);
            if (!reason) {
              const [created] = await tx
                .insert(schema.pointReasons)
                .values({ type: 'ETC', point: 0, comment, isActive: false })
                .$returningId();
              reason = { id: created.id };
            }
            return reason.id;
          };
          const meritReasonId = await findOrCreateSystemReason(SYSTEM_MERIT_HALF_REASON);
          const penaltyReasonId = await findOrCreateSystemReason(SYSTEM_PENALTY_HALF_REASON);

          let adjustedStudentCount = 0;
          let recordCount = 0;
          for (const [studentId, studentEntries] of entriesByStudent) {
            const balances = calculateCurrentPointCategoryBalances(studentEntries);
            const adjustment = calculateSemesterHalfAdjustment([
              { type: 'PLUS', point: balances.meritPoint },
              { type: 'MINUS', point: -balances.penaltyPoint },
            ]);
            const values = [
              { reasonId: meritReasonId, point: adjustment.meritAdjustment, label: '상점 반감' },
              {
                reasonId: penaltyReasonId,
                point: adjustment.penaltyAdjustment,
                label: '벌점 반감',
              },
            ].filter((item) => item.point !== 0);
            if (values.length === 0) continue;

            for (const value of values) {
              await tx.insert(schema.pointRecords).values({
                studentId,
                teacherId: systemActor.id,
                reasonId: value.reasonId,
                reasonType: 'ETC',
                reasonText:
                  value.reasonId === meritReasonId
                    ? SYSTEM_MERIT_HALF_REASON
                    : SYSTEM_PENALTY_HALF_REASON,
                point: value.point,
                comment: `${operationId} ${value.label}`,
                baseDate: parsed.data.baseDate,
              });
              recordCount += 1;
            }
            const pointDelta = values.reduce((total, value) => total + value.point, 0);
            await tx
              .update(schema.students)
              .set({ currentPoint: sql`${schema.students.currentPoint} + ${pointDelta}` })
              .where(eq(schema.students.id, studentId));
            adjustedStudentCount += 1;
          }

          await tx.insert(schema.auditLogs).values([
            {
              actorId: actor,
              action: 'points.semester-half.requested',
              targetType: 'point_semester_halves',
              targetId: operationId,
            },
            {
              actorId: systemActor.id,
              action: 'points.semester-half.apply',
              targetType: 'point_semester_halves',
              targetId: operationId,
            },
          ]);
          return { ok: true, replayed: false, adjustedStudentCount, recordCount };
        }),
      ),
    );
  }
}
