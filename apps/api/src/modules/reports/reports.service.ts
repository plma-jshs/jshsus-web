import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as schema from '@jshsus/db';
import type { ContentReportSummary } from '@jshsus/types';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';

const reportSchema = z.object({
  targetType: z.enum(['post', 'comment', 'lost_item']),
  targetId: z.coerce.number().int().positive(),
  reason: z.string().min(1).max(120),
  detail: z.string().max(2000).optional().default(''),
});
const reportStatusSchema = z.object({
  status: z.enum(['open', 'reviewing', 'closed', 'dismissed']),
});

function isDuplicateEntry(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; errno?: unknown; cause?: unknown };
  if (candidate.code === 'ER_DUP_ENTRY' || candidate.errno === 1062) return true;
  return candidate.cause ? isDuplicateEntry(candidate.cause) : false;
}

@Injectable()
export class ReportsService {
  constructor(private readonly database: DatabaseService) {}

  async create(body: unknown, actorId?: number | null) {
    const parsed = reportSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    if (!actorId || actorId < 1) throw new UnauthorizedException('로그인이 필요합니다.');

    const dedupeKey = `${parsed.data.targetType}:${parsed.data.targetId}:${actorId}`;
    let result: { id: number };
    try {
      [result] = await this.database.db
        .insert(schema.reports)
        .values({ ...parsed.data, reporterId: actorId, dedupeKey })
        .$returningId();
    } catch (error) {
      if (isDuplicateEntry(error)) {
        throw new ConflictException('이미 신고한 내용입니다.');
      }
      throw error;
    }
    await this.database.writeAudit({
      actorId,
      action: 'content.report.create',
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
    });
    return { ok: true, report: { id: result.id, status: 'open', ...parsed.data } };
  }

  async list(): Promise<ContentReportSummary[]> {
    return this.database.query('reports.list', async (db) => {
      const rows = await db
        .select({
          id: schema.reports.id,
          targetType: schema.reports.targetType,
          targetId: schema.reports.targetId,
          reporterName: schema.users.name,
          reason: schema.reports.reason,
          detail: schema.reports.detail,
          status: schema.reports.status,
          createdAt: schema.reports.createdAt,
        })
        .from(schema.reports)
        .leftJoin(schema.users, eq(schema.reports.reporterId, schema.users.id))
        .orderBy(desc(schema.reports.createdAt))
        .limit(200);
      return rows.map((row) => ({
        id: row.id,
        targetType: row.targetType,
        targetId: row.targetId,
        reporterName: row.reporterName ?? undefined,
        reason: row.reason,
        detail: row.detail ?? undefined,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      }));
    });
  }

  async updateStatus(id: number, body: unknown, actorId?: number | null) {
    const parsed = reportStatusSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);

    await this.database.db
      .update(schema.reports)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(schema.reports.id, id));
    await this.database.writeAudit({
      actorId,
      action: 'content.report.status',
      targetType: 'reports',
      targetId: id,
    });
    return { ok: true, id, status: parsed.data.status };
  }
}
