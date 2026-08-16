import { describe, expect, it } from 'vitest';
import { formatActivityPeriodLabel, formatActivityTimeRanges } from './activitySchedule';

describe('admin activity schedule presentation', () => {
  it('keeps saved daytime periods visible on weekdays', () => {
    expect(
      formatActivityTimeRanges(
        '2026-07-30',
        '2026-07-30T05:00:00.000Z',
        '2026-07-30T09:00:00.000Z',
        ['afternoon-1', 'afternoon-2'],
      ),
    ).toBe('14:00~18:00');
  });

  it('groups study periods by daytime group even when a period is skipped', () => {
    const slotIds = ['evening-1', 'evening-3'] as const;
    expect(
      formatActivityPeriodLabel(
        '2026-07-15',
        '2026-07-15T10:10:00.000Z',
        '2026-07-15T14:30:00.000Z',
        [...slotIds],
      ),
    ).toBe('1·3면학');
    expect(
      formatActivityTimeRanges(
        '2026-07-15',
        '2026-07-15T10:10:00.000Z',
        '2026-07-15T14:30:00.000Z',
        [...slotIds],
      ),
    ).toBe('19:10~20:20, 21:50~23:30');
  });

  it('groups adjacent periods with a middle dot in the overview table', () => {
    expect(
      formatActivityPeriodLabel(
        '2026-08-16',
        '2026-08-16T10:10:00.000Z',
        '2026-08-16T14:30:00.000Z',
        ['evening-1', 'evening-2', 'evening-3'],
      ),
    ).toBe('1·2·3면학');
    expect(
      formatActivityPeriodLabel(
        '2026-08-16',
        '2026-08-16T00:00:00.000Z',
        '2026-08-16T03:00:00.000Z',
        ['morning-1', 'morning-2'],
      ),
    ).toBe('오전 1·2면학');
  });
});
