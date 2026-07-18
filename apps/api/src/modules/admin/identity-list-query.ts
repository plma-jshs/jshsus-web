import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const identityListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
  q: z.string().trim().max(100).optional().default(''),
  status: z.enum(['active', 'restricted', 'graduated', 'deleted']).optional(),
  grade: z.coerce.number().int().min(1).max(3).optional(),
  classNo: z.coerce.number().int().min(1).max(4).optional(),
  department: z.string().trim().max(120).optional(),
  sortBy: z.enum(['identifier', 'name', 'status', 'lastLoginAt', 'department', 'title']).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export function parseIdentityListQuery(query: unknown) {
  const parsed = identityListQuerySchema.safeParse(query);
  if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
  return parsed.data;
}
