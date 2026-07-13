import type { JSONContent } from '@tiptap/react';
import type {
  RichTextDocument as PersistedRichTextDocument,
  RichTextMark as PersistedRichTextMark,
  RichTextNode as PersistedRichTextNode,
} from '@jshsus/types';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

export type RichTextDocument = JSONContent;

export type PendingEditorImage = {
  id: string;
  file: File;
  previewUrl: string;
};

export type RichTextEditorValue = {
  contentDoc: RichTextDocument;
  plainText: string;
  pendingImages: PendingEditorImage[];
};

type RichTextEditorProps = {
  id?: string;
  initialValue?: RichTextDocument;
  onChange: (value: RichTextEditorValue) => void;
  placeholder?: string;
  allowImages?: boolean;
  ariaLabel?: string;
};

type RichTextContentProps = {
  contentDoc?: RichTextDocument | null;
  plainText: string;
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const PendingImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      pendingId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-pending-id'),
        renderHTML: (attributes) =>
          attributes.pendingId ? { 'data-pending-id': attributes.pendingId as string } : {},
      },
    };
  },
});

function editorExtensions(
  options: { readonly?: boolean; placeholder?: string; allowImages?: boolean } = {},
) {
  const readonly = options.readonly ?? false;
  const allowImages = options.allowImages ?? true;
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      heading: { levels: [2, 3] },
      horizontalRule: false,
      link: {
        autolink: true,
        defaultProtocol: 'https',
        enableClickSelection: !readonly,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
        openOnClick: readonly,
      },
    }),
    ...(allowImages
      ? [
          PendingImage.configure({
            allowBase64: false,
            HTMLAttributes: { class: 'rich-text-image' },
          }),
        ]
      : []),
    ...(options.placeholder ? [Placeholder.configure({ placeholder: options.placeholder })] : []),
  ];
}

export function plainTextToRichTextDocument(value: string): RichTextDocument {
  const lines = value.replace(/\r\n/g, '\n').split('\n');

  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : undefined,
    })),
  };
}

function collectPendingIds(node: RichTextDocument, result = new Set<string>()) {
  if (node.type === 'image' && typeof node.attrs?.pendingId === 'string') {
    result.add(node.attrs.pendingId);
  }
  node.content?.forEach((child) => collectPendingIds(child, result));
  return result;
}

function createPendingId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `image-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function ToolbarButton({
  active = false,
  disabled = false,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={active ? 'is-active' : undefined}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  id = 'board-post-content',
  initialValue,
  onChange,
  placeholder = '내용을 입력하세요',
  allowImages = true,
  ariaLabel = '게시글 내용',
}: RichTextEditorProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingImagesRef = useRef(new Map<string, PendingEditorImage>());
  const onChangeRef = useRef(onChange);
  const [imageError, setImageError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    content: initialValue ?? plainTextToRichTextDocument(''),
    extensions: editorExtensions({ placeholder, allowImages }),
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        class: 'rich-text-editor__content',
        id,
      },
    },
    onCreate: ({ editor: currentEditor }) => {
      onChangeRef.current({
        contentDoc: currentEditor.getJSON(),
        plainText: currentEditor.getText({ blockSeparator: '\n' }).trim(),
        pendingImages: [],
      });
    },
    onUpdate: ({ editor: currentEditor }) => {
      const contentDoc = currentEditor.getJSON();
      const referencedIds = collectPendingIds(contentDoc);

      pendingImagesRef.current.forEach((image, pendingId) => {
        if (!referencedIds.has(pendingId)) {
          URL.revokeObjectURL(image.previewUrl);
          pendingImagesRef.current.delete(pendingId);
        }
      });

      onChangeRef.current({
        contentDoc,
        plainText: currentEditor.getText({ blockSeparator: '\n' }).trim(),
        pendingImages: [...pendingImagesRef.current.values()],
      });
    },
  });

  const toolbar = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor?.isActive('bold') ?? false,
      blockquote: currentEditor?.isActive('blockquote') ?? false,
      bulletList: currentEditor?.isActive('bulletList') ?? false,
      canRedo: currentEditor?.can().chain().focus().redo().run() ?? false,
      canUndo: currentEditor?.can().chain().focus().undo().run() ?? false,
      characterCount: currentEditor?.getText().length ?? 0,
      heading2: currentEditor?.isActive('heading', { level: 2 }) ?? false,
      heading3: currentEditor?.isActive('heading', { level: 3 }) ?? false,
      italic: currentEditor?.isActive('italic') ?? false,
      link: currentEditor?.isActive('link') ?? false,
      orderedList: currentEditor?.isActive('orderedList') ?? false,
      strike: currentEditor?.isActive('strike') ?? false,
      underline: currentEditor?.isActive('underline') ?? false,
    }),
  });

  useEffect(
    () => () => {
      pendingImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      pendingImagesRef.current.clear();
    },
    [],
  );

  if (!editor || !toolbar) return <div className="rich-text-editor is-loading" />;

  const insertImages = (files: FileList | null) => {
    setImageError(null);
    if (!files?.length) return;

    [...files].forEach((file) => {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        setImageError('JPG, PNG, WebP 이미지만 본문에 넣을 수 있습니다.');
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setImageError('이미지는 한 장당 10MB 이하여야 합니다.');
        return;
      }

      const id = createPendingId();
      const previewUrl = URL.createObjectURL(file);
      pendingImagesRef.current.set(id, { id, file, previewUrl });
      editor
        .chain()
        .focus()
        .setImage({ alt: file.name, pendingId: id, src: previewUrl } as never)
        .run();
    });

    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const openLinkEditor = () => {
    setLinkError(null);
    setLinkValue((editor.getAttributes('link').href as string | undefined) ?? '');
    setLinkOpen(true);
  };

  const applyLink = (event: FormEvent) => {
    event.preventDefault();
    const href = normalizeLink(linkValue);
    if (!href) {
      setLinkError('올바른 http 또는 https 주소를 입력해 주세요.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setLinkOpen(false);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkOpen(false);
  };

  return (
    <div className="rich-text-editor">
      <div aria-label="본문 서식" className="rich-text-toolbar" role="group">
        <div className="rich-text-toolbar__group">
          <ToolbarButton
            active={toolbar.heading2}
            label="제목 2"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 size={18} />
          </ToolbarButton>
          <ToolbarButton
            active={toolbar.heading3}
            label="제목 3"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <Heading3 size={18} />
          </ToolbarButton>
        </div>
        <div className="rich-text-toolbar__group">
          <ToolbarButton
            active={toolbar.bold}
            label="굵게"
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={17} />
          </ToolbarButton>
          <ToolbarButton
            active={toolbar.italic}
            label="기울임"
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={17} />
          </ToolbarButton>
          <ToolbarButton
            active={toolbar.underline}
            label="밑줄"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <Underline size={17} />
          </ToolbarButton>
          <ToolbarButton
            active={toolbar.strike}
            label="취소선"
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough size={17} />
          </ToolbarButton>
        </div>
        <div className="rich-text-toolbar__group">
          <ToolbarButton
            active={toolbar.bulletList}
            label="글머리 기호 목록"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List size={18} />
          </ToolbarButton>
          <ToolbarButton
            active={toolbar.orderedList}
            label="번호 목록"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={18} />
          </ToolbarButton>
          <ToolbarButton
            active={toolbar.blockquote}
            label="인용"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote size={17} />
          </ToolbarButton>
        </div>
        <div className="rich-text-toolbar__group">
          <ToolbarButton active={toolbar.link} label="링크" onClick={openLinkEditor}>
            <Link2 size={17} />
          </ToolbarButton>
          {allowImages ? (
            <>
              <ToolbarButton label="본문 이미지" onClick={() => imageInputRef.current?.click()}>
                <ImagePlus size={18} />
              </ToolbarButton>
              <input
                ref={imageInputRef}
                accept="image/jpeg,image/png,image/webp"
                aria-label="본문 이미지 선택"
                className="sr-only"
                multiple
                onChange={(event) => insertImages(event.target.files)}
                tabIndex={-1}
                type="file"
              />
            </>
          ) : null}
        </div>
        <div className="rich-text-toolbar__group rich-text-toolbar__history">
          <ToolbarButton
            disabled={!toolbar.canUndo}
            label="실행 취소"
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 size={17} />
          </ToolbarButton>
          <ToolbarButton
            disabled={!toolbar.canRedo}
            label="다시 실행"
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo2 size={17} />
          </ToolbarButton>
        </div>
      </div>
      {linkOpen ? (
        <form className="rich-text-link-editor" onSubmit={applyLink}>
          <label>
            <span className="sr-only">링크 주소</span>
            <input
              autoFocus
              inputMode="url"
              onChange={(event) => setLinkValue(event.target.value)}
              placeholder="https://example.com"
              type="text"
              value={linkValue}
            />
          </label>
          <button type="submit">적용</button>
          {toolbar.link ? (
            <button onClick={removeLink} title="링크 제거" type="button">
              <Unlink size={16} />
              <span className="sr-only">링크 제거</span>
            </button>
          ) : null}
          <button onClick={() => setLinkOpen(false)} type="button">
            취소
          </button>
        </form>
      ) : null}
      {linkError ? <p className="rich-text-editor__error">{linkError}</p> : null}
      <EditorContent editor={editor} />
      <footer className="rich-text-editor__footer">
        {imageError ? <span className="rich-text-editor__error">{imageError}</span> : <span />}
        <span>{toolbar.characterCount.toLocaleString('ko-KR')}자</span>
      </footer>
    </div>
  );
}

export function RichTextContent({ contentDoc, plainText }: RichTextContentProps) {
  const editor = useEditor({
    content: contentDoc ?? plainTextToRichTextDocument(plainText),
    editable: false,
    extensions: editorExtensions({ readonly: true }),
    editorProps: {
      attributes: {
        class: 'rich-text-renderer__content',
      },
    },
  });

  useEffect(() => {
    if (editor) editor.commands.setContent(contentDoc ?? plainTextToRichTextDocument(plainText));
  }, [contentDoc, editor, plainText]);

  return <EditorContent className="rich-text-renderer" editor={editor} />;
}

function normalizeMarks(marks: JSONContent[] | undefined): PersistedRichTextMark[] | undefined {
  const normalized = marks?.flatMap((mark): PersistedRichTextMark[] => {
    if (['bold', 'italic', 'underline', 'strike'].includes(mark.type ?? '')) {
      return [{ type: mark.type as 'bold' | 'italic' | 'underline' | 'strike' }];
    }
    if (mark.type !== 'link' || typeof mark.attrs?.href !== 'string') return [];

    const href = normalizeLink(mark.attrs.href);
    if (!href) return [];
    return [
      {
        type: 'link',
        attrs: {
          href,
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      },
    ];
  });
  return normalized?.length ? normalized : undefined;
}

function toPersistedNode(
  node: JSONContent,
  uploadedUrls?: ReadonlyMap<string, string>,
): PersistedRichTextNode | null {
  const supportedTypes = new Set([
    'paragraph',
    'heading',
    'text',
    'bulletList',
    'orderedList',
    'listItem',
    'blockquote',
    'hardBreak',
    'image',
  ]);
  if (!node.type || !supportedTypes.has(node.type)) return null;

  if (node.type === 'text') {
    if (!node.text) return null;
    return {
      type: 'text',
      marks: normalizeMarks(node.marks),
      text: node.text,
    };
  }

  if (node.type === 'image') {
    const pendingId = typeof node.attrs?.pendingId === 'string' ? node.attrs.pendingId : null;
    const currentSource = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
    const src = pendingId ? uploadedUrls?.get(pendingId) : currentSource;
    if (!src || /^(?:blob:|data:)/i.test(src)) return null;
    return {
      type: 'image',
      attrs: {
        src,
        alt: typeof node.attrs?.alt === 'string' ? node.attrs.alt : null,
        title: typeof node.attrs?.title === 'string' ? node.attrs.title : null,
      },
    };
  }

  const content = node.content
    ?.map((child) => toPersistedNode(child, uploadedUrls))
    .filter((child): child is PersistedRichTextNode => child !== null);

  return {
    type: node.type as PersistedRichTextNode['type'],
    ...(node.type === 'heading'
      ? { attrs: { level: node.attrs?.level === 3 ? 3 : 2 } as const }
      : {}),
    ...(content?.length ? { content } : {}),
  };
}

function toPersistedDocument(
  contentDoc: RichTextDocument,
  uploadedUrls?: ReadonlyMap<string, string>,
): PersistedRichTextDocument {
  const content = contentDoc.content
    ?.map((node) => toPersistedNode(node, uploadedUrls))
    .filter((node): node is PersistedRichTextNode => node !== null);

  return {
    type: 'doc',
    content: content?.length ? content : [{ type: 'paragraph' }],
  };
}

export function stripPendingImages(contentDoc: RichTextDocument): PersistedRichTextDocument {
  return toPersistedDocument(contentDoc);
}

export function resolvePendingImages(
  contentDoc: RichTextDocument,
  uploadedUrls: ReadonlyMap<string, string>,
): PersistedRichTextDocument {
  return toPersistedDocument(contentDoc, uploadedUrls);
}

export function hasTemporaryImageSources(contentDoc: RichTextDocument): boolean {
  if (
    contentDoc.type === 'image' &&
    (typeof contentDoc.attrs?.pendingId === 'string' ||
      (typeof contentDoc.attrs?.src === 'string' && /^(?:blob:|data:)/i.test(contentDoc.attrs.src)))
  ) {
    return true;
  }
  return contentDoc.content?.some(hasTemporaryImageSources) ?? false;
}

export function getRichTextImageSources(contentDoc?: RichTextDocument | null): Set<string> {
  const result = new Set<string>();
  const visit = (node: RichTextDocument) => {
    if (node.type === 'image' && typeof node.attrs?.src === 'string') {
      result.add(node.attrs.src);
    }
    node.content?.forEach(visit);
  };
  if (contentDoc) visit(contentDoc);
  return result;
}
