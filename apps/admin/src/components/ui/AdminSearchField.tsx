import { SearchField as SharedSearchField } from '@jshsus/ui';
import type { InputHTMLAttributes, ReactNode } from 'react';

export type AdminSearchFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'type'
> & {
  /** Classes applied to the shared field wrapper (layout hooks can be added here). */
  className?: string;
  /** Use a span when the field is nested inside another label (for example a form row). */
  as?: 'label' | 'span';
  /** Search fields use `search` by default; datalist-backed fields can opt into `text`. */
  type?: 'search' | 'text';
  iconSize?: number;
  clearable?: boolean;
  onClear?: () => void;
  clearLabel?: string;
  children?: ReactNode;
};

/**
 * Canonical admin search control.
 *
 * The wrapper owns the border/focus ring and the input is deliberately
 * transparent. Keeping that contract in one component prevents pages from
 * accidentally rendering a second native input border or a different clear
 * button treatment.
 */
export function AdminSearchField({
  className,
  as = 'label',
  type = 'search',
  iconSize = 16,
  clearable = true,
  onClear,
  clearLabel = '검색어 지우기',
  children,
  value,
  ...inputProps
}: AdminSearchFieldProps) {
  const classes = ['admin-search-field', className ?? ''].filter(Boolean).join(' ');

  return (
    <SharedSearchField
      {...inputProps}
      as={as}
      type={type}
      iconSize={iconSize}
      className={classes}
      value={value}
      clearable={clearable}
      onClear={onClear}
      clearLabel={clearLabel}
      clearClassName="admin-search-clear"
    >
      {children}
    </SharedSearchField>
  );
}
