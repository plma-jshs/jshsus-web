import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as schema from '@jshsus/db';
import type {
  ActivityRequestAdminStatus,
  ActivityRequestAdminSummary,
  ActivityRequestDetail,
  ActivityRequestParticipant,
  ActivityRequestPrintBatch,
  ActivityRequestStudentOption,
  ActivityRequestTeacherOption,
  ActivityRequestStatus,
  ActivityTimeSlotId,
  ActivityRequestSummary,
  PaginatedResponse,
} from '@jshsus/types';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  like,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';
import type { AuthSession } from '../auth/auth.service';
import { DatabaseService, type AppDatabase } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertAllowedActivityTimes } from './activity-time.policy';

const activitySlotIdSchema = z.enum([
  'morning-1',
  'morning-2',
  'afternoon-1',
  'afternoon-2',
  'evening-1',
  'evening-2',
  'evening-3',
]);

const activityFieldsSchema = z.object({
  advisorTeacherId: z.coerce.number().int().positive().optional(),
  // Compatibility for clients deployed before advisorTeacherId was introduced.
  teacherId: z.coerce.number().int().positive().optional(),
  location: z.string().trim().min(1).max(160),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  activitySlotIds: z
    .array(activitySlotIdSchema)
    .min(1)
    .max(7)
    .refine((values) => new Set(values).size === values.length)
    .optional(),
  purpose: z.string().trim().min(1).max(500),
});

const createActivityRequestSchema = activityFieldsSchema.extend({
  participantStudentNos: z.array(z.coerce.number().int().positive()).max(29).optional().default([]),
});

const createAdminActivityRequestSchema = activityFieldsSchema
  .omit({ advisorTeacherId: true, teacherId: true })
  .extend({
    representativeStudentNo: z.coerce.number().int().positive(),
    participantStudentNos: z
      .array(z.coerce.number().int().positive())
      .max(29)
      .optional()
      .default([]),
  });

const rejectSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

const printBatchSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const adminListSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((value) => [20, 50, 100].includes(value))
    .optional()
    .default(20),
  search: z.string().trim().max(100).optional().default(''),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  assignedToMe: z.preprocess(
    (value) => value === true || value === 'true',
    z.boolean().optional().default(false),
  ),
  sortBy: z
    .enum([
      'issuedNumber',
      'representative',
      'participantCount',
      'purpose',
      'location',
      'startsAt',
      'advisorTeacherName',
      'status',
    ])
    .optional()
    .default('issuedNumber'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

type ActivityRow = {
  id: number;
  createdAt: Date;
  createdById: number | null;
  representativeStudentId: number;
  studentNo: number;
  studentName: string;
  advisorTeacherId: number | null;
  reviewedById: number | null;
  location: string;
  startsAt: Date;
  endsAt: Date;
  activitySlotIds: string[] | null;
  purpose: string;
  status: ActivityRequestStatus;
  issuedNumber: string | null;
  issuedAt: Date | null;
  rejectionReason: string | null;
};

type RelatedActivityData = {
  participants: Map<number, ActivityRequestParticipant[]>;
  userNames: Map<number, string>;
};

type EditableActivityRequestSummary = ActivityRequestSummary & {
  advisorTeacherId?: number;
};

type SelectDatabase = Pick<AppDatabase, 'select'>;

const activitySelection = {
  id: schema.activityRequests.id,
  createdAt: schema.activityRequests.createdAt,
  createdById: schema.activityRequests.createdById,
  representativeStudentId: schema.activityRequests.representativeStudentId,
  studentNo: schema.students.studentNo,
  studentName: schema.students.name,
  advisorTeacherId: schema.activityRequests.advisorTeacherId,
  reviewedById: schema.activityRequests.reviewedById,
  location: schema.activityRequests.location,
  startsAt: schema.activityRequests.startsAt,
  endsAt: schema.activityRequests.endsAt,
  activitySlotIds: schema.activityRequests.activitySlotIds,
  purpose: schema.activityRequests.purpose,
  status: schema.activityRequests.status,
  issuedNumber: schema.activityRequests.issuedNumber,
  issuedAt: schema.activityRequests.issuedAt,
  rejectionReason: schema.activityRequests.rejectionReason,
};

function issueNumber(id: number) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replaceAll('-', '');
  return `AR-${date}-${String(id).padStart(4, '0')}`;
}

function todayInKorea() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function activityDateRange(date: string) {
  const startsAt = new Date(`${date}T00:00:00.000+09:00`);
  if (Number.isNaN(startsAt.getTime())) {
    throw new BadRequestException('Activity print date is invalid.');
  }
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
  return { startsAt, endsAt };
}

function adminStatus(status: ActivityRequestStatus): ActivityRequestAdminStatus {
  if (status === 'approved' || status === 'completed') return 'approved';
  if (status === 'rejected' || status === 'canceled') return 'rejected';
  return 'pending';
}

@Injectable()
export class ActivityRequestsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  async myRequests(session?: AuthSession): Promise<ActivityRequestSummary[]> {
    return this.database.query('activity-requests.me', async (db) => {
      const studentId = await this.resolveStudentId(session, db);
      const participantRows = await db
        .select({ activityRequestId: schema.activityRequestParticipants.activityRequestId })
        .from(schema.activityRequestParticipants)
        .where(eq(schema.activityRequestParticipants.studentId, studentId));

      if (participantRows.length === 0) return [];

      const requestIds = participantRows.map((row) => row.activityRequestId);
      const rows = await db
        .select(activitySelection)
        .from(schema.activityRequests)
        .innerJoin(
          schema.students,
          eq(schema.activityRequests.representativeStudentId, schema.students.id),
        )
        .where(inArray(schema.activityRequests.id, requestIds))
        .orderBy(desc(schema.activityRequests.startsAt), desc(schema.activityRequests.id));

      return this.toPublicSummaries(db, rows);
    });
  }

  async getMyRequest(id: number, session?: AuthSession): Promise<ActivityRequestDetail> {
    this.assertId(id);

    return this.database.query<ActivityRequestDetail>('activity-requests.detail', async (db) => {
      const studentId = await this.resolveStudentId(session, db);
      const [membership] = await db
        .select({ activityRequestId: schema.activityRequestParticipants.activityRequestId })
        .from(schema.activityRequestParticipants)
        .where(
          and(
            eq(schema.activityRequestParticipants.activityRequestId, id),
            eq(schema.activityRequestParticipants.studentId, studentId),
          ),
        )
        .limit(1);

      if (!membership) {
        throw new NotFoundException('Activity request does not exist.');
      }

      const [row] = await db
        .select(activitySelection)
        .from(schema.activityRequests)
        .innerJoin(
          schema.students,
          eq(schema.activityRequests.representativeStudentId, schema.students.id),
        )
        .where(eq(schema.activityRequests.id, id))
        .limit(1);

      if (!row) {
        throw new NotFoundException('Activity request does not exist.');
      }

      const [summary] = await this.toPublicSummaries(db, [row]);
      return summary as ActivityRequestDetail;
    });
  }

  async adminList(
    query: unknown = {},
    actorId?: number | null,
  ): Promise<PaginatedResponse<ActivityRequestAdminSummary>> {
    const parsed = adminListSchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    const { page, pageSize, search, date, status, assignedToMe, sortBy, sortOrder } = parsed.data;
    if (assignedToMe && (!actorId || actorId <= 0)) {
      throw new BadRequestException('담당 교사 계정을 확인할 수 없습니다.');
    }

    return this.database.query('activity-requests.admin-list', async (db) => {
      const conditions: SQL[] = [];
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(
            like(schema.students.name, pattern),
            sql`cast(${schema.students.studentNo} as char) like ${pattern}`,
            like(schema.activityRequests.location, pattern),
            like(schema.activityRequests.purpose, pattern),
            like(schema.activityRequests.issuedNumber, pattern),
            sql`exists (
              select 1
              from users advisor_search
              where advisor_search.id = ${schema.activityRequests.advisorTeacherId}
                and advisor_search.name like ${pattern}
            )`,
            sql`exists (
              select 1
              from activity_request_participants arp
              inner join students participant_student on participant_student.id = arp.student_id
              where arp.activity_request_id = ${schema.activityRequests.id}
                and (
                  participant_student.name like ${pattern}
                  or cast(participant_student.student_no as char) like ${pattern}
                )
            )`,
          )!,
        );
      }
      if (date) {
        const range = activityDateRange(date);
        conditions.push(
          and(
            lt(schema.activityRequests.startsAt, range.endsAt),
            gt(schema.activityRequests.endsAt, range.startsAt),
          )!,
        );
      }
      if (status === 'pending') {
        conditions.push(inArray(schema.activityRequests.status, ['draft', 'submitted']));
      } else if (status === 'approved') {
        conditions.push(inArray(schema.activityRequests.status, ['approved', 'completed']));
      } else if (status === 'rejected') {
        conditions.push(inArray(schema.activityRequests.status, ['rejected', 'canceled']));
      }
      if (assignedToMe) {
        conditions.push(eq(schema.activityRequests.advisorTeacherId, actorId!));
      }
      const where = conditions.length ? and(...conditions) : undefined;
      const participantCount = sql<number>`(
        select count(*)
        from activity_request_participants arp_count
        where arp_count.activity_request_id = ${schema.activityRequests.id}
      )`;
      const advisorTeacherName = sql<string>`coalesce((
        select advisor.name
        from users advisor
        where advisor.id = ${schema.activityRequests.advisorTeacherId}
      ), '')`;
      const sortExpression =
        sortBy === 'issuedNumber'
          ? schema.activityRequests.issuedNumber
          : sortBy === 'representative'
            ? schema.students.studentNo
            : sortBy === 'participantCount'
              ? participantCount
              : sortBy === 'purpose'
                ? schema.activityRequests.purpose
                : sortBy === 'location'
                  ? schema.activityRequests.location
                  : sortBy === 'advisorTeacherName'
                    ? advisorTeacherName
                    : sortBy === 'status'
                      ? schema.activityRequests.status
                      : schema.activityRequests.startsAt;
      const orderExpression = sortOrder === 'asc' ? asc(sortExpression) : desc(sortExpression);

      const [{ total }] = await db
        .select({ total: count() })
        .from(schema.activityRequests)
        .innerJoin(
          schema.students,
          eq(schema.activityRequests.representativeStudentId, schema.students.id),
        )
        .where(where);
      const rows = await db
        .select(activitySelection)
        .from(schema.activityRequests)
        .innerJoin(
          schema.students,
          eq(schema.activityRequests.representativeStudentId, schema.students.id),
        )
        .where(where)
        .orderBy(orderExpression, desc(schema.activityRequests.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return {
        items: await this.toAdminSummaries(db, rows),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    });
  }

  async adminStudentOptions(): Promise<ActivityRequestStudentOption[]> {
    return this.database.query('activity-requests.admin-students', async (db) =>
      db
        .select({
          studentId: schema.students.id,
          studentNo: schema.students.studentNo,
          studentName: schema.students.name,
          grade: schema.students.grade,
          classNo: schema.students.classNo,
          number: schema.students.number,
        })
        .from(schema.students)
        .orderBy(asc(schema.students.studentNo))
        .limit(500),
    );
  }

  async teacherOptions(): Promise<ActivityRequestTeacherOption[]> {
    return this.database.query('activity-requests.teachers', async (db) =>
      db
        .select({
          userId: schema.staffProfiles.userId,
          staffNo: schema.staffProfiles.staffNo,
          name: schema.staffProfiles.name,
        })
        .from(schema.staffProfiles)
        .innerJoin(schema.users, eq(schema.staffProfiles.userId, schema.users.id))
        .innerJoin(schema.userRoles, eq(schema.users.id, schema.userRoles.userId))
        .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
        .where(and(eq(schema.users.status, 'active'), eq(schema.roles.name, 'teacher')))
        .orderBy(asc(schema.staffProfiles.name), asc(schema.staffProfiles.staffNo))
        .limit(500),
    );
  }

  async participantStudentOptions(session?: AuthSession): Promise<ActivityRequestStudentOption[]> {
    return this.database.query('activity-requests.participant-students', async (db) => {
      const representativeStudentId = await this.resolveStudentId(session, db);
      return db
        .select({
          studentId: schema.students.id,
          studentNo: schema.students.studentNo,
          studentName: schema.students.name,
          grade: schema.students.grade,
          classNo: schema.students.classNo,
          number: schema.students.number,
        })
        .from(schema.students)
        .where(ne(schema.students.id, representativeStudentId))
        .orderBy(asc(schema.students.studentNo))
        .limit(500);
    });
  }

  async create(body: unknown, session?: AuthSession) {
    const parsed = createActivityRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    const activitySlotIds = assertAllowedActivityTimes(
      parsed.data.startsAt,
      parsed.data.endsAt,
      parsed.data.activitySlotIds,
    );

    return this.database.query('activity-requests.create', async (db) =>
      db.transaction(async (tx) => {
        const representativeStudentId = await this.resolveStudentId(session, tx);
        const [representative] = await tx
          .select({
            studentNo: schema.students.studentNo,
            name: schema.students.name,
          })
          .from(schema.students)
          .where(eq(schema.students.id, representativeStudentId))
          .limit(1);
        const participantStudentNos = [
          representative.studentNo,
          ...parsed.data.participantStudentNos,
        ];
        const participantIds = await this.resolveParticipantIds(participantStudentNos, tx);
        const advisorTeacherId = parsed.data.advisorTeacherId ?? parsed.data.teacherId;
        if (!advisorTeacherId) {
          throw new BadRequestException('담당 교사를 선택해 주세요.');
        }
        await this.assertStaffAccount(advisorTeacherId, tx);

        const [result] = await tx
          .insert(schema.activityRequests)
          .values({
            representativeStudentId,
            createdById: session?.userId && session.userId > 0 ? session.userId : null,
            advisorTeacherId,
            location: parsed.data.location,
            startsAt: parsed.data.startsAt,
            endsAt: parsed.data.endsAt,
            activitySlotIds,
            purpose: parsed.data.purpose,
            status: 'submitted',
            updatedAt: new Date(),
          })
          .$returningId();

        await tx
          .insert(schema.activityRequestParticipants)
          .values(participantIds.map((studentId) => ({ activityRequestId: result.id, studentId })));
        await tx.insert(schema.activityRequestEvents).values({
          activityRequestId: result.id,
          actorId: session?.userId && session.userId > 0 ? session.userId : null,
          type: 'submitted',
          note: '학생 신청',
        });
        await this.notifications.createForUser(
          {
            userId: advisorTeacherId,
            type: 'activity_request_submitted',
            title: `${representative.studentNo} ${representative.name} 님이 새로운 탐구활동서를 제출했습니다.`,
            metadata: {
              activityRequestId: result.id,
              representativeStudentId,
            },
            dedupeKey: `activity-request:${result.id}:submitted`,
          },
          tx,
        );

        return {
          ok: true,
          request: {
            id: result.id,
            status: 'submitted' as const,
            studentId: representativeStudentId,
          },
        };
      }),
    );
  }

  async update(id: number, body: unknown, session?: AuthSession) {
    this.assertId(id);
    const parsed = createActivityRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    const activitySlotIds = assertAllowedActivityTimes(
      parsed.data.startsAt,
      parsed.data.endsAt,
      parsed.data.activitySlotIds,
    );

    return this.database.query('activity-requests.update', async (db) =>
      db.transaction(async (tx) => {
        const representativeStudentId = await this.resolveStudentId(session, tx);
        const [request] = await tx
          .select({
            id: schema.activityRequests.id,
            status: schema.activityRequests.status,
            representativeStudentId: schema.activityRequests.representativeStudentId,
          })
          .from(schema.activityRequests)
          .where(eq(schema.activityRequests.id, id))
          .limit(1)
          .for('update');

        if (!request || request.representativeStudentId !== representativeStudentId) {
          throw new NotFoundException('Activity request does not exist.');
        }
        if (request.status !== 'submitted') {
          throw new ConflictException('Only pending activity requests can be updated.');
        }

        const [representative] = await tx
          .select({ studentNo: schema.students.studentNo })
          .from(schema.students)
          .where(eq(schema.students.id, representativeStudentId))
          .limit(1);
        const participantIds = await this.resolveParticipantIds(
          [representative.studentNo, ...parsed.data.participantStudentNos],
          tx,
        );
        const advisorTeacherId = parsed.data.advisorTeacherId ?? parsed.data.teacherId;
        if (!advisorTeacherId) {
          throw new BadRequestException('담당 교사를 선택해 주세요.');
        }
        await this.assertStaffAccount(advisorTeacherId, tx);

        await tx
          .update(schema.activityRequests)
          .set({
            advisorTeacherId,
            location: parsed.data.location,
            startsAt: parsed.data.startsAt,
            endsAt: parsed.data.endsAt,
            activitySlotIds,
            purpose: parsed.data.purpose,
            updatedAt: new Date(),
          })
          .where(eq(schema.activityRequests.id, id));
        await tx
          .delete(schema.activityRequestParticipants)
          .where(eq(schema.activityRequestParticipants.activityRequestId, id));
        await tx
          .insert(schema.activityRequestParticipants)
          .values(participantIds.map((studentId) => ({ activityRequestId: id, studentId })));

        return { ok: true, id, status: 'submitted' as const };
      }),
    );
  }

  async adminCreate(body: unknown, actorId?: number | null) {
    const parsed = createAdminActivityRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    if (!actorId || actorId <= 0) {
      throw new BadRequestException('A persisted creator account is required.');
    }
    const activitySlotIds = assertAllowedActivityTimes(
      parsed.data.startsAt,
      parsed.data.endsAt,
      parsed.data.activitySlotIds,
    );

    return this.database.query('activity-requests.admin-create', async (db) =>
      db.transaction(async (tx) => {
        const participantStudentNos = [
          parsed.data.representativeStudentNo,
          ...parsed.data.participantStudentNos,
        ];
        const participantIds = await this.resolveParticipantIds(participantStudentNos, tx);
        const [representative] = await tx
          .select({
            id: schema.students.id,
            userId: schema.students.userId,
          })
          .from(schema.students)
          .where(eq(schema.students.studentNo, parsed.data.representativeStudentNo))
          .limit(1);
        const advisorTeacherId = actorId;
        await this.assertStaffAccount(advisorTeacherId, tx);
        const issuedAt = new Date();

        const [result] = await tx
          .insert(schema.activityRequests)
          .values({
            representativeStudentId: representative.id,
            createdById: actorId,
            advisorTeacherId,
            reviewedById: actorId,
            location: parsed.data.location,
            startsAt: parsed.data.startsAt,
            endsAt: parsed.data.endsAt,
            activitySlotIds,
            purpose: parsed.data.purpose,
            status: 'approved',
            issuedAt,
            updatedAt: issuedAt,
          })
          .$returningId();
        const issuedNumber = issueNumber(result.id);
        await tx
          .update(schema.activityRequests)
          .set({ issuedNumber })
          .where(eq(schema.activityRequests.id, result.id));
        await tx
          .insert(schema.activityRequestParticipants)
          .values(participantIds.map((studentId) => ({ activityRequestId: result.id, studentId })));
        await tx.insert(schema.activityRequestEvents).values({
          activityRequestId: result.id,
          actorId,
          type: 'approved',
          note: issuedNumber,
        });
        await tx.insert(schema.auditLogs).values({
          actorId,
          action: 'activity_request.issue',
          targetType: 'activity_requests',
          targetId: String(result.id),
        });
        if (representative.userId) {
          await this.notifications.createForUser(
            {
              userId: representative.userId,
              type: 'activity_request_approved',
              title: `'${parsed.data.location}' 탐구활동서가 승인되었습니다.`,
              link: `/activity-requests/${result.id}`,
              metadata: {
                activityRequestId: result.id,
                location: parsed.data.location,
              },
              dedupeKey: `activity-request:${result.id}:approved`,
            },
            tx,
          );
        }

        return {
          ok: true,
          request: { id: result.id, status: 'approved' as const, issuedNumber },
        };
      }),
    );
  }

  async cancel(id: number, session?: AuthSession) {
    this.assertId(id);
    return this.database.query('activity-requests.cancel', async (db) =>
      db.transaction(async (tx) => {
        const studentId = await this.resolveStudentId(session, tx);
        const [request] = await tx
          .select({
            id: schema.activityRequests.id,
            status: schema.activityRequests.status,
            representativeStudentId: schema.activityRequests.representativeStudentId,
          })
          .from(schema.activityRequests)
          .where(eq(schema.activityRequests.id, id))
          .limit(1)
          .for('update');

        if (!request || request.representativeStudentId !== studentId) {
          throw new NotFoundException('Activity request does not exist.');
        }
        if (request.status !== 'submitted') {
          throw new BadRequestException('Only submitted activity requests can be canceled.');
        }

        await tx
          .update(schema.activityRequests)
          .set({ status: 'canceled', updatedAt: new Date() })
          .where(eq(schema.activityRequests.id, id));
        await tx.insert(schema.activityRequestEvents).values({
          activityRequestId: id,
          actorId: session?.userId && session.userId > 0 ? session.userId : null,
          type: 'canceled',
          note: '학생 취소',
        });
        return { ok: true, id, status: 'canceled' as const };
      }),
    );
  }

  async approve(id: number, actorId?: number | null) {
    this.assertId(id);
    const issuedNumber = issueNumber(id);

    return this.database.query('activity-requests.approve', async (db) => {
      if (!actorId || actorId <= 0) {
        throw new BadRequestException('A persisted approver account is required.');
      }
      return db.transaction(async (tx) => {
        const [request] = await tx
          .select({
            status: schema.activityRequests.status,
            representativeStudentId: schema.activityRequests.representativeStudentId,
            location: schema.activityRequests.location,
          })
          .from(schema.activityRequests)
          .where(eq(schema.activityRequests.id, id))
          .limit(1)
          .for('update');
        if (!request) throw new NotFoundException('Activity request does not exist.');
        if (request.status !== 'submitted') {
          throw new ConflictException('Only submitted activity requests can be approved.');
        }
        const [representative] = await tx
          .select({ userId: schema.students.userId })
          .from(schema.students)
          .where(eq(schema.students.id, request.representativeStudentId))
          .limit(1);

        const issuedAt = new Date();
        await tx
          .update(schema.activityRequests)
          .set({
            status: 'approved',
            reviewedById: actorId,
            issuedNumber,
            issuedAt,
            rejectionReason: null,
            updatedAt: issuedAt,
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
        if (representative?.userId) {
          await this.notifications.createForUser(
            {
              userId: representative.userId,
              type: 'activity_request_approved',
              title: `'${request.location}' 탐구활동서가 승인되었습니다.`,
              link: `/activity-requests/${id}`,
              metadata: {
                activityRequestId: id,
                location: request.location,
              },
              dedupeKey: `activity-request:${id}:approved`,
            },
            tx,
          );
        }
        return { ok: true, id, status: 'approved' as const, issuedNumber };
      });
    });
  }

  async reject(id: number, body: unknown, actorId?: number | null) {
    this.assertId(id);
    const parsed = rejectSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);

    return this.database.query('activity-requests.reject', async (db) => {
      if (!actorId || actorId <= 0) {
        throw new BadRequestException('A persisted reviewer account is required.');
      }
      return db.transaction(async (tx) => {
        const [request] = await tx
          .select({
            status: schema.activityRequests.status,
            representativeStudentId: schema.activityRequests.representativeStudentId,
            location: schema.activityRequests.location,
          })
          .from(schema.activityRequests)
          .where(eq(schema.activityRequests.id, id))
          .limit(1)
          .for('update');
        if (!request) throw new NotFoundException('Activity request does not exist.');
        if (request.status !== 'submitted') {
          throw new ConflictException('Only submitted activity requests can be rejected.');
        }
        const [representative] = await tx
          .select({ userId: schema.students.userId })
          .from(schema.students)
          .where(eq(schema.students.id, request.representativeStudentId))
          .limit(1);

        await tx
          .update(schema.activityRequests)
          .set({
            status: 'rejected',
            reviewedById: actorId,
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
        if (representative?.userId) {
          await this.notifications.createForUser(
            {
              userId: representative.userId,
              type: 'activity_request_rejected',
              title: `'${request.location}' 탐구활동서가 반려되었습니다.`,
              link: `/activity-requests/${id}`,
              metadata: {
                activityRequestId: id,
                location: request.location,
              },
              dedupeKey: `activity-request:${id}:rejected`,
            },
            tx,
          );
        }
        return {
          ok: true,
          id,
          status: 'rejected' as const,
          rejectionReason: parsed.data.reason,
        };
      });
    });
  }

  async printToday(body: unknown, actorId?: number | null): Promise<ActivityRequestPrintBatch> {
    const parsed = printBatchSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    if (!actorId || actorId <= 0) {
      throw new BadRequestException('A persisted print actor account is required.');
    }

    const date = parsed.data.date ?? todayInKorea();
    const range = activityDateRange(date);
    return this.database.query('activity-requests.print-today', async (db) =>
      db.transaction(async (tx) => {
        const rows = await tx
          .select(activitySelection)
          .from(schema.activityRequests)
          .innerJoin(
            schema.students,
            eq(schema.activityRequests.representativeStudentId, schema.students.id),
          )
          .where(
            and(
              inArray(schema.activityRequests.status, ['approved', 'completed']),
              lt(schema.activityRequests.startsAt, range.endsAt),
              gt(schema.activityRequests.endsAt, range.startsAt),
            ),
          )
          .orderBy(asc(schema.activityRequests.startsAt), asc(schema.students.studentNo));

        const documents = await this.toAdminSummaries(tx, rows);
        if (documents.length > 0) {
          await tx.insert(schema.activityRequestEvents).values(
            documents.map((document) => ({
              activityRequestId: document.id,
              actorId,
              type: 'printed' as const,
              note: `${date} 일괄 인쇄`,
            })),
          );
          await tx.insert(schema.auditLogs).values({
            actorId,
            action: 'activity_request.print_batch',
            targetType: 'activity_requests',
            targetId: `${date}:${documents.length}`,
          });
        }
        return { date, documents };
      }),
    );
  }

  private async toPublicSummaries(
    db: SelectDatabase,
    rows: ActivityRow[],
  ): Promise<ActivityRequestSummary[]> {
    const related = await this.relatedData(db, rows);
    return rows.map((row) => this.baseSummary(row, related));
  }

  private async toAdminSummaries(
    db: SelectDatabase,
    rows: ActivityRow[],
  ): Promise<ActivityRequestAdminSummary[]> {
    const related = await this.relatedData(db, rows);
    return rows.map((row) => ({
      ...this.baseSummary(row, related),
      representativeStudentId: row.representativeStudentId,
      participants: related.participants.get(row.id) ?? [],
      status: adminStatus(row.status),
      workflowStatus: row.status,
    }));
  }

  private baseSummary(
    row: ActivityRow,
    related: RelatedActivityData,
  ): EditableActivityRequestSummary {
    const creatorName = row.createdById ? related.userNames.get(row.createdById) : undefined;
    const advisorTeacherName = row.advisorTeacherId
      ? related.userNames.get(row.advisorTeacherId)
      : undefined;
    const reviewerName = row.reviewedById ? related.userNames.get(row.reviewedById) : undefined;
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      representativeStudentId: row.representativeStudentId,
      studentNo: row.studentNo,
      studentName: row.studentName,
      participants: related.participants.get(row.id) ?? [],
      creatorName: creatorName ?? row.studentName,
      advisorTeacherId: row.advisorTeacherId ?? undefined,
      advisorTeacherName,
      reviewerName,
      teacherName: advisorTeacherName,
      location: row.location,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      activitySlotIds: (row.activitySlotIds as ActivityTimeSlotId[] | null) ?? undefined,
      purpose: row.purpose,
      status: row.status,
      issuedNumber: row.issuedNumber ?? undefined,
      issuedAt: row.issuedAt?.toISOString(),
      rejectionReason: row.rejectionReason ?? undefined,
    };
  }

  private async relatedData(db: SelectDatabase, rows: ActivityRow[]): Promise<RelatedActivityData> {
    if (rows.length === 0) return { participants: new Map(), userNames: new Map() };
    const requestIds = rows.map((row) => row.id);
    const participantRows = await db
      .select({
        activityRequestId: schema.activityRequestParticipants.activityRequestId,
        studentId: schema.students.id,
        studentNo: schema.students.studentNo,
        studentName: schema.students.name,
      })
      .from(schema.activityRequestParticipants)
      .innerJoin(
        schema.students,
        eq(schema.activityRequestParticipants.studentId, schema.students.id),
      )
      .where(inArray(schema.activityRequestParticipants.activityRequestId, requestIds))
      .orderBy(asc(schema.students.studentNo));

    const representatives = new Map(rows.map((row) => [row.id, row.representativeStudentId]));
    const participants = new Map<number, ActivityRequestParticipant[]>();
    for (const participant of participantRows) {
      const list = participants.get(participant.activityRequestId) ?? [];
      list.push({
        studentId: participant.studentId,
        studentNo: participant.studentNo,
        studentName: participant.studentName,
        isRepresentative:
          representatives.get(participant.activityRequestId) === participant.studentId,
      });
      participants.set(participant.activityRequestId, list);
    }
    for (const [requestId, list] of participants) {
      list.sort((left, right) => Number(right.isRepresentative) - Number(left.isRepresentative));
      participants.set(requestId, list);
    }

    const userIds = [
      ...new Set(
        rows
          .flatMap((row) => [row.createdById, row.advisorTeacherId, row.reviewedById])
          .filter((value): value is number => value !== null),
      ),
    ];
    const userRows =
      userIds.length === 0
        ? []
        : await db
            .select({ id: schema.users.id, name: schema.users.name })
            .from(schema.users)
            .where(inArray(schema.users.id, userIds));
    return {
      participants,
      userNames: new Map(userRows.map((user) => [user.id, user.name])),
    };
  }

  private async resolveParticipantIds(studentNos: number[], db: SelectDatabase) {
    const uniqueStudentNos = [...new Set(studentNos)];
    if (uniqueStudentNos.length === 0 || uniqueStudentNos.length > 30) {
      throw new BadRequestException('Activity requests require between 1 and 30 students.');
    }
    const rows = await db
      .select({ id: schema.students.id, studentNo: schema.students.studentNo })
      .from(schema.students)
      .where(inArray(schema.students.studentNo, uniqueStudentNos));
    if (rows.length !== uniqueStudentNos.length) {
      const found = new Set(rows.map((row) => row.studentNo));
      const missing = uniqueStudentNos.filter((studentNo) => !found.has(studentNo));
      throw new BadRequestException(`Student profiles were not found: ${missing.join(', ')}`);
    }
    return rows.map((row) => row.id);
  }

  private async assertStaffAccount(userId: number, db: SelectDatabase) {
    const [staff] = await db
      .select({ userId: schema.staffProfiles.userId })
      .from(schema.staffProfiles)
      .where(eq(schema.staffProfiles.userId, userId))
      .limit(1);
    if (!staff) {
      throw new BadRequestException('선택한 담당 교사 계정을 찾을 수 없습니다.');
    }
  }

  private async resolveStudentId(session: AuthSession | undefined, db: SelectDatabase) {
    if (!session) throw new BadRequestException('Student session is required.');
    const [student] = await db
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

  private assertId(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Activity request id must be a positive integer.');
    }
  }
}
