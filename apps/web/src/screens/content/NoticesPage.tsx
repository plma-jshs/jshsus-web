import { useQuery } from '@tanstack/react-query';
import { Megaphone, Pin } from 'lucide-react';
import { PageHeader, Panel, StateMessage, StatusBadge } from '../../components/PortalUi';
import { getNotices } from '../../lib/api';
import { createKoreanDateFormatter } from '../../lib/date';

const noticeDateFormatter = createKoreanDateFormatter({
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export function NoticesPage() {
  const noticesQuery = useQuery({ queryKey: ['notices'], queryFn: getNotices });
  const notices = noticesQuery.data ?? [];
  const pinnedCount = notices.filter((notice) => notice.pinned).length;

  return (
    <div className="portal-page">
      <PageHeader
        eyebrow="소식·일정"
        title="공지사항"
        description="학생생활부와 학교 부서에서 전하는 주요 안내를 확인하세요."
        stat={{ icon: Pin, label: '중요 공지', value: `${pinnedCount}건` }}
      />

      <Panel
        title="전체 공지"
        description="중요 공지는 목록 상단에 표시됩니다."
        icon={Megaphone}
        action={<span className="portal-panel__count">총 {notices.length}건</span>}
      >
        {noticesQuery.isLoading ? (
          <StateMessage kind="loading" title="공지를 불러오고 있습니다." />
        ) : null}
        {noticesQuery.isError ? (
          <StateMessage
            kind="error"
            title="공지를 불러오지 못했습니다."
            description="잠시 후 다시 시도해 주세요."
          />
        ) : null}
        {noticesQuery.isSuccess && notices.length === 0 ? (
          <StateMessage
            kind="empty"
            title="등록된 공지가 없습니다."
            description="새 공지가 등록되면 이곳에 표시됩니다."
          />
        ) : null}
        {notices.length > 0 ? (
          <div className="item-list">
            {notices.map((notice) => (
              <article className="item-card notice-item" key={notice.id}>
                <div className="item-card__main">
                  <div className="item-card__meta">
                    <StatusBadge tone={notice.pinned ? 'danger' : 'info'}>
                      {notice.pinned ? '중요' : '일반'}
                    </StatusBadge>
                    <span>{notice.department}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={notice.publishedAt}>
                      {noticeDateFormatter.format(new Date(notice.publishedAt))}
                    </time>
                  </div>
                  <h3 className="item-card__title">{notice.title}</h3>
                  <p className="item-card__content">{notice.content}</p>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
