export type DormName = '송죽관' | '동백관';

export type DormDrawRoom = {
  id: number;
  name: string;
  dormName: DormName;
  grade: number;
  capacity: number;
};

export type DormDrawStudent = {
  userId: number;
  studentNo: number;
  name: string;
  grade: number;
  classNo: number;
  gender?: string | null;
};

export type DormDrawBlock = {
  studentUserId: number;
  blockedUserId: number;
};

export type DormPlacement = {
  userId: number;
  roomId: number;
  bedPosition: number;
};

export type DormPlacementViolation = {
  code:
    | 'ROOM_NOT_FOUND'
    | 'STUDENT_NOT_FOUND'
    | 'DUPLICATE_STUDENT'
    | 'DUPLICATE_BED'
    | 'CAPACITY_EXCEEDED'
    | 'GENDER_MISMATCH'
    | 'GRADE_MISMATCH'
    | 'SAME_CLASS'
    | 'ROOMMATE_BLOCK';
  message: string;
  userId?: number;
  roomId?: number;
};

function normalizedGender(value?: string | null): 'male' | 'female' | undefined {
  const gender = value?.trim().toLocaleLowerCase();
  if (!gender) return undefined;
  if (['m', 'male', 'man', '남', '남자', '남성'].includes(gender)) return 'male';
  if (['f', 'female', 'woman', '여', '여자', '여성'].includes(gender)) return 'female';
  return undefined;
}

export function dormNameForGender(value?: string | null): DormName | undefined {
  const gender = normalizedGender(value);
  if (gender === 'male') return '송죽관';
  if (gender === 'female') return '동백관';
  return undefined;
}

function blockKey(left: number, right: number) {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffle<T>(values: T[], random: () => number) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(random() * (index + 1));
    [result[index], result[nextIndex]] = [result[nextIndex]!, result[index]!];
  }
  return result;
}

export function validateDormPlacements(input: {
  rooms: DormDrawRoom[];
  students: DormDrawStudent[];
  blocks: DormDrawBlock[];
  placements: DormPlacement[];
}): DormPlacementViolation[] {
  const roomById = new Map(input.rooms.map((room) => [room.id, room]));
  const studentById = new Map(input.students.map((student) => [student.userId, student]));
  const blocks = new Set(
    input.blocks.map((block) => blockKey(block.studentUserId, block.blockedUserId)),
  );
  const seenStudents = new Set<number>();
  const seenBeds = new Set<string>();
  const roomPlacements = new Map<number, DormPlacement[]>();
  const violations: DormPlacementViolation[] = [];

  for (const placement of input.placements) {
    const room = roomById.get(placement.roomId);
    const student = studentById.get(placement.userId);
    if (!room) {
      violations.push({
        code: 'ROOM_NOT_FOUND',
        message: '존재하지 않는 방이 포함되어 있습니다.',
        roomId: placement.roomId,
        userId: placement.userId,
      });
      continue;
    }
    if (!student) {
      violations.push({
        code: 'STUDENT_NOT_FOUND',
        message: '존재하지 않는 학생이 포함되어 있습니다.',
        roomId: placement.roomId,
        userId: placement.userId,
      });
      continue;
    }
    if (seenStudents.has(placement.userId)) {
      violations.push({
        code: 'DUPLICATE_STUDENT',
        message: `${student.studentNo} ${student.name} 학생이 두 번 배정되었습니다.`,
        roomId: room.id,
        userId: student.userId,
      });
    }
    seenStudents.add(placement.userId);

    const bedKey = `${room.id}:${placement.bedPosition}`;
    if (seenBeds.has(bedKey)) {
      violations.push({
        code: 'DUPLICATE_BED',
        message: `${room.name} ${placement.bedPosition}번 침대가 중복되었습니다.`,
        roomId: room.id,
        userId: student.userId,
      });
    }
    seenBeds.add(bedKey);

    if (placement.bedPosition < 1 || placement.bedPosition > room.capacity) {
      violations.push({
        code: 'CAPACITY_EXCEEDED',
        message: `${room.name}의 정원을 초과한 침대 위치입니다.`,
        roomId: room.id,
        userId: student.userId,
      });
    }
    if (dormNameForGender(student.gender) !== room.dormName) {
      violations.push({
        code: 'GENDER_MISMATCH',
        message: `${student.studentNo} ${student.name} 학생의 성별과 생활관이 일치하지 않습니다.`,
        roomId: room.id,
        userId: student.userId,
      });
    }
    if (student.grade !== room.grade) {
      violations.push({
        code: 'GRADE_MISMATCH',
        message: `${student.studentNo} ${student.name} 학생의 학년과 방 학년이 일치하지 않습니다.`,
        roomId: room.id,
        userId: student.userId,
      });
    }
    const placements = roomPlacements.get(room.id) ?? [];
    placements.push(placement);
    roomPlacements.set(room.id, placements);
  }

  for (const [roomId, placements] of roomPlacements) {
    const room = roomById.get(roomId)!;
    if (placements.length > room.capacity) {
      violations.push({
        code: 'CAPACITY_EXCEEDED',
        message: `${room.name}의 배정 인원이 정원을 초과했습니다.`,
        roomId,
      });
    }
    for (let leftIndex = 0; leftIndex < placements.length; leftIndex += 1) {
      const left = studentById.get(placements[leftIndex]!.userId);
      if (!left) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < placements.length; rightIndex += 1) {
        const right = studentById.get(placements[rightIndex]!.userId);
        if (!right) continue;
        if (left.classNo === right.classNo) {
          violations.push({
            code: 'SAME_CLASS',
            message: `${room.name}에 같은 반 학생이 함께 배정되었습니다.`,
            roomId,
            userId: right.userId,
          });
        }
        if (blocks.has(blockKey(left.userId, right.userId))) {
          violations.push({
            code: 'ROOMMATE_BLOCK',
            message: `${room.name}에 함께 배정 금지 학생이 포함되어 있습니다.`,
            roomId,
            userId: right.userId,
          });
        }
      }
    }
  }

  return violations;
}

export function generateDormDraw(input: {
  rooms: DormDrawRoom[];
  students: DormDrawStudent[];
  blocks: DormDrawBlock[];
  fixedPlacements?: DormPlacement[];
  seed?: number;
  attempts?: number;
}) {
  const fixedPlacements = input.fixedPlacements ?? [];
  const fixedStudentIds = new Set(fixedPlacements.map((placement) => placement.userId));
  const candidates = input.students.filter((student) => !fixedStudentIds.has(student.userId));
  const blockSet = new Set(
    input.blocks.map((block) => blockKey(block.studentUserId, block.blockedUserId)),
  );
  const blockCounts = new Map<number, number>();
  for (const block of input.blocks) {
    blockCounts.set(block.studentUserId, (blockCounts.get(block.studentUserId) ?? 0) + 1);
    blockCounts.set(block.blockedUserId, (blockCounts.get(block.blockedUserId) ?? 0) + 1);
  }
  const studentById = new Map(input.students.map((student) => [student.userId, student]));
  const attempts = Math.min(Math.max(input.attempts ?? 240, 1), 1_000);
  let best: DormPlacement[] = [...fixedPlacements];

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const random = createRandom((input.seed ?? Date.now()) + attempt * 7_919);
    const placements = [...fixedPlacements];
    const occupantsByRoom = new Map<number, DormDrawStudent[]>();
    const usedBedsByRoom = new Map<number, Set<number>>();
    for (const fixed of fixedPlacements) {
      const student = studentById.get(fixed.userId);
      if (student) {
        const occupants = occupantsByRoom.get(fixed.roomId) ?? [];
        occupants.push(student);
        occupantsByRoom.set(fixed.roomId, occupants);
      }
      const beds = usedBedsByRoom.get(fixed.roomId) ?? new Set<number>();
      beds.add(fixed.bedPosition);
      usedBedsByRoom.set(fixed.roomId, beds);
    }

    const ordered = shuffle(candidates, random).sort(
      (left, right) => (blockCounts.get(right.userId) ?? 0) - (blockCounts.get(left.userId) ?? 0),
    );

    for (const student of ordered) {
      const expectedDorm = dormNameForGender(student.gender);
      const eligible = shuffle(input.rooms, random).filter((room) => {
        if (room.grade !== student.grade || room.dormName !== expectedDorm) return false;
        const occupants = occupantsByRoom.get(room.id) ?? [];
        if (occupants.length >= room.capacity) return false;
        if (occupants.some((occupant) => occupant.classNo === student.classNo)) return false;
        return occupants.every(
          (occupant) => !blockSet.has(blockKey(occupant.userId, student.userId)),
        );
      });
      if (eligible.length === 0) continue;

      eligible.sort((left, right) => {
        const leftRemaining = left.capacity - (occupantsByRoom.get(left.id)?.length ?? 0);
        const rightRemaining = right.capacity - (occupantsByRoom.get(right.id)?.length ?? 0);
        return rightRemaining - leftRemaining;
      });
      const topRemaining =
        eligible[0]!.capacity - (occupantsByRoom.get(eligible[0]!.id)?.length ?? 0);
      const equallyOpen = eligible.filter(
        (room) => room.capacity - (occupantsByRoom.get(room.id)?.length ?? 0) === topRemaining,
      );
      const room = equallyOpen[Math.floor(random() * equallyOpen.length)]!;
      const usedBeds = usedBedsByRoom.get(room.id) ?? new Set<number>();
      let bedPosition = 1;
      while (usedBeds.has(bedPosition) && bedPosition <= room.capacity) bedPosition += 1;
      const placement = { userId: student.userId, roomId: room.id, bedPosition };
      placements.push(placement);
      usedBeds.add(bedPosition);
      usedBedsByRoom.set(room.id, usedBeds);
      const occupants = occupantsByRoom.get(room.id) ?? [];
      occupants.push(student);
      occupantsByRoom.set(room.id, occupants);
    }

    if (placements.length > best.length) best = placements;
    if (best.length === input.students.length) break;
  }

  const assignedIds = new Set(best.map((placement) => placement.userId));
  const unassigned = input.students
    .filter((student) => !assignedIds.has(student.userId))
    .map((student) => ({
      userId: student.userId,
      studentNo: student.studentNo,
      name: student.name,
      reason: dormNameForGender(student.gender)
        ? '현재 제약 조건을 모두 만족하는 자리가 없습니다.'
        : '성별 정보가 없어 생활관을 결정할 수 없습니다.',
    }));

  return {
    placements: best,
    unassigned,
    violations: validateDormPlacements({ ...input, placements: best }),
  };
}
