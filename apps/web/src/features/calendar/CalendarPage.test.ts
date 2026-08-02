import { describe, expect, it } from 'vitest';
import type { AcademicEvent } from '@jshsus/types';
import { formatCalendarDate, formatEventRange } from './CalendarPage';

describe('formatCalendarDate', () => {
  it('uses the dotted Korean calendar heading format', () => {
    expect(formatCalendarDate('2026-07-14')).toBe('2026.07.14 (화)');
  });

  it('can omit the year for compact calendar headers', () => {
    expect(formatCalendarDate('2026-07-14', false)).toBe('07.14 (화)');
  });
});

describe('formatEventRange', () => {
  const event = (startsAt: string, endsAt: string): AcademicEvent => ({
    id: 'event-1',
    title: '방학',
    startsAt,
    endsAt,
    allDay: true,
    category: 'school',
    isHoliday: false,
    source: 'school',
  });

  it('omits the year for ordinary same-year agenda items', () => {
    expect(formatEventRange(event('2026-07-14T00:00:00+09:00', '2026-07-15T00:00:00+09:00'))).toBe(
      '07.14 (화) 〜 07.15 (수) 종일',
    );
  });

  it('includes the year only when an agenda item crosses a year boundary', () => {
    expect(formatEventRange(event('2026-12-31T00:00:00+09:00', '2027-01-01T00:00:00+09:00'))).toBe(
      '2026.12.31 (목) 〜 2027.01.01 (금) 종일',
    );
  });

  it('always omits the year in a tooltip', () => {
    expect(
      formatEventRange(event('2026-12-31T00:00:00+09:00', '2027-01-01T00:00:00+09:00'), 'never'),
    ).toBe('12.31 (목) 〜 01.01 (금) 종일');
  });
});
