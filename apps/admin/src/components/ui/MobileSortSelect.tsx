import { AdminSelect } from './AdminSelect';

export type MobileSortOption = {
  value: string;
  label: string;
};

export function MobileSortSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: MobileSortOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="admin-mobile-sort-field">
      <span>정렬 기준</span>
      <AdminSelect
        aria-label="정렬 기준"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </AdminSelect>
    </label>
  );
}
