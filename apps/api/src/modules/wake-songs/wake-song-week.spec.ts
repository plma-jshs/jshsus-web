import { describe, expect, it } from 'vitest';
import { getWakeSongCandidateWeek } from './wake-song-week';

describe('getWakeSongCandidateWeek', () => {
  it('assigns a Saturday request to the following Monday week', () => {
    const week = getWakeSongCandidateWeek(new Date('2026-08-01T12:00:00+09:00'));

    expect(week.startDate).toBe('2026-08-03');
    expect(week.endDate).toBe('2026-08-10');
    expect(week.label).toBe('8월 2주차 (08. 03 ~ 08. 10)');
  });

  it('moves a Monday request to the next Monday instead of the current week', () => {
    const week = getWakeSongCandidateWeek(new Date('2026-08-03T09:00:00+09:00'));

    expect(week.startDate).toBe('2026-08-10');
    expect(week.endDate).toBe('2026-08-17');
  });
});
