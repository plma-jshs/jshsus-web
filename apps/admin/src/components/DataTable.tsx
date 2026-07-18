import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
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
import {
  ADMIN_DEFAULT_PAGE_SIZE,
  DATA_TABLE_COLUMN_WIDTHS,
  type DataTableWidthPreset,
} from './dataTableConfig';

export type DataTableAlignment = 'left' | 'center' | 'right';

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
    /** Applies a consistent narrow width and centers short values by default. */
    widthPreset?: DataTableWidthPreset;
  }
}

export type DataTablePagination = {
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  totalCount?: number;
  onPageChange: (pageIndex: number) => void;
};

export type DataTableProps<T> = {
  columns: ColumnDef<T>[];
  data: T[];
  emptyText?: string;
  loading?: boolean;
  loadingText?: string;
  pageSize?: number;
  pagination?: DataTablePagination;
  alwaysShowPagination?: boolean;
  caption?: string;
  getRowId?: (row: T, index: number) => string;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  manualSorting?: boolean;
};

type PaginationItem = number | 'ellipsis-left' | 'ellipsis-right';

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

function paginationItems(currentPage: number, pageCount: number): PaginationItem[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  if (currentPage <= 4) return [1, 2, 3, 4, 5, 'ellipsis-right', pageCount];
  if (currentPage >= pageCount - 3) {
    return [
      1,
      'ellipsis-left',
      pageCount - 4,
      pageCount - 3,
      pageCount - 2,
      pageCount - 1,
      pageCount,
    ];
  }
  return [
    1,
    'ellipsis-left',
    currentPage - 1,
    currentPage,
    currentPage + 1,
    'ellipsis-right',
    pageCount,
  ];
}

export function DataTable<T>({
  columns,
  data,
  emptyText = '조회된 기록이 없습니다.',
  loading = false,
  loadingText = '불러오는 중입니다.',
  pageSize = ADMIN_DEFAULT_PAGE_SIZE,
  pagination,
  alwaysShowPagination = false,
  caption,
  getRowId,
  sorting,
  onSortingChange,
  manualSorting = false,
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
    if (pagination) pagination.onPageChange(nextPageIndex);
    else table.setPageIndex(nextPageIndex);
  };

  return (
    <div className="admin-data-table">
      <div className="table-wrap">
        <table>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const alignment = header.column.columnDef.meta?.headerAlign ?? 'center';
                  const meta = header.column.columnDef.meta;
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
                          className="admin-table-sort"
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
              <tr>
                <td className="admin-data-table__loading-cell" colSpan={visibleColumnCount}>
                  {loadingText}
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td className="admin-data-table__empty-cell" colSpan={visibleColumnCount}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta;
                    const presetWidth = widthForPreset(meta?.widthPreset);
                    const alignment = meta?.align ?? (meta?.widthPreset ? 'center' : 'left');
                    return (
                      <td
                        key={cell.id}
                        className={cellClassName(alignment, {
                          truncate: meta?.truncate,
                          widthPreset: meta?.widthPreset,
                        })}
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

      {alwaysShowPagination || resolvedPageCount > 1 ? (
        <nav className="admin-table-pagination" aria-label="페이지 이동">
          <button
            type="button"
            aria-label="첫 페이지"
            onClick={() => moveToPage(0)}
            disabled={currentPage <= 1}
          >
            <ChevronsLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="이전 페이지"
            onClick={() => moveToPage(currentPageIndex - 1)}
            disabled={currentPage <= 1}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          {paginationItems(currentPage, resolvedPageCount).map((item) =>
            typeof item === 'number' ? (
              <button
                key={item}
                type="button"
                aria-label={`${item}페이지`}
                aria-current={item === currentPage ? 'page' : undefined}
                onClick={() => moveToPage(item - 1)}
              >
                {item}
              </button>
            ) : (
              <span className="admin-table-pagination__ellipsis" key={item} aria-hidden="true">
                …
              </span>
            ),
          )}
          <button
            type="button"
            aria-label="다음 페이지"
            onClick={() => moveToPage(currentPageIndex + 1)}
            disabled={currentPage >= resolvedPageCount}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="마지막 페이지"
            onClick={() => moveToPage(resolvedPageCount - 1)}
            disabled={currentPage >= resolvedPageCount}
          >
            <ChevronsRight size={16} aria-hidden="true" />
          </button>
        </nav>
      ) : null}
    </div>
  );
}
