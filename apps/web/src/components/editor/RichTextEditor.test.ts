import { describe, expect, it } from 'vitest';
import {
  getRichTextImageSources,
  hasTemporaryImageSources,
  plainTextToRichTextDocument,
  resolvePendingImages,
  stripPendingImages,
  type RichTextDocument,
} from './RichTextEditor';

const documentWithPendingImage: RichTextDocument = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: '학교 홈페이지',
          marks: [
            {
              type: 'link',
              attrs: {
                href: 'https://jshsus.kr',
                class: null,
                rel: 'noopener noreferrer nofollow',
                target: '_blank',
              },
            },
          ],
        },
      ],
    },
    {
      type: 'image',
      attrs: {
        alt: '학교 전경.jpg',
        pendingId: 'pending-1',
        src: 'blob:http://localhost/pending-1',
        title: null,
      },
    },
  ],
};

describe('rich-text document persistence', () => {
  it('never sends temporary image URLs in a draft document', () => {
    const draft = stripPendingImages(documentWithPendingImage);

    expect(hasTemporaryImageSources(draft)).toBe(false);
    expect(draft.content).toHaveLength(1);
    expect(draft.content[0]?.content?.[0]?.marks?.[0]).toEqual({
      type: 'link',
      attrs: {
        href: 'https://jshsus.kr/',
        rel: 'noopener noreferrer',
        target: '_blank',
      },
    });
  });

  it('persists only allowlisted visual style marks', () => {
    const styled = plainTextToRichTextDocument('서식') as RichTextDocument;
    styled.content![0]!.content![0]!.marks = [
      { type: 'textColor', attrs: { color: 'blue' } },
      { type: 'fontSize', attrs: { size: 'large' } },
      { type: 'highlight', attrs: { color: 'yellow' } },
      { type: 'textColor', attrs: { color: 'javascript:alert(1)' } },
    ];

    expect(stripPendingImages(styled).content[0]?.content?.[0]?.marks).toEqual([
      { type: 'textColor', attrs: { color: 'blue' } },
      { type: 'fontSize', attrs: { size: 'large' } },
      { type: 'highlight', attrs: { color: 'yellow' } },
    ]);
  });

  it('replaces pending images with the uploaded inline endpoint', () => {
    const persisted = resolvePendingImages(
      documentWithPendingImage,
      new Map([['pending-1', '/api/files/17/content']]),
    );

    expect(hasTemporaryImageSources(persisted)).toBe(false);
    expect(persisted.content[1]).toEqual({
      type: 'image',
      attrs: {
        alt: '학교 전경.jpg',
        src: '/api/files/17/content',
        title: null,
      },
    });
    expect(getRichTextImageSources(persisted)).toEqual(new Set(['/api/files/17/content']));
  });
});
