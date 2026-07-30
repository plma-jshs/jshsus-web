#!/usr/bin/env node
const mysql = require('mysql2/promise');
const { decodeHtmlEntities, decodeJsonStrings } = require('./html-entities.cjs');
const { seedConnectionOptions } = require('./seed-connection.cjs');

const LOCK_NAME = 'jshsus-normalize-board-content';
const TEMPORARY_PUBLIC_NO_OFFSET = 1_000_000_000;

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

function normalizeJsonDocument(value) {
  if (value === null || value === undefined) return null;
  const parsed = parseJsonDocument(value);
  return decodeJsonStrings(parsed);
}

function parseJsonDocument(value) {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function isSameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildContentPlan(posts, comments) {
  const postUpdates = [];
  const commentUpdates = [];
  const publicNumberUpdates = [];

  posts.forEach((post, index) => {
    const title = decodeHtmlEntities(post.title);
    const content = decodeHtmlEntities(post.content);
    const contentJson = normalizeJsonDocument(post.contentJson);
    if (
      title !== post.title ||
      content !== post.content ||
      !isSameJson(contentJson, parseJsonDocument(post.contentJson))
    ) {
      postUpdates.push({ id: Number(post.id), title, content, contentJson });
    }

    const publicNo = index + 1;
    if (Number(post.publicNo) !== publicNo) {
      publicNumberUpdates.push({ id: Number(post.id), publicNo });
    }
  });

  for (const comment of comments) {
    const content = decodeHtmlEntities(comment.content);
    if (content !== comment.content) commentUpdates.push({ id: Number(comment.id), content });
  }

  return { postUpdates, commentUpdates, publicNumberUpdates };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apply = options.apply === 'true';
  const boardSlug = options.board ?? 'free';
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const databaseName = databaseNameFromUrl(databaseUrl);
  if (apply) {
    if (options['confirm-database'] !== databaseName) {
      throw new Error(`Apply requires --confirm-database=${databaseName}.`);
    }
    if (options['confirm-board'] !== boardSlug) {
      throw new Error(`Apply requires --confirm-board=${boardSlug}.`);
    }
  }

  const connection = await mysql.createConnection(seedConnectionOptions(databaseUrl, process.env));
  let lockAcquired = false;
  try {
    const [[lock]] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [LOCK_NAME]);
    lockAcquired = Number(lock.acquired) === 1;
    if (!lockAcquired) throw new Error('Could not acquire the board maintenance lock.');

    await connection.beginTransaction();
    const [[board]] = await connection.execute(
      'SELECT id, slug FROM boards WHERE slug = ? LIMIT 1 FOR UPDATE',
      [boardSlug],
    );
    if (!board) throw new Error(`Board was not found: ${boardSlug}`);

    const [posts] = await connection.execute(
      `SELECT id,
              public_no AS publicNo,
              title,
              content,
              content_json AS contentJson
         FROM posts
        WHERE board_id = ?
        ORDER BY created_at, id
        FOR UPDATE`,
      [board.id],
    );
    const [comments] = await connection.execute(
      `SELECT comments.id, comments.content
         FROM comments
         INNER JOIN posts ON posts.id = comments.post_id
        WHERE posts.board_id = ?
        ORDER BY comments.id
        FOR UPDATE`,
      [board.id],
    );

    const plan = buildContentPlan(posts, comments);
    const report = {
      mode: apply ? 'apply' : 'dry-run',
      database: databaseName,
      board: boardSlug,
      posts: posts.length,
      comments: comments.length,
      decodedPosts: plan.postUpdates.length,
      decodedPostIds: plan.postUpdates.slice(0, 20).map((item) => item.id),
      decodedComments: plan.commentUpdates.length,
      decodedCommentIds: plan.commentUpdates.slice(0, 20).map((item) => item.id),
      renumberedPosts: plan.publicNumberUpdates.length,
      firstPublicNumber: posts.length > 0 ? 1 : null,
      lastPublicNumber: posts.length,
    };

    if (!apply) {
      await connection.rollback();
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    for (const post of plan.postUpdates) {
      await connection.execute(
        `UPDATE posts
            SET title = ?, content = ?, content_json = ?
          WHERE id = ? AND board_id = ?`,
        [
          post.title,
          post.content,
          post.contentJson === null ? null : JSON.stringify(post.contentJson),
          post.id,
          board.id,
        ],
      );
    }
    for (const comment of plan.commentUpdates) {
      await connection.execute(
        `UPDATE comments
            SET content = ?
          WHERE id = ?
            AND post_id IN (SELECT id FROM posts WHERE board_id = ?)`,
        [comment.content, comment.id, board.id],
      );
    }

    if (plan.publicNumberUpdates.length > 0) {
      const maxPublicNo = Math.max(...posts.map((post) => Number(post.publicNo)));
      if (maxPublicNo + TEMPORARY_PUBLIC_NO_OFFSET > 2_147_483_647) {
        throw new Error(
          'Current public numbers are too large for the collision-safe renumber step.',
        );
      }
      await connection.execute('UPDATE posts SET public_no = public_no + ? WHERE board_id = ?', [
        TEMPORARY_PUBLIC_NO_OFFSET,
        board.id,
      ]);
      for (let index = 0; index < posts.length; index += 1) {
        const post = posts[index];
        await connection.execute('UPDATE posts SET public_no = ? WHERE id = ? AND board_id = ?', [
          index + 1,
          post.id,
          board.id,
        ]);
      }
    }

    await connection.commit();
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Preserve the original error.
    }
    throw error;
  } finally {
    if (lockAcquired) {
      await connection.execute('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => undefined);
    }
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
  buildContentPlan,
  databaseNameFromUrl,
  normalizeJsonDocument,
  parseArgs,
};
