import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { AdminApiError } from '../../../shared/api/adminApi';
import '../content.css';

type ContentAdminPanelProps = {
  title: string;
  description?: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function ContentAdminPanel({
  title,
  description,
  count,
  actions,
  children,
  className,
}: ContentAdminPanelProps) {
  return (
    <section
      className={['admin-panel', 'content-admin-panel', className].filter(Boolean).join(' ')}
    >
      <header className="content-panel-header">
        <div>
          <div className="content-panel-heading">
            <h2>{title}</h2>
            {typeof count === 'number' ? <span>{count.toLocaleString('ko-KR')}건</span> : null}
          </div>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="content-panel-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

type ContentQueryStateProps = {
  isPending: boolean;
  error: unknown;
  hasData: boolean;
  resource: string;
  emptyText: string;
  children: ReactNode;
  onRetry?: () => void;
};

function contentErrorMessage(error: unknown, resource: string) {
  if (error instanceof AdminApiError) {
    if (error.status === 401) return '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.';
    if (error.status === 403) return `${resource}을(를) 관리할 권한이 없습니다.`;
    if (error.status && error.status >= 500) {
      return `${resource}을(를) 처리하는 서버에서 오류가 발생했습니다.`;
    }
  }

  return `${resource}을(를) 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.`;
}

export function ContentQueryState({
  isPending,
  error,
  hasData,
  resource,
  emptyText,
  children,
  onRetry,
}: ContentQueryStateProps) {
  if (error) {
    return (
      <div className="content-state content-state-error" role="alert">
        <AlertCircle size={22} aria-hidden="true" />
        <div>
          <strong>{contentErrorMessage(error, resource)}</strong>
          {onRetry ? (
            <button className="quiet-button" type="button" onClick={onRetry}>
              다시 시도
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div aria-busy={isPending} aria-label={hasData ? undefined : emptyText}>
      {children}
    </div>
  );
}

export function MutationMessage({
  isPending,
  error,
  pendingText,
}: {
  isPending: boolean;
  error: unknown;
  pendingText: string;
}) {
  if (isPending) return <p className="form-status">{pendingText}</p>;
  if (error) {
    return (
      <p className="form-status error" role="alert">
        요청을 처리하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요.
      </p>
    );
  }
  return null;
}

export function formatAdminDate(value?: string) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replace(/\.$/, '');
}
