import { MoreVertical, X } from 'lucide-react';
import { useSheetDrag } from '@jshsus/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, type ButtonProps } from './Button';
import { useAnimatedDialog } from './useAnimatedDialog';

export function RowActions({
  children,
  mobileChildren,
  className,
  mobileTitle = '작업',
}: {
  children: ReactNode;
  mobileChildren?: ReactNode;
  className?: string;
  mobileTitle?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { ref: dialogRef, requestClose } = useAnimatedDialog(open, () => setOpen(false));
  const { rootRef: sheetRootRef, handleProps } = useSheetDrag<HTMLDivElement>(requestClose);

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
          requestClose();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) requestClose();
        }}
      >
        <div className="admin-row-action-sheet__layout" ref={sheetRootRef}>
          <span className="admin-row-action-sheet__handle" aria-hidden="true" {...handleProps} />
          <header>
            <h2>{mobileTitle}</h2>
            <button type="button" aria-label="작업 메뉴 닫기" onClick={requestClose}>
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          <div
            className="admin-row-action-sheet__actions"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('button')) requestClose();
            }}
          >
            {mobileChildren ?? children}
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
