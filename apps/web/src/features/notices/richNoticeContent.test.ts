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

  it('decodes legacy HTML entities with or without semicolons', () => {
    expect(parseRichNoticeContent('&lsquo;공지&rsquo; &middot 자세히 보기')).toEqual({
      plainText: '‘공지’ · 자세히 보기',
    });
  });

  it('decodes entities inside persisted rich text documents', () => {
    const serialized = serializeRichNoticeContent(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '&lsquo;본문&rsquo; &middot 안내' }],
          },
        ],
      },
      '&lsquo;본문&rsquo; &middot 안내',
    );

    expect(parseRichNoticeContent(serialized)).toEqual({
      contentDoc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '‘본문’ · 안내' }],
          },
        ],
      },
      plainText: '‘본문’ · 안내',
    });
  });

  it('falls back safely when the envelope is malformed', () => {
    const malformed = 'jshsus-rich-text:v1\n{"plainText":12}';
    expect(parseRichNoticeContent(malformed)).toEqual({ plainText: malformed });
  });
});
