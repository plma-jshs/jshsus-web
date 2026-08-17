import { AlertCircle, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
};

export function EmptyState({
  title,
  description,
  // Kept in the public props for backwards compatibility with feature pages.
  // Empty states intentionally use text only across the admin surface now.
  icon: _icon,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  const classes = ['ui-empty-state', compact ? 'ui-empty-state--compact' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function LoadingState({
  title: _title,
  compact = false,
  className,
}: {
  title?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={[
        'ui-status-state',
        'ui-status-state--loading',
        compact ? 'ui-status-state--compact' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
    >
      <LoaderCircle className="ui-status-state__icon" size={20} aria-hidden="true" />
    </div>
  );
}

export function ErrorState({
  title = '문제가 발생했습니다.',
  action,
  compact = false,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={[
        'ui-status-state',
        'ui-status-state--error',
        compact ? 'ui-status-state--compact' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="alert"
    >
      <AlertCircle className="ui-status-state__icon" size={20} aria-hidden="true" />
      <strong>{title}</strong>
      {action}
    </div>
  );
}
