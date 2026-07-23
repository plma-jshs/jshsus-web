import { describe, expect, it } from 'vitest';
import {
  effectiveDuration,
  formatDuration,
  parseDuration,
  wakeSongStatusPresentation,
} from './presentation';

describe('wake-song time helpers', () => {
  it('formats and parses minute and hour timestamps', () => {
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(parseDuration('01:05')).toBe(65);
    expect(parseDuration('1:01:01')).toBe(3661);
  });

  it('rejects malformed timestamps', () => {
    expect(parseDuration('1:70')).toBeNull();
    expect(parseDuration('90')).toBeNull();
  });

  it('calculates duration after playback rate', () => {
    expect(effectiveDuration(10, 190, 1.25)).toBe(144);
  });
});

describe('wake-song status presentation', () => {
  it.each([
    ['PENDING', '대기', 'pending'],
    ['APPROVED', '승인', 'approved'],
    ['SCHEDULED', '승인', 'approved'],
    ['PLAYED', '승인', 'approved'],
    ['REJECTED', '반려', 'rejected'],
    ['CANCELED', '취소', 'canceled'],
  ] as const)('maps %s to the compact public status', (status, label, tone) => {
    expect(wakeSongStatusPresentation(status)).toEqual({ label, tone });
  });
});
