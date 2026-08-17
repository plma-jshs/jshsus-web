import type { SelectHTMLAttributes } from 'react';
import { SelectPrimitive, type SelectPrimitiveProps } from '@jshsus/ui';

export type AdminSelectProps = Omit<SelectPrimitiveProps, 'classPrefix' | 'portal'> & {
  children: SelectHTMLAttributes<HTMLSelectElement>['children'];
  nativeOnMobile?: boolean;
  mobileLabel?: string;
  menuClassName?: string;
};

/**
 * Admin adapter for the shared SelectPrimitive.
 *
 * The admin surface keeps its portal menu and existing class prefix so the
 * portal positioning/status styles remain unchanged, while option parsing,
 * keyboard behavior and native-mobile fallback are shared with public selects.
 */
export function AdminSelect(props: AdminSelectProps) {
  const {
    children,
    className,
    value,
    defaultValue,
    nativeOnMobile = true,
    mobileLabel,
    menuClassName,
    'aria-label': ariaLabel,
    ...selectProps
  } = props;
  const nativeAlways = props.nativeOnMobile === true;
  const isStatusSelect = /상태/.test(`${ariaLabel ?? ''} ${mobileLabel ?? ''}`);
  const classes = [isStatusSelect ? 'admin-select--status' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <SelectPrimitive
      {...selectProps}
      aria-label={ariaLabel}
      className={classes}
      classPrefix="admin-select"
      defaultValue={defaultValue}
      mobileLabel={mobileLabel ?? ariaLabel}
      nativeOnMobile={nativeOnMobile}
      nativeAlways={nativeAlways}
      portal
      value={value}
      menuClassName={menuClassName}
    >
      {children}
    </SelectPrimitive>
  );
}
