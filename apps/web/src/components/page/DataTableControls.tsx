import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

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
  searchPlaceholder?: string;
  onPageSizeChange: (pageSize: DataTablePageSize) => void;
  onSearch: (field: TField, query: string) => void;
  searchFieldOptions?: readonly DataTableSearchFieldOption<TField>[];
};

const defaultSearchFieldOptions: readonly DataTableSearchFieldOption[] = [
  { value: 'title_content', label: '제목+내용' },
  { value: 'title', label: '제목' },
  { value: 'author', label: '작성자' },
];

export type ToolbarSelectOption<TValue extends string | number> = {
  value: TValue;
  label: string;
};

export function ToolbarSelect<TValue extends string | number>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: TValue;
  options: readonly ToolbarSelectOption<TValue>[];
  onChange: (value: TValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div
      className={`data-table-toolbar-select${open ? ' is-open' : ''}`}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${ariaLabel}: ${selected?.label ?? value}`}
        className="data-table-toolbar-select__trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label ?? value}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open ? (
        <div
          aria-label={ariaLabel}
          className="data-table-toolbar-select__menu"
          id={listboxId}
          role="listbox"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                aria-selected={isSelected}
                className={isSelected ? 'is-selected' : undefined}
                key={String(option.value)}
                role="option"
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {isSelected ? <Check size={15} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function DataTableToolbar<TField extends string = DataTableSearchField>({
  total,
  page,
  totalPages,
  pageSize,
  field,
  query,
  extraControls,
  showSearchField = true,
  searchPlaceholder = '검색어를 입력하세요',
  onPageSizeChange,
  onSearch,
  searchFieldOptions,
}: DataTableToolbarProps<TField>) {
  const effectiveSearchFieldOptions = (searchFieldOptions ??
    defaultSearchFieldOptions) as readonly DataTableSearchFieldOption<TField>[];
  const [draftField, setDraftField] = useState(field);
  const [draftQuery, setDraftQuery] = useState(query);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterPanelId = useId();
  const onSearchRef = useRef(onSearch);
  const externalSearchRef = useRef({ field, query });
  const lastSearchRef = useRef({ field, query: query.trim() });

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  useEffect(() => {
    if (externalSearchRef.current.field === field && externalSearchRef.current.query === query) {
      return undefined;
    }
    externalSearchRef.current = { field, query };
    const timer = window.setTimeout(() => {
      setDraftField(field);
      setDraftQuery(query);
      lastSearchRef.current = { field, query: query.trim() };
    }, 0);
    return () => window.clearTimeout(timer);
  }, [field, query]);

  useEffect(() => {
    const normalizedQuery = draftQuery.trim();
    if (
      lastSearchRef.current.field === draftField &&
      lastSearchRef.current.query === normalizedQuery
    ) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      lastSearchRef.current = { field: draftField, query: normalizedQuery };
      onSearchRef.current(draftField, normalizedQuery);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draftField, draftQuery]);

  return (
    <form
      className={`data-table-toolbar${isFilterOpen ? ' is-filter-open' : ''}`}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
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
        <div
          className="data-table-toolbar__filters"
          id={filterPanelId}
          aria-label="목록 필터"
          role={isFilterOpen ? 'dialog' : undefined}
          aria-modal={isFilterOpen ? true : undefined}
        >
          <div className="data-table-toolbar__filters-heading">
            <strong>필터</strong>
            <button type="button" aria-label="필터 닫기" onClick={() => setIsFilterOpen(false)}>
              <X size={17} aria-hidden="true" />
            </button>
          </div>
          <ToolbarSelect
            ariaLabel="페이지당 표시 건수"
            value={pageSize}
            options={([20, 50, 100] as const).map((size) => ({ value: size, label: `${size}건` }))}
            onChange={onPageSizeChange}
          />
          {extraControls}
          {showSearchField ? (
            <ToolbarSelect
              ariaLabel="검색 범위"
              value={draftField}
              options={effectiveSearchFieldOptions}
              onChange={setDraftField}
            />
          ) : null}
        </div>
        <div className="data-table-toolbar__query">
          <Search size={15} aria-hidden="true" />
          <input
            aria-label="검색어"
            type="text"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder={searchPlaceholder}
          />
          {draftQuery ? (
            <button
              aria-label="검색어 지우기"
              className="data-table-toolbar__clear"
              type="button"
              onClick={() => setDraftQuery('')}
            >
              <X size={15} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <button
          className="data-table-toolbar__filter-trigger"
          type="button"
          aria-controls={filterPanelId}
          aria-expanded={isFilterOpen}
          onClick={() => setIsFilterOpen((current) => !current)}
        >
          필터 <ChevronDown size={15} aria-hidden="true" />
        </button>
        <button className="sr-only" type="submit">
          검색
        </button>
      </div>
      {isFilterOpen ? (
        <button
          className="data-table-toolbar__filter-scrim"
          type="button"
          aria-label="필터 닫기"
          onClick={() => setIsFilterOpen(false)}
        />
      ) : null}
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
