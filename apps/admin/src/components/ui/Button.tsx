import { forwardRef } from 'react';
import { ButtonPrimitive, type ButtonPrimitiveProps } from '@jshsus/ui';

export type ButtonVariant = NonNullable<ButtonPrimitiveProps['variant']>;
export type ButtonSize = NonNullable<ButtonPrimitiveProps['size']>;
export type ButtonProps = Omit<ButtonPrimitiveProps, 'classPrefix'>;

/** Admin button adapter; visual variants and loading semantics are shared. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(props, ref) {
  return <ButtonPrimitive {...props} ref={ref} classPrefix="ui-button" />;
});
