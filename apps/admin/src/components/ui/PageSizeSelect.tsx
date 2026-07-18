import { useEffect } from 'react';
import { ADMIN_PAGE_SIZES, normalizeAdminPageSize, type AdminPageSize } from '../dataTableConfig';

export { ADMIN_DEFAULT_PAGE_SIZE, ADMIN_PAGE_SIZES } from '../dataTableConfig';
export type { AdminPageSize } from '../dataTableConfig';

export function PageSizeSelect({
  value,
  onChange,
  ariaLabel = '페이지당 표시 건수',
}: {
  value: number;
  onChange: (value: AdminPageSize) => void;
  ariaLabel?: string;
}) {
  const normalizedValue = normalizeAdminPageSize(value);

  useEffect(() => {
    if (value !== normalizedValue) onChange(normalizedValue);
  }, [normalizedValue, onChange, value]);

  return (
    <select
      className="ui-page-size-select"
      value={normalizedValue}
      aria-label={ariaLabel}
      onChange={(event) => onChange(Number(event.target.value) as AdminPageSize)}
    >
      {ADMIN_PAGE_SIZES.map((size) => (
        <option key={size} value={size}>
          {size}건
        </option>
      ))}
    </select>
  );
}
