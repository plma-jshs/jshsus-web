import { Search, X } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode } from 'react';

export type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'> & {
  className?: string;
  as?: 'div' | 'label' | 'span';
  type?: 'search' | 'text';
  iconSize?: number;
  clearable?: boolean;
  onClear?: () => void;
  clearLabel?: string;
  clearClassName?: string;
  children?: ReactNode;
};

/**
 * Shared search-field behavior for both public and admin surfaces.
 * The wrapper owns the chrome; app styles can change the wrapper class without
 * reimplementing the icon, clear affordance, or accessible input contract.
 */
export function SearchField({
  className,
  as = 'div',
  type = 'search',
  iconSize = 16,
  clearable = true,
  onClear,
  clearLabel = '검색어 지우기',
  clearClassName,
  children,
  value,
  ...inputProps
}: SearchFieldProps) {
  const Wrapper = as;
  const hasValue = value !== undefined && String(value).length > 0;

  return (
    <Wrapper className={className}>
      <Search size={iconSize} aria-hidden="true" />
      <input {...inputProps} type={type} value={value} />
      {clearable && onClear && hasValue ? (
        <button className={clearClassName} type="button" aria-label={clearLabel} onClick={onClear}>
          <X size={15} aria-hidden="true" />
        </button>
      ) : null}
      {children}
    </Wrapper>
  );
}
