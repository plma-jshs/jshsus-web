import { describe, expect, it } from 'vitest';
import { countUtf8Bytes, getByteUsage, normalizeLineEndings } from './byte-counter';

describe('byte calculator', () => {
  it('counts Hangul using UTF-8 bytes', () => {
    expect(countUtf8Bytes('한글')).toBe(6);
  });

  it('counts English, numbers, spaces and ASCII punctuation as one byte', () => {
    expect(countUtf8Bytes('ABC 123!')).toBe(8);
  });

  it('counts non-ASCII punctuation by its UTF-8 size', () => {
    expect(countUtf8Bytes('·※')).toBe(5);
  });

  it('counts every line break as CRLF regardless of source representation', () => {
    expect(normalizeLineEndings('가\n나\r다\r\n라')).toBe('가\r\n나\r\n다\r\n라');
    expect(countUtf8Bytes('A\nB')).toBe(4);
  });

  it('preserves the UTF-8 size of supplementary characters', () => {
    expect(countUtf8Bytes('😀')).toBe(4);
  });

  it('reports remaining and exceeded bytes against a custom limit', () => {
    expect(getByteUsage('한글', 10)).toMatchObject({
      bytes: 6,
      limit: 10,
      remaining: 4,
      exceeded: 0,
    });
    expect(getByteUsage('한글', 5)).toMatchObject({
      bytes: 6,
      limit: 5,
      remaining: 0,
      exceeded: 1,
    });
  });
});
