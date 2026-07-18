import { describe, expect, it } from 'vitest';
import {
  dormNameForGender,
  generateDormDraw,
  validateDormPlacements,
  type DormDrawRoom,
  type DormDrawStudent,
} from './dorm-draw.policy';

const rooms: DormDrawRoom[] = [
  { id: 1, name: '201', dormName: '송죽관', grade: 2, capacity: 4 },
  { id: 2, name: '202', dormName: '송죽관', grade: 2, capacity: 4 },
  { id: 3, name: '201', dormName: '동백관', grade: 2, capacity: 4 },
];

const students: DormDrawStudent[] = [
  { userId: 1, studentNo: 2101, name: '가', grade: 2, classNo: 1, gender: '남' },
  { userId: 2, studentNo: 2201, name: '나', grade: 2, classNo: 2, gender: 'male' },
  { userId: 3, studentNo: 2301, name: '다', grade: 2, classNo: 3, gender: 'M' },
  { userId: 4, studentNo: 2401, name: '라', grade: 2, classNo: 4, gender: '남자' },
  { userId: 5, studentNo: 2102, name: '마', grade: 2, classNo: 1, gender: '여' },
];

describe('dorm draw policy', () => {
  it('normalizes supported gender values to the correct dorm', () => {
    expect(dormNameForGender('male')).toBe('송죽관');
    expect(dormNameForGender('여성')).toBe('동백관');
    expect(dormNameForGender(null)).toBeUndefined();
  });

  it('respects dorm gender, room grade, capacity, class and roommate blocks', () => {
    const result = generateDormDraw({
      rooms,
      students,
      blocks: [{ studentUserId: 1, blockedUserId: 2 }],
      seed: 42,
    });

    expect(result.unassigned).toHaveLength(0);
    expect(result.violations).toHaveLength(0);
    const malePlacements = result.placements.filter((placement) => placement.userId <= 4);
    expect(new Set(malePlacements.map((placement) => placement.roomId)).size).toBeGreaterThan(1);
    expect(result.placements.find((placement) => placement.userId === 5)?.roomId).toBe(3);
  });

  it('reports invalid manual placement constraints', () => {
    const violations = validateDormPlacements({
      rooms,
      students,
      blocks: [{ studentUserId: 1, blockedUserId: 2 }],
      placements: [
        { userId: 1, roomId: 1, bedPosition: 1 },
        { userId: 2, roomId: 1, bedPosition: 2 },
        { userId: 5, roomId: 1, bedPosition: 3 },
      ],
    });

    expect(violations.map((violation) => violation.code)).toContain('ROOMMATE_BLOCK');
    expect(violations.map((violation) => violation.code)).toContain('GENDER_MISMATCH');
  });

  it('rejects students from the same class in one room', () => {
    const classmate: DormDrawStudent = {
      userId: 6,
      studentNo: 2103,
      name: '바',
      grade: 2,
      classNo: 1,
      gender: '남',
    };
    const violations = validateDormPlacements({
      rooms,
      students: [...students, classmate],
      blocks: [],
      placements: [
        { userId: 1, roomId: 1, bedPosition: 1 },
        { userId: 6, roomId: 1, bedPosition: 2 },
      ],
    });

    expect(violations.map((violation) => violation.code)).toContain('SAME_CLASS');
  });

  it('keeps fixed occupants and their beds out of the redraw', () => {
    const result = generateDormDraw({
      rooms,
      students,
      blocks: [{ studentUserId: 1, blockedUserId: 2 }],
      fixedPlacements: [{ userId: 1, roomId: 1, bedPosition: 2 }],
      seed: 42,
    });

    expect(result.placements).toContainEqual({ userId: 1, roomId: 1, bedPosition: 2 });
    expect(result.placements.find((placement) => placement.userId === 2)?.roomId).toBe(2);
    expect(
      new Set(result.placements.map((placement) => `${placement.roomId}:${placement.bedPosition}`))
        .size,
    ).toBe(result.placements.length);
    expect(result.violations).toHaveLength(0);
  });
});
