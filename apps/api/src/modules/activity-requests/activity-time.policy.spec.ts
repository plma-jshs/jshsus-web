import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  assertAllowedActivityTime,
  assertAllowedActivityTimes,
  resolveActivityTimeSlot,
} from './activity-time.policy';

describe('activity time policy', () => {
  it('allows every configured study period on weekends', () => {
    const slot = resolveActivityTimeSlot(
      new Date('2026-07-18T09:00:00+09:00'),
      new Date('2026-07-18T10:40:00+09:00'),
    );
    expect(slot?.id).toBe('morning-1');
  });

  it('allows evening study periods on weekdays', () => {
    const slot = resolveActivityTimeSlot(
      new Date('2026-07-15T19:10:00+09:00'),
      new Date('2026-07-15T20:20:00+09:00'),
    );
    expect(slot?.id).toBe('evening-1');
  });

  it('rejects class and after-school periods on weekdays', () => {
    expect(() =>
      assertAllowedActivityTime(
        new Date('2026-07-15T14:00:00+09:00'),
        new Date('2026-07-15T15:40:00+09:00'),
      ),
    ).toThrow(BadRequestException);
  });

  it('accepts multiple selected evening study periods as one request', () => {
    expect(
      assertAllowedActivityTimes(
        new Date('2026-07-15T19:10:00+09:00'),
        new Date('2026-07-15T23:30:00+09:00'),
        ['evening-1', 'evening-2', 'evening-3'],
      ),
    ).toEqual(['evening-1', 'evening-2', 'evening-3']);
  });

  it('rejects arbitrary ranges even when they overlap a valid period', () => {
    expect(() =>
      assertAllowedActivityTime(
        new Date('2026-07-18T09:10:00+09:00'),
        new Date('2026-07-18T10:30:00+09:00'),
      ),
    ).toThrow(BadRequestException);
  });
});
