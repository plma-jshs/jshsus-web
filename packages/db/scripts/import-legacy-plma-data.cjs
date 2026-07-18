/*
 * Imports a deliberately small, safe subset of the legacy PLMA exports.
 *
 * This tool never executes the supplied SQL. It only reads the three known
 * INSERT statements and writes parameterised rows into a *local* v26 DB.
 * Password hashes, legacy permission JSON, point balances and obsolete flags
 * are intentionally discarded.
 *
 * Usage:
 *   pnpm --filter @jshsus/db db:import-legacy-plma -- /mnt/c/path/to/dumps
 * or set LEGACY_PLMA_DUMP_DIR to the directory containing the three dumps.
 */

const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const mysql = require('mysql2/promise');
const { assertDemoSeedAllowed } = require('./local-seed-safety.cjs');
const { seedConnectionOptions } = require('./seed-connection.cjs');

const databaseUrl = assertDemoSeedAllowed();
const dumpDirectory =
  process.argv.slice(2).find((argument) => argument.length > 2) || process.env.LEGACY_PLMA_DUMP_DIR;
const DUMP_FILES = {
  reason: 'plma_reason_2026-07-16_180731.sql',
  teacher: 'plma_teacher_2026-07-16_181431.sql',
  user: 'plma_user_2026-07-16_181443.sql',
};

function decodeEscapedCharacter(character) {
  const escapes = { 0: '\0', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a' };
  return escapes[character] ?? character;
}

/** Parse a MySQL VALUES list without evaluating arbitrary SQL. */
function parseValuesRows(values) {
  const rows = [];
  let cursor = 0;

  while (cursor < values.length) {
    while (cursor < values.length && values[cursor] !== '(') cursor += 1;
    if (cursor >= values.length) break;
    cursor += 1;
    const row = [];

    while (cursor < values.length) {
      while (/\s/.test(values[cursor] ?? '')) cursor += 1;
      let value = '';
      let quoted = values[cursor] === "'";

      if (quoted) {
        cursor += 1;
        while (cursor < values.length) {
          const character = values[cursor];
          if (character === '\\') {
            cursor += 1;
            value += decodeEscapedCharacter(values[cursor] ?? '');
            cursor += 1;
            continue;
          }
          if (character === "'") {
            if (values[cursor + 1] === "'") {
              value += "'";
              cursor += 2;
              continue;
            }
            cursor += 1;
            break;
          }
          value += character;
          cursor += 1;
        }
      } else {
        while (cursor < values.length && values[cursor] !== ',' && values[cursor] !== ')') {
          value += values[cursor];
          cursor += 1;
        }
        value = value.trim();
      }

      row.push(quoted ? value : value.toUpperCase() === 'NULL' ? null : Number(value));
      while (/\s/.test(values[cursor] ?? '')) cursor += 1;
      if (values[cursor] === ',') {
        cursor += 1;
        continue;
      }
      if (values[cursor] === ')') {
        cursor += 1;
        break;
      }
      throw new Error('Could not parse a legacy PLMA INSERT value list.');
    }
    rows.push(row);
  }

  return rows;
}

function extractRows(sqlText, table) {
  const prefix = `INSERT INTO \`${table}\` VALUES `;
  const start = sqlText.indexOf(prefix);
  if (start < 0) throw new Error(`Expected INSERT data for legacy table ${table}.`);
  const end = sqlText.indexOf(';', start);
  if (end < 0) throw new Error(`Legacy table ${table} has an incomplete INSERT statement.`);
  return parseValuesRows(sqlText.slice(start + prefix.length, end));
}

function toInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : Number.NaN;
}

function normalizeGender(value) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();
  if (normalized === 'F' || normalized === 'FEMALE' || normalized === '여') return 'female';
  return 'male';
}

function parseManagedClasses(value) {
  const matches = String(value ?? '').matchAll(/([1-3])\s*(?:학년)?\s*[-/]\s*([1-4])/g);
  const result = [];
  const seen = new Set();
  for (const match of matches) {
    const grade = Number(match[1]);
    const classNo = Number(match[2]);
    const key = `${grade}:${classNo}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ grade, classNo });
    }
  }
  return result;
}

async function selectOne(connection, query, values = []) {
  const [rows] = await connection.execute(query, values);
  return rows[0] ?? null;
}

async function importStudents(connection, rows, studentRoleId) {
  let imported = 0;
  for (const row of rows) {
    const [
      ,
      sourceStudentNo,
      rawName,
      rawGrade,
      rawClassNo,
      rawNumber,
      ,
      ,
      ,
      ,
      ,
      ,
      rawGender,
      rawPhone,
    ] = row;
    const studentNo = toInteger(sourceStudentNo);
    const grade = toInteger(rawGrade);
    const classNo = toInteger(rawClassNo);
    const number = toInteger(rawNumber);
    const name = String(rawName ?? '').trim();
    if (
      !name ||
      !Number.isInteger(studentNo) ||
      grade < 1 ||
      grade > 3 ||
      classNo < 1 ||
      classNo > 4 ||
      number < 1 ||
      number > 20 ||
      studentNo !== grade * 1000 + classNo * 100 + number
    ) {
      continue;
    }

    const legacyId = `plma-student-${studentNo}`;
    let user = await selectOne(connection, 'SELECT id FROM users WHERE student_no = ? LIMIT 1', [
      studentNo,
    ]);
    if (!user) {
      const [result] = await connection.execute(
        `INSERT INTO users
          (student_no, legacy_jshsus_id, name, grade, class_no, number, gender, phone, user_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          studentNo,
          legacyId,
          name,
          grade,
          classNo,
          number,
          normalizeGender(rawGender),
          rawPhone || null,
        ],
      );
      user = { id: result.insertId };
    } else {
      await connection.execute(
        `UPDATE users
         SET legacy_jshsus_id = ?, name = ?, grade = ?, class_no = ?, number = ?, gender = ?,
             phone = ?, user_status = 'active', updated_at = now(3)
         WHERE id = ?`,
        [
          legacyId,
          name,
          grade,
          classNo,
          number,
          normalizeGender(rawGender),
          rawPhone || null,
          user.id,
        ],
      );
    }

    await connection.execute(
      `INSERT INTO students (user_id, student_no, name, grade, class_no, number, current_point)
       VALUES (?, ?, ?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), name = VALUES(name), grade = VALUES(grade),
         class_no = VALUES(class_no), number = VALUES(number), updated_at = now(3)`,
      [user.id, studentNo, name, grade, classNo, number],
    );
    await connection.execute('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [
      user.id,
      studentRoleId,
    ]);
    imported += 1;
  }
  return imported;
}

async function importTeachers(connection, rows, teacherRoleId) {
  let imported = 0;
  for (const row of rows) {
    const [, rawName, , , , , rawLegacyStaffNo, rawManagedClasses] = row;
    const legacyStaffNo = toInteger(rawLegacyStaffNo);
    const name = String(rawName ?? '').trim();
    if (!name || !Number.isInteger(legacyStaffNo) || legacyStaffNo <= 0) continue;

    // v26 teacher numbers are deliberately six digits. The old number is kept
    // in legacy_jshsus_id for traceability; it is never used for authentication.
    const staffNo = 100000 + legacyStaffNo;
    if (staffNo > 999999) continue;
    const legacyId = `plma-teacher-${legacyStaffNo}`;
    const managedClasses = JSON.stringify(parseManagedClasses(rawManagedClasses));
    let user = await selectOne(
      connection,
      'SELECT id FROM users WHERE legacy_jshsus_id = ? LIMIT 1',
      [legacyId],
    );
    if (!user) {
      const [result] = await connection.execute(
        `INSERT INTO users (student_no, legacy_jshsus_id, name, user_status)
         VALUES (?, ?, ?, 'active')`,
        [-staffNo, legacyId, name],
      );
      user = { id: result.insertId };
    } else {
      await connection.execute(
        `UPDATE users SET student_no = ?, name = ?, user_status = 'active', updated_at = now(3)
         WHERE id = ?`,
        [-staffNo, name, user.id],
      );
    }

    await connection.execute(
      `INSERT INTO staff_profiles (user_id, staff_no, name, department, title, managed_classes)
       VALUES (?, ?, ?, NULL, NULL, CAST(? AS JSON))
       ON DUPLICATE KEY UPDATE name = VALUES(name), managed_classes = VALUES(managed_classes),
         updated_at = now(3)`,
      [user.id, staffNo, name, managedClasses],
    );
    await connection.execute('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [
      user.id,
      teacherRoleId,
    ]);
    imported += 1;
  }
  return imported;
}

async function importReasons(connection, rows) {
  let imported = 0;
  for (const row of rows) {
    const [rawCode, rawComment, rawPlus, rawMinus, rawDeleted] = row;
    const code = toInteger(rawCode);
    const plus = toInteger(rawPlus);
    const minus = toInteger(rawMinus);
    const deleted = toInteger(rawDeleted) === 1;
    const comment = String(rawComment ?? '').trim();
    if (!Number.isInteger(code)) continue;

    if (deleted) {
      await connection.execute('DELETE FROM point_reasons WHERE legacy_reason_code = ?', [code]);
      continue;
    }
    if (!comment || (!plus && !minus)) continue;

    const type = plus > 0 ? 'PLUS' : minus > 0 ? 'MINUS' : 'ETC';
    const point = plus > 0 ? plus : minus > 0 ? -minus : plus - minus;
    await connection.execute(
      `INSERT INTO point_reasons (legacy_reason_code, point_reason_type, point, comment, is_active)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE point_reason_type = VALUES(point_reason_type), point = VALUES(point),
         comment = VALUES(comment), is_active = 1, updated_at = now(3)`,
      [code, type, point, comment],
    );
    imported += 1;
  }
  return imported;
}

async function main() {
  if (!dumpDirectory) {
    throw new Error('Pass the dump directory as the first argument or set LEGACY_PLMA_DUMP_DIR.');
  }
  const [reasonSql, teacherSql, userSql] = await Promise.all(
    Object.values(DUMP_FILES).map((file) => readFile(resolve(dumpDirectory, file), 'utf8')),
  );
  const connection = await mysql.createConnection(seedConnectionOptions(databaseUrl));
  try {
    await connection.beginTransaction();
    const [roles] = await connection.execute(
      "SELECT id, name FROM roles WHERE name IN ('student', 'teacher') FOR UPDATE",
    );
    const studentRoleId = roles.find((role) => role.name === 'student')?.id;
    const teacherRoleId = roles.find((role) => role.name === 'teacher')?.id;
    if (!studentRoleId || !teacherRoleId) {
      throw new Error('Run database migrations before importing legacy PLMA data.');
    }

    const students = await importStudents(connection, extractRows(userSql, 'user'), studentRoleId);
    const teachers = await importTeachers(
      connection,
      extractRows(teacherSql, 'teacher'),
      teacherRoleId,
    );
    const reasons = await importReasons(connection, extractRows(reasonSql, 'reason'));
    await connection.commit();
    console.log(
      `Legacy PLMA import complete: ${students} students, ${teachers} teachers, ${reasons} reasons.`,
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main();
