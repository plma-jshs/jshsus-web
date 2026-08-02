import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRecentContent } from './ContentBadges';

afterEach(() => {
  vi.useRealTimers();
});

describe('isRecentContent', () => {
  it('treats content from the last 24 hours as recent', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T12:00:00.000Z'));

    expect(isRecentContent('2026-08-01T12:00:00.000Z')).toBe(true);
    expect(isRecentContent('2026-08-01T11:59:59.999Z')).toBe(false);
  });

  it('rejects missing, invalid, and future timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T12:00:00.000Z'));

    expect(isRecentContent()).toBe(false);
    expect(isRecentContent('invalid')).toBe(false);
    expect(isRecentContent('2026-08-02T12:00:00.001Z')).toBe(false);
  });
});
