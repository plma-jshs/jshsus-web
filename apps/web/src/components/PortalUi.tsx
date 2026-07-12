import type { ReactNode } from 'react';
import { useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CircleAlert, Inbox, LoaderCircle } from 'lucide-react';
import type { JshsusStatusTone } from '@jshsus/ui';

type HeaderStat = {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
};

type PageHeaderProps = {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  stat?: HeaderStat;
};

export function PageHeader({ eyebrow, title, description, stat }: PageHeaderProps) {
  const StatIcon = stat?.icon;

  return (
    <header className="page-header">
      <div className="page-header__content">
        <span className="page-header__eyebrow">{eyebrow}</span>
        <h1 className="page-header__title">{title}</h1>
        <p className="page-header__description">{description}</p>
      </div>
      {stat && StatIcon ? (
        <div className="page-header__stat">
          <span className="page-header__stat-icon" aria-hidden="true">
            <StatIcon size={20} />
          </span>
          <span className="page-header__stat-copy">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </span>
        </div>
      ) : null}
    </header>
  );
}

type PanelProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Panel({ title, description, icon: Icon, action, children, className }: PanelProps) {
  const headingId = useId();

  return (
    <section
      className={`portal-panel${className ? ` ${className}` : ''}`}
      aria-labelledby={headingId}
    >
      <header className="portal-panel__header">
        <div className="portal-panel__heading">
          {Icon ? (
            <span className="portal-panel__icon" aria-hidden="true">
              <Icon size={19} />
            </span>
          ) : null}
          <div>
            <h2 className="portal-panel__title" id={headingId}>
              {title}
            </h2>
            {description ? <p className="portal-panel__description">{description}</p> : null}
          </div>
        </div>
        {action ? <div className="portal-panel__action">{action}</div> : null}
      </header>
      <div className="portal-panel__body">{children}</div>
    </section>
  );
}

type StateMessageProps = {
  kind: 'loading' | 'error' | 'empty';
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
};

const stateIcons = {
  loading: LoaderCircle,
  error: CircleAlert,
  empty: Inbox,
};

export function StateMessage({
  kind,
  title,
  description,
  action,
  compact = false,
}: StateMessageProps) {
  const Icon = stateIcons[kind];

  return (
    <div
      className={`state-message state-message--${kind}${compact ? ' state-message--compact' : ''}`}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
    >
      <Icon
        className={
          kind === 'loading'
            ? 'state-message__icon state-message__icon--spin'
            : 'state-message__icon'
        }
        size={compact ? 18 : 22}
        aria-hidden="true"
      />
      <div className="state-message__copy">
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="state-message__action">{action}</div> : null}
    </div>
  );
}

type StatusBadgeProps = {
  children: ReactNode;
  tone?: JshsusStatusTone;
};

export function StatusBadge({ children, tone = 'neutral' }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}
