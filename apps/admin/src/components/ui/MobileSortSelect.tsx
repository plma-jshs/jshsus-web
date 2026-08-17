import { AdminSelect } from './AdminSelect';

export type MobileSortOption = {
  value: string;
  label: string;
};

function splitSortValue(value: string) {
  const [id, direction] = value.split(':');
  return { id: id || value, direction: direction === 'desc' ? 'desc' : 'asc' } as const;
}

function criterionLabel(label: string) {
  return label
    .replace(/\s*(최신순|오래된순|오름차순|내림차순|높은\s*순|낮은\s*순|많은\s*순|적은\s*순)$/u, '')
    .trim();
}

export function MobileSortSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: MobileSortOption[];
  onChange: (value: string) => void;
}) {
  const { id: selectedCriterion, direction } = splitSortValue(value);
  const criteria = options.reduce<MobileSortOption[]>((unique, option) => {
    const { id } = splitSortValue(option.value);
    if (unique.some((candidate) => splitSortValue(candidate.value).id === id)) return unique;
    unique.push({ value: id, label: criterionLabel(option.label) });
    return unique;
  }, []);

  return (
    <label className="admin-mobile-sort-field">
      <span>정렬 기준</span>
      <span className="admin-mobile-sort-field__row">
        <AdminSelect
          aria-label="정렬 기준"
          value={selectedCriterion}
          onChange={(event) => onChange(`${event.target.value}:${direction}`)}
        >
          {criteria.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </AdminSelect>
        <button
          className="admin-mobile-sort-direction"
          type="button"
          aria-label={direction === 'asc' ? '오름차순으로 정렬' : '내림차순으로 정렬'}
          title={direction === 'asc' ? '오름차순' : '내림차순'}
          onClick={() => onChange(`${selectedCriterion}:${direction === 'asc' ? 'desc' : 'asc'}`)}
        >
          {direction === 'asc' ? '↑' : '↓'}
        </button>
      </span>
    </label>
  );
}
