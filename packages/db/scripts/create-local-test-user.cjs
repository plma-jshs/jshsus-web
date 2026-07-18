const { createHash } = require('node:crypto');
const mysql = require('mysql2/promise');
const { assertDemoSeedAllowed } = require('./local-seed-safety.cjs');
const {
  DEFAULT_TEST_PASSWORD,
  DEFAULT_TEST_STUDENT_NO,
  DEFAULT_TEST_USERNAME,
  isKnownDemoProfile,
  isKnownLegacyDemoProfile,
} = require('./demo-account-policy.cjs');
const { seedConnectionOptions } = require('./seed-connection.cjs');

const databaseUrl = assertDemoSeedAllowed();
const username = process.env.TEST_USER_USERNAME || DEFAULT_TEST_USERNAME;
const password = process.env.TEST_USER_PASSWORD || DEFAULT_TEST_PASSWORD;
const studentNo = Number(process.env.TEST_USER_STUDENT_NO || DEFAULT_TEST_STUDENT_NO);
if (!Number.isSafeInteger(studentNo) || studentNo <= 0) {
  throw new Error('TEST_USER_STUDENT_NO must be a positive integer.');
}
const staffNo = Number(process.env.TEST_USER_STAFF_NO || 999999);
if (!Number.isSafeInteger(staffNo) || staffNo < 100000 || staffNo > 999999) {
  throw new Error('TEST_USER_STAFF_NO must be a six-digit integer.');
}
const passwordHash = createHash('sha512').update(password).digest('base64');

async function selectOne(connection, query, params) {
  const [rows] = await connection.execute(query, params);
  return rows[0] || null;
}

async function loadUserProfile(connection, userId) {
  if (!userId) return null;
  const profile = await selectOne(
    connection,
    `SELECT id, student_no AS studentNo, name
     FROM users
     WHERE id = ?
     LIMIT 1 FOR UPDATE`,
    [userId],
  );
  if (!profile) return null;

  const [accounts] = await connection.execute(
    `SELECT provider_account_id AS accountId
     FROM auth_accounts
     WHERE user_id = ? AND provider = 'local'`,
    [userId],
  );
  return {
    ...profile,
    localAccountIds: accounts.map((account) => account.accountId).filter(Boolean),
  };
}

async function migrateLegacyDemoStudent(
  connection,
  legacyUserId,
  canonicalUserId,
  canonicalStudentId,
) {
  const legacy = await selectOne(
    connection,
    `SELECT u.id AS userId, s.id AS studentId
     FROM users u
     LEFT JOIN students s ON s.user_id = u.id
     WHERE u.id = ?
     LIMIT 1 FOR UPDATE`,
    [legacyUserId],
  );
  if (!legacy) return;

  if (legacy.studentId) {
    await connection.execute('UPDATE point_records SET student_id = ? WHERE student_id = ?', [
      canonicalStudentId,
      legacy.studentId,
    ]);
    await connection.execute(
      'UPDATE IGNORE activity_request_participants SET student_id = ? WHERE student_id = ?',
      [canonicalStudentId, legacy.studentId],
    );
    await connection.execute('DELETE FROM activity_request_participants WHERE student_id = ?', [
      legacy.studentId,
    ]);
    await connection.execute('UPDATE activity_requests SET student_id = ? WHERE student_id = ?', [
      canonicalStudentId,
      legacy.studentId,
    ]);
    await connection.execute('UPDATE point_award_cases SET student_id = ? WHERE student_id = ?', [
      canonicalStudentId,
      legacy.studentId,
    ]);
    await connection.execute('DELETE FROM students WHERE id = ?', [legacy.studentId]);
  }

  // A roommate exclusion involving two aliases of the same fixture can become
  // a self-reference or duplicate after consolidation, so discard only those
  // fixture-only rows before the user FK is migrated.
  await connection.execute(
    `DELETE FROM dorm_roommate_blocks
     WHERE student_user_id = ? OR blocked_user_id = ?`,
    [legacy.userId, legacy.userId],
  );

  const userReferences = [
    ['activity_request_events', 'actor_id'],
    ['activity_requests', 'created_by_id'],
    ['activity_requests', 'reviewed_by_id'],
    ['activity_requests', 'teacher_id'],
    ['audit_logs', 'actor_id'],
    ['comments', 'author_id'],
    ['device_case_commands', 'actor_id'],
    ['dorm_assignments', 'user_id'],
    ['dorm_roommate_blocks', 'submitted_by'],
    ['dorm_reports', 'user_id'],
    ['files', 'owner_id'],
    ['lost_items', 'author_id'],
    ['notices', 'author_id'],
    ['notifications', 'user_id'],
    ['petition_answers', 'author_id'],
    ['petition_participants', 'user_id'],
    ['petitions', 'author_id'],
    ['point_adjustments', 'actor_id'],
    ['point_award_cases', 'handled_by_id'],
    ['point_records', 'teacher_id'],
    ['posts', 'author_id'],
    ['reactions', 'user_id'],
    ['reports', 'reporter_id'],
    ['school_events', 'created_by_id'],
    ['song_requests', 'requester_id'],
    ['staff_profiles', 'user_id'],
    ['user_permissions', 'user_id'],
    ['user_roles', 'user_id'],
    ['wake_song_request_events', 'actor_id'],
    ['wake_song_requests', 'requester_id'],
    ['wake_song_requests', 'reviewed_by_id'],
  ];

  for (const [table, column] of userReferences) {
    await connection.query(
      `UPDATE IGNORE \`${table}\` SET \`${column}\` = ? WHERE \`${column}\` = ?`,
      [canonicalUserId, legacy.userId],
    );
    await connection.query(`DELETE FROM \`${table}\` WHERE \`${column}\` = ?`, [legacy.userId]);
  }

  await connection.execute('DELETE FROM auth_accounts WHERE user_id = ?', [legacy.userId]);
  await connection.execute('DELETE FROM users WHERE id = ?', [legacy.userId]);
}

async function main() {
  const connection = await mysql.createConnection(seedConnectionOptions(databaseUrl));

  try {
    await connection.beginTransaction();

    // Keep the identity already linked to TEST_USER_USERNAME. Changing the
    // fixture number must update that user instead of leaving an orphaned user.
    const usernameOwner = await selectOne(
      connection,
      `SELECT u.id, u.student_no AS studentNo
       FROM auth_accounts a
       INNER JOIN users u ON u.id = a.user_id
       WHERE a.provider = 'local' AND a.provider_account_id = ?
       LIMIT 1 FOR UPDATE`,
      [username],
    );

    const numberOwner = await selectOne(
      connection,
      'SELECT id FROM users WHERE student_no = ? LIMIT 1 FOR UPDATE',
      [studentNo],
    );
    const usernameProfile = await loadUserProfile(connection, usernameOwner?.id);
    const numberProfile = await loadUserProfile(connection, numberOwner?.id);

    if (
      usernameProfile &&
      !isKnownDemoProfile(usernameProfile, username) &&
      !isKnownLegacyDemoProfile(usernameProfile)
    ) {
      throw new Error(
        `TEST_USER_USERNAME ${username} belongs to a non-demo user; refusing to overwrite it.`,
      );
    }

    if (!usernameProfile && numberProfile && !isKnownDemoProfile(numberProfile, username)) {
      throw new Error(
        `TEST_USER_STUDENT_NO ${studentNo} belongs to a non-demo user; refusing to overwrite it.`,
      );
    }

    const legacyProfiles = [];
    let user = usernameOwner || numberOwner;
    if (usernameOwner && numberOwner && usernameOwner.id !== numberOwner.id) {
      if (
        !isKnownLegacyDemoProfile(usernameProfile) ||
        !isKnownDemoProfile(numberProfile, username)
      ) {
        throw new Error('Conflicting test identities are not both recognized demo fixtures.');
      }
      user = numberOwner;
      legacyProfiles.push(usernameProfile);
    }

    if (!user) {
      const [result] = await connection.execute(
        `INSERT INTO users (student_no, name, grade, class_no, number, user_status)
         VALUES (?, '테스트', 9, 9, 99, 'active')`,
        [studentNo],
      );
      user = { id: result.insertId };
    } else {
      await connection.execute(
        `UPDATE users
         SET student_no = ?, name = '테스트', grade = 9, class_no = 9, number = 99,
           user_status = 'active', updated_at = now(3)
         WHERE id = ?`,
        [studentNo, user.id],
      );
    }

    const studentByNumber = await selectOne(
      connection,
      'SELECT id, user_id AS userId FROM students WHERE student_no = ? LIMIT 1 FOR UPDATE',
      [studentNo],
    );
    const studentByUser = await selectOne(
      connection,
      'SELECT id FROM students WHERE user_id = ? LIMIT 1 FOR UPDATE',
      [user.id],
    );
    if (studentByNumber && studentByNumber.userId !== user.id) {
      throw new Error(`TEST_USER_STUDENT_NO ${studentNo} is already used by another student.`);
    }
    if (studentByUser) {
      await connection.execute(
        `UPDATE students
         SET student_no = ?, name = '테스트', grade = 9, class_no = 9, number = 99,
           updated_at = now(3)
         WHERE id = ?`,
        [studentNo, studentByUser.id],
      );
    } else {
      await connection.execute(
        `INSERT INTO students (user_id, student_no, name, grade, class_no, number, current_point)
         VALUES (?, ?, '테스트', 9, 9, 99, 0)`,
        [user.id, studentNo],
      );
    }

    const canonicalStudent = await selectOne(
      connection,
      'SELECT id FROM students WHERE user_id = ? LIMIT 1 FOR UPDATE',
      [user.id],
    );
    const [knownLegacyRows] = await connection.execute(
      `SELECT DISTINCT u.id
       FROM users u
       INNER JOIN auth_accounts a ON a.user_id = u.id
       WHERE u.student_no = 29999 AND u.id <> ?
         AND u.name IN ('테스트', '테스트 학생', '김성찬')
         AND a.provider = 'local' AND a.provider_account_id IN ('test', 'test.student')
       FOR UPDATE`,
      [user.id],
    );
    for (const legacyRow of knownLegacyRows) {
      const profile = await loadUserProfile(connection, legacyRow.id);
      if (isKnownLegacyDemoProfile(profile)) legacyProfiles.push(profile);
    }

    const migratedLegacyIds = new Set();
    for (const legacyProfile of legacyProfiles) {
      if (!legacyProfile || migratedLegacyIds.has(legacyProfile.id)) continue;
      migratedLegacyIds.add(legacyProfile.id);
      await migrateLegacyDemoStudent(connection, legacyProfile.id, user.id, canonicalStudent.id);
    }

    await connection.execute(
      `UPDATE students
       SET current_point = (
         SELECT COALESCE(SUM(point), 0)
         FROM point_records
         WHERE student_id = ? AND canceled_at IS NULL
       ), updated_at = now(3)
       WHERE id = ?`,
      [canonicalStudent.id, canonicalStudent.id],
    );

    await connection.execute(
      `DELETE FROM auth_accounts
       WHERE user_id = ? AND provider = 'local' AND provider_account_id <> ?`,
      [user.id, username],
    );
    await connection.execute(
      `INSERT INTO auth_accounts
        (user_id, provider, provider_account_id, password_hash, password_algorithm)
       VALUES (?, 'local', ?, ?, 'legacy-sha512')
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), password_hash = VALUES(password_hash),
         password_algorithm = VALUES(password_algorithm), updated_at = now(3)`,
      [user.id, username, passwordHash],
    );

    const staffNumberOwner = await selectOne(
      connection,
      `SELECT user_id AS userId
       FROM staff_profiles
       WHERE staff_no = ?
       LIMIT 1 FOR UPDATE`,
      [staffNo],
    );
    if (staffNumberOwner && staffNumberOwner.userId !== user.id) {
      throw new Error(`TEST_USER_STAFF_NO ${staffNo} belongs to another account.`);
    }
    const staffByUser = await selectOne(
      connection,
      `SELECT id
       FROM staff_profiles
       WHERE user_id = ?
       LIMIT 1 FOR UPDATE`,
      [user.id],
    );
    if (staffByUser) {
      await connection.execute(
        `UPDATE staff_profiles
         SET staff_no = ?, name = '테스트', department = NULL, title = NULL,
           updated_at = now(3)
         WHERE id = ?`,
        [staffNo, staffByUser.id],
      );
    } else {
      await connection.execute(
        `INSERT INTO staff_profiles (user_id, staff_no, name)
         VALUES (?, ?, '테스트')`,
        [user.id, staffNo],
      );
    }

    const [requiredRoles] = await connection.execute(
      `SELECT id, name FROM roles WHERE name IN ('student', 'teacher', 'system_admin') FOR UPDATE`,
    );
    if (requiredRoles.length !== 3) {
      throw new Error('Required demo roles are missing; run all database migrations first.');
    }

    await connection.execute(
      `INSERT IGNORE INTO user_roles (user_id, role_id)
       SELECT ?, id FROM roles WHERE name IN ('student', 'teacher', 'system_admin')`,
      [user.id],
    );

    await connection.commit();
    console.log(
      `Demo test account ready: ${username} / ${studentNo} 테스트 (student, teacher, system_admin; staff ${staffNo})`,
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
