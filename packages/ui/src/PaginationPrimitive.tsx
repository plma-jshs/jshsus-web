import { ChevronDown, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type PaginationPrimitiveLoadMore = {
  hasMore: boolean;
  onLoadMore: () => void;
  loading?: boolean;
  label?: ReactNode;
  loadingLabel?: ReactNode;
};

export type PaginationPrimitiveProps = {
  /** One-based page number. Surface adapters may convert from their own index. */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  pageSizeControl?: ReactNode;
  range?: ReactNode;
  loadMore?: PaginationPrimitiveLoadMore;
  classPrefix?: string;
  className?: string;
  rangeClassName?: string;
  ariaLabel?: string;
  previousLabel?: string;
  nextLabel?: string;
  pageInputLabel?: string;
};

/**
 * Shared pagination markup and keyboard behavior.
 *
 * Public and admin surfaces intentionally keep their own state adapters and
 * page-size controls, but the navigation contract, load-more affordance and
 * accessible page input stay identical through this primitive.
 */
export function PaginationPrimitive({
  page,
  pageCount,
  onPageChange,
  pageSizeControl,
  range,
  loadMore,
  classPrefix = 'ui-pagination',
  className,
  rangeClassName,
  ariaLabel = '페이지 이동',
  previousLabel = '이전 페이지',
  nextLabel = '다음 페이지',
  pageInputLabel = '페이지 번호',
}: PaginationPrimitiveProps) {
  const resolvedPageCount = Math.max(1, pageCount);
  const safePage = Math.min(Math.max(page, 1), resolvedPageCount);
  const [draftPage, setDraftPage] = useState(String(safePage));
  const previousPage = useRef(safePage);

  useEffect(() => {
    if (previousPage.current === safePage) return;
    previousPage.current = safePage;
    setDraftPage(String(safePage));
  }, [safePage]);

  const part = (name: string, extra?: string) =>
    [`${classPrefix}__${name}`, `ui-pagination__${name}`, extra ?? ''].filter(Boolean).join(' ');

  const changePage = (nextPage: number) => {
    const resolvedPage = Math.min(Math.max(nextPage, 1), resolvedPageCount);
    if (resolvedPage === safePage) return;
    onPageChange(resolvedPage);
  };

  const commitPage = (value: string) => {
    const requestedPage = Number(value);
    if (!Number.isInteger(requestedPage) || requestedPage < 1) {
      setDraftPage(String(safePage));
      return;
    }
    const resolvedPage = Math.min(requestedPage, resolvedPageCount);
    setDraftPage(String(resolvedPage));
    changePage(resolvedPage);
  };

  const classes = [classPrefix, 'ui-pagination', className ?? ''].filter(Boolean).join(' ');
  const rangeClasses = part('range', rangeClassName);

  return (
    <nav className={classes} aria-label={ariaLabel}>
      <div className={part('summary')}>
        {pageSizeControl}
        {range !== undefined ? <span className={rangeClasses}>{range}</span> : null}
      </div>
      {loadMore?.hasMore ? (
        <button
          className={part('load-more')}
          type="button"
          onClick={loadMore.onLoadMore}
          disabled={loadMore.loading}
        >
          {loadMore.loading ? (
            <LoaderCircle className="is-spinning" size={15} aria-hidden="true" />
          ) : null}
          <span>
            {loadMore.loading
              ? (loadMore.loadingLabel ?? '불러오는 중…')
              : (loadMore.label ?? '더보기')}
          </span>
          {!loadMore.loading ? <ChevronDown size={15} aria-hidden="true" /> : null}
        </button>
      ) : null}
      <div className={part('controls')}>
        <button
          className={part('previous')}
          type="button"
          aria-label={previousLabel}
          onClick={() => changePage(safePage - 1)}
          disabled={safePage <= 1}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <label className={part('input-label')}>
          <span className="sr-only">현재 페이지</span>
          <input
            key={safePage}
            inputMode="numeric"
            type="text"
            value={draftPage}
            aria-label={pageInputLabel}
            onChange={(event) => {
              setDraftPage(event.currentTarget.value.replace(/\D/g, ''));
            }}
            onBlur={(event) => commitPage(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              commitPage(event.currentTarget.value);
              event.currentTarget.blur();
            }}
          />
        </label>
        <span className={part('total-pages')} aria-hidden="true">
          <span>/</span>
          <span>{resolvedPageCount}</span>
        </span>
        <button
          className={part('next')}
          type="button"
          aria-label={nextLabel}
          onClick={() => changePage(safePage + 1)}
          disabled={safePage >= resolvedPageCount}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
