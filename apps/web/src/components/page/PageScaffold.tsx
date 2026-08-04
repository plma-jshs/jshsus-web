import type { LucideIcon } from 'lucide-react';
import { ChevronRight, Inbox, Search, SlidersHorizontal, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import type { BreadcrumbItem } from './pageHierarchy';

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="page-breadcrumbs" aria-label="현재 위치">
      <Link to="/">홈</Link>
      {items.map((item) => (
        <span className="page-breadcrumbs__item" key={`${item.label}-${item.to ?? 'current'}`}>
          <ChevronRight size={13} aria-hidden="true" />
          {item.to ? (
            <Link to={item.to}>{item.label}</Link>
          ) : (
            <span aria-current="page">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

type PageScaffoldProps = {
  breadcrumbs: BreadcrumbItem[];
  title?: string;
  description?: string;
  action?: ReactNode;
  meta?: ReactNode;
  width?: 'default' | 'reading' | 'wide' | 'full';
  variant?: 'list' | 'document' | 'form' | 'workspace';
  children: ReactNode;
};

export function PageScaffold({
  breadcrumbs,
  title,
  action,
  meta,
  width = 'default',
  variant = 'list',
  children,
}: PageScaffoldProps) {
  const hasHeader = Boolean(title || action || meta);

  return (
    <div className={`detail-page detail-page--${width} detail-page--${variant}`}>
      <Breadcrumbs items={breadcrumbs} />
      {hasHeader ? (
        <header className="detail-page-header">
          <div className="detail-page-header__copy">
            {title ? <h1>{title}</h1> : null}
            {meta ? <div className="detail-page-header__meta">{meta}</div> : null}
          </div>
          {action ? <div className="detail-page-header__action">{action}</div> : null}
        </header>
      ) : null}
      {children}
    </div>
  );
}

export function PageToolbar({
  children,
  filters,
  search,
}: {
  children?: ReactNode;
  filters?: ReactNode;
  search?: ReactNode;
}) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterPanelId = useId();
  const hasSplitControls = filters !== undefined || search !== undefined;

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

  if (!hasSplitControls) return <div className="page-toolbar">{children}</div>;

  return (
    <div className={`page-toolbar page-toolbar--split${isFilterOpen ? ' is-filter-open' : ''}`}>
      <div className="page-toolbar__filters-content" id={filterPanelId}>
        <div className="page-toolbar__filters-heading">
          <strong>필터</strong>
          <button type="button" aria-label="필터 닫기" onClick={() => setIsFilterOpen(false)}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        {filters}
      </div>
      <div className="page-toolbar__search-content">{search}</div>
      <button
        className="page-toolbar__filter-trigger"
        type="button"
        aria-controls={filterPanelId}
        aria-label={isFilterOpen ? '필터 닫기' : '필터 열기'}
        aria-expanded={isFilterOpen}
        onClick={() => setIsFilterOpen((current) => !current)}
      >
        <SlidersHorizontal size={17} aria-hidden="true" />
      </button>
      {isFilterOpen ? (
        <button
          className="page-toolbar__filter-scrim"
          type="button"
          aria-label="필터 닫기"
          onClick={() => setIsFilterOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = '검색어를 입력하세요',
  label = '검색',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="page-search-field">
      <Search size={15} aria-hidden="true" />
      <input
        aria-label={label}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {value ? (
        <button
          aria-label="검색어 지우기"
          className="page-search-field__clear"
          type="button"
          onClick={() => onChange('')}
        >
          <X size={15} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export function FilterChips<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string; count?: number }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="filter-chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          className={option.value === value ? 'is-active' : undefined}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          key={option.value}
        >
          {option.label}
          {option.count !== undefined ? <span>{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

const stateConfig: Record<'empty' | 'error', { icon: LucideIcon; defaultTitle: string }> = {
  empty: { icon: Inbox, defaultTitle: '표시할 내용이 없습니다.' },
  error: { icon: TriangleAlert, defaultTitle: '내용을 불러오지 못했습니다.' },
};

export function PageState({
  kind,
  title,
  description,
  action,
  variant = 'section',
}: {
  kind: 'loading' | 'empty' | 'error';
  title?: string;
  description?: string;
  action?: ReactNode;
  variant?: 'inline' | 'table' | 'section' | 'page';
}) {
  if (kind === 'loading') {
    const lineCount = variant === 'table' ? 5 : variant === 'inline' ? 1 : 3;
    return (
      <div
        aria-busy="true"
        className={`page-state page-state--loading page-state--${variant}`}
        role="status"
      >
        <span className="sr-only">{title ?? '불러오고 있습니다.'}</span>
        <div aria-hidden="true" className={`page-state__skeleton page-state__skeleton--${variant}`}>
          {Array.from({ length: lineCount }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      </div>
    );
  }

  const { icon: Icon, defaultTitle } = stateConfig[kind];
  return (
    <div
      className={`page-state page-state--${kind} page-state--${variant}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <Icon size={22} aria-hidden="true" />
      <strong>{title ?? defaultTitle}</strong>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
