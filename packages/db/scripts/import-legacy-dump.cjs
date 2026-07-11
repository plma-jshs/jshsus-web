#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

const legacyColumns = {
  users: ['id', 'stuid', 'password', 'name', 'studentId', 'phoneNumber'],
  students: ['id', 'stuid', 'name', 'grade', 'class', 'num', 'point'],
  points: ['id', 'studentId', 'teacherId', 'reasonId', 'point', 'comment', 'baseDate', 'updatedAt'],
  reasons: ['id', 'type', 'point', 'comment'],
  cases: ['id', 'updatedAt', 'isConnected', 'isOpen'],
  case_schedules: ['id', 'date', 'isOpen'],
  dorm_rooms: ['id', 'name', 'capacity', 'grade', 'dormName'],
  dorm_users: ['id', 'roomId', 'userId', 'year', 'semester', 'bedPosition'],
  dorm_reports: [
    'id',
    'userId',
    'roomId',
    'description',
    'imageUrl',
    'imageKey',
    'status',
    'comment',
  ],
  songs: ['id', 'title', 'url', 'duration', 'status'],
};

const targetTables = [
  'activity_request_events',
  'activity_requests',
  'point_adjustments',
  'point_award_cases',
  'point_records',
  'point_reasons',
  'device_case_commands',
  'device_case_schedules',
  'device_cases',
  'dorm_reports',
  'dorm_assignments',
  'dorm_rooms',
  'song_requests',
  'petition_answers',
  'petition_participants',
  'petitions',
  'user_permissions',
  'role_permissions',
  'user_roles',
  'auth_accounts',
  'staff_profiles',
  'students',
  'users',
  'permissions',
  'roles',
];

const roles = [
  { id: 1, name: 'system_admin', label: '시스템 관리자' },
  { id: 2, name: 'student_affairs_head', label: '학생부장' },
  { id: 3, name: 'teacher', label: '교사' },
  { id: 4, name: 'student_council', label: '학생회' },
  { id: 5, name: 'student', label: '학생' },
];

function csvSet(value) {
  return new Set(
    String(value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

const systemAdminStuids = csvSet(process.env.LEGACY_SYSTEM_ADMIN_STUIDS ?? '9988');
const studentAffairsHeadStuids = csvSet(process.env.LEGACY_STUDENT_AFFAIRS_HEAD_STUIDS ?? '');

function parseArgs(argv) {
  const args = {
    dump: process.env.LEGACY_DUMP_PATH,
    databaseUrl: process.env.DATABASE_URL ?? 'mysql://jshsus:local_password@localhost:3306/jshsus',
    yes: false,
    truncate: true,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--yes') args.yes = true;
    else if (arg === '--no-truncate') args.truncate = false;
    else if (arg === '--dump') args.dump = argv[++i];
    else if (arg.startsWith('--dump=')) args.dump = arg.slice('--dump='.length);
    else if (arg === '--database-url') args.databaseUrl = argv[++i];
    else if (arg.startsWith('--database-url='))
      args.databaseUrl = arg.slice('--database-url='.length);
    else if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  if (!args.dump) {
    throw new Error('Missing dump path. Pass --dump <path> or set LEGACY_DUMP_PATH.');
  }

  return args;
}

function printHelp() {
  console.log(`Usage: pnpm --filter @jshsus/db legacy:import -- --dump <dump.sql> --yes

Options:
  --dump <path>          Legacy SQL dump path. Can also use LEGACY_DUMP_PATH.
  --database-url <url>   Target MySQL URL. Defaults to DATABASE_URL or local dev URL.
  --yes                  Actually write data. Without this, only prints row counts.
  --no-truncate          Do not truncate mapped target tables before import.
`);
}

function unescapeSqlString(value) {
  return value
    .replace(/\\\\0/g, '\0')
    .replace(/\\\\n/g, '\n')
    .replace(/\\\\r/g, '\r')
    .replace(/\\\\b/g, '\b')
    .replace(/\\\\t/g, '\t')
    .replace(/\\\\Z/g, '\x1a')
    .replace(/\\\\'/g, "'")
    .replace(/\\\\"/g, '"')
    .replace(/\\\\\\\\/g, '\\');
}

function convertToken(token) {
  const trimmed = token.trim();
  if (trimmed.toUpperCase() === 'NULL') return null;
  if (trimmed.startsWith("'") && trimmed.endsWith("'"))
    return unescapeSqlString(trimmed.slice(1, -1));
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function splitTuples(valuesSql) {
  const rows = [];
  let row = [];
  let token = '';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (const ch of valuesSql) {
    if (inString) {
      token += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === "'") inString = false;
      continue;
    }

    if (ch === "'") {
      inString = true;
      token += ch;
    } else if (ch === '(') {
      if (depth === 0) {
        row = [];
        token = '';
      } else {
        token += ch;
      }
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        row.push(convertToken(token));
        rows.push(row);
        token = '';
      } else {
        token += ch;
      }
    } else if (ch === ',' && depth === 1) {
      row.push(convertToken(token));
      token = '';
    } else if (depth >= 1) {
      token += ch;
    }
  }

  return rows;
}

function parseDump(dumpText) {
  const data = {};

  for (const [table, columns] of Object.entries(legacyColumns)) {
    const match = dumpText.match(new RegExp(`INSERT INTO \`${table}\` VALUES ([\\s\\S]*?);`));
    const rows = match
      ? splitTuples(match[1]).map((row) =>
          Object.fromEntries(columns.map((column, index) => [column, row[index]])),
        )
      : [];
    data[table] = rows;
  }

  return data;
}

function toDate(value) {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(`${String(value).replace(' ', 'T')}+09:00`);
}

function toDateOnly(value) {
  if (value == null) return null;
  return String(value).slice(0, 10);
}

function rowCount(data) {
  return Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length]));
}

function backtick(identifier) {
  return `\`${identifier.replace(/`/g, '``')}\``;
}

async function insertRows(connection, table, columns, rows) {
  if (rows.length === 0) return;
  const sql = `INSERT INTO ${backtick(table)} (${columns.map(backtick).join(', ')}) VALUES ?`;
  const values = rows.map((row) => columns.map((column) => row[column]));
  await connection.query(sql, [values]);
}

async function resetTables(connection) {
  await connection.query('SET FOREIGN_KEY_CHECKS=0');
  for (const table of targetTables) {
    await connection.query(`TRUNCATE TABLE ${backtick(table)}`);
  }
  await connection.query('SET FOREIGN_KEY_CHECKS=1');
}

async function importData(connection, data, { truncate }) {
  if (truncate) {
    await resetTables(connection);
  }

  const studentsById = new Map(data.students.map((student) => [student.id, student]));
  const usersByStudentId = new Map(
    data.users.filter((user) => user.studentId != null).map((user) => [user.studentId, user]),
  );
  const reasonsById = new Map(data.reasons.map((reason) => [reason.id, reason]));

  await insertRows(connection, 'roles', ['id', 'name', 'label'], roles);

  const users = data.users.map((user) => {
    const student = user.studentId == null ? null : studentsById.get(user.studentId);
    return {
      id: user.id,
      legacy_iam_id: user.id,
      legacy_jshsus_id: String(user.stuid),
      legacy_plma_id: user.id,
      student_no: student?.stuid ?? user.stuid,
      name: user.name,
      grade: student?.grade ?? null,
      class_no: student?.class ?? null,
      number: student?.num ?? null,
      email: null,
      phone: user.phoneNumber,
      gender: null,
      user_status: 'active',
    };
  });

  await insertRows(
    connection,
    'users',
    [
      'id',
      'legacy_iam_id',
      'legacy_jshsus_id',
      'legacy_plma_id',
      'student_no',
      'name',
      'grade',
      'class_no',
      'number',
      'email',
      'phone',
      'gender',
      'user_status',
    ],
    users,
  );

  await insertRows(
    connection,
    'auth_accounts',
    ['user_id', 'provider', 'provider_account_id', 'password_hash', 'password_algorithm'],
    data.users.map((user) => ({
      user_id: user.id,
      provider: 'local',
      provider_account_id: String(user.stuid),
      password_hash: user.password,
      password_algorithm: 'legacy-sha512',
    })),
  );

  await insertRows(
    connection,
    'user_roles',
    ['user_id', 'role_id'],
    data.users.map((user) => {
      const stuid = String(user.stuid);
      let roleId = user.studentId == null ? 3 : 5;

      if (studentAffairsHeadStuids.has(stuid)) {
        roleId = 2;
      }

      if (systemAdminStuids.has(stuid)) {
        roleId = 1;
      }

      return {
        user_id: user.id,
        role_id: roleId,
      };
    }),
  );

  await insertRows(
    connection,
    'students',
    [
      'id',
      'user_id',
      'legacy_student_id',
      'student_no',
      'name',
      'grade',
      'class_no',
      'number',
      'current_point',
    ],
    data.students.map((student) => ({
      id: student.id,
      user_id: usersByStudentId.get(student.id)?.id ?? null,
      legacy_student_id: student.id,
      student_no: student.stuid,
      name: student.name,
      grade: student.grade,
      class_no: student.class,
      number: student.num,
      current_point: student.point,
    })),
  );

  await insertRows(
    connection,
    'point_reasons',
    ['id', 'point_reason_type', 'point', 'comment', 'is_active'],
    data.reasons.map((reason) => ({
      id: reason.id,
      point_reason_type: reason.type,
      point: reason.point,
      comment: reason.comment,
      is_active: 1,
    })),
  );

  await insertRows(
    connection,
    'point_records',
    [
      'id',
      'student_id',
      'teacher_id',
      'reason_id',
      'point',
      'comment',
      'base_date',
      'created_at',
      'updated_at',
    ],
    data.points.map((point) => ({
      id: point.id,
      student_id: point.studentId,
      teacher_id: point.teacherId,
      reason_id: point.reasonId,
      point: point.point || reasonsById.get(point.reasonId)?.point || 0,
      comment: point.comment,
      base_date: toDateOnly(point.baseDate),
      created_at: toDate(point.updatedAt),
      updated_at: toDate(point.updatedAt),
    })),
  );

  await insertRows(
    connection,
    'device_cases',
    ['id', 'last_seen_at', 'is_connected', 'is_open', 'created_at', 'updated_at'],
    data.cases.map((deviceCase) => ({
      id: deviceCase.id,
      last_seen_at: toDate(deviceCase.updatedAt),
      is_connected: deviceCase.isConnected ? 1 : 0,
      is_open: deviceCase.isOpen ? 1 : 0,
      created_at: toDate(deviceCase.updatedAt),
      updated_at: toDate(deviceCase.updatedAt),
    })),
  );

  await insertRows(
    connection,
    'device_case_schedules',
    ['id', 'scheduled_at', 'is_open', 'created_at', 'updated_at'],
    data.case_schedules.map((schedule) => ({
      id: schedule.id,
      scheduled_at: toDate(schedule.date),
      is_open: schedule.isOpen ? 1 : 0,
      created_at: toDate(schedule.date),
      updated_at: toDate(schedule.date),
    })),
  );

  await insertRows(
    connection,
    'dorm_rooms',
    ['id', 'name', 'capacity', 'grade', 'dorm_name'],
    data.dorm_rooms.map((room) => ({
      id: room.id,
      name: room.name,
      capacity: room.capacity,
      grade: room.grade,
      dorm_name: room.dormName,
    })),
  );

  await insertRows(
    connection,
    'dorm_assignments',
    ['id', 'room_id', 'user_id', 'year', 'semester', 'bed_position'],
    data.dorm_users.map((assignment) => ({
      id: assignment.id,
      room_id: assignment.roomId,
      user_id: assignment.userId,
      year: assignment.year,
      semester: assignment.semester,
      bed_position: assignment.bedPosition,
    })),
  );

  await insertRows(
    connection,
    'dorm_reports',
    [
      'id',
      'user_id',
      'room_id',
      'description',
      'image_url',
      'image_key',
      'dorm_report_status',
      'comment',
    ],
    data.dorm_reports.map((report) => ({
      id: report.id,
      user_id: report.userId,
      room_id: report.roomId,
      description: report.description,
      image_url: report.imageUrl,
      image_key: report.imageKey,
      dorm_report_status: report.status,
      comment: report.comment,
    })),
  );

  await insertRows(
    connection,
    'song_requests',
    ['id', 'title', 'url', 'duration', 'song_request_status'],
    data.songs.map((song) => ({
      id: song.id,
      title: song.title,
      url: song.url,
      duration: song.duration,
      song_request_status: song.status,
    })),
  );
}

async function validateImport(connection) {
  const tables = [
    'users',
    'auth_accounts',
    'students',
    'point_reasons',
    'point_records',
    'device_cases',
    'device_case_schedules',
    'dorm_rooms',
    'dorm_assignments',
    'dorm_reports',
    'song_requests',
  ];
  const counts = {};
  for (const table of tables) {
    const [rows] = await connection.query(`SELECT COUNT(*) as count FROM ${backtick(table)}`);
    counts[table] = Number(rows[0].count);
  }
  return counts;
}

async function main() {
  const args = parseArgs(process.argv);
  const dumpPath = path.resolve(args.dump);
  const dumpText = fs.readFileSync(dumpPath, 'utf8');
  const data = parseDump(dumpText);
  const counts = rowCount(data);

  console.log('Legacy dump row counts:', counts);

  if (!args.yes) {
    console.log('Dry run only. Re-run with --yes to import into the target database.');
    return;
  }

  const connection = await mysql.createConnection({ uri: args.databaseUrl, timezone: '+09:00' });
  try {
    await connection.beginTransaction();
    await importData(connection, data, { truncate: args.truncate });
    await connection.commit();
    console.log('Imported target row counts:', await validateImport(connection));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
