import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  assertPointRecordCanBeAdjusted,
  assertPointRecordCanBeCanceled,
  assertPointRecordCanBeRestored,
} from './point-record.policy';

describe('point record state policy', () => {
  it('allows canceling an active record', () => {
    expect(() => assertPointRecordCanBeCanceled(null)).not.toThrow();
  });

  it('rejects canceling an already canceled record', () => {
    expect(() => assertPointRecordCanBeCanceled(new Date())).toThrow(ConflictException);
  });

  it('allows restoring a canceled record', () => {
    expect(() => assertPointRecordCanBeRestored(new Date())).not.toThrow();
  });

  it('rejects restoring an active record', () => {
    expect(() => assertPointRecordCanBeRestored(null)).toThrow(ConflictException);
  });

  it('rejects individual adjustment of records created by the system actor', () => {
    expect(() =>
      assertPointRecordCanBeAdjusted({ teacherStudentNo: -900_001, reason: '일반 사유' }),
    ).toThrow(ConflictException);
  });

  it('rejects individual adjustment of records using a system reason', () => {
    expect(() =>
      assertPointRecordCanBeAdjusted({
        teacherStudentNo: 1234,
        reason: '[시스템] 새 학기 상점 반감',
      }),
    ).toThrow(ConflictException);
  });

  it('allows adjusting a human-managed record', () => {
    expect(() =>
      assertPointRecordCanBeAdjusted({ teacherStudentNo: 1234, reason: '생활관 정리 우수' }),
    ).not.toThrow();
  });
});
