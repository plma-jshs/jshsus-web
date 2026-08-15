import { describe, expect, it } from 'vitest';
import { compactKoreanDateDots, formatAdminDate, formatKoreanDate } from './date';

describe('admin Korean date presentation', () => {
  it('uses compact dots and keeps semantic spacing', () => {
    expect(compactKoreanDateDots('2026. 08. 01. (토)')).toBe('2026.08.01 (토)');
    expect(
      formatKoreanDate('2026-08-01T05:19:00.000Z', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
    ).toBe('2026.08.01 14:19');
  });

  it('omits the current year and includes other years', () => {
    const year = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
    }).format(new Date());
    expect(formatAdminDate(`${year}-08-01T05:19:00.000Z`)).toBe('08.01');
    expect(formatAdminDate(`${Number(year) - 1}-08-01T05:19:00.000Z`)).toBe(
      `${Number(year) - 1}.08.01`,
    );
  });
});
