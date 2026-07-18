import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  datetime,
  foreignKey,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
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
  }),
);

export const schoolYears = mysqlTable(
  'school_years',
  {
    id,
    year: int('year').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    ...timestamps,
  },
  (table) => ({
    yearIdx: uniqueIndex('school_years_year_idx').on(table.year),
    activeIdx: index('school_years_active_idx').on(table.isActive, table.year),
  }),
);

export const studentEnrollmentStatusEnum = mysqlEnum('student_enrollment_status', [
  'active',
  'graduated',
  'transferred',
  'withdrawn',
]);

export const studentEnrollments = mysqlTable(
  'student_enrollments',
  {
    id,
    studentId: int('student_id')
      .notNull()
      .references(() => students.id),
    schoolYear: int('school_year')
      .notNull()
      .references(() => schoolYears.year),
    studentNo: int('student_no').notNull(),
    grade: int('grade').notNull(),
    classNo: int('class_no').notNull(),
    number: int('number').notNull(),
    status: studentEnrollmentStatusEnum.notNull().default('active'),
    ...timestamps,
  },
  (table) => ({
    yearStudentIdx: uniqueIndex('student_enrollments_year_student_idx').on(
      table.schoolYear,
      table.studentId,
    ),
    yearStudentNoIdx: uniqueIndex('student_enrollments_year_student_no_idx').on(
      table.schoolYear,
      table.studentNo,
    ),
    studentIdx: index('student_enrollments_student_idx').on(table.studentId, table.schoolYear),
    statusIdx: index('student_enrollments_status_idx').on(table.schoolYear, table.status),
  }),
);

export const rosterImportBatches = mysqlTable(
  'roster_import_batches',
  {
    id,
    schoolYear: int('school_year')
      .notNull()
      .references(() => schoolYears.year),
    appliedById: int('applied_by_id').references(() => users.id),
    fileName: varchar('file_name', { length: 255 }),
    rowCount: int('row_count').notNull().default(0),
    createdCount: int('created_count').notNull().default(0),
    updatedCount: int('updated_count').notNull().default(0),
    unchangedCount: int('unchanged_count').notNull().default(0),
    graduatedCount: int('graduated_count').notNull().default(0),
    appliedAt: datetime('applied_at', { mode: 'date', fsp: 3 }).notNull().default(now),
    ...timestamps,
  },
  (table) => ({
    yearIdx: index('roster_import_batches_year_idx').on(table.schoolYear, table.appliedAt),
    actorIdx: index('roster_import_batches_actor_idx').on(table.appliedById, table.appliedAt),
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
    /** Class homerooms or assigned cohorts used to scope staff work queues. */
    managedClasses: json('managed_classes').$type<Array<{ grade: number; classNo: number }>>(),
    ...timestamps,
  },
  (table) => ({
    userIdx: uniqueIndex('staff_profiles_user_id_idx').on(table.userId),
    staffNoIdx: uniqueIndex('staff_profiles_staff_no_idx').on(table.staffNo),
    staffNoSixDigit: check(
      'staff_profiles_staff_no_six_digit_check',
      sql`${table.staffNo} between 100000 and 999999`,
    ),
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
    teacherId: int('teacher_id').references(() => users.id),
    reasonId: int('reason_id')
      .notNull()
      .references(() => pointReasons.id),
    // Snapshot fields preserve the exact ledger meaning even when a reason template is edited.
    reasonType: mysqlEnum('reason_type', ['PLUS', 'MINUS', 'ETC']),
    reasonText: varchar('reason_text', { length: 255 }),
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
    baseCreatedIdx: index('point_records_base_created_idx').on(table.baseDate, table.createdAt),
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
    dormNameIdx: uniqueIndex('dorm_rooms_dorm_name_name_idx').on(table.dormName, table.name),
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
    representativeStudentId: int('student_id')
      .notNull()
      .references(() => students.id),
    createdById: int('created_by_id').references(() => users.id),
    advisorTeacherId: int('teacher_id').references(() => users.id),
    reviewedById: int('reviewed_by_id').references(() => users.id),
    location: varchar('location', { length: 160 }).notNull(),
    startsAt: datetime('starts_at', { mode: 'date', fsp: 3 }).notNull(),
    endsAt: datetime('ends_at', { mode: 'date', fsp: 3 }).notNull(),
    /** Exact study periods selected by the applicant. startsAt/endsAt remain for range queries. */
    activitySlotIds: json('activity_slot_ids').$type<string[]>(),
    purpose: varchar('purpose', { length: 500 }).notNull(),
    status: activityRequestStatusEnum.notNull().default('submitted'),
    rejectionReason: varchar('rejection_reason', { length: 500 }),
    issuedNumber: varchar('issued_number', { length: 64 }),
    issuedAt: datetime('issued_at', { mode: 'date', fsp: 3 }),
    ...timestamps,
  },
  (table) => ({
    studentIdx: index('activity_requests_student_idx').on(
      table.representativeStudentId,
      table.startsAt,
    ),
    creatorIdx: index('activity_requests_creator_idx').on(table.createdById, table.createdAt),
    teacherIdx: index('activity_requests_teacher_idx').on(table.advisorTeacherId, table.status),
    reviewerIdx: index('activity_requests_reviewer_idx').on(table.reviewedById, table.status),
    issuedIdx: uniqueIndex('activity_requests_issued_number_idx').on(table.issuedNumber),
  }),
);

export const activityRequestParticipants = mysqlTable(
  'activity_request_participants',
  {
    activityRequestId: int('activity_request_id')
      .notNull()
      .references(() => activityRequests.id, { onDelete: 'cascade' }),
    studentId: int('student_id')
      .notNull()
      .references(() => students.id),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull().default(now),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.activityRequestId, table.studentId] }),
    studentIdx: index('activity_request_participants_student_idx').on(
      table.studentId,
      table.activityRequestId,
    ),
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
