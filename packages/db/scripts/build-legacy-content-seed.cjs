const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');

const ROOT_DIR = resolve(__dirname, '../../..');
const RICH_NOTICE_PREFIX = 'jshsus-rich-text:v1\n';

const DEFAULT_SQL_DUMP = '/tmp/jshsus_legacy.sql';
const DEFAULT_COUNCIL_DATA_DIR = '/tmp/jshsus_legacy_content/council-data';
const DEFAULT_SCHOOL_DATA_DIR = '/tmp/jshsus_legacy_content/school-data';
const DEFAULT_OUTPUT_PATH = resolve(ROOT_DIR, 'packages/db/seed/legacy-content.json');

function decodeSqlString(value) {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== '\\') {
      result += character;
      continue;
    }
    index += 1;
    const escaped = value[index];
    if (escaped === undefined) break;
    if (escaped === 'n') result += '\n';
    else if (escaped === 'r') result += '\r';
    else if (escaped === 't') result += '\t';
    else if (escaped === '0') result += '\0';
    else result += escaped;
  }
  return result;
}

function parseInsertRows(sql, tableName) {
  const marker = `INSERT INTO \`${tableName}\` VALUES`;
  const markerIndex = sql.indexOf(marker);
  if (markerIndex === -1) return [];
  let index = markerIndex + marker.length;
  const rows = [];

  function skipWhitespace() {
    while (/\s/.test(sql[index] ?? '')) index += 1;
  }

  while (index < sql.length) {
    skipWhitespace();
    if (sql[index] === ';') break;
    if (sql[index] === ',') {
      index += 1;
      continue;
    }
    if (sql[index] !== '(') {
      index += 1;
      continue;
    }

    index += 1;
    const row = [];
    while (index < sql.length) {
      skipWhitespace();
      if (sql[index] === "'") {
        index += 1;
        let raw = '';
        while (index < sql.length) {
          const character = sql[index];
          if (character === '\\') {
            raw += character;
            index += 1;
            if (index < sql.length) raw += sql[index];
            index += 1;
            continue;
          }
          if (character === "'") {
            index += 1;
            break;
          }
          raw += character;
          index += 1;
        }
        row.push(decodeSqlString(raw));
      } else {
        const start = index;
        while (index < sql.length && sql[index] !== ',' && sql[index] !== ')') index += 1;
        const raw = sql.slice(start, index).trim();
        row.push(raw.toUpperCase() === 'NULL' ? null : raw);
      }

      skipWhitespace();
      if (sql[index] === ',') {
        index += 1;
        continue;
      }
      if (sql[index] === ')') {
        index += 1;
        rows.push(row);
        break;
      }
    }
  }

  return rows;
}

function decodeHtmlEntities(value) {
  return value
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function normalizeLegacyHtml(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .trim();
}

function htmlToText(value) {
  return decodeHtmlEntities(
    normalizeLegacyHtml(value)
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<(?:br|hr)\b[^>]*>/gi, '\n')
      .replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, 'ㆍ')
      .replace(/<[^>]*>/g, ' '),
  )
    .split(/\n+/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function richTextDocumentFromPlainText(value) {
  const lines = String(value || '').split(/\r?\n/);
  return {
    type: 'doc',
    content: lines.length
      ? lines.map((line) => ({
          type: 'paragraph',
          content: line ? [{ type: 'text', text: line }] : undefined,
        }))
      : [{ type: 'paragraph' }],
  };
}

function serializeNoticeContent(contentDoc, plainText) {
  return `${RICH_NOTICE_PREFIX}${JSON.stringify({ contentDoc, plainText })}`;
}

function readLegacyBody(directory, id) {
  const candidates = [join(directory, id), join(directory, 'data', id)];
  const path = candidates.find((candidate) => existsSync(candidate));
  return path ? readFileSync(path, 'utf8') : '';
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nonEmpty(value, fallback) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function visibleLegacyCommentContent(value) {
  const content = htmlToText(value);
  if (!content) return null;
  if (/^삭제된\s*(댓글|답글|내용)(입니다)?\.?$/i.test(content)) return null;
  return content;
}

function buildUserMap(rows) {
  const users = new Map();
  for (const row of rows) {
    const [name, , , , , , nickname, , studentId, , , , schoolNumber] = row;
    const displayName = nonEmpty(
      nickname,
      nonEmpty(name, String(schoolNumber || studentId || '작성자')),
    );
    users.set(studentId, displayName);
  }
  return users;
}

function main() {
  const sqlPath = process.env.LEGACY_SQL_DUMP ?? DEFAULT_SQL_DUMP;
  const councilDataDir = process.env.LEGACY_COUNCIL_DATA_DIR ?? DEFAULT_COUNCIL_DATA_DIR;
  const schoolDataDir = process.env.LEGACY_SCHOOL_DATA_DIR ?? DEFAULT_SCHOOL_DATA_DIR;
  const outputPath = process.env.LEGACY_CONTENT_SEED_OUT ?? DEFAULT_OUTPUT_PATH;

  const sql = readFileSync(sqlPath, 'utf8');
  const users = buildUserMap(parseInsertRows(sql, 'jshsus_user'));

  const notices = parseInsertRows(sql, 'council_notice')
    .map((row) => {
      const [legacyId, title, authorName, department, createdAt, viewCount, display] = row;
      if (display !== 'y') return null;
      const plainText = htmlToText(readLegacyBody(councilDataDir, legacyId));
      return {
        legacyId,
        title: nonEmpty(title, '제목 없음'),
        content: serializeNoticeContent(richTextDocumentFromPlainText(plainText), plainText),
        department: nonEmpty(department, '학교'),
        authorName: nonEmpty(authorName, undefined),
        publishedAt: `${createdAt}.000`,
        viewCount: asNumber(viewCount),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.publishedAt.localeCompare(right.publishedAt))
    .map((notice, index) => ({ publicNo: index + 1, ...notice }));

  const usedPostNumbers = new Set();
  const seededPostIds = new Set();
  const freeBoardPosts = parseInsertRows(sql, 'school_board')
    .map((row) => {
      const [legacyId, title, authorId, createdAt, viewCount, , display, , commentCount, publicNo] =
        row;
      if (display !== 'y') return null;
      const plainText = htmlToText(readLegacyBody(schoolDataDir, legacyId));
      const numericPublicNo = asNumber(publicNo);
      if (numericPublicNo <= 0 || usedPostNumbers.has(numericPublicNo)) return null;
      usedPostNumbers.add(numericPublicNo);
      seededPostIds.add(legacyId);
      return {
        legacyId,
        publicNo: numericPublicNo,
        title: nonEmpty(title, '제목 없음'),
        content: plainText,
        contentDoc: richTextDocumentFromPlainText(plainText),
        authorName: users.get(authorId) ?? '작성자',
        isHidden: false,
        viewCount: asNumber(viewCount),
        commentCount: asNumber(commentCount),
        createdAt: `${createdAt}.000`,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.publicNo - right.publicNo);

  const freeBoardComments = parseInsertRows(sql, 'board_comment')
    .map((row) => {
      const [legacyPostId, legacyCommentId, authorId, createdAt, comment, , display] = row;
      if (!seededPostIds.has(legacyPostId)) return null;
      if (display !== 'y') return null;
      const content = visibleLegacyCommentContent(comment);
      if (!content) return null;
      return {
        legacyPostId,
        legacyCommentId,
        legacyParentCommentId: null,
        authorName: users.get(authorId) ?? '작성자',
        content,
        isHidden: false,
        createdAt: `${createdAt}.000`,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  const freeBoardCommentReplies = parseInsertRows(sql, 'board_reply')
    .map((row) => {
      const [
        legacyPostId,
        legacyParentCommentId,
        legacyCommentId,
        authorId,
        createdAt,
        reply,
        display,
      ] = row;
      if (!seededPostIds.has(legacyPostId)) return null;
      if (display !== 'y') return null;
      const content = visibleLegacyCommentContent(reply);
      if (!content) return null;
      return {
        legacyPostId,
        legacyCommentId,
        legacyParentCommentId,
        authorName: users.get(authorId) ?? '작성자',
        content,
        isHidden: false,
        createdAt: `${createdAt}.000`,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    `${JSON.stringify(
      { notices, freeBoardPosts, freeBoardComments, freeBoardCommentReplies },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log(
    `Wrote ${notices.length} notices, ${freeBoardPosts.length} free board posts, ` +
      `${freeBoardComments.length} comments, and ${freeBoardCommentReplies.length} replies.`,
  );
}

if (require.main === module) main();
