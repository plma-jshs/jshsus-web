import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AdminUserStatus, StudentGender } from '@jshsus/types';

const MALE_GENDER_VALUES = new Set(['0', 'm', 'male', 'man', '남', '남자', '남성']);
const FEMALE_GENDER_VALUES = new Set(['1', 'f', 'female', 'woman', '여', '여자', '여성']);
export type StoredStudentGender = '0' | '1';

export function normalizeStudentGender(value: unknown): StudentGender | undefined {
  if (value === 0 || value === '0') return 'male';
  if (value === 1 || value === '1') return 'female';
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLocaleLowerCase('ko-KR');
  if (MALE_GENDER_VALUES.has(normalized)) return 'male';
  if (FEMALE_GENDER_VALUES.has(normalized)) return 'female';
  return undefined;
}

export function toStoredStudentGender(value: StudentGender): StoredStudentGender {
  return value === 'female' ? '1' : '0';
}

export function normalizePhoneNumber(value: unknown): string | undefined {
  if (value === undefined || value === null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('10')) return `0${digits}`;
  if (digits.length === 11 && digits.startsWith('010')) return digits;
  return undefined;
}

export function assertStudentGradeUpdateAllowed(input: {
  currentGrade: number;
  nextGrade?: number;
}) {
  if (input.nextGrade === undefined || (input.nextGrade >= 1 && input.nextGrade <= 3)) return;
  if (input.currentGrade === 9 && input.nextGrade === 9) return;
  throw new BadRequestException('Only the existing grade-9 test fixture may retain grade 9.');
}

export type StudentNumberParts = {
  studentNo: number;
  grade: number;
  classNo: number;
  number: number;
};

export function deriveStudentNumberParts(
  studentNo: number,
  options: { allowTestFixture?: boolean } = {},
): StudentNumberParts {
  if (options.allowTestFixture && studentNo === 9999) {
    return { studentNo, grade: 9, classNo: 9, number: 99 };
  }

  const grade = Math.floor(studentNo / 1000);
  const classNo = Math.floor((studentNo % 1000) / 100);
  const number = studentNo % 100;
  if (
    !Number.isInteger(studentNo) ||
    grade < 1 ||
    grade > 3 ||
    classNo < 1 ||
    classNo > 4 ||
    number < 1 ||
    number > 20
  ) {
    throw new BadRequestException(
      'Student number must encode grade 1-3, class 1-4, and number 1-20.',
    );
  }

  return { studentNo, grade, classNo, number };
}

export function assertStudentNumberPartsMatch(
  expected: StudentNumberParts,
  provided: Partial<Pick<StudentNumberParts, 'grade' | 'classNo' | 'number'>>,
) {
  const mismatched = (['grade', 'classNo', 'number'] as const).some(
    (key) => provided[key] !== undefined && provided[key] !== expected[key],
  );
  if (mismatched) {
    throw new BadRequestException(
      'Grade, class, and number must match the values encoded in the student number.',
    );
  }
}

export function assertUserStatusChangeAllowed(input: {
  actorIsTarget: boolean;
  currentStatus: AdminUserStatus;
  nextStatus: Exclude<AdminUserStatus, 'deleted'>;
  currentRoleNames: ReadonlySet<string>;
  activeSystemAdminCount: number;
}) {
  if (input.nextStatus === 'active') return;
  if (input.actorIsTarget) {
    throw new ForbiddenException('You cannot restrict your own account.');
  }
  if (
    input.currentStatus === 'active' &&
    input.currentRoleNames.has('system_admin') &&
    input.activeSystemAdminCount <= 1
  ) {
    throw new BadRequestException('At least one active system administrator must remain.');
  }
}

export function assertRoleAssignmentAllowed(input: {
  isStudent: boolean;
  isStaff: boolean;
  selectedRoleNames: ReadonlySet<string>;
  currentRoleNames: ReadonlySet<string>;
  actorIsTarget: boolean;
  systemAdminCount: number;
}) {
  if (input.isStudent && !input.selectedRoleNames.has('student')) {
    throw new BadRequestException('Student accounts must retain the student role.');
  }
  if (input.isStaff && !input.selectedRoleNames.has('teacher')) {
    throw new BadRequestException('Staff accounts must retain the teacher role.');
  }
  if (!input.isStaff && input.selectedRoleNames.has('student_affairs_head')) {
    throw new BadRequestException('The student-affairs-head role can only be assigned to staff.');
  }

  const removesSystemAdmin =
    input.currentRoleNames.has('system_admin') && !input.selectedRoleNames.has('system_admin');
  if (!removesSystemAdmin) return;
  if (input.actorIsTarget) {
    throw new ForbiddenException('You cannot remove your own system-admin role.');
  }
  if (input.systemAdminCount <= 1) {
    throw new BadRequestException('At least one system administrator must remain.');
  }
}
