import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';
import { useDialogClose } from './DialogCloseContext';

export type DialogActionsProps = {
  pending?: boolean;
  onClose?: () => void;
  onConfirm?: () => void;
  cancelLabel?: ReactNode;
  confirmLabel?: ReactNode;
  pendingLabel?: ReactNode;
  confirmVariant?: ButtonVariant;
  confirmType?: ButtonHTMLAttributes<HTMLButtonElement>['type'];
  confirmDisabled?: boolean;
  className?: string;
  showCancel?: boolean;
};

/** Shared footer actions for forms rendered inside Dialog/Drawer bodies. */
export function DialogActions({
  pending = false,
  onClose,
  onConfirm,
  cancelLabel = '취소',
  confirmLabel = '저장',
  pendingLabel = '저장 중',
  confirmVariant = 'primary',
  confirmType = 'submit',
  confirmDisabled = false,
  className,
  showCancel = true,
}: DialogActionsProps) {
  const animatedClose = useDialogClose();
  const close = animatedClose ?? onClose;
  const classes = ['button-row', 'ui-dialog-actions', className ?? ''].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {showCancel && close ? (
        <Button variant="secondary" type="button" onClick={close}>
          {cancelLabel}
        </Button>
      ) : null}
      <Button
        variant={confirmVariant}
        type={confirmType}
        disabled={pending || confirmDisabled}
        loading={pending}
        loadingLabel={pendingLabel}
        onClick={onConfirm}
      >
        {confirmLabel}
      </Button>
    </div>
  );
}
