import { datetime, index, int, mysqlEnum, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
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
