import { Mark, mergeAttributes } from '@tiptap/core';
import type {
  RichTextColor,
  RichTextFontFamily,
  RichTextFontSize,
  RichTextHighlight,
} from '@jshsus/types';

type MarkStyleConfig = {
  name: string;
  attribute: string;
  cssProperty: 'color' | 'font-size' | 'background-color' | 'font-family';
  normalize: (value: unknown) => string | null;
  styleForValue: (value: string) => string | null;
};

export const RICH_TEXT_FONT_FAMILY_OPTIONS: ReadonlyArray<{
  value: RichTextFontFamily;
  label: string;
}> = [
  { value: 'malgun-gothic', label: '맑은 고딕' },
  { value: 'gulim', label: '굴림' },
  { value: 'batang', label: '바탕' },
  { value: 'dotum', label: '돋움' },
  { value: 'gungsuh', label: '궁서' },
  { value: 'arial', label: 'Arial' },
  { value: 'arial-black', label: 'Arial Black' },
  { value: 'calibri', label: 'Calibri' },
  { value: 'cambria', label: 'Cambria' },
  { value: 'comic-sans-ms', label: 'Comic Sans MS' },
  { value: 'courier-new', label: 'Courier New' },
  { value: 'impact', label: 'Impact' },
  { value: 'times-new-roman', label: 'Times New Roman' },
  { value: 'noto-sans-kr', label: 'Noto Sans KR' },
  { value: 'noto-serif-kr', label: 'Noto Serif KR' },
  { value: 'nanum-gothic', label: '나눔고딕' },
  { value: 'nanum-myeongjo', label: '나눔명조' },
];

export const RICH_TEXT_FONT_FAMILY_STYLES: Record<string, string> = {
  pretendard: 'Pretendard, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  'malgun-gothic': '"Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", sans-serif',
  gulim: 'Gulim, "굴림", sans-serif',
  batang: 'Batang, "바탕", serif',
  dotum: 'Dotum, "돋움", sans-serif',
  gungsuh: 'Gungsuh, "궁서", serif',
  arial: 'Arial, Helvetica, sans-serif',
  'arial-black': '"Arial Black", Arial, sans-serif',
  calibri: 'Calibri, Candara, Segoe, "Segoe UI", sans-serif',
  cambria: 'Cambria, Georgia, serif',
  'comic-sans-ms': '"Comic Sans MS", "Comic Sans", cursive',
  'courier-new': '"Courier New", Courier, monospace',
  impact: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
  'times-new-roman': '"Times New Roman", Times, serif',
  'noto-sans-kr': '"Noto Sans KR", "Noto Sans CJK KR", sans-serif',
  'noto-serif-kr': '"Noto Serif KR", "Noto Serif CJK KR", serif',
  'nanum-gothic': '"Nanum Gothic", "나눔고딕", sans-serif',
  'nanum-myeongjo': '"Nanum Myeongjo", "나눔명조", serif',
  gothic: '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  monospace: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
};

export const RICH_TEXT_FONT_SIZE_OPTIONS: ReadonlyArray<{
  value: RichTextFontSize;
  label: string;
}> = [
  { value: '8px', label: '8' },
  { value: '9px', label: '9' },
  { value: '10px', label: '10' },
  { value: '11px', label: '11' },
  { value: '12px', label: '12' },
  { value: '14px', label: '14' },
  { value: '16px', label: '16' },
  { value: '18px', label: '18' },
  { value: '20px', label: '20' },
  { value: '22px', label: '22' },
  { value: '24px', label: '24' },
  { value: '28px', label: '28' },
  { value: '30px', label: '30' },
  { value: '36px', label: '36' },
  { value: '50px', label: '50' },
  { value: '72px', label: '72' },
  { value: '96px', label: '96' },
];

export const RICH_TEXT_FONT_SIZE_STYLES: Record<string, string> = {
  ...Object.fromEntries(RICH_TEXT_FONT_SIZE_OPTIONS.map((option) => [option.value, option.value])),
  small: '14px',
  large: '20px',
  xlarge: '24px',
};

export const RICH_TEXT_COLOR_OPTIONS: ReadonlyArray<{
  value: RichTextColor;
  label: string;
}> = [
  { value: '#111827', label: '검정' },
  { value: '#ef4444', label: '빨강' },
  { value: '#f97316', label: '주황' },
  { value: '#facc15', label: '노랑' },
  { value: '#22c55e', label: '초록' },
  { value: '#06b6d4', label: '청록' },
  { value: '#2563eb', label: '파랑' },
  { value: '#9333ea', label: '보라' },
  { value: '#64748b', label: '회색' },
  { value: '#fca5a5', label: '연빨강' },
  { value: '#fdba74', label: '연주황' },
  { value: '#fde68a', label: '연노랑' },
  { value: '#bbf7d0', label: '연초록' },
  { value: '#a5f3fc', label: '연청록' },
  { value: '#bfdbfe', label: '연파랑' },
  { value: '#e9d5ff', label: '연보라' },
];

export const RICH_TEXT_COLOR_STYLES: Record<string, string> = Object.fromEntries(
  RICH_TEXT_COLOR_OPTIONS.map((option) => [option.value, option.value]),
);

export const RICH_TEXT_HIGHLIGHT_OPTIONS: ReadonlyArray<{
  value: RichTextHighlight;
  label: string;
}> = [
  { value: '#ffffff', label: '흰색' },
  { value: '#fee2e2', label: '분홍' },
  { value: '#ffedd5', label: '살구' },
  { value: '#fef3c7', label: '노랑' },
  { value: '#dcfce7', label: '연두' },
  { value: '#ccfbf1', label: '민트' },
  { value: '#dbeafe', label: '하늘' },
  { value: '#ede9fe', label: '라벤더' },
  { value: '#e5e7eb', label: '회색' },
  { value: '#fecaca', label: '연빨강' },
  { value: '#fed7aa', label: '연주황' },
  { value: '#fde68a', label: '연노랑' },
  { value: '#bbf7d0', label: '연초록' },
  { value: '#a7f3d0', label: '연민트' },
  { value: '#bfdbfe', label: '연파랑' },
  { value: '#f5d0fe', label: '연보라' },
];

export const RICH_TEXT_HIGHLIGHT_STYLES: Record<string, string> = Object.fromEntries(
  RICH_TEXT_HIGHLIGHT_OPTIONS.map((option) => [option.value, option.value]),
);

const colorAliases: Record<string, string> = {
  gray: '#64748b',
  red: '#ef4444',
  orange: '#f97316',
  green: '#22c55e',
  blue: '#2563eb',
  purple: '#9333ea',
  yellow: '#fef3c7',
  pink: '#fee2e2',
};

const fontSizeAliases: Record<string, string> = {
  small: '14px',
  large: '20px',
  xlarge: '24px',
};

function expandShortHex(value: string) {
  return `#${value
    .slice(1)
    .split('')
    .map((character) => `${character}${character}`)
    .join('')}`;
}

function toHexChannel(value: number) {
  return value.toString(16).padStart(2, '0');
}

export function normalizeRichTextColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  const alias = colorAliases[trimmed];
  if (alias) return alias;
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) return expandShortHex(trimmed);
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;

  const rgb = trimmed.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/,
  );
  if (!rgb) return null;

  const channels = rgb.slice(1, 4).map(Number);
  if (channels.some((channel) => channel < 0 || channel > 255)) return null;
  return `#${channels.map(toHexChannel).join('')}`;
}

export function normalizeRichTextFontSize(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  const aliased = fontSizeAliases[trimmed] ?? trimmed;
  const px = aliased.match(/^(\d{1,3})(?:px)?$/);
  if (!px) return null;

  const size = Number(px[1]);
  if (!Number.isInteger(size) || size < 8 || size > 96) return null;
  return `${size}px`;
}

function normalizeFamilyStyle(value: string) {
  return value
    .toLowerCase()
    .replaceAll('"', '')
    .replaceAll("'", '')
    .replace(/\s*,\s*/g, ',')
    .trim();
}

const fontFamilyLookup = new Map<string, string>(
  Object.entries(RICH_TEXT_FONT_FAMILY_STYLES).flatMap(([token, style]) => [
    [token, token],
    [normalizeFamilyStyle(style), token],
  ]),
);

export function normalizeRichTextFontFamily(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return fontFamilyLookup.get(normalizeFamilyStyle(trimmed)) ?? null;
}

function styleMark({ name, attribute, cssProperty, normalize, styleForValue }: MarkStyleConfig) {
  return Mark.create({
    name,
    excludes: '',
    inclusive: true,

    addAttributes() {
      return {
        [attribute]: {
          default: null,
        },
      };
    },

    parseHTML() {
      return [
        {
          tag: 'span',
          getAttrs: (node) => {
            if (!(node instanceof HTMLElement)) return false;
            const value = normalize(node.style.getPropertyValue(cssProperty));
            return value ? { [attribute]: value } : false;
          },
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      const value = normalize(HTMLAttributes[attribute]);
      const style = value ? styleForValue(value) : null;
      if (!style) return ['span', {}, 0];
      return ['span', { style: `${cssProperty}: ${style}` }, 0];
    },
  });
}

export const TextColorMark = styleMark({
  name: 'textColor',
  attribute: 'color',
  cssProperty: 'color',
  normalize: normalizeRichTextColor,
  styleForValue: (value) => value,
});

export const FontSizeMark = styleMark({
  name: 'fontSize',
  attribute: 'size',
  cssProperty: 'font-size',
  normalize: normalizeRichTextFontSize,
  styleForValue: (value) => value,
});

export const FontFamilyMark = styleMark({
  name: 'fontFamily',
  attribute: 'family',
  cssProperty: 'font-family',
  normalize: normalizeRichTextFontFamily,
  styleForValue: (value) => RICH_TEXT_FONT_FAMILY_STYLES[value] ?? null,
});

export const TextHighlightMark = styleMark({
  name: 'highlight',
  attribute: 'color',
  cssProperty: 'background-color',
  normalize: normalizeRichTextColor,
  styleForValue: (value) => value,
});

export const SuperscriptMark = Mark.create({
  name: 'superscript',
  excludes: 'subscript',

  parseHTML() {
    return [{ tag: 'sup' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes), 0];
  },
});

export const SubscriptMark = Mark.create({
  name: 'subscript',
  excludes: 'superscript',

  parseHTML() {
    return [{ tag: 'sub' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['sub', mergeAttributes(HTMLAttributes), 0];
  },
});
