import { sql } from 'drizzle-orm';
import { check, index, int, mysqlTable, uniqueIndex } from 'drizzle-orm/mysql-core';
import { users } from './auth';
import { id, timestamps } from './common';

/**
 * A directed roommate exclusion submitted by a student for one dorm term.
 * Assignment validation treats either direction as a mutual exclusion.
 */
export const dormRoommateBlocks = mysqlTable(
  'dorm_roommate_blocks',
  {
    id,
    studentUserId: int('student_user_id')
      .notNull()
      .references(() => users.id),
    blockedUserId: int('blocked_user_id')
      .notNull()
      .references(() => users.id),
    year: int('year').notNull(),
    semester: int('semester').notNull(),
    submittedBy: int('submitted_by').references(() => users.id),
    ...timestamps,
  },
  (table) => ({
    studentTermIdx: index('dorm_roommate_blocks_student_term_idx').on(
      table.studentUserId,
      table.year,
      table.semester,
    ),
    blockedTermIdx: index('dorm_roommate_blocks_blocked_term_idx').on(
      table.blockedUserId,
      table.year,
      table.semester,
    ),
    pairTermIdx: uniqueIndex('dorm_roommate_blocks_pair_term_idx').on(
      table.studentUserId,
      table.blockedUserId,
      table.year,
      table.semester,
    ),
    notSelfCheck: check(
      'dorm_roommate_blocks_not_self_chk',
      sql`${table.studentUserId} <> ${table.blockedUserId}`,
    ),
  }),
);
