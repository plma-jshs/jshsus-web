INSERT INTO `roles` (`name`, `label`) VALUES
  ('system_admin', '시스템 관리자'),
  ('student_affairs_head', '학생부장'),
  ('teacher', '교사'),
  ('student_council', '학생회'),
  ('student', '학생')
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`), `updated_at` = now(3);--> statement-breakpoint

INSERT INTO `permissions` (`name`, `label`, `description`) VALUES
  ('content.manage', '콘텐츠 관리', '공지, 게시판, 신고 및 분실물을 관리합니다.'),
  ('petitions.answer', '청원 답변', '기준을 충족한 청원에 공식 답변을 작성합니다.'),
  ('activity.review', '탐활서 승인', '탐구활동서를 승인하거나 반려합니다.'),
  ('points.manage', '상벌점 관리', '상벌점 원장을 생성, 취소 및 복원합니다.'),
  ('dorm.manage', '기숙사 관리', '호실 배정과 기숙사 민원을 관리합니다.'),
  ('devices.manage', '보관함 관리', '휴대폰 보관함 상태와 기존 명령 이력을 조회합니다.'),
  ('users.manage', '사용자 관리', '학생과 교직원 프로필을 관리합니다.'),
  ('iam.manage', 'IAM 관리', '역할과 권한을 관리합니다.'),
  ('audit.read', '감사 로그 조회', '관리자 작업 감사 로그를 조회합니다.')
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`), `description` = VALUES(`description`), `updated_at` = now(3);--> statement-breakpoint

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r CROSS JOIN `permissions` p
WHERE r.name = 'system_admin';--> statement-breakpoint

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
  ON p.name IN ('content.manage', 'petitions.answer', 'activity.review', 'points.manage', 'dorm.manage', 'devices.manage', 'users.manage', 'audit.read')
WHERE r.name = 'student_affairs_head';--> statement-breakpoint

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
  ON p.name IN ('content.manage', 'activity.review')
WHERE r.name = 'teacher';--> statement-breakpoint

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
  ON p.name IN ('content.manage', 'petitions.answer')
WHERE r.name = 'student_council';
--> statement-breakpoint
UPDATE `boards` SET `visibility` = 'public', `updated_at` = now(3) WHERE `slug` = 'free';
