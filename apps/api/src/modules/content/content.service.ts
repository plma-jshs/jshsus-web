import { BadRequestException, Injectable } from '@nestjs/common';
import * as schema from '@jshsus/db';
import type {
  BoardCommentSummary,
  BoardPostSummary,
  ContentReportSummary,
  DashboardLostItem,
  DashboardNotice,
  LostItemSummary,
  NoticeSummary,
} from '@jshsus/types';
import { and, desc, eq, lte, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService, type AppDatabase } from '../database/database.service';
import { FilesService } from '../files/files.service';

const postSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  isAnonymous: z.boolean().optional().default(false),
});

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

const commentSchema = z.object({
  content: z.string().min(1).max(2000),
  parentId: z.coerce.number().int().positive().optional(),
});

const reportSchema = z.object({
  targetType: z.enum(['post', 'comment', 'lost_item']),
  targetId: z.coerce.number().int().positive(),
  reason: z.string().min(1).max(120),
  detail: z.string().max(2000).optional().default(''),
});

const hiddenSchema = z.object({
  isHidden: z.boolean(),
});

const lostItemStatusSchema = z.object({
  status: z.enum(['open', 'matched', 'closed', 'hidden']),
});

const reportStatusSchema = z.object({
  status: z.enum(['open', 'reviewing', 'closed', 'dismissed']),
});

const lostItemSchema = z.object({
  type: z.enum(['lost', 'found']),
  itemName: z.string().min(1).max(160),
  location: z.string().max(160).optional().default(''),
  occurredAt: z.coerce.date().optional(),
  description: z.string().max(2000).optional().default(''),
});

function toIso(value?: Date | null) {
  return value ? value.toISOString() : new Date().toISOString();
}

@Injectable()
export class ContentService {
  constructor(
    private readonly database: DatabaseService,
    private readonly filesService: FilesService,
  ) {}

  async listNotices(limit = 30, includeRestricted = false): Promise<NoticeSummary[]> {
    return this.database.query('content.notices', async (db) => {
      const rows = await db
        .select({
          id: schema.notices.id,
          title: schema.notices.title,
          content: schema.notices.content,
          department: schema.notices.department,
          pinned: schema.notices.pinned,
          publishedAt: schema.notices.publishedAt,
          authorName: schema.users.name,
          viewCount: schema.notices.viewCount,
        })
        .from(schema.notices)
        .leftJoin(schema.users, eq(schema.notices.authorId, schema.users.id))
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
        title: row.title,
        content: row.content,
        department: row.department ?? '학교',
        pinned: row.pinned,
        publishedAt: toIso(row.publishedAt),
        authorName: row.authorName ?? undefined,
        viewCount: row.viewCount,
        attachments: attachments.get(row.id) ?? [],
      }));
    });
  }

  async createNotice(body: unknown, actorId?: number | null) {
    const parsed = noticeSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const [result] = await this.database.db
      .insert(schema.notices)
      .values({
        ...parsed.data,
        authorId: actorId && actorId > 0 ? actorId : null,
      })
      .$returningId();

    await this.database.writeAudit({
      actorId,
      action: 'notice.create',
      targetType: 'notices',
      targetId: result.id,
    });

    return { ok: true, notice: { id: result.id, ...parsed.data } };
  }

  async updateNotice(id: number, body: unknown, actorId?: number | null) {
    const parsed = noticeSchema.partial().safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

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

  async deleteNotice(id: number, actorId?: number | null) {
    await this.database.db.delete(schema.notices).where(eq(schema.notices.id, id));
    await this.database.writeAudit({
      actorId,
      action: 'notice.delete',
      targetType: 'notices',
      targetId: id,
    });

    return { ok: true, id };
  }

  async listDashboardNotices(limit = 5): Promise<DashboardNotice[]> {
    const notices = await this.listNotices(limit);

    return notices.map((notice) => ({
      id: notice.id,
      title: notice.title,
      department: notice.department,
      pinned: notice.pinned,
      publishedAt: notice.publishedAt,
    }));
  }

  async listBoardPosts(
    slug = 'free',
    limit = 50,
    includeHidden = false,
  ): Promise<BoardPostSummary[]> {
    return this.database.query('content.board-posts', async (db) => {
      const board = await this.findBoard(db, slug);

      if (!board || (!includeHidden && board.visibility !== 'public')) {
        return [];
      }

      const rows = await db
        .select({
          id: schema.posts.id,
          title: schema.posts.title,
          content: schema.posts.content,
          authorName: schema.users.name,
          isAnonymous: schema.posts.isAnonymous,
          isHidden: schema.posts.isHidden,
          viewCount: schema.posts.viewCount,
          createdAt: schema.posts.createdAt,
          commentCount:
            sql<number>`cast((select count(*) from ${schema.comments} where ${schema.comments.postId} = ${schema.posts.id}) as unsigned)`.mapWith(
              Number,
            ),
        })
        .from(schema.posts)
        .leftJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
        .where(
          includeHidden
            ? eq(schema.posts.boardId, board.id)
            : and(eq(schema.posts.boardId, board.id), eq(schema.posts.isHidden, false)),
        )
        .orderBy(desc(schema.posts.createdAt), desc(schema.posts.id))
        .limit(limit);

      const attachments = await this.filesService.listForTargets(
        'post',
        rows.map((row) => row.id),
        includeHidden,
      );
      return rows.map((row) => ({
        id: row.id,
        boardSlug: slug,
        title: row.title,
        content: row.content,
        authorName: row.isAnonymous ? undefined : (row.authorName ?? undefined),
        isAnonymous: row.isAnonymous,
        isHidden: row.isHidden,
        viewCount: row.viewCount,
        commentCount: row.commentCount,
        createdAt: toIso(row.createdAt),
        attachments: attachments.get(row.id) ?? [],
      }));
    });
  }

  async createBoardPost(slug: string, body: unknown, actorId?: number | null) {
    const parsed = postSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    return this.database.query('content.board-posts.create', async (db) => {
      const board = await this.ensureBoard(db, slug);
      const [result] = await db
        .insert(schema.posts)
        .values({
          boardId: board.id,
          authorId: actorId && actorId > 0 ? actorId : null,
          title: parsed.data.title,
          content: parsed.data.content,
          isAnonymous: parsed.data.isAnonymous,
        })
        .$returningId();

      await this.database.writeAudit({
        actorId,
        action: 'board.post.create',
        targetType: 'posts',
        targetId: result.id,
      });

      return { ok: true, post: { id: result.id, boardSlug: slug, ...parsed.data } };
    });
  }

  async updatePostHidden(id: number, body: unknown, actorId?: number | null) {
    const parsed = hiddenSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    await this.database.db
      .update(schema.posts)
      .set({ isHidden: parsed.data.isHidden, updatedAt: new Date() })
      .where(eq(schema.posts.id, id));
    await this.database.writeAudit({
      actorId,
      action: parsed.data.isHidden ? 'board.post.hide' : 'board.post.show',
      targetType: 'posts',
      targetId: id,
    });

    return { ok: true, id, isHidden: parsed.data.isHidden };
  }

  async listComments(postId: number, includeHidden = false): Promise<BoardCommentSummary[]> {
    return this.database.query('content.comments', async (db) => {
      const rows = await db
        .select({
          id: schema.comments.id,
          postId: schema.comments.postId,
          parentId: schema.comments.parentId,
          authorName: schema.users.name,
          content: schema.comments.content,
          isHidden: schema.comments.isHidden,
          createdAt: schema.comments.createdAt,
        })
        .from(schema.comments)
        .leftJoin(schema.users, eq(schema.comments.authorId, schema.users.id))
        .where(
          includeHidden
            ? eq(schema.comments.postId, postId)
            : and(eq(schema.comments.postId, postId), eq(schema.comments.isHidden, false)),
        )
        .orderBy(schema.comments.createdAt, schema.comments.id);

      return rows.map((row) => ({
        id: row.id,
        postId: row.postId,
        parentId: row.parentId ?? undefined,
        authorName: row.authorName ?? undefined,
        content: row.content,
        isHidden: row.isHidden,
        createdAt: toIso(row.createdAt),
      }));
    });
  }

  async createComment(postId: number, body: unknown, actorId?: number | null) {
    const parsed = commentSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const [result] = await this.database.db
      .insert(schema.comments)
      .values({
        postId,
        parentId: parsed.data.parentId,
        authorId: actorId && actorId > 0 ? actorId : null,
        content: parsed.data.content,
      })
      .$returningId();

    await this.database.writeAudit({
      actorId,
      action: 'board.comment.create',
      targetType: 'comments',
      targetId: result.id,
    });

    return { ok: true, comment: { id: result.id, postId, ...parsed.data } };
  }

  async updateCommentHidden(id: number, body: unknown, actorId?: number | null) {
    const parsed = hiddenSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    await this.database.db
      .update(schema.comments)
      .set({ isHidden: parsed.data.isHidden, updatedAt: new Date() })
      .where(eq(schema.comments.id, id));
    await this.database.writeAudit({
      actorId,
      action: parsed.data.isHidden ? 'board.comment.hide' : 'board.comment.show',
      targetType: 'comments',
      targetId: id,
    });

    return { ok: true, id, isHidden: parsed.data.isHidden };
  }

  async createReport(body: unknown, actorId?: number | null) {
    const parsed = reportSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const [result] = await this.database.db
      .insert(schema.reports)
      .values({
        ...parsed.data,
        reporterId: actorId && actorId > 0 ? actorId : null,
      })
      .$returningId();

    await this.database.writeAudit({
      actorId,
      action: 'content.report.create',
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
    });

    return { ok: true, report: { id: result.id, status: 'open', ...parsed.data } };
  }

  async listReports(): Promise<ContentReportSummary[]> {
    return this.database.query('content.reports', async (db) => {
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
        createdAt: toIso(row.createdAt),
      }));
    });
  }

  async updateReportStatus(id: number, body: unknown, actorId?: number | null) {
    const parsed = reportStatusSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

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

  async listLostItems(limit = 50, includeHidden = false): Promise<LostItemSummary[]> {
    return this.database.query('content.lost-items', async (db) => {
      const rows = await db
        .select({
          id: schema.lostItems.id,
          type: schema.lostItems.type,
          itemName: schema.lostItems.itemName,
          location: schema.lostItems.location,
          occurredAt: schema.lostItems.occurredAt,
          description: schema.lostItems.description,
          status: schema.lostItems.status,
          authorName: schema.users.name,
          createdAt: schema.lostItems.createdAt,
        })
        .from(schema.lostItems)
        .leftJoin(schema.users, eq(schema.lostItems.authorId, schema.users.id))
        .where(includeHidden ? undefined : ne(schema.lostItems.status, 'hidden'))
        .orderBy(desc(schema.lostItems.createdAt), desc(schema.lostItems.id))
        .limit(limit);

      const attachments = await this.filesService.listForTargets(
        'lost_item',
        rows.map((row) => row.id),
        includeHidden,
      );
      return rows.map((row) => ({
        id: row.id,
        type: row.type,
        itemName: row.itemName,
        location: row.location ?? '',
        occurredAt: row.occurredAt ? row.occurredAt.toISOString() : undefined,
        description: row.description ?? undefined,
        status: row.status,
        authorName: row.authorName ?? undefined,
        attachments: attachments.get(row.id) ?? [],
      }));
    });
  }

  async listDashboardLostItems(limit = 5): Promise<DashboardLostItem[]> {
    const lostItems = await this.listLostItems(limit);

    return lostItems.map((item) => ({
      id: item.id,
      type: item.type,
      itemName: item.itemName,
      location: item.location,
      status: item.status,
    }));
  }

  async createLostItem(body: unknown, actorId?: number | null) {
    const parsed = lostItemSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    return this.database.query('content.lost-items.create', async (db) => {
      const [result] = await db
        .insert(schema.lostItems)
        .values({
          type: parsed.data.type,
          itemName: parsed.data.itemName,
          location: parsed.data.location,
          occurredAt: parsed.data.occurredAt,
          description: parsed.data.description,
          authorId: actorId && actorId > 0 ? actorId : null,
        })
        .$returningId();

      await this.database.writeAudit({
        actorId,
        action: 'lost-item.create',
        targetType: 'lost_items',
        targetId: result.id,
      });

      return { ok: true, lostItem: { id: result.id, status: 'open', ...parsed.data } };
    });
  }

  async updateLostItemStatus(id: number, body: unknown, actorId?: number | null) {
    const parsed = lostItemStatusSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    await this.database.db
      .update(schema.lostItems)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(schema.lostItems.id, id));
    await this.database.writeAudit({
      actorId,
      action: 'lost-item.status',
      targetType: 'lost_items',
      targetId: id,
    });

    return { ok: true, id, status: parsed.data.status };
  }

  private async findBoard(db: AppDatabase, slug: string) {
    const [board] = await db
      .select({
        id: schema.boards.id,
        slug: schema.boards.slug,
        visibility: schema.boards.visibility,
      })
      .from(schema.boards)
      .where(eq(schema.boards.slug, slug))
      .limit(1);

    return board ?? null;
  }

  private async ensureBoard(db: AppDatabase, slug: string) {
    const existing = await this.findBoard(db, slug);

    if (existing) {
      return existing;
    }

    const [result] = await db
      .insert(schema.boards)
      .values({
        slug,
        name: slug === 'free' ? '자유게시판' : slug,
        description: '학생 포털 게시판',
        visibility: slug === 'free' ? 'public' : 'members',
      })
      .$returningId();

    return {
      id: result.id,
      slug,
      visibility: slug === 'free' ? ('public' as const) : ('members' as const),
    };
  }
}
