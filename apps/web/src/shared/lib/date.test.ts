import { describe, expect, it } from 'vitest';
import { createKoreanDateFormatter, toKoreanDateKey } from './date';

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
