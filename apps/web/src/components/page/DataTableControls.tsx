import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { useBottomSheetClose } from '../../shared/hooks/useBottomSheetClose';

export type DataTableSearchField = 'title_content' | 'title' | 'author';
export type DataTablePageSize = 20 | 50 | 100;

function syncTableQuery(page: number, pageSize: number) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('page', String(Math.max(page, 1)));
  url.searchParams.set('size', String(pageSize));
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}
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
  action?: ReactNode;
  groupActionWithPageSize?: boolean;
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

function useCompactViewport() {
  const [isCompact, setIsCompact] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 767px)').matches
      : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const update = () => setIsCompact(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.('change', update);
    return () => mediaQuery.removeEventListener?.('change', update);
  }, []);

  return isCompact;
}

export type ToolbarSelectOption<TValue extends string | number> = {
  value: TValue;
  label: string;
};

export function ToolbarSelect<TValue extends string | number>({
  ariaLabel,
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  ariaLabel: string;
  label?: string;
  value: TValue;
  options: readonly ToolbarSelectOption<TValue>[];
  onChange: (value: TValue) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isCompactViewport = useCompactViewport();
  const listboxId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  if (isCompactViewport) {
    return (
      <label className="data-table-toolbar-select__native-wrap">
        {label ? <span>{label}</span> : null}
        <select
          aria-label={ariaLabel}
          className="data-table-toolbar-select__native"
          disabled={disabled}
          value={String(value)}
          onChange={(event) => {
            const nextOption = options.find(
              (option) => String(option.value) === event.target.value,
            );
            if (nextOption) onChange(nextOption.value);
          }}
        >
          {options.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

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
      {label ? <span className="data-table-toolbar-select__label">{label}</span> : null}
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${ariaLabel}: ${selected?.label ?? value}`}
        className="data-table-toolbar-select__trigger"
        type="button"
        disabled={disabled}
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
  field,
  query,
  extraControls,
  action,
  groupActionWithPageSize = false,
  showSearchField = true,
  searchPlaceholder = '검색어를 입력하세요',
  onSearch,
  searchFieldOptions,
}: DataTableToolbarProps<TField>) {
  const effectiveSearchFieldOptions = (searchFieldOptions ??
    defaultSearchFieldOptions) as readonly DataTableSearchFieldOption<TField>[];
  const [draftField, setDraftField] = useState(field);
  const [draftQuery, setDraftQuery] = useState(query);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const { isClosing, requestClose, resetClosing } = useBottomSheetClose(() =>
    setIsFilterOpen(false),
  );
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

  useEffect(() => {
    if (!isFilterOpen) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [isFilterOpen]);

  return (
    <form
      className={`data-table-toolbar${isFilterOpen ? ' is-filter-open' : ''}${
        isClosing ? ' is-closing' : ''
      }`}
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
            <button type="button" aria-label="필터 닫기" onClick={() => requestClose()}>
              <X size={17} aria-hidden="true" />
            </button>
          </div>
          {groupActionWithPageSize && action ? (
            <div className="data-table-toolbar__primary-actions">
              <div className="data-table-toolbar__action">{action}</div>
            </div>
          ) : null}
          {extraControls ? <div className="data-table-toolbar__extra">{extraControls}</div> : null}
          {showSearchField ? (
            <div className="data-table-toolbar__search-field">
              <ToolbarSelect
                ariaLabel="검색 범위"
                label="검색"
                value={draftField}
                options={effectiveSearchFieldOptions}
                onChange={setDraftField}
              />
            </div>
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
          aria-label={isFilterOpen ? '필터 닫기' : '필터 열기'}
          onClick={() => {
            if (isFilterOpen) requestClose();
            else {
              resetClosing();
              setIsFilterOpen(true);
            }
          }}
        >
          <SlidersHorizontal size={17} aria-hidden="true" />
        </button>
        {!groupActionWithPageSize && action ? (
          <div className="data-table-toolbar__action">{action}</div>
        ) : null}
        <button className="sr-only" type="submit">
          검색
        </button>
      </div>
      {isFilterOpen ? (
        <button
          className="data-table-toolbar__filter-scrim"
          type="button"
          aria-label="필터 닫기"
          onClick={() => requestClose()}
        />
      ) : null}
    </form>
  );
}

export function DataTablePagination({
  page,
  totalPages,
  total,
  pageSize = 20,
  onPageSizeChange,
  onChange,
  syncUrl = true,
}: {
  page: number;
  totalPages: number;
  total?: number;
  pageSize?: number;
  onPageSizeChange?: (pageSize: DataTablePageSize) => void;
  onChange: (page: number) => void;
  syncUrl?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
}) {
  if (totalPages <= 1 && !onPageSizeChange) return null;

  const safePage = Math.min(Math.max(page, 1), Math.max(totalPages, 1));
  const resolvedPageSize = pageSize ?? 20;
  const firstItem = total ? (safePage - 1) * resolvedPageSize + 1 : undefined;
  const lastItem = total ? Math.min(safePage * resolvedPageSize, total) : undefined;
  const changePageSize = (nextPageSize: DataTablePageSize) => {
    onPageSizeChange?.(nextPageSize);
    if (syncUrl) syncTableQuery(1, nextPageSize);
  };
  const changePage = (nextPage: number) => {
    const resolvedPage = Math.min(Math.max(nextPage, 1), Math.max(totalPages, 1));
    if (resolvedPage === safePage) return;
    onChange(resolvedPage);
    if (syncUrl) syncTableQuery(resolvedPage, resolvedPageSize);
  };

  return (
    <nav className="data-table-pagination" aria-label="목록 페이지">
      <div className="data-table-pagination__summary">
        {onPageSizeChange ? (
          <ToolbarSelect
            ariaLabel="페이지당 표시 건수"
            value={pageSize as DataTablePageSize}
            options={([20, 50, 100] as const).map((size) => ({
              value: size,
              label: `${size}개씩 보기`,
            }))}
            onChange={changePageSize}
          />
        ) : null}
        <span className="data-table-pagination__range">
          {firstItem !== undefined && lastItem !== undefined
            ? `총 ${total!.toLocaleString('ko-KR')}건 중 ${firstItem}-${lastItem}`
            : `${safePage} / ${Math.max(totalPages, 1)}페이지`}
        </span>
      </div>
      <div className="data-table-pagination__controls">
        <button
          type="button"
          aria-label="이전 페이지"
          disabled={safePage === 1}
          onClick={() => changePage(safePage - 1)}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <label className="data-table-pagination__page-input">
          <span className="sr-only">현재 페이지</span>
          <input
            inputMode="numeric"
            type="text"
            defaultValue={String(safePage)}
            key={safePage}
            onChange={(event) => {
              event.currentTarget.value = event.currentTarget.value.replace(/\D/g, '');
            }}
            onBlur={(event) => {
              const nextPage = Number(event.currentTarget.value);
              if (Number.isInteger(nextPage) && nextPage > 0) {
                changePage(nextPage);
              }
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              event.currentTarget.blur();
            }}
            aria-label="페이지 번호"
          />
        </label>
        <span aria-hidden="true">/ {Math.max(totalPages, 1)}</span>
        <button
          type="button"
          aria-label="다음 페이지"
          disabled={safePage >= totalPages}
          onClick={() => changePage(safePage + 1)}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
