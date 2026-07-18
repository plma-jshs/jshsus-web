export const DEPARTURE_POINT_THRESHOLD = -20;
export const DEPARTURE_RISK_POINT_THRESHOLD = -10;

export type PointRiskStatus = 'normal' | 'risk' | 'departure';

export const SYSTEM_POINT_REASON_PREFIX = '[시스템]';
export const SYSTEM_DEPARTURE_REASON = '[시스템] 퇴사 처리 점수 초기화';
export const SYSTEM_MERIT_HALF_REASON = '[시스템] 새 학기 상점 반감';
export const SYSTEM_PENALTY_HALF_REASON = '[시스템] 새 학기 벌점 반감';
export const SYSTEM_POINT_ACTOR_STUDENT_NO = -900_001;
export const SYSTEM_POINT_ACTOR_NAME = '상벌점 시스템';

export type PointLedgerEntry = {
  type: 'PLUS' | 'MINUS' | 'ETC';
  point: number;
  reason?: string;
};

export type SemesterHalfAdjustment = {
  meritBefore: number;
  meritAfter: number;
  meritAdjustment: number;
  penaltyBefore: number;
  penaltyAfter: number;
  penaltyAdjustment: number;
};

export function isSystemPointReason(reason: string): boolean {
  return reason.startsWith(SYSTEM_POINT_REASON_PREFIX);
}

export function isSystemPointRecord(input: {
  teacherStudentNo: number | null;
  reason: string;
}): boolean {
  return (
    input.teacherStudentNo === SYSTEM_POINT_ACTOR_STUDENT_NO || isSystemPointReason(input.reason)
  );
}

export function calculateCurrentPointCategoryBalances(entries: PointLedgerEntry[]): {
  meritPoint: number;
  penaltyPoint: number;
} {
  const meritBalance = entries
    .filter((entry) => entry.type === 'PLUS' || entry.reason === SYSTEM_MERIT_HALF_REASON)
    .reduce((total, entry) => total + entry.point, 0);
  const penaltyBalance = entries
    .filter((entry) => entry.type === 'MINUS' || entry.reason === SYSTEM_PENALTY_HALF_REASON)
    .reduce((total, entry) => total + entry.point, 0);

  return {
    meritPoint: Math.max(0, meritBalance),
    penaltyPoint: Math.abs(Math.min(0, penaltyBalance)),
  };
}

/**
 * 상점과 벌점은 각각 양의 크기로 집계한 뒤 절반을 내림한다.
 * 반환되는 조정값은 기존 원장을 수정하지 않고 ETC 원장으로 추가할 signed point다.
 */
export function calculateSemesterHalfAdjustment(
  entries: PointLedgerEntry[],
): SemesterHalfAdjustment {
  const meritBefore = entries
    .filter((entry) => entry.type === 'PLUS')
    .reduce((total, entry) => total + Math.max(0, entry.point), 0);
  const penaltyBefore = entries
    .filter((entry) => entry.type === 'MINUS')
    .reduce((total, entry) => total + Math.abs(Math.min(0, entry.point)), 0);
  const meritAfter = Math.floor(meritBefore / 2);
  const penaltyAfter = Math.floor(penaltyBefore / 2);

  return {
    meritBefore,
    meritAfter,
    meritAdjustment: meritAfter - meritBefore,
    penaltyBefore,
    penaltyAfter,
    penaltyAdjustment: penaltyBefore - penaltyAfter,
  };
}

export function isDepartureCandidate(currentPoint: number): boolean {
  return currentPoint <= DEPARTURE_POINT_THRESHOLD;
}

export function classifyPointRisk(currentPoint: number): PointRiskStatus {
  if (currentPoint <= DEPARTURE_POINT_THRESHOLD) return 'departure';
  if (currentPoint <= DEPARTURE_RISK_POINT_THRESHOLD) return 'risk';
  return 'normal';
}

export function calculateDepartureResetAdjustment(currentPoint: number): number {
  return currentPoint === 0 ? 0 : -currentPoint;
}
