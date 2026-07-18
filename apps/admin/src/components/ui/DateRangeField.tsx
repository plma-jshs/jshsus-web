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
    <fieldset className="ui-date-range">
      <legend>{label}</legend>
      <div className="ui-date-range__controls">
        <input
          type="date"
          value={from}
          aria-label={`${label} 시작일`}
          onChange={(event) => onFromChange(event.target.value)}
        />
        <span aria-hidden="true">—</span>
        <input
          type="date"
          value={to}
          aria-label={`${label} 종료일`}
          onChange={(event) => onToChange(event.target.value)}
        />
      </div>
    </fieldset>
  );
}
