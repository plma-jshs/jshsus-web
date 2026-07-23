import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  parsePostCreate,
  parsePostUpdate,
  extractPollDefinitions,
  projectDocumentToPlainText,
  richTextDocumentSchema,
} from './post-content';

const tiptapDocument = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: '제목' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', marks: [{ type: 'bold' }], text: '본문 ' },
        {
          type: 'text',
          marks: [
            {
              type: 'link',
              attrs: {
                href: 'https://jshsus.kr/help',
                target: '_blank',
                rel: 'noopener noreferrer nofollow',
                class: null,
              },
            },
          ],
          text: '링크',
        },
      ],
    },
    {
      type: 'orderedList',
      attrs: { start: 1, type: null },
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '첫 항목' }] }],
        },
      ],
    },
    {
      type: 'image',
      attrs: { src: '/api/files/7/content', alt: '첨부 이미지', title: null },
    },
    {
      type: 'poll',
      attrs: {
        id: 'poll-1',
        question: '가장 기대되는 급식은?',
        options: [
          { id: 'option-1', text: '돈가스' },
          { id: 'option-2', text: '비빔밥' },
        ],
      },
    },
  ],
} as const;

describe('board post rich-text validation', () => {
  it('accepts a standard Tiptap document and creates a plain-text projection', () => {
    expect(richTextDocumentSchema.safeParse(tiptapDocument).success).toBe(true);
    const parsed = parsePostCreate(
      { title: '게시글', contentDoc: tiptapDocument, isAnonymous: false },
      'published',
    );

    expect(parsed.contentDoc).toEqual(tiptapDocument);
    expect(projectDocumentToPlainText(parsed.contentDoc!)).toContain('본문 링크');
    expect(parsed.content).toContain('첨부 이미지');
    expect(parsed.content).toContain('가장 기대되는 급식은?');
    expect(extractPollDefinitions(parsed.contentDoc!)).toEqual([
      {
        id: 'poll-1',
        question: '가장 기대되는 급식은?',
        options: [
          { id: 'option-1', text: '돈가스' },
          { id: 'option-2', text: '비빔밥' },
        ],
      },
    ]);
  });

  it('keeps plain-text create requests compatible and permits empty drafts', () => {
    expect(parsePostCreate({ title: '기존 글', content: '내용' }, 'published').content).toBe(
      '내용',
    );
    expect(parsePostCreate({ title: '임시 글' }, 'draft')).toMatchObject({
      content: '',
      status: 'draft',
    });
  });

  it('rejects script links and external or data image sources', () => {
    type MutableFixture = {
      content: Array<{
        attrs?: { src?: string };
        content?: Array<{ marks?: Array<{ attrs?: { href?: string } }> }>;
      }>;
    };
    const scriptLink = structuredClone(tiptapDocument) as unknown as MutableFixture;
    scriptLink.content[1]!.content![1]!.marks![0]!.attrs!.href = 'javascript:alert(1)';
    expect(() => parsePostCreate({ title: '글', contentDoc: scriptLink }, 'published')).toThrow(
      BadRequestException,
    );

    for (const src of ['https://evil.example/image.png', 'data:image/png;base64,AA==']) {
      const externalImage = structuredClone(tiptapDocument) as unknown as MutableFixture;
      externalImage.content[3]!.attrs!.src = src;
      expect(() =>
        parsePostCreate({ title: '글', contentDoc: externalImage }, 'published'),
      ).toThrow(BadRequestException);
    }
  });

  it('allows only the declared text color, size, and highlight tokens', () => {
    const styledDocument = structuredClone(tiptapDocument) as unknown as {
      content: Array<{ content?: Array<{ marks?: unknown[] }> }>;
    };
    styledDocument.content[1]!.content![0]!.marks = [
      { type: 'textColor', attrs: { color: 'blue' } },
      { type: 'fontSize', attrs: { size: 'large' } },
      { type: 'highlight', attrs: { color: 'yellow' } },
    ];
    expect(
      parsePostCreate({ title: '서식 글', contentDoc: styledDocument }, 'published').contentDoc,
    ).toEqual(styledDocument);

    styledDocument.content[1]!.content![0]!.marks = [
      { type: 'textColor', attrs: { color: 'expression(alert(1))' } },
    ];
    expect(() =>
      parsePostCreate({ title: '위험한 서식', contentDoc: styledDocument }, 'published'),
    ).toThrow(BadRequestException);
  });

  it('normalizes rich-text updates and rejects empty update objects', () => {
    expect(parsePostUpdate({ contentDoc: tiptapDocument }).content).toContain('본문 링크');
    expect(() => parsePostUpdate({})).toThrow(BadRequestException);
  });
});
