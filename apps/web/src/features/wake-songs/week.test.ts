import { describe, expect, it } from 'vitest';
import { getNextWakeSongWeek } from './week';

describe('getNextWakeSongWeek', () => {
  it('formats the next candidate week in Korean', () => {
    expect(getNextWakeSongWeek(new Date('2026-08-01T12:00:00+09:00'))).toEqual({
      startDate: '2026-08-03',
      endDate: '2026-08-10',
      label: '8월 2주차 (08. 03 ~ 08. 10)',
    });
  });
});
