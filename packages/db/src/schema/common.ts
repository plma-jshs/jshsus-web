import { sql } from 'drizzle-orm';
import { datetime, int, mysqlEnum, varchar } from 'drizzle-orm/mysql-core';

export const id = int('id').autoincrement().primaryKey();
export const now = sql`(now(3))`;

export const timestamps = {
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull().default(now),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull().default(now),
};

export const visibilityEnum = mysqlEnum('visibility', ['public', 'members', 'staff', 'admin']);

export const status = varchar('status', { length: 32 }).notNull().default('active');
