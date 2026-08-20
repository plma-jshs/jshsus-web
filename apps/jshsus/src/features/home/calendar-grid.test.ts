import { describe, expect, it } from 'vitest';
import { buildCalendarDays } from './calendar-grid';

describe('buildCalendarDays', () => {
  it('creates only the weeks required by the visible month', () => {
    const days = buildCalendarDays(2026, 7);

    expect(days).toHaveLength(35);
    expect(days[0]).toMatchObject({ key: '2026-06-28', day: 28, isCurrentMonth: false });
    expect(days[3]).toMatchObject({ key: '2026-07-01', day: 1, isCurrentMonth: true });
    expect(days.at(-1)).toMatchObject({ key: '2026-08-01', day: 1, isCurrentMonth: false });
  });

  it('supports a compact four-week month', () => {
    const days = buildCalendarDays(2026, 2);

    expect(days).toHaveLength(28);
    expect(days[0]).toMatchObject({ key: '2026-02-01', isCurrentMonth: true });
    expect(days.at(-1)).toMatchObject({ key: '2026-02-28', isCurrentMonth: true });
  });

  it('still renders six weeks when the month requires them', () => {
    const days = buildCalendarDays(2026, 8);

    expect(days).toHaveLength(42);
    expect(days.at(-1)).toMatchObject({ key: '2026-09-05', isCurrentMonth: false });
  });
});
