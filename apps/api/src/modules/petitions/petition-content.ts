import { BadRequestException } from '@nestjs/common';
import type { RichTextDocument, RichTextNode } from '@jshsus/types';
import { z } from 'zod';
import { parseRichTextDocument, projectDocumentToPlainText } from '../boards/post-content';

const MAX_PLAIN_CONTENT_LENGTH = 1_000_000;

const createPetitionSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    content: z.string().max(MAX_PLAIN_CONTENT_LENGTH).optional(),
    contentDoc: z.unknown().optional(),
    startsAt: z.coerce.date().default(() => new Date()),
    endsAt: z.coerce.date().default(() => new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)),
  })
  .strict();

function containsImage(document: RichTextDocument): boolean {
  const stack: RichTextNode[] = [...document.content];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.type === 'image') return true;
    stack.push(...(node.content ?? []));
  }
  return false;
}

export type NormalizedPetitionCreate = {
  title: string;
  content: string;
  contentDoc?: RichTextDocument;
  startsAt: Date;
  endsAt: Date;
};

export function parsePetitionCreate(body: unknown): NormalizedPetitionCreate {
  const parsed = createPetitionSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.flatten().fieldErrors);
  }

  const contentDoc =
    parsed.data.contentDoc === undefined
      ? undefined
      : parseRichTextDocument(parsed.data.contentDoc);
  if (contentDoc && containsImage(contentDoc)) {
    throw new BadRequestException('Petition content does not support inline images.');
  }

  const content = contentDoc
    ? projectDocumentToPlainText(contentDoc)
    : (parsed.data.content ?? '').trim();
  if (!content) {
    throw new BadRequestException('Petitions need content.');
  }

  return {
    title: parsed.data.title,
    content,
    contentDoc,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
  };
}
