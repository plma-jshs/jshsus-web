import { BadRequestException, Injectable } from '@nestjs/common';
import * as schema from '@jshsus/db';
import type {
  AdminAuditLog,
  AdminDashboard,
  AdminPermissionSummary,
  AdminRoleSummary,
  AdminStaffSummary,
  AdminStudentSummary,
} from '@jshsus/types';
import { argon2id, hash as hashArgon2 } from 'argon2';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ActivityRequestsService } from '../activity-requests/activity-requests.service';
import { DatabaseService } from '../database/database.service';
import { DeviceCasesService } from '../device-cases/device-cases.service';
import { DormService } from '../dorm/dorm.service';
import { PetitionsService } from '../petitions/petitions.service';
import { PointsService } from '../points/points.service';
import { AuthService } from '../auth/auth.service';

const studentSchema = z.object({
  studentNo: z.coerce.number().int().positive(),
  name: z.string().min(1).max(64),
  grade: z.coerce.number().int().min(1).max(3),
  classNo: z.coerce.number().int().min(1).max(9),
  number: z.coerce.number().int().min(1).max(99),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(32).optional().default(''),
});
const createStudentSchema = studentSchema.extend({
  initialPassword: z.string().min(10).max(128),
});

const staffSchema = z.object({
  staffNo: z.coerce.number().int().positive(),
  name: z.string().min(1).max(64),
  department: z.string().max(120).optional().default(''),
  title: z.string().max(120).optional().default(''),
  isStudentAffairsHead: z.boolean().optional().default(false),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(32).optional().default(''),
});
const createStaffSchema = staffSchema.extend({
  initialPassword: z.string().min(10).max(128),
});

const roleSchema = z.object({
  name: z.string().min(1).max(64),
  label: z.string().min(1).max(128),
});

const permissionSchema = z.object({
  name: z.string().min(1).max(128),
  label: z.string().min(1).max(128),
  description: z.string().max(500).optional().default(''),
});

const idListSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).default([]),
});

@Injectable()
export class AdminService {
  constructor(
    private readonly pointsService: PointsService,
    private readonly deviceCasesService: DeviceCasesService,
    private readonly dormService: DormService,
    private readonly activityRequestsService: ActivityRequestsService,
    private readonly petitionsService: PetitionsService,
    private readonly database: DatabaseService,
    private readonly authService: AuthService,
  ) {}

  async dashboard(): Promise<AdminDashboard> {
    const [pointSummary, deviceCases, dormRooms, activityRequests, petitions] = await Promise.all([
      this.pointsService.getSummary(),
      this.deviceCasesService.list(),
      this.dormService.rooms(),
      this.activityRequestsService.adminList(),
      this.petitionsService.list(),
    ]);

    return {
      pointSummary: {
        totalStudents: pointSummary.totalStudents,
        totalMeritPoints: pointSummary.totalMeritPoints,
        totalPenaltyPoints: pointSummary.totalPenaltyPoints,
        watchListCount: pointSummary.watchListCount,
      },
      deviceCases,
      dormRooms,
      pendingActivityRequests: activityRequests.filter((request) => request.status === 'submitted'),
      pendingPetitions: petitions.filter((petition) => petition.status === 'open'),
    };
  }

  async auditLogs() {
    return this.database.query<AdminAuditLog[]>('admin.audit-logs', async (db) => {
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
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(100);

      return rows.map((row) => ({
        ...row,
        actorName: row.actorName ?? 'system',
        targetType: row.targetType ?? '',
        targetId: row.targetId ?? undefined,
        createdAt: row.createdAt.toISOString(),
      }));
    });
  }

  async students(): Promise<AdminStudentSummary[]> {
    return this.database.query('admin.students', async (db) => {
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
        })
        .from(schema.students)
        .orderBy(schema.students.grade, schema.students.classNo, schema.students.number)
        .limit(700);

      return rows.map((row) => ({
        ...row,
        userId: row.userId ?? undefined,
      }));
    });
  }

  async createStudent(body: unknown, actorId?: number | null) {
    const parsed = createStudentSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const passwordHash = await hashArgon2(parsed.data.initialPassword, { type: argon2id });
    const result = await this.database.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({
          studentNo: parsed.data.studentNo,
          name: parsed.data.name,
          grade: parsed.data.grade,
          classNo: parsed.data.classNo,
          number: parsed.data.number,
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
          grade: parsed.data.grade,
          classNo: parsed.data.classNo,
          number: parsed.data.number,
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
    const parsed = studentSchema.partial().safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const [student] = await this.database.db
      .select({ userId: schema.students.userId })
      .from(schema.students)
      .where(eq(schema.students.id, id))
      .limit(1);

    await this.database.db
      .update(schema.students)
      .set({
        studentNo: parsed.data.studentNo,
        name: parsed.data.name,
        grade: parsed.data.grade,
        classNo: parsed.data.classNo,
        number: parsed.data.number,
        updatedAt: new Date(),
      })
      .where(eq(schema.students.id, id));

    if (student?.userId) {
      await this.database.db
        .update(schema.users)
        .set({
          studentNo: parsed.data.studentNo,
          name: parsed.data.name,
          grade: parsed.data.grade,
          classNo: parsed.data.classNo,
          number: parsed.data.number,
          email: parsed.data.email === undefined ? undefined : parsed.data.email || null,
          phone: parsed.data.phone === undefined ? undefined : parsed.data.phone || null,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, student.userId));
    }

    await this.database.writeAudit({
      actorId,
      action: 'admin.student.update',
      targetType: 'students',
      targetId: id,
    });

    return { ok: true, id };
  }

  async staff(): Promise<AdminStaffSummary[]> {
    return this.database.query('admin.staff', async (db) => {
      const rows = await db
        .select({
          id: schema.staffProfiles.id,
          userId: schema.staffProfiles.userId,
          staffNo: schema.staffProfiles.staffNo,
          name: schema.staffProfiles.name,
          department: schema.staffProfiles.department,
          title: schema.staffProfiles.title,
          isStudentAffairsHead: schema.staffProfiles.isStudentAffairsHead,
        })
        .from(schema.staffProfiles)
        .orderBy(schema.staffProfiles.department, schema.staffProfiles.name)
        .limit(200);

      return rows.map((row) => ({
        ...row,
        department: row.department ?? undefined,
        title: row.title ?? undefined,
      }));
    });
  }

  async createStaff(body: unknown, actorId?: number | null) {
    const parsed = createStaffSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const passwordHash = await hashArgon2(parsed.data.initialPassword, { type: argon2id });
    const result = await this.database.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({
          studentNo: parsed.data.staffNo,
          name: parsed.data.name,
          email: parsed.data.email || null,
          phone: parsed.data.phone || null,
        })
        .$returningId();

      const [staff] = await tx
        .insert(schema.staffProfiles)
        .values({
          userId: user.id,
          staffNo: parsed.data.staffNo,
          name: parsed.data.name,
          department: parsed.data.department,
          title: parsed.data.title,
          isStudentAffairsHead: parsed.data.isStudentAffairsHead,
        })
        .$returningId();

      await tx.insert(schema.authAccounts).values({
        userId: user.id,
        provider: 'local',
        providerAccountId: String(parsed.data.staffNo),
        passwordHash,
        passwordAlgorithm: 'argon2id',
      });

      const [teacherRole] = await tx
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(
          eq(
            schema.roles.name,
            parsed.data.isStudentAffairsHead ? 'student_affairs_head' : 'teacher',
          ),
        )
        .limit(1);
      if (teacherRole) {
        await tx.insert(schema.userRoles).values({ userId: user.id, roleId: teacherRole.id });
      }

      return { userId: user.id, staffId: staff.id };
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

    await this.database.db
      .update(schema.staffProfiles)
      .set({
        staffNo: parsed.data.staffNo,
        name: parsed.data.name,
        department: parsed.data.department,
        title: parsed.data.title,
        isStudentAffairsHead: parsed.data.isStudentAffairsHead,
        updatedAt: new Date(),
      })
      .where(eq(schema.staffProfiles.id, id));

    if (staff?.userId) {
      await this.database.db
        .update(schema.users)
        .set({
          studentNo: parsed.data.staffNo,
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

  async createPermission(body: unknown, actorId?: number | null) {
    const parsed = permissionSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const [result] = await this.database.db
      .insert(schema.permissions)
      .values(parsed.data)
      .$returningId();
    await this.database.writeAudit({
      actorId,
      action: 'admin.permission.create',
      targetType: 'permissions',
      targetId: result.id,
    });
    return { ok: true, permission: { id: result.id, ...parsed.data } };
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

    await this.database.db.transaction(async (tx) => {
      await tx.delete(schema.userRoles).where(eq(schema.userRoles.userId, userId));

      if (parsed.data.ids.length > 0) {
        await tx
          .insert(schema.userRoles)
          .values(parsed.data.ids.map((roleId) => ({ userId, roleId })));
      }
    });

    await this.database.writeAudit({
      actorId,
      action: 'admin.user.roles.assign',
      targetType: 'users',
      targetId: userId,
    });
    await this.authService.invalidateUserSessions(userId);
    return { ok: true, userId, roleIds: parsed.data.ids };
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
