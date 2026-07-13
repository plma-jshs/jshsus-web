import {
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { id, now, timestamps } from './common';
import { users } from './auth';

export const fileVisibilityEnum = mysqlEnum('file_visibility', ['public', 'private']);

export const files = mysqlTable(
  'files',
  {
    id,
    ownerId: int('owner_id').references(() => users.id),
    targetType: varchar('target_type', { length: 64 }),
    targetId: int('target_id'),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    objectKey: varchar('object_key', { length: 512 }).notNull(),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    sizeBytes: int('size_bytes').notNull(),
    visibility: fileVisibilityEnum.notNull().default('private'),
    uploadedAt: datetime('uploaded_at', { mode: 'date', fsp: 3 }).notNull().default(now),
    ...timestamps,
  },
  (table) => ({
    targetIdx: index('files_target_idx').on(table.targetType, table.targetId),
    objectKeyIdx: index('files_object_key_idx').on(table.objectKey),
  }),
);

/**
 * Durable outbox for object-storage deletions.
 *
 * `fileId` intentionally has no foreign key: upload compensation jobs do not
 * have a file row, and parent content may already be gone when cleanup runs.
 * `objectKey` is unique so enqueueing the same cleanup from a request and the
 * background worker remains idempotent.
 */
export const fileCleanupJobs = mysqlTable(
  'file_cleanup_jobs',
  {
    id,
    fileId: int('file_id'),
    objectKey: varchar('object_key', { length: 512 }).notNull(),
    targetType: varchar('target_type', { length: 64 }),
    targetId: int('target_id'),
    reason: varchar('reason', { length: 64 }).notNull().default('target_delete'),
    attempts: int('attempts').notNull().default(0),
    nextAttemptAt: datetime('next_attempt_at', { mode: 'date', fsp: 3 }).notNull().default(now),
    lastError: text('last_error'),
    lockedBy: varchar('locked_by', { length: 64 }),
    lockedAt: datetime('locked_at', { mode: 'date', fsp: 3 }),
    ...timestamps,
  },
  (table) => ({
    objectKeyIdx: uniqueIndex('file_cleanup_jobs_object_key_idx').on(table.objectKey),
    dueIdx: index('file_cleanup_jobs_due_idx').on(table.nextAttemptAt, table.lockedAt),
    targetIdx: index('file_cleanup_jobs_target_idx').on(table.targetType, table.targetId),
  }),
);
