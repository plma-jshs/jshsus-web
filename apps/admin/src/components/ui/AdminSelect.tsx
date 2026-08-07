import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
  type OptionHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

type SelectOption = {
  value: string;
  label: ReactNode;
  disabled: boolean;
  badge?: string;
  tone?: string;
};

type AdminSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'multiple' | 'size'> & {
  children: ReactNode;
  nativeOnMobile?: boolean;
  mobileLabel?: string;
};

function toOptions(children: ReactNode): SelectOption[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child) || child.type !== 'option') return [];
    const option = child as ReactElement<OptionHTMLAttributes<HTMLOptionElement>>;
    const decoratedProps = option.props as OptionHTMLAttributes<HTMLOptionElement> & {
      'data-badge'?: string;
      'data-tone'?: string;
    };
    const implicitValue =
      typeof option.props.children === 'string' || typeof option.props.children === 'number'
        ? option.props.children
        : '';
    return [
      {
        value: String(option.props.value ?? implicitValue),
        label: option.props.children,
        disabled: Boolean(option.props.disabled),
        badge: decoratedProps['data-badge'],
        tone: decoratedProps['data-tone'],
      },
    ];
  });
}

export function AdminSelect({
  children,
  className,
  value,
  defaultValue,
  disabled,
  onChange,
  onInvalid,
  nativeOnMobile = true,
  mobileLabel,
  'aria-label': ariaLabel = '선택',
  ...selectProps
}: AdminSelectProps) {
  const options = useMemo(() => toOptions(children), [children]);
  const fallbackValue = String(
    defaultValue ?? options.find((option) => !option.disabled)?.value ?? options[0]?.value ?? '',
  );
  const [uncontrolledValue, setUncontrolledValue] = useState(fallbackValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>();
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 640px)').matches
      : nativeOnMobile,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selectedValue = value === undefined ? uncontrolledValue : String(value);
  const selected = options.find((option) => option.value === selectedValue) ?? options[0];
  const useNativeSelect = nativeOnMobile && mobile;

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(max-width: 640px)');
    const handleChange = (event: MediaQueryListEvent) => setMobile(event.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  const positionMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const roomBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = Math.min(280, options.length * 40 + 12);
    const opensUpward = roomBelow < estimatedHeight && rect.top > roomBelow;
    setMenuStyle({
      left: rect.left,
      width: rect.width,
      ...(opensUpward ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    });
  }, [options.length]);

  useLayoutEffect(() => {
    if (open) positionMenu();
  }, [open, positionMenu]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleViewportChange = () => positionMenu();
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, positionMenu]);

  const choose = (nextValue: string) => {
    if (value === undefined) setUncontrolledValue(nextValue);
    const nativeSelect = selectRef.current;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (nativeSelect && setter) {
      setter.call(nativeSelect, nextValue);
      nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveActive = (direction: 1 | -1) => {
    if (options.length === 0) return;
    let next = activeIndex;
    for (let count = 0; count < options.length; count += 1) {
      next = (next + direction + options.length) % options.length;
      if (!options[next]?.disabled) break;
    }
    setActiveIndex(next);
  };

  return (
    <div
      className={`admin-select${open ? ' is-open' : ''}${nativeOnMobile ? ' admin-select--native-mobile' : ''}${className ? ` ${className}` : ''}`}
      ref={rootRef}
    >
      {mobileLabel ? <span className="admin-select__mobile-label">{mobileLabel}</span> : null}
      <select
        {...selectProps}
        aria-hidden={useNativeSelect ? undefined : true}
        className="admin-select__native"
        disabled={disabled}
        ref={selectRef}
        tabIndex={useNativeSelect ? undefined : -1}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        onChange={onChange}
        onInvalid={(event) => {
          onInvalid?.(event);
          triggerRef.current?.focus();
        }}
      >
        {children}
      </select>
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${ariaLabel}: ${typeof selected?.label === 'string' ? selected.label : selectedValue}`}
        className="admin-select__trigger"
        disabled={disabled}
        ref={triggerRef}
        type="button"
        onClick={() => {
          const selectedIndex = Math.max(
            0,
            options.findIndex((option) => option.value === selectedValue),
          );
          setActiveIndex(selectedIndex);
          setPortalTarget(triggerRef.current?.closest('dialog[open]') ?? document.body);
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            return;
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) {
              setPortalTarget(triggerRef.current?.closest('dialog[open]') ?? document.body);
              setOpen(true);
            }
            moveActive(event.key === 'ArrowDown' ? 1 : -1);
          }
        }}
      >
        <span className="admin-select__option-content">
          {selected?.badge ? (
            <span className={`admin-select__badge is-${selected.tone ?? 'neutral'}`}>
              {selected.badge}
            </span>
          ) : null}
          <span>{selected?.label ?? '선택'}</span>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && menuStyle && portalTarget
        ? createPortal(
            <div
              aria-label={ariaLabel}
              className="admin-select__menu"
              id={listboxId}
              ref={menuRef}
              role="listbox"
              style={menuStyle}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setOpen(false);
                  triggerRef.current?.focus();
                }
              }}
            >
              {options.map((option, index) => {
                const isSelected = option.value === selectedValue;
                return (
                  <button
                    aria-selected={isSelected}
                    className={`${isSelected ? 'is-selected' : ''}${activeIndex === index ? ' is-active' : ''}`}
                    disabled={option.disabled}
                    key={`${option.value}:${index}`}
                    role="option"
                    type="button"
                    onClick={() => choose(option.value)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span className="admin-select__option-content">
                      {option.badge ? (
                        <span className={`admin-select__badge is-${option.tone ?? 'neutral'}`}>
                          {option.badge}
                        </span>
                      ) : null}
                      <span>{option.label}</span>
                    </span>
                    {isSelected ? <Check size={15} aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
}
