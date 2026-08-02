import { AlertTriangle } from 'lucide-react';
import { Dialog } from './Dialog';

export function ConfirmDialog({
  open,
  title,
  subject,
  description,
  confirmLabel = '삭제',
  pending = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  subject?: string;
  description: string;
  confirmLabel?: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      title={title}
      size="sm"
      className="ui-confirm-dialog"
      onClose={onClose}
      footer={
        <div className="button-row">
          <button className="quiet-button" type="button" onClick={onClose}>
            취소
          </button>
          <button className="danger-button" type="button" disabled={pending} onClick={onConfirm}>
            {pending ? '처리 중' : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="ui-confirm-dialog__content">
        <span aria-hidden="true">
          <AlertTriangle size={19} />
        </span>
        <div>
          {subject ? <strong>{subject}</strong> : null}
          <p>{description}</p>
        </div>
      </div>
    </Dialog>
  );
}
