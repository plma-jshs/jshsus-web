import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useBottomSheetClose } from '../../shared/hooks/useBottomSheetClose';

export function ContentMoreMenu({
  deleteDisabled = false,
  deleteLabel = '삭제',
  editLabel = '수정',
  onDelete,
  onEdit,
}: {
  deleteDisabled?: boolean;
  deleteLabel?: string;
  editLabel?: string;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { isClosing, requestClose, resetClosing } = useBottomSheetClose(() => setOpen(false));
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const close = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      requestClose();
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open, requestClose]);

  return (
    <div className="content-more-menu" ref={menuRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="게시물 메뉴"
        className="content-more-menu__trigger"
        onClick={() => {
          if (open) requestClose();
          else {
            resetClosing();
            setOpen(true);
          }
        }}
        type="button"
      >
        <MoreVertical size={18} aria-hidden="true" />
      </button>
      {open ? (
        <div className={`content-more-menu__dropdown${isClosing ? ' is-closing' : ''}`} role="menu">
          <button
            onClick={() => {
              requestClose(onEdit);
            }}
            role="menuitem"
            type="button"
          >
            <Pencil size={15} aria-hidden="true" />
            {editLabel}
          </button>
          <button
            className="is-danger"
            disabled={deleteDisabled}
            onClick={() => {
              requestClose(onDelete);
            }}
            role="menuitem"
            type="button"
          >
            <Trash2 size={15} aria-hidden="true" />
            {deleteLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
