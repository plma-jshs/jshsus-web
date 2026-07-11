import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as schema from '@jshsus/db';
import type { PetitionSummary } from '@jshsus/types';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';

const PETITION_THRESHOLD = 50;

const petitionSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  startsAt: z.coerce.date().default(() => new Date()),
  endsAt: z.coerce.date().default(() => new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)),
});

const answerSchema = z.object({
  content: z.string().min(1),
});

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
            authorName: schema.users.name,
            participantCount: schema.petitions.participantCount,
            startsAt: schema.petitions.startsAt,
            endsAt: schema.petitions.endsAt,
            status: schema.petitions.status,
            createdAt: schema.petitions.createdAt,
          })
          .from(schema.petitions)
          .leftJoin(schema.users, eq(schema.petitions.authorId, schema.users.id))
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

      return petitions.map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        authorName: row.authorName ?? undefined,
        participantCount: row.participantCount,
        threshold: PETITION_THRESHOLD,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        status: row.status === 'open' && row.endsAt < new Date() ? 'expired' : row.status,
        answer: answerByPetition.get(row.id)
          ? {
              content: answerByPetition.get(row.id)!.content,
              authorName: answerByPetition.get(row.id)!.authorName ?? undefined,
              answeredAt: answerByPetition.get(row.id)!.answeredAt.toISOString(),
            }
          : undefined,
      }));
    });
  }

  async create(body: unknown, actorId?: number | null) {
    const parsed = petitionSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    if (parsed.data.startsAt >= parsed.data.endsAt) {
      throw new BadRequestException('Petition end time must be later than start time.');
    }

    return this.database.query('petitions.create', async (db) => {
      const [result] = await db
        .insert(schema.petitions)
        .values({
          authorId: actorId && actorId > 0 ? actorId : null,
          title: parsed.data.title,
          content: parsed.data.content,
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
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

      return { ok: true, petition: { id: result.id, ...parsed.data, status: 'open' } };
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
}
