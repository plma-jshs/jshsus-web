import { describe, expect, it } from 'vitest';
import {
  calculateCurrentPointCategoryBalances,
  calculateDepartureResetAdjustment,
  calculateSemesterHalfAdjustment,
  classifyPointRisk,
  isDepartureCandidate,
  isSystemPointRecord,
  SYSTEM_MERIT_HALF_REASON,
  SYSTEM_PENALTY_HALF_REASON,
} from './point-lifecycle.policy';

describe('point lifecycle policy', () => {
  it('halves merit and penalty magnitudes independently and floors odd values', () => {
    expect(
      calculateSemesterHalfAdjustment([
        { type: 'PLUS', point: 3 },
        { type: 'PLUS', point: 2 },
        { type: 'MINUS', point: -3 },
        { type: 'MINUS', point: -2 },
        { type: 'ETC', point: 99 },
      ]),
    ).toEqual({
      meritBefore: 5,
      meritAfter: 2,
      meritAdjustment: -3,
      penaltyBefore: 5,
      penaltyAfter: 2,
      penaltyAdjustment: 3,
    });
  });

  it('uses a net score of -20 as the departure candidate boundary', () => {
    expect(isDepartureCandidate(-21)).toBe(true);
    expect(isDepartureCandidate(-20)).toBe(true);
    expect(isDepartureCandidate(-19)).toBe(false);
  });

  it('separates departure risk from students who require approval', () => {
    expect(classifyPointRisk(-9)).toBe('normal');
    expect(classifyPointRisk(-10)).toBe('risk');
    expect(classifyPointRisk(-19)).toBe('risk');
    expect(classifyPointRisk(-20)).toBe('departure');
  });

  it('creates an equal and opposite system adjustment when departure is confirmed', () => {
    expect(calculateDepartureResetAdjustment(-27)).toBe(27);
    expect(calculateDepartureResetAdjustment(8)).toBe(-8);
    expect(calculateDepartureResetAdjustment(0)).toBe(0);
  });

  it('recognizes either the dedicated actor or a reserved reason as a system record', () => {
    expect(isSystemPointRecord({ teacherStudentNo: -900_001, reason: '일반 조정' })).toBe(true);
    expect(isSystemPointRecord({ teacherStudentNo: 1234, reason: SYSTEM_MERIT_HALF_REASON })).toBe(
      true,
    );
    expect(isSystemPointRecord({ teacherStudentNo: 1234, reason: '일반 조정' })).toBe(false);
    expect(isSystemPointRecord({ teacherStudentNo: null, reason: '교직원 수기 부여' })).toBe(false);
  });

  it('applies only category-specific half adjustments to category balances', () => {
    expect(
      calculateCurrentPointCategoryBalances([
        { type: 'PLUS', point: 5, reason: '상점' },
        { type: 'MINUS', point: -5, reason: '벌점' },
        { type: 'ETC', point: -3, reason: SYSTEM_MERIT_HALF_REASON },
        { type: 'ETC', point: 3, reason: SYSTEM_PENALTY_HALF_REASON },
        { type: 'ETC', point: 20, reason: '일반 기타 조정' },
      ]),
    ).toEqual({ meritPoint: 2, penaltyPoint: 2 });
  });
});
