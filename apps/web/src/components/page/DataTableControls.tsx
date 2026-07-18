import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

export type DataTableSearchField = 'title_content' | 'title' | 'author';
export type DataTablePageSize = 20 | 50 | 100;

type DataTableToolbarProps = {
  total: number;
  page: number;
  totalPages: number;
  pageSize: DataTablePageSize;
  field: DataTableSearchField;
  query: string;
  onPageSizeChange: (pageSize: DataTablePageSize) => void;
  onSearch: (field: DataTableSearchField, query: string) => void;
};

export function DataTableToolbar({
  total,
  page,
  totalPages,
  pageSize,
  field,
  query,
  onPageSizeChange,
  onSearch,
}: DataTableToolbarProps) {
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
        <label>
          <span className="sr-only">검색 범위</span>
          <select
            value={draftField}
            onChange={(event) => setDraftField(event.target.value as DataTableSearchField)}
          >
            <option value="title_content">제목+내용</option>
            <option value="title">제목</option>
            <option value="author">작성자</option>
          </select>
        </label>
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

type PaginationItem = number | 'start-ellipsis' | 'end-ellipsis';

function getPaginationItems(page: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const visible = [...pages]
    .filter((item) => item >= 1 && item <= totalPages)
    .sort((a, b) => a - b);
  const items: PaginationItem[] = [];

  visible.forEach((item, index) => {
    const previous = visible[index - 1];
    if (previous && item - previous > 1) {
      items.push(previous === 1 ? 'start-ellipsis' : 'end-ellipsis');
    }
    items.push(item);
  });

  return items;
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
    </nav>
  );
}
