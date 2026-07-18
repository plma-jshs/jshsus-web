const mysql = require('mysql2/promise');
const { mkdir, writeFile } = require('node:fs/promises');
const { dirname, join } = require('node:path');
const { assertDemoSeedAllowed } = require('./local-seed-safety.cjs');
const { seedConnectionOptions } = require('./seed-connection.cjs');
const {
  SONGJUK_ROOM_FIXTURES,
  allocateMaleDormAssignments,
  buildDemoStudents,
  currentSchoolTerm,
} = require('./demo-school-fixtures.cjs');

const databaseUrl = assertDemoSeedAllowed();
const testUsername = process.env.TEST_USER_USERNAME || '9999';

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
        (board_id, author_id, title, content, content_json, is_anonymous, is_hidden, view_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        boardId,
        authorId,
        post.title,
        post.content,
        post.contentDoc ? JSON.stringify(post.contentDoc) : null,
        post.isAnonymous,
        post.viewCount,
        post.createdAt,
      ],
    );
    row = { id: result.insertId };
  } else {
    await connection.execute(
      `UPDATE posts
       SET author_id = ?, content = ?, content_json = ?, post_status = 'published',
         is_anonymous = ?, is_hidden = 0, view_count = ?, created_at = ?, updated_at = now(3)
       WHERE id = ?`,
      [
        authorId,
        post.content,
        post.contentDoc ? JSON.stringify(post.contentDoc) : null,
        post.isAnonymous,
        post.viewCount,
        post.createdAt,
        row.id,
      ],
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

const demoPdf = Buffer.from(
  'JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHMgWzMgMCBSXS9Db3VudCAxPj4KZW5kb2JqCjMgMCBvYmoKPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveCBbMCAwIDU5NSA4NDJdPj4KZW5kb2JqCnhyZWYKMCA0CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKdHJhaWxlcgo8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoxOTIKJSVFT0YK',
  'base64',
);

async function ensureDemoPostAttachment(connection, ownerId, postId) {
  const objectKey = 'post/demo/club-activity-guide.pdf';
  const originalName = '동아리-활동-안내.pdf';
  const uploadRoot = process.env.FILE_LOCAL_DIR || '/var/lib/jshsus/uploads';
  const filePath = join(uploadRoot, objectKey);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, demoPdf);

  const existing = await selectOne(
    connection,
    `SELECT id FROM files
     WHERE target_type = 'post' AND target_id = ? AND original_name = ? LIMIT 1`,
    [postId, originalName],
  );
  if (existing) {
    await connection.execute(
      `UPDATE files
       SET owner_id = ?, object_key = ?, mime_type = 'application/pdf', size_bytes = ?,
         file_visibility = 'public', updated_at = now(3)
       WHERE id = ?`,
      [ownerId, objectKey, demoPdf.length, existing.id],
    );
    return;
  }

  await connection.execute(
    `INSERT INTO files
      (owner_id, target_type, target_id, original_name, object_key, mime_type, size_bytes, file_visibility)
     VALUES (?, 'post', ?, ?, ?, 'application/pdf', ?, 'public')`,
    [ownerId, postId, originalName, objectKey, demoPdf.length],
  );
}

async function ensureJbsPost(connection, boardId, authorId, post) {
  const postId = await ensurePost(connection, boardId, authorId, {
    ...post,
    isAnonymous: false,
  });
  await connection.execute(
    `INSERT INTO jbs_videos (post_id, youtube_video_id, canonical_url)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE youtube_video_id = VALUES(youtube_video_id),
       canonical_url = VALUES(canonical_url), updated_at = now(3)`,
    [postId, post.youtubeVideoId, `https://www.youtube.com/watch?v=${post.youtubeVideoId}`],
  );
}

async function ensureWakeSongRequest(connection, requesterId, request) {
  const existing = await selectOne(
    connection,
    `SELECT id FROM wake_song_requests
     WHERE requester_id = ? AND youtube_video_id = ? AND request_note = ? LIMIT 1`,
    [requesterId, request.youtubeVideoId, request.requestNote],
  );
  const canonicalUrl = `https://www.youtube.com/watch?v=${request.youtubeVideoId}`;
  const reviewed = request.status !== 'PENDING';

  if (existing) {
    await connection.execute(
      `UPDATE wake_song_requests
       SET canonical_url = ?, video_title = ?, channel_title = ?, video_duration_seconds = ?,
         start_seconds = ?, end_seconds = ?, playback_rate_hundredths = ?,
         effective_duration_seconds = ?, wake_song_request_status = ?, reviewed_by_id = ?, reviewed_at = ?,
         rejection_reason = NULL, scheduled_at = ?, played_at = NULL, canceled_at = NULL,
         updated_at = now(3)
       WHERE id = ?`,
      [
        canonicalUrl,
        request.videoTitle,
        request.channelTitle,
        request.videoDurationSeconds,
        request.startSeconds,
        request.endSeconds,
        request.playbackRateHundredths,
        request.effectiveDurationSeconds,
        request.status,
        reviewed ? requesterId : null,
        reviewed ? daysFromNow(-1) : null,
        request.scheduledAt ?? null,
        existing.id,
      ],
    );
    return;
  }

  const [result] = await connection.execute(
    `INSERT INTO wake_song_requests
      (requester_id, youtube_video_id, canonical_url, video_title, channel_title,
       video_duration_seconds, start_seconds, end_seconds, playback_rate_hundredths,
       effective_duration_seconds, request_note, wake_song_request_status, reviewed_by_id, reviewed_at, scheduled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      requesterId,
      request.youtubeVideoId,
      canonicalUrl,
      request.videoTitle,
      request.channelTitle,
      request.videoDurationSeconds,
      request.startSeconds,
      request.endSeconds,
      request.playbackRateHundredths,
      request.effectiveDurationSeconds,
      request.requestNote,
      request.status,
      reviewed ? requesterId : null,
      reviewed ? daysFromNow(-1) : null,
      request.scheduledAt ?? null,
    ],
  );
  await connection.execute(
    `INSERT INTO wake_song_request_events
      (wake_song_request_id, actor_id, wake_song_request_event_type, note)
     VALUES (?, ?, 'SUBMITTED', '로컬 데모 신청')`,
    [result.insertId, requesterId],
  );
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

async function ensureSchoolDemoData(connection) {
  const fixtures = buildDemoStudents();
  const seededStudents = [];
  const studentRole = await selectOne(
    connection,
    "SELECT id FROM roles WHERE name = 'student' LIMIT 1",
  );
  if (!studentRole) throw new Error('The student role is missing; run all migrations first.');

  for (const fixture of fixtures) {
    await connection.execute(
      `INSERT INTO users
        (student_no, name, grade, class_no, number, email, phone, gender, user_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE name = VALUES(name), grade = VALUES(grade),
         class_no = VALUES(class_no), number = VALUES(number), email = VALUES(email),
         phone = VALUES(phone), gender = VALUES(gender), user_status = 'active',
         updated_at = now(3)`,
      [
        fixture.studentNo,
        fixture.name,
        fixture.grade,
        fixture.classNo,
        fixture.number,
        fixture.email,
        fixture.phone,
        fixture.gender,
      ],
    );
    const user = await selectOne(connection, 'SELECT id FROM users WHERE student_no = ? LIMIT 1', [
      fixture.studentNo,
    ]);
    await connection.execute(
      `INSERT INTO students
        (user_id, student_no, name, grade, class_no, number, current_point)
       VALUES (?, ?, ?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), name = VALUES(name),
         grade = VALUES(grade), class_no = VALUES(class_no), number = VALUES(number),
         updated_at = now(3)`,
      [user.id, fixture.studentNo, fixture.name, fixture.grade, fixture.classNo, fixture.number],
    );
    await connection.execute(`INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)`, [
      user.id,
      studentRole.id,
    ]);
    seededStudents.push({ ...fixture, userId: user.id });
  }

  for (const room of SONGJUK_ROOM_FIXTURES) {
    await connection.execute(
      `INSERT INTO dorm_rooms (name, capacity, grade, dorm_name)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE capacity = VALUES(capacity), grade = VALUES(grade),
         dorm_name = VALUES(dorm_name), updated_at = now(3)`,
      [room.name, room.capacity, room.grade, room.dormName],
    );
  }

  const roomNames = SONGJUK_ROOM_FIXTURES.map((room) => room.name);
  const roomPlaceholders = roomNames.map(() => '?').join(', ');
  const [roomRows] = await connection.execute(
    `SELECT id, name, capacity, grade, dorm_name AS dormName
     FROM dorm_rooms
     WHERE dorm_name = '송죽관' AND name IN (${roomPlaceholders})`,
    roomNames,
  );
  const { year, semester } = currentSchoolTerm();
  const userIds = seededStudents.map((student) => student.userId);
  const userPlaceholders = userIds.map(() => '?').join(', ');
  await connection.execute(
    `DELETE FROM dorm_assignments
     WHERE year = ? AND semester = ? AND user_id IN (${userPlaceholders})`,
    [year, semester, ...userIds],
  );

  const roomIds = roomRows.map((room) => room.id);
  const roomIdPlaceholders = roomIds.map(() => '?').join(', ');
  const [occupied] = await connection.execute(
    `SELECT da.room_id AS roomId, da.bed_position AS bedPosition, u.class_no AS classNo
     FROM dorm_assignments da
     INNER JOIN users u ON u.id = da.user_id
     WHERE da.year = ? AND da.semester = ? AND da.room_id IN (${roomIdPlaceholders})`,
    [year, semester, ...roomIds],
  );
  const dormPlan = allocateMaleDormAssignments({
    students: seededStudents,
    rooms: roomRows,
    occupied,
  });
  for (const assignment of dormPlan.assignments) {
    await connection.execute(
      `INSERT INTO dorm_assignments (room_id, user_id, year, semester, bed_position)
       VALUES (?, ?, ?, ?, ?)`,
      [assignment.roomId, assignment.userId, year, semester, assignment.bedPosition],
    );
  }

  return {
    studentCount: seededStudents.length,
    assignedMaleCount: dormPlan.assignments.length,
    overflowMaleCount: dormPlan.overflow.length,
    unassignedFemaleCount: dormPlan.skippedFemale.length,
    year,
    semester,
  };
}

async function ensurePointData(connection, userId) {
  const student = await selectOne(connection, 'SELECT id FROM students WHERE user_id = ? LIMIT 1', [
    userId,
  ]);
  if (!student) throw new Error('The demo student profile is missing.');

  const teacherStaffNo = Number(process.env.DEMO_TEACHER_STAFF_NO || 900001);
  let teacher = await selectOne(
    connection,
    `SELECT u.id FROM staff_profiles s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.staff_no = ? LIMIT 1`,
    [teacherStaffNo],
  );
  if (!teacher) {
    const [result] = await connection.execute(
      `INSERT INTO users (student_no, name, user_status)
       VALUES (?, '데모 담당교사', 'active')`,
      [-teacherStaffNo],
    );
    teacher = { id: result.insertId };
    await connection.execute(
      `INSERT INTO staff_profiles (user_id, staff_no, name, department, title)
       VALUES (?, ?, '데모 담당교사', '학생관리부', '담당교사')`,
      [teacher.id, teacherStaffNo],
    );
    await connection.execute(
      `INSERT IGNORE INTO user_roles (user_id, role_id)
       SELECT ?, id FROM roles WHERE name = 'teacher'`,
      [teacher.id],
    );
  } else {
    await connection.execute(
      `UPDATE users SET student_no = ?, name = '데모 담당교사', user_status = 'active',
         updated_at = now(3) WHERE id = ?`,
      [-teacherStaffNo, teacher.id],
    );
    await connection.execute(
      `UPDATE staff_profiles SET name = '데모 담당교사', department = '학생관리부',
         title = '담당교사', updated_at = now(3) WHERE user_id = ?`,
      [teacher.id],
    );
  }

  const records = [
    {
      type: 'PLUS',
      point: 3,
      reason: '교내 봉사활동 참여',
      comment: '데모 데이터: 교내 행사 운영 지원',
      baseDate: daysFromNow(-5),
    },
    {
      type: 'MINUS',
      point: -1,
      reason: '생활 규정 미준수',
      comment: '데모 데이터: 생활지도 확인',
      baseDate: daysFromNow(-12),
    },
    {
      type: 'PLUS',
      point: 2,
      reason: '공동체 활동 기여',
      comment: '데모 데이터: 학급 환경 정리 참여',
      baseDate: daysFromNow(-20),
    },
  ];

  for (const record of records) {
    await connection.execute(
      `INSERT INTO point_reasons (point_reason_type, point, comment, is_active)
       SELECT ?, ?, ?, 1
       WHERE NOT EXISTS (SELECT 1 FROM point_reasons WHERE comment = ? LIMIT 1)`,
      [record.type, record.point, record.reason, record.reason],
    );
    const reason = await selectOne(
      connection,
      'SELECT id FROM point_reasons WHERE comment = ? LIMIT 1',
      [record.reason],
    );
    const existing = await selectOne(
      connection,
      `SELECT id FROM point_records
       WHERE student_id = ? AND comment = ? LIMIT 1`,
      [student.id, record.comment],
    );
    if (existing) {
      await connection.execute(
        `UPDATE point_records
         SET teacher_id = ?, reason_id = ?, reason_type = ?, reason_text = ?, point = ?,
           base_date = ?, canceled_at = NULL,
           restored_at = NULL, updated_at = now(3)
         WHERE id = ?`,
        [
          teacher.id,
          reason.id,
          record.type,
          record.reason,
          record.point,
          record.baseDate,
          existing.id,
        ],
      );
    } else {
      await connection.execute(
        `INSERT INTO point_records
          (student_id, teacher_id, reason_id, reason_type, reason_text, point, comment, base_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          student.id,
          teacher.id,
          reason.id,
          record.type,
          record.reason,
          record.point,
          record.comment,
          record.baseDate,
        ],
      );
    }
  }

  await connection.execute(
    `UPDATE students
     SET current_point = (
       SELECT COALESCE(SUM(point), 0) FROM point_records
       WHERE student_id = ? AND canceled_at IS NULL
     ), updated_at = now(3)
     WHERE id = ?`,
    [student.id, student.id],
  );
}

async function main() {
  const connection = await mysql.createConnection(seedConnectionOptions(databaseUrl));
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
       VALUES ('free', '자유게시판', '학생들이 자유롭게 의견을 나누는 게시판', 'public', 0)
       ON DUPLICATE KEY UPDATE visibility = 'public', allow_anonymous = 0,
         description = VALUES(description), updated_at = now(3)`,
    );
    const board = await selectOne(connection, "SELECT id FROM boards WHERE slug = 'free' LIMIT 1");

    await connection.execute(
      `INSERT INTO boards (slug, name, description, visibility, allow_anonymous)
       VALUES ('jbs', 'JBS', '방송부가 전하는 학교 영상과 소식', 'public', 0)
       ON DUPLICATE KEY UPDATE visibility = 'public', allow_anonymous = 0,
         description = VALUES(description), updated_at = now(3)`,
    );
    const jbsBoard = await selectOne(
      connection,
      "SELECT id FROM boards WHERE slug = 'jbs' LIMIT 1",
    );

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
        isAnonymous: false,
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
        contentDoc: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: '이번 주 동아리 활동 사진을 정리했습니다. 참여한 친구들 모두 수고했어요.',
                },
              ],
            },
            {
              type: 'image',
              attrs: {
                src: '/images/demo-club-activity.svg',
                alt: '과학 동아리 활동 예시 이미지',
                title: '과학 동아리 활동 기록',
              },
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: '첨부된 안내 PDF도 함께 확인해 주세요.',
                },
              ],
            },
          ],
        },
        isAnonymous: false,
        viewCount: 58,
        commentCount: 2,
        comments: ['사진 잘 나왔네요!', '다음 활동도 기대됩니다.'],
        createdAt: daysFromNow(-3),
      },
    ];
    for (const post of posts) {
      const postId = await ensurePost(connection, board.id, user.id, post);
      if (post.title === '동아리 활동 사진 공유합니다') {
        await ensureDemoPostAttachment(connection, user.id, postId);
      }
    }

    const jbsPosts = [
      {
        title: 'JBS 주간 소식 예고',
        content: '이번 주 교내 소식과 학생 활동을 짧은 영상으로 전합니다.',
        youtubeVideoId: 'M7lc1UVf-VE',
        viewCount: 84,
        commentCount: 2,
        comments: ['다음 영상도 기대할게요.', '소식 정리 감사합니다.'],
        createdAt: daysFromNow(-2),
      },
      {
        title: '교내 행사 스케치',
        content: '학생들이 함께 준비한 교내 행사의 주요 장면을 모았습니다.',
        youtubeVideoId: 'aqz-KE-bpKQ',
        viewCount: 57,
        commentCount: 1,
        comments: ['행사 분위기가 잘 담겼네요.'],
        createdAt: daysFromNow(-7),
      },
    ];
    for (const post of jbsPosts) await ensureJbsPost(connection, jbsBoard.id, user.id, post);

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

    const wakeSongRequests = [
      {
        youtubeVideoId: 'M7lc1UVf-VE',
        videoTitle: '아침 방송 신청곡 데모 1',
        channelTitle: 'YouTube Developers',
        videoDurationSeconds: 240,
        startSeconds: 10,
        endSeconds: 130,
        playbackRateHundredths: 100,
        effectiveDurationSeconds: 120,
        requestNote: '로컬 화면 확인용 승인 대기 신청',
        status: 'PENDING',
      },
      {
        youtubeVideoId: 'aqz-KE-bpKQ',
        videoTitle: '아침 방송 신청곡 데모 2',
        channelTitle: 'Blender Foundation',
        videoDurationSeconds: 634,
        startSeconds: 30,
        endSeconds: 150,
        playbackRateHundredths: 100,
        effectiveDurationSeconds: 120,
        requestNote: '로컬 화면 확인용 승인 완료 신청',
        status: 'APPROVED',
      },
      {
        youtubeVideoId: 'M7lc1UVf-VE',
        videoTitle: '아침 방송 신청곡 데모 3',
        channelTitle: 'YouTube Developers',
        videoDurationSeconds: 240,
        startSeconds: 20,
        endSeconds: 110,
        playbackRateHundredths: 100,
        effectiveDurationSeconds: 90,
        requestNote: '로컬 화면 확인용 편성 신청',
        status: 'SCHEDULED',
        scheduledAt: daysFromNow(2),
      },
    ];
    for (const request of wakeSongRequests) {
      await ensureWakeSongRequest(connection, user.id, request);
    }

    await ensurePointData(connection, user.id);
    const schoolDemo = await ensureSchoolDemoData(connection);

    await connection.commit();
    console.log(
      `Demo data ready: ${schoolDemo.studentCount} students; ` +
        `${schoolDemo.assignedMaleCount} Songjuk assignments; ` +
        `${schoolDemo.overflowMaleCount} male overflow; ` +
        `${schoolDemo.unassignedFemaleCount} female students intentionally unassigned ` +
        `for ${schoolDemo.year}-${schoolDemo.semester}.`,
    );
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
