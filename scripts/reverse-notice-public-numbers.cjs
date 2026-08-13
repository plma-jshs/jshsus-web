#!/usr/bin/env node

/**
 * Reverse the public numbers for the explicitly requested notice range.
 *
 * Dry-run is the default. Use --apply only after checking the printed mapping.
 * The temporary offset avoids the unique public_no index while the swap runs.
 */

const mysql = require('../apps/api/node_modules/mysql2/promise');
const dotenv = require('../apps/api/node_modules/dotenv');
const path = require('node:path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const DATABASE_URL = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const FIRST_NUMBER = 169;
const LAST_NUMBER = 174;
const OFFSET = 1_000_000;

async function main() {
  if (!DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required.');
  const db = await mysql.createConnection(DATABASE_URL);

  try {
    const [rows] = await db.execute(
      `SELECT id, public_no, title, published_at
       FROM notices
       WHERE public_no BETWEEN ? AND ?
       ORDER BY published_at DESC, id DESC`,
      [FIRST_NUMBER, LAST_NUMBER],
    );
    const mapping = rows.map((row) => ({
      id: Number(row.id),
      from: Number(row.public_no),
      to: LAST_NUMBER - rows.indexOf(row),
      title: row.title,
    }));
    const needsChange = mapping.some((item) => item.from !== item.to);
    console.log(
      JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', needsChange, mapping }, null, 2),
    );

    if (!APPLY || !needsChange) return;
    if (mapping.length !== LAST_NUMBER - FIRST_NUMBER + 1) {
      throw new Error(
        `Expected six notices in ${FIRST_NUMBER}-${LAST_NUMBER}; found ${mapping.length}.`,
      );
    }

    await db.beginTransaction();
    try {
      await db.execute(
        `UPDATE notices SET public_no = public_no + ? WHERE public_no BETWEEN ? AND ?`,
        [OFFSET, FIRST_NUMBER, LAST_NUMBER],
      );
      for (const item of mapping) {
        await db.execute(`UPDATE notices SET public_no = ? WHERE id = ?`, [item.to, item.id]);
      }
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
