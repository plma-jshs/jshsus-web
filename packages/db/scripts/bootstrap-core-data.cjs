const mysql = require('mysql2/promise');
const { seedConnectionOptions } = require('./seed-connection.cjs');

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
    await upsertActiveSchoolYear(connection, schoolYear);
    await connection.commit();
    return { schoolYear };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
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
  bootstrapCoreData,
  resolveActiveSchoolYear,
};
