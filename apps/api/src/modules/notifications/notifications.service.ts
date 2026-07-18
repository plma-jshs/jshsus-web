import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as schema from '@jshsus/db';
import type {
  NotificationItem,
  NotificationListResponse,
  NotificationMetadata,
  NotificationType,
} from '@jshsus/types';
import { and, count, desc, eq, gt, isNull, lte } from 'drizzle-orm';
import type { AppDatabase } from '../database/database.service';
import { DatabaseService } from '../database/database.service';

const MAX_NOTIFICATIONS = 30;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

export type NotificationTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];

export type CreateNotificationInput = {
  userId: number;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  metadata?: NotificationMetadata | null;
  /**
   * Stable event identity without the recipient id. The service scopes this
   * value by userId before persisting it.
   */
  dedupeKey?: string | null;
  expiresAt?: Date;
};

type NotificationRow = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
};

function isDuplicateEntry(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; errno?: unknown; cause?: unknown };
  if (candidate.code === 'ER_DUP_ENTRY' || candidate.errno === 1062) return true;
  return candidate.cause ? isDuplicateEntry(candidate.cause) : false;
}

function expiresOneWeekAfter(date: Date): Date {
  return new Date(date.getTime() + RETENTION_MS);
}

function toNotificationItem(row: NotificationRow): NotificationItem {
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body ?? undefined,
    link: row.link ?? undefined,
    metadata: row.metadata ?? undefined,
    isRead: row.readAt !== null,
    readAt: row.readAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

function requireUserId(userId?: number | null): number {
  if (!userId || !Number.isSafeInteger(userId) || userId <= 0) {
    throw new UnauthorizedException('로그인이 필요합니다.');
  }
  return userId;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly database: DatabaseService) {}

  async createForUser(
    input: CreateNotificationInput,
    transaction?: NotificationTransaction,
  ): Promise<NotificationItem> {
    if (!Number.isSafeInteger(input.userId) || input.userId <= 0) {
      throw new BadRequestException('알림 수신 사용자가 올바르지 않습니다.');
    }

    const title = input.title.trim();
    if (!title || title.length > 160) {
      throw new BadRequestException('알림 제목은 1~160자로 입력해야 합니다.');
    }
    if (input.body && input.body.length > 500) {
      throw new BadRequestException('알림 내용은 500자 이하여야 합니다.');
    }
    if (input.link && input.link.length > 500) {
      throw new BadRequestException('알림 링크는 500자 이하여야 합니다.');
    }
    if (input.dedupeKey && input.dedupeKey.length > 170) {
      throw new BadRequestException('알림 중복 방지 키가 너무 깁니다.');
    }

    const now = new Date();
    const expiresAt = input.expiresAt ?? expiresOneWeekAfter(now);
    const dedupeKey = input.dedupeKey ? `${input.userId}:${input.dedupeKey}` : null;
    const executor = transaction ?? this.database.db;

    try {
      const [inserted] = await executor
        .insert(schema.notifications)
        .values({
          userId: input.userId,
          type: input.type,
          title,
          body: input.body?.trim() || null,
          link: input.link?.trim() || null,
          metadata: input.metadata ?? null,
          dedupeKey,
          expiresAt,
        })
        .$returningId();

      if (!inserted) throw new Error('알림 생성 결과를 확인할 수 없습니다.');

      return {
        id: inserted.id,
        type: input.type,
        title,
        body: input.body?.trim() || undefined,
        link: input.link?.trim() || undefined,
        metadata: input.metadata ?? undefined,
        isRead: false,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      if (!dedupeKey || !isDuplicateEntry(error)) throw error;

      const [existing] = await executor
        .select({
          id: schema.notifications.id,
          type: schema.notifications.type,
          title: schema.notifications.title,
          body: schema.notifications.body,
          link: schema.notifications.link,
          metadata: schema.notifications.metadata,
          readAt: schema.notifications.readAt,
          createdAt: schema.notifications.createdAt,
          expiresAt: schema.notifications.expiresAt,
        })
        .from(schema.notifications)
        .where(eq(schema.notifications.dedupeKey, dedupeKey))
        .limit(1);

      if (!existing) throw error;
      return toNotificationItem(existing);
    }
  }

  async listForUser(userId?: number | null): Promise<NotificationListResponse> {
    const recipientId = requireUserId(userId);
    const now = new Date();
    const activeCondition = and(
      eq(schema.notifications.userId, recipientId),
      gt(schema.notifications.expiresAt, now),
    );

    return this.database.query('notifications.list', async (db) => {
      const [rows, unreadRows] = await Promise.all([
        db
          .select({
            id: schema.notifications.id,
            type: schema.notifications.type,
            title: schema.notifications.title,
            body: schema.notifications.body,
            link: schema.notifications.link,
            metadata: schema.notifications.metadata,
            readAt: schema.notifications.readAt,
            createdAt: schema.notifications.createdAt,
            expiresAt: schema.notifications.expiresAt,
          })
          .from(schema.notifications)
          .where(activeCondition)
          .orderBy(desc(schema.notifications.createdAt), desc(schema.notifications.id))
          .limit(MAX_NOTIFICATIONS),
        db
          .select({ value: count() })
          .from(schema.notifications)
          .where(and(activeCondition, isNull(schema.notifications.readAt))),
      ]);

      return {
        items: rows.map(toNotificationItem),
        unreadCount: Number(unreadRows[0]?.value ?? 0),
      };
    });
  }

  async markRead(id: number, userId?: number | null): Promise<{ ok: true }> {
    const recipientId = requireUserId(userId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException('알림 번호가 올바르지 않습니다.');
    }
    const now = new Date();
    const activeOwnedCondition = and(
      eq(schema.notifications.id, id),
      eq(schema.notifications.userId, recipientId),
      gt(schema.notifications.expiresAt, now),
    );

    return this.database.query('notifications.read', async (db) => {
      const [owned] = await db
        .select({ id: schema.notifications.id, readAt: schema.notifications.readAt })
        .from(schema.notifications)
        .where(activeOwnedCondition)
        .limit(1);
      if (!owned) throw new NotFoundException('알림을 찾을 수 없습니다.');

      if (!owned.readAt) {
        await db
          .update(schema.notifications)
          .set({ readAt: now, updatedAt: now })
          .where(activeOwnedCondition);
      }
      return { ok: true };
    });
  }

  async markAllRead(userId?: number | null): Promise<{ ok: true }> {
    const recipientId = requireUserId(userId);
    const now = new Date();
    await this.database.query('notifications.read-all', (db) =>
      db
        .update(schema.notifications)
        .set({ readAt: now, updatedAt: now })
        .where(
          and(
            eq(schema.notifications.userId, recipientId),
            isNull(schema.notifications.readAt),
            gt(schema.notifications.expiresAt, now),
          ),
        ),
    );
    return { ok: true };
  }

  async deleteExpired(now = new Date()): Promise<void> {
    await this.database.query('notifications.cleanup', (db) =>
      db.delete(schema.notifications).where(lte(schema.notifications.expiresAt, now)),
    );
  }
}
