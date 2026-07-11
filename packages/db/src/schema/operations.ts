import {
  boolean,
  date,
  datetime,
  foreignKey,
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

export const students = mysqlTable(
  'students',
  {
    id,
    userId: int('user_id').references(() => users.id),
    legacyStudentId: int('legacy_student_id'),
    studentNo: int('student_no').notNull(),
    name: varchar('name', { length: 64 }).notNull(),
    grade: int('grade').notNull(),
    classNo: int('class_no').notNull(),
    number: int('number').notNull(),
    currentPoint: int('current_point').notNull().default(0),
    ...timestamps,
  },
  (table) => ({
    studentNoIdx: uniqueIndex('students_student_no_idx').on(table.studentNo),
    userIdx: uniqueIndex('students_user_id_idx').on(table.userId),
    legacyIdx: uniqueIndex('students_legacy_student_id_idx').on(table.legacyStudentId),
  }),
);

export const staffProfiles = mysqlTable(
  'staff_profiles',
  {
    id,
    userId: int('user_id')
      .notNull()
      .references(() => users.id),
    staffNo: int('staff_no').notNull(),
    name: varchar('name', { length: 64 }).notNull(),
    department: varchar('department', { length: 120 }),
    title: varchar('title', { length: 120 }),
    isStudentAffairsHead: boolean('is_student_affairs_head').notNull().default(false),
    ...timestamps,
  },
  (table) => ({
    userIdx: uniqueIndex('staff_profiles_user_id_idx').on(table.userId),
    staffNoIdx: uniqueIndex('staff_profiles_staff_no_idx').on(table.staffNo),
  }),
);

export const pointReasonTypeEnum = mysqlEnum('point_reason_type', ['PLUS', 'MINUS', 'ETC']);

export const pointReasons = mysqlTable('point_reasons', {
  id,
  type: pointReasonTypeEnum.notNull(),
  point: int('point').notNull(),
  comment: varchar('comment', { length: 255 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});

export const pointRecords = mysqlTable(
  'point_records',
  {
    id,
    studentId: int('student_id')
      .notNull()
      .references(() => students.id),
    teacherId: int('teacher_id')
      .notNull()
      .references(() => users.id),
    reasonId: int('reason_id')
      .notNull()
      .references(() => pointReasons.id),
    point: int('point').notNull().default(0),
    comment: varchar('comment', { length: 255 }).notNull().default(''),
    baseDate: date('base_date', { mode: 'date' }).notNull(),
    canceledAt: datetime('canceled_at', { mode: 'date', fsp: 3 }),
    restoredAt: datetime('restored_at', { mode: 'date', fsp: 3 }),
    ...timestamps,
  },
  (table) => ({
    studentIdx: index('point_records_student_idx').on(table.studentId, table.baseDate),
    teacherIdx: index('point_records_teacher_idx').on(table.teacherId, table.baseDate),
    reasonIdx: index('point_records_reason_idx').on(table.reasonId),
  }),
);

export const pointAdjustmentActionEnum = mysqlEnum('point_adjustment_action', [
  'cancel',
  'restore',
  'correct',
]);

export const pointAdjustments = mysqlTable(
  'point_adjustments',
  {
    id,
    pointRecordId: int('point_record_id')
      .notNull()
      .references(() => pointRecords.id),
    actorId: int('actor_id')
      .notNull()
      .references(() => users.id),
    action: pointAdjustmentActionEnum.notNull(),
    beforePoint: int('before_point').notNull(),
    afterPoint: int('after_point').notNull(),
    reason: varchar('reason', { length: 255 }).notNull(),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull().default(now),
  },
  (table) => ({
    recordIdx: index('point_adjustments_record_idx').on(table.pointRecordId),
    actorIdx: index('point_adjustments_actor_idx').on(table.actorId),
  }),
);

export const pointAwardCaseStatusEnum = mysqlEnum('point_award_case_status', [
  'pending',
  'processing',
  'completed',
  'dismissed',
]);

export const pointAwardCases = mysqlTable(
  'point_award_cases',
  {
    id,
    studentId: int('student_id')
      .notNull()
      .references(() => students.id),
    type: varchar('type', { length: 64 }).notNull(),
    thresholdPoint: int('threshold_point').notNull(),
    status: pointAwardCaseStatusEnum.notNull().default('pending'),
    handledById: int('handled_by_id').references(() => users.id),
    handledAt: datetime('handled_at', { mode: 'date', fsp: 3 }),
    memo: text('memo'),
    ...timestamps,
  },
  (table) => ({
    studentIdx: index('point_award_cases_student_idx').on(table.studentId, table.status),
  }),
);

export const deviceCases = mysqlTable('device_cases', {
  id: int('id').primaryKey(),
  lastSeenAt: datetime('last_seen_at', { mode: 'date', fsp: 3 }).notNull().default(now),
  isConnected: boolean('is_connected').notNull().default(false),
  isOpen: boolean('is_open').notNull().default(true),
  ...timestamps,
});

export const deviceCaseSchedules = mysqlTable('device_case_schedules', {
  id,
  deviceCaseId: int('device_case_id').references(() => deviceCases.id),
  scheduledAt: datetime('scheduled_at', { mode: 'date', fsp: 3 }).notNull(),
  isOpen: boolean('is_open').notNull().default(false),
  ...timestamps,
});

export const deviceCaseCommandEnum = mysqlEnum('device_case_command', ['open', 'close', 'sync']);
export const deviceCaseCommandStatusEnum = mysqlEnum('device_case_command_status', [
  'queued',
  'sent',
  'succeeded',
  'failed',
]);

export const deviceCaseCommands = mysqlTable(
  'device_case_commands',
  {
    id,
    deviceCaseId: int('device_case_id')
      .notNull()
      .references(() => deviceCases.id),
    actorId: int('actor_id')
      .notNull()
      .references(() => users.id),
    command: deviceCaseCommandEnum.notNull(),
    status: deviceCaseCommandStatusEnum.notNull().default('queued'),
    resultMessage: varchar('result_message', { length: 500 }),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull().default(now),
    completedAt: datetime('completed_at', { mode: 'date', fsp: 3 }),
  },
  (table) => ({
    caseIdx: index('device_case_commands_case_idx').on(table.deviceCaseId, table.createdAt),
    actorIdx: index('device_case_commands_actor_idx').on(table.actorId),
  }),
);

export const dormNameEnum = mysqlEnum('dorm_name', ['송죽관', '동백관']);

export const dormRooms = mysqlTable(
  'dorm_rooms',
  {
    id,
    name: varchar('name', { length: 64 }).notNull(),
    capacity: int('capacity').notNull(),
    grade: int('grade').notNull(),
    dormName: dormNameEnum.notNull(),
    ...timestamps,
  },
  (table) => ({
    nameIdx: uniqueIndex('dorm_rooms_name_idx').on(table.name),
  }),
);

export const dormAssignments = mysqlTable(
  'dorm_assignments',
  {
    id,
    roomId: int('room_id')
      .notNull()
      .references(() => dormRooms.id),
    userId: int('user_id')
      .notNull()
      .references(() => users.id),
    year: int('year').notNull(),
    semester: int('semester').notNull(),
    bedPosition: int('bed_position').notNull(),
    ...timestamps,
  },
  (table) => ({
    userTermIdx: uniqueIndex('dorm_assignments_user_term_idx').on(
      table.userId,
      table.year,
      table.semester,
    ),
    bedIdx: uniqueIndex('dorm_assignments_bed_idx').on(
      table.roomId,
      table.year,
      table.semester,
      table.bedPosition,
    ),
  }),
);

export const dormReportStatusEnum = mysqlEnum('dorm_report_status', [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
]);

export const dormReports = mysqlTable(
  'dorm_reports',
  {
    id,
    userId: int('user_id')
      .notNull()
      .references(() => users.id),
    roomId: int('room_id')
      .notNull()
      .references(() => dormRooms.id),
    description: varchar('description', { length: 500 }).notNull(),
    imageUrl: varchar('image_url', { length: 500 }),
    imageKey: varchar('image_key', { length: 500 }),
    status: dormReportStatusEnum.notNull().default('PENDING'),
    comment: varchar('comment', { length: 500 }),
    ...timestamps,
  },
  (table) => ({
    userIdx: index('dorm_reports_user_idx').on(table.userId),
    roomIdx: index('dorm_reports_room_idx').on(table.roomId),
  }),
);

export const songRequestStatusEnum = mysqlEnum('song_request_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
]);

export const songRequests = mysqlTable('song_requests', {
  id,
  title: varchar('title', { length: 255 }).notNull(),
  url: varchar('url', { length: 500 }).notNull(),
  duration: int('duration').notNull(),
  status: songRequestStatusEnum.notNull().default('PENDING'),
  requesterId: int('requester_id').references(() => users.id),
  ...timestamps,
});

export const activityRequestStatusEnum = mysqlEnum('activity_request_status', [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'canceled',
  'completed',
]);

export const activityRequests = mysqlTable(
  'activity_requests',
  {
    id,
    studentId: int('student_id')
      .notNull()
      .references(() => students.id),
    teacherId: int('teacher_id').references(() => users.id),
    location: varchar('location', { length: 160 }).notNull(),
    startsAt: datetime('starts_at', { mode: 'date', fsp: 3 }).notNull(),
    endsAt: datetime('ends_at', { mode: 'date', fsp: 3 }).notNull(),
    purpose: varchar('purpose', { length: 500 }).notNull(),
    status: activityRequestStatusEnum.notNull().default('submitted'),
    rejectionReason: varchar('rejection_reason', { length: 500 }),
    issuedNumber: varchar('issued_number', { length: 64 }),
    issuedAt: datetime('issued_at', { mode: 'date', fsp: 3 }),
    ...timestamps,
  },
  (table) => ({
    studentIdx: index('activity_requests_student_idx').on(table.studentId, table.startsAt),
    teacherIdx: index('activity_requests_teacher_idx').on(table.teacherId, table.status),
    issuedIdx: uniqueIndex('activity_requests_issued_number_idx').on(table.issuedNumber),
  }),
);

export const activityRequestEventTypeEnum = mysqlEnum('activity_request_event_type', [
  'submitted',
  'approved',
  'rejected',
  'canceled',
  'printed',
  'completed',
]);

export const activityRequestEvents = mysqlTable(
  'activity_request_events',
  {
    id,
    activityRequestId: int('activity_request_id').notNull(),
    actorId: int('actor_id').references(() => users.id),
    type: activityRequestEventTypeEnum.notNull(),
    note: varchar('note', { length: 500 }),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull().default(now),
  },
  (table) => ({
    requestIdx: index('activity_request_events_request_idx').on(table.activityRequestId),
    requestFk: foreignKey({
      columns: [table.activityRequestId],
      foreignColumns: [activityRequests.id],
      name: 'ar_events_request_fk',
    }),
  }),
);
