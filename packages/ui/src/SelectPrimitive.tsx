import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type OptionHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export type SelectPrimitiveOption = {
  value: string;
  label: ReactNode;
  disabled: boolean;
  badge?: string;
  tone?: string;
};

export type SelectPrimitiveProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'multiple' | 'size' | 'children' | 'value' | 'defaultValue'
> & {
  children: ReactNode;
  value?: string | number;
  defaultValue?: string | number;
  /** Use the native control on compact viewports when touch selection is preferable. */
  nativeOnMobile?: boolean;
  nativeAlways?: boolean;
  mobileLabel?: string;
  label?: ReactNode;
  leadingIcon?: ReactNode;
  classPrefix?: string;
  className?: string;
  nativeWrapClassName?: string;
  menuClassName?: string;
  /** Render the custom listbox into the nearest open dialog/body. */
  portal?: boolean;
};

function toOptions(children: ReactNode): SelectPrimitiveOption[] {
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

function useCompactViewport(fallback: boolean) {
  const resolveViewport = () => {
    if (typeof window === 'undefined') return fallback;
    // Prefer a concrete viewport width when it is available. This keeps the
    // primitive deterministic in test DOMs where matchMedia is absent or
    // implemented as a permissive stub; browsers still receive live changes
    // through the matchMedia listener below.
    if (typeof window.innerWidth === 'number' && window.innerWidth > 0) {
      return window.innerWidth <= 767;
    }
    if (typeof window.matchMedia === 'function') {
      return window.matchMedia('(max-width: 767px)').matches;
    }
    return fallback;
  };
  const [compact, setCompact] = useState(() => resolveViewport());

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(max-width: 767px)');
    const handleChange = (event: MediaQueryListEvent) =>
      setCompact(typeof window.innerWidth === 'number' ? window.innerWidth <= 767 : event.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return compact;
}

/**
 * Shared select behavior for public toolbars and the admin portal select.
 * Surface-specific CSS is preserved through `classPrefix`; interaction and
 * native/mobile fallback behavior live in one place.
 */
export function SelectPrimitive({
  children,
  className,
  classPrefix = 'ui-select',
  value,
  defaultValue,
  disabled,
  onChange,
  onInvalid,
  nativeOnMobile = false,
  nativeAlways = false,
  mobileLabel,
  label,
  leadingIcon,
  nativeWrapClassName,
  menuClassName,
  portal = false,
  'aria-label': ariaLabel,
  ...selectProps
}: SelectPrimitiveProps) {
  const options = useMemo(() => toOptions(children), [children]);
  const fallbackValue = String(
    defaultValue ?? options.find((option) => !option.disabled)?.value ?? options[0]?.value ?? '',
  );
  const [uncontrolledValue, setUncontrolledValue] = useState(fallbackValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>();
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const compact = useCompactViewport(nativeOnMobile);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selectedValue = value === undefined ? uncontrolledValue : String(value);
  const selected = options.find((option) => option.value === selectedValue) ?? options[0];
  const useNativeSelect = nativeAlways || (nativeOnMobile && compact);
  const resolvedAriaLabel = ariaLabel ?? '선택';

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
    if (open && portal) positionMenu();
  }, [open, portal, positionMenu]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleViewportChange = () => positionMenu();
    document.addEventListener('pointerdown', handlePointerDown);
    if (portal) {
      window.addEventListener('resize', handleViewportChange);
      window.addEventListener('scroll', handleViewportChange, true);
    }
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, portal, positionMenu]);

  const choose = (nextValue: string, restoreFocus = true) => {
    if (value === undefined) setUncontrolledValue(nextValue);
    const nativeSelect = selectRef.current;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (nativeSelect && setter) {
      setter.call(nativeSelect, nextValue);
      nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setOpen(false);
    // A pointer selection should not leave the trigger in a sticky focus
    // state after the menu disappears. Keyboard selection keeps focus on the
    // trigger so the control remains navigable without a mouse.
    if (restoreFocus) {
      triggerRef.current?.focus();
    } else {
      // Pointer selection should leave no native button focus ring behind
      // after the menu closes. Keyboard selection keeps focus for a11y.
      triggerRef.current?.blur();
    }
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

  const moveActiveToEdge = (edge: 'first' | 'last') => {
    const indexes = options
      .map((option, index) => (option.disabled ? -1 : index))
      .filter((index) => index >= 0);
    const next = edge === 'first' ? indexes[0] : indexes[indexes.length - 1];
    if (next !== undefined) setActiveIndex(next);
  };

  const chooseActive = () => {
    const option = options[activeIndex];
    if (option && !option.disabled) choose(option.value);
  };

  const handleNativeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    if (value === undefined) setUncontrolledValue(event.currentTarget.value);
    onChange?.(event);
  };

  const optionContent = (option: SelectPrimitiveOption) => (
    <span className={`${classPrefix}__option-content`}>
      {option.badge ? (
        <span className={`${classPrefix}__badge is-${option.tone ?? 'neutral'}`}>
          {option.badge}
        </span>
      ) : null}
      <span>{option.label}</span>
    </span>
  );

  const select = (
    <select
      {...selectProps}
      aria-hidden={useNativeSelect ? undefined : true}
      className={`${classPrefix}__native`}
      disabled={disabled}
      ref={selectRef}
      tabIndex={useNativeSelect ? undefined : -1}
      value={value === undefined ? undefined : String(value)}
      defaultValue={value === undefined ? String(defaultValue ?? fallbackValue) : undefined}
      onChange={handleNativeChange}
      onInvalid={(event) => {
        onInvalid?.(event);
        triggerRef.current?.focus();
      }}
    >
      {children}
    </select>
  );

  const menu = open ? (
    <div
      aria-label={ariaLabel}
      className={`${classPrefix}__menu${menuClassName ? ` ${menuClassName}` : ''}`}
      id={listboxId}
      ref={menuRef}
      role="listbox"
      style={portal ? menuStyle : undefined}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
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
            onClick={() => choose(option.value, false)}
            onMouseEnter={() => setActiveIndex(index)}
          >
            {optionContent(option)}
            {isSelected ? <Check size={15} aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  ) : null;

  const rootClasses = [
    classPrefix,
    open ? 'is-open' : '',
    nativeOnMobile ? `${classPrefix}--native-mobile` : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClasses} ref={rootRef}>
      {!nativeWrapClassName && label !== undefined ? (
        <span className={`${classPrefix}__label`}>{label}</span>
      ) : null}
      {mobileLabel ? <span className={`${classPrefix}__mobile-label`}>{mobileLabel}</span> : null}
      {nativeWrapClassName ? (
        <label className={nativeWrapClassName}>
          {label !== undefined ? <span className={`${classPrefix}__label`}>{label}</span> : null}
          {leadingIcon ? (
            <span className={`${classPrefix}__leading-icon`} aria-hidden="true">
              {leadingIcon}
            </span>
          ) : null}
          {select}
        </label>
      ) : (
        select
      )}
      {!useNativeSelect ? (
        <button
          aria-controls={listboxId}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={`${resolvedAriaLabel}: ${
            typeof selected?.label === 'string' ? selected.label : selectedValue
          }`}
          className={`${classPrefix}__trigger`}
          disabled={disabled}
          ref={triggerRef}
          type="button"
          onClick={() => {
            const selectedIndex = Math.max(
              0,
              options.findIndex((option) => option.value === selectedValue),
            );
            setActiveIndex(selectedIndex);
            if (portal) {
              setPortalTarget(triggerRef.current?.closest('dialog[open]') ?? document.body);
            }
            setOpen((current) => !current);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              if (!open) return;
              event.preventDefault();
              setOpen(false);
              return;
            }
            if ((event.key === 'Enter' || event.key === ' ') && open) {
              event.preventDefault();
              chooseActive();
              return;
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (!open) {
                if (portal) {
                  setPortalTarget(triggerRef.current?.closest('dialog[open]') ?? document.body);
                }
                setOpen(true);
              }
              moveActive(event.key === 'ArrowDown' ? 1 : -1);
              return;
            }
            if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault();
              if (!open) {
                if (portal) {
                  setPortalTarget(triggerRef.current?.closest('dialog[open]') ?? document.body);
                }
                setOpen(true);
              }
              moveActiveToEdge(event.key === 'Home' ? 'first' : 'last');
            } else if (event.key === 'Tab' && open) {
              setOpen(false);
            }
          }}
        >
          {optionContent(selected ?? { value: '', label: '선택', disabled: false })}
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      ) : null}
      {!useNativeSelect &&
        (portal && menuStyle && portalTarget ? createPortal(menu, portalTarget) : menu)}
    </div>
  );
}
