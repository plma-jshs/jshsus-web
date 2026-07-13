import {
  BadRequestException,
  ConflictException,
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
  itemName: z.string().min(1).max(160),
  location: z.string().max(160).optional().default(''),
  occurredAt: z.coerce.date().optional(),
  description: z.string().max(2000).optional().default(''),
});
const lostItemStatusSchema = z.object({ status: z.enum(['open', 'matched', 'closed', 'hidden']) });

type LostItemRow = {
  id: number;
  type: LostItemSummary['type'];
  itemName: string;
  location: string | null;
  occurredAt: Date | null;
  description: string | null;
  status: LostItemSummary['status'];
  authorName: string | null;
};

function toSummary(row: LostItemRow, attachments: LostItemDetail['attachments']): LostItemDetail {
  return {
    id: row.id,
    type: row.type,
    itemName: row.itemName,
    location: row.location ?? '',
    occurredAt: row.occurredAt?.toISOString(),
    description: row.description ?? undefined,
    status: row.status,
    authorName: row.authorName ?? undefined,
    attachments,
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

  async getById(id: number): Promise<LostItemDetail> {
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
        })
        .from(schema.lostItems)
        .leftJoin(schema.users, eq(schema.lostItems.authorId, schema.users.id))
        .where(and(eq(schema.lostItems.id, id), ne(schema.lostItems.status, 'hidden')))
        .limit(1);

      if (!row) {
        throw new NotFoundException('Lost item does not exist.');
      }

      const attachments = await this.filesService.listForTarget('lost_item', id);
      return toSummary(row, attachments);
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
      return { ok: true, lostItem: { id: result.id, status: 'open', ...parsed.data } };
    });
  }

  async discard(id: number, actorId?: number | null) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Lost item id must be a positive integer.');
    }
    if (!actorId || actorId <= 0) {
      throw new ForbiddenException('A persisted account is required to discard a lost item.');
    }

    return this.database.query('lost-items.discard', async (db) => {
      await db.transaction(async (tx) => {
        const [item] = await tx
          .select({
            id: schema.lostItems.id,
            authorId: schema.lostItems.authorId,
            status: schema.lostItems.status,
          })
          .from(schema.lostItems)
          .where(eq(schema.lostItems.id, id))
          .limit(1)
          .for('update');

        if (!item) {
          throw new NotFoundException('Lost item does not exist.');
        }
        if (item.authorId !== actorId) {
          throw new ForbiddenException('Only the author can discard this lost item.');
        }
        if (item.status !== 'open') {
          throw new ConflictException('Only open lost items can be discarded.');
        }

        await this.filesService.enqueueForTarget(
          'lost_item',
          id,
          'lost_item_discard',
          tx as unknown as AppDatabase,
        );
        await tx
          .delete(schema.lostItems)
          .where(
            and(
              eq(schema.lostItems.id, id),
              eq(schema.lostItems.authorId, actorId),
              eq(schema.lostItems.status, 'open'),
            ),
          );
        await tx.insert(schema.auditLogs).values({
          actorId,
          action: 'lost-item.discard',
          targetType: 'lost_items',
          targetId: String(id),
        });
      });

      // The cleanup outbox committed with the parent row and audit event. This
      // immediate pass improves responsiveness; the worker owns every retry.
      const cleanup = await this.filesService.deleteForTarget('lost_item', id);
      return { ok: true, id, cleanupPending: cleanup.failed > 0 };
    });
  }

  async updateStatus(id: number, body: unknown, actorId?: number | null) {
    const parsed = lostItemStatusSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);

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
}
