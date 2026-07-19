import { BadRequestException, Injectable } from '@nestjs/common';
import * as schema from '@jshsus/db';
import type { ThanksChallengeCreateResult, ThanksChallengeData } from '@jshsus/types';
import { asc, count, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthSession } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';

const createThanksSchema = z.object({
  message: z.string().trim().min(1).max(1000),
});

function formatMysqlDateTime(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hour = String(value.getHours()).padStart(2, '0');
  const minute = String(value.getMinutes()).padStart(2, '0');
  const second = String(value.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function resolveStudentNumber(session?: AuthSession) {
  if (session?.identityType !== 'student') {
    throw new BadRequestException('Student login is required.');
  }

  if (Number.isInteger(session.stuid) && session.stuid && session.stuid > 0) {
    return String(session.stuid);
  }

  const identifier = Number(session.identifier);
  if (Number.isInteger(identifier) && identifier > 0) {
    return String(identifier);
  }

  throw new BadRequestException('Student number is required.');
}

@Injectable()
export class ThanksService {
  constructor(private readonly database: DatabaseService) {}

  async list(): Promise<ThanksChallengeData> {
    return this.database.query('thanks.list', async (db) => {
      const [messages, summary] = await Promise.all([
        db
          .select({
            id: schema.thanksMessages.id,
            schoolNumber: schema.thanksMessages.schoolNumber,
            message: schema.thanksMessages.message,
            submittedAt: sql<string>`date_format(${schema.thanksMessages.submittedAt}, '%Y-%m-%d %H:%i:%s')`,
          })
          .from(schema.thanksMessages)
          .orderBy(asc(schema.thanksMessages.id)),
        db
          .select({
            schoolNumber: schema.thanksMessages.schoolNumber,
            messageCount: count(),
          })
          .from(schema.thanksMessages)
          .groupBy(schema.thanksMessages.schoolNumber)
          .orderBy(sql`cast(${schema.thanksMessages.schoolNumber} as unsigned)`),
      ]);

      return {
        messages,
        summary,
        totalMessages: messages.length,
        totalStudents: summary.length,
      };
    });
  }

  async create(body: unknown, session?: AuthSession): Promise<ThanksChallengeCreateResult> {
    const parsed = createThanksSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Thanks message is required.');
    }

    const schoolNumber = resolveStudentNumber(session);
    const submittedAt = new Date();

    return this.database.query('thanks.create', async (db) => {
      const [result] = await db
        .insert(schema.thanksMessages)
        .values({
          schoolNumber,
          message: parsed.data.message,
          submittedAt,
        })
        .$returningId();

      return {
        ok: true,
        message: {
          id: result.id,
          schoolNumber,
          message: parsed.data.message,
          submittedAt: formatMysqlDateTime(submittedAt),
        },
      };
    });
  }
}
