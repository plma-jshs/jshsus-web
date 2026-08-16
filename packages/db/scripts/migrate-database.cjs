#!/usr/bin/env node
const path = require('node:path');
const mysql = require('mysql2/promise');
const { drizzle } = require('drizzle-orm/mysql2');
const { migrate } = require('drizzle-orm/mysql2/migrator');
const { seedConnectionOptions } = require('./seed-connection.cjs');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

async function main() {
  const connection = await mysql.createConnection(seedConnectionOptions(databaseUrl));

  try {
    const database = drizzle(connection);
    await migrate(database, {
      migrationsFolder: path.resolve(__dirname, '../migrations'),
    });
    console.log('Database migrations applied successfully.');
  } catch (error) {
    console.error('Database migration failed with the following error:');
    console.error(error);
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch(() => {
  process.exitCode = 1;
});
