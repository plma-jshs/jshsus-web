import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  assertRoleAssignmentAllowed,
  assertStudentGradeUpdateAllowed,
  assertStudentNumberPartsMatch,
  assertUserStatusChangeAllowed,
  deriveStudentNumberParts,
  normalizeStudentGender,
} from './identity.policy';

describe('normalizeStudentGender', () => {
  it.each([
    ['male', 'male'],
    ['M', 'male'],
    ['남', 'male'],
    ['남자', 'male'],
    ['female', 'female'],
    ['F', 'female'],
    ['여', 'female'],
    ['여성', 'female'],
  ] as const)('normalizes %s to %s', (input, expected) => {
    expect(normalizeStudentGender(input)).toBe(expected);
  });

  it('rejects missing and unsupported values', () => {
    expect(normalizeStudentGender(undefined)).toBeUndefined();
    expect(normalizeStudentGender('')).toBeUndefined();
    expect(normalizeStudentGender('unknown')).toBeUndefined();
  });
});

const base = {
  isStudent: true,
  isStaff: false,
  selectedRoleNames: new Set(['student']),
  currentRoleNames: new Set(['student']),
  actorIsTarget: false,
  systemAdminCount: 2,
};

describe('assertRoleAssignmentAllowed', () => {
  it('keeps the identity baseline role', () => {
    expect(() => assertRoleAssignmentAllowed({ ...base, selectedRoleNames: new Set() })).toThrow(
      BadRequestException,
    );
  });

  it('only assigns the student-affairs-head role to staff', () => {
    expect(() =>
      assertRoleAssignmentAllowed({
        ...base,
        selectedRoleNames: new Set(['student', 'student_affairs_head']),
      }),
    ).toThrow(BadRequestException);
  });

  it('prevents removing your own system administrator role', () => {
    expect(() =>
      assertRoleAssignmentAllowed({
        ...base,
        currentRoleNames: new Set(['student', 'system_admin']),
        actorIsTarget: true,
      }),
    ).toThrow(ForbiddenException);
  });

  it('prevents removing the final system administrator', () => {
    expect(() =>
      assertRoleAssignmentAllowed({
        ...base,
        currentRoleNames: new Set(['student', 'system_admin']),
        systemAdminCount: 1,
      }),
    ).toThrow(BadRequestException);
  });

  it('allows a staff member to receive the student-affairs-head role', () => {
    expect(() =>
      assertRoleAssignmentAllowed({
        ...base,
        isStudent: false,
        isStaff: true,
        selectedRoleNames: new Set(['teacher', 'student_affairs_head']),
        currentRoleNames: new Set(['teacher']),
      }),
    ).not.toThrow();
  });
});

describe('assertUserStatusChangeAllowed', () => {
  const statusBase = {
    actorIsTarget: false,
    currentStatus: 'active' as const,
    nextStatus: 'restricted' as const,
    currentRoleNames: new Set(['student']),
    activeSystemAdminCount: 2,
  };

  it('prevents restricting your own account', () => {
    expect(() => assertUserStatusChangeAllowed({ ...statusBase, actorIsTarget: true })).toThrow(
      ForbiddenException,
    );
  });

  it('prevents restricting the final active system administrator', () => {
    expect(() =>
      assertUserStatusChangeAllowed({
        ...statusBase,
        currentRoleNames: new Set(['system_admin']),
        activeSystemAdminCount: 1,
      }),
    ).toThrow(BadRequestException);
  });

  it('allows reactivating your own account', () => {
    expect(() =>
      assertUserStatusChangeAllowed({
        ...statusBase,
        actorIsTarget: true,
        nextStatus: 'active',
      }),
    ).not.toThrow();
  });
});

describe('assertStudentGradeUpdateAllowed', () => {
  it('lets the existing grade-9 test fixture retain grade 9', () => {
    expect(() => assertStudentGradeUpdateAllowed({ currentGrade: 9, nextGrade: 9 })).not.toThrow();
  });

  it('does not let a regular student become grade 9', () => {
    expect(() => assertStudentGradeUpdateAllowed({ currentGrade: 3, nextGrade: 9 })).toThrow(
      BadRequestException,
    );
  });

  it('continues to allow operational grades 1 through 3', () => {
    expect(() => assertStudentGradeUpdateAllowed({ currentGrade: 9, nextGrade: 1 })).not.toThrow();
  });
});

describe('deriveStudentNumberParts', () => {
  it.each([
    [1101, 1, 1, 1],
    [1420, 1, 4, 20],
    [2307, 2, 3, 7],
    [3420, 3, 4, 20],
  ])('derives %i as grade %i class %i number %i', (studentNo, grade, classNo, number) => {
    expect(deriveStudentNumberParts(studentNo)).toEqual({ studentNo, grade, classNo, number });
  });

  it.each([9999, 1001, 1501, 2100, 3421, 4101, 1101.5])(
    'rejects an invalid operational student number (%s)',
    (studentNo) => {
      expect(() => deriveStudentNumberParts(studentNo)).toThrow(BadRequestException);
    },
  );

  it('only allows 9999 when editing the existing test fixture', () => {
    expect(deriveStudentNumberParts(9999, { allowTestFixture: true })).toEqual({
      studentNo: 9999,
      grade: 9,
      classNo: 9,
      number: 99,
    });
    expect(() => deriveStudentNumberParts(9999)).toThrow(BadRequestException);
  });
});

describe('assertStudentNumberPartsMatch', () => {
  const expected = deriveStudentNumberParts(2317);

  it('accepts omitted or matching derived fields', () => {
    expect(() => assertStudentNumberPartsMatch(expected, {})).not.toThrow();
    expect(() =>
      assertStudentNumberPartsMatch(expected, { grade: 2, classNo: 3, number: 17 }),
    ).not.toThrow();
  });

  it.each([{ grade: 3 }, { classNo: 4 }, { number: 18 }])(
    'rejects inconsistent derived fields: %o',
    (provided) => {
      expect(() => assertStudentNumberPartsMatch(expected, provided)).toThrow(BadRequestException);
    },
  );
});
