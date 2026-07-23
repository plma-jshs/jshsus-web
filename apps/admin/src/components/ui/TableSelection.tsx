import { useEffect, useRef, type ReactNode } from 'react';
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

  return (
    <Button
      className="admin-selected-header-action"
      variant={variant}
      size="sm"
      loading={loading}
      loadingLabel={loadingLabel}
      disabled={disabled}
      onClick={onDelete}
    >
      {deleteLabel} ({selectedCount})
    </Button>
  );
}
