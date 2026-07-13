import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as schema from '@jshsus/db';
import type {
  BoardCommentSummary,
  BoardPostDetail,
  BoardPostListItem,
  BoardPostSummary,
  PaginatedResponse,
  RichTextDocument,
} from '@jshsus/types';
import { and, count, desc, eq, isNull, like, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { type ContentListQuery, toContainsPattern } from '../../shared/content-list-query';
import type { AuthSession } from '../auth/auth.service';
import { DatabaseService, type AppDatabase } from '../database/database.service';
import { FilesService } from '../files/files.service';
import { collectInlineImageSources, parsePostCreate, parsePostUpdate } from './post-content';

const commentSchema = z.object({
  content: z.string().min(1).max(2000),
  parentId: z.coerce.number().int().positive().optional(),
});
const hiddenSchema = z.object({ isHidden: z.boolean() });
const memberWritableBoardSlugs = new Set(['free']);

@Injectable()
export class BoardsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly filesService: FilesService,
  ) {}

  async listPostsPage(
    slug: string,
    query: ContentListQuery,
  ): Promise<PaginatedResponse<BoardPostListItem>> {
    return this.database.query('boards.posts.listPage', async (db) => {
      const board = await this.findBoard(db, slug);
      if (!board || board.visibility !== 'public') {
        return {
          items: [],
          total: 0,
          page: query.page,
          pageSize: query.pageSize,
          totalPages: 0,
        };
      }

      const pattern = toContainsPattern(query.q);
      const search = query.q
        ? query.field === 'title'
          ? like(schema.posts.title, pattern)
          : query.field === 'author'
            ? and(eq(schema.posts.isAnonymous, false), like(schema.users.name, pattern))
            : or(like(schema.posts.title, pattern), like(schema.posts.content, pattern))
        : undefined;
      const where = and(
        eq(schema.posts.boardId, board.id),
        or(eq(schema.posts.status, 'published'), isNull(schema.posts.status)),
        eq(schema.posts.isHidden, false),
        search,
      );
      const [totalRow] = await db
        .select({ total: count() })
        .from(schema.posts)
        .leftJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
        .where(where);
      const total = Number(totalRow?.total ?? 0);
      const rows = await db
        .select({
          id: schema.posts.id,
          title: schema.posts.title,
          authorName: schema.users.name,
          isAnonymous: schema.posts.isAnonymous,
          viewCount: schema.posts.viewCount,
          createdAt: schema.posts.createdAt,
          commentCount:
            sql<number>`cast((select count(*) from ${schema.comments} where ${schema.comments.postId} = ${schema.posts.id} and ${schema.comments.isHidden} = false) as unsigned)`.mapWith(
              Number,
            ),
        })
        .from(schema.posts)
        .leftJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
        .where(where)
        .orderBy(desc(schema.posts.createdAt), desc(schema.posts.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);

      return {
        items: rows.map((row) => ({
          id: row.id,
          boardSlug: slug,
          title: row.title,
          authorName: row.isAnonymous ? undefined : (row.authorName ?? undefined),
          isAnonymous: row.isAnonymous,
          viewCount: row.viewCount,
          commentCount: row.commentCount,
          createdAt: row.createdAt.toISOString(),
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
      };
    });
  }

  async listPosts(slug = 'free', limit = 50, includeHidden = false): Promise<BoardPostSummary[]> {
    return this.database.query('boards.posts.list', async (db) => {
      const board = await this.findBoard(db, slug);
      if (!board || (!includeHidden && board.visibility !== 'public')) return [];

      const rows = await db
        .select({
          id: schema.posts.id,
          title: schema.posts.title,
          content: schema.posts.content,
          contentJson: schema.posts.contentJson,
          authorName: schema.users.name,
          isAnonymous: schema.posts.isAnonymous,
          isHidden: schema.posts.isHidden,
          status: schema.posts.status,
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
            : and(
                eq(schema.posts.boardId, board.id),
                or(eq(schema.posts.status, 'published'), isNull(schema.posts.status)),
                eq(schema.posts.isHidden, false),
              ),
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
        contentDoc: (row.contentJson as RichTextDocument | null) ?? undefined,
        authorName: row.isAnonymous ? undefined : (row.authorName ?? undefined),
        isAnonymous: row.isAnonymous,
        isHidden: row.isHidden,
        status: row.status ?? 'published',
        viewCount: row.viewCount,
        commentCount: row.commentCount,
        createdAt: row.createdAt.toISOString(),
        attachments: attachments.get(row.id) ?? [],
      }));
    });
  }

  async createMemberPost(slug: string, body: unknown, actorId?: number | null) {
    const parsed = parsePostCreate(body, 'published');

    return this.insertPost(slug, parsed, actorId);
  }

  async createMemberDraft(slug: string, body: unknown, actorId?: number | null) {
    const parsed = parsePostCreate(body, 'draft');

    return this.insertPost(slug, parsed, actorId);
  }

  private async insertPost(
    slug: string,
    parsed: ReturnType<typeof parsePostCreate>,
    actorId?: number | null,
  ) {
    if (!actorId || actorId <= 0) throw new ForbiddenException('A persisted account is required.');
    if (collectInlineImageSources(parsed.contentDoc).length > 0) {
      throw new BadRequestException('Create a draft before uploading and embedding images.');
    }

    return this.database.query('boards.posts.create', async (db) => {
      const board = await this.findMemberWritableBoard(db, slug);
      const [result] = await db
        .insert(schema.posts)
        .values({
          boardId: board.id,
          authorId: actorId,
          title: parsed.title,
          content: parsed.content,
          contentJson: parsed.contentDoc,
          status: parsed.status,
          isAnonymous: parsed.isAnonymous,
        })
        .$returningId();
      await this.database.writeAudit({
        actorId,
        action: 'board.post.create',
        targetType: 'posts',
        targetId: result.id,
      });
      return { ok: true, post: { id: result.id, boardSlug: slug, ...parsed } };
    });
  }

  async getPost(slug: string, id: number): Promise<BoardPostDetail> {
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Invalid post id.');

    return this.database.query('boards.posts.detail', async (db) => {
      const board = await this.findBoard(db, slug);
      if (!board || board.visibility !== 'public')
        throw new NotFoundException('Post was not found.');

      const [row] = await db
        .select({
          id: schema.posts.id,
          title: schema.posts.title,
          content: schema.posts.content,
          contentJson: schema.posts.contentJson,
          authorName: schema.users.name,
          isAnonymous: schema.posts.isAnonymous,
          viewCount: schema.posts.viewCount,
          createdAt: schema.posts.createdAt,
          commentCount:
            sql<number>`cast((select count(*) from ${schema.comments} where ${schema.comments.postId} = ${schema.posts.id} and ${schema.comments.isHidden} = false) as unsigned)`.mapWith(
              Number,
            ),
        })
        .from(schema.posts)
        .leftJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
        .where(
          and(
            eq(schema.posts.id, id),
            eq(schema.posts.boardId, board.id),
            or(eq(schema.posts.status, 'published'), isNull(schema.posts.status)),
            eq(schema.posts.isHidden, false),
          ),
        )
        .limit(1);
      if (!row) throw new NotFoundException('Post was not found.');

      await db
        .update(schema.posts)
        .set({ viewCount: sql`${schema.posts.viewCount} + 1` })
        .where(eq(schema.posts.id, id));
      const attachments = await this.filesService.listForTarget('post', id);

      return {
        id: row.id,
        boardSlug: slug,
        title: row.title,
        content: row.content,
        contentDoc: (row.contentJson as RichTextDocument | null) ?? undefined,
        authorName: row.isAnonymous ? undefined : (row.authorName ?? undefined),
        isAnonymous: row.isAnonymous,
        viewCount: row.viewCount + 1,
        commentCount: row.commentCount,
        createdAt: row.createdAt.toISOString(),
        attachments,
      };
    });
  }

  async updatePost(slug: string, id: number, body: unknown, session?: AuthSession | null) {
    const parsed = parsePostUpdate(body);
    return this.database.query('boards.posts.update', async (db) => {
      const target = await this.findOwnedPost(db, slug, id, session);
      const targetStatus = target.status ?? 'published';
      const nextContent = parsed.content ?? target.content;
      const nextDocument =
        parsed.contentDoc === undefined
          ? (target.contentJson as RichTextDocument | null)
          : parsed.contentDoc;
      if (targetStatus === 'published' && nextContent.trim().length === 0) {
        throw new BadRequestException('Published posts need content.');
      }
      await this.filesService.assertInlineImagesForPost(
        id,
        collectInlineImageSources(nextDocument),
        targetStatus === 'published',
      );

      await db
        .update(schema.posts)
        .set({
          title: parsed.title,
          content: parsed.content,
          contentJson: parsed.contentDoc,
          isAnonymous: parsed.isAnonymous,
          updatedAt: new Date(),
        })
        .where(eq(schema.posts.id, id));
      await this.database.writeAudit({
        actorId: session?.userId,
        action: 'board.post.update',
        targetType: 'posts',
        targetId: id,
      });
      return {
        ok: true,
        post: {
          id,
          boardSlug: slug,
          title: parsed.title ?? target.title,
          content: nextContent,
          contentDoc:
            parsed.contentDoc === undefined
              ? ((target.contentJson as RichTextDocument | null) ?? undefined)
              : (parsed.contentDoc ?? undefined),
          isAnonymous: parsed.isAnonymous ?? target.isAnonymous,
          status: targetStatus,
        },
      };
    });
  }

  async publishPost(slug: string, id: number, session?: AuthSession | null) {
    return this.database.query('boards.posts.publish', async (db) => {
      const target = await this.findOwnedPost(db, slug, id, session);
      if (target.content.trim().length === 0) {
        throw new BadRequestException('Published posts need content.');
      }
      await this.filesService.assertInlineImagesForPost(
        id,
        collectInlineImageSources(target.contentJson as RichTextDocument | null),
        false,
      );
      await db.transaction(async (transaction) => {
        await transaction
          .update(schema.files)
          .set({ visibility: 'public', updatedAt: new Date() })
          .where(and(eq(schema.files.targetType, 'post'), eq(schema.files.targetId, id)));
        await transaction
          .update(schema.posts)
          .set({ status: 'published', updatedAt: new Date() })
          .where(eq(schema.posts.id, id));
      });
      await this.database.writeAudit({
        actorId: session?.userId,
        action: 'board.post.publish',
        targetType: 'posts',
        targetId: id,
      });
      return { ok: true, post: { id, boardSlug: slug, status: 'published' as const } };
    });
  }

  async deleteDraft(slug: string, id: number, session?: AuthSession | null) {
    return this.database.query('boards.posts.deleteDraft', async (db) => {
      await db.transaction(async (transaction) => {
        const target = await this.findOwnedPost(
          transaction as unknown as AppDatabase,
          slug,
          id,
          session,
          true,
        );
        if (target.status !== 'draft') {
          throw new BadRequestException('Only draft posts can be deleted from this endpoint.');
        }
        await this.filesService.enqueueForTarget(
          'post',
          id,
          'draft_delete',
          transaction as unknown as AppDatabase,
        );
        await transaction.delete(schema.posts).where(eq(schema.posts.id, id));
        await transaction.insert(schema.auditLogs).values({
          actorId: session?.userId,
          action: 'board.post.draft.delete',
          targetType: 'posts',
          targetId: String(id),
        });
      });

      // The durable cleanup intent committed with the parent deletion and audit.
      // External object deletion is now an immediate best-effort pass; failures
      // remain queued for the background worker.
      const cleanup = await this.filesService.deleteForTarget('post', id);
      return { ok: true, id, cleanupPending: cleanup.failed > 0 };
    });
  }

  async updatePostHidden(id: number, body: unknown, actorId?: number | null) {
    const parsed = hiddenSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);

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

  async listComments(
    slug: string,
    postId: number,
    includeHidden = false,
  ): Promise<BoardCommentSummary[]> {
    return this.database.query('boards.comments.list', async (db) => {
      await this.assertCommentPost(db, slug, postId, includeHidden);
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
        createdAt: row.createdAt.toISOString(),
      }));
    });
  }

  async createComment(slug: string, postId: number, body: unknown, actorId?: number | null) {
    const parsed = commentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);

    const result = await this.database.query('boards.comments.create', async (db) => {
      await this.assertCommentPost(db, slug, postId);

      if (parsed.data.parentId) {
        const [parent] = await db
          .select({ id: schema.comments.id })
          .from(schema.comments)
          .where(
            and(
              eq(schema.comments.id, parsed.data.parentId),
              eq(schema.comments.postId, postId),
              eq(schema.comments.isHidden, false),
            ),
          )
          .limit(1);
        if (!parent) {
          throw new BadRequestException('Parent comment does not belong to this post.');
        }
      }

      const [inserted] = await db
        .insert(schema.comments)
        .values({
          postId,
          parentId: parsed.data.parentId,
          authorId: actorId && actorId > 0 ? actorId : null,
          content: parsed.data.content,
        })
        .$returningId();
      return inserted;
    });
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
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);

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

  private async findOwnedPost(
    db: AppDatabase,
    slug: string,
    id: number,
    session?: AuthSession | null,
    forUpdate = false,
  ) {
    if (!session?.userId || session.userId <= 0) {
      throw new ForbiddenException('A persisted account is required.');
    }
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Invalid post id.');

    const query = db
      .select({
        id: schema.posts.id,
        authorId: schema.posts.authorId,
        title: schema.posts.title,
        content: schema.posts.content,
        contentJson: schema.posts.contentJson,
        isAnonymous: schema.posts.isAnonymous,
        status: schema.posts.status,
      })
      .from(schema.posts)
      .innerJoin(schema.boards, eq(schema.posts.boardId, schema.boards.id))
      .where(and(eq(schema.posts.id, id), eq(schema.boards.slug, slug)))
      .limit(1);
    const [target] = forUpdate ? await query.for('update') : await query;
    if (!target) throw new NotFoundException('Post was not found.');

    const canManage =
      session.roles?.includes('system_admin') || session.permissions?.includes('content.manage');
    if (!canManage && target.authorId !== session.userId) {
      throw new ForbiddenException('You cannot modify this post.');
    }
    return target;
  }

  private async assertCommentPost(
    db: AppDatabase,
    slug: string,
    postId: number,
    includeNonPublic = false,
  ): Promise<void> {
    if (!Number.isInteger(postId) || postId <= 0) {
      throw new BadRequestException('Invalid post id.');
    }

    const publicPost = and(
      eq(schema.boards.visibility, 'public'),
      or(eq(schema.posts.status, 'published'), isNull(schema.posts.status)),
      eq(schema.posts.isHidden, false),
    );
    const [post] = await db
      .select({ id: schema.posts.id })
      .from(schema.posts)
      .innerJoin(schema.boards, eq(schema.posts.boardId, schema.boards.id))
      .where(
        and(
          eq(schema.posts.id, postId),
          eq(schema.boards.slug, slug),
          includeNonPublic ? undefined : publicPost,
        ),
      )
      .limit(1);

    if (!post) {
      throw new NotFoundException('Post was not found.');
    }
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

  private async findMemberWritableBoard(db: AppDatabase, slug: string) {
    if (!memberWritableBoardSlugs.has(slug)) {
      throw new NotFoundException('Board was not found.');
    }

    const board = await this.findBoard(db, slug);
    if (!board || board.visibility !== 'public') {
      throw new NotFoundException('Board was not found.');
    }
    return board;
  }
}
