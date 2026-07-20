import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as schema from '@jshsus/db';
import type {
  AdminAuditLog,
  AdminDashboard,
  AdminPermissionSummary,
  AdminRoleSummary,
  AdminSchoolYearSummary,
  AdminStaffSummary,
  AdminStudentSummary,
  AdminSystemStatus,
  AdminUserStatus,
  PaginatedResponse,
  RosterImportAction,
  RosterImportApplyResult,
  RosterImportPreview,
  RosterImportPreviewRow,
  StudentEnrollmentStatus,
  StudentGender,
  UserRole,
} from '@jshsus/types';
import { and, asc, desc, eq, gte, inArray, like, lte, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { ActivityRequestsService } from '../activity-requests/activity-requests.service';
import { DatabaseService } from '../database/database.service';
import { DeviceCasesService } from '../device-cases/device-cases.service';
import { PointsService } from '../points/points.service';
import { AuthService } from '../auth/auth.service';
import {
  assertRoleAssignmentAllowed,
  assertStudentGradeUpdateAllowed,
  assertStudentNumberPartsMatch,
  assertUserStatusChangeAllowed,
  deriveStudentNumberParts,
  normalizePhoneNumber,
  normalizeStudentGender,
  toStoredStudentGender,
} from './identity.policy';
import { parseIdentityListQuery } from './identity-list-query';
import { allocateStaffNumber, FIRST_STAFF_NUMBER, LAST_STAFF_NUMBER } from './staff-number';

const studentGenderSchema = z.preprocess(
  (value) => normalizeStudentGender(value) ?? value,
  z.enum(['male', 'female']),
);
const phoneSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null || String(value).trim() === '') return '';
    return normalizePhoneNumber(value) ?? value;
  },
  z.union([z.literal(''), z.string().regex(/^010\d{8}$/, 'Phone number must start with 010.')]),
);

const studentSchema = z.object({
  studentNo: z.coerce.number().int().positive(),
  name: z.string().min(1).max(64),
  gender: studentGenderSchema,
  grade: z.coerce.number().int().optional(),
  classNo: z.coerce.number().int().optional(),
  number: z.coerce.number().int().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: phoneSchema.optional().default(''),
});
const createStudentSchema = studentSchema;
const updateStudentSchema = studentSchema.partial();

const schoolYearValueSchema = z.coerce.number().int().min(2000).max(2100);

const rosterRowInputSchema = z.object({
  rowNumber: z.coerce.number().int().positive(),
  studentNo: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(64),
  gender: z.unknown().optional(),
  phone: z.string().optional(),
  email: z.string().trim().optional(),
  previousStudentNo: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),
});

const rosterImportSchema = z.object({
  schoolYear: schoolYearValueSchema,
  fileName: z.string().trim().max(255).optional(),
  rows: z.array(rosterRowInputSchema).min(1).max(2000),
  activateYear: z.boolean().optional().default(true),
});
const emailValueSchema = z.string().email();

const staffSchema = z.object({
  name: z.string().min(1).max(64),
  email: z.string().email().optional().or(z.literal('')),
  phone: phoneSchema.optional().default(''),
});
const createStaffSchema = staffSchema;

const auditLogListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
  q: z.string().trim().max(100).optional().default(''),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sortBy: z.enum(['createdAt', 'actorName', 'action', 'targetType']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const roleSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, 'Role keys must use lowercase snake_case.'),
  label: z.string().min(1).max(128),
});

const idListSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).default([]),
});

const userStatusSchema = z.object({
  status: z.enum(['active', 'restricted', 'graduated']),
});

const BUILT_IN_ROLE_NAMES = new Set([
  'system_admin',
  'student_affairs_head',
  'teacher',
  'student_council',
  'broadcast_club',
  'student',
]);

const ROSTER_ACTIONS: RosterImportAction[] = [
  'create',
  'update',
  'unchanged',
  'graduate',
  'conflict',
  'invalid',
];

type RosterImportPayload = z.infer<typeof rosterImportSchema>;

type ExistingStudentSnapshot = {
  studentId: number;
  userId: number | null;
  currentStudentNo: number;
  name: string;
  grade: number;
  classNo: number;
  number: number;
  currentPoint: number;
  gender: '0' | '1' | null;
  email: string | null;
  phone: string | null;
  status: AdminUserStatus | null;
};

type EnrollmentSnapshot = {
  id: number;
  studentId: number;
  schoolYear: number;
  studentNo: number;
  grade: number;
  classNo: number;
  number: number;
  status: StudentEnrollmentStatus;
};

type NormalizedRosterRow = {
  rowNumber: number;
  studentNo: number;
  name: string;
  grade: number;
  classNo: number;
  number: number;
  gender?: StudentGender;
  storedGender?: '0' | '1';
  phone?: string | null;
  email?: string | null;
  previousStudentNo?: number;
  userId?: number;
};

type PlannedRosterRow = RosterImportPreviewRow & {
  normalized?: NormalizedRosterRow;
  existing?: ExistingStudentSnapshot;
  targetEnrollment?: EnrollmentSnapshot;
};

type RosterPlan = RosterImportPreview & {
  plannedRows: PlannedRosterRow[];
};

function emptyRosterSummary(): Record<RosterImportAction, number> {
  return Object.fromEntries(ROSTER_ACTIONS.map((action) => [action, 0])) as Record<
    RosterImportAction,
    number
  >;
}

function hasOwnField(row: object, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(row, key);
}

function koreanDayRange(value = new Date()) {
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);

  return {
    startsAt: new Date(`${dateKey}T00:00:00.000+09:00`),
    endsAt: new Date(`${dateKey}T23:59:59.999+09:00`),
  };
}

function optionalIsoDate(value?: Date | string | null) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return value;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly pointsService: PointsService,
    private readonly deviceCasesService: DeviceCasesService,
    private readonly activityRequestsService: ActivityRequestsService,
    private readonly database: DatabaseService,
    private readonly authService: AuthService,
  ) {}

  async dashboard(): Promise<AdminDashboard> {
    const todayRange = koreanDayRange();
    const [pointSummary, deviceCases, activityRequests, todayApprovedRows] = await Promise.all([
      this.pointsService.getSummary(),
      this.deviceCasesService.list(),
      this.activityRequestsService.adminList({ page: 1, pageSize: 20, status: 'pending' }),
      this.database.query('admin.dashboard.today-activity-requests', async (db) =>
        db
          .select({ total: sql<number>`cast(count(*) as unsigned)`.mapWith(Number) })
          .from(schema.activityRequests)
          .where(
            and(
              inArray(schema.activityRequests.status, ['approved', 'completed']),
              lte(schema.activityRequests.startsAt, todayRange.endsAt),
              gte(schema.activityRequests.endsAt, todayRange.startsAt),
            ),
          ),
      ),
    ]);
    const connectedDeviceCases = deviceCases.filter((deviceCase) => deviceCase.isConnected).length;
    const disconnectedDeviceCases = deviceCases.length - connectedDeviceCases;

    return {
      today: {
        approvedActivityRequests: todayApprovedRows[0]?.total ?? 0,
        pendingActivityRequests: activityRequests.total,
        connectedDeviceCases,
        disconnectedDeviceCases,
        totalDeviceCases: deviceCases.length,
      },
      pointSummary: {
        totalStudents: pointSummary.totalStudents,
        totalMeritPoints: pointSummary.totalMeritPoints,
        totalPenaltyPoints: pointSummary.totalPenaltyPoints,
        watchListCount: pointSummary.watchListCount,
      },
      deviceCases,
      pendingActivityRequests: activityRequests.items,
    };
  }

  async systemStatus(): Promise<AdminSystemStatus> {
    const checkedAt = new Date();
    await this.database.ping();
    const [deviceCases, auditRows, dataOperationRows] = await Promise.all([
      this.deviceCasesService.list(),
      this.database.query('admin.system-status.latest-audit', async (db) =>
        db
          .select({
            action: schema.auditLogs.action,
            actorName: schema.users.name,
            createdAt: schema.auditLogs.createdAt,
          })
          .from(schema.auditLogs)
          .leftJoin(schema.users, eq(schema.auditLogs.actorId, schema.users.id))
          .orderBy(desc(schema.auditLogs.createdAt), desc(schema.auditLogs.id))
          .limit(1),
      ),
      this.database.query('admin.system-status.latest-data-operation', async (db) =>
        db
          .select({
            action: schema.auditLogs.action,
            actorName: schema.users.name,
            createdAt: schema.auditLogs.createdAt,
          })
          .from(schema.auditLogs)
          .leftJoin(schema.users, eq(schema.auditLogs.actorId, schema.users.id))
          .where(
            or(
              inArray(schema.auditLogs.targetType, [
                'roster_import_batches',
                'point_records',
                'wake_song_requests',
                'thanks_messages',
              ]),
              like(schema.auditLogs.action, '%import%'),
              like(schema.auditLogs.action, '%migration%'),
            ),
          )
          .orderBy(desc(schema.auditLogs.createdAt), desc(schema.auditLogs.id))
          .limit(1),
      ),
    ]);
    const connectedDeviceCases = deviceCases.filter((deviceCase) => deviceCase.isConnected).length;
    const disconnectedDeviceCases = deviceCases.length - connectedDeviceCases;
    const latestDeviceSeenAt = deviceCases
      .map((deviceCase) => deviceCase.lastSeenAt)
      .filter(Boolean)
      .sort()
      .at(-1);
    const latestAudit = auditRows[0];
    const latestDataOperation = dataOperationRows[0];

    return {
      checkedAt: checkedAt.toISOString(),
      api: {
        status: 'ok',
        service: 'jshsus-api',
      },
      database: {
        status: 'ok',
        checkedAt: new Date().toISOString(),
      },
      deviceCases: {
        status: disconnectedDeviceCases > 0 ? 'warning' : 'ok',
        total: deviceCases.length,
        connected: connectedDeviceCases,
        disconnected: disconnectedDeviceCases,
        lastSeenAt: latestDeviceSeenAt,
      },
      audit: {
        latestAction: latestAudit?.action,
        latestAt: optionalIsoDate(latestAudit?.createdAt),
        latestActorName: latestAudit?.actorName ?? undefined,
      },
      dataOperations: {
        latestAction: latestDataOperation?.action,
        latestAt: optionalIsoDate(latestDataOperation?.createdAt),
        latestActorName: latestDataOperation?.actorName ?? undefined,
      },
    };
  }

  async auditLogs(query: unknown): Promise<PaginatedResponse<AdminAuditLog>> {
    const parsed = auditLogListQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const { page, pageSize, q, from, to, sortBy, sortOrder } = parsed.data;
    const filters: SQL[] = [];
    if (q) {
      const pattern = `%${q}%`;
      filters.push(
        or(
          like(schema.users.name, pattern),
          like(schema.auditLogs.action, pattern),
          like(schema.auditLogs.targetType, pattern),
          like(schema.auditLogs.targetId, pattern),
        )!,
      );
    }
    if (from) filters.push(gte(schema.auditLogs.createdAt, new Date(`${from}T00:00:00+09:00`)));
    if (to) filters.push(lte(schema.auditLogs.createdAt, new Date(`${to}T23:59:59.999+09:00`)));
    const where = filters.length > 0 ? and(...filters) : undefined;
    const direction = sortOrder === 'asc' ? asc : desc;
    const sortColumn =
      sortBy === 'actorName'
        ? schema.users.name
        : sortBy === 'action'
          ? schema.auditLogs.action
          : sortBy === 'targetType'
            ? schema.auditLogs.targetType
            : schema.auditLogs.createdAt;

    return this.database.query('admin.audit-logs', async (db) => {
      const [countRow] = await db
        .select({ total: sql<number>`cast(count(*) as unsigned)`.mapWith(Number) })
        .from(schema.auditLogs)
        .leftJoin(schema.users, eq(schema.auditLogs.actorId, schema.users.id))
        .where(where);
      const total = countRow?.total ?? 0;
      const rows = await db
        .select({
          id: schema.auditLogs.id,
          actorName: schema.users.name,
          action: schema.auditLogs.action,
          targetType: schema.auditLogs.targetType,
          targetId: schema.auditLogs.targetId,
          createdAt: schema.auditLogs.createdAt,
        })
        .from(schema.auditLogs)
        .leftJoin(schema.users, eq(schema.auditLogs.actorId, schema.users.id))
        .where(where)
        .orderBy(direction(sortColumn), desc(schema.auditLogs.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return {
        items: rows.map((row) => ({
          ...row,
          actorName: row.actorName ?? 'system',
          targetType: row.targetType ?? '',
          targetId: row.targetId ?? undefined,
          createdAt: row.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    });
  }

  private fallbackSchoolYear() {
    return new Date().getFullYear();
  }

  private async getActiveSchoolYear(): Promise<number> {
    const [active] = await this.database.db
      .select({ year: schema.schoolYears.year })
      .from(schema.schoolYears)
      .where(eq(schema.schoolYears.isActive, true))
      .orderBy(desc(schema.schoolYears.year))
      .limit(1);
    if (active) return active.year;

    const year = this.fallbackSchoolYear();
    await this.database.db
      .insert(schema.schoolYears)
      .values({ year, isActive: true })
      .onDuplicateKeyUpdate({
        set: { isActive: true, updatedAt: new Date() },
      });
    return year;
  }

  async schoolYears(): Promise<AdminSchoolYearSummary[]> {
    await this.getActiveSchoolYear();
    return this.database.query('admin.school-years', async (db) =>
      db
        .select({
          id: schema.schoolYears.id,
          year: schema.schoolYears.year,
          isActive: schema.schoolYears.isActive,
        })
        .from(schema.schoolYears)
        .orderBy(desc(schema.schoolYears.year)),
    );
  }

  private async rolesByUserIds(userIds: number[]): Promise<Map<number, UserRole[]>> {
    const result = new Map<number, UserRole[]>();
    if (userIds.length === 0) return result;

    const rows = await this.database.db
      .select({ userId: schema.userRoles.userId, role: schema.roles.name })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
      .where(inArray(schema.userRoles.userId, userIds))
      .orderBy(schema.roles.label);

    for (const row of rows) {
      result.set(row.userId, [...(result.get(row.userId) ?? []), row.role as UserRole]);
    }
    return result;
  }

  async students(query: unknown): Promise<PaginatedResponse<AdminStudentSummary>> {
    const { page, pageSize, q, schoolYear, grade, classNo, sortBy, sortOrder } =
      parseIdentityListQuery(query);
    const targetSchoolYear = schoolYear ?? (await this.getActiveSchoolYear());
    const filters: SQL[] = [
      eq(schema.studentEnrollments.schoolYear, targetSchoolYear),
      eq(schema.studentEnrollments.status, 'active'),
    ];
    if (q) {
      const pattern = `%${q}%`;
      filters.push(
        or(
          like(schema.students.name, pattern),
          like(sql`cast(${schema.studentEnrollments.studentNo} as char)`, pattern),
        )!,
      );
    }
    if (grade) filters.push(eq(schema.studentEnrollments.grade, grade));
    if (classNo) filters.push(eq(schema.studentEnrollments.classNo, classNo));
    const where = and(...filters);
    const direction = sortOrder === 'desc' ? desc : asc;
    const sortColumn =
      sortBy === 'name'
        ? schema.students.name
        : sortBy === 'lastLoginAt'
          ? schema.users.lastLoginAt
          : schema.studentEnrollments.studentNo;

    return this.database.query('admin.students', async (db) => {
      const [countRow] = await db
        .select({ total: sql<number>`cast(count(*) as unsigned)`.mapWith(Number) })
        .from(schema.studentEnrollments)
        .innerJoin(schema.students, eq(schema.studentEnrollments.studentId, schema.students.id))
        .leftJoin(schema.users, eq(schema.students.userId, schema.users.id))
        .where(where);
      const total = countRow?.total ?? 0;
      const rows = await db
        .select({
          id: schema.studentEnrollments.studentId,
          userId: schema.students.userId,
          enrollmentId: schema.studentEnrollments.id,
          schoolYear: schema.studentEnrollments.schoolYear,
          enrollmentStatus: schema.studentEnrollments.status,
          studentNo: schema.studentEnrollments.studentNo,
          name: schema.students.name,
          grade: schema.studentEnrollments.grade,
          classNo: schema.studentEnrollments.classNo,
          number: schema.studentEnrollments.number,
          currentPoint: schema.students.currentPoint,
          gender: schema.users.gender,
          email: schema.users.email,
          phone: schema.users.phone,
          lastLoginAt: schema.users.lastLoginAt,
        })
        .from(schema.studentEnrollments)
        .innerJoin(schema.students, eq(schema.studentEnrollments.studentId, schema.students.id))
        .leftJoin(schema.users, eq(schema.students.userId, schema.users.id))
        .where(where)
        .orderBy(direction(sortColumn), asc(schema.studentEnrollments.studentId))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      const roles = await this.rolesByUserIds(
        rows.flatMap((row) => (row.userId ? [row.userId] : [])),
      );

      return {
        items: rows.map((row) => ({
          id: row.id,
          userId: row.userId ?? undefined,
          schoolYear: row.schoolYear,
          enrollmentId: row.enrollmentId,
          enrollmentStatus: row.enrollmentStatus,
          studentNo: row.studentNo,
          name: row.name,
          grade: row.grade,
          classNo: row.classNo,
          number: row.number,
          currentPoint: row.currentPoint,
          gender: normalizeStudentGender(row.gender),
          email: row.email ?? undefined,
          phone: row.phone ?? undefined,
          roles: row.userId ? (roles.get(row.userId) ?? []) : [],
          lastLoginAt: row.lastLoginAt?.toISOString(),
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    });
  }

  async createStudent(body: unknown, actorId?: number | null) {
    const parsed = createStudentSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const studentIdentity = deriveStudentNumberParts(parsed.data.studentNo);
    assertStudentNumberPartsMatch(studentIdentity, parsed.data);

    const activeSchoolYear = await this.getActiveSchoolYear();
    const result = await this.database.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({
          studentNo: parsed.data.studentNo,
          name: parsed.data.name,
          grade: studentIdentity.grade,
          classNo: studentIdentity.classNo,
          number: studentIdentity.number,
          gender: toStoredStudentGender(parsed.data.gender),
          email: parsed.data.email || null,
          phone: parsed.data.phone || null,
        })
        .$returningId();

      const [student] = await tx
        .insert(schema.students)
        .values({
          userId: user.id,
          studentNo: parsed.data.studentNo,
          name: parsed.data.name,
          grade: studentIdentity.grade,
          classNo: studentIdentity.classNo,
          number: studentIdentity.number,
        })
        .$returningId();

      await tx
        .insert(schema.studentEnrollments)
        .values({
          studentId: student.id,
          schoolYear: activeSchoolYear,
          studentNo: studentIdentity.studentNo,
          grade: studentIdentity.grade,
          classNo: studentIdentity.classNo,
          number: studentIdentity.number,
          status: 'active',
        })
        .onDuplicateKeyUpdate({
          set: {
            studentNo: studentIdentity.studentNo,
            grade: studentIdentity.grade,
            classNo: studentIdentity.classNo,
            number: studentIdentity.number,
            status: 'active',
            updatedAt: new Date(),
          },
        });

      const [studentRole] = await tx
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(eq(schema.roles.name, 'student'))
        .limit(1);
      if (studentRole) {
        await tx.insert(schema.userRoles).values({ userId: user.id, roleId: studentRole.id });
      }

      return { userId: user.id, studentId: student.id };
    });

    await this.database.writeAudit({
      actorId,
      action: 'admin.student.create',
      targetType: 'students',
      targetId: result.studentId,
    });

    return { ok: true, ...result };
  }

  async updateStudent(id: number, body: unknown, actorId?: number | null) {
    const parsed = updateStudentSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const [student] = await this.database.db
      .select({
        userId: schema.students.userId,
        studentNo: schema.students.studentNo,
        grade: schema.students.grade,
      })
      .from(schema.students)
      .where(eq(schema.students.id, id))
      .limit(1);

    if (!student) throw new NotFoundException('Student not found.');
    const nextStudentNo = parsed.data.studentNo ?? student.studentNo;
    const studentIdentity = deriveStudentNumberParts(nextStudentNo, {
      allowTestFixture: student.studentNo === 9999 && nextStudentNo === 9999,
    });
    assertStudentNumberPartsMatch(studentIdentity, parsed.data);
    assertStudentGradeUpdateAllowed({
      currentGrade: student.grade,
      nextGrade: studentIdentity.grade,
    });

    const activeSchoolYear = await this.getActiveSchoolYear();
    await this.database.db.transaction(async (tx) => {
      await tx
        .update(schema.students)
        .set({
          studentNo: studentIdentity.studentNo,
          name: parsed.data.name,
          grade: studentIdentity.grade,
          classNo: studentIdentity.classNo,
          number: studentIdentity.number,
          updatedAt: new Date(),
        })
        .where(eq(schema.students.id, id));

      if (student.userId) {
        await tx
          .update(schema.users)
          .set({
            studentNo: studentIdentity.studentNo,
            name: parsed.data.name,
            grade: studentIdentity.grade,
            classNo: studentIdentity.classNo,
            number: studentIdentity.number,
            gender:
              parsed.data.gender === undefined
                ? undefined
                : toStoredStudentGender(parsed.data.gender),
            email: parsed.data.email === undefined ? undefined : parsed.data.email || null,
            phone: parsed.data.phone === undefined ? undefined : parsed.data.phone || null,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, student.userId));
      }

      await tx
        .insert(schema.studentEnrollments)
        .values({
          studentId: id,
          schoolYear: activeSchoolYear,
          studentNo: studentIdentity.studentNo,
          grade: studentIdentity.grade,
          classNo: studentIdentity.classNo,
          number: studentIdentity.number,
          status: 'active',
        })
        .onDuplicateKeyUpdate({
          set: {
            studentNo: studentIdentity.studentNo,
            grade: studentIdentity.grade,
            classNo: studentIdentity.classNo,
            number: studentIdentity.number,
            status: 'active',
            updatedAt: new Date(),
          },
        });
    });

    await this.database.writeAudit({
      actorId,
      action: 'admin.student.update',
      targetType: 'students',
      targetId: id,
    });

    return { ok: true, id };
  }

  private rosterRowHasChanges(
    row: NormalizedRosterRow,
    existing: ExistingStudentSnapshot,
    targetEnrollment?: EnrollmentSnapshot,
  ) {
    if (!targetEnrollment || targetEnrollment.status !== 'active') return true;
    if (
      targetEnrollment.studentNo !== row.studentNo ||
      targetEnrollment.grade !== row.grade ||
      targetEnrollment.classNo !== row.classNo ||
      targetEnrollment.number !== row.number
    ) {
      return true;
    }
    if (
      existing.currentStudentNo !== row.studentNo ||
      existing.grade !== row.grade ||
      existing.classNo !== row.classNo ||
      existing.number !== row.number ||
      existing.name !== row.name ||
      existing.status !== 'active'
    ) {
      return true;
    }
    if (row.storedGender !== undefined && existing.gender !== row.storedGender) return true;
    if (row.email !== undefined && existing.email !== row.email) return true;
    if (row.phone !== undefined && existing.phone !== row.phone) return true;
    return false;
  }

  private publicRosterRows(rows: PlannedRosterRow[]): RosterImportPreviewRow[] {
    return rows.map((row) => ({
      rowNumber: row.rowNumber,
      action: row.action,
      studentNo: row.studentNo,
      previousStudentNo: row.previousStudentNo,
      name: row.name,
      matchedUserId: row.matchedUserId,
      matchedStudentId: row.matchedStudentId,
      messages: row.messages,
    }));
  }

  private async buildRosterPlan(input: RosterImportPayload): Promise<RosterPlan> {
    const activeSchoolYear = await this.getActiveSchoolYear();
    const enrollmentYears = [...new Set([input.schoolYear, activeSchoolYear])];
    const [students, enrollments] = await Promise.all([
      this.database.db
        .select({
          studentId: schema.students.id,
          userId: schema.students.userId,
          currentStudentNo: schema.students.studentNo,
          name: schema.students.name,
          grade: schema.students.grade,
          classNo: schema.students.classNo,
          number: schema.students.number,
          currentPoint: schema.students.currentPoint,
          gender: schema.users.gender,
          email: schema.users.email,
          phone: schema.users.phone,
          status: schema.users.status,
        })
        .from(schema.students)
        .leftJoin(schema.users, eq(schema.students.userId, schema.users.id)),
      this.database.db
        .select({
          id: schema.studentEnrollments.id,
          studentId: schema.studentEnrollments.studentId,
          schoolYear: schema.studentEnrollments.schoolYear,
          studentNo: schema.studentEnrollments.studentNo,
          grade: schema.studentEnrollments.grade,
          classNo: schema.studentEnrollments.classNo,
          number: schema.studentEnrollments.number,
          status: schema.studentEnrollments.status,
        })
        .from(schema.studentEnrollments)
        .where(inArray(schema.studentEnrollments.schoolYear, enrollmentYears)),
    ]);

    const studentById = new Map<number, ExistingStudentSnapshot>();
    const studentByUserId = new Map<number, ExistingStudentSnapshot>();
    const studentsByNamePhone = new Map<string, ExistingStudentSnapshot[]>();
    for (const student of students) {
      const snapshot: ExistingStudentSnapshot = {
        ...student,
        status: student.status as AdminUserStatus | null,
      };
      studentById.set(snapshot.studentId, snapshot);
      if (snapshot.userId) studentByUserId.set(snapshot.userId, snapshot);
      const normalizedPhone = normalizePhoneNumber(snapshot.phone ?? '');
      if (normalizedPhone) {
        const key = `${snapshot.name}::${normalizedPhone}`;
        studentsByNamePhone.set(key, [...(studentsByNamePhone.get(key) ?? []), snapshot]);
      }
    }

    const targetEnrollmentByStudentNo = new Map<number, EnrollmentSnapshot>();
    const targetEnrollmentByStudentId = new Map<number, EnrollmentSnapshot>();
    const activeEnrollmentByStudentNo = new Map<number, EnrollmentSnapshot>();
    const activeEnrollments = new Map<number, EnrollmentSnapshot>();
    for (const enrollment of enrollments) {
      const snapshot = enrollment as EnrollmentSnapshot;
      if (snapshot.schoolYear === input.schoolYear) {
        targetEnrollmentByStudentNo.set(snapshot.studentNo, snapshot);
        targetEnrollmentByStudentId.set(snapshot.studentId, snapshot);
      }
      if (snapshot.schoolYear === activeSchoolYear && snapshot.status === 'active') {
        activeEnrollmentByStudentNo.set(snapshot.studentNo, snapshot);
        activeEnrollments.set(snapshot.studentId, snapshot);
      }
    }

    const uploadedStudentNos = new Set<number>();
    const matchedStudentIds = new Set<number>();
    const plannedRows: PlannedRosterRow[] = [];

    for (const row of input.rows) {
      const messages: string[] = [];
      let invalid = false;
      let conflict = false;
      let identity:
        | {
            studentNo: number;
            grade: number;
            classNo: number;
            number: number;
          }
        | undefined;

      try {
        identity = deriveStudentNumberParts(row.studentNo);
      } catch {
        invalid = true;
        messages.push('학번은 1101~3420 범위의 학년·반·번호 조합이어야 합니다.');
      }

      if (row.studentNo === 9999) {
        invalid = true;
        messages.push('9999 테스트 계정은 명단 업로드 대상이 아닙니다.');
      }

      if (uploadedStudentNos.has(row.studentNo)) {
        invalid = true;
        messages.push('업로드 파일 안에서 학번이 중복되었습니다.');
      }
      uploadedStudentNos.add(row.studentNo);

      let storedGender: '0' | '1' | undefined;
      let gender: StudentGender | undefined;
      if (hasOwnField(row, 'gender') && row.gender !== undefined && String(row.gender).trim()) {
        gender = normalizeStudentGender(row.gender);
        if (!gender) {
          invalid = true;
          messages.push('성별은 0/1, 남/여, male/female 중 하나여야 합니다.');
        } else {
          storedGender = toStoredStudentGender(gender);
        }
      }

      let phone: string | null | undefined;
      if (hasOwnField(row, 'phone')) {
        const normalizedPhone = normalizePhoneNumber(row.phone ?? '');
        if (normalizedPhone === undefined) {
          invalid = true;
          messages.push('전화번호는 010으로 시작하는 11자리 번호여야 합니다.');
        } else {
          phone = normalizedPhone || null;
        }
      }

      let email: string | null | undefined;
      if (hasOwnField(row, 'email')) {
        const rawEmail = (row.email ?? '').trim();
        if (rawEmail && !emailValueSchema.safeParse(rawEmail).success) {
          invalid = true;
          messages.push('이메일 형식이 올바르지 않습니다.');
        } else {
          email = rawEmail || null;
        }
      }

      if (row.previousStudentNo !== undefined) {
        try {
          deriveStudentNumberParts(row.previousStudentNo);
        } catch {
          invalid = true;
          messages.push('이전 학번 형식이 올바르지 않습니다.');
        }
      }

      let existing: ExistingStudentSnapshot | undefined;
      const addCandidate = (candidate: ExistingStudentSnapshot | undefined, reason: string) => {
        if (!candidate) return;
        if (existing && existing.studentId !== candidate.studentId) {
          conflict = true;
          messages.push(`${reason} 기준으로 서로 다른 학생 계정이 함께 매칭되었습니다.`);
          return;
        }
        existing = candidate;
      };

      if (row.userId) {
        const candidate = studentByUserId.get(row.userId);
        if (!candidate) {
          conflict = true;
          messages.push('user_id와 연결된 학생 계정을 찾을 수 없습니다.');
        }
        addCandidate(candidate, 'user_id');
      }

      const targetEnrollment = targetEnrollmentByStudentNo.get(row.studentNo);
      addCandidate(
        targetEnrollment ? studentById.get(targetEnrollment.studentId) : undefined,
        '올해 학번',
      );

      if (row.previousStudentNo !== undefined) {
        const previousEnrollment = activeEnrollmentByStudentNo.get(row.previousStudentNo);
        if (!previousEnrollment) {
          conflict = true;
          messages.push('이전 학번과 연결된 현재 재학생을 찾을 수 없습니다.');
        }
        addCandidate(
          previousEnrollment ? studentById.get(previousEnrollment.studentId) : undefined,
          '이전 학번',
        );
      }

      if (!existing && phone) {
        const candidates = studentsByNamePhone.get(`${row.name}::${phone}`) ?? [];
        if (candidates.length === 1) {
          addCandidate(candidates[0], '이름+전화번호');
        } else if (candidates.length > 1) {
          conflict = true;
          messages.push('이름과 전화번호가 같은 학생 계정이 여러 개 있습니다.');
        }
      }

      if (existing && !existing.userId) {
        conflict = true;
        messages.push('기존 학생 레코드에 연결된 사용자 계정이 없습니다.');
      }

      const normalized: NormalizedRosterRow | undefined =
        identity && !invalid
          ? {
              rowNumber: row.rowNumber,
              studentNo: identity.studentNo,
              name: row.name,
              grade: identity.grade,
              classNo: identity.classNo,
              number: identity.number,
              gender,
              storedGender,
              phone,
              email,
              previousStudentNo: row.previousStudentNo,
              userId: row.userId,
            }
          : undefined;

      const matchedTargetEnrollment = existing
        ? targetEnrollmentByStudentId.get(existing.studentId)
        : targetEnrollment;

      let action: RosterImportAction;
      if (invalid) {
        action = 'invalid';
      } else if (conflict) {
        action = 'conflict';
      } else if (existing && normalized) {
        matchedStudentIds.add(existing.studentId);
        action = this.rosterRowHasChanges(normalized, existing, matchedTargetEnrollment)
          ? 'update'
          : 'unchanged';
      } else {
        action = 'create';
      }

      if (messages.length === 0) {
        messages.push(
          action === 'create'
            ? '신규 학생 계정을 생성합니다.'
            : action === 'update'
              ? '기존 학생 계정과 학년도 이력을 갱신합니다.'
              : action === 'unchanged'
                ? '변경할 내용이 없습니다.'
                : '확인이 필요합니다.',
        );
      }

      plannedRows.push({
        rowNumber: row.rowNumber,
        action,
        studentNo: row.studentNo,
        previousStudentNo: row.previousStudentNo,
        name: row.name,
        matchedUserId: existing?.userId ?? undefined,
        matchedStudentId: existing?.studentId,
        messages,
        normalized,
        existing,
        targetEnrollment: matchedTargetEnrollment,
      });
    }

    if (input.activateYear) {
      for (const enrollment of activeEnrollments.values()) {
        if (matchedStudentIds.has(enrollment.studentId) || enrollment.studentNo === 9999) continue;
        const existing = studentById.get(enrollment.studentId);
        if (!existing?.userId) continue;
        plannedRows.push({
          rowNumber: 0,
          action: 'graduate',
          studentNo: enrollment.studentNo,
          name: existing.name,
          matchedUserId: existing.userId,
          matchedStudentId: existing.studentId,
          messages: [
            `${activeSchoolYear}학년도 활성 명단에는 있지만 업로드 명단에는 없어 졸업 처리합니다.`,
          ],
          existing,
          targetEnrollment: enrollment,
        });
      }
    }

    const summary = emptyRosterSummary();
    for (const row of plannedRows) summary[row.action] += 1;
    const canApply = summary.invalid === 0 && summary.conflict === 0;

    return {
      schoolYear: input.schoolYear,
      activeSchoolYear,
      rows: this.publicRosterRows(plannedRows),
      plannedRows,
      summary,
      canApply,
    };
  }

  async previewStudentRoster(body: unknown): Promise<RosterImportPreview> {
    const parsed = rosterImportSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const plan = await this.buildRosterPlan(parsed.data);
    return {
      schoolYear: plan.schoolYear,
      activeSchoolYear: plan.activeSchoolYear,
      rows: plan.rows,
      summary: plan.summary,
      canApply: plan.canApply,
    };
  }

  async applyStudentRoster(
    body: unknown,
    actorId?: number | null,
  ): Promise<RosterImportApplyResult> {
    const parsed = rosterImportSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);

    const plan = await this.buildRosterPlan(parsed.data);
    if (!plan.canApply) {
      throw new BadRequestException('Roster contains invalid or conflicting rows.');
    }

    const affectedUserIds = new Set<number>();
    const result = await this.database.db.transaction(async (tx) => {
      const now = new Date();
      if (parsed.data.activateYear) {
        await tx
          .update(schema.schoolYears)
          .set({ isActive: false, updatedAt: now })
          .where(eq(schema.schoolYears.isActive, true));
        await tx
          .insert(schema.schoolYears)
          .values({ year: parsed.data.schoolYear, isActive: true })
          .onDuplicateKeyUpdate({
            set: { isActive: true, updatedAt: now },
          });
      } else {
        await tx
          .insert(schema.schoolYears)
          .values({ year: parsed.data.schoolYear, isActive: false })
          .onDuplicateKeyUpdate({
            set: { updatedAt: now },
          });
      }

      const [studentRole] = await tx
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(eq(schema.roles.name, 'student'))
        .limit(1);
      if (!studentRole) throw new BadRequestException('Student role is missing.');

      for (const row of plan.plannedRows) {
        if (row.action === 'create') {
          const normalized = row.normalized;
          if (!normalized) throw new BadRequestException('Invalid create row.');

          const [user] = await tx
            .insert(schema.users)
            .values({
              studentNo: normalized.studentNo,
              name: normalized.name,
              grade: normalized.grade,
              classNo: normalized.classNo,
              number: normalized.number,
              gender: normalized.storedGender ?? null,
              email: normalized.email ?? null,
              phone: normalized.phone ?? null,
              status: 'active',
            })
            .$returningId();
          const [student] = await tx
            .insert(schema.students)
            .values({
              userId: user.id,
              studentNo: normalized.studentNo,
              name: normalized.name,
              grade: normalized.grade,
              classNo: normalized.classNo,
              number: normalized.number,
            })
            .$returningId();
          await tx.insert(schema.userRoles).values({ userId: user.id, roleId: studentRole.id });
          await tx.insert(schema.studentEnrollments).values({
            studentId: student.id,
            schoolYear: parsed.data.schoolYear,
            studentNo: normalized.studentNo,
            grade: normalized.grade,
            classNo: normalized.classNo,
            number: normalized.number,
            status: 'active',
          });
          continue;
        }

        if (row.action === 'update') {
          const normalized = row.normalized;
          const existing = row.existing;
          if (!normalized || !existing?.userId)
            throw new BadRequestException('Invalid update row.');

          await tx
            .update(schema.students)
            .set({
              studentNo: normalized.studentNo,
              name: normalized.name,
              grade: normalized.grade,
              classNo: normalized.classNo,
              number: normalized.number,
              updatedAt: now,
            })
            .where(eq(schema.students.id, existing.studentId));

          await tx
            .update(schema.users)
            .set({
              studentNo: normalized.studentNo,
              name: normalized.name,
              grade: normalized.grade,
              classNo: normalized.classNo,
              number: normalized.number,
              gender: normalized.storedGender,
              email: normalized.email,
              phone: normalized.phone,
              status: 'active',
              updatedAt: now,
            })
            .where(eq(schema.users.id, existing.userId));

          await tx
            .insert(schema.studentEnrollments)
            .values({
              studentId: existing.studentId,
              schoolYear: parsed.data.schoolYear,
              studentNo: normalized.studentNo,
              grade: normalized.grade,
              classNo: normalized.classNo,
              number: normalized.number,
              status: 'active',
            })
            .onDuplicateKeyUpdate({
              set: {
                studentNo: normalized.studentNo,
                grade: normalized.grade,
                classNo: normalized.classNo,
                number: normalized.number,
                status: 'active',
                updatedAt: now,
              },
            });
          affectedUserIds.add(existing.userId);
          continue;
        }

        if (row.action === 'graduate' && row.existing?.userId && row.matchedStudentId) {
          await tx
            .update(schema.studentEnrollments)
            .set({ status: 'graduated', updatedAt: now })
            .where(
              and(
                eq(schema.studentEnrollments.studentId, row.matchedStudentId),
                eq(schema.studentEnrollments.schoolYear, plan.activeSchoolYear),
                eq(schema.studentEnrollments.status, 'active'),
              ),
            );
          await tx
            .update(schema.users)
            .set({ status: 'graduated', updatedAt: now })
            .where(eq(schema.users.id, row.existing.userId));
          affectedUserIds.add(row.existing.userId);
        }
      }

      const [batch] = await tx
        .insert(schema.rosterImportBatches)
        .values({
          schoolYear: parsed.data.schoolYear,
          appliedById: actorId && actorId > 0 ? actorId : null,
          fileName: parsed.data.fileName,
          rowCount: parsed.data.rows.length,
          createdCount: plan.summary.create,
          updatedCount: plan.summary.update,
          unchangedCount: plan.summary.unchanged,
          graduatedCount: plan.summary.graduate,
        })
        .$returningId();

      return { batchId: batch.id };
    });

    await Promise.all(
      [...affectedUserIds].map((userId) => this.authService.invalidateUserSessions(userId)),
    );
    await this.database.writeAudit({
      actorId,
      action: 'admin.student-roster.apply',
      targetType: 'roster_import_batches',
      targetId: result.batchId,
    });

    return {
      ok: true,
      batchId: result.batchId,
      schoolYear: plan.schoolYear,
      activeSchoolYear: plan.activeSchoolYear,
      rows: plan.rows,
      summary: plan.summary,
      canApply: plan.canApply,
    };
  }

  async staff(query: unknown): Promise<PaginatedResponse<AdminStaffSummary>> {
    const { page, pageSize, q, sortBy, sortOrder } = parseIdentityListQuery(query);
    const filters: SQL[] = [];
    if (q) {
      const pattern = `%${q}%`;
      filters.push(
        or(
          like(schema.staffProfiles.name, pattern),
          like(sql`cast(${schema.staffProfiles.staffNo} as char)`, pattern),
        )!,
      );
    }
    const where = filters.length > 0 ? and(...filters) : undefined;
    const direction = sortOrder === 'desc' ? desc : asc;
    const sortColumn =
      sortBy === 'name'
        ? schema.staffProfiles.name
        : sortBy === 'lastLoginAt'
          ? schema.users.lastLoginAt
          : schema.staffProfiles.staffNo;

    return this.database.query('admin.staff', async (db) => {
      const [countRow] = await db
        .select({ total: sql<number>`cast(count(*) as unsigned)`.mapWith(Number) })
        .from(schema.staffProfiles)
        .innerJoin(schema.users, eq(schema.staffProfiles.userId, schema.users.id))
        .where(where);
      const total = countRow?.total ?? 0;
      const rows = await db
        .select({
          id: schema.staffProfiles.id,
          userId: schema.staffProfiles.userId,
          staffNo: schema.staffProfiles.staffNo,
          name: schema.staffProfiles.name,
          managedClasses: schema.staffProfiles.managedClasses,
          email: schema.users.email,
          phone: schema.users.phone,
          lastLoginAt: schema.users.lastLoginAt,
        })
        .from(schema.staffProfiles)
        .innerJoin(schema.users, eq(schema.staffProfiles.userId, schema.users.id))
        .where(where)
        .orderBy(direction(sortColumn), asc(schema.staffProfiles.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      const roles = await this.rolesByUserIds(rows.map((row) => row.userId));

      return {
        items: rows.map((row) => ({
          id: row.id,
          userId: row.userId,
          staffNo: row.staffNo,
          name: row.name,
          managedClasses: row.managedClasses ?? [],
          email: row.email ?? undefined,
          phone: row.phone ?? undefined,
          roles: roles.get(row.userId) ?? [],
          lastLoginAt: row.lastLoginAt?.toISOString(),
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    });
  }

  async createStaff(body: unknown, actorId?: number | null) {
    const parsed = createStaffSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const result = await this.database.db.transaction(async (tx) => {
      await tx
        .insert(schema.identitySequences)
        .values({ key: 'staff_number', nextValue: FIRST_STAFF_NUMBER })
        .onDuplicateKeyUpdate({ set: { key: 'staff_number' } });
      const staffNo = await allocateStaffNumber(async () => {
        const [sequence] = await tx
          .select({ nextValue: schema.identitySequences.nextValue })
          .from(schema.identitySequences)
          .where(eq(schema.identitySequences.key, 'staff_number'))
          .for('update');
        if (!sequence) return Number.NaN;

        let candidate = sequence.nextValue;
        while (candidate <= LAST_STAFF_NUMBER) {
          const [staffCollision] = await tx
            .select({ id: schema.staffProfiles.id })
            .from(schema.staffProfiles)
            .where(eq(schema.staffProfiles.staffNo, candidate))
            .limit(1);

          if (!staffCollision) break;
          candidate += 1;
        }

        await tx
          .update(schema.identitySequences)
          .set({ nextValue: candidate + 1, updatedAt: new Date() })
          .where(eq(schema.identitySequences.key, 'staff_number'));
        return candidate;
      });

      const [user] = await tx
        .insert(schema.users)
        .values({
          studentNo: null,
          name: parsed.data.name,
          email: parsed.data.email || null,
          phone: parsed.data.phone || null,
        })
        .$returningId();

      const [staff] = await tx
        .insert(schema.staffProfiles)
        .values({
          userId: user.id,
          staffNo,
          name: parsed.data.name,
          department: '',
          title: '',
        })
        .$returningId();

      const [teacherRole] = await tx
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(eq(schema.roles.name, 'teacher'))
        .limit(1);
      if (teacherRole) {
        await tx.insert(schema.userRoles).values({ userId: user.id, roleId: teacherRole.id });
      }

      return { userId: user.id, staffId: staff.id, staffNo };
    });

    await this.database.writeAudit({
      actorId,
      action: 'admin.staff.create',
      targetType: 'staff_profiles',
      targetId: result.staffId,
    });

    return { ok: true, ...result };
  }

  async updateStaff(id: number, body: unknown, actorId?: number | null) {
    const parsed = staffSchema.partial().safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const [staff] = await this.database.db
      .select({ userId: schema.staffProfiles.userId })
      .from(schema.staffProfiles)
      .where(eq(schema.staffProfiles.id, id))
      .limit(1);

    if (!staff) throw new NotFoundException('Staff profile not found.');

    await this.database.db
      .update(schema.staffProfiles)
      .set({
        name: parsed.data.name,
        updatedAt: new Date(),
      })
      .where(eq(schema.staffProfiles.id, id));

    if (staff?.userId) {
      await this.database.db
        .update(schema.users)
        .set({
          name: parsed.data.name,
          email: parsed.data.email === undefined ? undefined : parsed.data.email || null,
          phone: parsed.data.phone === undefined ? undefined : parsed.data.phone || null,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, staff.userId));
    }

    await this.database.writeAudit({
      actorId,
      action: 'admin.staff.update',
      targetType: 'staff_profiles',
      targetId: id,
    });

    return { ok: true, id };
  }

  async updateUserStatus(userId: number, body: unknown, actorId?: number | null) {
    const parsed = userStatusSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);

    const [userRows, currentRoles] = await Promise.all([
      this.database.db
        .select({ id: schema.users.id, status: schema.users.status })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1),
      this.database.db
        .select({ name: schema.roles.name })
        .from(schema.userRoles)
        .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
        .where(eq(schema.userRoles.userId, userId)),
    ]);
    const user = userRows[0];
    if (!user) throw new NotFoundException('User not found.');

    const currentRoleNames = new Set(currentRoles.map((role) => role.name));
    let activeSystemAdminCount = Number.POSITIVE_INFINITY;
    if (
      user.status === 'active' &&
      parsed.data.status !== 'active' &&
      currentRoleNames.has('system_admin')
    ) {
      const [countRow] = await this.database.db
        .select({ total: sql<number>`cast(count(*) as unsigned)`.mapWith(Number) })
        .from(schema.userRoles)
        .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
        .innerJoin(schema.users, eq(schema.userRoles.userId, schema.users.id))
        .where(and(eq(schema.roles.name, 'system_admin'), eq(schema.users.status, 'active')));
      activeSystemAdminCount = countRow?.total ?? 0;
    }
    assertUserStatusChangeAllowed({
      actorIsTarget: actorId === userId,
      currentStatus: user.status as AdminUserStatus,
      nextStatus: parsed.data.status,
      currentRoleNames,
      activeSystemAdminCount,
    });

    await this.database.db
      .update(schema.users)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
    await this.authService.invalidateUserSessions(userId);
    await this.database.writeAudit({
      actorId,
      action: 'admin.user.status.update',
      targetType: 'users',
      targetId: userId,
    });
    return { ok: true, userId, status: parsed.data.status };
  }

  async roles(): Promise<AdminRoleSummary[]> {
    return this.database.query('admin.roles', async (db) => {
      const rows = await db
        .select({
          id: schema.roles.id,
          name: schema.roles.name,
          label: schema.roles.label,
          userCount:
            sql<number>`cast((select count(*) from ${schema.userRoles} where ${schema.userRoles.roleId} = ${schema.roles.id}) as unsigned)`.mapWith(
              Number,
            ),
          permissionCount:
            sql<number>`cast((select count(*) from ${schema.rolePermissions} where ${schema.rolePermissions.roleId} = ${schema.roles.id}) as unsigned)`.mapWith(
              Number,
            ),
        })
        .from(schema.roles)
        .orderBy(schema.roles.name);

      return rows;
    });
  }

  async permissions(): Promise<AdminPermissionSummary[]> {
    return this.database.query('admin.permissions', async (db) => {
      const rows = await db
        .select({
          id: schema.permissions.id,
          name: schema.permissions.name,
          label: schema.permissions.label,
          description: schema.permissions.description,
        })
        .from(schema.permissions)
        .orderBy(schema.permissions.name);

      return rows.map((row) => ({
        ...row,
        description: row.description ?? undefined,
      }));
    });
  }

  async createRole(body: unknown, actorId?: number | null) {
    const parsed = roleSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const [result] = await this.database.db.insert(schema.roles).values(parsed.data).$returningId();
    await this.database.writeAudit({
      actorId,
      action: 'admin.role.create',
      targetType: 'roles',
      targetId: result.id,
    });
    return { ok: true, role: { id: result.id, ...parsed.data } };
  }

  async updateRole(id: number, body: unknown, actorId?: number | null) {
    const parsed = roleSchema.partial().safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const [current] = await this.database.db
      .select({ name: schema.roles.name })
      .from(schema.roles)
      .where(eq(schema.roles.id, id))
      .limit(1);
    if (!current) throw new NotFoundException('Role not found.');
    if (
      parsed.data.name &&
      parsed.data.name !== current.name &&
      BUILT_IN_ROLE_NAMES.has(current.name)
    ) {
      throw new BadRequestException('Built-in role keys cannot be changed.');
    }

    await this.database.db
      .update(schema.roles)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(schema.roles.id, id));
    await this.database.writeAudit({
      actorId,
      action: 'admin.role.update',
      targetType: 'roles',
      targetId: id,
    });
    return { ok: true, id };
  }

  async userRoles(userId: number) {
    const rows = await this.database.db
      .select({ roleId: schema.userRoles.roleId })
      .from(schema.userRoles)
      .where(eq(schema.userRoles.userId, userId));

    return rows.map((row) => row.roleId);
  }

  async assignUserRoles(userId: number, body: unknown, actorId?: number | null) {
    const parsed = idListSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const requestedRoleIds = [...new Set(parsed.data.ids)];
    const [targetIdentity, selectedRoles, currentRoles] = await Promise.all([
      this.database.db
        .select({
          userId: schema.users.id,
          studentId: schema.students.id,
          staffId: schema.staffProfiles.id,
        })
        .from(schema.users)
        .leftJoin(schema.students, eq(schema.students.userId, schema.users.id))
        .leftJoin(schema.staffProfiles, eq(schema.staffProfiles.userId, schema.users.id))
        .where(eq(schema.users.id, userId))
        .limit(1),
      requestedRoleIds.length === 0
        ? Promise.resolve([])
        : this.database.db
            .select({ id: schema.roles.id, name: schema.roles.name })
            .from(schema.roles)
            .where(inArray(schema.roles.id, requestedRoleIds)),
      this.database.db
        .select({ id: schema.roles.id, name: schema.roles.name })
        .from(schema.userRoles)
        .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
        .where(eq(schema.userRoles.userId, userId)),
    ]);
    const identity = targetIdentity[0];
    if (!identity) throw new NotFoundException('User not found.');
    if (selectedRoles.length !== requestedRoleIds.length) {
      throw new BadRequestException('One or more roles do not exist.');
    }

    const selectedNames = new Set(selectedRoles.map((role) => role.name));
    const currentNames = new Set(currentRoles.map((role) => role.name));
    let systemAdminCount = Number.POSITIVE_INFINITY;
    if (currentNames.has('system_admin') && !selectedNames.has('system_admin')) {
      const [adminCount] = await this.database.db
        .select({ total: sql<number>`cast(count(*) as unsigned)`.mapWith(Number) })
        .from(schema.userRoles)
        .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
        .where(eq(schema.roles.name, 'system_admin'));
      systemAdminCount = adminCount?.total ?? 0;
    }
    assertRoleAssignmentAllowed({
      isStudent: Boolean(identity.studentId),
      isStaff: Boolean(identity.staffId),
      selectedRoleNames: selectedNames,
      currentRoleNames: currentNames,
      actorIsTarget: actorId === userId,
      systemAdminCount,
    });

    await this.database.db.transaction(async (tx) => {
      await tx.delete(schema.userRoles).where(eq(schema.userRoles.userId, userId));

      if (requestedRoleIds.length > 0) {
        await tx
          .insert(schema.userRoles)
          .values(requestedRoleIds.map((roleId) => ({ userId, roleId })));
      }
    });

    await this.database.writeAudit({
      actorId,
      action: 'admin.user.roles.assign',
      targetType: 'users',
      targetId: userId,
    });
    await this.authService.invalidateUserSessions(userId);
    return { ok: true, userId, roleIds: requestedRoleIds };
  }

  async rolePermissions(roleId: number) {
    const rows = await this.database.db
      .select({ permissionId: schema.rolePermissions.permissionId })
      .from(schema.rolePermissions)
      .where(eq(schema.rolePermissions.roleId, roleId));

    return rows.map((row) => row.permissionId);
  }

  async assignRolePermissions(roleId: number, body: unknown, actorId?: number | null) {
    const parsed = idListSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const affectedUsers = await this.database.db
      .select({ userId: schema.userRoles.userId })
      .from(schema.userRoles)
      .where(eq(schema.userRoles.roleId, roleId));

    await this.database.db.transaction(async (tx) => {
      await tx.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, roleId));

      if (parsed.data.ids.length > 0) {
        await tx
          .insert(schema.rolePermissions)
          .values(parsed.data.ids.map((permissionId) => ({ roleId, permissionId })));
      }
    });

    await this.database.writeAudit({
      actorId,
      action: 'admin.role.permissions.assign',
      targetType: 'roles',
      targetId: roleId,
    });
    await Promise.all(
      affectedUsers.map(({ userId }) => this.authService.invalidateUserSessions(userId)),
    );
    return { ok: true, roleId, permissionIds: parsed.data.ids };
  }
}
