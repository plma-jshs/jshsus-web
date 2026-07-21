import { Trash2 } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';

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
  onDelete: () => void;
};

export function SelectedRowsHeaderAction({
  selectedCount,
  defaultLabel,
  deleteLabel = '선택 삭제',
  disabled = false,
  loading = false,
  onDelete,
}: SelectedRowsHeaderActionProps) {
  if (selectedCount <= 0) return <>{defaultLabel}</>;

  return (
    <Button
      className="admin-selected-header-action"
      variant="danger"
      size="sm"
      loading={loading}
      loadingLabel="삭제 중"
      disabled={disabled}
      onClick={onDelete}
    >
      <Trash2 size={14} aria-hidden="true" />
      {deleteLabel} ({selectedCount})
    </Button>
  );
}
