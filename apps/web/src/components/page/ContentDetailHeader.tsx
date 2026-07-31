import type { ReactNode } from 'react';
import { formatKoreanContentDateTime } from '../../shared/lib/date';
import { UserAvatar } from './UserAvatar';

export function ContentDetailHeader({
  title,
  author,
  authorProfileImageUrl,
  createdAt,
  actions,
  children,
}: {
  title: string;
  author: string;
  authorProfileImageUrl?: string;
  createdAt: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="content-detail-header">
      <div className="content-detail-header__top">
        <h1>{title}</h1>
        {actions ? <div className="content-detail-header__actions">{actions}</div> : null}
      </div>
      <div className="content-detail-header__meta">
        <span className="content-detail-header__author">
          <UserAvatar imageUrl={authorProfileImageUrl} className="user-avatar--header" />
          {author}
        </span>
        <time dateTime={createdAt}>{formatKoreanContentDateTime(createdAt)}</time>
        {children}
      </div>
    </header>
  );
}
