import { describe, expect, it } from 'vitest';
import { buildCalendarDays } from './calendar-grid';

describe('buildCalendarDays', () => {
  it('always creates a six-week calendar and fills adjacent months', () => {
    const days = buildCalendarDays(2026, 7);

    expect(days).toHaveLength(42);
    expect(days[0]).toMatchObject({ key: '2026-06-28', day: 28, isCurrentMonth: false });
    expect(days[3]).toMatchObject({ key: '2026-07-01', day: 1, isCurrentMonth: true });
    expect(days.at(-1)).toMatchObject({ key: '2026-08-08', day: 8, isCurrentMonth: false });
  });

  it('keeps a Sunday-starting month in a six-week grid', () => {
    const days = buildCalendarDays(2026, 2);

    expect(days[0]).toMatchObject({ key: '2026-02-01', isCurrentMonth: true });
    expect(days.at(-1)).toMatchObject({ key: '2026-03-14', isCurrentMonth: false });
  });
});
