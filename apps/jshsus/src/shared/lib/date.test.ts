import { describe, expect, it } from 'vitest';
import {
  createKoreanDateFormatter,
  compactKoreanDateDots,
  formatKoreanContentDateTime,
  formatKoreanRelativeTime,
  toKoreanDateKey,
} from './date';

describe('Korean date presentation', () => {
  it('uses compact dotted dates without losing weekday spacing', () => {
    const formatter = createKoreanDateFormatter({ month: '2-digit', day: '2-digit' });

    expect(formatter.format(new Date('2026-07-13T00:00:00+09:00'))).toBe('07.13');
    expect(compactKoreanDateDots('2026. 08. 01. (토)')).toBe('2026.08.01 (토)');
  });
});

describe('toKoreanDateKey', () => {
  it('converts UTC timestamps to their Asia/Seoul calendar date', () => {
    expect(toKoreanDateKey('2026-07-12T15:00:00.000Z')).toBe('2026-07-13');
  });
});

describe('content date presentation', () => {
  const now = new Date('2026-07-15T14:19:30+09:00');

  it('formats the post header in Korea time with a 24-hour clock', () => {
    expect(formatKoreanContentDateTime('2026-07-15T05:19:00.000Z')).toBe('2026.07.15 14:19');
  });

  it.each([
    ['2026-07-15T14:19:00+09:00', '방금'],
    ['2026-07-15T14:16:00+09:00', '3분 전'],
    ['2026-07-15T13:19:00+09:00', '1시간 전'],
    ['2026-07-14T14:19:00+09:00', '1일 전'],
    ['2026-06-15T14:19:00+09:00', '1개월 전'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatKoreanRelativeTime(value, now)).toBe(expected);
  });

  it('does not expose a negative duration for future timestamps', () => {
    expect(formatKoreanRelativeTime('2026-07-15T14:19:30+09:00', now)).toBe('방금');
    expect(formatKoreanRelativeTime('2026-07-15T18:20:00+09:00', now)).toBe('방금');
  });
});
