#!/usr/bin/env node
const mysql = require('../packages/db/node_modules/mysql2/promise');
require('../node_modules/.pnpm/dotenv@16.4.5/node_modules/dotenv').config({ path: '.env' });

const databaseUrl = process.env.OPERATIONAL_SCHEMA_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Set DATABASE_URL or OPERATIONAL_SCHEMA_DATABASE_URL before running the check.');
}
const url = new URL(databaseUrl);

async function main() {
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectTimeout: 10_000,
  });

  try {
    const [identity] = await connection.query(
      'SELECT DATABASE() AS database_name, CURRENT_USER() AS current_user_name',
    );
    const [tables] = await connection.query(
      'SELECT TABLE_NAME AS table_name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()',
    );
    const tableNames = new Set(tables.map((row) => row.table_name));
    const candidates = [
      'legacy_activity_requests',
      'legacy_activity_archives',
      'reactions',
      'auth_accounts',
      'users',
    ];
    const counts = {};

    for (const table of candidates) {
      if (!tableNames.has(table)) {
        counts[table] = { exists: false };
        continue;
      }
      const [countRows] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
      let timestamps = {};
      try {
        const [timestampRows] = await connection.query(
          `SELECT MAX(updated_at) AS max_updated_at, MAX(created_at) AS max_created_at FROM \`${table}\``,
        );
        timestamps = timestampRows[0] ?? {};
      } catch {
        // Some compatibility tables do not have the common timestamp columns.
      }
      counts[table] = {
        exists: true,
        count: Number(countRows[0].count),
        ...timestamps,
      };
    }

    if (tableNames.has('legacy_activity_requests') && tableNames.has('legacy_activity_archives')) {
      const [unmatchedRows] = await connection.query(
        `SELECT COUNT(*) AS count
           FROM legacy_activity_requests AS requests
           LEFT JOIN legacy_activity_archives AS archives
             ON archives.source_id = requests.source_id
          WHERE archives.id IS NULL`,
      );
      counts.legacy_activity_requests.unmatched_archive_rows = Number(unmatchedRows[0].count);
    }

    const [foreignKeys] = await connection.query(
      `SELECT TABLE_NAME AS table_name,
              COLUMN_NAME AS column_name,
              REFERENCED_TABLE_NAME AS referenced_table,
              REFERENCED_COLUMN_NAME AS referenced_column
         FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND REFERENCED_TABLE_NAME IN ('legacy_activity_requests', 'legacy_activity_archives', 'reactions')
        ORDER BY TABLE_NAME, COLUMN_NAME`,
    );

    console.log(JSON.stringify({ identity, counts, foreignKeys }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
