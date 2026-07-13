const mysql = require('mysql2/promise');
const { assertLocalSeedAllowed } = require('./local-seed-safety.cjs');

const databaseUrl = assertLocalSeedAllowed();
const testUsername = process.env.TEST_USER_USERNAME || 'test.student';

const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

async function selectOne(connection, query, values = []) {
  const [rows] = await connection.execute(query, values);
  return rows[0];
}

async function ensureNotice(connection, authorId, notice) {
  const existing = await selectOne(connection, 'SELECT id FROM notices WHERE title = ? LIMIT 1', [
    notice.title,
  ]);
  if (existing) {
    await connection.execute(
      `UPDATE notices
       SET content = ?, department = ?, visibility = 'public', pinned = ?, published_at = ?,
         author_id = ?, view_count = ?, updated_at = now(3)
       WHERE id = ?`,
      [
        notice.content,
        notice.department,
        notice.pinned,
        notice.publishedAt,
        authorId,
        notice.viewCount,
        existing.id,
      ],
    );
    return existing.id;
  }
  const [result] = await connection.execute(
    `INSERT INTO notices
      (title, content, department, visibility, pinned, published_at, author_id, view_count)
     VALUES (?, ?, ?, 'public', ?, ?, ?, ?)`,
    [
      notice.title,
      notice.content,
      notice.department,
      notice.pinned,
      notice.publishedAt,
      authorId,
      notice.viewCount,
    ],
  );
  return result.insertId;
}

async function ensurePost(connection, boardId, authorId, post) {
  let row = await selectOne(
    connection,
    'SELECT id FROM posts WHERE board_id = ? AND title = ? LIMIT 1',
    [boardId, post.title],
  );
  if (!row) {
    const [result] = await connection.execute(
      `INSERT INTO posts
        (board_id, author_id, title, content, is_anonymous, is_hidden, view_count, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        boardId,
        authorId,
        post.title,
        post.content,
        post.isAnonymous,
        post.viewCount,
        post.createdAt,
      ],
    );
    row = { id: result.insertId };
  } else {
    await connection.execute(
      `UPDATE posts
       SET author_id = ?, content = ?, content_json = NULL, post_status = 'published',
         is_anonymous = ?, is_hidden = 0, view_count = ?, created_at = ?, updated_at = now(3)
       WHERE id = ?`,
      [authorId, post.content, post.isAnonymous, post.viewCount, post.createdAt, row.id],
    );
  }

  const [comments] = await connection.execute(
    'SELECT id FROM comments WHERE post_id = ? AND author_id = ? ORDER BY id',
    [row.id, authorId],
  );
  for (let index = 0; index < post.commentCount; index += 1) {
    const content = post.comments[index % post.comments.length];
    if (comments[index]) {
      await connection.execute(
        `UPDATE comments
         SET content = ?, is_hidden = 0, created_at = ?, updated_at = now(3)
         WHERE id = ?`,
        [content, post.createdAt, comments[index].id],
      );
    } else {
      await connection.execute(
        `INSERT INTO comments (post_id, author_id, content, is_hidden, created_at)
         VALUES (?, ?, ?, 0, ?)`,
        [row.id, authorId, content, post.createdAt],
      );
    }
  }
  for (const extra of comments.slice(post.commentCount)) {
    await connection.execute('DELETE FROM comments WHERE id = ?', [extra.id]);
  }
  return row.id;
}

async function ensurePetition(connection, authorId, petition) {
  let row = await selectOne(connection, 'SELECT id FROM petitions WHERE title = ? LIMIT 1', [
    petition.title,
  ]);
  if (!row) {
    const [result] = await connection.execute(
      `INSERT INTO petitions
        (author_id, title, content, petition_status, starts_at, ends_at, participant_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        authorId,
        petition.title,
        petition.content,
        petition.status,
        petition.startsAt,
        petition.endsAt,
        petition.participantCount,
      ],
    );
    row = { id: result.insertId };
  } else {
    await connection.execute(
      `UPDATE petitions
       SET author_id = ?, content = ?, content_json = NULL, petition_status = ?, starts_at = ?,
         ends_at = ?, participant_count = ?, updated_at = now(3)
       WHERE id = ?`,
      [
        authorId,
        petition.content,
        petition.status,
        petition.startsAt,
        petition.endsAt,
        petition.participantCount,
        row.id,
      ],
    );
  }

  if (petition.answer) {
    const answer = await selectOne(
      connection,
      'SELECT id FROM petition_answers WHERE petition_id = ? LIMIT 1',
      [row.id],
    );
    if (answer) {
      await connection.execute(
        `UPDATE petition_answers
         SET author_id = ?, content = ?, answered_at = ?, updated_at = now(3)
         WHERE id = ?`,
        [authorId, petition.answer, daysFromNow(-1), answer.id],
      );
    } else {
      await connection.execute(
        `INSERT INTO petition_answers (petition_id, author_id, content, answered_at)
         VALUES (?, ?, ?, ?)`,
        [row.id, authorId, petition.answer, daysFromNow(-1)],
      );
    }
  } else {
    await connection.execute('DELETE FROM petition_answers WHERE petition_id = ?', [row.id]);
  }
  return row.id;
}

async function main() {
  const connection = await mysql.createConnection(databaseUrl);
  try {
    await connection.beginTransaction();
    const user = await selectOne(
      connection,
      `SELECT u.id FROM users u
       JOIN auth_accounts a ON a.user_id = u.id
       WHERE a.provider = 'local' AND a.provider_account_id = ? LIMIT 1`,
      [testUsername],
    );
    if (!user) throw new Error('Run db:create-local-test-user before seeding demo data.');

    await connection.execute(
      `INSERT INTO boards (slug, name, description, visibility, allow_anonymous)
       VALUES ('free', '자유게시판', '학생들이 자유롭게 의견을 나누는 게시판', 'public', 1)
       ON DUPLICATE KEY UPDATE visibility = 'public', allow_anonymous = 1,
         description = VALUES(description), updated_at = now(3)`,
    );
    const board = await selectOne(connection, "SELECT id FROM boards WHERE slug = 'free' LIMIT 1");

    const notices = [
      {
        title: '과구리 서비스 개편 안내',
        content:
          '학생 정보포털 과구리가 새롭게 개편되었습니다. 공지사항, 학사일정, 식단과 학생생활 기능을 한곳에서 확인할 수 있습니다.',
        department: '학생회',
        pinned: true,
        publishedAt: daysFromNow(-1),
        viewCount: 142,
      },
      {
        title: '학생회 공지사항 이용 방법',
        content:
          '학생회에서 전달하는 주요 안내는 공지사항에서 확인할 수 있습니다. 중요한 공지는 목록 상단에 고정됩니다.',
        department: '학생회',
        pinned: false,
        publishedAt: daysFromNow(-2),
        viewCount: 87,
      },
      {
        title: '교내 행사 및 일정 확인 안내',
        content:
          '교내 행사와 시험 일정을 학사일정 메뉴에서 확인해 주세요. 일정 변경 시 공지사항을 통해 함께 안내합니다.',
        department: '교무부',
        pinned: false,
        publishedAt: daysFromNow(-4),
        viewCount: 65,
      },
      {
        title: '분실물 게시판 이용 안내',
        content:
          '습득하거나 잃어버린 물건은 분실물 메뉴에 등록해 주세요. 개인정보가 포함된 사진은 올리지 않도록 주의해 주세요.',
        department: '생활부',
        pinned: false,
        publishedAt: daysFromNow(-6),
        viewCount: 44,
      },
    ];
    for (const notice of notices) await ensureNotice(connection, user.id, notice);

    const posts = [
      {
        title: '새 과구리에서 가장 자주 쓰는 메뉴가 뭔가요?',
        content: '저는 식단과 학사일정을 가장 자주 확인할 것 같아요. 여러분은 어떤가요?',
        isAnonymous: false,
        viewCount: 96,
        commentCount: 5,
        comments: ['저도 식단이요!', '학사일정이 편해졌어요.', '분실물 메뉴도 유용할 것 같아요.'],
        createdAt: daysFromNow(-1),
      },
      {
        title: '시험 기간 공부 장소 추천해주세요',
        content: '야간 자율학습 이후 조용하게 공부하기 좋은 장소가 있으면 추천해 주세요.',
        isAnonymous: true,
        viewCount: 121,
        commentCount: 8,
        comments: ['도서관 창가 자리가 좋아요.', '과학동 스터디 공간도 조용합니다.'],
        createdAt: daysFromNow(-2),
      },
      {
        title: '오늘 급식 메뉴 확인하고 가세요',
        content: '오늘 점심 메뉴가 업데이트됐습니다. 알레르기 정보도 함께 확인하세요.',
        isAnonymous: false,
        viewCount: 72,
        commentCount: 3,
        comments: ['정보 감사합니다.', '오늘 점심 기대되네요.'],
        createdAt: daysFromNow(-2),
      },
      {
        title: '동아리 활동 사진 공유합니다',
        content: '이번 주 동아리 활동 사진을 정리했습니다. 참여한 친구들 모두 수고했어요.',
        isAnonymous: true,
        viewCount: 58,
        commentCount: 2,
        comments: ['사진 잘 나왔네요!', '다음 활동도 기대됩니다.'],
        createdAt: daysFromNow(-3),
      },
    ];
    for (const post of posts) await ensurePost(connection, board.id, user.id, post);

    const petitions = [
      {
        title: '학교 행사 의견 수렴 창구를 확대해주세요',
        content:
          '학교 행사 준비 전에 학생 의견을 온라인으로 수렴하고 결과와 반영 여부를 공유하는 절차를 제안합니다.',
        status: 'open',
        participantCount: 34,
        startsAt: daysFromNow(-3),
        endsAt: daysFromNow(14),
      },
      {
        title: '학생 편의시설 개선 제안',
        content:
          '공용 공간의 충전 시설과 휴게 좌석을 점검하고 학생 수요가 높은 위치부터 보완해 주세요.',
        status: 'awaiting_answer',
        participantCount: 50,
        startsAt: daysFromNow(-8),
        endsAt: daysFromNow(9),
      },
      {
        title: '교내 소통 채널 운영 요청',
        content:
          '학생회와 학교가 정기적으로 주요 안건과 처리 현황을 공유하는 공식 소통 채널을 운영해 주세요.',
        status: 'answered',
        participantCount: 63,
        startsAt: daysFromNow(-20),
        endsAt: daysFromNow(-2),
        answer: '학생회 공지와 청원 답변을 통해 주요 안건의 처리 현황을 정기적으로 공유하겠습니다.',
      },
    ];
    for (const petition of petitions) await ensurePetition(connection, user.id, petition);

    await connection.commit();
    console.log('Local notice, board and petition demo data is ready.');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
