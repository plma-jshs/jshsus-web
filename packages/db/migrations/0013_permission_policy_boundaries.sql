INSERT INTO `permissions` (`name`, `label`, `description`) VALUES
  ('notices.manage', '공지 관리', '공지를 작성, 수정, 고정 및 삭제합니다.'),
  ('school_events.manage', '학사일정 관리', '학사일정을 작성, 수정 및 삭제합니다.'),
  ('community.manage', '커뮤니티 관리', '게시글, 댓글 및 신고를 관리합니다.'),
  ('lost_items.manage', '분실물 관리', '분실물 게시물과 처리 상태를 관리합니다.'),
  ('points.issue', '상벌점 부여', '학생과 사유를 조회하고 상벌점을 부여합니다.')
ON DUPLICATE KEY UPDATE
  `label` = VALUES(`label`),
  `description` = VALUES(`description`),
  `updated_at` = now(3);--> statement-breakpoint

-- Built-in roles are product policy. Custom roles and direct user grants are intentionally untouched.
DELETE rp
FROM `role_permissions` rp
JOIN `roles` r ON r.id = rp.role_id
WHERE r.name IN (
  'student',
  'teacher',
  'student_council',
  'broadcast_club',
  'student_affairs_head',
  'system_admin'
);--> statement-breakpoint

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
JOIN `permissions` p ON
  (r.name = 'teacher' AND p.name IN ('activity.review', 'points.issue'))
  OR (r.name = 'student_council' AND p.name IN (
    'notices.manage',
    'community.manage',
    'lost_items.manage',
    'petitions.answer'
  ))
  OR (r.name = 'broadcast_club' AND p.name = 'jbs.publish')
  OR (r.name = 'student_affairs_head' AND p.name IN (
    'activity.review',
    'points.issue',
    'points.manage',
    'dorm.manage',
    'devices.manage',
    'wake_songs.review'
  ));
--> statement-breakpoint
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
CROSS JOIN `permissions` p
WHERE r.name = 'system_admin';
