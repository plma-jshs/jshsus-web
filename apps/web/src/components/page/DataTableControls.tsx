import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

export type DataTableSearchField = 'title_content' | 'title' | 'author';
export type DataTablePageSize = 20 | 50 | 100;
export type DataTableSearchFieldOption<TField extends string = DataTableSearchField> = {
  value: TField;
  label: string;
};

type DataTableToolbarProps<TField extends string = DataTableSearchField> = {
  total: number;
  page: number;
  totalPages: number;
  pageSize: DataTablePageSize;
  field: TField;
  query: string;
  extraControls?: ReactNode;
  showSearchField?: boolean;
  onPageSizeChange: (pageSize: DataTablePageSize) => void;
  onSearch: (field: TField, query: string) => void;
  searchFieldOptions?: readonly DataTableSearchFieldOption<TField>[];
};

const defaultSearchFieldOptions: readonly DataTableSearchFieldOption[] = [
  { value: 'title_content', label: '제목+내용' },
  { value: 'title', label: '제목' },
  { value: 'author', label: '작성자' },
];

export function DataTableToolbar<TField extends string = DataTableSearchField>({
  total,
  page,
  totalPages,
  pageSize,
  field,
  query,
  extraControls,
  showSearchField = true,
  onPageSizeChange,
  onSearch,
  searchFieldOptions,
}: DataTableToolbarProps<TField>) {
  const effectiveSearchFieldOptions = (searchFieldOptions ??
    defaultSearchFieldOptions) as readonly DataTableSearchFieldOption<TField>[];
  const [draftField, setDraftField] = useState(field);
  const [draftQuery, setDraftQuery] = useState(query);

  return (
    <form
      className="data-table-toolbar"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(draftField, draftQuery.trim());
      }}
    >
      <div className="data-table-toolbar__summary" aria-live="polite">
        <span>
          전체 <strong>{total.toLocaleString('ko-KR')}</strong>건
        </span>
        <span>
          {Math.min(page, Math.max(totalPages, 1))}/{Math.max(totalPages, 1)}페이지
        </span>
      </div>
      <div className="data-table-toolbar__controls">
        <label>
          <span className="sr-only">페이지당 표시 건수</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value) as DataTablePageSize)}
          >
            {[20, 50, 100].map((size) => (
              <option value={size} key={size}>
                {size}건
              </option>
            ))}
          </select>
        </label>
        {showSearchField ? (
          <label>
            <span className="sr-only">검색 범위</span>
            <select
              value={draftField}
              onChange={(event) => setDraftField(event.target.value as TField)}
            >
              {effectiveSearchFieldOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {extraControls}
        <label className="data-table-toolbar__query">
          <span className="sr-only">검색어</span>
          <input
            type="search"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="검색어를 입력하세요"
          />
        </label>
        <button className="data-table-toolbar__submit" type="submit">
          검색
        </button>
      </div>
    </form>
  );
}

type PaginationItem = number | 'ellipsis-left' | 'ellipsis-right';

function getPaginationItems(page: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (page <= 4) return [1, 2, 3, 4, 5, 'ellipsis-right', totalPages];
  if (page >= totalPages - 3) {
    return [
      1,
      'ellipsis-left',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [1, 'ellipsis-left', page - 1, page, page + 1, 'ellipsis-right', totalPages];
}

export function DataTablePagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const safePage = Math.min(Math.max(page, 1), totalPages);

  return (
    <nav className="data-table-pagination" aria-label="목록 페이지">
      <button
        type="button"
        aria-label="첫 페이지"
        disabled={safePage === 1}
        onClick={() => onChange(1)}
      >
        <ChevronsLeft size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="이전 페이지"
        disabled={safePage === 1}
        onClick={() => onChange(safePage - 1)}
      >
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      {getPaginationItems(safePage, totalPages).map((item) =>
        typeof item === 'number' ? (
          <button
            type="button"
            className={item === safePage ? 'is-current' : undefined}
            aria-current={item === safePage ? 'page' : undefined}
            onClick={() => onChange(item)}
            key={item}
          >
            {item}
          </button>
        ) : (
          <span aria-hidden="true" key={item}>
            ···
          </span>
        ),
      )}
      <button
        type="button"
        aria-label="다음 페이지"
        disabled={safePage === totalPages}
        onClick={() => onChange(safePage + 1)}
      >
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="마지막 페이지"
        disabled={safePage === totalPages}
        onClick={() => onChange(totalPages)}
      >
        <ChevronsRight size={18} aria-hidden="true" />
      </button>
    </nav>
  );
}
