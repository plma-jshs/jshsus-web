import type { ReactNode } from 'react';
import { Button, type ButtonProps } from './Button';

export function RowActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={['admin-row-actions', className].filter(Boolean).join(' ')}>{children}</div>
  );
}

type RowActionButtonProps = Omit<ButtonProps, 'children' | 'size'> & {
  icon: ReactNode;
  label: string;
};

export function RowActionButton({
  icon,
  label,
  className,
  variant = 'secondary',
  ...props
}: RowActionButtonProps) {
  return (
    <Button
      {...props}
      className={['admin-row-action-button', className].filter(Boolean).join(' ')}
      variant={variant}
      size="sm"
      aria-label={label}
      title={label}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </Button>
  );
}
