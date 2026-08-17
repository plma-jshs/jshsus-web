import { SlidersHorizontal, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { PaginationPrimitive, SearchField, SelectPrimitive } from '@jshsus/ui';
import { useBottomSheetClose } from '../../shared/hooks/useBottomSheetClose';

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
  action?: ReactNode;
  groupActionWithPageSize?: boolean;
  showSearchField?: boolean;
  searchPlaceholder?: string;
  onPageSizeChange: (pageSize: DataTablePageSize) => void;
  onSearch: (field: TField, query: string) => void;
  searchFieldOptions?: readonly DataTableSearchFieldOption<TField>[];
};

export type ToolbarSelectOption<TValue extends string | number> = {
  value: TValue;
  label: string;
  disabled?: boolean;
};

export function ToolbarSelect<TValue extends string | number>({
  ariaLabel,
  label,
  value,
  options,
  onChange,
  disabled = false,
  leadingIcon,
}: {
  ariaLabel: string;
  label?: string;
  value: TValue;
  options: readonly ToolbarSelectOption<TValue>[];
  onChange: (value: TValue) => void;
  disabled?: boolean;
  leadingIcon?: ReactNode;
}) {
  return (
    <SelectPrimitive
      aria-label={ariaLabel}
      classPrefix="data-table-toolbar-select"
      disabled={disabled}
      label={label}
      leadingIcon={leadingIcon}
      nativeOnMobile
      nativeWrapClassName="data-table-toolbar-select__native-wrap"
      value={String(value)}
      onChange={(event) => {
        const nextOption = options.find((option) => String(option.value) === event.target.value);
        if (nextOption) onChange(nextOption.value);
      }}
    >
      {options.map((option) => (
        <option key={String(option.value)} value={String(option.value)} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </SelectPrimitive>
  );
}

export function DataTableToolbar<TField extends string = DataTableSearchField>({
  total,
  page: _page,
  totalPages: _totalPages,
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
  void showSearchField;
  void searchFieldOptions;
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
  const hasFilters = Boolean(extraControls || (groupActionWithPageSize && action));

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
      </div>
      <div className="data-table-toolbar__controls">
        {hasFilters ? (
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
            {extraControls ? (
              <div className="data-table-toolbar__extra">{extraControls}</div>
            ) : null}
          </div>
        ) : null}
        <SearchField
          className="data-table-toolbar__query"
          type="text"
          aria-label="검색어"
          value={draftQuery}
          onChange={(event) => setDraftQuery(event.target.value)}
          placeholder={searchPlaceholder}
          onClear={() => setDraftQuery('')}
          clearClassName="data-table-toolbar__clear"
        />
        {hasFilters ? (
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
        ) : null}
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
  onLoadMore,
  loadingMore = false,
  hasMore = false,
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
  const safePage = Math.min(Math.max(page, 1), Math.max(totalPages, 1));
  const resolvedPageSize = pageSize ?? 20;
  if (totalPages <= 1 && !onPageSizeChange) return null;
  const firstItem = total ? (safePage - 1) * resolvedPageSize + 1 : undefined;
  const lastItem = total ? Math.min(safePage * resolvedPageSize, total) : undefined;

  return (
    <PaginationPrimitive
      classPrefix="data-table-pagination"
      page={safePage}
      pageCount={totalPages}
      pageSizeControl={
        onPageSizeChange ? (
          <ToolbarSelect
            ariaLabel="페이지당 표시 건수"
            value={pageSize as DataTablePageSize}
            options={([20, 50, 100] as const).map((size) => ({
              value: size,
              label: `${size}개씩 보기`,
            }))}
            onChange={(nextPageSize) => onPageSizeChange(nextPageSize)}
          />
        ) : null
      }
      range={
        firstItem !== undefined && lastItem !== undefined
          ? `총 ${total!.toLocaleString('ko-KR')}건 중 ${firstItem}-${lastItem}`
          : `${safePage} / ${Math.max(totalPages, 1)}페이지`
      }
      loadMore={
        onLoadMore
          ? {
              hasMore,
              onLoadMore,
              loading: loadingMore,
            }
          : undefined
      }
      onPageChange={onChange}
      ariaLabel="목록 페이지"
    />
  );
}
