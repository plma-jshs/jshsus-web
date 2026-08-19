import { MoreVertical } from 'lucide-react';
import { SheetFrame } from '@jshsus/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, type ButtonProps } from './Button';
import { useAnimatedDialog } from './useAnimatedDialog';

export function RowActions({
  children,
  mobileChildren,
  className,
  mobileTitle = '선택한 항목',
}: {
  children: ReactNode;
  mobileChildren?: ReactNode;
  className?: string;
  mobileTitle?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { ref: dialogRef, requestClose } = useAnimatedDialog(open, () => setOpen(false));

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
        <SheetFrame
          className="admin-row-action-sheet__layout"
          handleClassName="admin-row-action-sheet__handle"
          onClose={requestClose}
          header={
            <header>
              <h2>{mobileTitle}</h2>
            </header>
          }
        >
          <div
            className="admin-row-action-sheet__actions"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('button')) requestClose();
            }}
          >
            {mobileChildren ?? children}
          </div>
        </SheetFrame>
      </dialog>
    </div>
  );
}

type RowActionButtonProps = Omit<ButtonProps, 'children' | 'size'> & {
  icon: ReactNode;
  label: string;
  mobileLabel?: string;
};

// The row already identifies the target in the sheet title. Keep the mobile
// action list scannable by showing only the final action verb while retaining
// the complete label for assistive technology and the desktop tooltip.
const MOBILE_ACTION_SUFFIXES = [
  '잠금 해제',
  '고정 해제',
  '배정 취소',
  '기록 보기',
  '상세 보기',
  '잠금',
  '고정',
  '이동',
  '배정',
  '제외',
  '수정',
  '삭제',
  '관리',
  '승인',
  '반려',
  '숨김',
  '공개',
  '처리',
  '발급',
  '추가',
  '더보기',
] as const;

function mobileActionLabel(label: string) {
  const normalized = label.trim();
  const suffix = MOBILE_ACTION_SUFFIXES.find(
    (candidate) => normalized === candidate || normalized.endsWith(` ${candidate}`),
  );
  return suffix ?? normalized;
}

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
      <span className="admin-row-action-button__label">
        {mobileLabel ?? mobileActionLabel(label)}
      </span>
    </Button>
  );
}
