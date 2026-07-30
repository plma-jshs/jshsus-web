#!/usr/bin/env node
const mysql = require('mysql2/promise');
const { decodeHtmlEntities } = require('./html-entities.cjs');
const { seedConnectionOptions } = require('./seed-connection.cjs');

const LOCK_NAME = 'jshsus-migrate-legacy-points';
const INSERT_BATCH_SIZE = 250;

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
    throw new Error('Database URL must contain a safe database name.');
  }
  return database;
}

function connectionOptions(databaseUrl) {
  const base = seedConnectionOptions(databaseUrl, process.env);
  return typeof base === 'string'
    ? { uri: base, dateStrings: true }
    : { ...base, dateStrings: true };
}

function safeDateOnly(value) {
  const candidate = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const date = new Date(`${candidate}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== candidate
    ? null
    : candidate;
}

function pointFromHistory(history) {
  return (
    Number(history.afterplus ?? 0) -
    Number(history.beforeplus ?? 0) -
    (Number(history.afterminus ?? 0) - Number(history.beforeminus ?? 0))
  );
}

function typeFromPoint(point) {
  if (point > 0) return 'PLUS';
  if (point < 0) return 'MINUS';
  return 'ETC';
}

function reasonDefinitionFromLegacy(reason) {
  const plus = Number(reason.plus ?? 0);
  const minus = Number(reason.minus ?? 0);
  const point = plus > 0 ? plus : minus > 0 ? -minus : 0;
  return {
    type: typeFromPoint(point),
    point,
    comment: cleanText(reason.title, '사유 없음'),
    isActive: Number(reason.dpc) === 0,
  };
}

function cleanText(value, fallback = '') {
  const normalized = decodeHtmlEntities(value).replace(/\s+/g, ' ').trim();
  return (normalized || fallback).slice(0, 255);
}

function reasonKey(reason) {
  return JSON.stringify([reason.type, Number(reason.point), reason.comment]);
}

function recordKey(record) {
  return JSON.stringify([
    Number(record.studentId),
    record.teacherId === null ? null : Number(record.teacherId),
    record.reasonKey,
    record.reasonType,
    record.reasonText,
    Number(record.point),
    record.comment,
    record.baseDate,
    record.canceledAt,
    record.createdAt,
  ]);
}

function incrementCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function createReasonPlan(legacyReasons, historyRows) {
  const definitions = new Map();
  const reasonKeyByLegacyId = new Map();
  const adjustmentReasonKeysByHistoryId = new Map();

  for (const reason of legacyReasons) {
    const definition = reasonDefinitionFromLegacy(reason);
    const key = reasonKey(definition);
    reasonKeyByLegacyId.set(Number(reason.id), key);
    const current = definitions.get(key);
    definitions.set(key, {
      ...definition,
      isActive: Boolean(current?.isActive || definition.isActive),
    });
  }

  for (const history of historyRows) {
    const legacyReasonId = Number(history.reason);
    if (reasonKeyByLegacyId.has(legacyReasonId)) continue;
    const point = pointFromHistory(history);
    const definition = {
      type: typeFromPoint(point),
      point,
      comment: cleanText(history.reason_caption, `이관 사유 ${legacyReasonId || '미상'}`),
      isActive: false,
    };
    const key = reasonKey(definition);
    reasonKeyByLegacyId.set(legacyReasonId, key);
    if (!definitions.has(key)) definitions.set(key, definition);
  }

  const previousBalanceByStudentNo = new Map();
  for (const history of historyRows) {
    const studentNo = Number(history.user);
    const previous = previousBalanceByStudentNo.get(studentNo);
    const adjustmentKeys = {};
    if (previous) {
      const plusAdjustment = Number(history.beforeplus ?? 0) - previous.afterplus;
      const minusAdjustment = Number(history.beforeminus ?? 0) - previous.afterminus;
      if (plusAdjustment !== 0) {
        const definition = {
          type: 'PLUS',
          point: plusAdjustment,
          comment: '기존 상점 기준 조정',
          isActive: false,
        };
        adjustmentKeys.plus = reasonKey(definition);
        if (!definitions.has(adjustmentKeys.plus)) {
          definitions.set(adjustmentKeys.plus, definition);
        }
      }
      if (minusAdjustment !== 0) {
        const definition = {
          type: 'MINUS',
          point: -minusAdjustment,
          comment: '기존 벌점 기준 조정',
          isActive: false,
        };
        adjustmentKeys.minus = reasonKey(definition);
        if (!definitions.has(adjustmentKeys.minus)) {
          definitions.set(adjustmentKeys.minus, definition);
        }
      }
    }
    if (adjustmentKeys.plus || adjustmentKeys.minus) {
      adjustmentReasonKeysByHistoryId.set(Number(history.id), adjustmentKeys);
    }
    previousBalanceByStudentNo.set(studentNo, {
      afterplus: Number(history.afterplus ?? 0),
      afterminus: Number(history.afterminus ?? 0),
    });
  }

  return { definitions, reasonKeyByLegacyId, adjustmentReasonKeysByHistoryId };
}

function createRecordPlan(
  historyRows,
  reasonKeyByLegacyId,
  studentsByNo,
  teachersByLegacyId,
  adjustmentReasonKeysByHistoryId = new Map(),
) {
  const records = [];
  const missingStudentNos = new Set();
  const missingTeacherIds = new Set();
  let reconciliationRecords = 0;

  for (const history of historyRows) {
    const studentNo = Number(history.user);
    const studentId = studentsByNo.get(studentNo);
    if (!studentId) {
      missingStudentNos.add(studentNo);
      continue;
    }
    const legacyTeacherId = Number(history.teacher);
    const teacherId = teachersByLegacyId.get(legacyTeacherId);
    if (!teacherId) {
      missingTeacherIds.add(legacyTeacherId);
      continue;
    }

    const point = pointFromHistory(history);
    const createdAt = safeDateOnly(history.date);
    if (!createdAt) throw new Error(`Legacy history ${history.id} has an invalid date.`);
    const baseDate = safeDateOnly(history.act_date) ?? createdAt;
    const reasonKeyValue = reasonKeyByLegacyId.get(Number(history.reason));
    if (!reasonKeyValue) throw new Error(`Legacy history ${history.id} has no reason mapping.`);

    const adjustmentKeys = adjustmentReasonKeysByHistoryId.get(Number(history.id));
    if (adjustmentKeys?.plus) {
      const [reasonType, point] = JSON.parse(adjustmentKeys.plus);
      records.push({
        legacyId: `${history.id}:plus-adjustment`,
        studentId,
        teacherId,
        reasonKey: adjustmentKeys.plus,
        reasonType,
        reasonText: '기존 상점 기준 조정',
        point: Number(point),
        comment: '',
        baseDate: createdAt,
        canceledAt: null,
        createdAt,
      });
      reconciliationRecords += 1;
    }
    if (adjustmentKeys?.minus) {
      const [reasonType, point] = JSON.parse(adjustmentKeys.minus);
      records.push({
        legacyId: `${history.id}:minus-adjustment`,
        studentId,
        teacherId,
        reasonKey: adjustmentKeys.minus,
        reasonType,
        reasonText: '기존 벌점 기준 조정',
        point: Number(point),
        comment: '',
        baseDate: createdAt,
        canceledAt: null,
        createdAt,
      });
      reconciliationRecords += 1;
    }

    records.push({
      legacyId: Number(history.id),
      studentId,
      teacherId,
      reasonKey: reasonKeyValue,
      reasonType: typeFromPoint(point),
      reasonText: cleanText(history.reason_caption, '이관 사유'),
      point,
      comment: '',
      baseDate,
      canceledAt: Number(history.display) === 0 ? createdAt : null,
      createdAt,
    });
  }

  return { records, missingStudentNos, missingTeacherIds, reconciliationRecords };
}

async function readSourceData(connection) {
  await connection.beginTransaction();
  const [reasons] = await connection.execute(
    'SELECT id, title, plus, minus, dpc FROM reason ORDER BY id',
  );
  const [history] = await connection.execute(
    `SELECT id,
            date,
            teacher,
            user,
            beforeplus,
            beforeminus,
            afterplus,
            afterminus,
            reason,
            reason_caption,
            act_date,
            aftersum,
            display
       FROM history
      ORDER BY id`,
  );
  return { reasons, history };
}

async function readTargetMappings(connection) {
  const [students] = await connection.execute('SELECT id, student_no AS studentNo FROM students');
  const [teachers] = await connection.execute(
    `SELECT staff_no AS staffNo, user_id AS userId
       FROM staff_profiles
      WHERE staff_no BETWEEN 100001 AND 199999`,
  );
  return {
    studentsByNo: new Map(
      students.map((student) => [Number(student.studentNo), Number(student.id)]),
    ),
    teachersByLegacyId: new Map(
      teachers.map((teacher) => [Number(teacher.staffNo) - 100000, Number(teacher.userId)]),
    ),
  };
}

async function readExistingReasonState(connection) {
  const [reasons] = await connection.execute(
    `SELECT id,
            point_reason_type AS type,
            point,
            comment,
            is_active AS isActive
       FROM point_reasons
      ORDER BY id
      FOR UPDATE`,
  );
  const reasonIdByKey = new Map();
  for (const reason of reasons) {
    const key = reasonKey(reason);
    if (!reasonIdByKey.has(key)) reasonIdByKey.set(key, Number(reason.id));
  }
  return { reasons, reasonIdByKey };
}

async function readExistingRecordCounts(connection) {
  const [rows] = await connection.execute(
    `SELECT point_records.student_id AS studentId,
            point_records.teacher_id AS teacherId,
            point_reasons.point_reason_type AS templateType,
            point_reasons.point AS templatePoint,
            point_reasons.comment AS templateComment,
            point_records.reason_type AS reasonType,
            point_records.reason_text AS reasonText,
            point_records.point,
            point_records.comment,
            DATE_FORMAT(point_records.base_date, '%Y-%m-%d') AS baseDate,
            CASE
              WHEN point_records.canceled_at IS NULL THEN NULL
              ELSE DATE_FORMAT(point_records.canceled_at, '%Y-%m-%d')
            END AS canceledAt,
            DATE_FORMAT(point_records.created_at, '%Y-%m-%d') AS createdAt
       FROM point_records
       INNER JOIN point_reasons ON point_reasons.id = point_records.reason_id
      FOR UPDATE`,
  );
  const counts = new Map();
  for (const row of rows) {
    const key = recordKey({
      ...row,
      reasonKey: reasonKey({
        type: row.templateType,
        point: row.templatePoint,
        comment: row.templateComment,
      }),
    });
    incrementCount(counts, key);
  }
  return { rows, counts };
}

async function insertReasonDefinitions(connection, definitions, reasonIdByKey) {
  let inserted = 0;
  for (const [key, definition] of definitions) {
    if (reasonIdByKey.has(key)) continue;
    const [result] = await connection.execute(
      `INSERT INTO point_reasons
        (point_reason_type, point, comment, is_active)
       VALUES (?, ?, ?, ?)`,
      [definition.type, definition.point, definition.comment, definition.isActive ? 1 : 0],
    );
    reasonIdByKey.set(key, Number(result.insertId));
    inserted += 1;
  }
  return inserted;
}

function recordsMissingFromTarget(records, existingCounts) {
  const remaining = new Map(existingCounts);
  const missing = [];
  for (const record of records) {
    const key = recordKey(record);
    const count = remaining.get(key) ?? 0;
    if (count > 0) {
      remaining.set(key, count - 1);
    } else {
      missing.push(record);
    }
  }
  return missing;
}

async function insertRecordBatch(connection, records, reasonIdByKey) {
  for (let index = 0; index < records.length; index += INSERT_BATCH_SIZE) {
    const chunk = records.slice(index, index + INSERT_BATCH_SIZE);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').join(', ');
    const values = chunk.flatMap((record) => [
      record.studentId,
      record.teacherId,
      reasonIdByKey.get(record.reasonKey),
      record.reasonType,
      record.reasonText,
      record.point,
      record.comment,
      record.baseDate,
      record.canceledAt ? `${record.canceledAt} 00:00:00.000` : null,
      `${record.createdAt} 00:00:00.000`,
      `${record.createdAt} 00:00:00.000`,
    ]);
    await connection.execute(
      `INSERT INTO point_records
        (student_id, teacher_id, reason_id, reason_type, reason_text, point, comment,
         base_date, canceled_at, restored_at, created_at, updated_at)
       VALUES ${placeholders}`,
      values,
    );
  }
}

async function reconcileStudentPoints(connection) {
  const [result] = await connection.execute(
    `UPDATE students
       LEFT JOIN (
         SELECT student_id,
                COALESCE(SUM(CASE WHEN canceled_at IS NULL THEN point ELSE 0 END), 0) AS currentPoint
           FROM point_records
          GROUP BY student_id
       ) ledger ON ledger.student_id = students.id
        SET students.current_point = COALESCE(ledger.currentPoint, 0)`,
  );
  return Number(result.affectedRows);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apply = options.apply === 'true';
  const sourceUrl = process.env.LEGACY_POINTS_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL;
  if (!sourceUrl) throw new Error('LEGACY_POINTS_DATABASE_URL is required.');
  if (!targetUrl) throw new Error('DATABASE_URL is required.');

  const sourceName = databaseNameFromUrl(sourceUrl);
  const targetName = databaseNameFromUrl(targetUrl);
  if (sourceName === targetName) throw new Error('Source and target databases must be different.');
  if (apply) {
    if (options['confirm-source'] !== sourceName) {
      throw new Error(`Apply requires --confirm-source=${sourceName}.`);
    }
    if (options['confirm-target'] !== targetName) {
      throw new Error(`Apply requires --confirm-target=${targetName}.`);
    }
  }

  const source = await mysql.createConnection(connectionOptions(sourceUrl));
  const target = await mysql.createConnection(connectionOptions(targetUrl));
  let lockAcquired = false;
  try {
    const sourceData = await readSourceData(source);
    const [[lock]] = await target.execute('SELECT GET_LOCK(?, 10) AS acquired', [LOCK_NAME]);
    lockAcquired = Number(lock.acquired) === 1;
    if (!lockAcquired) throw new Error('Could not acquire the point migration lock.');

    await target.beginTransaction();
    const mappings = await readTargetMappings(target);
    const reasonPlan = createReasonPlan(sourceData.reasons, sourceData.history);
    const recordPlan = createRecordPlan(
      sourceData.history,
      reasonPlan.reasonKeyByLegacyId,
      mappings.studentsByNo,
      mappings.teachersByLegacyId,
      reasonPlan.adjustmentReasonKeysByHistoryId,
    );
    const existingReasons = await readExistingReasonState(target);
    const existingRecords = await readExistingRecordCounts(target);
    const missingReasonDefinitions = [...reasonPlan.definitions].filter(
      ([key]) => !existingReasons.reasonIdByKey.has(key),
    );
    const recordsToInsert = recordsMissingFromTarget(recordPlan.records, existingRecords.counts);

    const report = {
      mode: apply ? 'apply' : 'dry-run',
      source: sourceName,
      target: targetName,
      sourceReasons: sourceData.reasons.length,
      sourceRecords: sourceData.history.length,
      reconciliationRecords: recordPlan.reconciliationRecords,
      plannedRecords: recordPlan.records.length,
      reasonDefinitions: reasonPlan.definitions.size,
      existingTargetReasons: existingReasons.reasons.length,
      reasonsToInsert: missingReasonDefinitions.length,
      existingTargetRecords: existingRecords.rows.length,
      recordsToInsert: recordsToInsert.length,
      missingStudentNos: [...recordPlan.missingStudentNos].sort((a, b) => a - b),
      missingTeacherIds: [...recordPlan.missingTeacherIds].sort((a, b) => a - b),
    };

    if (report.missingStudentNos.length > 0 || report.missingTeacherIds.length > 0) {
      throw new Error(
        `Point migration mappings are incomplete:\n${JSON.stringify(report, null, 2)}`,
      );
    }
    if (!apply) {
      await target.rollback();
      await source.rollback();
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const insertedReasons = await insertReasonDefinitions(
      target,
      reasonPlan.definitions,
      existingReasons.reasonIdByKey,
    );
    await insertRecordBatch(target, recordsToInsert, existingReasons.reasonIdByKey);
    const reconciledStudents = await reconcileStudentPoints(target);
    await target.commit();
    await source.commit();

    const [[totals]] = await target.execute(
      `SELECT
         (SELECT COUNT(*) FROM point_reasons) AS reasons,
         (SELECT COUNT(*) FROM point_records) AS records,
         (SELECT COUNT(*) FROM students WHERE current_point <> 0) AS studentsWithPoints`,
    );
    console.log(
      JSON.stringify(
        {
          ...report,
          insertedReasons,
          insertedRecords: recordsToInsert.length,
          reconciledStudents,
          targetTotals: {
            reasons: Number(totals.reasons),
            records: Number(totals.records),
            studentsWithPoints: Number(totals.studentsWithPoints),
          },
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await target.rollback().catch(() => undefined);
    await source.rollback().catch(() => undefined);
    throw error;
  } finally {
    if (lockAcquired) {
      await target.execute('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => undefined);
    }
    await Promise.all([source.end(), target.end()]);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  cleanText,
  createReasonPlan,
  createRecordPlan,
  databaseNameFromUrl,
  parseArgs,
  pointFromHistory,
  reasonDefinitionFromLegacy,
  reasonKey,
  recordKey,
  recordsMissingFromTarget,
  safeDateOnly,
  typeFromPoint,
};
