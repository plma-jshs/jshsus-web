import { Search, X } from 'lucide-react';
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
  const Wrapper = as;
  const hasValue = value !== undefined && String(value).length > 0;
  const classes = ['admin-search-field', className ?? ''].filter(Boolean).join(' ');

  return (
    <Wrapper className={classes}>
      <Search size={iconSize} aria-hidden="true" />
      <input {...inputProps} type={type} value={value} />
      {clearable && onClear && hasValue ? (
        <button
          className="admin-search-clear"
          type="button"
          aria-label={clearLabel}
          onClick={onClear}
        >
          <X size={15} aria-hidden="true" />
        </button>
      ) : null}
      {children}
    </Wrapper>
  );
}
