import { describe, expect, it } from 'vitest';
import { formatCalendarDate } from './CalendarPage';

describe('formatCalendarDate', () => {
  it('uses the dotted Korean calendar heading format', () => {
    expect(formatCalendarDate('2026-07-14')).toBe('2026.07.14 (화)');
  });
});
