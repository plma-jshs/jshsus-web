import {
  boolean,
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { users } from './auth';
import { now, timestamps } from './common';

export const privacyRetentionDispositionEnum = mysqlEnum('privacy_retention_disposition', [
  'hard_delete',
  'anonymize',
  'external_lifecycle',
]);

export const privacyRetentionPolicies = mysqlTable(
  'privacy_retention_policies',
  {
    key: varchar('policy_key', { length: 64 }).primaryKey(),
    retentionDays: int('retention_days').notNull(),
    disposition: privacyRetentionDispositionEnum.notNull(),
    isActive: boolean('is_active').notNull().default(true),
    approvedById: int('approved_by_id').references(() => users.id),
    approvedAt: datetime('approved_at', { mode: 'date', fsp: 3 }).notNull(),
    approvalReference: varchar('approval_reference', { length: 255 }).notNull(),
    ...timestamps,
  },
  (table) => ({
    activeIdx: index('privacy_retention_policies_active_idx').on(
      table.isActive,
      table.retentionDays,
    ),
    approverIdx: index('privacy_retention_policies_approver_idx').on(table.approvedById),
  }),
);

export const privacyErasureJobStatusEnum = mysqlEnum('privacy_erasure_job_status', [
  'pending',
  'running',
  'completed',
  'failed',
]);

export const privacyErasureJobModeEnum = mysqlEnum('privacy_erasure_job_mode', [
  'dry_run',
  'apply',
]);

export type PrivacyErasureResultCounts = Record<string, number>;

export const privacyErasureJobs = mysqlTable(
  'privacy_erasure_jobs',
  {
    id: int('id').autoincrement().primaryKey(),
    policyKey: varchar('policy_key', { length: 64 }).notNull(),
    dedupeKey: varchar('dedupe_key', { length: 190 }),
    targetUserId: int('target_user_id').references(() => users.id),
    mode: privacyErasureJobModeEnum.notNull(),
    status: privacyErasureJobStatusEnum.notNull().default('pending'),
    scheduledFor: datetime('scheduled_for', { mode: 'date', fsp: 3 }).notNull(),
    cutoffAt: datetime('cutoff_at', { mode: 'date', fsp: 3 }),
    startedAt: datetime('started_at', { mode: 'date', fsp: 3 }),
    completedAt: datetime('completed_at', { mode: 'date', fsp: 3 }),
    resultCounts: json('result_counts').$type<PrivacyErasureResultCounts>(),
    errorCode: varchar('error_code', { length: 64 }),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull().default(now),
    updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull().default(now),
  },
  (table) => ({
    dedupeIdx: uniqueIndex('privacy_erasure_jobs_dedupe_idx').on(table.dedupeKey),
    dueIdx: index('privacy_erasure_jobs_due_idx').on(table.status, table.scheduledFor, table.id),
    policyIdx: index('privacy_erasure_jobs_policy_idx').on(table.policyKey, table.createdAt),
    targetIdx: index('privacy_erasure_jobs_target_idx').on(table.targetUserId, table.createdAt),
  }),
);
