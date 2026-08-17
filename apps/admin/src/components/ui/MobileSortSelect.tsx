import { SegmentedTabs } from './SegmentedTabs';

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
  const visibleOptions = options.filter(
    (option, index, all) =>
      all.findIndex((candidate) => candidate.value === option.value) === index,
  );
  const selectedValue = visibleOptions.some((option) => option.value === value)
    ? value
    : (visibleOptions[0]?.value ?? value);

  return (
    <div className="admin-mobile-sort-field">
      <SegmentedTabs
        value={selectedValue}
        options={visibleOptions}
        onChange={onChange}
        ariaLabel="정렬 기준"
        className="admin-mobile-sort-field__chips"
      />
    </div>
  );
}
