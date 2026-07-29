import type { RichTextDocument } from '@jshsus/types';

const RICH_NOTICE_PREFIX = 'jshsus-rich-text:v1\n';

type RichNoticeEnvelope = {
  contentDoc: RichTextDocument;
  plainText: string;
};

const htmlEntities: Record<string, string> = {
  amp: '&',
  apos: "'",
  bull: '•',
  gt: '>',
  hellip: '…',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  mdash: '—',
  middot: '·',
  nbsp: ' ',
  ndash: '–',
  quot: '"',
  rdquo: '”',
  rsquo: '’',
};

function isRichTextDocument(value: unknown): value is RichTextDocument {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; content?: unknown };
  return candidate.type === 'doc' && Array.isArray(candidate.content);
}

export function decodeNoticeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);?/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z][a-z0-9]+);?/gi, (match, name: string) => {
      return htmlEntities[name.toLowerCase()] ?? match;
    })
    .replace(/\u00a0/g, ' ');
}

function decodeRichTextValue(value: unknown): unknown {
  if (typeof value === 'string') return decodeNoticeHtmlEntities(value);
  if (Array.isArray(value)) return value.map(decodeRichTextValue);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, decodeRichTextValue(entry)]),
  );
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
  if (!content.startsWith(RICH_NOTICE_PREFIX)) {
    return { plainText: decodeNoticeHtmlEntities(content) };
  }

  try {
    const parsed = JSON.parse(
      content.slice(RICH_NOTICE_PREFIX.length),
    ) as Partial<RichNoticeEnvelope>;
    if (!isRichTextDocument(parsed.contentDoc) || typeof parsed.plainText !== 'string') {
      return { plainText: decodeNoticeHtmlEntities(content) };
    }
    return {
      contentDoc: decodeRichTextValue(parsed.contentDoc) as RichTextDocument,
      plainText: decodeNoticeHtmlEntities(parsed.plainText),
    };
  } catch {
    return { plainText: decodeNoticeHtmlEntities(content) };
  }
}
