import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, type ButtonVariant } from './Button';

type TableSelectionCheckboxProps = {
  checked: boolean;
  label: string;
  disabled?: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
};

export function TableSelectionCheckbox({
  checked,
  label,
  disabled = false,
  indeterminate = false,
  onChange,
}: TableSelectionCheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate && !checked;
  }, [checked, indeterminate]);

  return (
    <input
      ref={inputRef}
      className="admin-selection-checkbox"
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.checked)}
    />
  );
}

type SelectedRowsHeaderActionProps = {
  selectedCount: number;
  defaultLabel: ReactNode;
  deleteLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: ReactNode;
  variant?: ButtonVariant;
  onDelete: () => void;
};

export function MobileSelectionActionBar({
  selectedCount,
  children,
}: {
  selectedCount: number;
  children: ReactNode;
}) {
  if (selectedCount <= 0 || typeof document === 'undefined') return null;

  return createPortal(
    <span className="admin-selection-action-bar" role="status" aria-live="polite">
      <span className="admin-selection-action-bar__count">
        <strong>{selectedCount}</strong>개 선택됨
      </span>
      <span className="admin-selection-action-bar__actions">{children}</span>
    </span>,
    document.body,
  );
}

export function SelectedRowsHeaderAction({
  selectedCount,
  defaultLabel,
  deleteLabel = '선택 삭제',
  disabled = false,
  loading = false,
  loadingLabel = '삭제 중',
  variant = 'danger',
  onDelete,
}: SelectedRowsHeaderActionProps) {
  if (selectedCount <= 0) return <>{defaultLabel}</>;

  const mobileDeleteLabel =
    typeof deleteLabel === 'string' ? deleteLabel.replace(/^선택\s*/u, '') : deleteLabel;

  return (
    <>
      <Button
        className="admin-selected-header-action admin-selected-header-action--desktop"
        variant={variant}
        size="sm"
        loading={loading}
        loadingLabel={loadingLabel}
        disabled={disabled}
        onClick={onDelete}
      >
        {deleteLabel} ({selectedCount})
      </Button>
      <MobileSelectionActionBar selectedCount={selectedCount}>
        <Button
          className="admin-selection-action-bar__action"
          variant={variant}
          size="sm"
          loading={loading}
          loadingLabel={loadingLabel}
          disabled={disabled}
          onClick={onDelete}
        >
          {mobileDeleteLabel} ({selectedCount})
        </Button>
      </MobileSelectionActionBar>
    </>
  );
}
