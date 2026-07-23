#!/usr/bin/env node
const { readdirSync, readFileSync } = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

const MIGRATIONS_TABLE = '__drizzle_migrations';

const databaseUrl = process.env.DATABASE_URL;
const sslMode = process.env.DATABASE_SSL_MODE ?? 'required';
const allowBaselineReset = process.env.RESET_DATABASE_ON_BASELINE_MISMATCH === 'true';

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
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

function readMigrationTimeline() {
  const migrationDir = path.resolve(__dirname, '..', 'migrations');
  const sqlFiles = readdirSync(migrationDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const journal = JSON.parse(
    readFileSync(path.join(migrationDir, 'meta', '_journal.json'), 'utf8'),
  );

  const entries = journal.entries.map((entry, index) => {
    if (entry.idx !== index || !Number.isSafeInteger(entry.when)) {
      throw new Error(`Invalid migration journal entry at index ${index}.`);
    }
    return { tag: entry.tag, when: Number(entry.when), file: `${entry.tag}.sql` };
  });

  if (JSON.stringify(entries.map((entry) => entry.file)) !== JSON.stringify(sqlFiles)) {
    throw new Error('Migration SQL files and meta/_journal.json are out of sync.');
  }

  return entries;
}

function isSquashedBaseline(timeline) {
  return timeline.length === 1 && timeline[0]?.tag === '0000_baseline';
}

async function currentDatabaseObjects(connection, database) {
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

async function currentMigrationTimeline(connection, database) {
  const [tableRows] = await connection.query(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
    `,
    [database, MIGRATIONS_TABLE],
  );
  if (Number(tableRows[0]?.count ?? 0) === 0) return [];

  const [rows] = await connection.query(
    `SELECT created_at AS createdAt FROM ${identifier(MIGRATIONS_TABLE)} ORDER BY created_at ASC, id ASC`,
  );
  return rows.map((row) => Number(row.createdAt));
}

function timelinesMatch(databaseTimeline, migrationTimeline) {
  const expected = migrationTimeline.map((entry) => entry.when);
  return (
    databaseTimeline.length === expected.length &&
    databaseTimeline.every((value, index) => value === expected[index])
  );
}

async function dropDatabaseObjects(connection, objects) {
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
}

async function main() {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database || !/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error('DATABASE_URL must contain a safe database name.');
  }

  const migrationTimeline = readMigrationTimeline();
  if (!isSquashedBaseline(migrationTimeline)) {
    console.log('Baseline compatibility check skipped: migrations are not squashed.');
    return;
  }

  const connection = await mysql.createConnection({
    uri: databaseUrl,
    ssl: tlsOptions(),
    timezone: 'Z',
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  try {
    const objects = await currentDatabaseObjects(connection, database);
    if (objects.length === 0) {
      console.log('Baseline compatibility check passed: database is empty.');
      return;
    }

    const databaseTimeline = await currentMigrationTimeline(connection, database);
    if (timelinesMatch(databaseTimeline, migrationTimeline)) {
      console.log('Baseline compatibility check passed: database migration journal is current.');
      return;
    }

    const message =
      `Existing database does not match the current squashed migration baseline. ` +
      `database=${database}, objects=${objects.length}, ` +
      `databaseTimeline=[${databaseTimeline.join(', ')}], ` +
      `expectedTimeline=[${migrationTimeline.map((entry) => entry.when).join(', ')}].`;

    if (!allowBaselineReset) {
      throw new Error(
        `${message} Set RESET_DATABASE_ON_BASELINE_MISMATCH=true after confirming a backup to reset this development database before migration.`,
      );
    }

    console.log(`${message} Resetting database objects before baseline migration.`);
    await dropDatabaseObjects(connection, objects);
    console.log(`Baseline database reset completed: dropped ${objects.length} objects.`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
