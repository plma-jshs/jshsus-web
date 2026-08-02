import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export type AuthSelectOption<T extends string> = {
  value: T;
  label: string;
};

export function AuthSelect<T extends string>({
  id,
  value,
  options,
  placeholder = '선택',
  required,
  onChange,
}: {
  id: string;
  value: T | '';
  options: readonly AuthSelectOption<T>[];
  placeholder?: string;
  required?: boolean;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const listboxId = `${id}-${generatedId}-listbox`;
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="auth-select" ref={rootRef}>
      <input name={id} type="hidden" value={value} readOnly />
      <button
        id={id}
        className="auth-select__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-required={required}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selected ? undefined : 'is-placeholder'}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div id={listboxId} className="auth-select__menu" role="listbox">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                className={active ? 'is-selected' : undefined}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {active ? <Check size={15} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
