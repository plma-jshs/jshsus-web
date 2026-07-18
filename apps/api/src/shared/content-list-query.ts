import { BadRequestException } from '@nestjs/common';
import type { ContentSearchField } from '@jshsus/types';
import { z } from 'zod';

const contentPageSizes = [20, 50, 100] as const;

const contentListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1_000_000).optional().default(1),
    pageSize: z.coerce
      .number()
      .int()
      .refine(
        (value) => contentPageSizes.some((pageSize) => pageSize === value),
        'pageSize must be one of 20, 50, or 100',
      )
      .optional()
      .default(20),
    field: z.enum(['title_content', 'title', 'author']).optional().default('title_content'),
    q: z.string().trim().max(100).optional().default(''),
  })
  .strict();

export type ContentListQuery = {
  page: number;
  pageSize: number;
  field: ContentSearchField;
  q: string;
};

export function parseContentListQuery(query: unknown): ContentListQuery {
  const parsed = contentListQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.flatten().fieldErrors);
  }
  return parsed.data;
}

export function toContainsPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, '\\$&')}%`;
}
