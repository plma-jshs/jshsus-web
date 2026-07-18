import {
  boolean,
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { id, now, timestamps } from './common';

export const userStatusEnum = mysqlEnum('user_status', [
  'active',
  'restricted',
  'graduated',
  'deleted',
]);

export const users = mysqlTable(
  'users',
  {
    id,
    // @deprecated Student identifiers belong to the student profile. Staff
    // accounts receive a negative internal compatibility value until the
    // forward-only contract migration can remove this legacy column.
    studentNo: int('student_no').notNull(),
    name: varchar('name', { length: 64 }).notNull(),
    nickname: varchar('nickname', { length: 16 }),
    grade: int('grade'),
    classNo: int('class_no'),
    number: int('number'),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 32 }),
    gender: mysqlEnum('gender', ['0', '1']),
    status: userStatusEnum.notNull().default('active'),
    lastLoginAt: datetime('last_login_at', { mode: 'date', fsp: 3 }),
    ...timestamps,
  },
  (table) => ({
    studentNoIdx: uniqueIndex('users_student_no_idx').on(table.studentNo),
    nicknameIdx: uniqueIndex('users_nickname_idx').on(table.nickname),
  }),
);

/**
 * Transaction-safe counters for identifiers issued by the application.
 * The staff-number row starts at 100000 and is locked while a number is issued.
 */
export const identitySequences = mysqlTable('identity_sequences', {
  key: varchar('sequence_key', { length: 32 }).primaryKey(),
  nextValue: int('next_value').notNull(),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull().default(now),
});

export const passwordAlgorithmEnum = mysqlEnum('password_algorithm', ['legacy-sha512', 'argon2id']);

export const authAccounts = mysqlTable(
  'auth_accounts',
  {
    id,
    userId: int('user_id')
      .notNull()
      .references(() => users.id),
    provider: varchar('provider', { length: 32 }).notNull().default('local'),
    providerAccountId: varchar('provider_account_id', { length: 128 }),
    passwordHash: varchar('password_hash', { length: 512 }),
    passwordAlgorithm: passwordAlgorithmEnum.notNull().default('legacy-sha512'),
    ...timestamps,
  },
  (table) => ({
    providerIdx: uniqueIndex('auth_accounts_provider_idx').on(
      table.provider,
      table.providerAccountId,
    ),
    userProviderIdx: index('auth_accounts_user_provider_idx').on(table.userId, table.provider),
  }),
);

export const roles = mysqlTable(
  'roles',
  {
    id,
    name: varchar('name', { length: 64 }).notNull(),
    label: varchar('label', { length: 128 }).notNull(),
    ...timestamps,
  },
  (table) => ({
    nameIdx: uniqueIndex('roles_name_idx').on(table.name),
  }),
);

export const permissions = mysqlTable(
  'permissions',
  {
    id,
    name: varchar('name', { length: 128 }).notNull(),
    label: varchar('label', { length: 128 }).notNull(),
    description: varchar('description', { length: 500 }),
    ...timestamps,
  },
  (table) => ({
    nameIdx: uniqueIndex('permissions_name_idx').on(table.name),
  }),
);

export const userRoles = mysqlTable(
  'user_roles',
  {
    userId: int('user_id')
      .notNull()
      .references(() => users.id),
    roleId: int('role_id')
      .notNull()
      .references(() => roles.id),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull().default(now),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.roleId] }),
  }),
);

export const rolePermissions = mysqlTable(
  'role_permissions',
  {
    roleId: int('role_id')
      .notNull()
      .references(() => roles.id),
    permissionId: int('permission_id')
      .notNull()
      .references(() => permissions.id),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull().default(now),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roleId, table.permissionId] }),
  }),
);

export const userPermissions = mysqlTable(
  'user_permissions',
  {
    userId: int('user_id')
      .notNull()
      .references(() => users.id),
    permissionId: int('permission_id')
      .notNull()
      .references(() => permissions.id),
    hasPermission: boolean('has_permission').notNull().default(true),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull().default(now),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.permissionId] }),
  }),
);

export const auditLogs = mysqlTable(
  'audit_logs',
  {
    id,
    actorId: int('actor_id').references(() => users.id),
    action: varchar('action', { length: 128 }).notNull(),
    targetType: varchar('target_type', { length: 64 }),
    targetId: varchar('target_id', { length: 64 }),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: varchar('user_agent', { length: 500 }),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull().default(now),
  },
  (table) => ({
    actorIdx: index('audit_logs_actor_idx').on(table.actorId),
    targetIdx: index('audit_logs_target_idx').on(table.targetType, table.targetId),
  }),
);
