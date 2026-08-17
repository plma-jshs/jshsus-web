import { SegmentedControl } from '@jshsus/ui';
import type { ReactNode } from 'react';

export type SegmentedTabOption<T extends string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};

export function SegmentedTabs<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: T;
  options: ReadonlyArray<SegmentedTabOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <SegmentedControl
      value={value}
      options={options}
      onChange={onChange}
      ariaLabel={ariaLabel}
      className={['ui-segmented-tabs', className].filter(Boolean).join(' ')}
    />
  );
}
