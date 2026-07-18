import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as schema from '@jshsus/db';
import type {
  AdminAuditLog,
  AdminDashboard,
  AdminPermissionSummary,
  AdminRoleSummary,
  AdminStaffSummary,
  AdminStudentSummary,
  AdminUserStatus,
  PaginatedResponse,
  UserRole,
} from '@jshsus/types';
import { argon2id, hash as hashArgon2 } from 'argon2';
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
const createStudentSchema = studentSchema.extend({
  initialPassword: z.string().min(10).max(128),
});
const updateStudentSchema = studentSchema.partial();

const staffSchema = z.object({
  name: z.string().min(1).max(64),
  email: z.string().email().optional().or(z.literal('')),
  phone: phoneSchema.optional().default(''),
});
const createStaffSchema = staffSchema.extend({
  initialPassword: z.string().min(10).max(128),
});

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

const passwordResetSchema = z.object({
  password: z.string().min(10).max(128),
});

const BUILT_IN_ROLE_NAMES = new Set([
  'system_admin',
  'student_affairs_head',
  'teacher',
  'student_council',
  'broadcast_club',
  'student',
]);

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
    const [pointSummary, deviceCases, activityRequests] = await Promise.all([
      this.pointsService.getSummary(),
      this.deviceCasesService.list(),
      this.activityRequestsService.adminList({ page: 1, pageSize: 20, status: 'pending' }),
    ]);

    return {
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
    const { page, pageSize, q, grade, classNo, sortBy, sortOrder } = parseIdentityListQuery(query);
    const filters: SQL[] = [];
    if (q) {
      const pattern = `%${q}%`;
      filters.push(
        or(
          like(schema.students.name, pattern),
          like(sql`cast(${schema.students.studentNo} as char)`, pattern),
        )!,
      );
    }
    if (grade) filters.push(eq(schema.students.grade, grade));
    if (classNo) filters.push(eq(schema.students.classNo, classNo));
    const where = filters.length > 0 ? and(...filters) : undefined;
    const direction = sortOrder === 'desc' ? desc : asc;
    const sortColumn =
      sortBy === 'name'
        ? schema.students.name
        : sortBy === 'lastLoginAt'
          ? schema.users.lastLoginAt
          : schema.students.studentNo;

    return this.database.query('admin.students', async (db) => {
      const [countRow] = await db
        .select({ total: sql<number>`cast(count(*) as unsigned)`.mapWith(Number) })
        .from(schema.students)
        .leftJoin(schema.users, eq(schema.students.userId, schema.users.id))
        .where(where);
      const total = countRow?.total ?? 0;
      const rows = await db
        .select({
          id: schema.students.id,
          userId: schema.students.userId,
          studentNo: schema.students.studentNo,
          name: schema.students.name,
          grade: schema.students.grade,
          classNo: schema.students.classNo,
          number: schema.students.number,
          currentPoint: schema.students.currentPoint,
          gender: schema.users.gender,
          email: schema.users.email,
          phone: schema.users.phone,
          lastLoginAt: schema.users.lastLoginAt,
        })
        .from(schema.students)
        .leftJoin(schema.users, eq(schema.students.userId, schema.users.id))
        .where(where)
        .orderBy(direction(sortColumn), asc(schema.students.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      const roles = await this.rolesByUserIds(
        rows.flatMap((row) => (row.userId ? [row.userId] : [])),
      );

      return {
        items: rows.map((row) => ({
          id: row.id,
          userId: row.userId ?? undefined,
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

    const passwordHash = await hashArgon2(parsed.data.initialPassword, { type: argon2id });
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

      await tx.insert(schema.authAccounts).values({
        userId: user.id,
        provider: 'local',
        providerAccountId: String(parsed.data.studentNo),
        passwordHash,
        passwordAlgorithm: 'argon2id',
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

        if (studentIdentity.studentNo !== student.studentNo) {
          // Preserve explicit local aliases such as the development `test` account.
          await tx
            .update(schema.authAccounts)
            .set({ providerAccountId: String(studentIdentity.studentNo), updatedAt: new Date() })
            .where(
              and(
                eq(schema.authAccounts.userId, student.userId),
                eq(schema.authAccounts.provider, 'local'),
                eq(schema.authAccounts.providerAccountId, String(student.studentNo)),
              ),
            );
        }
      }
    });

    await this.database.writeAudit({
      actorId,
      action: 'admin.student.update',
      targetType: 'students',
      targetId: id,
    });

    return { ok: true, id };
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

    const passwordHash = await hashArgon2(parsed.data.initialPassword, { type: argon2id });
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
          const [loginCollision] = await tx
            .select({ id: schema.authAccounts.id })
            .from(schema.authAccounts)
            .where(
              and(
                eq(schema.authAccounts.provider, 'local'),
                eq(schema.authAccounts.providerAccountId, String(candidate)),
              ),
            )
            .limit(1);
          const [legacyBridgeCollision] = await tx
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(eq(schema.users.studentNo, -candidate))
            .limit(1);

          if (!staffCollision && !loginCollision && !legacyBridgeCollision) break;
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
          // Forward-compatible bridge for the legacy NOT NULL users.student_no
          // column. Authentication and display use staff_profiles.staff_no.
          studentNo: -staffNo,
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

      await tx.insert(schema.authAccounts).values({
        userId: user.id,
        provider: 'local',
        providerAccountId: String(staffNo),
        passwordHash,
        passwordAlgorithm: 'argon2id',
      });

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

  async resetUserPassword(userId: number, body: unknown, actorId?: number | null) {
    const parsed = passwordResetSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const passwordHash = await hashArgon2(parsed.data.password, { type: argon2id });
    const result = await this.database.db
      .update(schema.authAccounts)
      .set({ passwordHash, passwordAlgorithm: 'argon2id', updatedAt: new Date() })
      .where(
        and(eq(schema.authAccounts.userId, userId), eq(schema.authAccounts.provider, 'local')),
      );
    if (result[0].affectedRows === 0) throw new NotFoundException('Local account not found.');

    await this.authService.invalidateUserSessions(userId);
    await this.database.writeAudit({
      actorId,
      action: 'admin.user.password.reset',
      targetType: 'users',
      targetId: userId,
    });
    return { ok: true, userId };
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
