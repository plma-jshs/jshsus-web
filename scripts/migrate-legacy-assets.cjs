#!/usr/bin/env node

/**
 * Move legacy inline assets into the API's S3-backed file store.
 *
 * The command is deliberately dry-run by default.  A production run must be
 * explicit: `node scripts/migrate-legacy-assets.cjs --apply`.
 *
 * The source database URL is read from MIGRATION_DATABASE_URL first so the
 * migration can use a short-lived privileged connection without changing the
 * application's runtime credentials.  No credentials are stored in this
 * script or in the repository.
 */

const { createHash } = require('node:crypto');
const { extname, basename } = require('node:path');
const { URL } = require('node:url');

const mysql = require('../apps/api/node_modules/mysql2/promise');
const dotenv = require('../apps/api/node_modules/dotenv');
const {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require('../apps/api/node_modules/@aws-sdk/client-s3');

dotenv.config({ path: require('node:path').resolve(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const DATABASE_URL = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const BUCKET = process.env.S3_BUCKET;
const MAX_BYTES = 50 * 1024 * 1024;

const FULL_URL_PATTERN = /https?:\/\/[^\s"'<>\\]+/g;
const RELATIVE_ASSET_PATTERN = /\/contents\/[^\s"'<>\\]+/g;
const BINARY_MIME_PATTERN =
  /^(?:image\/|audio\/|video\/|application\/(?:pdf|zip|msword|vnd\.|octet-stream))/i;

const SOURCE_QUERIES = [
  {
    table: 'notices',
    column: 'content',
    targetType: 'notice',
    sql: `
      SELECT id, content AS value, visibility, published_at
      FROM notices
      WHERE content REGEXP 'https?://|/contents/'
    `,
    visibility: (row) =>
      row.visibility === 'public' && row.published_at <= new Date() ? 'public' : 'private',
  },
  {
    table: 'posts',
    column: 'content',
    targetType: 'post',
    sql: `
      SELECT p.id, p.content AS value,
        p.post_status, p.is_hidden, b.visibility AS board_visibility
      FROM posts p
      INNER JOIN boards b ON b.id = p.board_id
      WHERE p.content REGEXP 'https?://|/contents/'
    `,
    visibility: (row) =>
      row.post_status === 'published' && !row.is_hidden && row.board_visibility === 'public'
        ? 'public'
        : 'private',
  },
  {
    table: 'posts',
    column: 'content_json',
    targetType: 'post',
    sql: `
      SELECT p.id, CAST(p.content_json AS CHAR) AS value,
        p.post_status, p.is_hidden, b.visibility AS board_visibility
      FROM posts p
      INNER JOIN boards b ON b.id = p.board_id
      WHERE p.content_json IS NOT NULL
        AND CAST(p.content_json AS CHAR) REGEXP 'https?://|/contents/'
    `,
    visibility: (row) =>
      row.post_status === 'published' && !row.is_hidden && row.board_visibility === 'public'
        ? 'public'
        : 'private',
  },
];

function assertConfiguration() {
  if (!DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required.');
  if (!BUCKET) throw new Error('S3_BUCKET is required.');
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required.');
  }
}

function quoteIdentifier(value) {
  return `\`${String(value).replaceAll('`', '``')}\``;
}

function trimUrlPunctuation(value) {
  return value.replace(/[),.;:!?]+$/g, '');
}

function extractReferences(value) {
  const source = String(value);
  const fullMatches = source.match(FULL_URL_PATTERN) ?? [];
  const relativeMatches = (source.match(RELATIVE_ASSET_PATTERN) ?? []).filter(
    (relative) => !fullMatches.some((full) => full.includes(relative)),
  );
  const matches = [...fullMatches, ...relativeMatches];
  const unique = new Map();

  for (const raw of matches) {
    const trimmed = trimUrlPunctuation(raw);
    if (!trimmed) continue;
    const sourceUrl = trimmed.startsWith('/') ? `https://jshsus.kr${trimmed}` : trimmed;
    try {
      const parsed = new URL(sourceUrl);
      const path = parsed.pathname.toLowerCase();
      const isLegacyPath =
        (parsed.hostname === 'jshsus.kr' || parsed.hostname.endsWith('.jshsus.kr')) &&
        path.startsWith('/contents/');
      const hasFileExtension = /\.(?:png|jpe?g|gif|webp|svg|pdf|docx?|xlsx?|pptx?|hwp|zip)$/i.test(
        path,
      );
      if (!isLegacyPath && !hasFileExtension) continue;
      unique.set(`${raw}\u0000${sourceUrl}`, { raw, sourceUrl });
    } catch {
      // Ignore malformed links. They are ordinary text from the legacy editor.
    }
  }

  return [...unique.values()];
}

function fileNameFor(url, mimeType, hash) {
  let name;
  try {
    name = decodeURIComponent(basename(new URL(url).pathname));
  } catch {
    name = '';
  }

  name = (name || `legacy-${hash.slice(0, 16)}`).replace(/[^\p{L}\p{N}._-]+/gu, '_');
  if (name.length > 180) name = name.slice(-180);

  if (!extname(name)) {
    const extension =
      {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/svg+xml': '.svg',
        'application/pdf': '.pdf',
      }[mimeType] ?? '';
    name += extension;
  }

  return name.slice(0, 255);
}

async function downloadAsset(sourceUrl) {
  const response = await fetch(sourceUrl, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${sourceUrl}`);
  }

  const mimeType = (response.headers.get('content-type') ?? 'application/octet-stream')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.length === 0) throw new Error(`Empty response for ${sourceUrl}`);
  if (bytes.length > MAX_BYTES) throw new Error(`Asset exceeds 50 MB: ${sourceUrl}`);
  if (!BINARY_MIME_PATTERN.test(mimeType)) {
    return { skipped: true, reason: `non-binary content type: ${mimeType}` };
  }

  const hash = createHash('sha256').update(bytes).digest('hex');
  const originalName = fileNameFor(sourceUrl, mimeType, hash);
  return {
    bytes,
    hash,
    mimeType,
    originalName,
    objectKey: `legacy/${hash}/${originalName}`,
  };
}

async function objectExists(s3, objectKey) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: objectKey }));
    return true;
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchKey') return false;
    throw error;
  }
}

async function ensureObject(s3, asset) {
  if (await objectExists(s3, asset.objectKey)) return false;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: asset.objectKey,
      Body: asset.bytes,
      ContentType: asset.mimeType,
    }),
  );
  return true;
}

async function ensureFile(db, input) {
  const [existing] = await db.execute(
    `SELECT id FROM files WHERE target_type = ? AND target_id = ? AND object_key = ? LIMIT 1`,
    [input.targetType, input.targetId, input.objectKey],
  );
  if (existing.length > 0) return Number(existing[0].id);

  const [result] = await db.execute(
    `INSERT INTO files
      (owner_id, target_type, target_id, original_name, object_key, mime_type, size_bytes, file_visibility)
     VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.targetType,
      input.targetId,
      input.originalName,
      input.objectKey,
      input.mimeType,
      input.sizeBytes,
      input.visibility,
    ],
  );
  return Number(result.insertId);
}

async function collectRows(db) {
  const rows = [];
  for (const source of SOURCE_QUERIES) {
    const [sourceRows] = await db.query(source.sql);
    for (const row of sourceRows) {
      const value = String(row.value ?? '');
      const references = extractReferences(value);
      if (references.length === 0) continue;
      rows.push({
        ...source,
        id: Number(row.id),
        value,
        references,
        visibility: source.visibility(row),
      });
    }
  }
  return rows;
}

async function migrateRow(db, s3, row, assetsByUrl) {
  const replacements = new Map();
  const failures = [];
  let uploadedObjects = 0;
  let createdFiles = 0;

  for (const reference of row.references) {
    let downloaded = assetsByUrl.get(reference.sourceUrl);
    if (!downloaded) {
      try {
        downloaded = await downloadAsset(reference.sourceUrl);
      } catch (error) {
        failures.push({ url: reference.sourceUrl, reason: error.message });
        continue;
      }
      assetsByUrl.set(reference.sourceUrl, downloaded);
    }

    if (downloaded.skipped) {
      console.log(`skip ${reference.sourceUrl}: ${downloaded.reason}`);
      continue;
    }

    if (!APPLY) {
      replacements.set(reference.sourceUrl, '[S3 file pending]');
      continue;
    }

    if (await ensureObject(s3, downloaded)) uploadedObjects += 1;
    const fileId = await ensureFile(db, {
      targetType: row.targetType,
      targetId: row.id,
      originalName: downloaded.originalName,
      objectKey: downloaded.objectKey,
      mimeType: downloaded.mimeType,
      sizeBytes: downloaded.bytes.length,
      visibility: row.visibility,
    });
    createdFiles += 1;
    replacements.set(reference.sourceUrl, `/api/files/${fileId}/content`);
  }

  if (APPLY && replacements.size > 0) {
    let nextValue = row.value;
    for (const reference of row.references) {
      const replacement = replacements.get(reference.sourceUrl);
      if (!replacement) continue;
      nextValue = nextValue.split(reference.raw).join(replacement);
    }
    if (nextValue !== row.value) {
      const [result] = await db.execute(
        `UPDATE ${quoteIdentifier(row.table)} SET ${quoteIdentifier(row.column)} = ? WHERE ${quoteIdentifier(row.whereColumn ?? 'id')} = ? AND ${quoteIdentifier(row.column)} = ?`,
        [nextValue, row.id, row.value],
      );
      if (result.affectedRows !== 1) {
        failures.push({ reason: `source row changed during migration: ${row.table}#${row.id}` });
      }
    }
  }

  return { uploadedObjects, createdFiles, failures, migrated: replacements.size };
}

async function main() {
  assertConfiguration();
  const db = await mysql.createConnection(DATABASE_URL);
  const s3 = new S3Client({
    region: process.env.AWS_REGION,
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  try {
    const rows = await collectRows(db);
    const totalReferences = rows.reduce((sum, row) => sum + row.references.length, 0);
    console.log(`${APPLY ? 'Applying' : 'Dry-run'} legacy asset migration`);
    console.log(
      `Source rows: ${rows.length}; asset references: ${totalReferences}; bucket: ${BUCKET}`,
    );

    const assetsByUrl = new Map();
    let migrated = 0;
    let uploadedObjects = 0;
    let createdFiles = 0;
    const failures = [];

    for (const row of rows) {
      const result = await migrateRow(db, s3, row, assetsByUrl);
      migrated += result.migrated;
      uploadedObjects += result.uploadedObjects;
      createdFiles += result.createdFiles;
      failures.push(
        ...result.failures.map((failure) => ({
          ...failure,
          source: `${row.table}.${row.column}#${row.id}`,
        })),
      );
      console.log(
        `${row.table}.${row.column}#${row.id}: ${result.migrated}/${row.references.length} asset(s)`,
      );
    }

    console.log(
      JSON.stringify(
        {
          mode: APPLY ? 'apply' : 'dry-run',
          sourceRows: rows.length,
          assetReferences: totalReferences,
          migrated,
          uploadedObjects,
          createdFiles,
          failures,
        },
        null,
        2,
      ),
    );

    if (failures.length > 0) process.exitCode = 2;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
