import { Mark } from '@tiptap/core';
import type { RichTextColor, RichTextFontSize, RichTextHighlight } from '@jshsus/types';

export const RICH_TEXT_COLOR_OPTIONS: ReadonlyArray<{
  value: RichTextColor;
  label: string;
}> = [
  { value: 'gray', label: '회색' },
  { value: 'red', label: '빨강' },
  { value: 'orange', label: '주황' },
  { value: 'green', label: '초록' },
  { value: 'blue', label: '파랑' },
  { value: 'purple', label: '보라' },
];

export const RICH_TEXT_FONT_SIZE_OPTIONS: ReadonlyArray<{
  value: RichTextFontSize;
  label: string;
}> = [
  { value: 'small', label: '작게' },
  { value: 'large', label: '크게' },
  { value: 'xlarge', label: '아주 크게' },
];

export const RICH_TEXT_HIGHLIGHT_OPTIONS: ReadonlyArray<{
  value: RichTextHighlight;
  label: string;
}> = [
  { value: 'yellow', label: '노랑' },
  { value: 'green', label: '연두' },
  { value: 'blue', label: '하늘' },
  { value: 'pink', label: '분홍' },
];

export const RICH_TEXT_COLOR_STYLES: Record<RichTextColor, string> = {
  gray: '#64748b',
  red: '#dc2626',
  orange: '#c2410c',
  green: '#047857',
  blue: '#1d4ed8',
  purple: '#7e22ce',
};

export const RICH_TEXT_FONT_SIZE_STYLES: Record<RichTextFontSize, string> = {
  small: '0.875em',
  large: '1.25em',
  xlarge: '1.5em',
};

export const RICH_TEXT_HIGHLIGHT_STYLES: Record<RichTextHighlight, string> = {
  yellow: '#fef08a',
  green: '#bbf7d0',
  blue: '#bfdbfe',
  pink: '#fbcfe8',
};

function styleMark<T extends string>({
  name,
  attribute,
  cssProperty,
  styles,
}: {
  name: string;
  attribute: string;
  cssProperty: 'color' | 'font-size' | 'background-color';
  styles: Record<T, string>;
}) {
  const allowedTokens = new Set(Object.keys(styles));
  const tokenForStyle = new Map(
    (Object.entries(styles) as Array<[T, string]>).flatMap(([token, style]) => [
      [style.toLowerCase(), token],
      [token.toLowerCase(), token],
    ]),
  );

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
            const token = tokenForStyle.get(node.style.getPropertyValue(cssProperty).toLowerCase());
            return token ? { [attribute]: token } : false;
          },
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      const token = HTMLAttributes[attribute];
      if (typeof token !== 'string' || !allowedTokens.has(token)) return ['span', {}, 0];
      return ['span', { style: `${cssProperty}: ${styles[token as T]}` }, 0];
    },
  });
}

export const TextColorMark = styleMark<RichTextColor>({
  name: 'textColor',
  attribute: 'color',
  cssProperty: 'color',
  styles: RICH_TEXT_COLOR_STYLES,
});

export const FontSizeMark = styleMark<RichTextFontSize>({
  name: 'fontSize',
  attribute: 'size',
  cssProperty: 'font-size',
  styles: RICH_TEXT_FONT_SIZE_STYLES,
});

export const TextHighlightMark = styleMark<RichTextHighlight>({
  name: 'highlight',
  attribute: 'color',
  cssProperty: 'background-color',
  styles: RICH_TEXT_HIGHLIGHT_STYLES,
});
