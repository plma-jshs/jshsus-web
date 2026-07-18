import type { HTMLAttributes, ReactNode } from 'react';

export type TableToolbarProps = HTMLAttributes<HTMLDivElement> & {
  summary?: ReactNode;
  children?: ReactNode;
};

export function TableToolbar({ summary, children, className, ...props }: TableToolbarProps) {
  const classes = ['admin-table-toolbar', className ?? ''].filter(Boolean).join(' ');

  return (
    <div {...props} className={classes}>
      <div className="admin-table-toolbar__summary">{summary}</div>
      <div className="admin-table-toolbar__controls">{children}</div>
    </div>
  );
}
