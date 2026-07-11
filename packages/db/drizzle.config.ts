import { defineConfig } from 'drizzle-kit';
import { readFileSync } from 'node:fs';

const sslMode = process.env.DATABASE_SSL_MODE ?? 'disabled';
const databaseUrl =
  process.env.DATABASE_URL ?? 'mysql://jshsus:local_password@localhost:3306/jshsus';
const parsedUrl = new URL(databaseUrl);
const ssl =
  sslMode === 'disabled'
    ? undefined
    : sslMode === 'required'
      ? { rejectUnauthorized: false }
      : {
          rejectUnauthorized: true,
          ca: readFileSync(process.env.DATABASE_SSL_CA_PATH ?? '', 'utf8'),
        };
const dbCredentials = ssl
  ? {
      host: parsedUrl.hostname,
      port: Number(parsedUrl.port || 3306),
      user: decodeURIComponent(parsedUrl.username),
      password: decodeURIComponent(parsedUrl.password),
      database: parsedUrl.pathname.replace(/^\//, ''),
      ssl,
    }
  : { url: databaseUrl };

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'mysql',
  dbCredentials,
  strict: true,
  verbose: true,
});
