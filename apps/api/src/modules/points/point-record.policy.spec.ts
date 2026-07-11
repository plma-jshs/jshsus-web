import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
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
});
