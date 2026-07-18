import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'packages/db/migrations/0013_permission_policy_boundaries.sql'),
  'utf8',
).replace(/\s+/g, ' ');

describe('built-in role permission migration', () => {
  it.each([
    'notices.manage',
    'school_events.manage',
    'community.manage',
    'lost_items.manage',
    'points.issue',
  ])('registers %s', (permission) => {
    expect(migration).toContain(`('${permission}',`);
  });

  it('clears only the named built-in role assignments', () => {
    expect(migration).toContain(
      "WHERE r.name IN ( 'student', 'teacher', 'student_council', 'broadcast_club', 'student_affairs_head', 'system_admin' )",
    );
    expect(migration).toContain('Custom roles and direct user grants are intentionally untouched.');
  });

  it('rebuilds the least-privilege built-in policies', () => {
    expect(migration).toContain(
      "r.name = 'teacher' AND p.name IN ('activity.review', 'points.issue')",
    );
    expect(migration).toContain(
      "r.name = 'student_council' AND p.name IN ( 'notices.manage', 'community.manage', 'lost_items.manage', 'petitions.answer' )",
    );
    expect(migration).toContain("r.name = 'broadcast_club' AND p.name = 'jbs.publish'");
    expect(migration).toContain(
      "r.name = 'student_affairs_head' AND p.name IN ( 'activity.review', 'points.issue', 'points.manage', 'dorm.manage', 'devices.manage', 'wake_songs.review' )",
    );
  });

  it('keeps system administrators synchronized with the full catalog', () => {
    expect(migration).toContain("CROSS JOIN `permissions` p WHERE r.name = 'system_admin'");
  });
});
