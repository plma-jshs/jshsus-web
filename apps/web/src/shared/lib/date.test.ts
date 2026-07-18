import { describe, expect, it } from 'vitest';
import {
  createKoreanDateFormatter,
  formatKoreanContentDateTime,
  formatKoreanRelativeTime,
  toKoreanDateKey,
} from './date';

describe('createKoreanDateFormatter', () => {
  it('removes only the trailing period from Korean dates', () => {
    const formatter = createKoreanDateFormatter({ month: '2-digit', day: '2-digit' });

    expect(formatter.format(new Date('2026-07-13T00:00:00+09:00'))).toBe('07. 13');
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
    expect(formatKoreanContentDateTime('2026-07-15T05:19:00.000Z')).toBe('2026. 07. 15. 14:19');
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
    expect(formatKoreanRelativeTime('2026-07-15T14:20:00+09:00', now)).toBe('방금');
  });
});
