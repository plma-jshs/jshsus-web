#!/usr/bin/env node
const { createHash } = require('node:crypto');
const { createReadStream, readFileSync } = require('node:fs');
const { readFile, stat } = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const { createGunzip } = require('node:zlib');
const mysql = require('mysql2/promise');

const databaseUrl = process.env.DATABASE_URL;
const backupPath = path.resolve(process.env.RESTORE_BACKUP_PATH ?? '');
const confirmation = process.env.RESTORE_CONFIRMATION;
const sslMode = process.env.DATABASE_SSL_MODE ?? 'required';
const expectedHost = process.env.RESTORE_EXPECTED_HOST ?? 'iam.jshsus.kr';
const expectedDatabase = process.env.RESTORE_EXPECTED_DATABASE ?? 'jshsus_v26';
const restoreRoot = path.resolve(process.env.RESTORE_ROOT ?? '/restore');
const allowedExpectedHosts = new Set(['iam.jshsus.kr', 'host.docker.internal']);

if (!databaseUrl) throw new Error('DATABASE_URL is required.');
if (!process.env.RESTORE_BACKUP_PATH) throw new Error('RESTORE_BACKUP_PATH is required.');
if (!allowedExpectedHosts.has(expectedHost)) {
  throw new Error(`RESTORE_EXPECTED_HOST is not an approved production endpoint: ${expectedHost}.`);
}

const url = new URL(databaseUrl);
const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
const backupName = path.basename(backupPath);
const expectedConfirmation = `restore:${database}:${backupName}`;

if (url.protocol !== 'mysql:') throw new Error('DATABASE_URL must use the mysql protocol.');
if (url.hostname !== expectedHost || database !== expectedDatabase) {
  throw new Error(
    `Restore target mismatch: expected ${expectedHost}/${expectedDatabase}, received ${url.hostname}/${database}.`,
  );
}
if (url.hostname === 'jshsus-php.jshsus.kr') {
  throw new Error('The legacy PHP database is permanently excluded from restore operations.');
}
if (confirmation !== expectedConfirmation) {
  throw new Error(`RESTORE_CONFIRMATION must exactly equal ${expectedConfirmation}.`);
}
if (path.dirname(backupPath) !== restoreRoot) {
  throw new Error(`Restore backup must be mounted directly below ${restoreRoot}.`);
}
if (!backupName.startsWith(`${database}-`) || !backupName.endsWith('.sql.gz')) {
  throw new Error('Backup filename does not match the target database.');
}

function identifier(value) {
  return `\`${String(value).replace(/`/g, '``')}\``;
}

function tlsOptions() {
  if (sslMode === 'disabled') return undefined;
  if (sslMode === 'required') return { rejectUnauthorized: false };

  const caPath = process.env.DATABASE_SSL_CA_PATH;
  if (!caPath) throw new Error('verify_identity requires DATABASE_SSL_CA_PATH.');
  return { rejectUnauthorized: true, ca: readFileSync(caPath, 'utf8') };
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function readGzipPrefix(file, byteLimit = 4096) {
  const chunks = [];
  let length = 0;
  const source = createReadStream(file).pipe(createGunzip());
  for await (const chunk of source) {
    const remaining = byteLimit - length;
    chunks.push(chunk.subarray(0, remaining));
    length += Math.min(chunk.length, remaining);
    if (length >= byteLimit) {
      source.destroy();
      break;
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function verifyBackup() {
  const backupStat = await stat(backupPath);
  if (!backupStat.isFile() || backupStat.size === 0) throw new Error('Backup file is empty.');

  const checksumPath = `${backupPath}.sha256`;
  const checksum = (await readFile(checksumPath, 'utf8')).trim();
  const match = /^([a-f0-9]{64}) {2}([^/\\]+)$/.exec(checksum);
  if (!match || match[2] !== backupName) {
    throw new Error('Backup checksum file has an invalid format or filename.');
  }
  const actualDigest = await sha256(backupPath);
  if (actualDigest !== match[1]) throw new Error('Backup SHA-256 verification failed.');

  const prefix = await readGzipPrefix(backupPath);
  if (
    !prefix.includes('-- JSHSUS database backup') ||
    !prefix.includes(`USE ${identifier(database)};`)
  ) {
    throw new Error('Backup header or target database marker is invalid.');
  }
  console.log(
    `Verified restore backup: file=${backupName} bytes=${backupStat.size} sha256=${actualDigest}`,
  );
}

async function databaseObjects(connection) {
  const [rows] = await connection.query(
    `
      SELECT TABLE_NAME AS name, TABLE_TYPE AS type
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `,
    [database],
  );
  return rows.map((row) => ({ name: row.name, type: row.type }));
}

async function dropCurrentObjects(connection) {
  const objects = await databaseObjects(connection);
  const views = objects.filter((object) => object.type === 'VIEW');
  const tables = objects.filter((object) => object.type !== 'VIEW');
  await connection.query('SET FOREIGN_KEY_CHECKS=0');
  try {
    for (const view of views) {
      await connection.query(`DROP VIEW IF EXISTS ${identifier(view.name)}`);
    }
    for (const table of tables) {
      await connection.query(`DROP TABLE IF EXISTS ${identifier(table.name)}`);
    }
  } finally {
    await connection.query('SET FOREIGN_KEY_CHECKS=1');
  }
  console.log(`Cleared restore target: objects=${objects.length}`);
}

async function importBackup(connection) {
  const input = readline.createInterface({
    input: createReadStream(backupPath).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  let statement = '';
  let statementCount = 0;

  for await (const line of input) {
    if (!statement && (line === '' || line.startsWith('--'))) continue;
    statement += `${line}\n`;
    if (!line.trimEnd().endsWith(';')) continue;

    const sql = statement.trim();
    statement = '';
    if (/^(?:CREATE DATABASE|USE)\b/i.test(sql)) continue;
    if (Buffer.byteLength(sql, 'utf8') > 2 * 1024 * 1024) {
      throw new Error('Backup statement exceeds the 2 MiB restore safety limit.');
    }
    await connection.query(sql);
    statementCount += 1;
  }
  if (statement.trim()) {
    throw new Error('Backup ended with an incomplete SQL statement.');
  }
  console.log(`Imported restore backup: file=${backupName} statements=${statementCount}`);
}

async function printSafeCounts(connection) {
  const objects = await databaseObjects(connection);
  const available = new Set(objects.map((object) => object.name));
  const counts = {};
  for (const table of [
    '__drizzle_migrations',
    'users',
    'students',
    'posts',
    'comments',
    'point_records',
    'point_cases',
    'activity_requests',
    'legacy_activity_requests',
  ]) {
    if (!available.has(table)) continue;
    const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM ${identifier(table)}`);
    counts[table] = Number(rows[0]?.count ?? 0);
  }
  console.log(`Restored database counts: ${JSON.stringify(counts)}`);
}

async function main() {
  await verifyBackup();
  const connection = await mysql.createConnection({
    uri: databaseUrl,
    ssl: tlsOptions(),
    timezone: 'Z',
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  let locked = false;
  try {
    const [lockRows] = await connection.query(
      "SELECT GET_LOCK('jshsus_database_restore', 0) AS acquired",
    );
    if (Number(lockRows[0]?.acquired ?? 0) !== 1) {
      throw new Error('Another database restore is already running.');
    }
    locked = true;
    await dropCurrentObjects(connection);
    await importBackup(connection);
    await printSafeCounts(connection);
  } finally {
    if (locked) {
      await connection
        .query("SELECT RELEASE_LOCK('jshsus_database_restore')")
        .catch(() => undefined);
    }
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
