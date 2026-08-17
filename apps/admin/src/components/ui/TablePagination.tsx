import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageSizeSelect } from './PageSizeSelect';

export type TablePaginationProps = {
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  totalCount?: number;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
};

/** Shared pagination controls used by every admin DataTable. */
export function TablePagination({
  pageIndex,
  pageCount,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
}: TablePaginationProps) {
  const currentPage = Math.min(pageIndex + 1, Math.max(pageCount, 1));
  const submitPageInput = (value: string) => {
    const requestedPage = Number(value);
    if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage === currentPage) {
      return;
    }
    onPageChange(Math.min(requestedPage, pageCount) - 1);
  };

  return (
    <nav
      className="admin-table-pagination admin-table-pagination--compact"
      aria-label="페이지 이동"
    >
      <div className="admin-table-pagination__summary">
        {onPageSizeChange ? (
          <PageSizeSelect
            value={pageSize}
            onChange={onPageSizeChange}
            ariaLabel="페이지당 표시 건수"
          />
        ) : null}
        <span className="admin-table-pagination__range admin-table-pagination__mobile-status">
          {totalCount
            ? `전체 ${totalCount.toLocaleString('ko-KR')}건 중 ${pageIndex * pageSize + 1}-${Math.min(
                (pageIndex + 1) * pageSize,
                totalCount,
              )}`
            : `${currentPage} / ${pageCount} 페이지`}
        </span>
      </div>
      {onLoadMore && hasMore ? (
        <button
          className="admin-table-pagination__load-more"
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
        >
          {loadingMore ? '불러오는 중…' : '더보기'}
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      ) : null}
      <div className="admin-table-pagination__controls">
        <button
          className="admin-table-pagination__previous"
          type="button"
          aria-label="이전 페이지"
          onClick={() => onPageChange(pageIndex - 1)}
          disabled={currentPage <= 1}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <label className="admin-table-pagination__input-label">
          <span className="sr-only">현재 페이지</span>
          <input
            key={currentPage}
            inputMode="numeric"
            type="text"
            defaultValue={String(currentPage)}
            onChange={(event) => {
              event.currentTarget.value = event.currentTarget.value.replace(/\D/g, '');
            }}
            onBlur={(event) => submitPageInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitPageInput(event.currentTarget.value);
                event.currentTarget.blur();
              }
            }}
            aria-label="페이지 번호"
          />
        </label>
        <span className="admin-table-pagination__total-pages" aria-hidden="true">
          <span>/</span>
          <span>{pageCount}</span>
        </span>
        <button
          className="admin-table-pagination__next"
          type="button"
          aria-label="다음 페이지"
          onClick={() => onPageChange(pageIndex + 1)}
          disabled={currentPage >= pageCount}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
