import { MoreVertical, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, type ButtonProps } from './Button';

export function RowActions({ children, className }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className={['admin-row-actions', className].filter(Boolean).join(' ')}>
      <div className="admin-row-actions__desktop">{children}</div>
      <button
        className="admin-row-actions__mobile-trigger"
        type="button"
        aria-label="작업 메뉴 열기"
        onClick={() => setOpen(true)}
      >
        <MoreVertical size={19} aria-hidden="true" />
      </button>
      <dialog
        className="admin-row-action-sheet"
        ref={dialogRef}
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <div className="admin-row-action-sheet__layout">
          <header>
            <h2>작업</h2>
            <button type="button" aria-label="작업 메뉴 닫기" onClick={() => setOpen(false)}>
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          <div
            className="admin-row-action-sheet__actions"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('button')) setOpen(false);
            }}
          >
            {children}
          </div>
        </div>
      </dialog>
    </div>
  );
}

type RowActionButtonProps = Omit<ButtonProps, 'children' | 'size'> & {
  icon: ReactNode;
  label: string;
  mobileLabel?: string;
};

export function RowActionButton({
  icon,
  label,
  mobileLabel,
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
      <span className="admin-row-action-button__label">{mobileLabel ?? label}</span>
    </Button>
  );
}
