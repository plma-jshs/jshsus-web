import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as schema from '@jshsus/db';
import type {
  DormAssignment,
  DormDrawPreview,
  DormReport,
  DormRoom,
  DormRoommateBlock,
  DormStudentOption,
} from '@jshsus/types';
import { and, desc, eq, inArray, isNotNull, like, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { z } from 'zod';
import { DatabaseService, type AppDatabase } from '../database/database.service';
import {
  dormNameForGender,
  generateDormDraw,
  validateDormPlacements,
  type DormDrawStudent,
  type DormPlacement,
} from './dorm-draw.policy';

const assignmentSchema = z.object({
  roomId: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
  year: z.coerce.number().int().min(2020).max(2100),
  semester: z.coerce.number().int().min(1).max(2),
  bedPosition: z.coerce.number().int().min(1),
});

const assignmentMoveSchema = z.object({
  roomId: z.coerce.number().int().positive(),
  bedPosition: z.coerce.number().int().min(1),
});

const assignmentSwapSchema = z.object({
  leftAssignmentId: z.coerce.number().int().positive(),
  rightAssignmentId: z.coerce.number().int().positive(),
});

const termSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  semester: z.coerce.number().int().min(1).max(2),
});

const roomQuerySchema = termSchema.extend({
  search: z.string().trim().max(64).optional(),
  dormName: z.enum(['송죽관', '동백관']).optional(),
  grade: z.coerce.number().int().min(1).max(3).optional(),
});

const drawPreviewSchema = termSchema.extend({
  dormName: z.enum(['송죽관', '동백관']).optional(),
  grade: z.coerce.number().int().min(1).max(3).optional(),
  studentIds: z.array(z.coerce.number().int().positive()).max(500).optional(),
  seed: z.coerce.number().int().optional(),
});

const drawApplySchema = termSchema
  .extend({
    targetUserIds: z.array(z.coerce.number().int().positive()).min(1).max(500),
    placements: z
      .array(
        z.object({
          userId: z.coerce.number().int().positive(),
          roomId: z.coerce.number().int().positive(),
          bedPosition: z.coerce.number().int().positive(),
        }),
      )
      .max(500),
  })
  .superRefine((value, context) => {
    const targetIds = new Set(value.targetUserIds);
    if (targetIds.size !== value.targetUserIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetUserIds'],
        message: '추첨 대상 학생이 중복되었습니다.',
      });
    }
    value.placements.forEach((placement, index) => {
      if (!targetIds.has(placement.userId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['placements', index, 'userId'],
          message: '추첨 대상이 아닌 학생의 배정이 포함되어 있습니다.',
        });
      }
    });
  });

const roommateBlockSchema = termSchema.extend({
  studentUserId: z.coerce.number().int().positive(),
  blockedUserId: z.coerce.number().int().positive(),
});

const reportStatusSchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED']),
  comment: z.string().trim().max(500).optional().default(''),
});

function currentDormTerm() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    semester: now.getMonth() + 1 >= 8 ? 2 : 1,
  };
}

function parseTerm(input: Record<string, unknown>) {
  const current = currentDormTerm();
  const parsed = termSchema.safeParse({
    year: input.year ?? current.year,
    semester: input.semester ?? current.semester,
  });
  if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
  return parsed.data;
}

@Injectable()
export class DormService {
  constructor(private readonly database: DatabaseService) {}

  async rooms(query: Record<string, unknown> = {}): Promise<DormRoom[]> {
    const current = currentDormTerm();
    const parsed = roomQuerySchema.safeParse({
      ...query,
      year: query.year ?? current.year,
      semester: query.semester ?? current.semester,
    });
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);

    return this.database.query('dorm.rooms', async (db) => {
      const roomConditions = [
        parsed.data.dormName ? eq(schema.dormRooms.dormName, parsed.data.dormName) : undefined,
        parsed.data.grade ? eq(schema.dormRooms.grade, parsed.data.grade) : undefined,
        parsed.data.search ? like(schema.dormRooms.name, `%${parsed.data.search}%`) : undefined,
      ];
      const rooms = await db
        .select({
          id: schema.dormRooms.id,
          name: schema.dormRooms.name,
          capacity: schema.dormRooms.capacity,
          grade: schema.dormRooms.grade,
          dormName: schema.dormRooms.dormName,
        })
        .from(schema.dormRooms)
        .where(and(...roomConditions))
        .orderBy(schema.dormRooms.dormName, schema.dormRooms.name);

      if (rooms.length === 0) return [];
      const roomIds = rooms.map((room) => room.id);
      const [assignments, openReports] = await Promise.all([
        db
          .select({
            id: schema.dormAssignments.id,
            roomId: schema.dormAssignments.roomId,
            userId: schema.dormAssignments.userId,
            studentId: schema.students.id,
            studentNo: schema.students.studentNo,
            studentName: schema.students.name,
            grade: schema.students.grade,
            classNo: schema.students.classNo,
            number: schema.students.number,
            bedPosition: schema.dormAssignments.bedPosition,
          })
          .from(schema.dormAssignments)
          .innerJoin(schema.students, eq(schema.dormAssignments.userId, schema.students.userId))
          .where(
            and(
              eq(schema.dormAssignments.year, parsed.data.year),
              eq(schema.dormAssignments.semester, parsed.data.semester),
              inArray(schema.dormAssignments.roomId, roomIds),
            ),
          )
          .orderBy(schema.dormAssignments.bedPosition),
        db
          .select({
            roomId: schema.dormReports.roomId,
            count: sql<number>`cast(count(*) as unsigned)`.mapWith(Number),
          })
          .from(schema.dormReports)
          .where(
            and(
              inArray(schema.dormReports.roomId, roomIds),
              ne(schema.dormReports.status, 'COMPLETED'),
            ),
          )
          .groupBy(schema.dormReports.roomId),
      ]);

      return rooms.map((room) => {
        const residents = assignments
          .filter((assignment) => assignment.roomId === room.id)
          .map(({ roomId: _roomId, ...resident }) => resident);
        return {
          ...room,
          assignedCount: residents.length,
          residents,
          openReportCount: openReports.find((report) => report.roomId === room.id)?.count ?? 0,
        };
      });
    });
  }

  async students(query: Record<string, unknown> = {}): Promise<DormStudentOption[]> {
    const term = parseTerm(query);
    return this.database.query('dorm.students', async (db) => {
      const [students, assignments] = await Promise.all([
        db
          .select({
            userId: schema.users.id,
            studentId: schema.students.id,
            studentNo: schema.students.studentNo,
            name: schema.students.name,
            grade: schema.students.grade,
            classNo: schema.students.classNo,
            number: schema.students.number,
            gender: schema.users.gender,
          })
          .from(schema.students)
          .innerJoin(schema.users, eq(schema.students.userId, schema.users.id))
          .where(and(isNotNull(schema.students.userId), eq(schema.users.status, 'active')))
          .orderBy(schema.students.grade, schema.students.classNo, schema.students.number)
          .limit(500),
        db
          .select({
            userId: schema.dormAssignments.userId,
            roomName: schema.dormRooms.name,
            dormName: schema.dormRooms.dormName,
          })
          .from(schema.dormAssignments)
          .innerJoin(schema.dormRooms, eq(schema.dormAssignments.roomId, schema.dormRooms.id))
          .where(
            and(
              eq(schema.dormAssignments.year, term.year),
              eq(schema.dormAssignments.semester, term.semester),
            ),
          ),
      ]);
      const roomByUser = new Map(
        assignments.map((assignment) => [
          assignment.userId,
          `${assignment.dormName} ${assignment.roomName}`,
        ]),
      );

      return students.map((student) => ({
        ...student,
        gender: student.gender ?? undefined,
        dormName: dormNameForGender(student.gender),
        currentRoom: roomByUser.get(student.userId),
      }));
    });
  }

  async assignments(query: Record<string, unknown> = {}): Promise<DormAssignment[]> {
    const term = parseTerm(query);
    return this.database.query('dorm.assignments', async (db) =>
      db
        .select({
          id: schema.dormAssignments.id,
          roomId: schema.dormAssignments.roomId,
          userId: schema.dormAssignments.userId,
          studentId: schema.students.id,
          dormName: schema.dormRooms.dormName,
          roomName: schema.dormRooms.name,
          studentNo: schema.students.studentNo,
          studentName: schema.students.name,
          grade: schema.students.grade,
          classNo: schema.students.classNo,
          number: schema.students.number,
          year: schema.dormAssignments.year,
          semester: schema.dormAssignments.semester,
          bedPosition: schema.dormAssignments.bedPosition,
        })
        .from(schema.dormAssignments)
        .innerJoin(schema.dormRooms, eq(schema.dormAssignments.roomId, schema.dormRooms.id))
        .innerJoin(schema.students, eq(schema.dormAssignments.userId, schema.students.userId))
        .where(
          and(
            eq(schema.dormAssignments.year, term.year),
            eq(schema.dormAssignments.semester, term.semester),
          ),
        )
        .orderBy(
          schema.dormRooms.dormName,
          schema.dormRooms.name,
          schema.dormAssignments.bedPosition,
        ),
    );
  }

  async reports(): Promise<DormReport[]> {
    return this.database.query('dorm.reports', async (db) => {
      const rows = await db
        .select({
          id: schema.dormReports.id,
          roomId: schema.dormRooms.id,
          dormName: schema.dormRooms.dormName,
          roomName: schema.dormRooms.name,
          studentNo: schema.students.studentNo,
          studentName: schema.students.name,
          description: schema.dormReports.description,
          imageUrl: schema.dormReports.imageUrl,
          status: schema.dormReports.status,
          comment: schema.dormReports.comment,
          createdAt: schema.dormReports.createdAt,
        })
        .from(schema.dormReports)
        .innerJoin(schema.dormRooms, eq(schema.dormReports.roomId, schema.dormRooms.id))
        .innerJoin(schema.students, eq(schema.dormReports.userId, schema.students.userId))
        .orderBy(desc(schema.dormReports.createdAt), desc(schema.dormReports.id))
        .limit(500);

      return rows.map((row) => ({
        ...row,
        imageUrl: row.imageUrl ?? undefined,
        comment: row.comment ?? undefined,
        createdAt: row.createdAt.toISOString(),
      }));
    });
  }

  async roommateBlocks(query: Record<string, unknown> = {}): Promise<DormRoommateBlock[]> {
    const term = parseTerm(query);
    return this.database.query('dorm.roommate-blocks', async (db) => {
      const blockedStudents = alias(schema.students, 'blocked_students');
      const rows = await db
        .select({
          id: schema.dormRoommateBlocks.id,
          studentUserId: schema.dormRoommateBlocks.studentUserId,
          studentNo: schema.students.studentNo,
          studentName: schema.students.name,
          blockedUserId: schema.dormRoommateBlocks.blockedUserId,
          blockedStudentNo: blockedStudents.studentNo,
          blockedStudentName: blockedStudents.name,
          year: schema.dormRoommateBlocks.year,
          semester: schema.dormRoommateBlocks.semester,
        })
        .from(schema.dormRoommateBlocks)
        .innerJoin(
          schema.students,
          eq(schema.dormRoommateBlocks.studentUserId, schema.students.userId),
        )
        .innerJoin(
          blockedStudents,
          eq(schema.dormRoommateBlocks.blockedUserId, blockedStudents.userId),
        )
        .where(
          and(
            eq(schema.dormRoommateBlocks.year, term.year),
            eq(schema.dormRoommateBlocks.semester, term.semester),
          ),
        )
        .orderBy(schema.students.studentNo, blockedStudents.studentNo);
      return rows;
    });
  }

  private async validateAssignmentChange(
    db: Pick<AppDatabase, 'select'>,
    input: {
      year: number;
      semester: number;
      placements: DormPlacement[];
      ignoreAssignmentIds?: number[];
    },
  ) {
    const ignoreIds = input.ignoreAssignmentIds ?? [];
    const affectedRoomIds = [
      ...new Set(input.placements.map((placement) => placement.roomId)),
    ].sort((left, right) => left - right);
    const candidateUserIds = [...new Set(input.placements.map((placement) => placement.userId))];
    // Every assignment mutation locks affected room rows in the same order. This
    // prevents two concurrent requests from both passing class/capacity checks.
    if (affectedRoomIds.length > 0) {
      await db
        .select({ id: schema.dormRooms.id })
        .from(schema.dormRooms)
        .where(inArray(schema.dormRooms.id, affectedRoomIds))
        .orderBy(schema.dormRooms.id)
        .for('update');
    }
    const rooms = await db
      .select({
        id: schema.dormRooms.id,
        name: schema.dormRooms.name,
        dormName: schema.dormRooms.dormName,
        grade: schema.dormRooms.grade,
        capacity: schema.dormRooms.capacity,
      })
      .from(schema.dormRooms);
    const students = await db
      .select({
        userId: schema.users.id,
        studentNo: schema.students.studentNo,
        name: schema.students.name,
        grade: schema.students.grade,
        classNo: schema.students.classNo,
        gender: schema.users.gender,
        status: schema.users.status,
      })
      .from(schema.students)
      .innerJoin(schema.users, eq(schema.students.userId, schema.users.id));
    const existing = await db
      .select({
        id: schema.dormAssignments.id,
        userId: schema.dormAssignments.userId,
        roomId: schema.dormAssignments.roomId,
        bedPosition: schema.dormAssignments.bedPosition,
      })
      .from(schema.dormAssignments)
      .where(
        and(
          eq(schema.dormAssignments.year, input.year),
          eq(schema.dormAssignments.semester, input.semester),
        ),
      )
      .for('update');
    const blocks = await db
      .select({
        studentUserId: schema.dormRoommateBlocks.studentUserId,
        blockedUserId: schema.dormRoommateBlocks.blockedUserId,
      })
      .from(schema.dormRoommateBlocks)
      .where(
        and(
          eq(schema.dormRoommateBlocks.year, input.year),
          eq(schema.dormRoommateBlocks.semester, input.semester),
        ),
      );

    const inactiveCandidate = students.find(
      (student) => candidateUserIds.includes(student.userId) && student.status !== 'active',
    );
    if (inactiveCandidate) throw new BadRequestException('활성 학생만 배정할 수 있습니다.');
    const effectiveExisting = existing.filter((assignment) => !ignoreIds.includes(assignment.id));
    const duplicateCandidate = effectiveExisting.find((assignment) =>
      candidateUserIds.includes(assignment.userId),
    );
    if (duplicateCandidate) throw new BadRequestException('이미 해당 학기에 배정된 학생입니다.');

    const relevantExisting = effectiveExisting
      .filter((assignment) => affectedRoomIds.includes(assignment.roomId))
      .map(({ id: _id, ...placement }) => placement);
    const violations = validateDormPlacements({
      rooms,
      students,
      blocks,
      placements: [...relevantExisting, ...input.placements],
    });
    if (violations.length > 0) {
      throw new BadRequestException({
        message: violations[0]!.message,
        violations,
      });
    }
  }

  async createAssignment(body: unknown, actorId?: number | null) {
    const parsed = assignmentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const result = await this.database.db.transaction(async (tx) => {
      await this.validateAssignmentChange(tx, {
        year: parsed.data.year,
        semester: parsed.data.semester,
        placements: [parsed.data],
      });
      const [created] = await tx.insert(schema.dormAssignments).values(parsed.data).$returningId();
      return created;
    });
    await this.database.writeAudit({
      actorId,
      action: 'dorm.assignment.create',
      targetType: 'dorm_assignments',
      targetId: result.id,
    });
    return { ok: true, assignment: { id: result.id, ...parsed.data } };
  }

  async moveAssignment(id: number, body: unknown, actorId?: number | null) {
    const parsed = assignmentMoveSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const [assignment] = await this.database.db
      .select()
      .from(schema.dormAssignments)
      .where(eq(schema.dormAssignments.id, id))
      .limit(1);
    if (!assignment) throw new NotFoundException('배정 기록을 찾을 수 없습니다.');

    await this.database.db.transaction(async (tx) => {
      await this.validateAssignmentChange(tx, {
        year: assignment.year,
        semester: assignment.semester,
        placements: [{ userId: assignment.userId, ...parsed.data }],
        ignoreAssignmentIds: [id],
      });
      await tx
        .update(schema.dormAssignments)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(schema.dormAssignments.id, id));
    });
    await this.database.writeAudit({
      actorId,
      action: 'dorm.assignment.move',
      targetType: 'dorm_assignments',
      targetId: id,
    });
    return { ok: true, id };
  }

  async swapAssignments(body: unknown, actorId?: number | null) {
    const parsed = assignmentSwapSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    if (parsed.data.leftAssignmentId === parsed.data.rightAssignmentId) {
      throw new BadRequestException('서로 다른 두 배정을 선택해 주세요.');
    }
    const assignments = await this.database.db
      .select()
      .from(schema.dormAssignments)
      .where(
        inArray(schema.dormAssignments.id, [
          parsed.data.leftAssignmentId,
          parsed.data.rightAssignmentId,
        ]),
      );
    if (assignments.length !== 2) throw new NotFoundException('교환할 배정을 찾을 수 없습니다.');
    const left = assignments.find((assignment) => assignment.id === parsed.data.leftAssignmentId)!;
    const right = assignments.find(
      (assignment) => assignment.id === parsed.data.rightAssignmentId,
    )!;
    if (left.year !== right.year || left.semester !== right.semester) {
      throw new BadRequestException('같은 학기의 배정만 교환할 수 있습니다.');
    }
    await this.database.db.transaction(async (tx) => {
      await this.validateAssignmentChange(tx, {
        year: left.year,
        semester: left.semester,
        ignoreAssignmentIds: [left.id, right.id],
        placements: [
          { userId: left.userId, roomId: right.roomId, bedPosition: right.bedPosition },
          { userId: right.userId, roomId: left.roomId, bedPosition: left.bedPosition },
        ],
      });
      const temporaryBed = 1_000_000 + left.id;
      await tx
        .update(schema.dormAssignments)
        .set({ bedPosition: temporaryBed, updatedAt: new Date() })
        .where(eq(schema.dormAssignments.id, left.id));
      await tx
        .update(schema.dormAssignments)
        .set({ roomId: left.roomId, bedPosition: left.bedPosition, updatedAt: new Date() })
        .where(eq(schema.dormAssignments.id, right.id));
      await tx
        .update(schema.dormAssignments)
        .set({ roomId: right.roomId, bedPosition: right.bedPosition, updatedAt: new Date() })
        .where(eq(schema.dormAssignments.id, left.id));
    });
    await this.database.writeAudit({
      actorId,
      action: 'dorm.assignment.swap',
      targetType: 'dorm_assignments',
      targetId: `${left.id}:${right.id}`,
    });
    return { ok: true };
  }

  async cancelAssignment(id: number, actorId?: number | null) {
    const [assignment] = await this.database.db
      .select({ id: schema.dormAssignments.id })
      .from(schema.dormAssignments)
      .where(eq(schema.dormAssignments.id, id))
      .limit(1);
    if (!assignment) throw new NotFoundException('배정 기록을 찾을 수 없습니다.');
    await this.database.db.delete(schema.dormAssignments).where(eq(schema.dormAssignments.id, id));
    await this.database.writeAudit({
      actorId,
      action: 'dorm.assignment.cancel',
      targetType: 'dorm_assignments',
      targetId: id,
    });
    return { ok: true };
  }

  async createRoommateBlock(body: unknown, actorId?: number | null) {
    const parsed = roommateBlockSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    if (parsed.data.studentUserId === parsed.data.blockedUserId) {
      throw new BadRequestException('본인을 함께 배정 금지 학생으로 지정할 수 없습니다.');
    }
    const students = await this.database.db
      .select({
        userId: schema.students.userId,
        grade: schema.students.grade,
        gender: schema.users.gender,
        status: schema.users.status,
      })
      .from(schema.students)
      .innerJoin(schema.users, eq(schema.students.userId, schema.users.id))
      .where(
        and(
          isNotNull(schema.students.userId),
          inArray(schema.students.userId, [parsed.data.studentUserId, parsed.data.blockedUserId]),
        ),
      );
    if (students.length !== 2) throw new BadRequestException('학생 정보를 확인해 주세요.');
    if (students.some((student) => student.status !== 'active')) {
      throw new BadRequestException('재학 중인 학생만 함께 배정 금지 대상으로 지정할 수 있습니다.');
    }
    const [student, blockedStudent] = students;
    if (
      student!.grade !== blockedStudent!.grade ||
      !dormNameForGender(student!.gender) ||
      dormNameForGender(student!.gender) !== dormNameForGender(blockedStudent!.gender)
    ) {
      throw new BadRequestException('같은 학년·생활관의 학생만 지정할 수 있습니다.');
    }

    await this.database.db
      .insert(schema.dormRoommateBlocks)
      .values({ ...parsed.data, submittedBy: actorId ?? null })
      .onDuplicateKeyUpdate({ set: { submittedBy: actorId ?? null, updatedAt: new Date() } });
    await this.database.writeAudit({
      actorId,
      action: 'dorm.roommate-block.create',
      targetType: 'dorm_roommate_blocks',
      targetId: `${parsed.data.studentUserId}:${parsed.data.blockedUserId}`,
    });
    return { ok: true };
  }

  async deleteRoommateBlock(id: number, actorId?: number | null) {
    await this.database.db
      .delete(schema.dormRoommateBlocks)
      .where(eq(schema.dormRoommateBlocks.id, id));
    await this.database.writeAudit({
      actorId,
      action: 'dorm.roommate-block.delete',
      targetType: 'dorm_roommate_blocks',
      targetId: id,
    });
    return { ok: true };
  }

  async previewDraw(body: unknown): Promise<DormDrawPreview> {
    const parsed = drawPreviewSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    return this.database.query('dorm.draw.preview', async (db) => {
      const [rooms, students, existingAssignments, blocks] = await Promise.all([
        db
          .select({
            id: schema.dormRooms.id,
            name: schema.dormRooms.name,
            dormName: schema.dormRooms.dormName,
            grade: schema.dormRooms.grade,
            capacity: schema.dormRooms.capacity,
          })
          .from(schema.dormRooms)
          .where(
            and(
              parsed.data.dormName
                ? eq(schema.dormRooms.dormName, parsed.data.dormName)
                : undefined,
              parsed.data.grade ? eq(schema.dormRooms.grade, parsed.data.grade) : undefined,
            ),
          ),
        db
          .select({
            userId: schema.users.id,
            studentNo: schema.students.studentNo,
            name: schema.students.name,
            grade: schema.students.grade,
            classNo: schema.students.classNo,
            gender: schema.users.gender,
          })
          .from(schema.students)
          .innerJoin(schema.users, eq(schema.students.userId, schema.users.id))
          .where(
            and(
              eq(schema.users.status, 'active'),
              parsed.data.grade ? eq(schema.students.grade, parsed.data.grade) : undefined,
              parsed.data.studentIds?.length
                ? inArray(schema.users.id, parsed.data.studentIds)
                : undefined,
            ),
          ),
        db
          .select({
            userId: schema.dormAssignments.userId,
            roomId: schema.dormAssignments.roomId,
            bedPosition: schema.dormAssignments.bedPosition,
          })
          .from(schema.dormAssignments)
          .where(
            and(
              eq(schema.dormAssignments.year, parsed.data.year),
              eq(schema.dormAssignments.semester, parsed.data.semester),
            ),
          ),
        db
          .select({
            studentUserId: schema.dormRoommateBlocks.studentUserId,
            blockedUserId: schema.dormRoommateBlocks.blockedUserId,
          })
          .from(schema.dormRoommateBlocks)
          .where(
            and(
              eq(schema.dormRoommateBlocks.year, parsed.data.year),
              eq(schema.dormRoommateBlocks.semester, parsed.data.semester),
            ),
          ),
      ]);

      const targetStudents = students.filter((student) => {
        const expectedDorm = dormNameForGender(student.gender);
        return (
          Boolean(expectedDorm) && (!parsed.data.dormName || expectedDorm === parsed.data.dormName)
        );
      });
      const missingGenderStudents = students.filter(
        (student) => !dormNameForGender(student.gender),
      );
      const selectedIds = new Set(targetStudents.map((student) => student.userId));
      const roomIds = new Set(rooms.map((room) => room.id));
      const fixedPlacements = existingAssignments.filter(
        (placement) => roomIds.has(placement.roomId) && !selectedIds.has(placement.userId),
      );

      let policyStudents: DormDrawStudent[] = targetStudents;
      const fixedUserIds = fixedPlacements.map((placement) => placement.userId);
      if (fixedUserIds.length > 0) {
        const fixedStudents = await db
          .select({
            userId: schema.users.id,
            studentNo: schema.students.studentNo,
            name: schema.students.name,
            grade: schema.students.grade,
            classNo: schema.students.classNo,
            gender: schema.users.gender,
          })
          .from(schema.students)
          .innerJoin(schema.users, eq(schema.students.userId, schema.users.id))
          .where(inArray(schema.users.id, fixedUserIds));
        policyStudents = [...policyStudents, ...fixedStudents];
      }
      const result = generateDormDraw({
        rooms,
        students: policyStudents,
        blocks,
        fixedPlacements,
        seed: parsed.data.seed,
      });
      const studentById = new Map(policyStudents.map((student) => [student.userId, student]));
      const roomById = new Map(rooms.map((room) => [room.id, room]));
      const toPreviewPlacement = (placement: DormPlacement) => {
        const student = studentById.get(placement.userId);
        const room = roomById.get(placement.roomId)!;
        return {
          ...placement,
          studentNo: student?.studentNo ?? 0,
          studentName: student?.name ?? '학생 정보 없음',
          grade: student?.grade ?? room.grade,
          classNo: student?.classNo ?? 0,
          dormName: room.dormName,
          roomName: room.name,
        };
      };

      return {
        year: parsed.data.year,
        semester: parsed.data.semester,
        targetUserIds: [...selectedIds],
        placements: result.placements
          .filter((placement) => selectedIds.has(placement.userId))
          .map(toPreviewPlacement),
        fixedPlacements: fixedPlacements.map(toPreviewPlacement),
        roommateBlocks: blocks,
        unassigned: result.unassigned.filter((student) => selectedIds.has(student.userId)),
        ineligible: missingGenderStudents.map((student) => ({
          userId: student.userId,
          studentNo: student.studentNo,
          name: student.name,
          reason: '성별 정보가 없어 생활관을 결정할 수 없습니다.',
        })),
        violations: result.violations,
      };
    });
  }

  async applyDraw(body: unknown, actorId?: number | null) {
    const parsed = drawApplySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    await this.database.db.transaction(async (tx) => {
      const targetStudents = await tx
        .select({ userId: schema.students.userId, status: schema.users.status })
        .from(schema.students)
        .innerJoin(schema.users, eq(schema.students.userId, schema.users.id))
        .where(inArray(schema.students.userId, parsed.data.targetUserIds))
        .for('update');
      if (
        targetStudents.length !== parsed.data.targetUserIds.length ||
        targetStudents.some((student) => student.status !== 'active')
      ) {
        throw new BadRequestException('추첨 대상 학생 정보가 변경되었습니다. 다시 미리보세요.');
      }
      const targetRoomIds = [
        ...new Set(parsed.data.placements.map((placement) => placement.roomId)),
      ].sort((left, right) => left - right);
      if (targetRoomIds.length > 0) {
        // Keep the same room-before-assignment lock order as the other dorm
        // mutations to avoid a draw apply racing a move or swap into that room.
        await tx
          .select({ id: schema.dormRooms.id })
          .from(schema.dormRooms)
          .where(inArray(schema.dormRooms.id, targetRoomIds))
          .orderBy(schema.dormRooms.id)
          .for('update');
      }
      const existing = await tx
        .select({ id: schema.dormAssignments.id })
        .from(schema.dormAssignments)
        .where(
          and(
            eq(schema.dormAssignments.year, parsed.data.year),
            eq(schema.dormAssignments.semester, parsed.data.semester),
            inArray(schema.dormAssignments.userId, parsed.data.targetUserIds),
          ),
        )
        .for('update');
      await this.validateAssignmentChange(tx, {
        year: parsed.data.year,
        semester: parsed.data.semester,
        placements: parsed.data.placements,
        ignoreAssignmentIds: existing.map((assignment) => assignment.id),
      });
      await tx
        .delete(schema.dormAssignments)
        .where(
          and(
            eq(schema.dormAssignments.year, parsed.data.year),
            eq(schema.dormAssignments.semester, parsed.data.semester),
            inArray(schema.dormAssignments.userId, parsed.data.targetUserIds),
          ),
        );
      if (parsed.data.placements.length > 0) {
        await tx.insert(schema.dormAssignments).values(
          parsed.data.placements.map((placement) => ({
            ...placement,
            year: parsed.data.year,
            semester: parsed.data.semester,
          })),
        );
      }
    });
    await this.database.writeAudit({
      actorId,
      action: 'dorm.draw.apply',
      targetType: 'dorm_assignments',
      targetId: `${parsed.data.year}-${parsed.data.semester}`,
    });
    return {
      ok: true,
      assignmentCount: parsed.data.placements.length,
      unassignedCount: parsed.data.targetUserIds.length - parsed.data.placements.length,
    };
  }

  async updateReportStatus(id: number, body: unknown, actorId?: number | null) {
    const parsed = reportStatusSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const result = await this.database.db
      .update(schema.dormReports)
      .set({
        status: parsed.data.status,
        comment: parsed.data.comment || null,
        updatedAt: new Date(),
      })
      .where(eq(schema.dormReports.id, id));
    if (result[0].affectedRows === 0) throw new NotFoundException('민원을 찾을 수 없습니다.');
    await this.database.writeAudit({
      actorId,
      action: 'dorm.report.status.update',
      targetType: 'dorm_reports',
      targetId: id,
    });
    return { ok: true, id, status: parsed.data.status };
  }
}
