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
    ).toBe('14:00~15:40, 16:00~18:00');
  });

  it('keeps non-contiguous study periods separated like the student portal', () => {
    const slotIds = ['evening-1', 'evening-3'] as const;
    expect(
      formatActivityPeriodLabel(
        '2026-07-15',
        '2026-07-15T10:10:00.000Z',
        '2026-07-15T14:30:00.000Z',
        [...slotIds],
      ),
    ).toBe('1면학, 3면학');
    expect(
      formatActivityTimeRanges(
        '2026-07-15',
        '2026-07-15T10:10:00.000Z',
        '2026-07-15T14:30:00.000Z',
        [...slotIds],
      ),
    ).toBe('19:10~20:20, 21:50~23:30');
  });
});
