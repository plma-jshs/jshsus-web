import type { ReactNode } from 'react';

export type SegmentedControlOption<T extends string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  role = 'tablist',
}: {
  value: T;
  options: ReadonlyArray<SegmentedControlOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  role?: 'tablist' | 'group';
}) {
  const isTablist = role === 'tablist';
  return (
    <div
      className={['ui-segmented-control', className].filter(Boolean).join(' ')}
      role={role}
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={selected ? 'is-active' : undefined}
            role={isTablist ? 'tab' : undefined}
            aria-selected={isTablist ? selected : undefined}
            aria-pressed={isTablist ? undefined : selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
