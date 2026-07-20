import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as schema from '@jshsus/db';
import type { PetitionDetail, PetitionSummary, RichTextDocument } from '@jshsus/types';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { parsePetitionCreate, parsePetitionUpdate } from './petition-content';

const PETITION_THRESHOLD = 50;

const answerSchema = z.object({
  content: z.string().min(1),
});

type PetitionRow = {
  id: number;
  title: string;
  content: string;
  contentJson: unknown;
  authorId: number | null;
  authorName: string | null;
  participantCount: number;
  startsAt: Date;
  endsAt: Date;
  status: PetitionSummary['status'];
  createdAt: Date;
};

type PetitionAnswerRow = {
  petitionId: number;
  content: string;
  authorName: string | null;
  answeredAt: Date;
};

function toPetitionSummary(row: PetitionRow, answer?: PetitionAnswerRow): PetitionSummary {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    contentDoc: (row.contentJson as RichTextDocument | null) ?? undefined,
    authorName: row.authorName ?? undefined,
    participantCount: row.participantCount,
    threshold: PETITION_THRESHOLD,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status === 'open' && row.endsAt < new Date() ? 'expired' : row.status,
    answer: answer
      ? {
          content: answer.content,
          authorName: answer.authorName ?? undefined,
          answeredAt: answer.answeredAt.toISOString(),
        }
      : undefined,
  };
}

@Injectable()
export class PetitionsService {
  constructor(private readonly database: DatabaseService) {}

  async list(): Promise<PetitionSummary[]> {
    return this.database.query<PetitionSummary[]>('petitions.list', async (db) => {
      const [petitions, answers] = await Promise.all([
        db
          .select({
            id: schema.petitions.id,
            title: schema.petitions.title,
            content: schema.petitions.content,
            contentJson: schema.petitions.contentJson,
            authorId: schema.petitions.authorId,
            authorName: schema.users.name,
            participantCount: schema.petitions.participantCount,
            startsAt: schema.petitions.startsAt,
            endsAt: schema.petitions.endsAt,
            status: schema.petitions.status,
            createdAt: schema.petitions.createdAt,
          })
          .from(schema.petitions)
          .leftJoin(schema.users, eq(schema.petitions.authorId, schema.users.id))
          .where(ne(schema.petitions.status, 'hidden'))
          .orderBy(desc(schema.petitions.createdAt))
          .limit(50),
        db
          .select({
            petitionId: schema.petitionAnswers.petitionId,
            content: schema.petitionAnswers.content,
            authorName: schema.users.name,
            answeredAt: schema.petitionAnswers.answeredAt,
          })
          .from(schema.petitionAnswers)
          .leftJoin(schema.users, eq(schema.petitionAnswers.authorId, schema.users.id))
          .orderBy(desc(schema.petitionAnswers.answeredAt)),
      ]);

      const answerByPetition = new Map<number, (typeof answers)[number]>();

      for (const answer of answers) {
        if (!answerByPetition.has(answer.petitionId)) {
          answerByPetition.set(answer.petitionId, answer);
        }
      }

      return petitions.map((row) => toPetitionSummary(row, answerByPetition.get(row.id)));
    });
  }

  async getById(id: number, actorId?: number | null): Promise<PetitionDetail> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Petition id must be a positive integer.');
    }

    return this.database.query<PetitionDetail>('petitions.detail', async (db) => {
      const [petition] = await db
        .select({
          id: schema.petitions.id,
          title: schema.petitions.title,
          content: schema.petitions.content,
          contentJson: schema.petitions.contentJson,
          authorId: schema.petitions.authorId,
          authorName: schema.users.name,
          participantCount: schema.petitions.participantCount,
          startsAt: schema.petitions.startsAt,
          endsAt: schema.petitions.endsAt,
          status: schema.petitions.status,
          createdAt: schema.petitions.createdAt,
        })
        .from(schema.petitions)
        .leftJoin(schema.users, eq(schema.petitions.authorId, schema.users.id))
        .where(and(eq(schema.petitions.id, id), ne(schema.petitions.status, 'hidden')))
        .limit(1);

      if (!petition) {
        throw new NotFoundException('Petition does not exist.');
      }

      const [answer] = await db
        .select({
          petitionId: schema.petitionAnswers.petitionId,
          content: schema.petitionAnswers.content,
          authorName: schema.users.name,
          answeredAt: schema.petitionAnswers.answeredAt,
        })
        .from(schema.petitionAnswers)
        .leftJoin(schema.users, eq(schema.petitionAnswers.authorId, schema.users.id))
        .where(eq(schema.petitionAnswers.petitionId, id))
        .orderBy(desc(schema.petitionAnswers.answeredAt))
        .limit(1);

      const summary = toPetitionSummary(petition, answer);
      return {
        ...summary,
        canEdit: Boolean(actorId && actorId > 0 && petition.authorId === actorId),
      };
    });
  }

  async create(body: unknown, actorId?: number | null) {
    const parsed = parsePetitionCreate(body);

    if (parsed.startsAt >= parsed.endsAt) {
      throw new BadRequestException('Petition end time must be later than start time.');
    }

    return this.database.query('petitions.create', async (db) => {
      const [result] = await db
        .insert(schema.petitions)
        .values({
          authorId: actorId && actorId > 0 ? actorId : null,
          title: parsed.title,
          content: parsed.content,
          contentJson: parsed.contentDoc,
          startsAt: parsed.startsAt,
          endsAt: parsed.endsAt,
          status: 'open',
          updatedAt: new Date(),
        })
        .$returningId();

      await this.database.writeAudit({
        actorId,
        action: 'petition.create',
        targetType: 'petitions',
        targetId: result.id,
      });

      return { ok: true, petition: { id: result.id, ...parsed, status: 'open' } };
    });
  }

  async participate(id: number, actorId?: number | null) {
    return this.database.query('petitions.participate', async (db) => {
      if (!actorId || actorId <= 0) {
        throw new BadRequestException('A persisted actor is required for petition participation.');
      }

      return db.transaction(async (tx) => {
        const [petition] = await tx
          .select({
            id: schema.petitions.id,
            status: schema.petitions.status,
            participantCount: schema.petitions.participantCount,
            endsAt: schema.petitions.endsAt,
          })
          .from(schema.petitions)
          .where(eq(schema.petitions.id, id))
          .limit(1)
          .for('update');

        if (!petition) {
          throw new NotFoundException('Petition does not exist.');
        }

        if (petition.status !== 'open' || petition.endsAt < new Date()) {
          throw new ConflictException('Petition is not open for participation.');
        }

        const [existing] = await tx
          .select({ petitionId: schema.petitionParticipants.petitionId })
          .from(schema.petitionParticipants)
          .where(
            and(
              eq(schema.petitionParticipants.petitionId, id),
              eq(schema.petitionParticipants.userId, actorId),
            ),
          )
          .limit(1);

        if (existing) {
          return { ok: true, id, participated: false, participantCount: petition.participantCount };
        }

        const nextCount = petition.participantCount + 1;
        const nextStatus = nextCount >= PETITION_THRESHOLD ? 'awaiting_answer' : 'open';

        await tx.insert(schema.petitionParticipants).values({ petitionId: id, userId: actorId });
        await tx
          .update(schema.petitions)
          .set({
            participantCount: sql`${schema.petitions.participantCount} + 1`,
            status: nextStatus,
            updatedAt: new Date(),
          })
          .where(eq(schema.petitions.id, id));
        await tx.insert(schema.auditLogs).values({
          actorId,
          action: 'petition.participate',
          targetType: 'petitions',
          targetId: String(id),
        });

        return {
          ok: true,
          id,
          participated: true,
          participantCount: nextCount,
          status: nextStatus,
        };
      });
    });
  }

  async update(id: number, body: unknown, actorId?: number | null) {
    const parsed = parsePetitionUpdate(body);
    this.assertActor(actorId);

    return this.database.query('petitions.update', async (db) =>
      db.transaction(async (tx) => {
        const [petition] = await tx
          .select({
            id: schema.petitions.id,
            authorId: schema.petitions.authorId,
            status: schema.petitions.status,
            participantCount: schema.petitions.participantCount,
          })
          .from(schema.petitions)
          .where(and(eq(schema.petitions.id, id), ne(schema.petitions.status, 'hidden')))
          .limit(1)
          .for('update');

        if (!petition) throw new NotFoundException('Petition does not exist.');
        if (petition.authorId !== actorId) {
          throw new ForbiddenException('You cannot modify this petition.');
        }
        if (petition.status !== 'open' || petition.participantCount > 0) {
          throw new ConflictException('Petitions can only be edited before participation starts.');
        }

        await tx
          .update(schema.petitions)
          .set({
            ...(parsed.title !== undefined ? { title: parsed.title } : {}),
            ...(parsed.content !== undefined ? { content: parsed.content } : {}),
            ...(parsed.contentDoc !== undefined ? { contentJson: parsed.contentDoc } : {}),
            updatedAt: new Date(),
          })
          .where(eq(schema.petitions.id, id));
        await tx.insert(schema.auditLogs).values({
          actorId,
          action: 'petition.update',
          targetType: 'petitions',
          targetId: String(id),
        });

        return { ok: true as const, id };
      }),
    );
  }

  async delete(id: number, actorId?: number | null) {
    this.assertActor(actorId);

    return this.database.query('petitions.delete', async (db) =>
      db.transaction(async (tx) => {
        const [petition] = await tx
          .select({
            id: schema.petitions.id,
            authorId: schema.petitions.authorId,
            status: schema.petitions.status,
          })
          .from(schema.petitions)
          .where(and(eq(schema.petitions.id, id), ne(schema.petitions.status, 'hidden')))
          .limit(1)
          .for('update');

        if (!petition) throw new NotFoundException('Petition does not exist.');
        if (petition.authorId !== actorId) {
          throw new ForbiddenException('You cannot modify this petition.');
        }

        await tx
          .update(schema.petitions)
          .set({ status: 'hidden', updatedAt: new Date() })
          .where(eq(schema.petitions.id, id));
        await tx.insert(schema.auditLogs).values({
          actorId,
          action: 'petition.delete',
          targetType: 'petitions',
          targetId: String(id),
        });

        return { ok: true as const, id };
      }),
    );
  }

  async answer(id: number, body: unknown, actorId?: number | null) {
    const parsed = answerSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    return this.database.query('petitions.answer', async (db) => {
      if (!actorId || actorId <= 0) {
        throw new BadRequestException('A persisted answer author is required.');
      }

      return db.transaction(async (tx) => {
        const [petition] = await tx
          .select({ status: schema.petitions.status })
          .from(schema.petitions)
          .where(eq(schema.petitions.id, id))
          .limit(1)
          .for('update');

        if (!petition) {
          throw new NotFoundException('Petition does not exist.');
        }

        if (petition.status !== 'awaiting_answer') {
          throw new ConflictException('Only petitions awaiting an answer can be answered.');
        }

        const [answer] = await tx
          .insert(schema.petitionAnswers)
          .values({ petitionId: id, authorId: actorId, content: parsed.data.content })
          .$returningId();
        await tx
          .update(schema.petitions)
          .set({ status: 'answered', updatedAt: new Date() })
          .where(eq(schema.petitions.id, id));
        await tx.insert(schema.auditLogs).values({
          actorId,
          action: 'petition.answer',
          targetType: 'petitions',
          targetId: String(id),
        });

        return { ok: true, id, answer: { id: answer.id, ...parsed.data } };
      });
    });
  }

  private assertActor(actorId?: number | null): asserts actorId is number {
    if (!actorId || actorId <= 0) {
      throw new ForbiddenException('A persisted account is required.');
    }
  }
}
