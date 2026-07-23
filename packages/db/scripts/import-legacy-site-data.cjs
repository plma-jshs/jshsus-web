/*
 * Imports legacy JSHSus council/free-board content and PLMA operational data.
 *
 * The script reads credentials from the repo .env at runtime. Session cookies
 * for the legacy free board must be passed through LEGACY_COOKIE_HEADER and
 * are never persisted.
 */

const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const mysql = require('mysql2/promise');
const { seedConnectionOptions } = require('./seed-connection.cjs');

const ROOT_DIR = resolve(__dirname, '../../..');
const NOTICE_BASE = 'https://jshsus.kr/contents/council/';
const BOARD_BASE = 'https://jshsus.kr/contents/school/';
const RICH_NOTICE_PREFIX = 'jshsus-rich-text:v1\n';
const DEFAULT_HISTORY_DUMP = 'C:/Users/Newbiedev/Desktop/plma_history_2026-07-17_175008.sql';
const DEFAULT_SONGS_DUMP = 'C:/Users/Newbiedev/Desktop/plma_songs_2026-07-17_180219.sql';

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

function windowsPathToWsl(path) {
  const match = String(path).match(/^([A-Za-z]):[\\/](.*)$/);
  if (!match) return path;
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\', '/')}`;
}

function decodeEscapedCharacter(character) {
  const escapes = { 0: '\0', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a' };
  return escapes[character] ?? character;
}

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
      const quoted = values[cursor] === "'";

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
      throw new Error('Could not parse a legacy SQL INSERT value list.');
    }
    rows.push(row);
  }

  return rows;
}

function extractRows(sqlText, table) {
  const prefix = `INSERT INTO \`${table}\` VALUES `;
  const start = sqlText.indexOf(prefix);
  if (start < 0) throw new Error(`Expected INSERT data for ${table}.`);
  const end = sqlText.indexOf(';', start);
  if (end < 0) throw new Error(`Legacy table ${table} has an incomplete INSERT statement.`);
  return parseValuesRows(sqlText.slice(start + prefix.length, end));
}

function toInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : Number.NaN;
}

function cleanText(value) {
  return decodeHtml(String(value ?? ''))
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)));
}

function firstMatch(value, pattern) {
  const match = String(value ?? '').match(pattern);
  return match ? cleanText(match[1]) : '';
}

function resolveLegacyUrl(src, baseUrl) {
  if (!src) return '';
  try {
    return new URL(decodeHtml(src), baseUrl).toString();
  } catch {
    return decodeHtml(src);
  }
}

function attrsFromTag(tag) {
  const attrs = {};
  for (const match of String(tag ?? '').matchAll(
    /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(["'])(.*?)\2/g,
  )) {
    attrs[match[1].toLowerCase()] = match[3];
  }
  return attrs;
}

function textNode(text) {
  return text ? { type: 'text', text } : null;
}

function paragraph(text) {
  const node = textNode(text);
  return node ? { type: 'paragraph', content: [node] } : { type: 'paragraph' };
}

function htmlSegmentToTextLines(segment) {
  const withBreaks = String(segment ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeHtml(withBreaks)
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function htmlToRichTextDocument(html, baseUrl) {
  const content = [];
  let cursor = 0;
  const imagePattern = /<img\b[^>]*>/gi;
  let match;

  while ((match = imagePattern.exec(html))) {
    for (const line of htmlSegmentToTextLines(html.slice(cursor, match.index))) {
      content.push(paragraph(line));
    }
    const attrs = attrsFromTag(match[0]);
    const src = resolveLegacyUrl(attrs.src, baseUrl);
    if (src) {
      content.push({
        type: 'image',
        attrs: {
          src,
          alt: cleanText(attrs.alt ?? ''),
          title: cleanText(attrs.title ?? ''),
        },
      });
    }
    cursor = imagePattern.lastIndex;
  }

  for (const line of htmlSegmentToTextLines(html.slice(cursor))) {
    content.push(paragraph(line));
  }

  return { type: 'doc', content: content.length ? content : [paragraph('')] };
}

function projectDocumentToPlainText(document) {
  const parts = [];
  const visit = (node) => {
    if (node.type === 'text' && node.text) parts.push(node.text);
    if (node.type === 'image') parts.push(node.attrs?.alt?.trim() || '[image]');
    for (const child of node.content ?? []) visit(child);
    if (['paragraph', 'heading', 'listItem', 'blockquote'].includes(node.type)) parts.push('\n');
  };
  for (const node of document.content ?? []) visit(node);
  return parts
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function serializeNoticeContent(contentDoc, plainText) {
  return `${RICH_NOTICE_PREFIX}${JSON.stringify({ contentDoc, plainText })}`;
}

function normalizeGender(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  return normalized === 'female' || normalized === 'f' ? '1' : '0';
}

function normalizePhone(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('10')) return `0${digits}`;
  if (digits.length === 11 && digits.startsWith('010')) return digits;
  return null;
}

function parseManagedClasses(value) {
  const result = [];
  const seen = new Set();
  for (const match of String(value ?? '').matchAll(/([1-3])\s*(?:학년)?\s*[-/]\s*([1-4])/g)) {
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

async function nextNoticePublicNo(connection) {
  const row = await selectOne(
    connection,
    'SELECT COALESCE(MAX(public_no), 0) + 1 AS value FROM notices',
  );
  return Number(row?.value ?? 1);
}

async function nextPostPublicNo(connection, boardId) {
  const row = await selectOne(
    connection,
    'SELECT COALESCE(MAX(public_no), 0) + 1 AS value FROM posts WHERE board_id = ?',
    [boardId],
  );
  return Number(row?.value ?? 1);
}

async function ensureRole(connection, name, label) {
  await connection.execute(
    `INSERT INTO roles (name, label)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE updated_at = now(3)`,
    [name, label],
  );
  const role = await selectOne(connection, 'SELECT id FROM roles WHERE name = ? LIMIT 1', [name]);
  if (!role) throw new Error(`Missing role ${name}.`);
  return role.id;
}

async function importLegacyPeople(target, legacy) {
  const studentRoleId = await ensureRole(target, 'student', 'Student');
  const teacherRoleId = await ensureRole(target, 'teacher', 'Teacher');
  const [iamRows] = await legacy.execute('SELECT * FROM iam');
  const [studentRows] = await legacy.execute('SELECT * FROM `user`');
  const [teacherRows] = await legacy.execute('SELECT * FROM teacher');
  const iamByStudentNo = new Map();
  const legacyStudentNos = new Set();
  for (const row of iamRows) iamByStudentNo.set(Number(row.stuid), row);
  for (const row of studentRows) legacyStudentNos.add(Number(row.stuid));

  let students = 0;
  for (const row of studentRows) {
    const studentNo = toInteger(row.stuid);
    const grade = toInteger(row.grade);
    const classNo = toInteger(row.class);
    const number = toInteger(row.num);
    const name = cleanText(row.name);
    if (!studentNo || !name || grade < 1 || grade > 3 || classNo < 1 || classNo > 4) continue;
    const iam = iamByStudentNo.get(studentNo);
    let user = await selectOne(target, 'SELECT id FROM users WHERE student_no = ? LIMIT 1', [
      studentNo,
    ]);
    if (!user) {
      const [result] = await target.execute(
        `INSERT INTO users
          (student_no, name, grade, class_no, number, email, phone, gender, user_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          studentNo,
          name,
          grade,
          classNo,
          number,
          cleanText(iam?.email) || null,
          normalizePhone(iam?.phone || row.phone_number),
          normalizeGender(iam?.gender || row.gender),
          Number(iam?.restricted ?? 0) ? 'restricted' : 'active',
        ],
      );
      user = { id: result.insertId };
    } else {
      await target.execute(
        `UPDATE users
         SET student_no = ?, name = ?, grade = ?, class_no = ?, number = ?, email = ?, phone = ?, gender = ?,
             user_status = ?, updated_at = now(3)
         WHERE id = ?`,
        [
          studentNo,
          name,
          grade,
          classNo,
          number,
          cleanText(iam?.email) || null,
          normalizePhone(iam?.phone || row.phone_number),
          normalizeGender(iam?.gender || row.gender),
          Number(iam?.restricted ?? 0) ? 'restricted' : 'active',
          user.id,
        ],
      );
    }

    await target.execute(
      `INSERT INTO students (user_id, student_no, name, grade, class_no, number, current_point)
       VALUES (?, ?, ?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id),
         name = VALUES(name), grade = VALUES(grade), class_no = VALUES(class_no), number = VALUES(number),
         updated_at = now(3)`,
      [user.id, studentNo, name, grade, classNo, number],
    );
    await target.execute('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [
      user.id,
      studentRoleId,
    ]);
    await target.execute(
      `DELETE user_roles
       FROM user_roles
       INNER JOIN roles ON roles.id = user_roles.role_id
       WHERE user_roles.user_id = ? AND roles.name = 'teacher'`,
      [user.id],
    );
    await target.execute('DELETE FROM staff_profiles WHERE user_id = ?', [user.id]);
    students += 1;
  }

  let teachers = 0;
  for (const row of teacherRows) {
    const legacyStaffNo = toInteger(row.id);
    const staffNo = 100000 + legacyStaffNo;
    const name = cleanText(row.name);
    if (!legacyStaffNo || !name || staffNo > 999999) continue;
    const iam = iamByStudentNo.get(Number(row.stuid));
    if (
      iam &&
      Number(iam.grade) >= 1 &&
      Number(iam.grade) <= 3 &&
      legacyStudentNos.has(Number(row.stuid))
    ) {
      continue;
    }
    let user = await selectOne(
      target,
      `SELECT users.id
       FROM staff_profiles
       INNER JOIN users ON users.id = staff_profiles.user_id
       WHERE staff_profiles.staff_no = ?
       LIMIT 1`,
      [staffNo],
    );
    if (!user) {
      const [result] = await target.execute(
        `INSERT INTO users
          (student_no, name, email, phone, gender, user_status)
         VALUES (NULL, ?, ?, ?, ?, ?)`,
        [
          name,
          cleanText(iam?.email) || null,
          normalizePhone(iam?.phone),
          normalizeGender(iam?.gender),
          Number(iam?.restricted ?? 0) ? 'restricted' : 'active',
        ],
      );
      user = { id: result.insertId };
    } else {
      await target.execute(
        `UPDATE users
         SET student_no = NULL, name = ?, email = ?, phone = ?, gender = ?, user_status = ?, updated_at = now(3)
         WHERE id = ?`,
        [
          name,
          cleanText(iam?.email) || null,
          normalizePhone(iam?.phone),
          normalizeGender(iam?.gender),
          Number(iam?.restricted ?? 0) ? 'restricted' : 'active',
          user.id,
        ],
      );
    }

    await target.execute(
      `INSERT INTO staff_profiles (user_id, staff_no, name, department, title, managed_classes)
       VALUES (?, ?, ?, NULL, ?, CAST(? AS JSON))
       ON DUPLICATE KEY UPDATE name = VALUES(name), title = VALUES(title),
         managed_classes = VALUES(managed_classes), updated_at = now(3)`,
      [
        user.id,
        staffNo,
        name,
        cleanText(row.job) || null,
        JSON.stringify(parseManagedClasses(row.manage)),
      ],
    );
    await target.execute('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [
      user.id,
      teacherRoleId,
    ]);
    teachers += 1;
  }

  let reasons = 0;
  const [reasonRows] = await legacy.execute('SELECT * FROM reason');
  for (const row of reasonRows) {
    const code = toInteger(row.id);
    const plus = toInteger(row.plus) || 0;
    const minus = toInteger(row.minus) || 0;
    const deleted = toInteger(row.dpc) === 1;
    const comment = cleanText(row.title);
    if (!code || deleted || !comment) continue;
    const point = plus > 0 ? plus : minus > 0 ? -minus : plus - minus;
    const type = point > 0 ? 'PLUS' : point < 0 ? 'MINUS' : 'ETC';
    const existingReason = await selectOne(
      target,
      'SELECT id FROM point_reasons WHERE point_reason_type = ? AND point = ? AND comment = ? LIMIT 1',
      [type, point, comment],
    );
    if (existingReason) {
      await target.execute(
        'UPDATE point_reasons SET is_active = 1, updated_at = now(3) WHERE id = ?',
        [existingReason.id],
      );
    } else {
      await target.execute(
        `INSERT INTO point_reasons (point_reason_type, point, comment, is_active)
         VALUES (?, ?, ?, 1)`,
        [type, point, comment],
      );
    }
    reasons += 1;
  }

  return { students, teachers, reasons };
}

function pointRecordKey(studentId, teacherId, reasonId, point, baseDate, createdAt, comment) {
  return [studentId, teacherId, reasonId, point, baseDate, createdAt, comment].join('\u001f');
}

async function importPointHistory(target, historyRows) {
  const studentCache = new Map();
  const teacherCache = new Map();
  const reasonCache = new Map();
  const latestPointByStudentNo = new Map();
  const existingPointCounts = new Map();
  const seenPointCounts = new Map();
  const [existingPointRows] = await target.execute(
    `SELECT student_id, teacher_id, reason_id, point,
       DATE_FORMAT(base_date, '%Y-%m-%d') base_date,
       DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s.000') created_at,
       comment,
       COUNT(*) count
     FROM point_records
     GROUP BY student_id, teacher_id, reason_id, point, base_date, created_at, comment`,
  );
  for (const row of existingPointRows) {
    existingPointCounts.set(
      pointRecordKey(
        row.student_id,
        row.teacher_id,
        row.reason_id,
        row.point,
        row.base_date,
        row.created_at,
        row.comment,
      ),
      Number(row.count),
    );
  }
  let imported = 0;
  let skipped = 0;

  const getStudent = async (studentNo) => {
    if (studentCache.has(studentNo)) return studentCache.get(studentNo);
    const row = await selectOne(target, 'SELECT id FROM students WHERE student_no = ? LIMIT 1', [
      studentNo,
    ]);
    studentCache.set(studentNo, row?.id ?? null);
    return row?.id ?? null;
  };
  const getTeacher = async (legacyStaffNo) => {
    if (teacherCache.has(legacyStaffNo)) return teacherCache.get(legacyStaffNo);
    const staffNo = 100000 + Number(legacyStaffNo);
    const row = await selectOne(
      target,
      `SELECT users.id
       FROM staff_profiles
       INNER JOIN users ON users.id = staff_profiles.user_id
       WHERE staff_profiles.staff_no = ?
      LIMIT 1`,
      [staffNo],
    );
    const id = row?.id ?? null;
    teacherCache.set(legacyStaffNo, id);
    return id;
  };
  const getReason = async (code, caption, point, type) => {
    const key = `${code}:${type}:${point}:${caption}`;
    if (reasonCache.has(key)) return reasonCache.get(key);
    let row = await selectOne(
      target,
      'SELECT id FROM point_reasons WHERE point_reason_type = ? AND point = ? AND comment = ? LIMIT 1',
      [type, point, caption || `Legacy reason ${code}`],
    );
    if (!row) {
      const [result] = await target.execute(
        `INSERT INTO point_reasons (point_reason_type, point, comment, is_active)
         VALUES (?, ?, ?, 1)`,
        [type, point, caption || `Legacy reason ${code}`],
      );
      row = { id: result.insertId };
    }
    reasonCache.set(key, row.id);
    return row.id;
  };

  for (const row of historyRows) {
    const [
      legacyId,
      createdDate,
      legacyStaffNo,
      studentNo,
      beforePlus,
      beforeMinus,
      afterPlus,
      afterMinus,
      reasonCode,
      reasonCaption,
      actDate,
      ,
      aftersum,
      display,
    ] = row;
    const studentId = await getStudent(studentNo);
    if (!studentId) {
      skipped += 1;
      continue;
    }
    const point =
      Number(afterPlus ?? 0) -
      Number(beforePlus ?? 0) -
      (Number(afterMinus ?? 0) - Number(beforeMinus ?? 0));
    const type = point > 0 ? 'PLUS' : point < 0 ? 'MINUS' : 'ETC';
    const caption = cleanText(reasonCaption);
    const reasonId = await getReason(reasonCode, caption, point, type);
    const teacherId = await getTeacher(legacyStaffNo);
    const baseDate = /^\d{4}-\d{2}-\d{2}$/.test(String(actDate)) ? actDate : createdDate;
    const createdAt = `${createdDate} 00:00:00.000`;
    const recordKey = pointRecordKey(
      studentId,
      teacherId,
      reasonId,
      point,
      baseDate,
      createdAt,
      caption,
    );
    const seenCount = (seenPointCounts.get(recordKey) ?? 0) + 1;
    seenPointCounts.set(recordKey, seenCount);
    if (seenCount > (existingPointCounts.get(recordKey) ?? 0)) {
      await target.execute(
        `INSERT INTO point_records
          (student_id, teacher_id, reason_id, reason_type, reason_text, point, comment, base_date,
           canceled_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          studentId,
          teacherId,
          reasonId,
          type,
          caption,
          point,
          caption,
          baseDate,
          Number(display) === 0 ? createdAt : null,
          createdAt,
          createdAt,
        ],
      );
      imported += 1;
    }
    if (Number(display) !== 0 && Number.isFinite(Number(aftersum))) {
      const previous = latestPointByStudentNo.get(studentNo);
      if (!previous || Number(legacyId) > previous.legacyId) {
        latestPointByStudentNo.set(studentNo, {
          legacyId: Number(legacyId),
          point: Number(aftersum),
        });
      }
    }
  }

  for (const [studentNo, { point }] of latestPointByStudentNo) {
    await target.execute(
      'UPDATE students SET current_point = ?, updated_at = now(3) WHERE student_no = ?',
      [point, studentNo],
    );
  }

  return { imported, skipped, balances: latestPointByStudentNo.size };
}

function extractYoutubeVideoId(url) {
  const value = String(url ?? '').trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.split('/').filter(Boolean)[0];
    if (parsed.searchParams.has('v')) return parsed.searchParams.get('v');
    const shorts = parsed.pathname.match(/\/shorts\/([^/]+)/);
    if (shorts) return shorts[1];
  } catch {
    const match = value.match(/[?&]v=([A-Za-z0-9_-]{6,})|youtu\.be\/([A-Za-z0-9_-]{6,})/);
    return match?.[1] || match?.[2] || null;
  }
  return null;
}

function asDateTime(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ');
  return String(value ?? '')
    .replace('T', ' ')
    .slice(0, 19);
}

async function importWakeSongs(target, songRows, iamStudentNoById = new Map()) {
  let imported = 0;
  let skipped = 0;
  for (const row of songRows) {
    const [legacyId, requester, requestWeek, ytlink, confirmed, createdAt, start, end, speed] = row;
    const requesterStudentNo = iamStudentNoById.get(Number(requester)) ?? Number(requester);
    const user = await selectOne(
      target,
      `SELECT users.id
       FROM students
       INNER JOIN users ON users.id = students.user_id
       WHERE students.student_no = ?
       LIMIT 1`,
      [requesterStudentNo],
    );
    const videoId = extractYoutubeVideoId(ytlink);
    if (!user || !videoId) {
      skipped += 1;
      continue;
    }
    const startSeconds = Math.max(0, Number(start ?? 0));
    const endSeconds = Math.max(startSeconds + 1, Number(end ?? startSeconds + 1));
    const rateHundredths = Math.max(25, Math.min(400, Math.round(Number(speed || 1) * 100)));
    const effectiveDuration = Math.max(
      1,
      Math.round(((endSeconds - startSeconds) * 100) / rateHundredths),
    );
    const created = asDateTime(createdAt);
    const exists = await selectOne(
      target,
      `SELECT id FROM wake_song_requests
       WHERE requester_id = ? AND youtube_video_id = ? AND start_seconds = ? AND end_seconds = ?
         AND created_at = ?
       LIMIT 1`,
      [user.id, videoId, startSeconds, endSeconds, created],
    );
    if (exists) continue;
    const status = Number(confirmed) ? 'SCHEDULED' : 'PENDING';
    const scheduledAt = Number(confirmed) ? `${String(requestWeek).slice(0, 10)} 07:00:00` : null;
    const [result] = await target.execute(
      `INSERT INTO wake_song_requests
        (requester_id, youtube_video_id, canonical_url, video_title, video_duration_seconds,
         start_seconds, end_seconds, playback_rate_hundredths, effective_duration_seconds,
         request_note, wake_song_request_status, scheduled_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        videoId,
        `https://www.youtube.com/watch?v=${videoId}`,
        `Legacy wake song ${legacyId}`,
        endSeconds,
        startSeconds,
        endSeconds,
        rateHundredths,
        effectiveDuration,
        cleanText(ytlink).slice(0, 500),
        status,
        scheduledAt,
        created,
        created,
      ],
    );
    await target.execute(
      `INSERT INTO wake_song_request_events
        (wake_song_request_id, actor_id, wake_song_request_event_type, note, created_at)
       VALUES (?, ?, 'SUBMITTED', ?, ?)`,
      [result.insertId, user.id, `legacy song id ${legacyId}`, created],
    );
    if (status === 'SCHEDULED') {
      await target.execute(
        `INSERT INTO wake_song_request_events
          (wake_song_request_id, actor_id, wake_song_request_event_type, note, created_at)
         VALUES (?, NULL, 'SCHEDULED', 'legacy confirmed request', ?)`,
        [result.insertId, created],
      );
    }
    imported += 1;
  }
  return { imported, skipped };
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  return response.text();
}

function parseNoticeDetail(html, url) {
  const title = firstMatch(html, /<h1 class=["']Mess["'][^>]*>([\s\S]*?)<\/h1>/i);
  const department = firstMatch(html, /<h2 class=["']department-h2["'][^>]*>([\s\S]*?)<\/h2>/i);
  const bodyHtml =
    html.match(
      /<div class=["']main-text["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<hr class=["']mid-hr["']/i,
    )?.[1] ?? '';
  const author = firstMatch(html, /<p class=["']text-info["']>\s*작성자\s*:\s*([\s\S]*?)<\/p>/i);
  const publishedAt = firstMatch(
    html,
    /<p class=["']text-info["']>\s*작성시각\s*:\s*([\s\S]*?)<\/p>/i,
  );
  const viewCount =
    Number(
      firstMatch(html, /<p class=["']text-info["']>\s*조회수\s*:\s*([\d,]+)\s*<\/p>/i).replaceAll(
        ',',
        '',
      ),
    ) || 0;
  const contentDoc = htmlToRichTextDocument(bodyHtml, url);
  const plainText = projectDocumentToPlainText(contentDoc);
  return {
    title,
    department: department || author || '공지',
    author,
    content: serializeNoticeContent(contentDoc, plainText),
    publishedAt,
    viewCount,
  };
}

async function importNotices(target) {
  const indexHtml = await fetchText(`${NOTICE_BASE}index.php`);
  const ids = [
    ...new Set([...indexHtml.matchAll(/readDocument\.php\?id=([^"'&]+)/g)].map((m) => m[1])),
  ];
  let imported = 0;
  let skipped = 0;
  for (const legacyId of ids) {
    const url = `${NOTICE_BASE}readDocument.php?id=${encodeURIComponent(legacyId)}`;
    const detail = parseNoticeDetail(await fetchText(url), url);
    if (!detail.title || !detail.publishedAt) {
      skipped += 1;
      continue;
    }
    const exists = await selectOne(
      target,
      'SELECT id FROM notices WHERE title = ? AND published_at = ? LIMIT 1',
      [detail.title, detail.publishedAt],
    );
    if (exists) continue;
    const publicNo = await nextNoticePublicNo(target);
    await target.execute(
      `INSERT INTO notices
        (public_no, title, content, department, author_name, visibility, pinned, published_at, view_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'public', 0, ?, ?, ?, ?)`,
      [
        publicNo,
        detail.title,
        detail.content,
        detail.department.slice(0, 80),
        detail.author.slice(0, 80) || null,
        detail.publishedAt,
        detail.viewCount,
        detail.publishedAt,
        detail.publishedAt,
      ],
    );
    imported += 1;
  }
  return { imported, skipped, seen: ids.length };
}

function parseLegacyProfile(html) {
  const tip = html.match(
    /<span class=['"]tip['"][^>]*>\s*\|\s*([\s\S]*?)\s*\|\s*<span>\s*(\d+)\s*<\/span>/i,
  );
  return {
    nickname: tip ? cleanText(tip[1]) : '',
    studentNo: tip ? Number(tip[2]) : null,
    ago: firstMatch(html, /<span class=["']board-profile-ago["'][^>]*>([\s\S]*?)<\/span>/i),
  };
}

function parseLegacyAge(value) {
  const text = cleanText(value);
  const now = new Date();
  const number = Number(text.match(/\d+/)?.[0] ?? 0);
  if (text.includes('년')) now.setDate(now.getDate() - number * 365);
  else if (text.includes('개월')) now.setDate(now.getDate() - number * 30);
  else if (text.includes('일')) now.setDate(now.getDate() - number);
  else if (text.includes('시간')) now.setHours(now.getHours() - number);
  else if (text.includes('분')) now.setMinutes(now.getMinutes() - number);
  return now.toISOString().slice(0, 19).replace('T', ' ');
}

function parseBoardList(html) {
  const entries = [];
  const pattern =
    /<a\s+id\s*=\s*['"]([^'"]+)['"][^>]*href=["']readDocument\.php\?id=[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const [, legacyId, block] = match;
    const profile = parseLegacyProfile(block);
    entries.push({
      legacyId,
      title: firstMatch(block, /<h2 class=["']board-title["'][^>]*>([\s\S]*?)<\/h2>/i),
      nickname: profile.nickname,
      studentNo: profile.studentNo,
      createdAt: parseLegacyAge(profile.ago),
      viewCount: Number(firstMatch(block, /조회수\s*([\d,]+)\s*회/i).replaceAll(',', '')) || 0,
      commentCount:
        Number(firstMatch(block, /<p class=["']board-comment["'][^>]*>([\d,]+)<\/p>/i)) || 0,
    });
  }
  return entries;
}

async function collectBoardEntries() {
  const byId = new Map();
  const firstPage = parseBoardList(await fetchText(`${BOARD_BASE}index.php`));
  for (const entry of firstPage) byId.set(entry.legacyId, entry);
  let emptyPages = 0;
  for (let page = 1; page <= 50 && emptyPages < 3; page += 1) {
    const entries = parseBoardList(await fetchText(`${BOARD_BASE}index.php?p=${page}`));
    if (entries.length === 0) {
      emptyPages += 1;
      continue;
    }
    emptyPages = 0;
    for (const entry of entries) {
      if (!byId.has(entry.legacyId)) byId.set(entry.legacyId, entry);
    }
  }
  return [...byId.values()];
}

function parseBoardDetail(html, url, listEntry) {
  const title =
    firstMatch(html, /<h2 class=["']read-board-title["'][^>]*>([\s\S]*?)<\/h2>/i) ||
    listEntry.title;
  const titleMatch = html.match(/<h2 class=["']read-board-title["'][^>]*>[\s\S]*?<\/h2>/i);
  const start = titleMatch ? titleMatch.index + titleMatch[0].length : 0;
  const end = html.indexOf('<div class="board-dis-line">', start);
  const bodyHtml = end > start ? html.slice(start, end) : '';
  const profile = parseLegacyProfile(html);
  const viewCount =
    Number(firstMatch(html, /조회수\s*([\d,]+)\s*회/i).replaceAll(',', '')) || listEntry.viewCount;
  const contentDoc = htmlToRichTextDocument(bodyHtml, url);
  const content = projectDocumentToPlainText(contentDoc);
  const comments = [];
  const commentPattern =
    /<div class=["']comment-part["'][\s\S]*?<p class=["']comment["'][^>]*>[\s\S]*?<\/p>\s*<\/div>/gi;
  for (const match of html.matchAll(commentPattern)) {
    const block = match[0];
    const commentProfile = parseLegacyProfile(block);
    const comment = firstMatch(block, /<p class=["']comment["'][^>]*>([\s\S]*?)<\/p>/i);
    if (comment) {
      comments.push({
        content: comment,
        studentNo: commentProfile.studentNo,
        nickname: commentProfile.nickname,
        createdAt: parseLegacyAge(commentProfile.ago || profile.ago || ''),
      });
    }
  }
  return {
    title,
    content,
    contentDoc,
    comments,
    viewCount,
    studentNo: profile.studentNo ?? listEntry.studentNo,
    nickname: profile.nickname || listEntry.nickname,
    createdAt: parseLegacyAge(profile.ago || listEntry.createdAt),
  };
}

async function findUserIdByStudentNo(target, studentNo) {
  if (!studentNo) return null;
  const row = await selectOne(target, 'SELECT user_id FROM students WHERE student_no = ? LIMIT 1', [
    studentNo,
  ]);
  return row?.user_id ?? null;
}

async function maybeSetNickname(target, userId, nickname) {
  const value = cleanText(nickname).slice(0, 16);
  if (!userId || !value || value === '새 닉네임') return;
  const owner = await selectOne(
    target,
    'SELECT id FROM users WHERE nickname = ? AND id <> ? LIMIT 1',
    [value, userId],
  );
  if (owner) return;
  await target.execute(
    'UPDATE users SET nickname = COALESCE(nickname, ?), updated_at = now(3) WHERE id = ?',
    [value, userId],
  );
}

async function importBoardPosts(target) {
  const cookie = process.env.LEGACY_COOKIE_HEADER;
  if (!cookie) throw new Error('Set LEGACY_COOKIE_HEADER before importing free-board posts.');
  await target.execute(
    `INSERT INTO boards (slug, name, description, visibility, allow_anonymous)
     VALUES ('free', '자유게시판', '학생 자유게시판', 'public', 0)
     ON DUPLICATE KEY UPDATE visibility = 'public', allow_anonymous = 0, updated_at = now(3)`,
  );
  const board = await selectOne(target, "SELECT id FROM boards WHERE slug = 'free' LIMIT 1");
  if (!board) throw new Error('Missing free board.');
  const entries = await collectBoardEntries();
  let imported = 0;
  let commentsImported = 0;
  let skipped = 0;
  for (const entry of entries) {
    const url = `${BOARD_BASE}readDocument.php?id=${encodeURIComponent(entry.legacyId)}`;
    const detail = parseBoardDetail(await fetchText(url, { cookie }), url, entry);
    if (!detail.title) {
      skipped += 1;
      continue;
    }
    const authorId = await findUserIdByStudentNo(target, detail.studentNo);
    await maybeSetNickname(target, authorId, detail.nickname);
    const exists = await selectOne(
      target,
      'SELECT id FROM posts WHERE board_id = ? AND title = ? AND content = ? LIMIT 1',
      [board.id, detail.title, detail.content],
    );
    let postId = exists?.id;
    if (!postId) {
      const publicNo = await nextPostPublicNo(target, board.id);
      const [result] = await target.execute(
        `INSERT INTO posts
          (public_no, board_id, author_id, title, content, content_json, post_status, is_anonymous,
           is_hidden, view_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), 'published', 0, 0, ?, ?, ?)`,
        [
          publicNo,
          board.id,
          authorId,
          detail.title,
          detail.content,
          JSON.stringify(detail.contentDoc),
          detail.viewCount,
          detail.createdAt,
          detail.createdAt,
        ],
      );
      postId = result.insertId;
      imported += 1;
    }
    for (const comment of detail.comments) {
      const commentAuthorId = await findUserIdByStudentNo(target, comment.studentNo);
      await maybeSetNickname(target, commentAuthorId, comment.nickname);
      const commentExists = await selectOne(
        target,
        'SELECT id FROM comments WHERE post_id = ? AND content = ? AND author_id <=> ? LIMIT 1',
        [postId, comment.content, commentAuthorId],
      );
      if (!commentExists) {
        await target.execute(
          `INSERT INTO comments (post_id, author_id, content, is_hidden, created_at, updated_at)
           VALUES (?, ?, ?, 0, ?, ?)`,
          [postId, commentAuthorId, comment.content, comment.createdAt, comment.createdAt],
        );
        commentsImported += 1;
      }
    }
  }
  return { imported, commentsImported, skipped, seen: entries.length };
}

async function main() {
  loadEnv();
  const phase = process.env.LEGACY_IMPORT_PHASE || 'all';
  const target = await mysql.createConnection(
    seedConnectionOptions(process.env.DATABASE_URL, process.env),
  );
  let legacy;

  if (phase === 'all' || phase === 'plma') {
    legacy = await mysql.createConnection(
      seedConnectionOptions(process.env.LEGACY_PLMA_DATABASE_URL, process.env),
    );
    const historyPath = windowsPathToWsl(process.env.PLMA_HISTORY_DUMP || DEFAULT_HISTORY_DUMP);
    const songsPath = windowsPathToWsl(process.env.PLMA_SONGS_DUMP || DEFAULT_SONGS_DUMP);
    const historyRows = extractRows(readFileSync(historyPath, 'utf8'), 'history');
    const songRows = extractRows(readFileSync(songsPath, 'utf8'), 'songs');
    const [iamRows] = await legacy.execute('SELECT id, stuid FROM iam');
    const iamStudentNoById = new Map(
      iamRows.map((row) => [Number(row.id), Number(row.stuid)]).filter(([, stuid]) => stuid),
    );

    try {
      await target.beginTransaction();
      const people = await importLegacyPeople(target, legacy);
      const pointHistory = await importPointHistory(target, historyRows);
      const wakeSongs = await importWakeSongs(target, songRows, iamStudentNoById);
      await target.commit();
      console.log('Legacy PLMA import complete:', { people, pointHistory, wakeSongs });
    } catch (error) {
      await target.rollback();
      throw error;
    }
  }

  if (phase === 'all' || phase === 'notices' || phase === 'content') {
    const notices = await importNotices(target);
    console.log('Legacy notice import complete:', notices);
  }
  if (phase === 'all' || phase === 'board' || phase === 'content') {
    const board = await importBoardPosts(target);
    console.log('Legacy board import complete:', board);
  }

  await target.end();
  if (legacy) await legacy.end();
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
