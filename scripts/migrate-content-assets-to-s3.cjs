#!/usr/bin/env node

/**
 * Restore legacy article bodies/media and normalize article assets in S3.
 * Dry-run is the default; pass --apply for a production change.
 */

const { createHash } = require('node:crypto');
const { basename, extname, resolve } = require('node:path');
const { readFileSync } = require('node:fs');

const mysql = require('../apps/api/node_modules/mysql2/promise');
const dotenv = require('../apps/api/node_modules/dotenv');
const {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require('../apps/api/node_modules/@aws-sdk/client-s3');

dotenv.config({ path: resolve(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const DATABASE_URL = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION || 'ap-northeast-2';
const COOKIE = process.env.LEGACY_COOKIE_HEADER || '';
const MAX_BYTES = 50 * 1024 * 1024;
const RICH_PREFIX = 'jshsus-rich-text:v1\n';
const NOTICE_BASE = 'https://jshsus.kr/contents/council/';
const BOARD_BASE = 'https://jshsus.kr/contents/school/';
const API_FILE_RE = /\/api\/files\/(\d+)\/(?:content|download)/g;
const URL_RE = /https?:\/\/[^\s"'<>\\]+/g;
const RELATIVE_RE = /\/contents\/[^\s"'<>\\]+/g;
const EXT_RE = /\.(?:png|jpe?g|gif|webp|svg|pdf|docx?|xlsx?|pptx?|hwp|zip|txt|csv)$/i;

function config() {
  if (!DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required.');
  if (!BUCKET) throw new Error('S3_BUCKET is required.');
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required.');
  }
}

function clean(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decode(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function attrs(tag) {
  const result = {};
  for (const match of String(tag ?? '').matchAll(
    /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(["'])(.*?)\2/g,
  ))
    result[match[1].toLowerCase()] = match[3];
  return result;
}

function resolveUrl(value, base) {
  try {
    return new URL(decode(value), base).toString();
  } catch {
    return decode(value);
  }
}

function lines(segment) {
  return decode(String(segment ?? ''))
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '')
    .split(/\n+/)
    .map(clean)
    .filter(Boolean);
}

function paragraph(text) {
  const value = clean(text);
  return value
    ? { type: 'paragraph', content: [{ type: 'text', text: value }] }
    : { type: 'paragraph' };
}

function htmlToDoc(html, base) {
  const content = [];
  const imageRe = /<img\b[^>]*>/gi;
  let cursor = 0;
  let match;
  while ((match = imageRe.exec(String(html ?? '')))) {
    for (const line of lines(html.slice(cursor, match.index))) content.push(paragraph(line));
    const source = resolveUrl(attrs(match[0]).src, base);
    if (source) content.push({ type: 'image', attrs: { src: source, alt: '' } });
    cursor = imageRe.lastIndex;
  }
  for (const line of lines(String(html ?? '').slice(cursor))) content.push(paragraph(line));
  return { type: 'doc', content: content.length ? content : [paragraph('')] };
}

function plainText(doc) {
  const parts = [];
  const visit = (node) => {
    if (node?.type === 'text') parts.push(node.text || '');
    if (node?.type === 'image') parts.push(node.attrs?.alt || '[image]');
    for (const child of node?.content ?? []) visit(child);
    if (['paragraph', 'heading', 'listItem', 'blockquote'].includes(node?.type)) parts.push('\n');
  };
  for (const node of doc?.content ?? []) visit(node);
  return parts
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const child of node.content ?? []) walk(child, visitor);
}

function imageSources(doc) {
  const result = [];
  walk(doc, (node) => {
    if (node.type === 'image' && typeof node.attrs?.src === 'string') result.push(node.attrs.src);
  });
  return result;
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    const result = JSON.parse(String(value));
    return result && typeof result === 'object' ? result : null;
  } catch {
    return null;
  }
}

function noticeDoc(value) {
  const raw = String(value ?? '');
  if (!raw.startsWith(RICH_PREFIX)) return null;
  try {
    const result = JSON.parse(raw.slice(RICH_PREFIX.length));
    return result?.contentDoc?.type === 'doc' ? result.contentDoc : null;
  } catch {
    return null;
  }
}

function serializeNotice(doc) {
  return `${RICH_PREFIX}${JSON.stringify({ contentDoc: doc, plainText: plainText(doc) })}`;
}

function binaryUrl(value) {
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();
    if (path.endsWith('.php') || path.includes('/readdocument')) return false;
    return EXT_RE.test(path) || /\/(?:images?|uploads?|attachments?)\//i.test(path);
  } catch {
    return false;
  }
}

function htmlAssets(html, base) {
  const result = new Set();
  for (const match of String(html ?? '').matchAll(
    /<(?:img|source)\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi,
  )) {
    const url = resolveUrl(match[2], base);
    if (url) result.add(url);
  }
  for (const match of String(html ?? '').matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi)) {
    const url = resolveUrl(match[2], base);
    if (url && binaryUrl(url)) result.add(url);
  }
  return [...result];
}

function textAssets(value) {
  const source = String(value ?? '');
  const matches = [...(source.match(URL_RE) ?? []), ...(source.match(RELATIVE_RE) ?? [])];
  const result = new Set();
  for (const rawMatch of matches) {
    const raw = rawMatch.replace(/[),.;:!?]+$/g, '');
    const url = raw.startsWith('/') ? `https://jshsus.kr${raw}` : raw;
    if (binaryUrl(url)) result.add(url);
  }
  return [...result];
}

function extractApiIds(value) {
  const result = new Set();
  for (const match of String(value ?? '').matchAll(API_FILE_RE)) result.add(Number(match[1]));
  return [...result];
}

function sourceName(url, mime, hash) {
  let name = '';
  try {
    name = decodeURIComponent(basename(new URL(url).pathname));
  } catch {
    // deterministic fallback below
  }
  name = (name || `asset-${hash.slice(0, 16)}`).replace(/[^\p{L}\p{N}._-]+/gu, '_');
  if (!extname(name)) {
    name +=
      { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' }[
        mime
      ] || '';
  }
  return name.slice(-255);
}

function datePart(value) {
  const match = String(value ?? '').match(/(\d{4})[-/.](\d{2})[-/.](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : new Date().toISOString().slice(0, 10);
}

function objectKey(type, date, hash, name) {
  const safeType = String(type || 'post').replace(/[^a-z0-9_-]/gi, '_');
  return `${safeType}/${datePart(date)}/${hash}${extname(name).toLowerCase()}`;
}

function publicBase() {
  const configured = String(process.env.S3_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
  return (
    configured || (process.env.S3_ENDPOINT ? '' : `https://s3.${REGION}.amazonaws.com/${BUCKET}`)
  );
}

function publicUrl(key) {
  const base = publicBase();
  return base ? `${base}/${key.split('/').map(encodeURIComponent).join('/')}` : '';
}

function apiUrl(id) {
  return `/api/files/${Number(id)}/content`;
}

function fileUrl(file) {
  const key = file.objectKey ?? file.object_key;
  return file.visibility === 'public' ? publicUrl(key) : apiUrl(file.id);
}

function parseNotice(html, url) {
  const body =
    html.match(
      /<div class=["']main-text["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<hr class=["']mid-hr["']/i,
    )?.[1] ?? '';
  const doc = htmlToDoc(body, url);
  return { doc, assets: htmlAssets(body, url) };
}

function parsePost(html, url) {
  const titleMatch = html.match(/<h2 class=["']read-board-title["'][^>]*>[\s\S]*?<\/h2>/i);
  const start = titleMatch ? titleMatch.index + titleMatch[0].length : 0;
  const end = html.indexOf('<div class="board-dis-line">', start);
  const body = end > start ? html.slice(start, end) : '';
  const doc = htmlToDoc(body, url);
  return { doc, assets: htmlAssets(body, url) };
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.text();
}

async function fetchAsset(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  const mime = (response.headers.get('content-type') || 'application/octet-stream')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error(`empty response: ${url}`);
  if (bytes.length > MAX_BYTES) throw new Error(`asset exceeds 50 MB: ${url}`);
  if (
    !/^(?:image\/|audio\/|video\/|application\/(?:pdf|zip|msword|vnd\.|octet-stream))/i.test(mime)
  ) {
    return { skipped: true, reason: `non-binary content type: ${mime}` };
  }
  const hash = createHash('sha256').update(bytes).digest('hex');
  const name = sourceName(url, mime, hash);
  return { bytes, mime, hash, name };
}

async function exists(s3, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchKey') return false;
    throw error;
  }
}

async function put(s3, key, asset) {
  if (!APPLY || (await exists(s3, key))) return;
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: asset.bytes, ContentType: asset.mime }),
  );
}

function copySource(key) {
  return `${encodeURIComponent(BUCKET)}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

async function normalizeFiles(db, s3) {
  const [rows] = await db.query(
    `SELECT id, target_type, original_name, object_key, mime_type, uploaded_at
       FROM files WHERE object_key LIKE 'legacy/%'`,
  );
  for (const row of rows) {
    const parts = String(row.object_key).split('/');
    const hash = /^[a-f\d]{64}$/i.test(parts[1])
      ? parts[1]
      : createHash('sha256').update(String(row.object_key)).digest('hex');
    const next = objectKey(row.target_type || 'post', row.uploaded_at, hash, row.original_name);
    if (next === row.object_key) continue;
    if (APPLY) {
      if (!(await exists(s3, next))) {
        await s3.send(
          new CopyObjectCommand({
            Bucket: BUCKET,
            Key: next,
            CopySource: copySource(row.object_key),
            ContentType: row.mime_type,
            MetadataDirective: 'REPLACE',
          }),
        );
      }
      await db.execute('UPDATE files SET object_key = ?, updated_at = now(3) WHERE id = ?', [
        next,
        row.id,
      ]);
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: row.object_key }));
    }
    console.log(
      `${APPLY ? 'normalized' : 'would normalize'} file#${row.id}: ${row.object_key} -> ${next}`,
    );
  }
  return rows.length;
}

async function loadFiles(db) {
  const [rows] = await db.query(
    `SELECT id, target_type, target_id, original_name, object_key, mime_type,
            size_bytes, file_visibility AS visibility
       FROM files`,
  );
  return new Map(
    rows.map((row) => [
      Number(row.id),
      { ...row, id: Number(row.id), targetId: Number(row.target_id) },
    ]),
  );
}

async function ensureFile(db, target, asset) {
  const key = objectKey(target.type, target.date, asset.hash, asset.name);
  const [existing] = await db.execute(
    `SELECT id, target_type, target_id, original_name, object_key, mime_type,
            size_bytes, file_visibility AS visibility
       FROM files WHERE target_type = ? AND target_id = ? AND object_key = ? LIMIT 1`,
    [target.type, target.id, key],
  );
  if (existing[0]) return { ...existing[0], id: Number(existing[0].id) };
  if (!APPLY)
    return {
      id: null,
      target_type: target.type,
      target_id: target.id,
      original_name: asset.name,
      object_key: key,
      mime_type: asset.mime,
      size_bytes: asset.bytes.length,
      visibility: target.visibility,
    };
  const [result] = await db.execute(
    `INSERT INTO files
      (owner_id, target_type, target_id, original_name, object_key, mime_type, size_bytes, file_visibility)
     VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)`,
    [target.type, target.id, asset.name, key, asset.mime, asset.bytes.length, target.visibility],
  );
  return {
    id: Number(result.insertId),
    target_type: target.type,
    target_id: target.id,
    original_name: asset.name,
    object_key: key,
    mime_type: asset.mime,
    size_bytes: asset.bytes.length,
    visibility: target.visibility,
  };
}

async function migrateAsset(db, s3, target, url, cache, failures) {
  if (publicBase() && url.startsWith(`${publicBase()}/`)) return url;
  let asset = cache.get(url);
  if (!asset) {
    try {
      asset = await fetchAsset(url);
    } catch (error) {
      failures.push({ target: `${target.type}#${target.id}`, url, reason: error.message });
      return url;
    }
    cache.set(url, asset);
  }
  if (asset.skipped) return url;
  const file = await ensureFile(db, target, asset);
  await put(s3, file.object_key, asset);
  return APPLY ? fileUrl(file) : `[S3 pending: ${file.object_key}]`;
}

async function migrateDoc(db, s3, target, doc, files, cache, failures) {
  if (!doc) return { doc, changed: false };
  const next = structuredClone(doc);
  let changed = false;
  const visit = async (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'image' && typeof node.attrs?.src === 'string') {
      const source = node.attrs.src;
      const apiMatch = source.match(/^\/api\/files\/(\d+)\/(?:content|download)$/);
      if (apiMatch) {
        const file = files.get(Number(apiMatch[1]));
        if (file) {
          const replacement = fileUrl(file);
          if (replacement && replacement !== source) {
            node.attrs.src = replacement;
            changed = true;
          }
        }
      } else if (!source.startsWith(`${publicBase()}/`)) {
        const replacement = await migrateAsset(db, s3, target, source, cache, failures);
        if (replacement !== source) {
          node.attrs.src = replacement;
          changed = true;
        }
      }
    }
    for (const child of node.content ?? []) await visit(child);
  };
  await visit(next);
  return { doc: next, changed };
}

async function migrateText(db, s3, target, value, files, cache, failures) {
  let next = String(value ?? '');
  let changed = false;
  for (const id of extractApiIds(next)) {
    const file = files.get(id);
    if (!file) continue;
    const replacement = fileUrl(file);
    next = next.replace(new RegExp(`/api/files/${id}/(?:content|download)`, 'g'), replacement);
    changed = true;
  }
  for (const url of textAssets(next)) {
    if (publicBase() && url.startsWith(`${publicBase()}/`)) continue;
    const replacement = await migrateAsset(db, s3, target, url, cache, failures);
    if (replacement !== url) {
      next = next.split(url).join(replacement);
      changed = true;
    }
  }
  return { value: next, changed };
}

function targetForNotice(row) {
  return {
    type: 'notice',
    id: Number(row.id),
    date: row.published_at || row.created_at,
    visibility: row.visibility === 'public' ? 'public' : 'private',
  };
}

function targetForPost(row) {
  return {
    type: 'post',
    id: Number(row.id),
    date: row.created_at,
    visibility:
      row.post_status === 'published' && !row.is_hidden && row.board_visibility === 'public'
        ? 'public'
        : 'private',
  };
}

function match(rows, entry) {
  return (
    rows.find(
      (row) => Number(row.public_no) === Number(entry.publicNo) && row.title === entry.title,
    ) ||
    rows.find((row) => row.title === entry.title) ||
    null
  );
}

async function main() {
  config();
  const db = await mysql.createConnection(DATABASE_URL);
  const s3 = new S3Client({
    region: REGION,
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  const failures = [];
  const cache = new Map();
  try {
    const [notices] = await db.query(
      'SELECT id, public_no, title, content, visibility, published_at, created_at FROM notices',
    );
    const [posts] = await db.query(
      `SELECT p.id, p.public_no, p.title, p.content, p.content_json, p.post_status,
              p.is_hidden, p.created_at, b.visibility AS board_visibility
         FROM posts p INNER JOIN boards b ON b.id = p.board_id`,
    );
    const [comments] = await db.query(
      `SELECT c.id, c.post_id, c.content, p.created_at, p.post_status, p.is_hidden,
              b.visibility AS board_visibility
         FROM comments c INNER JOIN posts p ON p.id = c.post_id
         INNER JOIN boards b ON b.id = p.board_id`,
    );
    const files = await loadFiles(db);
    const seed = JSON.parse(
      readFileSync(resolve(__dirname, '../packages/db/seed/legacy-content.json'), 'utf8'),
    );
    const normalized = await normalizeFiles(db, s3);
    if (APPLY && normalized) {
      files.clear();
      for (const [id, file] of await loadFiles(db)) files.set(id, file);
    }

    let currentNoticeChanges = 0;
    for (const row of notices) {
      const result = await migrateDoc(
        db,
        s3,
        targetForNotice(row),
        noticeDoc(row.content),
        files,
        cache,
        failures,
      );
      if (APPLY && result.changed) {
        await db.execute('UPDATE notices SET content = ?, updated_at = now(3) WHERE id = ?', [
          serializeNotice(result.doc),
          row.id,
        ]);
        currentNoticeChanges += 1;
      } else if (result.changed) currentNoticeChanges += 1;
    }
    let currentPostChanges = 0;
    for (const row of posts) {
      const target = targetForPost(row);
      const textResult = await migrateText(db, s3, target, row.content, files, cache, failures);
      const docResult = await migrateDoc(
        db,
        s3,
        target,
        parseJson(row.content_json),
        files,
        cache,
        failures,
      );
      if (textResult.changed || docResult.changed) {
        currentPostChanges += 1;
        if (APPLY)
          await db.execute(
            'UPDATE posts SET content = ?, content_json = ?, updated_at = now(3) WHERE id = ?',
            [
              textResult.value,
              docResult.doc ? JSON.stringify(docResult.doc) : row.content_json,
              row.id,
            ],
          );
      }
    }
    for (const row of comments) {
      const target = {
        type: 'post',
        id: Number(row.post_id),
        date: row.created_at,
        visibility:
          row.post_status === 'published' && !row.is_hidden && row.board_visibility === 'public'
            ? 'public'
            : 'private',
      };
      const result = await migrateText(db, s3, target, row.content, files, cache, failures);
      if (APPLY && result.changed)
        await db.execute('UPDATE comments SET content = ?, updated_at = now(3) WHERE id = ?', [
          result.value,
          row.id,
        ]);
    }

    let restoredNotices = 0;
    for (const entry of seed.notices || []) {
      const row = match(notices, entry);
      if (!row) continue;
      const url = `${NOTICE_BASE}readDocument.php?id=${encodeURIComponent(entry.legacyId)}`;
      try {
        const parsed = parseNotice(await fetchText(url), url);
        if (!parsed.assets.length) continue;
        const current = noticeDoc(row.content);
        const needsBody =
          !current || imageSources(current).length < imageSources(parsed.doc).length;
        if (needsBody) {
          const result = await migrateDoc(
            db,
            s3,
            targetForNotice(row),
            parsed.doc,
            files,
            cache,
            failures,
          );
          if (APPLY)
            await db.execute('UPDATE notices SET content = ?, updated_at = now(3) WHERE id = ?', [
              serializeNotice(result.doc),
              row.id,
            ]);
          restoredNotices += 1;
        }
        for (const assetUrl of parsed.assets) {
          if (!imageSources(parsed.doc).includes(assetUrl))
            await migrateAsset(db, s3, targetForNotice(row), assetUrl, cache, failures);
        }
      } catch (error) {
        failures.push({ source: `notice:${entry.legacyId}`, url, reason: error.message });
      }
    }
    let restoredPosts = 0;
    for (const entry of seed.freeBoardPosts || []) {
      const row = match(posts, entry);
      if (!row) continue;
      const url = `${BOARD_BASE}readDocument.php?id=${encodeURIComponent(entry.legacyId)}`;
      try {
        const parsed = parsePost(await fetchText(url, COOKIE ? { Cookie: COOKIE } : {}), url);
        if (!parsed.assets.length) continue;
        const current = parseJson(row.content_json);
        const needsBody =
          !current || imageSources(current).length < imageSources(parsed.doc).length;
        if (needsBody) {
          const result = await migrateDoc(
            db,
            s3,
            targetForPost(row),
            parsed.doc,
            files,
            cache,
            failures,
          );
          if (APPLY)
            await db.execute(
              'UPDATE posts SET content = ?, content_json = ?, updated_at = now(3) WHERE id = ?',
              [plainText(result.doc), JSON.stringify(result.doc), row.id],
            );
          restoredPosts += 1;
        }
        for (const assetUrl of parsed.assets) {
          if (!imageSources(parsed.doc).includes(assetUrl))
            await migrateAsset(db, s3, targetForPost(row), assetUrl, cache, failures);
        }
      } catch (error) {
        failures.push({ source: `post:${entry.legacyId}`, url, reason: error.message });
      }
    }

    console.log(
      JSON.stringify(
        {
          mode: APPLY ? 'apply' : 'dry-run',
          bucket: BUCKET,
          publicBaseUrl: publicBase(),
          normalizedLegacyFiles: normalized,
          currentNoticeChanges,
          currentPostChanges,
          restoredNotices,
          restoredPosts,
          downloadedAssets: cache.size,
          failures,
        },
        null,
        2,
      ),
    );
    const blockingFailures = failures.filter((failure) => {
      try {
        return new URL(failure.url || '').hostname.endsWith('jshsus.kr');
      } catch {
        return false;
      }
    });
    if (blockingFailures.length) process.exitCode = 2;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
