#!/usr/bin/env node
const { createHash } = require('node:crypto');
const mysql = require('mysql2/promise');
const { decodeHtmlEntities } = require('./html-entities.cjs');
const { seedConnectionOptions } = require('./seed-connection.cjs');

const LOCK_NAME = 'jshsus-migrate-legacy-thanks-activity';
const ACTIVITY_PAGE_SIZE = 100;
const INSERT_BATCH_SIZE = 200;
const DEFAULT_SOURCE_URL = 'https://jshsus.kr';
const DEFAULT_START_DATE = '2020-01-01';
const DEFAULT_END_DATE = '2030-12-31';
const EXCLUDED_LEGACY_STUDENT_NOS = new Set(['9988']);
const TIME_SLOTS = [
  { id: 'morning-1', startsAt: '09:00', endsAt: '10:40' },
  { id: 'morning-2', startsAt: '11:00', endsAt: '12:00' },
  { id: 'afternoon-1', startsAt: '14:00', endsAt: '15:40' },
  { id: 'afternoon-2', startsAt: '16:00', endsAt: '18:00' },
  { id: 'evening-1', startsAt: '19:10', endsAt: '20:20' },
  { id: 'evening-2', startsAt: '20:30', endsAt: '21:30' },
  { id: 'evening-3', startsAt: '21:50', endsAt: '23:30' },
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

function connectionOptions(databaseUrl) {
  const base = seedConnectionOptions(databaseUrl, process.env);
  const options = typeof base === 'string' ? { uri: base } : base;
  return { ...options, dateStrings: true, timezone: '+09:00' };
}

function cleanText(value) {
  return decodeHtmlEntities(String(value ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeName(value) {
  return cleanText(value).replace(/\s+/g, '');
}

function safeDateOnly(value) {
  const candidate = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const date = new Date(`${candidate}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== candidate
    ? null
    : candidate;
}

function nextDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function normalizeTime(value) {
  const match = String(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseTimeRanges(value) {
  const ranges = [];
  for (const match of String(value ?? '').matchAll(
    /(\d{1,2}:\d{2})\s*(?:~|-)\s*(\d{1,2}:\d{2})/g,
  )) {
    const startsAt = normalizeTime(match[1]);
    const endsAt = normalizeTime(match[2]);
    if (!startsAt || !endsAt || startsAt >= endsAt) continue;
    ranges.push({ startsAt, endsAt });
  }
  return ranges;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function activityHash(record) {
  return sha256(
    JSON.stringify({
      sourceId: record.sourceId,
      activityDate: record.activityDate,
      timeText: record.timeText,
      timeRanges: record.timeRanges,
      location: record.location,
      purpose: record.purpose,
      representativeText: record.representativeText,
      participantsText: record.participantsText,
      advisorTeacherName: record.advisorTeacherName,
      supportText: record.supportText,
      submittedLabel: record.submittedLabel,
    }),
  );
}

function activityContentHash(record) {
  return sha256(
    JSON.stringify({
      activityDate: record.activityDate,
      timeText: record.timeText,
      location: record.location,
      purpose: record.purpose,
      representativeText: record.representativeText,
      participantsText: record.participantsText,
      advisorTeacherName: record.advisorTeacherName,
      supportText: record.supportText,
      submittedLabel: record.submittedLabel,
    }),
  );
}

function parseActivityPage(html) {
  const records = [];
  const blockPattern = /<div class=["']table-div["']>([\s\S]*?)<\/div>/gi;
  for (const blockMatch of html.matchAll(blockPattern)) {
    const block = blockMatch[1];

    const fields = new Map();
    const rowPattern =
      /<tr>\s*<th>([\s\S]*?)<\/th>\s*<td>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/td>\s*<\/tr>/gi;
    for (const rowMatch of block.matchAll(rowPattern)) {
      fields.set(cleanText(rowMatch[1]), cleanText(rowMatch[2]));
    }

    const activityDate = safeDateOnly(fields.get('활동날짜'));
    if (!activityDate && !fields.has('활동날짜')) continue;
    if (!activityDate) {
      throw new Error('Legacy activity record has an invalid activity date.');
    }
    const timeText = fields.get('활동시간') ?? '';
    const record = {
      // Delete ids are hidden or reused for anonymous reads. A deterministic id is assigned
      // after all non-overlapping date windows have been collected.
      sourceId: null,
      activityDate,
      timeText,
      timeRanges: parseTimeRanges(timeText),
      location: fields.get('활동장소') ?? '',
      purpose: fields.get('활동내용') ?? '',
      representativeText: fields.get('대표학생') ?? '',
      participantsText: fields.get('참가학생') ?? '',
      advisorTeacherName: fields.get('지도교사') || null,
      supportText: fields.get('지원') || null,
      submittedLabel:
        cleanText(block.match(/<p class=["']table-ago["']>([\s\S]*?)<\/p>/i)?.[1]) || null,
    };
    if (!record.location || !record.purpose || !record.representativeText) {
      throw new Error('Legacy activity record is missing a required field.');
    }
    records.push(record);
  }
  return records;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      'user-agent': 'jshsus-v26-legacy-migration/1.0',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Legacy source returned HTTP ${response.status}: ${url}`);
  return response.text();
}

async function fetchLegacyActivities(sourceUrl, startDate, endDate) {
  const intervals = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    const intervalEnd = new Date(`${cursor}T00:00:00Z`);
    intervalEnd.setUTCDate(intervalEnd.getUTCDate() + 6);
    const boundedEnd = intervalEnd.toISOString().slice(0, 10);
    intervals.push({ start: cursor, end: boundedEnd < endDate ? boundedEnd : endDate });
    cursor = nextDate(intervals.at(-1).end);
  }

  let pages = 0;
  async function fetchInterval(start, end) {
    pages += 1;
    if (pages > 1_000) throw new Error('Legacy activity pagination exceeded 1,000 pages.');
    const url = new URL('/contents/ssam/check/index.php', sourceUrl);
    url.searchParams.set('start', start);
    url.searchParams.set('end', end);
    const pageRecords = parseActivityPage(await fetchText(url));
    if (pageRecords.length < ACTIVITY_PAGE_SIZE) return pageRecords;
    if (start === end) {
      throw new Error(`Legacy activity source exceeds 100 records on ${start}.`);
    }
    const startValue = new Date(`${start}T00:00:00Z`).valueOf();
    const endValue = new Date(`${end}T00:00:00Z`).valueOf();
    const midpoint = new Date(startValue + Math.floor((endValue - startValue) / 2));
    const leftEnd = midpoint.toISOString().slice(0, 10);
    const rightStart = nextDate(leftEnd);
    const [left, right] = await Promise.all([
      fetchInterval(start, leftEnd),
      fetchInterval(rightStart, end),
    ]);
    return [...left, ...right];
  }

  const intervalResults = new Array(intervals.length);
  let nextInterval = 0;
  const workers = Array.from({ length: Math.min(8, intervals.length) }, async () => {
    while (nextInterval < intervals.length) {
      const index = nextInterval;
      nextInterval += 1;
      intervalResults[index] = await fetchInterval(intervals[index].start, intervals[index].end);
    }
  });
  await Promise.all(workers);

  const occurrenceByContentHash = new Map();
  const recordsById = new Map();
  for (const record of intervalResults.flat()) {
    if (!record.sourceId) {
      const contentHash = activityContentHash(record);
      const occurrence = (occurrenceByContentHash.get(contentHash) ?? 0) + 1;
      occurrenceByContentHash.set(contentHash, occurrence);
      record.sourceId = `anon-${contentHash.slice(0, 48)}-${String(occurrence).padStart(4, '0')}`;
    }
    record.sourcePayloadHash = activityHash(record);
    const existing = recordsById.get(record.sourceId);
    if (existing && existing.sourcePayloadHash !== record.sourcePayloadHash) {
      throw new Error(`Legacy activity source id ${record.sourceId} is not unique.`);
    }
    recordsById.set(record.sourceId, record);
  }

  return {
    pages,
    records: [...recordsById.values()].sort(
      (left, right) =>
        left.activityDate.localeCompare(right.activityDate) ||
        left.sourceId.localeCompare(right.sourceId),
    ),
  };
}

async function fetchLegacyThanks(sourceUrl) {
  const url = new URL('/contents/thanks/getThanksProcess.php', sourceUrl);
  url.searchParams.set('mod', '1');
  const payload = JSON.parse(await fetchText(url));
  if (!payload?.success || !Array.isArray(payload.data)) {
    throw new Error('Legacy thanks endpoint returned an unexpected payload.');
  }

  let excluded = 0;
  const records = [];
  for (const row of payload.data) {
    const schoolNumber = cleanText(row.school_number);
    const message = cleanText(row.thanks);
    const submittedAt = cleanText(row.DAY);
    if (EXCLUDED_LEGACY_STUDENT_NOS.has(schoolNumber)) {
      excluded += 1;
      continue;
    }
    if (
      !/^[0-9A-Za-z_-]{1,20}$/.test(schoolNumber) ||
      !message ||
      !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(submittedAt)
    ) {
      throw new Error('Legacy thanks payload contains an invalid row.');
    }
    records.push({ schoolNumber, message, submittedAt });
  }
  return { excluded, records };
}

function personReference(value) {
  const match = cleanText(value).match(/^(\d{4})\s*([가-힣]{2,8})(?:\s*\([^)]*\))?$/);
  return match ? { studentNo: Number(match[1]), name: normalizeName(match[2]) } : null;
}

function participantReferences(value) {
  const text = cleanText(value);
  const schoolNumbers = text.match(/(?<!\d)\d{4}(?!\d)/g) ?? [];
  if (schoolNumbers.length === 0) return [];
  const references = [...text.matchAll(/(?<!\d)(\d{4})\s*([가-힣]{2,8})/g)].map((match) => ({
    studentNo: Number(match[1]),
    name: normalizeName(match[2]),
  }));
  return references.length === schoolNumbers.length ? references : null;
}

function koreaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function createLinkPlan(records, students, staff) {
  const studentByKey = new Map(
    students.map((student) => [
      `${Number(student.studentNo)}:${normalizeName(student.name)}`,
      {
        id: Number(student.id),
        userId: student.userId === null ? null : Number(student.userId),
      },
    ]),
  );
  const staffIdsByName = new Map();
  for (const profile of staff) {
    const name = normalizeName(profile.name);
    const ids = staffIdsByName.get(name) ?? [];
    ids.push(Number(profile.userId));
    staffIdsByName.set(name, ids);
  }

  const skipped = {
    invalidRepresentative: 0,
    invalidParticipants: 0,
    unmatchedStudent: 0,
    invalidTime: 0,
    exceedsCurrentFieldLimit: 0,
  };
  const linked = [];
  const today = koreaToday();

  for (const record of records) {
    const representative = personReference(record.representativeText);
    if (!representative) {
      skipped.invalidRepresentative += 1;
      continue;
    }
    const participants = participantReferences(record.participantsText);
    if (participants === null) {
      skipped.invalidParticipants += 1;
      continue;
    }
    const references = [representative, ...participants];
    const uniqueReferences = new Map(
      references.map((reference) => [`${reference.studentNo}:${reference.name}`, reference]),
    );
    const resolved = [...uniqueReferences].map(([key]) => studentByKey.get(key));
    if (resolved.some((student) => !student)) {
      skipped.unmatchedStudent += 1;
      continue;
    }
    if (record.timeRanges.length === 0) {
      skipped.invalidTime += 1;
      continue;
    }
    if (record.location.length > 160 || record.purpose.length > 500) {
      skipped.exceedsCurrentFieldLimit += 1;
      continue;
    }

    const representativeStudent = studentByKey.get(
      `${representative.studentNo}:${representative.name}`,
    );
    const teacherIds = staffIdsByName.get(normalizeName(record.advisorTeacherName)) ?? [];
    const slotIds = record.timeRanges.map(
      (range) =>
        TIME_SLOTS.find((slot) => slot.startsAt === range.startsAt && slot.endsAt === range.endsAt)
          ?.id,
    );
    linked.push({
      sourceId: record.sourceId,
      issuedNumber: `LEGACY-SSAM-${sha256(record.sourceId).slice(0, 48)}`,
      representativeStudentId: representativeStudent.id,
      createdById: representativeStudent.userId,
      advisorTeacherId: teacherIds.length === 1 ? teacherIds[0] : null,
      participantStudentIds: [...new Set(resolved.map((student) => student.id))],
      location: record.location,
      purpose: record.purpose,
      startsAt: `${record.activityDate} ${record.timeRanges[0].startsAt}:00.000`,
      endsAt: `${record.activityDate} ${record.timeRanges.at(-1).endsAt}:00.000`,
      activitySlotIds: slotIds.every(Boolean) ? slotIds : null,
      status: record.activityDate < today ? 'completed' : 'approved',
      timestamp: `${record.activityDate} 00:00:00.000`,
    });
  }
  return { linked, skipped };
}

function thanksKey(record) {
  return JSON.stringify([record.schoolNumber, record.message, record.submittedAt]);
}

async function readTargetState(connection) {
  const [archiveRows] = await connection.execute(
    'SELECT source_id AS sourceId, source_payload_hash AS sourcePayloadHash FROM legacy_activity_archives',
  );
  const [thanksRows] = await connection.execute(
    `SELECT school_number AS schoolNumber,
            message,
            DATE_FORMAT(submitted_at, '%Y-%m-%d %H:%i:%s') AS submittedAt
       FROM thanks_messages`,
  );
  const [issuedRows] = await connection.execute(
    `SELECT issued_number AS issuedNumber
       FROM activity_requests
      WHERE issued_number LIKE 'LEGACY-SSAM-%'`,
  );
  const [students] = await connection.execute(
    'SELECT id, user_id AS userId, student_no AS studentNo, name FROM students',
  );
  const [staff] = await connection.execute('SELECT user_id AS userId, name FROM staff_profiles');
  return {
    archiveHashes: new Map(archiveRows.map((row) => [row.sourceId, row.sourcePayloadHash])),
    thanksKeys: new Set(thanksRows.map(thanksKey)),
    issuedNumbers: new Set(issuedRows.map((row) => row.issuedNumber)),
    students,
    staff,
  };
}

async function assertTargetReady(connection, databaseName) {
  const [rows] = await connection.execute(
    `SELECT table_name AS tableName
       FROM information_schema.tables
      WHERE table_schema = ?
        AND table_name IN ('legacy_activity_archives', 'thanks_messages', 'activity_requests')`,
    [databaseName],
  );
  if (rows.length !== 3) {
    throw new Error(
      'Target migrations are not current. Apply 0003_legacy_activity_archive before importing.',
    );
  }
}

function chunks(values, size = INSERT_BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function upsertActivityArchive(connection, records) {
  for (const batch of chunks(records)) {
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const values = batch.flatMap((record) => [
      record.sourceId,
      record.activityDate,
      record.timeText,
      JSON.stringify(record.timeRanges),
      record.location,
      record.purpose,
      record.representativeText,
      record.participantsText,
      record.advisorTeacherName,
      record.supportText,
      record.submittedLabel,
      record.sourcePayloadHash,
    ]);
    await connection.execute(
      `INSERT INTO legacy_activity_archives
        (source_id, activity_date, time_text, time_ranges, location, purpose,
         representative_text, participants_text, advisor_teacher_name, support_text,
         submitted_label, source_payload_hash)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         imported_at = IF(source_payload_hash <> VALUES(source_payload_hash), now(3), imported_at),
         activity_date = VALUES(activity_date),
         time_text = VALUES(time_text),
         time_ranges = VALUES(time_ranges),
         location = VALUES(location),
         purpose = VALUES(purpose),
         representative_text = VALUES(representative_text),
         participants_text = VALUES(participants_text),
         advisor_teacher_name = VALUES(advisor_teacher_name),
         support_text = VALUES(support_text),
         submitted_label = VALUES(submitted_label),
         source_payload_hash = VALUES(source_payload_hash)`,
      values,
    );
  }
}

async function insertThanks(connection, records) {
  for (const batch of chunks(records)) {
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const values = batch.flatMap((record) => [
      record.schoolNumber,
      record.message,
      record.submittedAt,
      record.submittedAt,
      record.submittedAt,
    ]);
    await connection.execute(
      `INSERT INTO thanks_messages
        (school_number, message, submitted_at, created_at, updated_at)
       VALUES ${placeholders}`,
      values,
    );
  }
}

async function insertLinkedActivities(connection, records) {
  for (const batch of chunks(records, 100)) {
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const values = batch.flatMap((record) => [
      record.representativeStudentId,
      record.createdById,
      record.advisorTeacherId,
      record.location,
      record.startsAt,
      record.endsAt,
      record.activitySlotIds === null ? null : JSON.stringify(record.activitySlotIds),
      record.purpose,
      record.status,
      record.issuedNumber,
      record.timestamp,
      record.timestamp,
      record.timestamp,
    ]);
    await connection.execute(
      `INSERT INTO activity_requests
        (student_id, created_by_id, teacher_id, location, starts_at, ends_at,
         activity_slot_ids, purpose, activity_request_status, issued_number, issued_at,
         created_at, updated_at)
       VALUES ${placeholders}`,
      values,
    );

    const issuedNumbers = batch.map((record) => record.issuedNumber);
    const [requestRows] = await connection.query(
      `SELECT id, issued_number AS issuedNumber
         FROM activity_requests
        WHERE issued_number IN (?)`,
      [issuedNumbers],
    );
    const requestIdByIssuedNumber = new Map(
      requestRows.map((row) => [row.issuedNumber, Number(row.id)]),
    );
    const participantValues = batch.flatMap((record) =>
      record.participantStudentIds.map((studentId) => [
        requestIdByIssuedNumber.get(record.issuedNumber),
        studentId,
        record.timestamp,
      ]),
    );
    for (const participantBatch of chunks(participantValues)) {
      await connection.execute(
        `INSERT INTO activity_request_participants
          (activity_request_id, student_id, created_at)
         VALUES ${participantBatch.map(() => '(?, ?, ?)').join(', ')}`,
        participantBatch.flat(),
      );
    }
    const eventValues = batch.map((record) => [
      requestIdByIssuedNumber.get(record.issuedNumber),
      record.status,
      'PHP 레거시 탐구활동서 이관',
      record.timestamp,
    ]);
    await connection.execute(
      `INSERT INTO activity_request_events
        (activity_request_id, activity_request_event_type, note, created_at)
       VALUES ${eventValues.map(() => '(?, ?, ?, ?)').join(', ')}`,
      eventValues.flat(),
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceUrl = new URL(options.source ?? DEFAULT_SOURCE_URL);
  const startDate = safeDateOnly(options.start ?? DEFAULT_START_DATE);
  const endDate = safeDateOnly(options.end ?? DEFAULT_END_DATE);
  const apply = options.apply === 'true';
  const fetchOnly = options['fetch-only'] === 'true';

  if (sourceUrl.protocol !== 'https:' || sourceUrl.hostname !== 'jshsus.kr') {
    throw new Error('The legacy source must be https://jshsus.kr.');
  }
  if (!startDate || !endDate || startDate > endDate) {
    throw new Error('--start and --end must be valid ordered YYYY-MM-DD dates.');
  }
  if (apply && fetchOnly) throw new Error('--apply and --fetch-only cannot be combined.');

  const [activitySource, thanksSource] = await Promise.all([
    fetchLegacyActivities(sourceUrl, startDate, endDate),
    fetchLegacyThanks(sourceUrl),
  ]);
  const sourceReport = {
    sourceHost: sourceUrl.hostname,
    activityPages: activitySource.pages,
    activityRecords: activitySource.records.length,
    activityFirstDate: activitySource.records[0]?.activityDate ?? null,
    activityLastDate: activitySource.records.at(-1)?.activityDate ?? null,
    thanksRecords: thanksSource.records.length,
    excludedLegacyThanks: thanksSource.excluded,
  };
  if (fetchOnly) {
    console.log(JSON.stringify({ mode: 'fetch-only', ...sourceReport }, null, 2));
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const databaseName = databaseNameFromUrl(databaseUrl);
  if (apply) {
    if (options['confirm-source-host'] !== sourceUrl.hostname) {
      throw new Error(`Apply requires --confirm-source-host=${sourceUrl.hostname}.`);
    }
    if (options['confirm-target'] !== databaseName) {
      throw new Error(`Apply requires --confirm-target=${databaseName}.`);
    }
  }

  const connection = await mysql.createConnection(connectionOptions(databaseUrl));
  let lockAcquired = false;
  try {
    await assertTargetReady(connection, databaseName);
    const [[lock]] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [LOCK_NAME]);
    lockAcquired = Number(lock.acquired) === 1;
    if (!lockAcquired) throw new Error('Could not acquire the legacy migration lock.');

    await connection.beginTransaction();
    const target = await readTargetState(connection);
    const linkPlan = createLinkPlan(activitySource.records, target.students, target.staff);
    const archiveToInsert = activitySource.records.filter(
      (record) => !target.archiveHashes.has(record.sourceId),
    );
    const archiveToUpdate = activitySource.records.filter((record) => {
      const hash = target.archiveHashes.get(record.sourceId);
      return hash !== undefined && hash !== record.sourcePayloadHash;
    });
    const thanksToInsert = thanksSource.records.filter(
      (record) => !target.thanksKeys.has(thanksKey(record)),
    );
    const linkedToInsert = linkPlan.linked.filter(
      (record) => !target.issuedNumbers.has(record.issuedNumber),
    );
    const report = {
      mode: apply ? 'apply' : 'dry-run',
      target: databaseName,
      ...sourceReport,
      archiveExisting: target.archiveHashes.size,
      archiveToInsert: archiveToInsert.length,
      archiveToUpdate: archiveToUpdate.length,
      archiveUnchanged:
        activitySource.records.length - archiveToInsert.length - archiveToUpdate.length,
      linkedEligible: linkPlan.linked.length,
      linkedExisting: linkPlan.linked.length - linkedToInsert.length,
      linkedToInsert: linkedToInsert.length,
      linkSkipped: linkPlan.skipped,
      thanksExisting: target.thanksKeys.size,
      thanksToInsert: thanksToInsert.length,
    };

    if (!apply) {
      await connection.rollback();
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    await upsertActivityArchive(connection, activitySource.records);
    await insertThanks(connection, thanksToInsert);
    await insertLinkedActivities(connection, linkedToInsert);
    await connection.commit();

    const [[totals]] = await connection.execute(
      `SELECT
         (SELECT COUNT(*) FROM legacy_activity_archives) AS archivedActivities,
         (SELECT COUNT(*) FROM activity_requests WHERE issued_number LIKE 'LEGACY-SSAM-%')
           AS linkedActivities,
         (SELECT COUNT(*) FROM thanks_messages) AS thanksMessages`,
    );
    console.log(
      JSON.stringify(
        {
          ...report,
          insertedThanks: thanksToInsert.length,
          insertedLinkedActivities: linkedToInsert.length,
          targetTotals: {
            archivedActivities: Number(totals.archivedActivities),
            linkedActivities: Number(totals.linkedActivities),
            thanksMessages: Number(totals.thanksMessages),
          },
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    if (lockAcquired) {
      await connection.execute('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => undefined);
    }
    await connection.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  activityHash,
  cleanText,
  createLinkPlan,
  databaseNameFromUrl,
  parseActivityPage,
  parseArgs,
  parseTimeRanges,
  participantReferences,
  personReference,
  safeDateOnly,
  thanksKey,
};
