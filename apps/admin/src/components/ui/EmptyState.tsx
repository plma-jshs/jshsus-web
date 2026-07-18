import { Inbox } from 'lucide-react';
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
  icon = <Inbox size={19} aria-hidden="true" />,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  const classes = ['ui-empty-state', compact ? 'ui-empty-state--compact' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <span className="ui-empty-state__icon">{icon}</span>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
