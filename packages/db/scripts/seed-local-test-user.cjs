#!/usr/bin/env node
const mysql = require('mysql2/promise');
const { assertLocalSeedAllowed } = require('./local-seed-safety.cjs');
const { loadLocalEnv } = require('./bootstrap-core-data.cjs');
const { seedConnectionOptions } = require('./seed-connection.cjs');

function positiveInteger(value, fallback, label) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

async function selectOne(connection, query, values = []) {
  const [rows] = await connection.execute(query, values);
  return rows[0] ?? null;
}

async function seedLocalTestUser(environment = process.env) {
  loadLocalEnv();
  const databaseUrl = assertLocalSeedAllowed(environment);
  const studentNo = positiveInteger(
    environment.DEV_AUTH_STUDENT_NO ?? environment.TEST_USER_STUDENT_NO,
    9999,
    'DEV_AUTH_STUDENT_NO',
  );
  const name = String(environment.TEST_USER_NAME ?? '테스트').trim() || '테스트';
  const grade = positiveInteger(environment.TEST_USER_GRADE, 3, 'TEST_USER_GRADE');
  const classNo = positiveInteger(environment.TEST_USER_CLASS_NO, 9, 'TEST_USER_CLASS_NO');
  const number = positiveInteger(environment.TEST_USER_NUMBER, 99, 'TEST_USER_NUMBER');

  const connection = await mysql.createConnection(seedConnectionOptions(databaseUrl, environment));
  try {
    await connection.beginTransaction();

    await connection.execute(
      `INSERT INTO users
        (student_no, name, grade, class_no, number, user_status)
       VALUES (?, ?, ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         grade = VALUES(grade),
         class_no = VALUES(class_no),
         number = VALUES(number),
         user_status = 'active',
         updated_at = now(3)`,
      [studentNo, name, grade, classNo, number],
    );

    const user = await selectOne(connection, 'SELECT id FROM users WHERE student_no = ? LIMIT 1', [
      studentNo,
    ]);
    if (!user?.id) throw new Error('The local test user could not be created.');

    await connection.execute(
      `INSERT INTO students
        (user_id, student_no, name, grade, class_no, number, current_point)
       VALUES (?, ?, ?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id),
         name = VALUES(name),
         grade = VALUES(grade),
         class_no = VALUES(class_no),
         number = VALUES(number),
         updated_at = now(3)`,
      [user.id, studentNo, name, grade, classNo, number],
    );

    const role = await selectOne(
      connection,
      "SELECT id FROM roles WHERE name = 'system_admin' LIMIT 1",
    );
    if (!role?.id)
      throw new Error('The system_admin role is missing; run the core bootstrap first.');

    await connection.execute('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [
      user.id,
      role.id,
    ]);

    const activeSchoolYear = await selectOne(
      connection,
      'SELECT year FROM school_years WHERE is_active = 1 ORDER BY year DESC LIMIT 1',
    );
    const student = await selectOne(
      connection,
      'SELECT id FROM students WHERE student_no = ? LIMIT 1',
      [studentNo],
    );
    if (activeSchoolYear?.year && student?.id) {
      await connection.execute(
        `INSERT INTO student_enrollments
          (student_id, school_year, student_no, grade, class_no, number, student_enrollment_status)
         VALUES (?, ?, ?, ?, ?, ?, 'active')
         ON DUPLICATE KEY UPDATE
           student_no = VALUES(student_no),
           grade = VALUES(grade),
           class_no = VALUES(class_no),
           number = VALUES(number),
           student_enrollment_status = 'active',
           status_changed_at = now(3),
           updated_at = now(3)`,
        [student.id, activeSchoolYear.year, studentNo, grade, classNo, number],
      );
    }

    await connection.commit();
    return { userId: user.id, studentNo, name };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

async function main() {
  const result = await seedLocalTestUser();
  console.log(
    `Local test user ready: ${result.studentNo} (${result.name}), ` +
      `user_id=${result.userId}, role=system_admin.`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

module.exports = { seedLocalTestUser };
