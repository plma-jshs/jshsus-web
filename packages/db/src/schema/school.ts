import { boolean, datetime, index, int, mysqlTable, text, varchar } from 'drizzle-orm/mysql-core';
import { users } from './auth';
import { id, timestamps } from './common';

export const schoolEvents = mysqlTable(
  'school_events',
  {
    id,
    title: varchar('title', { length: 160 }).notNull(),
    description: text('description'),
    category: varchar('category', { length: 40 }).notNull().default('school'),
    startsAt: datetime('starts_at', { mode: 'date', fsp: 3 }).notNull(),
    endsAt: datetime('ends_at', { mode: 'date', fsp: 3 }).notNull(),
    allDay: boolean('all_day').notNull().default(true),
    isHoliday: boolean('is_holiday').notNull().default(false),
    isPublic: boolean('is_public').notNull().default(true),
    createdById: int('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => ({
    rangeIdx: index('school_events_range_idx').on(table.startsAt, table.endsAt),
    visibilityIdx: index('school_events_visibility_idx').on(table.isPublic, table.startsAt),
  }),
);
