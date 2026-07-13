import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parsePetitionCreate } from './petition-content';

describe('parsePetitionCreate', () => {
  it('accepts the restricted rich-text document and projects searchable plain text', () => {
    const result = parsePetitionCreate({
      title: '학생 편의시설 개선',
      contentDoc: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: '현재 문제', marks: [{ type: 'bold' }] }],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '사용 가능한 공간이 부족합니다. ' },
              {
                type: 'text',
                text: '관련 자료',
                marks: [
                  {
                    type: 'link',
                    attrs: { href: 'https://example.com/reference', target: '_blank' },
                  },
                ],
              },
            ],
          },
        ],
      },
      endsAt: '2026-08-01T00:00:00+09:00',
    });

    expect(result.content).toBe('현재 문제\n사용 가능한 공간이 부족합니다. 관련 자료');
    expect(result.contentDoc?.type).toBe('doc');
  });

  it('keeps legacy plain-text petitions compatible', () => {
    const result = parsePetitionCreate({
      title: '기존 입력',
      content: '  기존 본문  ',
      endsAt: '2026-08-01T00:00:00+09:00',
    });

    expect(result.content).toBe('기존 본문');
    expect(result.contentDoc).toBeUndefined();
  });

  it('rejects inline images in petition documents', () => {
    expect(() =>
      parsePetitionCreate({
        title: '이미지 청원',
        contentDoc: {
          type: 'doc',
          content: [{ type: 'image', attrs: { src: '/api/files/1/content' } }],
        },
        endsAt: '2026-08-01T00:00:00+09:00',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects empty content and unsafe links', () => {
    expect(() =>
      parsePetitionCreate({
        title: '빈 청원',
        content: '   ',
        endsAt: '2026-08-01T00:00:00+09:00',
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      parsePetitionCreate({
        title: '위험 링크',
        contentDoc: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: '열기',
                  marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
                },
              ],
            },
          ],
        },
        endsAt: '2026-08-01T00:00:00+09:00',
      }),
    ).toThrow(BadRequestException);
  });
});
