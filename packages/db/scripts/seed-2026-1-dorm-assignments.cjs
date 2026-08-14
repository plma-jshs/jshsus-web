#!/usr/bin/env node

const mysql = require('mysql2/promise');
const { seedConnectionOptions } = require('./seed-connection.cjs');

const YEAR = 2026;
const SEMESTER = 1;
const MALE_DORM = '\uC1A1\uC8FD\uAD00';
const LOCK_NAME = 'jshsus-seed-2026-1-dorm-assignments';

// The source sheet contains male assignments only. Student numbers are the
// canonical identifiers; names are read from the current students table.
const PLACEMENTS = [
  ['302', 1, 2210],
  ['302', 2, 2120],
  ['302', 3, 2112],
  ['302', 4, 2406],
  ['303', 1, 2103],
  ['303', 2, 2311],
  ['303', 3, 2409],
  ['303', 4, 2313],
  ['304', 1, 2303],
  ['304', 2, 2102],
  ['304', 3, 2307],
  ['304', 4, 2418],
  ['305', 1, 2108],
  ['305', 2, 2306],
  ['305', 3, 2203],
  ['305', 4, 2111],
  ['306', 1, 2309],
  ['306', 2, 2401],
  ['306', 3, 2304],
  ['306', 4, 2211],
  ['307', 1, 2208],
  ['307', 2, 2415],
  ['307', 3, 2109],
  ['307', 4, 2404],
  ['308', 3, 2316],
  ['309', 1, 2213],
  ['309', 2, 2319],
  ['309', 3, 2202],
  ['309', 4, 2318],
  ['310', 1, 2105],
  ['310', 2, 2220],
  ['310', 3, 2407],
  ['310', 4, 2308],
  ['311', 1, 2209],
  ['311', 2, 2104],
  ['311', 3, 2417],
  ['311', 4, 2411],
  ['312', 1, 2215],
  ['312', 2, 2201],
  ['312', 3, 2214],
  ['312', 4, 2121],
  ['313', 1, 2320],
  ['313', 2, 2218],
  ['313', 3, 2106],
  ['313', 4, 2110],
  ['314', 1, 2114],
  ['314', 2, 2408],
  ['314', 3, 2205],
  ['314', 4, 2314],
  ['316', 1, 2310],
  ['316', 2, 2118],
  ['316', 3, 2416],

  ['203', 1, 3414],
  ['203', 3, 3207],
  ['203', 4, 3214],
  ['204', 1, 3213],
  ['204', 3, 3408],
  ['204', 4, 3103],
  ['205', 1, 3405],
  ['205', 4, 3104],
  ['206', 1, 3310],
  ['206', 2, 3411],
  ['206', 3, 3304],
  ['207', 1, 3309],
  ['207', 2, 3312],
  ['207', 3, 3212],
  ['210', 1, 3409],
  ['210', 2, 3112],
  ['210', 3, 3307],
  ['211', 2, 3403],
  ['211', 3, 3313],
  ['211', 4, 3111],
  ['212', 1, 3308],
  ['212', 3, 3210],
  ['212', 4, 3107],
  ['213', 1, 3209],
  ['213', 2, 3305],
  ['213', 4, 3410],
  ['214', 1, 3105],
  ['214', 2, 3110],
  ['214', 3, 3412],
  ['215', 1, 3202],
  ['215', 3, 3208],
  ['215', 4, 3204],
];

function parseArgs(argv) {
  const options = {};
  for (const argument of argv) {
    if (!argument.startsWith('--')) throw new Error(`Unknown argument: ${argument}`);
    const [key, value] = argument.slice(2).split('=', 2);
    options[key] = value ?? 'true';
  }
  return options;
}

function databaseNameFromUrl(databaseUrl) {
  const database = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error('DATABASE_URL must contain a safe database name.');
  }
  return database;
}

function normalizedGender(value) {
  const gender = String(value ?? '')
    .trim()
    .toLowerCase();
  return gender === '0' || ['m', 'male', 'man'].includes(gender)
    ? 'male'
    : gender === '1' || ['f', 'female', 'woman'].includes(gender)
      ? 'female'
      : undefined;
}

function placeholders(values) {
  return values.map(() => '?').join(', ');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apply = options.apply === 'true';
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const database = databaseNameFromUrl(databaseUrl);
  if (apply && options['confirm-database'] !== database) {
    throw new Error(`Apply requires --confirm-database=${database}.`);
  }

  const connection = await mysql.createConnection(seedConnectionOptions(databaseUrl, process.env));
  let lockAcquired = false;
  try {
    const [[lock]] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [LOCK_NAME]);
    lockAcquired = Number(lock.acquired) === 1;
    if (!lockAcquired) throw new Error('Could not acquire the dorm assignment seed lock.');
    await connection.beginTransaction();

    const roomNames = [...new Set(PLACEMENTS.map(([roomName]) => roomName))];
    const [rooms] = await connection.execute(
      `SELECT id, name, capacity
         FROM dorm_rooms
        WHERE dorm_name = ? AND name IN (${placeholders(roomNames)})
        FOR UPDATE`,
      [MALE_DORM, ...roomNames],
    );
    const roomByName = new Map(rooms.map((room) => [String(room.name), room]));
    for (const roomName of ['214', '215']) {
      if (roomByName.has(roomName)) continue;
      await connection.execute(
        'INSERT INTO dorm_rooms (name, capacity, grade, dorm_name) VALUES (?, 4, 3, ?)',
        [roomName, MALE_DORM],
      );
    }
    if (!roomByName.has('214') || !roomByName.has('215')) {
      const [newRooms] = await connection.execute(
        `SELECT id, name, capacity
           FROM dorm_rooms
          WHERE dorm_name = ? AND name IN (?, ?)
          FOR UPDATE`,
        [MALE_DORM, '214', '215'],
      );
      for (const room of newRooms) roomByName.set(String(room.name), room);
    }

    const studentNos = [...new Set(PLACEMENTS.map(([, , studentNo]) => studentNo))];
    const [students] = await connection.execute(
      `SELECT s.id, s.user_id AS userId, s.student_no AS studentNo, s.name, s.grade, u.gender
         FROM students s
         LEFT JOIN users u ON u.id = s.user_id
        WHERE s.student_no IN (${placeholders(studentNos)})
        FOR UPDATE`,
      studentNos,
    );
    const studentByNo = new Map(students.map((student) => [Number(student.studentNo), student]));
    const missing = studentNos.filter((studentNo) => !studentByNo.has(studentNo));
    const nonMale = students
      .filter((student) => normalizedGender(student.gender) !== 'male')
      .map((student) => Number(student.studentNo));
    if (missing.length > 0) throw new Error(`Missing students: ${missing.join(', ')}`);
    if (nonMale.length > 0)
      throw new Error(`Non-male students in source mapping: ${nonMale.join(', ')}`);
    if (rooms.length + 2 < roomNames.length) {
      throw new Error('Some source rooms are missing and could not be created.');
    }

    const resolved = PLACEMENTS.map(([roomName, bedPosition, studentNo]) => {
      const room = roomByName.get(roomName);
      const student = studentByNo.get(studentNo);
      if (!room || !student) throw new Error(`Could not resolve ${roomName}/${studentNo}.`);
      return {
        roomId: room.id,
        userId: student.userId,
        roomName,
        bedPosition,
        studentNo,
        name: student.name,
      };
    });
    const duplicateKeys = new Set();
    for (const placement of resolved) {
      const key = `${placement.roomId}:${placement.bedPosition}`;
      if (duplicateKeys.has(key)) throw new Error(`Duplicate bed in source mapping: ${key}`);
      duplicateKeys.add(key);
    }

    const targetUserIds = [...new Set(resolved.map((placement) => placement.userId))];
    const targetRoomIds = [...new Set(resolved.map((placement) => placement.roomId))];
    const [existing] = await connection.execute(
      `SELECT id, user_id AS userId, room_id AS roomId, bed_position AS bedPosition
         FROM dorm_assignments
        WHERE year = ? AND semester = ?
          AND (user_id IN (${placeholders(targetUserIds)}) OR room_id IN (${placeholders(targetRoomIds)}))
        FOR UPDATE`,
      [YEAR, SEMESTER, ...targetUserIds, ...targetRoomIds],
    );
    const report = {
      mode: apply ? 'apply' : 'dry-run',
      database,
      term: `${YEAR}-${SEMESTER}`,
      roomsCreated: ['214', '215'].filter(
        (name) => !rooms.some((room) => String(room.name) === name),
      ),
      placements: resolved.length,
      existingReplaced: existing.length,
      excludedFemaleSourceRows: ['205/2: 3101', '308/4: 2420', '316/4: 3315'],
      preview: resolved.slice(0, 5),
    };
    if (!apply) {
      await connection.rollback();
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    await connection.execute(
      `DELETE FROM dorm_assignments
        WHERE year = ? AND semester = ?
          AND (user_id IN (${placeholders(targetUserIds)}) OR room_id IN (${placeholders(targetRoomIds)}))`,
      [YEAR, SEMESTER, ...targetUserIds, ...targetRoomIds],
    );
    for (const placement of resolved) {
      await connection.execute(
        `INSERT INTO dorm_assignments (room_id, user_id, year, semester, bed_position)
         VALUES (?, ?, ?, ?, ?)`,
        [placement.roomId, placement.userId, YEAR, SEMESTER, placement.bedPosition],
      );
    }
    await connection.commit();
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    if (lockAcquired)
      await connection.execute('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => undefined);
    await connection.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { PLACEMENTS, normalizedGender };
