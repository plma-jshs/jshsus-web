import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonPrimitiveVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonPrimitiveSize = 'sm' | 'md' | 'lg';

export type ButtonPrimitiveProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonPrimitiveVariant;
  size?: ButtonPrimitiveSize;
  block?: boolean;
  loading?: boolean;
  loadingLabel?: ReactNode;
  classPrefix?: string;
};

/** Shared button semantics and visual variant contract. */
export const ButtonPrimitive = forwardRef<HTMLButtonElement, ButtonPrimitiveProps>(
  function ButtonPrimitive(
    {
      variant = 'secondary',
      size = 'md',
      block = false,
      loading = false,
      loadingLabel,
      disabled,
      className,
      children,
      type = 'button',
      classPrefix = 'ui-button',
      ...props
    },
    ref,
  ) {
    const classes = [
      classPrefix,
      `${classPrefix}--${variant}`,
      `${classPrefix}--${size}`,
      block ? `${classPrefix}--block` : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        {...props}
        ref={ref}
        type={type}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
      >
        {loading ? <span className={`${classPrefix}__spinner`} aria-hidden="true" /> : null}
        {loading && loadingLabel !== undefined ? loadingLabel : children}
      </button>
    );
  },
);
