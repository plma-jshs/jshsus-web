const { createHash } = require('node:crypto');
const mysql = require('mysql2/promise');
const { assertLocalSeedAllowed } = require('./local-seed-safety.cjs');

const databaseUrl = assertLocalSeedAllowed();

const username = process.env.TEST_USER_USERNAME || 'test.student';
const password = process.env.TEST_USER_PASSWORD || 'Test1234!';
const studentNo = Number(process.env.TEST_USER_STUDENT_NO || 29999);
if (!Number.isSafeInteger(studentNo) || studentNo <= 0) {
  throw new Error('TEST_USER_STUDENT_NO must be a positive integer.');
}
const passwordHash = createHash('sha512').update(password).digest('base64');

async function main() {
  const connection = await mysql.createConnection(databaseUrl);

  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO users (student_no, name, grade, class_no, number, user_status)
       VALUES (?, '테스트 학생', 2, 9, 99, 'active')
       ON DUPLICATE KEY UPDATE name = VALUES(name), user_status = 'active', updated_at = now(3)`,
      [studentNo],
    );

    const [[user]] = await connection.execute('SELECT id FROM users WHERE student_no = ? LIMIT 1', [
      studentNo,
    ]);

    await connection.execute(
      `INSERT INTO auth_accounts (user_id, provider, provider_account_id, password_hash, password_algorithm)
       VALUES (?, 'local', ?, ?, 'legacy-sha512')
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), password_hash = VALUES(password_hash),
         password_algorithm = VALUES(password_algorithm), updated_at = now(3)`,
      [user.id, username, passwordHash],
    );

    await connection.execute(
      `INSERT IGNORE INTO user_roles (user_id, role_id)
       SELECT ?, id FROM roles WHERE name = 'student'`,
      [user.id],
    );

    await connection.execute(
      `INSERT INTO students (user_id, student_no, name, grade, class_no, number, current_point)
       VALUES (?, ?, '테스트 학생', 2, 9, 99, 0)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), name = VALUES(name),
         grade = VALUES(grade), class_no = VALUES(class_no), number = VALUES(number),
         updated_at = now(3)`,
      [user.id, studentNo],
    );
    await connection.commit();
    console.log(`Local test account ready: ${username} (${studentNo})`);
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
