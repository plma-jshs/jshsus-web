import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as schema from '@jshsus/db';
import { and, asc, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthSession } from '../auth/auth.service';
import { DatabaseService, type AppDatabase } from '../database/database.service';
import { YouTubeDataApiService } from '../youtube/youtube-data-api.service';
import {
  MAX_PENDING_WAKE_SONG_REQUESTS,
  validateWakeSongSegment,
  WakeSongPolicyError,
} from './wake-song.policy';
import {
  type WakeSongPage,
  type WakeSongRequestStatus,
  type WakeSongRequestSummary,
  WAKE_SONG_STATUSES,
} from './wake-songs.types';

const requestInputSchema = z.object({
  url: z.string().trim().min(1).max(500),
  startSeconds: z.coerce.number().int().min(0),
  endSeconds: z.coerce.number().int().positive(),
  playbackRate: z.coerce.number().positive(),
  requestNote: z.string().trim().max(500).optional().default(''),
});

const rejectInputSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

const scheduleInputSchema = z.object({
  scheduledAt: z.coerce.date(),
});

const adminListQuerySchema = z.object({
  status: z.enum(WAKE_SONG_STATUSES).optional(),
  query: z.string().trim().max(100).optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.enum(['status', 'requester', 'videoTitle', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

type WakeSongRow = {
  id: number;
  requesterId: number;
  requesterStudentNo: number;
  requesterName: string;
  requesterGrade: number | null;
  requesterClassNo: number | null;
  requesterNumber: number | null;
  youtubeVideoId: string;
  canonicalUrl: string;
  videoTitle: string;
  channelTitle: string | null;
  videoDurationSeconds: number | null;
  startSeconds: number;
  endSeconds: number;
  playbackRateHundredths: number;
  effectiveDurationSeconds: number;
  requestNote: string;
  status: WakeSongRequestStatus;
  reviewedById: number | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  scheduledAt: Date | null;
  playedAt: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const selectFields = {
  id: schema.wakeSongRequests.id,
  requesterId: schema.wakeSongRequests.requesterId,
  requesterStudentNo: schema.users.studentNo,
  requesterName: schema.users.name,
  requesterGrade: schema.users.grade,
  requesterClassNo: schema.users.classNo,
  requesterNumber: schema.users.number,
  youtubeVideoId: schema.wakeSongRequests.youtubeVideoId,
  canonicalUrl: schema.wakeSongRequests.canonicalUrl,
  videoTitle: schema.wakeSongRequests.videoTitle,
  channelTitle: schema.wakeSongRequests.channelTitle,
  videoDurationSeconds: schema.wakeSongRequests.videoDurationSeconds,
  startSeconds: schema.wakeSongRequests.startSeconds,
  endSeconds: schema.wakeSongRequests.endSeconds,
  playbackRateHundredths: schema.wakeSongRequests.playbackRateHundredths,
  effectiveDurationSeconds: schema.wakeSongRequests.effectiveDurationSeconds,
  requestNote: schema.wakeSongRequests.requestNote,
  status: schema.wakeSongRequests.status,
  reviewedById: schema.wakeSongRequests.reviewedById,
  reviewedAt: schema.wakeSongRequests.reviewedAt,
  rejectionReason: schema.wakeSongRequests.rejectionReason,
  scheduledAt: schema.wakeSongRequests.scheduledAt,
  playedAt: schema.wakeSongRequests.playedAt,
  canceledAt: schema.wakeSongRequests.canceledAt,
  createdAt: schema.wakeSongRequests.createdAt,
  updatedAt: schema.wakeSongRequests.updatedAt,
};

function optionalDate(value: Date | null): string | undefined {
  return value?.toISOString();
}

function toSummary(row: WakeSongRow): WakeSongRequestSummary {
  return {
    id: row.id,
    requesterId: row.requesterId,
    requesterStudentNo: row.requesterStudentNo,
    requesterName: row.requesterName,
    requesterGrade: row.requesterGrade ?? undefined,
    requesterClassNo: row.requesterClassNo ?? undefined,
    requesterNumber: row.requesterNumber ?? undefined,
    youtubeVideoId: row.youtubeVideoId,
    canonicalUrl: row.canonicalUrl,
    embedUrl: `https://www.youtube-nocookie.com/embed/${row.youtubeVideoId}`,
    videoTitle: row.videoTitle,
    channelTitle: row.channelTitle ?? undefined,
    videoDurationSeconds: row.videoDurationSeconds ?? undefined,
    startSeconds: row.startSeconds,
    endSeconds: row.endSeconds,
    playbackRate: row.playbackRateHundredths / 100,
    effectiveDurationSeconds: row.effectiveDurationSeconds,
    requestNote: row.requestNote,
    status: row.status,
    reviewedById: row.reviewedById ?? undefined,
    reviewedAt: optionalDate(row.reviewedAt),
    rejectionReason: row.rejectionReason ?? undefined,
    scheduledAt: optionalDate(row.scheduledAt),
    playedAt: optionalDate(row.playedAt),
    canceledAt: optionalDate(row.canceledAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class WakeSongsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly youtube: YouTubeDataApiService,
  ) {}

  async preview(rawUrl: string) {
    if (!rawUrl || rawUrl.length > 500) {
      throw new BadRequestException('YouTube URL을 입력해 주세요.');
    }
    return this.youtube.inspect(rawUrl);
  }

  async myRequests(session?: AuthSession) {
    const requesterId = this.persistedUserId(session);
    return this.database.query('wake-songs.me', async (db) => {
      const rows = await db
        .select(selectFields)
        .from(schema.wakeSongRequests)
        .innerJoin(schema.users, eq(schema.wakeSongRequests.requesterId, schema.users.id))
        .where(eq(schema.wakeSongRequests.requesterId, requesterId))
        .orderBy(desc(schema.wakeSongRequests.createdAt), desc(schema.wakeSongRequests.id))
        .limit(100);

      const items = rows.map((row) => toSummary(row as WakeSongRow));
      return {
        items,
        pendingCount: items.filter((item) => item.status === 'PENDING').length,
        maxPending: MAX_PENDING_WAKE_SONG_REQUESTS,
      };
    });
  }

  async create(body: unknown, session?: AuthSession) {
    const requesterId = this.persistedUserId(session);
    const input = this.parseRequestInput(body);
    const metadata = await this.youtube.inspect(input.url);
    const segment = this.validateSegment(input, metadata.durationSeconds);

    return this.database.query('wake-songs.create', async (db) =>
      db.transaction(async (tx) => {
        await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.id, requesterId))
          .limit(1)
          .for('update');

        const [countRow] = await tx
          .select({
            count: sql<number>`cast(count(*) as unsigned)`.mapWith(Number),
          })
          .from(schema.wakeSongRequests)
          .where(
            and(
              eq(schema.wakeSongRequests.requesterId, requesterId),
              eq(schema.wakeSongRequests.status, 'PENDING'),
            ),
          );

        if ((countRow?.count ?? 0) >= MAX_PENDING_WAKE_SONG_REQUESTS) {
          throw new ConflictException('승인 대기 중인 기상곡은 최대 3건까지 신청할 수 있습니다.');
        }

        const [result] = await tx
          .insert(schema.wakeSongRequests)
          .values({
            requesterId,
            youtubeVideoId: metadata.videoId,
            canonicalUrl: metadata.canonicalUrl,
            videoTitle: metadata.title.slice(0, 255),
            channelTitle: metadata.channelTitle?.slice(0, 255),
            videoDurationSeconds: metadata.durationSeconds,
            startSeconds: input.startSeconds,
            endSeconds: input.endSeconds,
            playbackRateHundredths: segment.playbackRateHundredths,
            effectiveDurationSeconds: segment.effectiveDurationSeconds,
            requestNote: input.requestNote,
            status: 'PENDING',
            updatedAt: new Date(),
          })
          .$returningId();

        await tx.insert(schema.wakeSongRequestEvents).values({
          wakeSongRequestId: result.id,
          actorId: requesterId,
          type: 'SUBMITTED',
          note: input.requestNote || null,
        });
        await tx.insert(schema.auditLogs).values({
          actorId: requesterId,
          action: 'wake_song.request.create',
          targetType: 'wake_song_requests',
          targetId: String(result.id),
        });

        return { ok: true, id: result.id, status: 'PENDING' as const };
      }),
    );
  }

  async update(id: number, body: unknown, session?: AuthSession) {
    this.assertId(id);
    const requesterId = this.persistedUserId(session);
    const input = this.parseRequestInput(body);
    const metadata = await this.youtube.inspect(input.url);
    const segment = this.validateSegment(input, metadata.durationSeconds);

    return this.database.query('wake-songs.update', async (db) =>
      db.transaction(async (tx) => {
        const [request] = await tx
          .select({ id: schema.wakeSongRequests.id, status: schema.wakeSongRequests.status })
          .from(schema.wakeSongRequests)
          .where(
            and(
              eq(schema.wakeSongRequests.id, id),
              eq(schema.wakeSongRequests.requesterId, requesterId),
            ),
          )
          .limit(1)
          .for('update');

        if (!request) throw new NotFoundException('기상곡 신청을 찾을 수 없습니다.');
        if (request.status !== 'PENDING') {
          throw new ConflictException('승인 대기 중인 신청만 수정할 수 있습니다.');
        }

        await tx
          .update(schema.wakeSongRequests)
          .set({
            youtubeVideoId: metadata.videoId,
            canonicalUrl: metadata.canonicalUrl,
            videoTitle: metadata.title.slice(0, 255),
            channelTitle: metadata.channelTitle?.slice(0, 255),
            videoDurationSeconds: metadata.durationSeconds,
            startSeconds: input.startSeconds,
            endSeconds: input.endSeconds,
            playbackRateHundredths: segment.playbackRateHundredths,
            effectiveDurationSeconds: segment.effectiveDurationSeconds,
            requestNote: input.requestNote,
            updatedAt: new Date(),
          })
          .where(eq(schema.wakeSongRequests.id, id));
        await tx.insert(schema.wakeSongRequestEvents).values({
          wakeSongRequestId: id,
          actorId: requesterId,
          type: 'UPDATED',
        });
        await tx.insert(schema.auditLogs).values({
          actorId: requesterId,
          action: 'wake_song.request.update',
          targetType: 'wake_song_requests',
          targetId: String(id),
        });

        return { ok: true, id, status: 'PENDING' as const };
      }),
    );
  }

  async cancel(id: number, session?: AuthSession) {
    this.assertId(id);
    const requesterId = this.persistedUserId(session);

    return this.database.query('wake-songs.cancel', async (db) =>
      db.transaction(async (tx) => {
        const [request] = await tx
          .select({ status: schema.wakeSongRequests.status })
          .from(schema.wakeSongRequests)
          .where(
            and(
              eq(schema.wakeSongRequests.id, id),
              eq(schema.wakeSongRequests.requesterId, requesterId),
            ),
          )
          .limit(1)
          .for('update');

        if (!request) throw new NotFoundException('기상곡 신청을 찾을 수 없습니다.');
        if (request.status !== 'PENDING') {
          throw new ConflictException('승인 대기 중인 신청만 취소할 수 있습니다.');
        }

        const now = new Date();
        await tx
          .update(schema.wakeSongRequests)
          .set({ status: 'CANCELED', canceledAt: now, updatedAt: now })
          .where(eq(schema.wakeSongRequests.id, id));
        await this.recordTransition(tx, id, requesterId, 'CANCELED', 'wake_song.request.cancel');

        return { ok: true, id, status: 'CANCELED' as const };
      }),
    );
  }

  async adminList(rawQuery: unknown): Promise<WakeSongPage> {
    const parsed = adminListQuerySchema.safeParse(rawQuery ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const { status, query, page, pageSize, sortBy, sortOrder } = parsed.data;

    return this.database.query('wake-songs.admin-list', async (db) => {
      const conditions = [];
      if (status === 'APPROVED') {
        conditions.push(
          inArray(schema.wakeSongRequests.status, ['APPROVED', 'SCHEDULED', 'PLAYED']),
        );
      } else if (status === 'REJECTED') {
        conditions.push(inArray(schema.wakeSongRequests.status, ['REJECTED', 'CANCELED']));
      } else if (status) {
        conditions.push(eq(schema.wakeSongRequests.status, status));
      }
      if (query) {
        const pattern = `%${query}%`;
        conditions.push(
          or(
            like(schema.wakeSongRequests.videoTitle, pattern),
            like(schema.wakeSongRequests.requestNote, pattern),
            like(schema.users.name, pattern),
          )!,
        );
      }
      const where = conditions.length ? and(...conditions) : undefined;
      const direction = sortOrder === 'asc' ? asc : desc;
      const sortColumn =
        sortBy === 'status'
          ? schema.wakeSongRequests.status
          : sortBy === 'requester'
            ? schema.users.name
            : sortBy === 'videoTitle'
              ? schema.wakeSongRequests.videoTitle
              : schema.wakeSongRequests.createdAt;

      const [countRow] = await db
        .select({ total: sql<number>`cast(count(*) as unsigned)`.mapWith(Number) })
        .from(schema.wakeSongRequests)
        .innerJoin(schema.users, eq(schema.wakeSongRequests.requesterId, schema.users.id))
        .where(where);
      const total = countRow?.total ?? 0;

      const rows = await db
        .select(selectFields)
        .from(schema.wakeSongRequests)
        .innerJoin(schema.users, eq(schema.wakeSongRequests.requesterId, schema.users.id))
        .where(where)
        .orderBy(direction(sortColumn), desc(schema.wakeSongRequests.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return {
        items: rows.map((row) => toSummary(row as WakeSongRow)),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    });
  }

  approve(id: number, actorId?: number | null) {
    return this.reviewTransition(id, actorId, 'APPROVED');
  }

  async reject(id: number, body: unknown, actorId?: number | null) {
    const parsed = rejectInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    return this.reviewTransition(id, actorId, 'REJECTED', parsed.data.reason);
  }

  async schedule(id: number, body: unknown, actorId?: number | null) {
    this.assertId(id);
    const reviewerId = this.persistedActorId(actorId);
    const parsed = scheduleInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);

    return this.database.query('wake-songs.schedule', async (db) =>
      db.transaction(async (tx) => {
        const [request] = await tx
          .select({ status: schema.wakeSongRequests.status })
          .from(schema.wakeSongRequests)
          .where(eq(schema.wakeSongRequests.id, id))
          .limit(1)
          .for('update');

        if (!request) throw new NotFoundException('기상곡 신청을 찾을 수 없습니다.');
        if (request.status !== 'APPROVED' && request.status !== 'SCHEDULED') {
          throw new ConflictException('승인된 신청만 편성할 수 있습니다.');
        }

        await tx
          .update(schema.wakeSongRequests)
          .set({
            status: 'SCHEDULED',
            scheduledAt: parsed.data.scheduledAt,
            updatedAt: new Date(),
          })
          .where(eq(schema.wakeSongRequests.id, id));
        await this.recordTransition(
          tx,
          id,
          reviewerId,
          'SCHEDULED',
          'wake_song.request.schedule',
          parsed.data.scheduledAt.toISOString(),
        );

        return {
          ok: true,
          id,
          status: 'SCHEDULED' as const,
          scheduledAt: parsed.data.scheduledAt.toISOString(),
        };
      }),
    );
  }

  async markPlayed(id: number, actorId?: number | null) {
    this.assertId(id);
    const reviewerId = this.persistedActorId(actorId);

    return this.database.query('wake-songs.played', async (db) =>
      db.transaction(async (tx) => {
        const [request] = await tx
          .select({ status: schema.wakeSongRequests.status })
          .from(schema.wakeSongRequests)
          .where(eq(schema.wakeSongRequests.id, id))
          .limit(1)
          .for('update');

        if (!request) throw new NotFoundException('기상곡 신청을 찾을 수 없습니다.');
        if (request.status !== 'SCHEDULED') {
          throw new ConflictException('편성된 신청만 재생 완료로 처리할 수 있습니다.');
        }

        const now = new Date();
        await tx
          .update(schema.wakeSongRequests)
          .set({ status: 'PLAYED', playedAt: now, updatedAt: now })
          .where(eq(schema.wakeSongRequests.id, id));
        await this.recordTransition(tx, id, reviewerId, 'PLAYED', 'wake_song.request.played');

        return { ok: true, id, status: 'PLAYED' as const, playedAt: now.toISOString() };
      }),
    );
  }

  private async reviewTransition(
    id: number,
    actorId: number | null | undefined,
    nextStatus: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    this.assertId(id);
    const reviewerId = this.persistedActorId(actorId);

    return this.database.query(`wake-songs.${nextStatus.toLowerCase()}`, async (db) =>
      db.transaction(async (tx) => {
        const [request] = await tx
          .select({ status: schema.wakeSongRequests.status })
          .from(schema.wakeSongRequests)
          .where(eq(schema.wakeSongRequests.id, id))
          .limit(1)
          .for('update');

        if (!request) throw new NotFoundException('기상곡 신청을 찾을 수 없습니다.');
        if (request.status !== 'PENDING') {
          throw new ConflictException('승인 대기 중인 신청만 검토할 수 있습니다.');
        }

        const now = new Date();
        await tx
          .update(schema.wakeSongRequests)
          .set({
            status: nextStatus,
            reviewedById: reviewerId,
            reviewedAt: now,
            rejectionReason: nextStatus === 'REJECTED' ? reason : null,
            updatedAt: now,
          })
          .where(eq(schema.wakeSongRequests.id, id));
        await this.recordTransition(
          tx,
          id,
          reviewerId,
          nextStatus,
          `wake_song.request.${nextStatus.toLowerCase()}`,
          reason,
        );

        return {
          ok: true,
          id,
          status: nextStatus,
          reviewedAt: now.toISOString(),
          rejectionReason: reason,
        };
      }),
    );
  }

  private async recordTransition(
    tx: Pick<AppDatabase, 'insert'>,
    id: number,
    actorId: number,
    type: 'APPROVED' | 'REJECTED' | 'SCHEDULED' | 'PLAYED' | 'CANCELED',
    auditAction: string,
    note?: string,
  ) {
    await tx.insert(schema.wakeSongRequestEvents).values({
      wakeSongRequestId: id,
      actorId,
      type,
      note: note || null,
    });
    await tx.insert(schema.auditLogs).values({
      actorId,
      action: auditAction,
      targetType: 'wake_song_requests',
      targetId: String(id),
    });
  }

  private parseRequestInput(body: unknown) {
    const parsed = requestInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    return parsed.data;
  }

  private validateSegment(
    input: z.infer<typeof requestInputSchema>,
    videoDurationSeconds?: number,
  ) {
    try {
      return validateWakeSongSegment({
        startSeconds: input.startSeconds,
        endSeconds: input.endSeconds,
        playbackRate: input.playbackRate,
        videoDurationSeconds,
      });
    } catch (error) {
      if (error instanceof WakeSongPolicyError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private persistedUserId(session?: AuthSession): number {
    return this.persistedActorId(session?.userId);
  }

  private persistedActorId(actorId?: number | null): number {
    if (!actorId || actorId <= 0) {
      throw new BadRequestException('저장된 사용자 계정이 필요합니다.');
    }
    return actorId;
  }

  private assertId(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('기상곡 신청 번호가 올바르지 않습니다.');
    }
  }
}
