import { BadRequestException } from '@nestjs/common';
import type { PostStatus, RichTextDocument, RichTextNode } from '@jshsus/types';
import { z } from 'zod';
import { env } from '../../shared/config/env';

const MAX_DOCUMENT_BYTES = 1_000_000;
const MAX_DOCUMENT_NODES = 5_000;
const MAX_DOCUMENT_DEPTH = 20;

function isAllowedLink(value: string): boolean {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function isAllowedInlineImageSource(value: string): boolean {
  if (/^\/api\/files\/[1-9]\d*\/content$/.test(value)) return true;

  const publicBase = env.S3_PUBLIC_BASE_URL.replace(/\/+$/, '');
  if (!publicBase || !value.startsWith(`${publicBase}/`)) return false;

  try {
    const source = new URL(value);
    const base = new URL(publicBase);
    return source.protocol === base.protocol && source.origin === base.origin && !source.hash;
  } catch {
    return false;
  }
}

const linkMarkSchema = z
  .object({
    type: z.literal('link'),
    attrs: z
      .object({
        href: z.string().max(2_048).refine(isAllowedLink, 'Unsupported link URL protocol.'),
        target: z.literal('_blank').nullable().optional(),
        rel: z.string().max(120).nullable().optional(),
        class: z.null().optional(),
      })
      .strict(),
  })
  .strict();

const markSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }).strict(),
  z.object({ type: z.literal('italic') }).strict(),
  z.object({ type: z.literal('underline') }).strict(),
  z.object({ type: z.literal('strike') }).strict(),
  linkMarkSchema,
]);

const nodeTypes = [
  'paragraph',
  'heading',
  'text',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'hardBreak',
  'image',
] as const;

const richTextNodeSchema: z.ZodTypeAny = z.lazy(() =>
  z
    .object({
      type: z.enum(nodeTypes),
      attrs: z.unknown().optional(),
      content: z.array(richTextNodeSchema).max(500).optional(),
      text: z.string().max(20_000).optional(),
      marks: z.array(markSchema).max(20).optional(),
    })
    .strict()
    .superRefine((node, context) => {
      const hasText = node.text !== undefined;
      const hasMarks = node.marks !== undefined;
      const hasContent = node.content !== undefined;
      const hasAttrs = node.attrs !== undefined;

      if (node.type === 'text') {
        if (!hasText || node.text?.length === 0) {
          context.addIssue({ code: z.ZodIssueCode.custom, message: 'Text nodes need text.' });
        }
        if (hasContent || hasAttrs) {
          context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid text node.' });
        }
        return;
      }

      if (hasText || hasMarks) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Only text nodes may use text or marks.',
        });
      }

      if (node.type === 'image') {
        const parsedAttrs = z
          .object({
            src: z
              .string()
              .max(2_048)
              .refine(isAllowedInlineImageSource, 'Image must reference an uploaded file.'),
            alt: z.string().max(500).nullable().optional(),
            title: z.string().max(500).nullable().optional(),
          })
          .strict()
          .safeParse(node.attrs ?? {});
        if (!parsedAttrs.success) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['attrs'],
            message: parsedAttrs.error.issues[0]?.message ?? 'Invalid image attributes.',
          });
        }
        if (hasContent) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Image nodes cannot have children.',
          });
        }
        return;
      }

      if (node.type === 'heading') {
        const parsedAttrs = z
          .object({ level: z.union([z.literal(2), z.literal(3)]) })
          .strict()
          .safeParse(node.attrs);
        if (!parsedAttrs.success) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['attrs'],
            message: 'Only heading levels 2 and 3 are supported.',
          });
        }
      } else if (node.type === 'orderedList') {
        const parsedAttrs = z
          .object({
            start: z.number().int().min(1).max(1_000_000).optional().default(1),
            type: z.string().max(20).nullable().optional(),
          })
          .strict()
          .safeParse(node.attrs ?? {});
        if (!parsedAttrs.success) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['attrs'],
            message: 'Invalid ordered-list attributes.',
          });
        }
      } else if (hasAttrs) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'This node does not accept attributes.',
        });
      }

      if (node.type === 'hardBreak' && hasContent) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Hard breaks cannot have children.',
        });
      }
    }),
);

const blockTypes = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'blockquote',
  'image',
]);
const inlineTypes = new Set(['text', 'hardBreak', 'image']);

function validateDocumentStructure(document: RichTextDocument, context: z.RefinementCtx) {
  const visit = (node: RichTextNode, parentType: string, path: (string | number)[]) => {
    const type = node.type;
    const allowed =
      parentType === 'doc'
        ? blockTypes.has(type)
        : parentType === 'paragraph' || parentType === 'heading'
          ? inlineTypes.has(type)
          : parentType === 'bulletList' || parentType === 'orderedList'
            ? type === 'listItem'
            : parentType === 'listItem' || parentType === 'blockquote'
              ? blockTypes.has(type)
              : false;

    if (!allowed) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `${type} is not valid inside ${parentType}.`,
      });
      return;
    }

    for (const [index, child] of (node.content ?? []).entries()) {
      visit(child, type, [...path, 'content', index]);
    }
  };

  for (const [index, node] of document.content.entries()) {
    visit(node, 'doc', ['content', index]);
  }
}

export const richTextDocumentSchema = z
  .object({
    type: z.literal('doc'),
    content: z.array(richTextNodeSchema).min(1).max(500),
  })
  .strict()
  .superRefine((document, context) =>
    validateDocumentStructure(document as RichTextDocument, context),
  );

function assertDocumentBudget(value: unknown) {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new BadRequestException('contentDoc must be valid JSON.');
  }
  if (serialized.length > MAX_DOCUMENT_BYTES) {
    throw new BadRequestException('contentDoc is too large.');
  }

  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    if (current.depth > MAX_DOCUMENT_DEPTH || ++nodes > MAX_DOCUMENT_NODES) {
      throw new BadRequestException('contentDoc is too deeply nested or contains too many nodes.');
    }
    if (!current.value || typeof current.value !== 'object') continue;
    for (const child of Array.isArray(current.value)
      ? current.value
      : Object.values(current.value)) {
      stack.push({ value: child, depth: current.depth + 1 });
    }
  }
}

export function parseRichTextDocument(value: unknown): RichTextDocument {
  assertDocumentBudget(value);
  const parsed = richTextDocumentSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.flatten());
  }
  return parsed.data as RichTextDocument;
}

export function projectDocumentToPlainText(document: RichTextDocument): string {
  const parts: string[] = [];
  const visit = (node: RichTextNode) => {
    if (node.type === 'text' && node.text) parts.push(node.text);
    if (node.type === 'image') parts.push(node.attrs?.alt?.trim() || '[이미지]');
    for (const child of node.content ?? []) visit(child);
    if (['paragraph', 'heading', 'listItem', 'blockquote'].includes(node.type)) parts.push('\n');
  };
  for (const node of document.content) visit(node);
  return parts
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function collectInlineImageSources(document?: RichTextDocument | null): string[] {
  if (!document) return [];
  const sources = new Set<string>();
  const visit = (node: RichTextNode) => {
    if (node.type === 'image' && node.attrs?.src) sources.add(node.attrs.src);
    for (const child of node.content ?? []) visit(child);
  };
  for (const node of document.content) visit(node);
  return [...sources];
}

const createPostSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    content: z.string().max(MAX_DOCUMENT_BYTES).optional(),
    contentDoc: z.unknown().optional(),
    isAnonymous: z.boolean().optional().default(false),
  })
  .strict();

const updatePostSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    content: z.string().max(MAX_DOCUMENT_BYTES).optional(),
    contentDoc: z.unknown().nullable().optional(),
    isAnonymous: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export type NormalizedPostCreate = {
  title: string;
  content: string;
  contentDoc?: RichTextDocument;
  isAnonymous: boolean;
  status: PostStatus;
};

export type NormalizedPostUpdate = {
  title?: string;
  content?: string;
  contentDoc?: RichTextDocument | null;
  isAnonymous?: boolean;
};

export function parsePostCreate(body: unknown, status: PostStatus): NormalizedPostCreate {
  const parsed = createPostSchema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);

  const contentDoc =
    parsed.data.contentDoc === undefined
      ? undefined
      : parseRichTextDocument(parsed.data.contentDoc);
  const content = contentDoc
    ? projectDocumentToPlainText(contentDoc)
    : (parsed.data.content ?? '').trim();

  if (status === 'published' && content.length === 0) {
    throw new BadRequestException('Published posts need content.');
  }

  return { ...parsed.data, content, contentDoc, status };
}

export function parsePostUpdate(body: unknown): NormalizedPostUpdate {
  const parsed = updatePostSchema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);

  if (parsed.data.contentDoc === null) {
    return { ...parsed.data, contentDoc: null, content: (parsed.data.content ?? '').trim() };
  }
  if (parsed.data.contentDoc !== undefined) {
    const contentDoc = parseRichTextDocument(parsed.data.contentDoc);
    return { ...parsed.data, contentDoc, content: projectDocumentToPlainText(contentDoc) };
  }
  const { contentDoc: _contentDoc, ...plainData } = parsed.data;
  return {
    ...plainData,
    content: parsed.data.content === undefined ? undefined : parsed.data.content.trim(),
  };
}
