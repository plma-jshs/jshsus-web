import type { InputHTMLAttributes } from 'react';

export type DateRangePreset = 'today' | '7d' | 'month' | 'all';

const dateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function getDateRangePreset(preset: DateRangePreset) {
  if (preset === 'all') return { from: '', to: '' };
  const end = new Date();
  const start = new Date(end);
  if (preset === '7d') start.setDate(start.getDate() - 6);
  if (preset === 'month') start.setMonth(start.getMonth() - 1);
  const today = dateInputValue(end);
  return { from: dateInputValue(start), to: today };
}

export function DateInput({
  value,
  placeholder,
  className,
  onClick,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  value: string;
  placeholder: string;
}) {
  return (
    <label
      className={`ui-date-input${value ? '' : ' is-empty'}${className ? ` ${className}` : ''}`}
    >
      <span aria-hidden="true">{placeholder}</span>
      <input
        {...props}
        type="date"
        value={value}
        onClick={(event) => {
          onClick?.(event);
          event.currentTarget.showPicker?.();
        }}
      />
    </label>
  );
}

export function DateRangeField({
  from,
  to,
  onFromChange,
  onToChange,
  onPresetChange,
  label = '기간',
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onPresetChange?: (preset: DateRangePreset) => void;
  label?: string;
}) {
  const presets: Array<{ value: DateRangePreset; label: string }> = [
    { value: 'today', label: '오늘' },
    { value: '7d', label: '7일' },
    { value: 'month', label: '1개월' },
    { value: 'all', label: '전체' },
  ];

  const applyPreset = (preset: DateRangePreset) => {
    onPresetChange?.(preset);
    if (onPresetChange) return;
    const range = getDateRangePreset(preset);
    onFromChange(range.from);
    onToChange(range.to);
  };

  return (
    <fieldset className="ui-date-range" aria-label={label}>
      <legend className="ui-date-range__label">{label}</legend>
      {onPresetChange ? (
        <div className="ui-date-range__presets" role="group" aria-label="빠른 기간 선택">
          {presets.map((preset) => (
            <button
              className="ui-date-range__preset"
              key={preset.value}
              type="button"
              aria-pressed={(() => {
                const range = getDateRangePreset(preset.value);
                return from === range.from && to === range.to;
              })()}
              onClick={() => applyPreset(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="ui-date-range__controls">
        <DateInput
          value={from}
          placeholder="시작일"
          max={to || undefined}
          aria-label={`${label} 시작일`}
          onChange={(event) => onFromChange(event.target.value)}
        />
        <span aria-hidden="true">〜</span>
        <DateInput
          value={to}
          placeholder="종료일"
          min={from || undefined}
          aria-label={`${label} 종료일`}
          onChange={(event) => onToChange(event.target.value)}
        />
      </div>
    </fieldset>
  );
}
