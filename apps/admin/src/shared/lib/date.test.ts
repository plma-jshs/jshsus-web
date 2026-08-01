import { describe, expect, it } from 'vitest';
import { compactKoreanDateDots, formatKoreanDate } from './date';

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
});
