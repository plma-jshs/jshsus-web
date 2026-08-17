import { SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';
import { useAnimatedDialog } from './useAnimatedDialog';

export type TableToolbarProps = HTMLAttributes<HTMLDivElement> & {
  summary?: ReactNode;
  mobileSearch?: ReactNode;
  mobileActions?: ReactNode;
  mobileSort?: ReactNode;
  children?: ReactNode;
  mobileSheet?: boolean;
  mobileSheetTitle?: string;
};

function useMobileToolbar() {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const handleChange = (event: MediaQueryListEvent) => setMobile(event.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return mobile;
}

export function TableToolbar({
  summary,
  mobileSearch,
  mobileActions,
  mobileSort,
  children,
  className,
  mobileSheet = true,
  mobileSheetTitle = '필터',
  ...props
}: TableToolbarProps) {
  const { ...divProps } = props;
  const classes = [
    'admin-table-toolbar',
    mobileSearch ? 'has-search' : '',
    summary ? 'has-summary' : '',
    mobileActions ? 'has-actions' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const mobile = useMobileToolbar();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { ref: dialogRef, requestClose } = useAnimatedDialog(sheetOpen, () => setSheetOpen(false));
  const useSheet = Boolean(children) && mobileSheet && mobile;
  const hasToolbarContent = Boolean(mobileSearch || mobileActions || mobileSort || children);

  useEffect(() => {
    if (!sheetOpen) return;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [sheetOpen]);

  if (!hasToolbarContent) return null;

  return (
    <div {...divProps} className={classes}>
      {summary ? <div className="admin-table-toolbar__summary">{summary}</div> : null}
      {mobile ? (
        <>
          <div className="admin-table-toolbar__mobile-row">
            {mobileSearch ? (
              <div className="admin-table-toolbar__mobile-search">{mobileSearch}</div>
            ) : null}
            {useSheet ? (
              <button
                className="admin-mobile-filter-button"
                type="button"
                onClick={() => setSheetOpen(true)}
              >
                <SlidersHorizontal size={18} aria-hidden="true" />
                <span className="sr-only">{mobileSheetTitle}</span>
              </button>
            ) : null}
            {mobileActions ? (
              <div className="admin-table-toolbar__mobile-actions">{mobileActions}</div>
            ) : null}
          </div>
          {useSheet ? (
            <dialog
              className="admin-filter-sheet"
              ref={dialogRef}
              onCancel={(event) => {
                event.preventDefault();
                requestClose();
              }}
              onClick={(event) => {
                if (event.target === event.currentTarget) requestClose();
              }}
            >
              <div className="admin-filter-sheet__layout">
                <header>
                  <h2>{mobileSheetTitle}</h2>
                  <button
                    type="button"
                    aria-label={`${mobileSheetTitle} 닫기`}
                    onClick={requestClose}
                  >
                    <X size={20} aria-hidden="true" />
                  </button>
                </header>
                <div className="admin-table-toolbar__controls admin-filter-sheet__controls">
                  {mobileSort}
                  {children}
                </div>
                <footer>
                  <button type="button" onClick={requestClose}>
                    적용
                  </button>
                </footer>
              </div>
            </dialog>
          ) : null}
        </>
      ) : (
        <div className="admin-table-toolbar__controls">
          {mobileSearch ? <div className="admin-table-toolbar__search">{mobileSearch}</div> : null}
          {children}
          {mobileActions}
        </div>
      )}
    </div>
  );
}
