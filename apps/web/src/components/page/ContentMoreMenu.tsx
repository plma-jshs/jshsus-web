import { MoreVertical, Pencil, Share2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useBottomSheetClose } from '../../shared/hooks/useBottomSheetClose';
import { useToast } from '../feedback/Toast';

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

export function ContentShareButton() {
  const { showToast } = useToast();

  const shareCurrentPage = async () => {
    const shareUrl = window.location.href;
    const shareTitle = document.title || '과구리';

    try {
      const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
      if (isDesktop && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        showToast({ title: '링크를 복사했습니다.', tone: 'success' });
      } else if (navigator.share) {
        await navigator.share({ title: shareTitle, text: shareTitle, url: shareUrl });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        showToast({ title: '링크를 복사했습니다.', tone: 'success' });
      } else {
        throw new Error('share-unavailable');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      showToast({ title: '공유 링크를 복사하지 못했습니다.', tone: 'danger' });
    }
  };

  return (
    <button
      aria-label="공유"
      className="content-share-button"
      onClick={() => void shareCurrentPage()}
      title="공유"
      type="button"
    >
      <Share2 size={17} aria-hidden="true" />
    </button>
  );
}
