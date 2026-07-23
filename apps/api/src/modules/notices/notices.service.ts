import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as schema from '@jshsus/db';
import type {
  DashboardNotice,
  NoticeDetail,
  NoticeListItem,
  NoticeSummary,
  PaginatedResponse,
} from '@jshsus/types';
import { and, count, desc, eq, like, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { type ContentListQuery, toContainsPattern } from '../../shared/content-list-query';
import { type AppDatabase, DatabaseService } from '../database/database.service';
import { FilesService } from '../files/files.service';

const noticeSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  department: z.string().max(80).optional().default('학교'),
  pinned: z.boolean().optional().default(false),
  visibility: z.enum(['public', 'members', 'admin']).optional().default('public'),
  publishedAt: z.coerce
    .date()
    .optional()
    .default(() => new Date()),
});

function toIso(value?: Date | null) {
  return value ? value.toISOString() : new Date().toISOString();
}

@Injectable()
export class NoticesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly filesService: FilesService,
  ) {}

  async listPage(query: ContentListQuery): Promise<PaginatedResponse<NoticeListItem>> {
    return this.database.query('notices.listPage', async (db) => {
      const pattern = toContainsPattern(query.q);
      const search = query.q
        ? query.field === 'title'
          ? like(schema.notices.title, pattern)
          : query.field === 'author'
            ? like(schema.notices.department, pattern)
            : or(like(schema.notices.title, pattern), like(schema.notices.content, pattern))
        : undefined;
      const where = and(
        eq(schema.notices.visibility, 'public'),
        lte(schema.notices.publishedAt, new Date()),
        search,
      );

      const [totalRow] = await db.select({ total: count() }).from(schema.notices).where(where);
      const total = Number(totalRow?.total ?? 0);
      const items = await db
        .select({
          id: schema.notices.id,
          publicNumber: schema.notices.publicNo,
          title: schema.notices.title,
          department: schema.notices.department,
          pinned: schema.notices.pinned,
          publishedAt: schema.notices.publishedAt,
          viewCount: schema.notices.viewCount,
        })
        .from(schema.notices)
        .where(where)
        .orderBy(
          desc(schema.notices.pinned),
          desc(schema.notices.publishedAt),
          desc(schema.notices.id),
        )
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);

      return {
        items: items.map((row) => ({
          id: row.id,
          publicNumber: row.publicNumber ?? row.id,
          title: row.title,
          department: row.department ?? '학교',
          pinned: row.pinned ?? false,
          publishedAt: toIso(row.publishedAt),
          viewCount: row.viewCount,
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
      };
    });
  }

  async getDetail(id: number): Promise<NoticeDetail> {
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Invalid notice id.');

    return this.database.query('notices.detail', async (db) => {
      const [row] = await db
        .select({
          id: schema.notices.id,
          publicNumber: schema.notices.publicNo,
          title: schema.notices.title,
          content: schema.notices.content,
          department: schema.notices.department,
          pinned: schema.notices.pinned,
          publishedAt: schema.notices.publishedAt,
          viewCount: schema.notices.viewCount,
        })
        .from(schema.notices)
        .where(
          and(
            eq(schema.notices.id, id),
            eq(schema.notices.visibility, 'public'),
            lte(schema.notices.publishedAt, new Date()),
          ),
        )
        .limit(1);
      if (!row) throw new NotFoundException('Notice was not found.');

      await db
        .update(schema.notices)
        .set({ viewCount: sql`${schema.notices.viewCount} + 1` })
        .where(eq(schema.notices.id, id));
      const attachments = await this.filesService.listForTarget('notice', id);

      return {
        id: row.id,
        publicNumber: row.publicNumber ?? row.id,
        title: row.title,
        content: row.content,
        department: row.department ?? '학교',
        pinned: row.pinned,
        publishedAt: toIso(row.publishedAt),
        viewCount: row.viewCount + 1,
        attachments,
      };
    });
  }

  async list(limit = 30, includeRestricted = false): Promise<NoticeSummary[]> {
    return this.database.query('notices.list', async (db) => {
      const rows = await db
        .select({
          id: schema.notices.id,
          publicNumber: schema.notices.publicNo,
          title: schema.notices.title,
          content: schema.notices.content,
          department: schema.notices.department,
          pinned: schema.notices.pinned,
          publishedAt: schema.notices.publishedAt,
          viewCount: schema.notices.viewCount,
        })
        .from(schema.notices)
        .where(
          includeRestricted
            ? undefined
            : and(
                eq(schema.notices.visibility, 'public'),
                lte(schema.notices.publishedAt, new Date()),
              ),
        )
        .orderBy(
          desc(schema.notices.pinned),
          desc(schema.notices.publishedAt),
          desc(schema.notices.id),
        )
        .limit(limit);

      const attachments = await this.filesService.listForTargets(
        'notice',
        rows.map((row) => row.id),
        includeRestricted,
      );
      return rows.map((row) => ({
        id: row.id,
        publicNumber: row.publicNumber ?? row.id,
        title: row.title,
        content: row.content,
        department: row.department ?? '학교',
        pinned: row.pinned,
        publishedAt: toIso(row.publishedAt),
        viewCount: row.viewCount,
        attachments: attachments.get(row.id) ?? [],
      }));
    });
  }

  async create(body: unknown, actorId?: number | null) {
    const parsed = noticeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);

    const result = await this.database.query('notices.create', async (db) =>
      db.transaction(async (tx) => {
        const [nextNumber] = await tx
          .select({
            publicNo:
              sql<number>`cast(coalesce(max(${schema.notices.publicNo}), 0) + 1 as unsigned)`.mapWith(
                Number,
              ),
          })
          .from(schema.notices)
          .limit(1);
        const [created] = await tx
          .insert(schema.notices)
          .values({
            ...parsed.data,
            publicNo: nextNumber?.publicNo ?? 1,
            authorId: actorId && actorId > 0 ? actorId : null,
          })
          .$returningId();
        return created;
      }),
    );
    await this.database.writeAudit({
      actorId,
      action: 'notice.create',
      targetType: 'notices',
      targetId: result.id,
    });
    return { ok: true, notice: { id: result.id, ...parsed.data } };
  }

  async update(id: number, body: unknown, actorId?: number | null) {
    const parsed = noticeSchema.partial().safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);

    await this.database.db
      .update(schema.notices)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(schema.notices.id, id));
    await this.database.writeAudit({
      actorId,
      action: 'notice.update',
      targetType: 'notices',
      targetId: id,
    });
    return { ok: true, id };
  }

  async delete(id: number, actorId?: number | null) {
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Invalid notice id.');

    return this.database.query('notices.delete', async (db) => {
      await db.transaction(async (transaction) => {
        const [notice] = await transaction
          .select({ id: schema.notices.id })
          .from(schema.notices)
          .where(eq(schema.notices.id, id))
          .limit(1)
          .for('update');
        if (!notice) throw new NotFoundException('Notice was not found.');

        await this.filesService.enqueueForTarget(
          'notice',
          id,
          'notice_delete',
          transaction as unknown as AppDatabase,
        );
        await transaction.delete(schema.notices).where(eq(schema.notices.id, id));
        await transaction.insert(schema.auditLogs).values({
          actorId: actorId && actorId > 0 ? actorId : null,
          action: 'notice.delete',
          targetType: 'notices',
          targetId: String(id),
        });
      });

      const cleanup = await this.filesService.deleteForTarget('notice', id);
      return { ok: true, id, cleanupPending: cleanup.failed > 0 };
    });
  }

  async listDashboard(limit = 5): Promise<DashboardNotice[]> {
    const notices = await this.list(limit);
    return notices.map(({ id, publicNumber, title, department, pinned, publishedAt }) => ({
      id,
      publicNumber,
      title,
      department,
      pinned,
      publishedAt,
    }));
  }
}
