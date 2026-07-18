import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as schema from '@jshsus/db';
import type { LostItemDetail, LostItemSummary } from '@jshsus/types';
import { and, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { type AppDatabase, DatabaseService } from '../database/database.service';
import { FilesService } from '../files/files.service';

const lostItemSchema = z.object({
  type: z.enum(['lost', 'found']),
  itemName: z.string().trim().min(1).max(160),
  location: z.string().trim().max(160).optional().default(''),
  occurredAt: z.coerce.date().optional(),
  description: z.string().trim().max(2000).optional().default(''),
});
const lostItemUpdateSchema = lostItemSchema
  .partial()
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    'At least one field is required.',
  );
const lostItemStatusSchema = z.object({ status: z.enum(['PROCESSING', 'RETURNED']) });

type StoredLostItemStatus = 'open' | 'matched' | 'closed' | 'hidden';

function toPublicStatus(status: StoredLostItemStatus): LostItemSummary['status'] {
  return status === 'closed' || status === 'hidden' ? 'RETURNED' : 'PROCESSING';
}

function toStoredStatus(status: LostItemSummary['status']): StoredLostItemStatus {
  return status === 'RETURNED' ? 'closed' : 'open';
}

type LostItemRow = {
  id: number;
  type: LostItemSummary['type'];
  itemName: string;
  location: string | null;
  occurredAt: Date | null;
  description: string | null;
  status: StoredLostItemStatus;
  authorId: number | null;
  authorName: string | null;
};

function toSummary(
  row: LostItemRow,
  attachments: LostItemDetail['attachments'],
  actorId?: number | null,
): LostItemDetail {
  return {
    id: row.id,
    type: row.type,
    itemName: row.itemName,
    location: row.location ?? '',
    occurredAt: row.occurredAt?.toISOString(),
    description: row.description ?? undefined,
    status: toPublicStatus(row.status),
    authorName: row.authorName ?? undefined,
    attachments,
    canEdit: Boolean(actorId && row.authorId === actorId),
  };
}

@Injectable()
export class LostItemsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly filesService: FilesService,
  ) {}

  async list(limit = 50, includeHidden = false): Promise<LostItemSummary[]> {
    return this.database.query('lost-items.list', async (db) => {
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
          authorId: schema.lostItems.authorId,
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
      return rows.map((row) => toSummary(row, attachments.get(row.id) ?? []));
    });
  }

  async getById(id: number, actorId?: number | null): Promise<LostItemDetail> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Lost item id must be a positive integer.');
    }

    return this.database.query<LostItemDetail>('lost-items.detail', async (db) => {
      const [row] = await db
        .select({
          id: schema.lostItems.id,
          type: schema.lostItems.type,
          itemName: schema.lostItems.itemName,
          location: schema.lostItems.location,
          occurredAt: schema.lostItems.occurredAt,
          description: schema.lostItems.description,
          status: schema.lostItems.status,
          authorName: schema.users.name,
          authorId: schema.lostItems.authorId,
        })
        .from(schema.lostItems)
        .leftJoin(schema.users, eq(schema.lostItems.authorId, schema.users.id))
        .where(and(eq(schema.lostItems.id, id), ne(schema.lostItems.status, 'hidden')))
        .limit(1);

      if (!row) {
        throw new NotFoundException('Lost item does not exist.');
      }

      const attachments = await this.filesService.listForTarget('lost_item', id);
      return toSummary(row, attachments, actorId);
    });
  }

  async create(body: unknown, actorId?: number | null) {
    const parsed = lostItemSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);

    return this.database.query('lost-items.create', async (db) => {
      const [result] = await db
        .insert(schema.lostItems)
        .values({ ...parsed.data, authorId: actorId && actorId > 0 ? actorId : null })
        .$returningId();
      await this.database.writeAudit({
        actorId,
        action: 'lost-item.create',
        targetType: 'lost_items',
        targetId: result.id,
      });
      return {
        ok: true,
        lostItem: { id: result.id, status: 'PROCESSING' as const, ...parsed.data },
      };
    });
  }

  async update(id: number, body: unknown, actorId?: number | null, canManage = false) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Lost item id must be a positive integer.');
    }
    if (!actorId || actorId <= 0) {
      throw new ForbiddenException('A persisted account is required to update a lost item.');
    }
    const parsed = lostItemUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);

    return this.database.query('lost-items.update', async (db) => {
      const [item] = await db
        .select({ authorId: schema.lostItems.authorId })
        .from(schema.lostItems)
        .where(eq(schema.lostItems.id, id))
        .limit(1);
      if (!item) throw new NotFoundException('Lost item does not exist.');
      if (!canManage && item.authorId !== actorId) {
        throw new ForbiddenException('Only the author can update this lost item.');
      }

      await db
        .update(schema.lostItems)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(schema.lostItems.id, id));
      await this.database.writeAudit({
        actorId,
        action: 'lost-item.update',
        targetType: 'lost_items',
        targetId: id,
      });
      return { ok: true as const, id };
    });
  }

  async discard(id: number, actorId?: number | null, canManage = false) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Lost item id must be a positive integer.');
    }
    if (!actorId || actorId <= 0) {
      throw new ForbiddenException('A persisted account is required to delete a lost item.');
    }

    return this.database.query('lost-items.discard', async (db) => {
      await db.transaction(async (tx) => {
        const [item] = await tx
          .select({
            id: schema.lostItems.id,
            authorId: schema.lostItems.authorId,
          })
          .from(schema.lostItems)
          .where(eq(schema.lostItems.id, id))
          .limit(1)
          .for('update');

        if (!item) throw new NotFoundException('Lost item does not exist.');
        if (!canManage && item.authorId !== actorId) {
          throw new ForbiddenException('Only the author can delete this lost item.');
        }

        await this.filesService.enqueueForTarget(
          'lost_item',
          id,
          'lost_item_discard',
          tx as unknown as AppDatabase,
        );
        await tx.delete(schema.lostItems).where(eq(schema.lostItems.id, id));
        await tx.insert(schema.auditLogs).values({
          actorId,
          action: 'lost-item.delete',
          targetType: 'lost_items',
          targetId: String(id),
        });
      });

      const cleanup = await this.filesService.deleteForTarget('lost_item', id);
      return { ok: true as const, id, cleanupPending: cleanup.failed > 0 };
    });
  }

  async updateStatus(id: number, body: unknown, actorId?: number | null, canManage = false) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Lost item id must be a positive integer.');
    }
    if (!actorId || actorId <= 0) {
      throw new ForbiddenException('A persisted account is required to update a lost item.');
    }
    const parsed = lostItemStatusSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);

    return this.database.query('lost-items.status', async (db) => {
      const [item] = await db
        .select({ authorId: schema.lostItems.authorId })
        .from(schema.lostItems)
        .where(eq(schema.lostItems.id, id))
        .limit(1);
      if (!item) throw new NotFoundException('Lost item does not exist.');
      if (!canManage && item.authorId !== actorId) {
        throw new ForbiddenException('Only the author can update this lost item.');
      }

      await db
        .update(schema.lostItems)
        .set({ status: toStoredStatus(parsed.data.status), updatedAt: new Date() })
        .where(eq(schema.lostItems.id, id));
      await this.database.writeAudit({
        actorId,
        action: 'lost-item.status',
        targetType: 'lost_items',
        targetId: id,
      });
      return { ok: true as const, id, status: parsed.data.status };
    });
  }
}
