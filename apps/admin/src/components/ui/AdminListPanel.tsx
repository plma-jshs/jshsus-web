import type { ReactNode } from 'react';

export function AdminListPanel({
  title,
  description,
  toolbar,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={['admin-panel', 'ui-list-panel', className].filter(Boolean).join(' ')}>
      {title || description ? (
        <header className="ui-list-panel__header">
          {title ? <h2>{title}</h2> : null}
          {description ? <p>{description}</p> : null}
        </header>
      ) : null}
      {toolbar}
      {children}
    </section>
  );
}
