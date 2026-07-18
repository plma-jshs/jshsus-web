import { describe, expect, it } from 'vitest';
import { parseIso8601Duration, parseYouTubeUrl } from './youtube-video.policy';

describe('parseYouTubeUrl', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?t=10',
    'https://m.youtube.com/shorts/dQw4w9WgXcQ',
    'https://youtube.com/live/dQw4w9WgXcQ',
  ])('normalizes supported YouTube URLs: %s', (url) => {
    expect(parseYouTubeUrl(url)).toEqual({
      videoId: 'dQw4w9WgXcQ',
      canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    });
  });

  it.each([
    'http://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://youtube.com:444/watch?v=dQw4w9WgXcQ',
    'https://user@youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ/unexpected',
    'javascript:alert(1)',
    'https://www.youtube.com/watch?v=too-short',
  ])('rejects unsafe or invalid URLs: %s', (url) => {
    expect(parseYouTubeUrl(url)).toBeNull();
  });
});

describe('parseIso8601Duration', () => {
  it('parses YouTube ISO-8601 durations', () => {
    expect(parseIso8601Duration('PT1H2M3S')).toBe(3723);
    expect(parseIso8601Duration('PT3M0.5S')).toBe(181);
  });

  it('returns undefined for unsupported values', () => {
    expect(parseIso8601Duration('3:00')).toBeUndefined();
  });
});
