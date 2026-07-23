const mysql = require('mysql2/promise');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { seedConnectionOptions } = require('./seed-connection.cjs');

const ROOT_DIR = resolve(__dirname, '../../..');
const LEGACY_CONTENT_SEED_PATH = resolve(ROOT_DIR, 'packages/db/seed/legacy-content.json');

const CORE_ROLES = [
  ['system_admin', '시스템 관리자'],
  ['student_affairs_head', '학생관리부장'],
  ['teacher', '교사'],
  ['student_council', '학생회'],
  ['broadcast_club', '방송부'],
  ['student', '학생'],
];

const CORE_PERMISSIONS = [
  [
    'content.manage',
    '콘텐츠 관리',
    '이전 통합 콘텐츠 관리 권한입니다. 신규 기능은 세부 권한을 사용합니다.',
  ],
  ['notices.manage', '공지 관리', '공지를 작성, 수정, 고정 및 삭제합니다.'],
  ['school_events.manage', '학사일정 관리', '학사일정을 작성, 수정 및 삭제합니다.'],
  ['community.manage', '자유게시판 관리', '게시글, 댓글 및 신고를 관리합니다.'],
  ['lost_items.manage', '분실물 관리', '분실물 게시물과 처리 상태를 관리합니다.'],
  ['petitions.answer', '청원 답변', '기준을 충족한 청원에 공식 답변을 작성합니다.'],
  ['activity.review', '탐활서 승인', '탐구활동서를 승인하거나 반려합니다.'],
  ['points.issue', '상벌점 부여', '학생과 사유를 조회하고 상벌점을 부여합니다.'],
  ['points.manage', '상벌점 관리', '상벌점 원장을 생성, 취소 및 복원합니다.'],
  ['dorm.manage', '기숙사 관리', '호실 배정과 기숙사 민원을 관리합니다.'],
  ['devices.manage', '보관함 관리', '휴대폰 보관함 상태와 기존 명령 이력을 조회합니다.'],
  [
    'wake_songs.review',
    '기상곡 승인 및 편성',
    '기상곡 신청을 승인·반려하고 편성 및 재생 상태를 관리합니다.',
  ],
  ['jbs.publish', 'JBS 게시', '방송부 영상과 설명을 JBS에 게시합니다.'],
  ['users.manage', '사용자 관리', '학생과 교직원 프로필을 관리합니다.'],
  ['iam.manage', 'IAM 관리', '역할과 권한을 관리합니다.'],
  ['audit.read', '감사 로그 조회', '관리자 작업 감사 로그를 조회합니다.'],
];

const BUILT_IN_ROLE_NAMES = CORE_ROLES.map(([name]) => name);

const CORE_ROLE_PERMISSION_NAMES = {
  teacher: ['activity.review', 'points.issue'],
  student_council: ['notices.manage', 'community.manage', 'lost_items.manage', 'petitions.answer'],
  broadcast_club: ['jbs.publish'],
  student_affairs_head: [
    'activity.review',
    'points.issue',
    'points.manage',
    'dorm.manage',
    'devices.manage',
    'wake_songs.review',
  ],
};

const CORE_BOARDS = [
  ['free', '자유게시판', '학생 자유게시판', 'public', 0],
  ['jbs', 'JBS', '방송부가 전하는 학교 영상과 소식', 'public', 0],
];

const LEGACY_JBS_VIDEOS = [
  {
    title: '32기 조기졸업 헌정영상',
    description: '미완성',
    youtubeVideoId: 'V7micHND5hs',
    createdAt: '2025-01-10 00:00:00.000',
  },
  {
    title: '2024 송죽제',
    description: '',
    youtubeVideoId: 'CqlEnZC5VFs',
    createdAt: '2025-01-09 00:00:00.000',
  },
  {
    title: '2024 체육대회 축구결승',
    description: '',
    youtubeVideoId: 'Y-mno5SRWGA',
    createdAt: '2025-01-08 00:00:00.000',
  },
  {
    title: '2024 과학의 날',
    description: '2024 과학의 날 공연입니다.',
    youtubeVideoId: '0rkc9Qky6bI',
    createdAt: '2025-01-07 00:00:00.000',
  },
  {
    title: '2024 체육대회 전야제',
    description: '2024 체육대회 전야제입니다.',
    youtubeVideoId: '2zsz47Q7094',
    createdAt: '2025-01-06 00:00:00.000',
  },
  {
    title: '2023 송죽제',
    description: '2023 송죽제입니다.',
    youtubeVideoId: 'WFfKmiElggY',
    createdAt: '2025-01-05 00:00:00.000',
  },
  {
    title: '2023 과학의 날',
    description: '',
    youtubeVideoId: 'LPeWeKNkiqo',
    createdAt: '2025-01-04 00:00:00.000',
  },
  {
    title: '2023 체육대회 전야제',
    description: '',
    youtubeVideoId: 'k4wZR7XzMKM',
    createdAt: '2025-01-03 00:00:00.000',
  },
  {
    title: '1학기 멜팅포인트 - 2',
    description:
      '촬영날짜 : 2022년 7월 28일\n7월 28일에 진행한 멜팅포인트 영상입니다.\n김도율, BMW, TW 등',
    youtubeVideoId: 'EE3uxPMPoec',
    createdAt: '2025-01-02 00:00:00.000',
  },
  {
    title: '1학기 멜팅포인트 - 1',
    description:
      '촬영날짜 : 2022년 7월 27일\n7월 27일에 진행한 멜팅포인트 영상입니다.\n서명우, BMW, TW, 에프론테, 김수진선생님, 이내건선생님 등',
    youtubeVideoId: 'gYZou71V9yM',
    createdAt: '2025-01-01 00:00:00.000',
  },
];

function resolveActiveSchoolYear(environment = process.env, now = new Date()) {
  const configured = environment.ACTIVE_SCHOOL_YEAR;
  if (configured !== undefined && configured !== '') {
    const parsed = Number(configured);
    if (Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100) return parsed;
    throw new Error('ACTIVE_SCHOOL_YEAR must be an integer between 2000 and 2100.');
  }
  return now.getFullYear();
}

function placeholders(values) {
  return values.map(() => '?').join(', ');
}

async function selectOne(connection, query, values = []) {
  const [rows] = await connection.execute(query, values);
  return rows[0] ?? null;
}

async function nextPostPublicNo(connection, boardId) {
  const row = await selectOne(
    connection,
    'SELECT COALESCE(MAX(public_no), 0) + 1 AS value FROM posts WHERE board_id = ?',
    [boardId],
  );
  return Number(row?.value ?? 1);
}

function loadLocalEnv() {
  const envPath = resolve(ROOT_DIR, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

async function upsertRoles(connection) {
  await connection.query(
    `INSERT INTO roles (name, label)
     VALUES ?
     ON DUPLICATE KEY UPDATE label = VALUES(label), updated_at = now(3)`,
    [CORE_ROLES],
  );
}

async function upsertPermissions(connection) {
  await connection.query(
    `INSERT INTO permissions (name, label, description)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       label = VALUES(label),
       description = VALUES(description),
       updated_at = now(3)`,
    [CORE_PERMISSIONS],
  );
}

async function rebuildBuiltInRolePermissions(connection) {
  await connection.execute(
    `DELETE rp
     FROM role_permissions rp
     INNER JOIN roles r ON r.id = rp.role_id
     WHERE r.name IN (${placeholders(BUILT_IN_ROLE_NAMES)})`,
    BUILT_IN_ROLE_NAMES,
  );

  for (const [roleName, permissionNames] of Object.entries(CORE_ROLE_PERMISSION_NAMES)) {
    await connection.execute(
      `INSERT IGNORE INTO role_permissions (role_id, permission_id)
       SELECT r.id, p.id
       FROM roles r
       INNER JOIN permissions p ON p.name IN (${placeholders(permissionNames)})
       WHERE r.name = ?`,
      [...permissionNames, roleName],
    );
  }

  await connection.execute(
    `INSERT IGNORE INTO role_permissions (role_id, permission_id)
     SELECT r.id, p.id
     FROM roles r
     CROSS JOIN permissions p
     WHERE r.name = 'system_admin'`,
  );
}

async function upsertBoards(connection) {
  await connection.query(
    `INSERT INTO boards (slug, name, description, visibility, allow_anonymous)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       description = VALUES(description),
       visibility = VALUES(visibility),
       allow_anonymous = VALUES(allow_anonymous),
       updated_at = now(3)`,
    [CORE_BOARDS],
  );
}

function richTextDocumentFromPlainText(value) {
  const lines = String(value || '').split(/\r?\n/);
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : undefined,
    })),
  };
}

function loadLegacyContentSeed() {
  if (!existsSync(LEGACY_CONTENT_SEED_PATH)) {
    return { notices: [], freeBoardPosts: [] };
  }

  const parsed = JSON.parse(readFileSync(LEGACY_CONTENT_SEED_PATH, 'utf8'));
  return {
    notices: Array.isArray(parsed.notices) ? parsed.notices : [],
    freeBoardPosts: Array.isArray(parsed.freeBoardPosts) ? parsed.freeBoardPosts : [],
    freeBoardComments: Array.isArray(parsed.freeBoardComments) ? parsed.freeBoardComments : [],
    freeBoardCommentReplies: Array.isArray(parsed.freeBoardCommentReplies)
      ? parsed.freeBoardCommentReplies
      : [],
  };
}

async function findSeededComment(connection, comment) {
  const [[existing]] = await connection.execute(
    `SELECT id
     FROM comments
     WHERE post_id = ?
       AND ((? IS NULL AND parent_id IS NULL) OR parent_id = ?)
       AND author_id IS NULL
       AND author_name <=> ?
       AND content = ?
       AND is_hidden = ?
       AND created_at = ?
     LIMIT 1`,
    [
      comment.postId,
      comment.parentId ?? null,
      comment.parentId ?? null,
      comment.authorName ?? null,
      comment.content,
      comment.isHidden ? 1 : 0,
      comment.createdAt,
    ],
  );
  return existing?.id;
}

async function upsertSeededComment(connection, comment) {
  const existingId = await findSeededComment(connection, comment);
  if (existingId) return existingId;

  const [result] = await connection.execute(
    `INSERT INTO comments
     (post_id, parent_id, author_id, author_name, content, is_hidden, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
    [
      comment.postId,
      comment.parentId ?? null,
      comment.authorName ?? null,
      comment.content,
      comment.isHidden ? 1 : 0,
      comment.createdAt,
      comment.createdAt,
    ],
  );
  return result.insertId;
}

async function upsertLegacyContent(connection) {
  const seed = loadLegacyContentSeed();
  if (seed.notices.length === 0 && seed.freeBoardPosts.length === 0) return;

  for (const notice of seed.notices) {
    await connection.execute(
      `INSERT INTO notices
       (public_no, title, content, department, author_name, visibility, pinned, published_at,
         author_id, view_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'public', 0, ?, NULL, ?, ?, ?)
       ON DUPLICATE KEY UPDATE public_no = public_no`,
      [
        notice.publicNo,
        notice.title,
        notice.content,
        notice.department,
        notice.authorName ?? null,
        notice.publishedAt,
        notice.viewCount ?? 0,
        notice.publishedAt,
        notice.publishedAt,
      ],
    );
  }

  if (seed.freeBoardPosts.length === 0) return;
  const [[freeBoard]] = await connection.execute(
    "SELECT id FROM boards WHERE slug = 'free' LIMIT 1",
  );
  if (!freeBoard) throw new Error('Free board must exist before legacy posts are seeded.');

  for (const post of seed.freeBoardPosts) {
    await connection.execute(
      `INSERT INTO posts
       (public_no, board_id, author_id, author_name, title, content, content_json, post_status,
         is_anonymous, is_hidden, view_count, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, CAST(? AS JSON), 'published', 0, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE public_no = public_no`,
      [
        post.publicNo,
        freeBoard.id,
        post.authorName ?? null,
        post.title,
        post.content,
        JSON.stringify(post.contentDoc ?? richTextDocumentFromPlainText(post.content)),
        post.isHidden ? 1 : 0,
        post.viewCount ?? 0,
        post.createdAt,
        post.createdAt,
      ],
    );
  }

  if (seed.freeBoardComments.length === 0 && seed.freeBoardCommentReplies.length === 0) return;

  const [postRows] = await connection.execute(
    'SELECT id, public_no AS publicNo FROM posts WHERE board_id = ?',
    [freeBoard.id],
  );
  const postIdByPublicNo = new Map(postRows.map((row) => [Number(row.publicNo), row.id]));
  const postIdByLegacyId = new Map();
  for (const post of seed.freeBoardPosts) {
    const postId = postIdByPublicNo.get(Number(post.publicNo));
    if (postId) postIdByLegacyId.set(post.legacyId, postId);
  }

  const commentIdByLegacyKey = new Map();
  for (const comment of seed.freeBoardComments) {
    const postId = postIdByLegacyId.get(comment.legacyPostId);
    if (!postId) continue;
    const id = await upsertSeededComment(connection, {
      ...comment,
      postId,
      parentId: null,
    });
    commentIdByLegacyKey.set(`${comment.legacyPostId}:${comment.legacyCommentId}`, id);
  }

  for (const reply of seed.freeBoardCommentReplies) {
    const postId = postIdByLegacyId.get(reply.legacyPostId);
    const parentId = commentIdByLegacyKey.get(
      `${reply.legacyPostId}:${reply.legacyParentCommentId}`,
    );
    if (!postId || !parentId) continue;
    const id = await upsertSeededComment(connection, {
      ...reply,
      postId,
      parentId,
    });
    commentIdByLegacyKey.set(`${reply.legacyPostId}:${reply.legacyCommentId}`, id);
  }
}

async function upsertLegacyJbsVideos(connection) {
  const [[board]] = await connection.execute("SELECT id FROM boards WHERE slug = 'jbs' LIMIT 1");
  if (!board) throw new Error('JBS board must exist before legacy videos are seeded.');
  const [[legacyAuthor]] = await connection.execute(
    'SELECT id FROM users WHERE student_no = 9999 LIMIT 1',
  );
  const legacyAuthorId = legacyAuthor?.id ?? null;

  for (const video of LEGACY_JBS_VIDEOS) {
    const canonicalUrl = `https://www.youtube.com/watch?v=${video.youtubeVideoId}`;
    const contentJson = JSON.stringify(richTextDocumentFromPlainText(video.description));
    const [[existing]] = await connection.execute(
      `SELECT jbs_videos.post_id
       FROM jbs_videos
       INNER JOIN posts ON posts.id = jbs_videos.post_id
       WHERE jbs_videos.youtube_video_id = ?
       LIMIT 1`,
      [video.youtubeVideoId],
    );

    if (existing) {
      await connection.execute(
        `UPDATE posts
         SET board_id = ?, author_id = COALESCE(?, author_id),
             title = ?, content = ?, content_json = CAST(? AS JSON),
             post_status = 'published', is_anonymous = 0, is_hidden = 0, updated_at = now(3)
         WHERE id = ?`,
        [board.id, legacyAuthorId, video.title, video.description, contentJson, existing.post_id],
      );
      await connection.execute(
        `UPDATE jbs_videos
         SET canonical_url = ?, updated_at = now(3)
         WHERE post_id = ?`,
        [canonicalUrl, existing.post_id],
      );
      continue;
    }

    const publicNo = await nextPostPublicNo(connection, board.id);
    const [result] = await connection.execute(
      `INSERT INTO posts
       (public_no, board_id, author_id, title, content, content_json, post_status, is_anonymous,
         is_hidden, view_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), 'published', 0, 0, 0, ?, ?)`,
      [
        publicNo,
        board.id,
        legacyAuthorId,
        video.title,
        video.description,
        contentJson,
        video.createdAt,
        video.createdAt,
      ],
    );
    await connection.execute(
      `INSERT INTO jbs_videos
        (post_id, youtube_video_id, canonical_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [result.insertId, video.youtubeVideoId, canonicalUrl, video.createdAt, video.createdAt],
    );
  }
}

async function upsertActiveSchoolYear(connection, schoolYear) {
  await connection.execute(
    `UPDATE school_years
     SET is_active = 0, updated_at = now(3)
     WHERE is_active = 1 AND year <> ?`,
    [schoolYear],
  );
  await connection.execute(
    `INSERT INTO school_years (year, is_active)
     VALUES (?, 1)
     ON DUPLICATE KEY UPDATE is_active = VALUES(is_active), updated_at = now(3)`,
    [schoolYear],
  );
}

async function bootstrapCoreData(connection, options = {}) {
  const schoolYear =
    options.schoolYear ?? resolveActiveSchoolYear(options.environment ?? process.env);

  await connection.beginTransaction();
  try {
    await upsertRoles(connection);
    await upsertPermissions(connection);
    await rebuildBuiltInRolePermissions(connection);
    await upsertBoards(connection);
    await upsertLegacyContent(connection);
    await upsertLegacyJbsVideos(connection);
    await upsertActiveSchoolYear(connection, schoolYear);
    await connection.commit();
    return { schoolYear };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  loadLocalEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const connection = await mysql.createConnection(seedConnectionOptions(databaseUrl));
  try {
    const { schoolYear } = await bootstrapCoreData(connection);
    console.log(`Core database data ready: ${CORE_ROLES.length} roles, ${schoolYear} active year.`);
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  BUILT_IN_ROLE_NAMES,
  CORE_BOARDS,
  CORE_PERMISSIONS,
  CORE_ROLES,
  CORE_ROLE_PERMISSION_NAMES,
  LEGACY_JBS_VIDEOS,
  bootstrapCoreData,
  loadLocalEnv,
  resolveActiveSchoolYear,
};
