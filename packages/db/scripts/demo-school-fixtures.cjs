const SURNAMES = [
  '김',
  '이',
  '박',
  '최',
  '정',
  '강',
  '조',
  '윤',
  '장',
  '임',
  '한',
  '오',
  '서',
  '신',
  '권',
  '황',
  '안',
  '송',
  '전',
  '홍',
];

const GIVEN_NAMES = [
  '민준',
  '서준',
  '도윤',
  '예준',
  '시우',
  '주원',
  '서연',
  '서윤',
  '지우',
  '하은',
  '수아',
  '채원',
];

/**
 * The current Songjuk Hall room catalogue supplied by the school. Its total
 * capacity is intentionally smaller than the 176 male demo students, so the
 * seed must leave overflow students unassigned instead of weakening a rule.
 */
const SONGJUK_ROOM_FIXTURES = [
  ...['201', '202', '205', '206', '207', '208', '209', '210', '211', '212', '213'].map((name) => ({
    name,
    capacity: 4,
    grade: 3,
    dormName: '송죽관',
  })),
  ...[
    '203',
    '204',
    '301',
    '302',
    '303',
    '304',
    '305',
    '306',
    '307',
    '308',
    '309',
    '310',
    '311',
    '312',
    '313',
    '315',
    '316',
  ].map((name) => ({ name, capacity: name === '308' ? 2 : 4, grade: 2, dormName: '송죽관' })),
  ...[
    '314',
    '501',
    '502',
    '503',
    '504',
    '505',
    '506',
    '507',
    '508',
    '509',
    '510',
    '511',
    '512',
    '513',
    '514',
    '515',
  ].map((name) => ({ name, capacity: name === '508' ? 2 : 4, grade: 1, dormName: '송죽관' })),
];

function buildDemoStudents() {
  const students = [];
  let ordinal = 0;
  for (let grade = 1; grade <= 3; grade += 1) {
    for (let classNo = 1; classNo <= 4; classNo += 1) {
      const classSize = grade === 3 ? 15 : 20;
      const femaleCount = grade === 3 ? 1 : 4;
      for (let number = 1; number <= classSize; number += 1) {
        const studentNo = grade * 1000 + classNo * 100 + number;
        students.push({
          studentNo,
          name: `${SURNAMES[Math.floor(ordinal / GIVEN_NAMES.length)]}${GIVEN_NAMES[ordinal % GIVEN_NAMES.length]}`,
          grade,
          classNo,
          number,
          gender: number > classSize - femaleCount ? '여' : '남',
          email: `${studentNo}@student.jshsus.test`,
          phone: `010-0000-${studentNo}`,
        });
        ordinal += 1;
      }
    }
  }
  return students;
}

function currentSchoolTerm(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return { year, semester: month >= 8 ? 2 : 1 };
}

function makeRoomKey(room) {
  return `${room.dormName}:${room.name}`;
}

/**
 * Deterministically fills Songjuk Hall without ever exceeding capacity,
 * crossing grades/genders, reusing a bed, or placing two students from the
 * same class in one room. Students that cannot satisfy every constraint are
 * deliberately returned as overflow.
 */
function allocateMaleDormAssignments({ students, rooms, occupied = [] }) {
  const fixtureOrder = new Map(
    SONGJUK_ROOM_FIXTURES.map((room, index) => [makeRoomKey(room), index]),
  );
  const orderedRooms = rooms
    .filter((room) => room.dormName === '송죽관' && fixtureOrder.has(makeRoomKey(room)))
    .sort(
      (left, right) => fixtureOrder.get(makeRoomKey(left)) - fixtureOrder.get(makeRoomKey(right)),
    );
  const maleStudents = students
    .filter((student) => student.gender === '남')
    .sort((left, right) => left.studentNo - right.studentNo);
  const queues = new Map();
  for (let grade = 1; grade <= 3; grade += 1) {
    for (let classNo = 1; classNo <= 4; classNo += 1) {
      queues.set(
        `${grade}:${classNo}`,
        maleStudents.filter((student) => student.grade === grade && student.classNo === classNo),
      );
    }
  }

  const occupiedByRoom = new Map();
  for (const occupant of occupied) {
    const values = occupiedByRoom.get(occupant.roomId) ?? [];
    values.push(occupant);
    occupiedByRoom.set(occupant.roomId, values);
  }

  const assignments = [];
  for (const room of orderedRooms) {
    const fixed = occupiedByRoom.get(room.id) ?? [];
    const usedBeds = new Set(fixed.map((occupant) => occupant.bedPosition));
    const usedClasses = new Set(fixed.map((occupant) => occupant.classNo));
    for (let classNo = 1; classNo <= 4; classNo += 1) {
      if (usedClasses.has(classNo) || usedBeds.size >= room.capacity) continue;
      const queue = queues.get(`${room.grade}:${classNo}`);
      const student = queue?.shift();
      if (!student) continue;
      let bedPosition = 1;
      while (usedBeds.has(bedPosition) && bedPosition <= room.capacity) bedPosition += 1;
      if (bedPosition > room.capacity) {
        queue.unshift(student);
        continue;
      }
      assignments.push({
        userId: student.userId,
        studentNo: student.studentNo,
        grade: student.grade,
        classNo: student.classNo,
        roomId: room.id,
        roomName: room.name,
        dormName: room.dormName,
        bedPosition,
      });
      usedBeds.add(bedPosition);
      usedClasses.add(classNo);
    }
  }

  const assignedIds = new Set(assignments.map((assignment) => assignment.userId));
  return {
    assignments,
    overflow: maleStudents.filter((student) => !assignedIds.has(student.userId)),
    skippedFemale: students.filter((student) => student.gender === '여'),
  };
}

module.exports = {
  SONGJUK_ROOM_FIXTURES,
  allocateMaleDormAssignments,
  buildDemoStudents,
  currentSchoolTerm,
};
