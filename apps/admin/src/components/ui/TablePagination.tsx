import { PaginationPrimitive } from '@jshsus/ui';
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
  return (
    <PaginationPrimitive
      className="admin-table-pagination--compact"
      classPrefix="admin-table-pagination"
      page={currentPage}
      pageCount={pageCount}
      pageSizeControl={
        onPageSizeChange ? (
          <PageSizeSelect
            value={pageSize}
            onChange={onPageSizeChange}
            ariaLabel="페이지당 표시 건수"
          />
        ) : null
      }
      range={
        totalCount
          ? `전체 ${totalCount.toLocaleString('ko-KR')}건 중 ${pageIndex * pageSize + 1}-${Math.min(
              (pageIndex + 1) * pageSize,
              totalCount,
            )}`
          : `${currentPage} / ${pageCount} 페이지`
      }
      rangeClassName="admin-table-pagination__mobile-status"
      loadMore={
        onLoadMore
          ? {
              hasMore,
              onLoadMore,
              loading: loadingMore,
            }
          : undefined
      }
      onPageChange={(nextPage) => onPageChange(nextPage - 1)}
    />
  );
}
