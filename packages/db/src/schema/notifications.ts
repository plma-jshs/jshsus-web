import {
  datetime,
  index,
  int,
  json,
  mysqlTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { id, timestamps } from './common';
import { users } from './auth';

export const notifications = mysqlTable(
  'notifications',
  {
    id,
    userId: int('user_id')
      .notNull()
      .references(() => users.id),
    type: varchar('type', { length: 64 }).notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    body: varchar('body', { length: 500 }),
    link: varchar('link', { length: 500 }),
    metadata: json('metadata').$type<Record<string, unknown> | null>(),
    dedupeKey: varchar('dedupe_key', { length: 190 }),
    readAt: datetime('read_at', { mode: 'date', fsp: 3 }),
    expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    ...timestamps,
  },
  (table) => ({
    userReadIdx: index('notifications_user_read_idx').on(table.userId, table.readAt),
    userCreatedIdx: index('notifications_user_created_idx').on(table.userId, table.createdAt),
    expiresIdx: index('notifications_expires_idx').on(table.expiresAt),
    dedupeIdx: uniqueIndex('notifications_dedupe_idx').on(table.dedupeKey),
  }),
);
