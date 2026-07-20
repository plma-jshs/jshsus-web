const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const mysql = require('mysql2/promise');
const { seedConnectionOptions } = require('./seed-connection.cjs');

const ROOT_DIR = resolve(__dirname, '../../..');
const TEACHER_CLEANUP_NAMES = ['legacy import', '강재환'];

function loadEnv() {
  const envPath = resolve(ROOT_DIR, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

function parseArgs(argv) {
  const options = { _: [] };
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      options._.push(arg);
      continue;
    }
    const [key, value = 'true'] = arg.slice(2).split('=', 2);
    options[key] = value;
  }
  return options;
}

function requireOption(options, key) {
  const value = options[key];
  if (typeof value !== 'string' || !value) throw new Error(`--${key} is required.`);
  return value;
}

async function createTargetConnection() {
  loadEnv();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  return mysql.createConnection(seedConnectionOptions(process.env.DATABASE_URL, process.env));
}

async function summary(connection) {
  const [[thanks]] = await connection.execute('SELECT COUNT(*) AS count FROM thanks_messages');
  const [[wakeRequests]] = await connection.execute(
    'SELECT COUNT(*) AS count FROM wake_song_requests',
  );
  const [[wakeEvents]] = await connection.execute(
    'SELECT COUNT(*) AS count FROM wake_song_request_events',
  );
  const [[phones]] = await connection.execute(
    "SELECT COUNT(*) AS count FROM users WHERE phone REGEXP '^10[0-9]{8}$'",
  );
  const [studentRows] = await connection.execute(
    `SELECT students.id,
            students.student_no AS studentNo,
            students.name,
            students.user_id AS userId,
            users.name AS userName
       FROM students
       LEFT JOIN users ON users.id = students.user_id
      WHERE students.student_no = 2202`,
  );
  const teacherCleanupTargets = await findTeacherCleanupTargets(connection);

  console.log(
    JSON.stringify(
      {
        thanksMessages: Number(thanks.count),
        wakeSongRequests: Number(wakeRequests.count),
        wakeSongRequestEvents: Number(wakeEvents.count),
        tenDigitPhones: Number(phones.count),
        student2202: studentRows,
        teacherCleanupTargets,
      },
      null,
      2,
    ),
  );
}

async function findTeacherCleanupTargets(connection) {
  const normalizedNames = TEACHER_CLEANUP_NAMES.map((name) => name.toLowerCase());
  const placeholders = normalizedNames.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT users.id AS userId,
            users.student_no AS username,
            users.name AS userName,
            staff_profiles.id AS staffProfileId,
            staff_profiles.staff_no AS staffNo,
            staff_profiles.name AS staffProfileName,
            GROUP_CONCAT(roles.name ORDER BY roles.name) AS roles
       FROM users
       LEFT JOIN staff_profiles ON staff_profiles.user_id = users.id
       LEFT JOIN user_roles ON user_roles.user_id = users.id
       LEFT JOIN roles ON roles.id = user_roles.role_id
      WHERE (
              LOWER(COALESCE(users.name, '')) IN (${placeholders})
           OR LOWER(COALESCE(staff_profiles.name, '')) IN (${placeholders})
            )
        AND (staff_profiles.id IS NOT NULL OR roles.name = 'teacher')
      GROUP BY users.id,
               users.student_no,
               users.name,
               staff_profiles.id,
               staff_profiles.staff_no,
               staff_profiles.name
      ORDER BY users.id`,
    [...normalizedNames, ...normalizedNames],
  );
  return rows;
}

function readThanksFile(path) {
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  if (path.endsWith('.tsv')) {
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [schoolNumber, message, submittedAt] = line.split('\t');
        if (!schoolNumber || !message || !submittedAt) {
          throw new Error(`Invalid thanks TSV row: ${line.slice(0, 80)}`);
        }
        return {
          schoolNumber: Buffer.from(schoolNumber, 'base64').toString('utf8'),
          message: Buffer.from(message, 'base64').toString('utf8'),
          submittedAt,
        };
      });
  }
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function replaceThanksMessages(connection, path) {
  const rows = readThanksFile(path);
  await connection.beginTransaction();
  try {
    await connection.execute('DELETE FROM thanks_messages');
    for (let index = 0; index < rows.length; index += 250) {
      const chunk = rows.slice(index, index + 250);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const values = chunk.flatMap((row) => [
        String(row.schoolNumber),
        String(row.message),
        row.submittedAt,
        row.submittedAt,
        row.submittedAt,
      ]);
      await connection.execute(
        `INSERT INTO thanks_messages
          (school_number, message, submitted_at, created_at, updated_at)
         VALUES ${placeholders}`,
        values,
      );
    }
    await connection.commit();
    console.log(`Replaced thanks_messages with ${rows.length} rows.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function cleanupContentData(connection) {
  await connection.beginTransaction();
  try {
    const [wakeEvents] = await connection.execute('DELETE FROM wake_song_request_events');
    const [wakeRequests] = await connection.execute('DELETE FROM wake_song_requests');
    const [phones] = await connection.execute(
      "UPDATE users SET phone = CONCAT('0', phone), updated_at = NOW(3) WHERE phone REGEXP '^10[0-9]{8}$'",
    );
    const [students] = await connection.execute(
      "UPDATE students SET name = '김민찬', updated_at = NOW(3) WHERE student_no = 2202",
    );
    const [users] = await connection.execute(
      `UPDATE users
          INNER JOIN students ON students.user_id = users.id
             SET users.name = '김민찬', users.updated_at = NOW(3)
       WHERE students.student_no = 2202`,
    );
    await connection.commit();
    console.log(
      JSON.stringify(
        {
          deletedWakeSongEvents: wakeEvents.affectedRows,
          deletedWakeSongRequests: wakeRequests.affectedRows,
          fixedPhones: phones.affectedRows,
          fixedStudentRows: students.affectedRows,
          fixedUserRows: users.affectedRows,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function cleanupTeacherOptions(connection) {
  const targets = await findTeacherCleanupTargets(connection);
  const targetIds = targets.map((row) => Number(row.userId)).filter(Number.isFinite);
  if (targetIds.length === 0) {
    console.log(JSON.stringify({ removedTeacherRoles: 0, removedStaffProfiles: 0 }, null, 2));
    return;
  }

  const placeholders = targetIds.map(() => '?').join(', ');
  await connection.beginTransaction();
  try {
    const [teacherRoles] = await connection.execute(
      `DELETE user_roles
         FROM user_roles
         INNER JOIN roles ON roles.id = user_roles.role_id
        WHERE user_roles.user_id IN (${placeholders})
          AND roles.name = 'teacher'`,
      targetIds,
    );
    const [staffProfiles] = await connection.execute(
      `DELETE FROM staff_profiles WHERE user_id IN (${placeholders})`,
      targetIds,
    );
    await connection.commit();
    console.log(
      JSON.stringify(
        {
          targets,
          removedTeacherRoles: teacherRoles.affectedRows,
          removedStaffProfiles: staffProfiles.affectedRows,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const command = options._[0];
  const connection = await createTargetConnection();
  try {
    if (command === 'summary') {
      await summary(connection);
    } else if (command === 'replace-thanks') {
      await replaceThanksMessages(connection, requireOption(options, 'file'));
    } else if (command === 'cleanup') {
      await cleanupContentData(connection);
    } else if (command === 'teacher-summary') {
      console.log(JSON.stringify(await findTeacherCleanupTargets(connection), null, 2));
    } else if (command === 'cleanup-teachers') {
      await cleanupTeacherOptions(connection);
    } else {
      throw new Error(
        'Usage: node scripts/maintenance-content-data.cjs <summary|replace-thanks|cleanup|teacher-summary|cleanup-teachers>',
      );
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
