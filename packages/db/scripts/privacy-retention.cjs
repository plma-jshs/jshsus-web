#!/usr/bin/env node
const {
  AdminDeleteUserAttributesCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const mysql = require('mysql2/promise');

const POLICY_APPROVAL = 'owner-confirmed-2026-07-31';
const LEGACY_DATABASE_HOSTS = new Set(['jshsus-php.jshsus.kr']);
const REQUIRED_POLICIES = Object.freeze({
  student_records: { retentionDays: 365, disposition: 'hard_delete' },
  legacy_activity_archives: { retentionDays: 365, disposition: 'hard_delete' },
  security_logs: { retentionDays: 90, disposition: 'hard_delete' },
  cognito_accounts: { retentionDays: 30, disposition: 'hard_delete' },
});
const STUDENT_RECORD_DATE_FIELDS = Object.freeze({
  pointRecords: 'base_date',
  pointCases: 'created_at',
  activityRequests: 'starts_at',
});

function usage() {
  console.log(`Apply approved privacy retention rules (dry-run by default).

Usage:
  node packages/db/scripts/privacy-retention.cjs
  node packages/db/scripts/privacy-retention.cjs --apply --confirm-policy ${POLICY_APPROVAL}

Environment:
  DATABASE_URL, DATABASE_SSL_MODE, DATABASE_SSL_CA_PATH
  AWS_REGION, COGNITO_USER_POOL_ID (required for --apply)
`);
}

function parseOptions(argv) {
  const options = { apply: false, confirmPolicy: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') options.apply = true;
    else if (argument === '--confirm-policy') options.confirmPolicy = argv[++index] ?? '';
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unsupported argument: ${argument}`);
  }
  if (options.apply && options.confirmPolicy !== POLICY_APPROVAL) {
    throw new Error(`--apply requires --confirm-policy ${POLICY_APPROVAL}`);
  }
  return options;
}

function sslOptions() {
  const mode = process.env.DATABASE_SSL_MODE ?? 'required';
  if (mode === 'disabled') return undefined;
  if (mode === 'required') return { rejectUnauthorized: false };
  const caPath = process.env.DATABASE_SSL_CA_PATH;
  if (!caPath) throw new Error('verify_identity requires DATABASE_SSL_CA_PATH.');
  return { rejectUnauthorized: true, ca: readFileSync(caPath, 'utf8') };
}

function cutoffFrom(now, retentionDays) {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

function safeErrorCode(error) {
  const raw = error && typeof error === 'object' ? error.name || error.Code : '';
  const value = String(raw || 'RETENTION_FAILED').replace(/[^A-Za-z0-9_.-]/g, '_');
  return value.slice(0, 64) || 'RETENTION_FAILED';
}

function assertNotLegacyDatabaseUrl(databaseUrl) {
  const hostname = new URL(databaseUrl).hostname.toLowerCase();
  if (LEGACY_DATABASE_HOSTS.has(hostname)) {
    throw new Error('LEGACY_DATABASE_TARGET_FORBIDDEN');
  }
}

async function loadPolicies(connection) {
  const [rows] = await connection.execute(
    `SELECT policy_key AS policyKey,
            retention_days AS retentionDays,
            privacy_retention_disposition AS disposition,
            is_active AS isActive,
            approval_reference AS approvalReference
       FROM privacy_retention_policies
      WHERE policy_key IN (
        'student_records',
        'legacy_activity_archives',
        'security_logs',
        'cognito_accounts'
      )`,
  );
  const policies = new Map(rows.map((row) => [row.policyKey, row]));
  for (const [key, expected] of Object.entries(REQUIRED_POLICIES)) {
    const policy = policies.get(key);
    if (
      !policy ||
      !policy.isActive ||
      Number(policy.retentionDays) !== expected.retentionDays ||
      policy.disposition !== expected.disposition ||
      policy.approvalReference !== POLICY_APPROVAL
    ) {
      throw new Error(`Approved retention policy mismatch: ${key}`);
    }
  }
  return policies;
}

async function selectCandidates(connection, policies, now) {
  const studentCutoff = cutoffFrom(now, policies.get('student_records').retentionDays);
  const legacyActivityCutoff = cutoffFrom(
    now,
    policies.get('legacy_activity_archives').retentionDays,
  );
  const logCutoff = cutoffFrom(now, policies.get('security_logs').retentionDays);
  const [students] = await connection.execute(
    `SELECT u.id AS userId,
            u.status_changed_at AS statusChangedAt,
            s.id AS studentId,
            s.student_no AS studentNo
       FROM users u
       JOIN students s ON s.user_id = u.id
      WHERE u.user_status = 'graduated'
        AND u.status_changed_at <= ?
        AND u.personal_data_erased_at IS NULL
      ORDER BY u.id`,
    [studentCutoff],
  );
  const [cognito] = await connection.execute(
    `SELECT u.id AS userId,
            u.user_status AS status,
            u.cognito_delete_after AS deleteAfter,
            aa.provider_account_id AS subject,
            COALESCE(s.student_no, sp.staff_no) AS fallbackUsername,
            CASE WHEN s.id IS NULL THEN 'staff' ELSE 'student' END AS identityType
       FROM users u
       JOIN auth_accounts aa
         ON aa.user_id = u.id
        AND aa.provider = 'cognito'
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
      WHERE u.user_status <> 'active'
        AND aa.provider_account_id IS NOT NULL
      ORDER BY u.id`,
  );
  const [[logCount]] = await connection.execute(
    'SELECT COUNT(*) AS total FROM audit_logs WHERE created_at < ?',
    [logCutoff],
  );
  const [[legacyActivityCount]] = await connection.execute(
    'SELECT COUNT(*) AS total FROM legacy_activity_archives WHERE activity_date <= DATE(?)',
    [legacyActivityCutoff],
  );
  const [[pointRecordCount]] = await connection.execute(
    `SELECT COUNT(*) AS total
       FROM point_records pr
       JOIN students s ON s.id = pr.student_id
       JOIN users u ON u.id = s.user_id
      WHERE u.user_status = 'graduated'
        AND pr.base_date <= DATE(?)`,
    [studentCutoff],
  );
  const [[pointCaseCount]] = await connection.execute(
    `SELECT COUNT(*) AS total
       FROM point_award_cases pac
       JOIN students s ON s.id = pac.student_id
       JOIN users u ON u.id = s.user_id
      WHERE u.user_status = 'graduated'
        AND pac.created_at < DATE_ADD(DATE(?), INTERVAL 1 DAY)`,
    [studentCutoff],
  );
  const [[activityRequestCount]] = await connection.execute(
    `SELECT COUNT(*) AS total
       FROM activity_requests r
       JOIN students s ON s.id = r.student_id
       JOIN users u ON u.id = s.user_id
      WHERE u.user_status = 'graduated'
        AND r.starts_at < DATE_ADD(DATE(?), INTERVAL 1 DAY)`,
    [studentCutoff],
  );
  const [[activityParticipantCount]] = await connection.execute(
    `SELECT COUNT(*) AS total
       FROM activity_request_participants p
       JOIN activity_requests r ON r.id = p.activity_request_id
       JOIN students representative ON representative.id = r.student_id
       JOIN users representative_user ON representative_user.id = representative.user_id
       JOIN students participant ON participant.id = p.student_id
       JOIN users participant_user ON participant_user.id = participant.user_id
      WHERE (
          representative_user.user_status = 'graduated'
          OR participant_user.user_status = 'graduated'
        )
        AND r.starts_at < DATE_ADD(DATE(?), INTERVAL 1 DAY)`,
    [studentCutoff],
  );
  return {
    students,
    cognito,
    logCount: Number(logCount.total),
    legacyActivityCount: Number(legacyActivityCount.total),
    pointRecordCount: Number(pointRecordCount.total),
    pointCaseCount: Number(pointCaseCount.total),
    activityRequestCount: Number(activityRequestCount.total),
    activityParticipantCount: Number(activityParticipantCount.total),
    studentCutoff,
    legacyActivityCutoff,
    logCutoff,
  };
}

async function findUsernameBySubject(client, poolId, subject, fallbackUsername) {
  const escaped = String(subject).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const result = await client.send(
    new ListUsersCommand({
      UserPoolId: poolId,
      Filter: `sub = "${escaped}"`,
      Limit: 2,
    }),
  );
  if ((result.Users?.length ?? 0) > 1) throw new Error('COGNITO_SUBJECT_CONFLICT');
  if (result.Users?.[0]?.Username) return result.Users[0].Username;
  const fallback = String(fallbackUsername || '');
  if (!fallback) return null;
  try {
    const user = await client.send(
      new AdminGetUserCommand({ UserPoolId: poolId, Username: fallback }),
    );
    return user.Username ?? fallback;
  } catch (error) {
    if (error?.name === 'UserNotFoundException') return null;
    throw error;
  }
}

async function disableAndScrubCognito(client, poolId, candidate) {
  const username = await findUsernameBySubject(
    client,
    poolId,
    candidate.subject,
    candidate.fallbackUsername,
  );
  if (!username) return false;
  const retiredEmail = `retired+${createHash('sha256')
    .update(String(candidate.subject))
    .digest('hex')
    .slice(0, 24)}@jshsus.invalid`;
  await client.send(new AdminDisableUserCommand({ UserPoolId: poolId, Username: username }));
  await client.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: poolId,
      Username: username,
      UserAttributes: [
        { Name: 'email', Value: retiredEmail },
        { Name: 'email_verified', Value: 'false' },
      ],
    }),
  );
  await client.send(
    new AdminDeleteUserAttributesCommand({
      UserPoolId: poolId,
      Username: username,
      UserAttributeNames: ['name'],
    }),
  );
  return username;
}

async function createRunningJob(connection, input) {
  const [result] = await connection.execute(
    `INSERT INTO privacy_erasure_jobs
       (policy_key, dedupe_key, target_user_id, privacy_erasure_job_mode,
        privacy_erasure_job_status, scheduled_for, cutoff_at, started_at)
     VALUES (?, ?, ?, 'apply', 'running', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       id = LAST_INSERT_ID(id),
       privacy_erasure_job_status = 'running',
       started_at = VALUES(started_at),
       completed_at = NULL,
       error_code = NULL,
       updated_at = VALUES(started_at)`,
    [
      input.policyKey,
      input.dedupeKey,
      input.targetUserId ?? null,
      input.scheduledFor,
      input.cutoffAt,
      input.startedAt,
    ],
  );
  return Number(result.insertId);
}

async function completeJob(connection, jobId, completedAt, counts) {
  await connection.execute(
    `UPDATE privacy_erasure_jobs
        SET privacy_erasure_job_status = 'completed',
            completed_at = ?,
            result_counts = ?,
            error_code = NULL,
            updated_at = ?
      WHERE id = ?`,
    [completedAt, JSON.stringify(counts), completedAt, jobId],
  );
}

async function failJob(connection, jobId, completedAt, error) {
  await connection.execute(
    `UPDATE privacy_erasure_jobs
        SET privacy_erasure_job_status = 'failed',
            completed_at = ?,
            result_counts = NULL,
            error_code = ?,
            updated_at = ?
      WHERE id = ?`,
    [completedAt, safeErrorCode(error), completedAt, jobId],
  );
}

async function eraseStudentRecordsByDate(connection, cutoff, now) {
  const dateKey = now.toISOString().slice(0, 10);
  const jobId = await createRunningJob(connection, {
    policyKey: 'student_records',
    dedupeKey: `student-records:${dateKey}`,
    scheduledFor: now,
    cutoffAt: cutoff,
    startedAt: now,
  });
  try {
    await connection.beginTransaction();
    const [[counts]] = await connection.execute(
      `SELECT
         (
           SELECT COUNT(*)
             FROM point_records pr
             JOIN students s ON s.id = pr.student_id
             JOIN users u ON u.id = s.user_id
            WHERE u.user_status = 'graduated'
              AND pr.base_date <= DATE(?)
         ) AS pointRecords,
         (
           SELECT COUNT(*)
             FROM point_adjustments pa
             JOIN point_records pr ON pr.id = pa.point_record_id
             JOIN students s ON s.id = pr.student_id
             JOIN users u ON u.id = s.user_id
            WHERE u.user_status = 'graduated'
              AND pr.base_date <= DATE(?)
         ) AS pointAdjustments,
         (
           SELECT COUNT(*)
             FROM point_award_cases pac
             JOIN students s ON s.id = pac.student_id
             JOIN users u ON u.id = s.user_id
            WHERE u.user_status = 'graduated'
              AND pac.created_at < DATE_ADD(DATE(?), INTERVAL 1 DAY)
         ) AS pointCases,
         (
           SELECT COUNT(*)
             FROM activity_requests r
             JOIN students s ON s.id = r.student_id
             JOIN users u ON u.id = s.user_id
            WHERE u.user_status = 'graduated'
              AND r.starts_at < DATE_ADD(DATE(?), INTERVAL 1 DAY)
         ) AS activityRequests,
         (
           SELECT COUNT(*)
             FROM activity_request_events e
             JOIN activity_requests r ON r.id = e.activity_request_id
             JOIN students s ON s.id = r.student_id
             JOIN users u ON u.id = s.user_id
            WHERE u.user_status = 'graduated'
              AND r.starts_at < DATE_ADD(DATE(?), INTERVAL 1 DAY)
         ) AS activityEvents,
         (
           SELECT COUNT(*)
             FROM activity_request_participants p
             JOIN activity_requests r ON r.id = p.activity_request_id
             JOIN students representative ON representative.id = r.student_id
             JOIN users representative_user ON representative_user.id = representative.user_id
             JOIN students participant ON participant.id = p.student_id
             JOIN users participant_user ON participant_user.id = participant.user_id
            WHERE (
                representative_user.user_status = 'graduated'
                OR participant_user.user_status = 'graduated'
              )
              AND r.starts_at < DATE_ADD(DATE(?), INTERVAL 1 DAY)
         ) AS activityParticipants`,
      [cutoff, cutoff, cutoff, cutoff, cutoff, cutoff],
    );
    await connection.execute(
      `DELETE pa
         FROM point_adjustments pa
         JOIN point_records pr ON pr.id = pa.point_record_id
         JOIN students s ON s.id = pr.student_id
         JOIN users u ON u.id = s.user_id
        WHERE u.user_status = 'graduated'
          AND pr.base_date <= DATE(?)`,
      [cutoff],
    );
    await connection.execute(
      `DELETE pac
         FROM point_award_cases pac
         JOIN students s ON s.id = pac.student_id
         JOIN users u ON u.id = s.user_id
        WHERE u.user_status = 'graduated'
          AND pac.created_at < DATE_ADD(DATE(?), INTERVAL 1 DAY)`,
      [cutoff],
    );
    await connection.execute(
      `DELETE pr
         FROM point_records pr
         JOIN students s ON s.id = pr.student_id
         JOIN users u ON u.id = s.user_id
        WHERE u.user_status = 'graduated'
          AND pr.base_date <= DATE(?)`,
      [cutoff],
    );
    await connection.execute(
      `DELETE e
         FROM activity_request_events e
         JOIN activity_requests r ON r.id = e.activity_request_id
         JOIN students s ON s.id = r.student_id
         JOIN users u ON u.id = s.user_id
        WHERE u.user_status = 'graduated'
          AND r.starts_at < DATE_ADD(DATE(?), INTERVAL 1 DAY)`,
      [cutoff],
    );
    await connection.execute(
      `DELETE p
         FROM activity_request_participants p
         JOIN activity_requests r ON r.id = p.activity_request_id
         JOIN students s ON s.id = p.student_id
         JOIN users u ON u.id = s.user_id
        WHERE u.user_status = 'graduated'
          AND r.starts_at < DATE_ADD(DATE(?), INTERVAL 1 DAY)`,
      [cutoff],
    );
    await connection.execute(
      `DELETE p
         FROM activity_request_participants p
         JOIN activity_requests r ON r.id = p.activity_request_id
         JOIN students s ON s.id = r.student_id
         JOIN users u ON u.id = s.user_id
        WHERE u.user_status = 'graduated'
          AND r.starts_at < DATE_ADD(DATE(?), INTERVAL 1 DAY)`,
      [cutoff],
    );
    await connection.execute(
      `DELETE r
         FROM activity_requests r
         JOIN students s ON s.id = r.student_id
         JOIN users u ON u.id = s.user_id
        WHERE u.user_status = 'graduated'
          AND r.starts_at < DATE_ADD(DATE(?), INTERVAL 1 DAY)`,
      [cutoff],
    );
    await connection.commit();
    const resultCounts = Object.fromEntries(
      Object.entries(counts).map(([key, value]) => [key, Number(value)]),
    );
    await completeJob(connection, jobId, now, resultCounts);
    return resultCounts;
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    await failJob(connection, jobId, new Date(), error);
    throw error;
  }
}

async function eraseStudentIdentityStub(connection, candidate, now) {
  const jobId = await createRunningJob(connection, {
    policyKey: 'student_records',
    dedupeKey: `student-identity:${candidate.userId}:${new Date(candidate.statusChangedAt).toISOString()}`,
    targetUserId: candidate.userId,
    scheduledFor: now,
    cutoffAt: candidate.statusChangedAt,
    startedAt: now,
  });
  try {
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE users
          SET student_no = NULL,
              name = '탈퇴한 사용자',
              email = NULL,
              phone = NULL,
              nickname = NULL,
              grade = NULL,
              class_no = NULL,
              number = NULL,
              gender = NULL,
              personal_data_erased_at = ?,
              updated_at = ?
        WHERE id = ?`,
      [now, now, candidate.userId],
    );
    const anonymousStudentNo = -Math.abs(Number(candidate.studentId));
    await connection.execute(
      `UPDATE students
          SET student_no = ?,
              name = '탈퇴한 사용자',
              grade = 0,
              class_no = 0,
              number = 0,
              current_point = 0,
              updated_at = ?
        WHERE id = ?`,
      [anonymousStudentNo, now, candidate.studentId],
    );
    await connection.execute(
      `UPDATE student_enrollments
          SET student_no = ?,
              grade = 0,
              class_no = 0,
              number = 0,
              updated_at = ?
        WHERE student_id = ?`,
      [anonymousStudentNo, now, candidate.studentId],
    );
    await connection.commit();
    const resultCounts = { identityStubs: 1 };
    await completeJob(connection, jobId, now, resultCounts);
    return resultCounts;
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    await failJob(connection, jobId, new Date(), error);
    throw error;
  }
}

async function eraseSecurityLogs(connection, cutoff, now) {
  const dateKey = now.toISOString().slice(0, 10);
  const jobId = await createRunningJob(connection, {
    policyKey: 'security_logs',
    dedupeKey: `security-logs:${dateKey}`,
    scheduledFor: now,
    cutoffAt: cutoff,
    startedAt: now,
  });
  try {
    const [result] = await connection.execute('DELETE FROM audit_logs WHERE created_at < ?', [
      cutoff,
    ]);
    const counts = { auditLogs: Number(result.affectedRows) };
    await completeJob(connection, jobId, now, counts);
    return counts;
  } catch (error) {
    await failJob(connection, jobId, new Date(), error);
    throw error;
  }
}

async function eraseLegacyActivityArchives(connection, cutoff, now) {
  const dateKey = now.toISOString().slice(0, 10);
  const jobId = await createRunningJob(connection, {
    policyKey: 'legacy_activity_archives',
    dedupeKey: `legacy-activity-archives:${dateKey}`,
    scheduledFor: now,
    cutoffAt: cutoff,
    startedAt: now,
  });
  try {
    await connection.beginTransaction();
    const [archiveResult] = await connection.execute(
      'DELETE FROM legacy_activity_archives WHERE activity_date <= DATE(?)',
      [cutoff],
    );
    // 0004 uses an expand migration, so the pre-rename compatibility table
    // remains during the observation window. Remove the duplicate originals
    // there as well; retaining either copy would violate the approved policy.
    const [compatibilityResult] = await connection.execute(
      'DELETE FROM legacy_activity_requests WHERE activity_date <= DATE(?)',
      [cutoff],
    );
    await connection.commit();
    const counts = {
      archivedActivities: Number(archiveResult.affectedRows),
      compatibilityCopies: Number(compatibilityResult.affectedRows),
    };
    await completeJob(connection, jobId, now, counts);
    return counts;
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    await failJob(connection, jobId, new Date(), error);
    throw error;
  }
}

async function processCognito(connection, client, poolId, candidate, now) {
  const username = await disableAndScrubCognito(client, poolId, candidate);
  if (!candidate.deleteAfter || new Date(candidate.deleteAfter) > now) {
    return { disabled: username ? 1 : 0, deleted: 0 };
  }

  const jobId = await createRunningJob(connection, {
    policyKey: 'cognito_accounts',
    dedupeKey: `cognito-delete:${candidate.userId}:${new Date(candidate.deleteAfter).toISOString()}`,
    targetUserId: candidate.userId,
    scheduledFor: candidate.deleteAfter,
    cutoffAt: candidate.deleteAfter,
    startedAt: now,
  });
  try {
    if (username) {
      await client.send(new AdminDeleteUserCommand({ UserPoolId: poolId, Username: username }));
    }
    await connection.beginTransaction();
    const [authResult] = await connection.execute(
      `DELETE FROM auth_accounts
        WHERE user_id = ?
          AND provider = 'cognito'`,
      [candidate.userId],
    );
    if (candidate.identityType === 'staff') {
      await connection.execute('DELETE FROM staff_profiles WHERE user_id = ?', [candidate.userId]);
      await connection.execute(
        `UPDATE users
            SET name = '탈퇴한 사용자',
                personal_data_erased_at = ?,
                cognito_delete_after = NULL,
                updated_at = ?
          WHERE id = ?`,
        [now, now, candidate.userId],
      );
    } else {
      await connection.execute(
        `UPDATE users
            SET cognito_delete_after = NULL,
                updated_at = ?
          WHERE id = ?`,
        [now, candidate.userId],
      );
    }
    await connection.commit();
    const counts = {
      cognitoUsers: username ? 1 : 0,
      authAccounts: Number(authResult.affectedRows),
      staffProfiles: candidate.identityType === 'staff' ? 1 : 0,
    };
    await completeJob(connection, jobId, now, counts);
    return { disabled: username ? 1 : 0, deleted: username ? 1 : 0 };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    await failJob(connection, jobId, new Date(), error);
    throw error;
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  assertNotLegacyDatabaseUrl(databaseUrl);
  const connection = await mysql.createConnection({
    uri: databaseUrl,
    ssl: sslOptions(),
    timezone: 'Z',
    dateStrings: false,
  });
  const now = new Date();
  let lockHeld = false;
  try {
    const [[lock]] = await connection.execute(
      "SELECT GET_LOCK('jshsus_privacy_retention', 0) AS acquired",
    );
    if (Number(lock.acquired) !== 1) throw new Error('RETENTION_LOCK_BUSY');
    lockHeld = true;
    const policies = await loadPolicies(connection);
    const candidates = await selectCandidates(connection, policies, now);
    const report = {
      mode: options.apply ? 'apply' : 'dry-run',
      studentAccounts: candidates.students.length,
      inactiveCognitoAccounts: candidates.cognito.length,
      dueCognitoDeletes: candidates.cognito.filter(
        (row) => row.deleteAfter && new Date(row.deleteAfter) <= now,
      ).length,
      pointRecords: candidates.pointRecordCount,
      pointCases: candidates.pointCaseCount,
      activityRequests: candidates.activityRequestCount,
      activityParticipants: candidates.activityParticipantCount,
      legacyActivityArchives: candidates.legacyActivityCount,
      securityLogs: candidates.logCount,
    };
    console.log(JSON.stringify(report));
    if (!options.apply) return;

    const region = process.env.AWS_REGION ?? 'ap-northeast-2';
    const poolId = process.env.COGNITO_USER_POOL_ID;
    if (!poolId) throw new Error('COGNITO_USER_POOL_ID is required for --apply.');
    const client = new CognitoIdentityProviderClient({ region });
    const totals = {
      studentAccounts: 0,
      identityStubs: 0,
      pointRecords: 0,
      pointAdjustments: 0,
      pointCases: 0,
      activityRequests: 0,
      activityEvents: 0,
      activityParticipants: 0,
      cognitoDisabled: 0,
      cognitoDeleted: 0,
      legacyActivityArchives: 0,
      legacyActivityCompatibilityCopies: 0,
      securityLogs: 0,
      failures: 0,
    };
    try {
      const counts = await eraseStudentRecordsByDate(
        connection,
        candidates.studentCutoff,
        new Date(),
      );
      for (const key of Object.keys(counts)) totals[key] = (totals[key] ?? 0) + counts[key];
    } catch {
      totals.failures += 1;
    }
    for (const candidate of candidates.students) {
      try {
        const counts = await eraseStudentIdentityStub(connection, candidate, new Date());
        totals.studentAccounts += 1;
        for (const key of Object.keys(counts)) totals[key] = (totals[key] ?? 0) + counts[key];
      } catch {
        totals.failures += 1;
      }
    }
    for (const candidate of candidates.cognito) {
      try {
        const counts = await processCognito(connection, client, poolId, candidate, new Date());
        totals.cognitoDisabled += counts.disabled;
        totals.cognitoDeleted += counts.deleted;
      } catch {
        totals.failures += 1;
      }
    }
    try {
      const archiveCounts = await eraseLegacyActivityArchives(
        connection,
        candidates.legacyActivityCutoff,
        new Date(),
      );
      totals.legacyActivityArchives = archiveCounts.archivedActivities;
      totals.legacyActivityCompatibilityCopies = archiveCounts.compatibilityCopies;
    } catch {
      totals.failures += 1;
    }
    try {
      const logCounts = await eraseSecurityLogs(connection, candidates.logCutoff, new Date());
      totals.securityLogs = logCounts.auditLogs;
    } catch {
      totals.failures += 1;
    }
    console.log(JSON.stringify({ mode: 'applied', ...totals }));
    if (totals.failures > 0) process.exitCode = 1;
  } finally {
    if (lockHeld) {
      await connection.execute("SELECT RELEASE_LOCK('jshsus_privacy_retention')").catch(() => {});
    }
    await connection.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Privacy retention failed: ${safeErrorCode(error)}`);
    process.exit(1);
  });
}

module.exports = {
  POLICY_APPROVAL,
  REQUIRED_POLICIES,
  STUDENT_RECORD_DATE_FIELDS,
  assertNotLegacyDatabaseUrl,
  cutoffFrom,
  parseOptions,
  safeErrorCode,
};
