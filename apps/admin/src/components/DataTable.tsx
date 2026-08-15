import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowData,
  type SortingState,
} from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ADMIN_DEFAULT_PAGE_SIZE,
  DATA_TABLE_COLUMN_ALIGNMENTS,
  DATA_TABLE_COLUMN_WIDTHS,
  type DataTableColumnKind,
  type DataTableWidthPreset,
} from './dataTableConfig';
import { EmptyState } from './ui/EmptyState';
import { PageSizeSelect } from './ui/PageSizeSelect';

export type DataTableAlignment = 'left' | 'center' | 'right';

function syncTableQuery(page: number, pageSize: number) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('page', String(Math.max(page, 1)));
  url.searchParams.set('size', String(pageSize));
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

declare module '@tanstack/react-table' {
  // TanStack requires these exact generic parameter names for declaration merging.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: DataTableAlignment;
    headerAlign?: DataTableAlignment;
    width?: number | string;
    minWidth?: number | string;
    maxWidth?: number | string;
    truncate?: boolean;
    /** Applies the documented semantic alignment for common admin data. */
    kind?: DataTableColumnKind;
    /** Applies a consistent narrow width and centers short values by default. */
    widthPreset?: DataTableWidthPreset;
    /** Overrides the field label shown by the generic mobile card layout. */
    mobileLabel?: string;
    /** Hides low-value columns from the generic mobile card layout. */
    hideOnMobile?: boolean;
    /** Gives the generic mobile card a semantic hierarchy instead of repeating labels. */
    mobileRole?: 'title' | 'subtitle' | 'badge' | 'meta' | 'actions';
  }
}

export type DataTablePagination = {
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  totalCount?: number;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
};

export type DataTableProps<T> = {
  columns: ColumnDef<T>[];
  data: T[];
  emptyText?: string;
  loading?: boolean;
  loadingText?: string;
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  pagination?: DataTablePagination;
  alwaysShowPagination?: boolean;
  caption?: string;
  getRowId?: (row: T, index: number) => string;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  manualSorting?: boolean;
  renderMobileRow?: (row: T, index: number) => ReactNode;
};

function SortDirectionGlyph({ direction }: { direction: false | 'asc' | 'desc' }) {
  return (
    <svg
      className="admin-table-sort__glyph"
      viewBox="0 0 16 16"
      role="presentation"
      focusable="false"
    >
      <path
        className={direction === 'asc' ? 'is-active' : undefined}
        d="M5.25 2.25v10.5M2.25 5.25l3-3 3 3"
      />
      <path
        className={direction === 'desc' ? 'is-active' : undefined}
        d="M10.75 13.75V3.25m-3 7.5 3 3 3-3"
      />
    </svg>
  );
}

function widthForPreset(preset: DataTableWidthPreset | undefined) {
  return preset ? DATA_TABLE_COLUMN_WIDTHS[preset] : undefined;
}

function alignmentForMeta(
  meta: { align?: DataTableAlignment; kind?: DataTableColumnKind } | undefined,
  fallback: DataTableAlignment,
) {
  return meta?.align ?? (meta?.kind ? DATA_TABLE_COLUMN_ALIGNMENTS[meta.kind] : fallback);
}

function cellClassName(
  alignment: DataTableAlignment,
  options: { truncate?: boolean; widthPreset?: DataTableWidthPreset },
) {
  return [
    `admin-table-cell--${alignment}`,
    options.truncate ? 'admin-table-cell--truncate' : '',
    options.widthPreset ? `admin-table-cell--${options.widthPreset}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function DataTable<T>({
  columns,
  data,
  emptyText = '조회된 기록이 없습니다.',
  loading = false,
  loadingText = '불러오는 중입니다.',
  pageSize = ADMIN_DEFAULT_PAGE_SIZE,
  onPageSizeChange,
  pagination,
  alwaysShowPagination = false,
  caption,
  getRowId,
  sorting,
  onSortingChange,
  manualSorting = false,
  renderMobileRow,
}: DataTableProps<T>) {
  const [uncontrolledSorting, setUncontrolledSorting] = useState<SortingState>([]);
  const isSortingControlled = sorting !== undefined;
  const resolvedSorting = sorting ?? uncontrolledSorting;
  const tableState = {
    ...(pagination
      ? { pagination: { pageIndex: pagination.pageIndex, pageSize: pagination.pageSize } }
      : {}),
    sorting: resolvedSorting,
  };

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    if (!isSortingControlled) setUncontrolledSorting(updater);
    onSortingChange?.(updater);
  };

  const toggleColumnSorting = (columnId: string) => {
    handleSortingChange((current) => {
      const activeSort = current[0];

      // Keep every admin table on the same cycle: none → ascending →
      // descending → none. A modifier key must not introduce a second sort.
      if (!activeSort || activeSort.id !== columnId) return [{ id: columnId, desc: false }];
      if (!activeSort.desc) return [{ id: columnId, desc: true }];
      return [];
    });
  };

  const table = useReactTable({
    data,
    columns,
    state: tableState,
    initialState: pagination ? undefined : { pagination: { pageIndex: 0, pageSize } },
    manualPagination: Boolean(pagination),
    manualSorting,
    pageCount: pagination?.pageCount,
    enableSortingRemoval: true,
    enableMultiSort: false,
    sortDescFirst: false,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: pagination ? undefined : getPaginationRowModel(),
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    onSortingChange: handleSortingChange,
    getRowId,
  });

  useEffect(() => {
    if (!pagination && table.getState().pagination.pageSize !== pageSize) {
      table.setPageSize(pageSize);
    }
  }, [pageSize, pagination, table]);

  const resolvedPageCount = Math.max(pagination?.pageCount ?? table.getPageCount(), 1);
  const currentPageIndex = pagination?.pageIndex ?? table.getState().pagination.pageIndex;
  const currentPage = Math.min(currentPageIndex + 1, resolvedPageCount);
  const visibleColumnCount = Math.max(table.getVisibleFlatColumns().length, 1);
  const visibleRows = table.getRowModel().rows;

  const moveToPage = (pageIndex: number) => {
    const nextPageIndex = Math.min(Math.max(pageIndex, 0), resolvedPageCount - 1);
    if (nextPageIndex === currentPageIndex) return;
    syncTableQuery(nextPageIndex + 1, pagination?.pageSize ?? pageSize);
    if (pagination) pagination.onPageChange(nextPageIndex);
    else table.setPageIndex(nextPageIndex);
  };

  const changePageSize = (nextPageSize: number) => {
    syncTableQuery(1, nextPageSize);
    (pagination?.onPageSizeChange ?? onPageSizeChange)?.(nextPageSize);
  };

  const submitPageInput = (value: string) => {
    const requestedPage = Number(value);
    if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage === currentPage) {
      return;
    }
    moveToPage(requestedPage - 1);
  };

  return (
    <div className={`admin-data-table${renderMobileRow ? ' has-mobile-cards' : ''}`}>
      <div className="table-wrap">
        <table>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const alignment =
                    meta?.headerAlign ??
                    alignmentForMeta(meta, meta?.widthPreset ? 'center' : 'left');
                  const presetWidth = widthForPreset(meta?.widthPreset);
                  const sortDirection = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  const ariaSort = sortDirection
                    ? sortDirection === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : canSort
                      ? 'none'
                      : undefined;
                  return (
                    <th
                      key={header.id}
                      className={cellClassName(alignment, {
                        widthPreset: meta?.widthPreset,
                      })}
                      scope="col"
                      aria-sort={ariaSort}
                      style={{
                        width: meta?.width ?? presetWidth,
                        minWidth: meta?.minWidth ?? presetWidth,
                        maxWidth: meta?.maxWidth ?? presetWidth,
                      }}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          className={[
                            'admin-table-sort',
                            sortDirection ? 'is-sorted' : '',
                            sortDirection === 'asc' ? 'is-asc' : '',
                            sortDirection === 'desc' ? 'is-desc' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          type="button"
                          onClick={() => toggleColumnSorting(header.column.id)}
                        >
                          <span>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                          <span className="admin-table-sort__indicator" aria-hidden="true">
                            <SortDirectionGlyph direction={sortDirection} />
                          </span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }, (_, index) => (
                <tr className="admin-data-table__loading-row" key={index}>
                  <td className="admin-data-table__loading-cell" colSpan={visibleColumnCount}>
                    {index === 0 ? <span className="sr-only">{loadingText}</span> : null}
                    <span
                      aria-hidden="true"
                      className="admin-data-table__loading-bar"
                      style={{ width: `${Math.max(48, 92 - index * 7)}%` }}
                    />
                  </td>
                </tr>
              ))
            ) : visibleRows.length === 0 ? (
              <tr>
                <td className="admin-data-table__empty-cell" colSpan={visibleColumnCount}>
                  <EmptyState compact title={emptyText} />
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta;
                    const presetWidth = widthForPreset(meta?.widthPreset);
                    const alignment = alignmentForMeta(meta, meta?.widthPreset ? 'center' : 'left');
                    const mobileLabel =
                      meta?.mobileLabel ??
                      (typeof cell.column.columnDef.header === 'string'
                        ? cell.column.columnDef.header
                        : '');
                    return (
                      <td
                        key={cell.id}
                        className={cellClassName(alignment, {
                          truncate: meta?.truncate,
                          widthPreset: meta?.widthPreset,
                        })}
                        data-column-id={cell.column.id}
                        data-label={mobileLabel}
                        data-mobile-hidden={meta?.hideOnMobile ? 'true' : undefined}
                        data-mobile-role={meta?.mobileRole}
                        style={{
                          width: meta?.width ?? presetWidth,
                          minWidth: meta?.minWidth ?? presetWidth,
                          maxWidth: meta?.maxWidth ?? presetWidth,
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {renderMobileRow ? (
        <div className="admin-mobile-card-list">
          {loading ? (
            <div className="admin-mobile-card-list__status">{loadingText}</div>
          ) : visibleRows.length === 0 ? (
            <EmptyState compact title={emptyText} />
          ) : (
            visibleRows.map((row, index) => (
              <div className="admin-mobile-data-card" key={row.id}>
                {renderMobileRow(row.original, index)}
              </div>
            ))
          )}
        </div>
      ) : null}

      {!loading &&
      (pagination?.totalCount ?? visibleRows.length) > 0 &&
      (alwaysShowPagination || resolvedPageCount > 1) ? (
        <nav
          className="admin-table-pagination admin-table-pagination--compact"
          aria-label="페이지 이동"
        >
          <div className="admin-table-pagination__summary">
            {pagination?.onPageSizeChange || onPageSizeChange ? (
              <PageSizeSelect
                value={pagination?.pageSize ?? table.getState().pagination.pageSize}
                onChange={changePageSize}
                ariaLabel="페이지당 표시 건수"
              />
            ) : null}
            <span className="admin-table-pagination__range admin-table-pagination__mobile-status">
              {pagination?.totalCount
                ? `총 ${pagination.totalCount.toLocaleString('ko-KR')}건 중 ${
                    currentPageIndex * (pagination.pageSize ?? 0) + 1
                  }-${Math.min(
                    (currentPageIndex + 1) * (pagination.pageSize ?? 0),
                    pagination.totalCount,
                  )}`
                : `${currentPage} / ${resolvedPageCount} 페이지`}
            </span>
          </div>
          <div className="admin-table-pagination__controls">
            <button
              className="admin-table-pagination__previous"
              type="button"
              aria-label="이전 페이지"
              onClick={() => moveToPage(currentPageIndex - 1)}
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
              <span>{resolvedPageCount}</span>
            </span>
            <button
              className="admin-table-pagination__next"
              type="button"
              aria-label="다음 페이지"
              onClick={() => moveToPage(currentPageIndex + 1)}
              disabled={currentPage >= resolvedPageCount}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
