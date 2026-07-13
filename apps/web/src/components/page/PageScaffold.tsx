import type { LucideIcon } from 'lucide-react';
import { ChevronRight, Inbox, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';

type BreadcrumbItem = { label: string; to?: string };

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
  title: string;
  description?: string;
  action?: ReactNode;
  meta?: ReactNode;
  width?: 'default' | 'reading' | 'wide';
  variant?: 'list' | 'document' | 'form' | 'workspace';
  children: ReactNode;
};

export function PageScaffold({
  breadcrumbs,
  title,
  description,
  action,
  meta,
  width = 'default',
  variant = 'list',
  children,
}: PageScaffoldProps) {
  return (
    <div className={`detail-page detail-page--${width} detail-page--${variant}`}>
      <Breadcrumbs items={breadcrumbs} />
      <header className="detail-page-header">
        <div className="detail-page-header__copy">
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
          {meta ? <div className="detail-page-header__meta">{meta}</div> : null}
        </div>
        {action ? <div className="detail-page-header__action">{action}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function PageToolbar({ children }: { children: ReactNode }) {
  return <div className="page-toolbar">{children}</div>;
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
    <label className="page-search-field">
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
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

const stateConfig: Record<
  'loading' | 'empty' | 'error',
  { icon: LucideIcon; defaultTitle: string }
> = {
  loading: { icon: LoaderCircle, defaultTitle: '불러오고 있습니다.' },
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
  const { icon: Icon, defaultTitle } = stateConfig[kind];
  return (
    <div
      className={`page-state page-state--${kind} page-state--${variant}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <Icon
        className={kind === 'loading' ? 'is-spinning' : undefined}
        size={22}
        aria-hidden="true"
      />
      <strong>{title ?? defaultTitle}</strong>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
