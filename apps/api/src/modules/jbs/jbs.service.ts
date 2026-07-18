import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as schema from '@jshsus/db';
import { and, count, desc, eq, isNull, like, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { type ContentListQuery, toContainsPattern } from '../../shared/content-list-query';
import { BoardsService } from '../boards/boards.service';
import { DatabaseService, type AppDatabase } from '../database/database.service';
import { YouTubeDataApiService } from '../youtube/youtube-data-api.service';

const JBS_BOARD_SLUG = 'jbs';

const createJbsPostSchema = z.object({
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().min(1).max(5000),
  youtubeUrl: z.string().trim().min(1).max(500),
});

export type JbsPostListItem = {
  id: number;
  title: string;
  description: string;
  youtubeVideoId: string;
  canonicalUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
  authorName?: string;
  viewCount: number;
  commentCount: number;
  likeCount: number;
  likedByMe: boolean;
  createdAt: string;
};

export type JbsPostPage = {
  items: JbsPostListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

@Injectable()
export class JbsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly boardsService: BoardsService,
    private readonly youtube: YouTubeDataApiService,
  ) {}

  async preview(rawUrl: string) {
    if (!rawUrl || rawUrl.length > 500) {
      throw new BadRequestException('YouTube URL을 입력해 주세요.');
    }
    return this.youtube.inspect(rawUrl);
  }

  async listPosts(query: ContentListQuery): Promise<JbsPostPage> {
    return this.database.query('jbs.posts.list', async (db) => {
      const pattern = toContainsPattern(query.q);
      const search = query.q
        ? query.field === 'title'
          ? like(schema.posts.title, pattern)
          : query.field === 'author'
            ? like(schema.users.name, pattern)
            : or(like(schema.posts.title, pattern), like(schema.posts.content, pattern))
        : undefined;
      const where = and(
        eq(schema.boards.slug, JBS_BOARD_SLUG),
        eq(schema.boards.visibility, 'public'),
        or(eq(schema.posts.status, 'published'), isNull(schema.posts.status)),
        eq(schema.posts.isHidden, false),
        search,
      );
      const [totalRow] = await db
        .select({ total: count() })
        .from(schema.posts)
        .innerJoin(schema.boards, eq(schema.posts.boardId, schema.boards.id))
        .innerJoin(schema.jbsVideos, eq(schema.jbsVideos.postId, schema.posts.id))
        .leftJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
        .where(where);
      const total = Number(totalRow?.total ?? 0);
      const rows = await db
        .select({
          id: schema.posts.id,
          title: schema.posts.title,
          description: schema.posts.content,
          youtubeVideoId: schema.jbsVideos.youtubeVideoId,
          canonicalUrl: schema.jbsVideos.canonicalUrl,
          authorName: schema.users.name,
          viewCount: schema.posts.viewCount,
          commentCount:
            sql<number>`cast((select count(*) from ${schema.comments} where ${schema.comments.postId} = ${schema.posts.id} and ${schema.comments.isHidden} = false) as unsigned)`.mapWith(
              Number,
            ),
          likeCount:
            sql<number>`cast((select count(*) from ${schema.postLikes} where ${schema.postLikes.postId} = ${schema.posts.id}) as unsigned)`.mapWith(
              Number,
            ),
          likedByMe: sql<number>`0`.mapWith(Number),
          createdAt: schema.posts.createdAt,
        })
        .from(schema.posts)
        .innerJoin(schema.boards, eq(schema.posts.boardId, schema.boards.id))
        .innerJoin(schema.jbsVideos, eq(schema.jbsVideos.postId, schema.posts.id))
        .leftJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
        .where(where)
        .orderBy(desc(schema.posts.createdAt), desc(schema.posts.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);

      return {
        items: rows.map((row) => this.toPost(row)),
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
      };
    });
  }

  async getPost(id: number, actorId?: number | null): Promise<JbsPostListItem> {
    this.assertPostId(id);

    return this.database.query('jbs.posts.detail', async (db) => {
      const [row] = await db
        .select({
          id: schema.posts.id,
          title: schema.posts.title,
          description: schema.posts.content,
          youtubeVideoId: schema.jbsVideos.youtubeVideoId,
          canonicalUrl: schema.jbsVideos.canonicalUrl,
          authorName: schema.users.name,
          viewCount: schema.posts.viewCount,
          commentCount:
            sql<number>`cast((select count(*) from ${schema.comments} where ${schema.comments.postId} = ${schema.posts.id} and ${schema.comments.isHidden} = false) as unsigned)`.mapWith(
              Number,
            ),
          likeCount:
            sql<number>`cast((select count(*) from ${schema.postLikes} where ${schema.postLikes.postId} = ${schema.posts.id}) as unsigned)`.mapWith(
              Number,
            ),
          likedByMe:
            actorId && actorId > 0
              ? sql<number>`exists(select 1 from ${schema.postLikes} where ${schema.postLikes.postId} = ${schema.posts.id} and ${schema.postLikes.userId} = ${actorId})`.mapWith(
                  Number,
                )
              : sql<number>`0`.mapWith(Number),
          createdAt: schema.posts.createdAt,
        })
        .from(schema.posts)
        .innerJoin(schema.boards, eq(schema.posts.boardId, schema.boards.id))
        .innerJoin(schema.jbsVideos, eq(schema.jbsVideos.postId, schema.posts.id))
        .leftJoin(schema.users, eq(schema.posts.authorId, schema.users.id))
        .where(
          and(
            eq(schema.posts.id, id),
            eq(schema.boards.slug, JBS_BOARD_SLUG),
            eq(schema.boards.visibility, 'public'),
            or(eq(schema.posts.status, 'published'), isNull(schema.posts.status)),
            eq(schema.posts.isHidden, false),
          ),
        )
        .limit(1);
      if (!row) throw new NotFoundException('JBS video was not found.');

      await db
        .update(schema.posts)
        .set({ viewCount: sql`${schema.posts.viewCount} + 1` })
        .where(eq(schema.posts.id, id));

      return this.toPost({ ...row, viewCount: row.viewCount + 1 });
    });
  }

  async createPost(body: unknown, actorId?: number | null) {
    if (!actorId || actorId <= 0) {
      throw new ForbiddenException('A persisted account is required.');
    }

    const parsed = createJbsPostSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const youtube = await this.youtube.inspect(parsed.data.youtubeUrl);

    return this.database.query('jbs.posts.create', async (db) => {
      const result = await db.transaction(async (transaction) => {
        const tx = transaction as unknown as AppDatabase;
        const [board] = await tx
          .select({ id: schema.boards.id })
          .from(schema.boards)
          .where(
            and(eq(schema.boards.slug, JBS_BOARD_SLUG), eq(schema.boards.visibility, 'public')),
          )
          .limit(1);
        if (!board) throw new NotFoundException('JBS board was not found.');

        const [post] = await tx
          .insert(schema.posts)
          .values({
            boardId: board.id,
            authorId: actorId,
            title: parsed.data.title,
            content: parsed.data.description,
            status: 'published',
            isAnonymous: false,
          })
          .$returningId();
        await tx.insert(schema.jbsVideos).values({
          postId: post.id,
          youtubeVideoId: youtube.videoId,
          canonicalUrl: youtube.canonicalUrl,
        });
        await tx.insert(schema.auditLogs).values({
          actorId,
          action: 'jbs.post.create',
          targetType: 'posts',
          targetId: String(post.id),
        });
        return post;
      });

      return {
        ok: true as const,
        post: {
          id: result.id,
          title: parsed.data.title,
          description: parsed.data.description,
          youtubeVideoId: youtube.videoId,
          canonicalUrl: youtube.canonicalUrl,
          embedUrl: youtube.embedUrl,
          thumbnailUrl: youtube.thumbnailUrl,
        },
      };
    });
  }

  listComments(postId: number, actorId?: number | null) {
    return this.boardsService.listComments(JBS_BOARD_SLUG, postId, false, actorId);
  }

  createComment(postId: number, body: unknown, actorId?: number | null) {
    if (!actorId || actorId <= 0) {
      throw new ForbiddenException('A persisted account is required.');
    }
    return this.boardsService.createComment(JBS_BOARD_SLUG, postId, body, actorId);
  }

  togglePostLike(postId: number, actorId?: number | null) {
    return this.boardsService.togglePostLike(JBS_BOARD_SLUG, postId, actorId);
  }

  toggleCommentLike(postId: number, commentId: number, actorId?: number | null) {
    return this.boardsService.toggleCommentLike(JBS_BOARD_SLUG, postId, commentId, actorId);
  }

  private assertPostId(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Invalid JBS post id.');
    }
  }

  private toPost(row: {
    id: number;
    title: string;
    description: string;
    youtubeVideoId: string;
    canonicalUrl: string;
    authorName: string | null;
    viewCount: number;
    commentCount: number;
    likeCount: number;
    likedByMe: number;
    createdAt: Date;
  }): JbsPostListItem {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      youtubeVideoId: row.youtubeVideoId,
      canonicalUrl: row.canonicalUrl,
      embedUrl: `https://www.youtube-nocookie.com/embed/${row.youtubeVideoId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${row.youtubeVideoId}/hqdefault.jpg`,
      authorName: row.authorName ?? undefined,
      viewCount: row.viewCount,
      commentCount: row.commentCount,
      likeCount: Number(row.likeCount ?? 0),
      likedByMe: Boolean(row.likedByMe),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
