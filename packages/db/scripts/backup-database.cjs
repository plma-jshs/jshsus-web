#!/usr/bin/env node
const { createHash } = require('node:crypto');
const { createReadStream, createWriteStream } = require('node:fs');
const { chmod, mkdir, readdir, rename, rm, writeFile } = require('node:fs/promises');
const { readFileSync } = require('node:fs');
const { once } = require('node:events');
const { PassThrough } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createGzip, constants: zlibConstants } = require('node:zlib');
const mysql = require('mysql2');
const { escape } = mysql;
const path = require('node:path');

const databaseUrl = process.env.DATABASE_URL;
const backupDir = path.resolve(process.env.BACKUP_DIR ?? '/backups');
const sslMode = process.env.DATABASE_SSL_MODE ?? 'required';
const retentionCount = Number.parseInt(process.env.BACKUP_RETENTION_COUNT ?? '14', 10);

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}
if (!Number.isSafeInteger(retentionCount) || retentionCount < 2 || retentionCount > 100) {
  throw new Error('BACKUP_RETENTION_COUNT must be an integer between 2 and 100.');
}

const url = new URL(databaseUrl);
const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
if (!database || !/^[A-Za-z0-9_]+$/.test(database)) {
  throw new Error('DATABASE_URL must contain a safe database name.');
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

async function rotateBackups() {
  const prefix = `${database}-`;
  const backups = (await readdir(backupDir))
    .filter((file) => file.startsWith(prefix) && file.endsWith('.sql.gz'))
    .sort()
    .reverse();

  for (const file of backups.slice(retentionCount)) {
    await rm(path.join(backupDir, file), { force: true });
    await rm(path.join(backupDir, `${file}.sha256`), { force: true });
  }
}

async function main() {
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  await chmod(backupDir, 0o700);

  const stamp = new Date().toISOString().replace(/[-:.]/g, '');
  const baseName = `${database}-${stamp}.sql.gz`;
  const finalPath = path.join(backupDir, baseName);
  const temporaryPath = `${finalPath}.partial`;
  let renamed = false;

  const rawConnection = mysql.createConnection({
    uri: databaseUrl,
    ssl: tlsOptions(),
    timezone: 'Z',
    dateStrings: true,
    jsonStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  const connection = rawConnection.promise();
  await connection.connect();

  const source = new PassThrough();
  const gzip = createGzip({ level: zlibConstants.Z_BEST_COMPRESSION });
  const destination = createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 });
  const pipelinePromise = pipeline(source, gzip, destination);
  pipelinePromise.catch(() => undefined);

  const write = async (text) => {
    if (!source.write(text)) {
      await Promise.race([once(source, 'drain'), pipelinePromise]);
    }
  };

  try {
    await connection.query("SET SESSION time_zone = '+00:00'");
    await connection.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('SET TRANSACTION READ ONLY');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');

    const [tableRows] = await connection.query('SHOW FULL TABLES');
    const objects = tableRows
      .map((row) => {
        const [nameKey, typeKey] = Object.keys(row);
        return { name: row[nameKey], type: row[typeKey] };
      })
      .sort((left, right) => left.name.localeCompare(right.name));

    const unsupportedObjects = objects.filter((item) => item.type !== 'BASE TABLE');
    const [triggerRows] = await connection.query('SHOW TRIGGERS');
    const [routineRows] = await connection.query(
      'SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?',
      [database],
    );
    const [eventRows] = await connection.query(
      'SELECT EVENT_NAME FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ?',
      [database],
    );
    if (
      unsupportedObjects.length > 0 ||
      triggerRows.length > 0 ||
      routineRows.length > 0 ||
      eventRows.length > 0
    ) {
      throw new Error('Backup stopped: views, triggers, routines, and events are not supported.');
    }

    const [databaseRows] = await connection.query(`SHOW CREATE DATABASE ${identifier(database)}`);
    const createDatabase = databaseRows[0]['Create Database'].replace(
      /^CREATE DATABASE/i,
      'CREATE DATABASE IF NOT EXISTS',
    );

    await write('-- JSHSUS database backup\n');
    await write('-- Restore only into a new, empty database instance.\n');
    await write(`-- Created at ${new Date().toISOString()}\n\n`);
    await write('SET @JSHSUS_OLD_SQL_MODE=@@SESSION.SQL_MODE;\n');
    await write('SET @JSHSUS_OLD_TIME_ZONE=@@SESSION.TIME_ZONE;\n');
    await write("SET SESSION SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\n");
    await write("SET SESSION TIME_ZONE='+00:00';\n");
    await write('SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n');
    await write(`${createDatabase};\nUSE ${identifier(database)};\n\n`);

    for (const object of objects) {
      const table = identifier(object.name);
      const [createRows] = await connection.query(`SHOW CREATE TABLE ${table}`);
      const [columnRows] = await connection.query(`SHOW COLUMNS FROM ${table}`);
      const columns = columnRows.map((row) => row.Field);
      await write(`DROP TABLE IF EXISTS ${table};\n${createRows[0]['Create Table']};\n`);

      const rowStream = rawConnection.query(`SELECT * FROM ${table}`).stream({ highWaterMark: 32 });
      let batch = [];
      let batchBytes = 0;

      const flush = async () => {
        if (batch.length === 0) return;
        await write(
          `INSERT INTO ${table} (${columns.map(identifier).join(',')}) VALUES\n${batch.join(',\n')};\n`,
        );
        batch = [];
        batchBytes = 0;
      };

      for await (const row of rowStream) {
        const value = `(${columns
          .map((column) => (row[column] === undefined ? 'NULL' : escape(row[column])))
          .join(',')})`;
        if (batch.length >= 250 || (batch.length > 0 && batchBytes + value.length > 1024 * 1024)) {
          await flush();
        }
        batch.push(value);
        batchBytes += value.length;
      }
      await flush();
      await write('\n');
    }

    await write('SET FOREIGN_KEY_CHECKS=1;\n');
    await write('SET SESSION TIME_ZONE=@JSHSUS_OLD_TIME_ZONE;\n');
    await write('SET SESSION SQL_MODE=@JSHSUS_OLD_SQL_MODE;\n');
    await connection.commit();
    source.end();
    await pipelinePromise;
    await rename(temporaryPath, finalPath);
    renamed = true;
    await chmod(finalPath, 0o600);
    const digest = await sha256(finalPath);
    await writeFile(`${finalPath}.sha256`, `${digest}  ${baseName}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    await rotateBackups();
    console.log(`Database backup created: ${baseName}`);
  } catch (error) {
    source.destroy(error);
    await pipelinePromise.catch(() => undefined);
    await connection.rollback().catch(() => undefined);
    await rm(temporaryPath, { force: true });
    if (renamed) {
      await rm(finalPath, { force: true });
      await rm(`${finalPath}.sha256`, { force: true });
    }
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
