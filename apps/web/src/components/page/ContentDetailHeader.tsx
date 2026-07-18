import type { ReactNode } from 'react';
import { formatKoreanContentDateTime } from '../../shared/lib/date';

export function ContentDetailHeader({
  title,
  author,
  createdAt,
  children,
}: {
  title: string;
  author: string;
  createdAt: string;
  children?: ReactNode;
}) {
  return (
    <header className="content-detail-header">
      <h1>{title}</h1>
      <div className="content-detail-header__meta">
        <span>{author}</span>
        <time dateTime={createdAt}>{formatKoreanContentDateTime(createdAt)}</time>
        {children}
      </div>
    </header>
  );
}
