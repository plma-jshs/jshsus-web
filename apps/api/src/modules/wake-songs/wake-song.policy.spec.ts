import { describe, expect, it } from 'vitest';
import { validateWakeSongSegment } from './wake-song.policy';

describe('validateWakeSongSegment', () => {
  it('calculates effective playback time after rate adjustment', () => {
    expect(
      validateWakeSongSegment({ startSeconds: 10, endSeconds: 190, playbackRate: 1.25 }),
    ).toEqual({ playbackRateHundredths: 125, effectiveDurationSeconds: 144 });
  });

  it('allows exactly three minutes of effective playback', () => {
    expect(validateWakeSongSegment({ startSeconds: 0, endSeconds: 360, playbackRate: 2 })).toEqual({
      playbackRateHundredths: 200,
      effectiveDurationSeconds: 180,
    });
  });

  it('rejects requests longer than three effective minutes', () => {
    expect(() =>
      validateWakeSongSegment({ startSeconds: 0, endSeconds: 181, playbackRate: 1 }),
    ).toThrow('최대 3분');
  });

  it('rejects a segment beyond known video duration', () => {
    expect(() =>
      validateWakeSongSegment({
        startSeconds: 100,
        endSeconds: 121,
        playbackRate: 1,
        videoDurationSeconds: 120,
      }),
    ).toThrow('영상 길이');
  });

  it('rejects playback rates outside the supported list', () => {
    expect(() =>
      validateWakeSongSegment({ startSeconds: 0, endSeconds: 60, playbackRate: 1.1 }),
    ).toThrow('재생 속도');
  });
});
