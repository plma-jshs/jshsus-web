# ERP Data Model Audit

## Applied Cleanup

- `point_records.teacher_id` is nullable. Imported point history no longer creates a fallback teacher account.
- `users.legacy_iam_id`, `users.legacy_jshsus_id`, `users.legacy_plma_id` were removed.
- `students.legacy_student_id` was removed.
- `point_reasons.legacy_reason_code` was removed.
- Deprecated `song_requests` was removed. The active wake-song feature uses `wake_song_requests`.
- Local demo content seed scripts were removed. Local bootstrap now creates only the `9999 / Hello00!` test account.
- `staff_profiles.is_student_affairs_head` and `lost_items.metadata` were removed because authority and lost-item behavior do not use them.
- `users.phone` is normalized to `010########` or `NULL`.
- `users.gender` is stored as `0` for male and `1` for female. API responses still expose `male` / `female`.

## Current Identity Model

- Authors and owners are linked by `user_id`.
- `users.id` is the stable internal account id.
- `students.user_id` links a student profile to the account.
- `staff_profiles.user_id` links a staff profile to the account.
- `auth_accounts.provider_account_id` is the login id, such as student number or staff number.

This means content authorship survives student number changes because posts, comments, files, notices, reports, petitions, notifications, and audit logs point at `users.id`.

## Remaining Contract Debt

`users.student_no`, `users.grade`, `users.class_no`, and `users.number` still duplicate student-profile data. They are not the old `legacy_*` columns, but they are a compatibility mirror from the first schema version. `users.student_no` is nullable, and staff or system accounts leave it empty.

Do not build more features on that mirror. The next identity migration should:

1. move every read path to `students` or `staff_profiles`;
2. move yearly class placement to `student_enrollments`;
3. keep system point actors addressed through `users.id` and `auth_accounts` provider links;
4. drop `users.student_no`, `users.grade`, `users.class_no`, and `users.number` in a follow-up migration after deploy compatibility is confirmed.

## Current School-Year Gap

There is no complete annual rollover flow yet.

The admin UI can create and update individual students, and it prevents unsafe grade changes. That is not enough for a real school-year transition because:

- student numbers change when grade/class/number changes;
- graduating students need to become inactive or graduated without deleting their history;
- incoming students reuse numbers that older cohorts used in previous years;
- historical records should not silently show a new current student number when looking at old records;
- bulk roster import, preview, validation, and rollback do not exist yet.

## Recommended Rollover Design

Keep `users.id` as the stable account id. Add a year-aware enrollment layer.

1. Add `school_years`
   - `id`
   - `year`
   - `is_active`
   - timestamps

2. Add `student_enrollments`
   - `id`
   - `student_id`
   - `school_year`
   - `student_no`
   - `grade`
   - `class_no`
   - `number`
   - `status`: `active`, `graduated`, `transferred`, `withdrawn`
   - unique key on `(school_year, student_no)`
   - unique key on `(school_year, student_id)`

3. Keep `students` as the stable person/profile row.
   - `students.id` stays stable.
   - name/gender/phone can live on `users` or `students`, but enrollment position should move to `student_enrollments`.

4. Add historical snapshots where the UI needs past truth.
   - `point_records`: add `school_year`, `student_no_snapshot`, `student_name_snapshot`, optionally `enrollment_id`.
   - `activity_requests`: add `school_year` or `enrollment_id` for the representative and participants.

5. Build admin Excel import.
   - Upload `.xlsx` or `.csv`.
   - Required columns: `student_no`, `name`, `gender`, `phone`.
   - Optional matching columns: `previous_student_no`, `user_id`.
   - Preview categories: create, update, graduate, conflict, invalid.
   - Apply in one transaction.
   - Write an audit log and store the uploaded file.
   - Provide rollback by import batch id.

6. Matching rules for yearly import.
   - Best: match by uploaded `user_id`.
   - Next best: match by `previous_student_no` in the previous active school year.
   - Fallback: match by exact `name + phone`.
   - If multiple candidates match, mark conflict and require manual resolution.

## UUID Decision

Do not convert every primary key to UUID right now.

For this MySQL ERP workload, integer primary keys are smaller, faster, and simpler for many FK joins. The current scale of a school system does not threaten integer exhaustion.

If public enumeration or external references become a concern, add `public_id` as UUIDv7/ULID to externally exposed entities while keeping integer PKs internally. That gives stable public identifiers without paying the UUID cost on every join.

## Next Recommended Implementation

The next major data task should be the school-year enrollment model and roster import preview/apply flow. It should be implemented before the first real annual rollover.
