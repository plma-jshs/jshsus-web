import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type DemoStudent = {
  userId?: number;
  studentNo: number;
  grade: number;
  classNo: number;
  number: number;
  gender: '남' | '여';
};

type DormRoom = {
  id: number;
  name: string;
  capacity: number;
  grade: number;
  dormName: '송죽관';
};

const requireCjs = createRequire(
  `${process.cwd()}/packages/db/scripts/demo-school-fixtures.spec.ts`,
);
const { SONGJUK_ROOM_FIXTURES, allocateMaleDormAssignments, buildDemoStudents } = requireCjs(
  './demo-school-fixtures.cjs',
) as {
  SONGJUK_ROOM_FIXTURES: Omit<DormRoom, 'id'>[];
  buildDemoStudents: () => DemoStudent[];
  allocateMaleDormAssignments: (input: { students: DemoStudent[]; rooms: DormRoom[] }) => {
    assignments: Array<{
      userId: number;
      studentNo: number;
      grade: number;
      classNo: number;
      roomId: number;
      dormName: '송죽관';
      bedPosition: number;
    }>;
    overflow: DemoStudent[];
    skippedFemale: DemoStudent[];
  };
};

describe('local school demo fixtures', () => {
  it('creates 20-person first and second grade classes and 15-person third grade classes', () => {
    const students = buildDemoStudents();

    expect(students).toHaveLength(220);
    expect(students[0]?.studentNo).toBe(1101);
    expect(students.at(-1)?.studentNo).toBe(3415);
    expect(new Set(students.map((student) => student.studentNo))).toHaveLength(220);

    for (let grade = 1; grade <= 3; grade += 1) {
      for (let classNo = 1; classNo <= 4; classNo += 1) {
        const classStudents = students.filter(
          (student) => student.grade === grade && student.classNo === classNo,
        );
        const expectedClassSize = grade === 3 ? 15 : 20;
        const expectedFemaleCount = grade === 3 ? 1 : 4;
        expect(classStudents).toHaveLength(expectedClassSize);
        expect(classStudents.map((student) => student.number)).toEqual(
          Array.from({ length: expectedClassSize }, (_, index) => index + 1),
        );
        expect(classStudents.filter((student) => student.gender === '남')).toHaveLength(
          expectedClassSize - expectedFemaleCount,
        );
        expect(classStudents.filter((student) => student.gender === '여')).toHaveLength(
          expectedFemaleCount,
        );
      }
    }
  });

  it('assigns only eligible male students and explicitly leaves overflow unassigned', () => {
    const students = buildDemoStudents().map((student, index) => ({
      ...student,
      userId: index + 1,
    }));
    const rooms = SONGJUK_ROOM_FIXTURES.map((room, index) => ({ ...room, id: index + 1 }));
    const result = allocateMaleDormAssignments({ students, rooms });

    expect(result.assignments).toHaveLength(170);
    expect(result.overflow).toHaveLength(14);
    expect(result.skippedFemale).toHaveLength(36);
    expect(result.assignments.every((assignment) => assignment.dormName === '송죽관')).toBe(true);

    const studentById = new Map(students.map((student) => [student.userId, student]));
    const roomById = new Map(rooms.map((room) => [room.id, room]));
    const beds = new Set<string>();
    const classesByRoom = new Map<number, Set<number>>();
    for (const assignment of result.assignments) {
      const student = studentById.get(assignment.userId);
      const room = roomById.get(assignment.roomId);
      expect(student?.gender).toBe('남');
      expect(student?.grade).toBe(room?.grade);
      expect(assignment.bedPosition).toBeGreaterThanOrEqual(1);
      expect(assignment.bedPosition).toBeLessThanOrEqual(room?.capacity ?? 0);

      const bedKey = `${assignment.roomId}:${assignment.bedPosition}`;
      expect(beds.has(bedKey)).toBe(false);
      beds.add(bedKey);

      const classNumbers = classesByRoom.get(assignment.roomId) ?? new Set<number>();
      expect(classNumbers.has(assignment.classNo)).toBe(false);
      classNumbers.add(assignment.classNo);
      classesByRoom.set(assignment.roomId, classNumbers);
    }
  });
});
