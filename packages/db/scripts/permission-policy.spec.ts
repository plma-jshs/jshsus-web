import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  BUILT_IN_ROLE_NAMES,
  CORE_BOARDS,
  CORE_PERMISSIONS,
  CORE_ROLES,
  CORE_ROLE_PERMISSION_NAMES,
  resolveActiveSchoolYear,
} = require('./bootstrap-core-data.cjs') as {
  BUILT_IN_ROLE_NAMES: string[];
  CORE_BOARDS: Array<[string, string, string, string, number]>;
  CORE_PERMISSIONS: Array<[string, string, string]>;
  CORE_ROLES: Array<[string, string]>;
  CORE_ROLE_PERMISSION_NAMES: Record<string, string[]>;
  resolveActiveSchoolYear: (environment?: Record<string, string | undefined>, now?: Date) => number;
};

describe('core permission bootstrap policy', () => {
  const permissionNames = CORE_PERMISSIONS.map(([name]) => name);
  const roleNames = CORE_ROLES.map(([name]) => name);

  it.each([
    'notices.manage',
    'school_events.manage',
    'community.manage',
    'lost_items.manage',
    'points.issue',
    'jbs.publish',
    'wake_songs.review',
  ])('registers %s', (permission) => {
    expect(permissionNames).toContain(permission);
  });

  it('declares every product-managed built-in role', () => {
    expect(BUILT_IN_ROLE_NAMES).toEqual([
      'system_admin',
      'student_affairs_head',
      'teacher',
      'student_council',
      'broadcast_club',
      'student',
    ]);
    expect(roleNames).toEqual(BUILT_IN_ROLE_NAMES);
  });

  it('rebuilds the least-privilege built-in policies', () => {
    expect(CORE_ROLE_PERMISSION_NAMES.teacher).toEqual(['activity.review', 'points.issue']);
    expect(CORE_ROLE_PERMISSION_NAMES.student_council).toEqual([
      'notices.manage',
      'community.manage',
      'lost_items.manage',
      'petitions.answer',
    ]);
    expect(CORE_ROLE_PERMISSION_NAMES.broadcast_club).toEqual(['jbs.publish']);
    expect(CORE_ROLE_PERMISSION_NAMES.student_affairs_head).toEqual([
      'activity.review',
      'points.issue',
      'points.manage',
      'dorm.manage',
      'devices.manage',
      'wake_songs.review',
    ]);
  });

  it('keeps system administrators synchronized with the full permission catalog', () => {
    expect(CORE_ROLE_PERMISSION_NAMES.system_admin).toBeUndefined();
    expect(permissionNames).toContain('iam.manage');
    expect(permissionNames).toContain('audit.read');
  });

  it('creates the public boards required by board and JBS routes', () => {
    expect(CORE_BOARDS.map(([slug]) => slug)).toEqual(['free', 'jbs']);
    expect(
      CORE_BOARDS.every(
        ([, , , visibility, allowAnonymous]) => visibility === 'public' && allowAnonymous === 0,
      ),
    ).toBe(true);
  });

  it('uses a configured active school year when supplied', () => {
    expect(resolveActiveSchoolYear({ ACTIVE_SCHOOL_YEAR: '2027' })).toBe(2027);
  });

  it('falls back to the current calendar year for fresh environments', () => {
    expect(resolveActiveSchoolYear({}, new Date('2026-07-20T00:00:00+09:00'))).toBe(2026);
  });
});
