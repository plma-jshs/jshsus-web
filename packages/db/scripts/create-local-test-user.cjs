const { createHash } = require('node:crypto');
const mysql = require('mysql2/promise');
const { assertLocalSeedAllowed } = require('./local-seed-safety.cjs');
const {
  DEFAULT_TEST_PASSWORD,
  DEFAULT_TEST_STUDENT_NO,
  DEFAULT_TEST_USERNAME,
  isKnownTestProfile,
} = require('./test-account-policy.cjs');
const { seedConnectionOptions } = require('./seed-connection.cjs');

const databaseUrl = assertLocalSeedAllowed();
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

    if (usernameProfile && !isKnownTestProfile(usernameProfile, username)) {
      throw new Error(
        `TEST_USER_USERNAME ${username} belongs to a non-test user; refusing to overwrite it.`,
      );
    }

    if (!usernameProfile && numberProfile && !isKnownTestProfile(numberProfile, username)) {
      throw new Error(
        `TEST_USER_STUDENT_NO ${studentNo} belongs to a non-test user; refusing to overwrite it.`,
      );
    }

    let user = usernameOwner || numberOwner;
    if (usernameOwner && numberOwner && usernameOwner.id !== numberOwner.id) {
      throw new Error('Conflicting local test identities must be resolved manually.');
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
      throw new Error(
        'Required test account roles are missing; run all database migrations first.',
      );
    }

    await connection.execute(
      `INSERT IGNORE INTO user_roles (user_id, role_id)
       SELECT ?, id FROM roles WHERE name IN ('student', 'teacher', 'system_admin')`,
      [user.id],
    );

    await connection.commit();
    console.log(
      `Local test account ready: ${username} / ${studentNo} 테스트 (student, teacher, system_admin; staff ${staffNo})`,
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
