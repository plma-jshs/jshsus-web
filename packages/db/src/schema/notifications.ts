import { datetime, index, int, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
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
    link: varchar('link', { length: 500 }),
    readAt: datetime('read_at', { mode: 'date', fsp: 3 }),
    ...timestamps,
  },
  (table) => ({
    userReadIdx: index('notifications_user_read_idx').on(table.userId, table.readAt),
  }),
);
