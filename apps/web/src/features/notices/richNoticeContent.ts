import type { RichTextDocument } from '@jshsus/types';

const RICH_NOTICE_PREFIX = 'jshsus-rich-text:v1\n';

type RichNoticeEnvelope = {
  contentDoc: RichTextDocument;
  plainText: string;
};

function isRichTextDocument(value: unknown): value is RichTextDocument {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; content?: unknown };
  return candidate.type === 'doc' && Array.isArray(candidate.content);
}

export function serializeRichNoticeContent(
  contentDoc: RichTextDocument,
  plainText: string,
): string {
  return `${RICH_NOTICE_PREFIX}${JSON.stringify({ contentDoc, plainText } satisfies RichNoticeEnvelope)}`;
}

export function parseRichNoticeContent(content: string): {
  contentDoc?: RichTextDocument;
  plainText: string;
} {
  if (!content.startsWith(RICH_NOTICE_PREFIX)) return { plainText: content };

  try {
    const parsed = JSON.parse(
      content.slice(RICH_NOTICE_PREFIX.length),
    ) as Partial<RichNoticeEnvelope>;
    if (!isRichTextDocument(parsed.contentDoc) || typeof parsed.plainText !== 'string') {
      return { plainText: content };
    }
    return { contentDoc: parsed.contentDoc, plainText: parsed.plainText };
  } catch {
    return { plainText: content };
  }
}
