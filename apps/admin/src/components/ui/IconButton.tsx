import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type IconButtonVariant = 'neutral' | 'primary' | 'danger';

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: IconButtonVariant;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'neutral', className, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={['ui-icon-button', `ui-icon-button--${variant}`, className]
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
});
