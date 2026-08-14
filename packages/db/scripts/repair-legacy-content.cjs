#!/usr/bin/env node

const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const mysql = require('mysql2/promise');
const { decodeHtmlEntities, decodeJsonStrings } = require('./html-entities.cjs');
const { parseNoticeDetail, fetchText } = require('./import-legacy-site-data.cjs');
const { seedConnectionOptions } = require('./seed-connection.cjs');

const ROOT_DIR = resolve(__dirname, '../../..');
const NOTICE_BASE = 'https://jshsus.kr/contents/council/';
const RICH_TEXT_PREFIX = 'jshsus-rich-text:v1\n';
const PROTECTED_EMAIL_TOKEN = /\[email\s+protected\]/gi;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LOCK_NAME = 'jshsus-repair-legacy-content';

function loadEnv() {
  const envPath = resolve(ROOT_DIR, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const value = match[2].trim();
    process.env[match[1]] =
      value.startsWith('"') && value.endsWith('"')
        ? value.slice(1, -1)
        : value.startsWith("'") && value.endsWith("'")
          ? value.slice(1, -1)
          : value;
  }
}

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
    throw new Error('DATABASE_URL must contain a safe database name.');
  }
  return database;
}

function normalizeDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ');
  return String(value).replace('T', ' ').slice(0, 19);
}

function normalizeTitle(value) {
  return decodeHtmlEntities(String(value ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function replaceProtectedEmailTokens(value, emails, state) {
  return String(value ?? '').replace(PROTECTED_EMAIL_TOKEN, () => {
    const replacement = emails[state.index] ?? emails[emails.length - 1];
    if (replacement) state.index += 1;
    return replacement ?? '[email protected]';
  });
}

function normalizeRichText(value, emails = []) {
  if (value === null || value === undefined) return value;
  const decoded = decodeHtmlEntities(String(value));
  const state = { index: 0 };
  if (!decoded.startsWith(RICH_TEXT_PREFIX)) {
    return replaceProtectedEmailTokens(decoded, emails, state);
  }

  try {
    const document = decodeJsonStrings(JSON.parse(decoded.slice(RICH_TEXT_PREFIX.length)));
    const replace = (node) => {
      if (typeof node === 'string') return replaceProtectedEmailTokens(node, emails, state);
      if (Array.isArray(node)) return node.map(replace);
      if (!node || typeof node !== 'object') return node;
      return Object.fromEntries(
        Object.entries(node).map(([key, nested]) => [key, replace(nested)]),
      );
    };
    return RICH_TEXT_PREFIX + JSON.stringify(replace(document));
  } catch {
    return replaceProtectedEmailTokens(decoded, emails, state);
  }
}

function contentEmails(value) {
  return [...String(value ?? '').matchAll(EMAIL_PATTERN)].map((match) => match[0]);
}

function parseNoticeIds(indexHtml) {
  return [
    ...new Set(
      [...indexHtml.matchAll(/readDocument\.php\?id=([^"'&]+)/g)].map((match) => match[1]),
    ),
  ];
}

async function fetchLegacyNoticeMap() {
  const indexHtml = await fetchText(`${NOTICE_BASE}index.php`);
  const ids = parseNoticeIds(indexHtml);
  const map = new Map();
  const batchSize = 8;
  for (let start = 0; start < ids.length; start += batchSize) {
    const details = await Promise.all(
      ids.slice(start, start + batchSize).map(async (legacyId) => {
        const url = `${NOTICE_BASE}readDocument.php?id=${encodeURIComponent(legacyId)}`;
        try {
          return parseNoticeDetail(await fetchText(url), url);
        } catch (error) {
          console.warn(`Skipping legacy notice ${legacyId}: ${error.message}`);
          return null;
        }
      }),
    );
    for (const detail of details) {
      if (!detail?.title) continue;
      const key = normalizeTitle(detail.title);
      const entries = map.get(key) ?? [];
      entries.push({
        ...detail,
        publishedAt: normalizeDate(detail.publishedAt),
        emails: contentEmails(detail.content),
      });
      map.set(key, entries);
    }
  }
  return { ids: ids.length, map };
}

function pickLegacyNotice(entries, publishedAt) {
  if (!entries?.length) return null;
  const normalizedPublishedAt = normalizeDate(publishedAt);
  return (
    entries.find((entry) => normalizeDate(entry.publishedAt) === normalizedPublishedAt) ??
    entries[0]
  );
}

function repairReport(notices, posts, comments, legacyMap) {
  const noticeUpdates = [];
  const postUpdates = [];
  const commentUpdates = [];
  const unresolvedEmailNoticeIds = [];

  for (const notice of notices) {
    const legacy = pickLegacyNotice(
      legacyMap.get(normalizeTitle(notice.title)),
      notice.publishedAt,
    );
    const emails = legacy?.emails ?? [];
    if (PROTECTED_EMAIL_TOKEN.test(String(notice.content)) && emails.length === 0) {
      unresolvedEmailNoticeIds.push(Number(notice.id));
      PROTECTED_EMAIL_TOKEN.lastIndex = 0;
    }
    PROTECTED_EMAIL_TOKEN.lastIndex = 0;
    const title = normalizeTitle(notice.title);
    const content = normalizeRichText(notice.content, emails);
    if (title !== notice.title || content !== notice.content) {
      noticeUpdates.push({ id: Number(notice.id), title, content });
    }
  }

  for (const post of posts) {
    const title = normalizeTitle(post.title);
    const content = normalizeRichText(post.content);
    let originalContentJson = post.contentJson;
    try {
      if (typeof originalContentJson === 'string')
        originalContentJson = JSON.parse(originalContentJson);
    } catch {
      // Keep malformed JSON unchanged; the content field is still normalized.
    }
    const contentJson = decodeJsonStrings(originalContentJson);
    if (
      title !== post.title ||
      content !== post.content ||
      JSON.stringify(contentJson) !== JSON.stringify(originalContentJson)
    ) {
      postUpdates.push({ id: Number(post.id), title, content, contentJson });
    }
  }

  for (const comment of comments) {
    const content = normalizeRichText(comment.content);
    if (content !== comment.content) commentUpdates.push({ id: Number(comment.id), content });
  }

  return {
    noticeUpdates,
    postUpdates,
    commentUpdates,
    unresolvedEmailNoticeIds,
  };
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  const apply = options.apply === 'true';
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const database = databaseNameFromUrl(databaseUrl);
  if (apply && options['confirm-database'] !== database) {
    throw new Error(`Apply requires --confirm-database=${database}.`);
  }

  const legacy = await fetchLegacyNoticeMap();
  const connection = await mysql.createConnection(seedConnectionOptions(databaseUrl, process.env));
  let lockAcquired = false;
  try {
    const [[lock]] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [LOCK_NAME]);
    lockAcquired = Number(lock.acquired) === 1;
    if (!lockAcquired) throw new Error('Could not acquire the legacy content repair lock.');
    await connection.beginTransaction();
    const [notices] = await connection.execute(
      'SELECT id, title, content, published_at AS publishedAt FROM notices FOR UPDATE',
    );
    const [posts] = await connection.execute(
      'SELECT id, title, content, content_json AS contentJson FROM posts FOR UPDATE',
    );
    const [comments] = await connection.execute('SELECT id, content FROM comments FOR UPDATE');
    const plan = repairReport(notices, posts, comments, legacy.map);
    const report = {
      mode: apply ? 'apply' : 'dry-run',
      database,
      legacyNoticesSeen: legacy.ids,
      notices: notices.length,
      noticeUpdates: plan.noticeUpdates.length,
      posts: posts.length,
      postUpdates: plan.postUpdates.length,
      comments: comments.length,
      commentUpdates: plan.commentUpdates.length,
      unresolvedEmailNoticeIds: plan.unresolvedEmailNoticeIds,
    };
    if (!apply) {
      await connection.rollback();
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    for (const notice of plan.noticeUpdates) {
      await connection.execute('UPDATE notices SET title = ?, content = ? WHERE id = ?', [
        notice.title,
        notice.content,
        notice.id,
      ]);
    }
    for (const post of plan.postUpdates) {
      await connection.execute(
        'UPDATE posts SET title = ?, content = ?, content_json = ? WHERE id = ?',
        [
          post.title,
          post.content,
          post.contentJson === null ? null : JSON.stringify(post.contentJson),
          post.id,
        ],
      );
    }
    for (const comment of plan.commentUpdates) {
      await connection.execute('UPDATE comments SET content = ? WHERE id = ?', [
        comment.content,
        comment.id,
      ]);
    }
    await connection.commit();
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    if (lockAcquired)
      await connection.execute('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => undefined);
    await connection.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  fetchLegacyNoticeMap,
  normalizeRichText,
  parseNoticeIds,
  repairReport,
};
