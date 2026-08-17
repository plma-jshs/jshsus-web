import type { InputHTMLAttributes } from 'react';

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
  label = '기간',
}: {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  label?: string;
}) {
  return (
    <fieldset className="ui-date-range" aria-label={label}>
      <legend className="ui-date-range__label">{label}</legend>
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
