import { describe, expect, it } from 'vitest';
import { parseRichNoticeContent, serializeRichNoticeContent } from './richNoticeContent';

const document = {
  type: 'doc' as const,
  content: [
    {
      type: 'paragraph' as const,
      content: [{ type: 'text' as const, text: '공지 본문' }],
    },
  ],
};

describe('rich notice content', () => {
  it('round-trips the persisted editor document', () => {
    const serialized = serializeRichNoticeContent(document, '공지 본문');
    expect(parseRichNoticeContent(serialized)).toEqual({
      contentDoc: document,
      plainText: '공지 본문',
    });
  });

  it('keeps legacy plain-text notices readable', () => {
    expect(parseRichNoticeContent('기존 공지입니다.')).toEqual({
      plainText: '기존 공지입니다.',
    });
  });

  it('falls back safely when the envelope is malformed', () => {
    const malformed = 'jshsus-rich-text:v1\n{"plainText":12}';
    expect(parseRichNoticeContent(malformed)).toEqual({ plainText: malformed });
  });
});
