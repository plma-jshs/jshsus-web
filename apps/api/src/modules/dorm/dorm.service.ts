import { BadRequestException, Injectable } from '@nestjs/common';
import * as schema from '@jshsus/db';
import type { DormAssignment, DormReport, DormStudentOption, DormRoom } from '@jshsus/types';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';

const assignmentSchema = z.object({
  roomId: z.coerce.number().int().positive(),
  userId: z.coerce.number().int().positive(),
  year: z.coerce.number().int().min(2020),
  semester: z.coerce.number().int().min(1).max(2),
  bedPosition: z.coerce.number().int().min(1),
});

const reportStatusSchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED']),
  comment: z.string().max(500).optional().default(''),
});

function currentDormTerm() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    semester: now.getMonth() + 1 >= 8 ? 2 : 1,
  };
}

@Injectable()
export class DormService {
  constructor(private readonly database: DatabaseService) {}

  async rooms(): Promise<DormRoom[]> {
    return this.database.query('dorm.rooms', async (db) => {
      const [rooms, assignments] = await Promise.all([
        db
          .select({
            id: schema.dormRooms.id,
            name: schema.dormRooms.name,
            capacity: schema.dormRooms.capacity,
            grade: schema.dormRooms.grade,
            dormName: schema.dormRooms.dormName,
          })
          .from(schema.dormRooms)
          .orderBy(schema.dormRooms.dormName, schema.dormRooms.name),
        db
          .select({ roomId: schema.dormAssignments.roomId })
          .from(schema.dormAssignments)
          .orderBy(desc(schema.dormAssignments.year), desc(schema.dormAssignments.semester)),
      ]);

      const assignedCounts = assignments.reduce<Record<number, number>>((acc, assignment) => {
        acc[assignment.roomId] = (acc[assignment.roomId] ?? 0) + 1;
        return acc;
      }, {});

      return rooms.map((room) => ({
        ...room,
        assignedCount: assignedCounts[room.id] ?? 0,
      }));
    });
  }

  async students(): Promise<DormStudentOption[]> {
    return this.database.query('dorm.students', async (db) => {
      const term = currentDormTerm();
      const [students, assignments] = await Promise.all([
        db
          .select({
            userId: schema.users.id,
            studentNo: schema.students.studentNo,
            name: schema.students.name,
            grade: schema.students.grade,
            classNo: schema.students.classNo,
            number: schema.students.number,
          })
          .from(schema.students)
          .innerJoin(schema.users, eq(schema.students.userId, schema.users.id))
          .where(isNotNull(schema.students.userId))
          .orderBy(schema.students.grade, schema.students.classNo, schema.students.number)
          .limit(500),
        db
          .select({
            userId: schema.dormAssignments.userId,
            roomName: schema.dormRooms.name,
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
        assignments.map((assignment) => [assignment.userId, assignment.roomName]),
      );

      return students.map((student) => ({
        ...student,
        currentRoom: roomByUser.get(student.userId),
      }));
    });
  }

  async assignments(): Promise<DormAssignment[]> {
    return this.database.query('dorm.assignments', async (db) => {
      const rows = await db
        .select({
          id: schema.dormAssignments.id,
          roomName: schema.dormRooms.name,
          studentNo: schema.users.studentNo,
          studentName: schema.users.name,
          year: schema.dormAssignments.year,
          semester: schema.dormAssignments.semester,
          bedPosition: schema.dormAssignments.bedPosition,
        })
        .from(schema.dormAssignments)
        .innerJoin(schema.dormRooms, eq(schema.dormAssignments.roomId, schema.dormRooms.id))
        .innerJoin(schema.users, eq(schema.dormAssignments.userId, schema.users.id))
        .orderBy(
          desc(schema.dormAssignments.year),
          desc(schema.dormAssignments.semester),
          schema.dormRooms.name,
        );

      return rows;
    });
  }

  async reports(): Promise<DormReport[]> {
    return this.database.query('dorm.reports', async (db) => {
      const rows = await db
        .select({
          id: schema.dormReports.id,
          roomName: schema.dormRooms.name,
          studentNo: schema.users.studentNo,
          studentName: schema.users.name,
          description: schema.dormReports.description,
          imageUrl: schema.dormReports.imageUrl,
          status: schema.dormReports.status,
          comment: schema.dormReports.comment,
          createdAt: schema.dormReports.createdAt,
        })
        .from(schema.dormReports)
        .innerJoin(schema.dormRooms, eq(schema.dormReports.roomId, schema.dormRooms.id))
        .innerJoin(schema.users, eq(schema.dormReports.userId, schema.users.id))
        .orderBy(desc(schema.dormReports.createdAt), desc(schema.dormReports.id))
        .limit(200);

      return rows.map((row) => ({
        ...row,
        imageUrl: row.imageUrl ?? undefined,
        comment: row.comment ?? undefined,
        createdAt: row.createdAt.toISOString(),
      }));
    });
  }

  async createAssignment(body: unknown, actorId?: number | null) {
    const parsed = assignmentSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    return this.database.query('dorm.assignments.create', async (db) => {
      const [room] = await db
        .select({ id: schema.dormRooms.id, capacity: schema.dormRooms.capacity })
        .from(schema.dormRooms)
        .where(eq(schema.dormRooms.id, parsed.data.roomId))
        .limit(1);

      if (!room) {
        throw new BadRequestException('Dorm room does not exist.');
      }

      if (parsed.data.bedPosition > room.capacity) {
        throw new BadRequestException('Bed position exceeds room capacity.');
      }

      const [existingUserAssignment] = await db
        .select({ id: schema.dormAssignments.id })
        .from(schema.dormAssignments)
        .where(
          and(
            eq(schema.dormAssignments.userId, parsed.data.userId),
            eq(schema.dormAssignments.year, parsed.data.year),
            eq(schema.dormAssignments.semester, parsed.data.semester),
          ),
        )
        .limit(1);

      if (existingUserAssignment) {
        throw new BadRequestException('Student already has a dorm assignment for this term.');
      }

      const [existingBedAssignment] = await db
        .select({ id: schema.dormAssignments.id })
        .from(schema.dormAssignments)
        .where(
          and(
            eq(schema.dormAssignments.roomId, parsed.data.roomId),
            eq(schema.dormAssignments.year, parsed.data.year),
            eq(schema.dormAssignments.semester, parsed.data.semester),
            eq(schema.dormAssignments.bedPosition, parsed.data.bedPosition),
          ),
        )
        .limit(1);

      if (existingBedAssignment) {
        throw new BadRequestException('Bed is already assigned for this term.');
      }

      const [occupied] = await db
        .select({
          count: sql<number>`cast(count(*) as unsigned)`.mapWith(Number),
        })
        .from(schema.dormAssignments)
        .where(
          and(
            eq(schema.dormAssignments.roomId, parsed.data.roomId),
            eq(schema.dormAssignments.year, parsed.data.year),
            eq(schema.dormAssignments.semester, parsed.data.semester),
          ),
        );

      if ((occupied?.count ?? 0) >= room.capacity) {
        throw new BadRequestException('Dorm room is already full for this term.');
      }

      const [result] = await db.insert(schema.dormAssignments).values(parsed.data).$returningId();
      await this.database.writeAudit({
        actorId,
        action: 'dorm.assignment.create',
        targetType: 'dorm_assignments',
        targetId: result.id,
      });

      return { ok: true, assignment: { id: result.id, ...parsed.data } };
    });
  }

  async updateReportStatus(id: number, body: unknown, actorId?: number | null) {
    const parsed = reportStatusSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    return this.database.query('dorm.reports.status.update', async (db) => {
      await db
        .update(schema.dormReports)
        .set({
          status: parsed.data.status,
          comment: parsed.data.comment || null,
          updatedAt: new Date(),
        })
        .where(eq(schema.dormReports.id, id));

      await this.database.writeAudit({
        actorId,
        action: 'dorm.report.status.update',
        targetType: 'dorm_reports',
        targetId: id,
      });

      return { ok: true, id, status: parsed.data.status };
    });
  }
}
